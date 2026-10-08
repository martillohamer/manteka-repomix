import fs from 'node:fs/promises';
import type { Node } from 'web-tree-sitter';
import { LanguageParser } from '../core/treeSitter/languageParser.js';
import { logger } from '../shared/logger.js';

/** Manifest filename at the repository root; absence means the guardian stays idle. */
export const LAWS_FILE_NAME = '.manteka-laws.yaml';

/**
 * Semantic inertia law, loaded from `.manteka-laws.yaml`.
 *
 * Node names are tree-sitter types; PascalCase spellings (e.g. "CallExpression")
 * are accepted and normalised so the manifest reads naturally either way.
 */
export interface Law {
  readonly id: string;
  readonly description: string;
  readonly disallowedNode: string;
  /** Substring the node's source text must contain to count as a violation. */
  readonly expression?: string;
  /** Parent node type the match must sit directly under. */
  readonly parentType?: string;
  /** First token of the node (e.g. "let" vs "const" on a lexical declaration). */
  readonly declarationType?: string;
}

const LAW_SCALAR_KEYS: ReadonlySet<string> = new Set([
  'description',
  'disallowedNode',
  'expression',
  'parentType',
  'declarationType',
]);

/** "CallExpression" -> "call_expression"; snake_case names pass through. */
const normalizeNodeType = (name: string): string => {
  if (!/[A-Z]/.test(name)) {
    return name;
  }
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
};

const unquote = (raw: string): string => {
  const value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

/**
 * Pure manifest parser, exported so `manteka status` can count laws without
 * loading the tree-sitter grammar the guardian prepares for validation.
 */
export const parseLawsManifest = (content: string): Law[] => {
  const laws: Law[] = [];
  let current: Record<string, string> | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      if (current?.id) {
        laws.push(current as unknown as Law);
      }
      current = {};
      const rest = trimmed.slice(1).trim();
      const sep = rest.indexOf(':');
      if (sep !== -1 && rest.slice(0, sep).trim() === 'id') {
        current.id = unquote(rest.slice(sep + 1));
      }
      continue;
    }
    if (current === null) {
      continue;
    }
    const sep = trimmed.indexOf(':');
    if (sep === -1) {
      continue;
    }
    const key = trimmed.slice(0, sep).trim();
    if (LAW_SCALAR_KEYS.has(key)) {
      current[key] = unquote(trimmed.slice(sep + 1));
    }
  }
  if (current?.id) {
    laws.push(current as unknown as Law);
  }
  return laws;
};

const matchesLaw = (node: Node, law: Law): boolean => {
  if (node.type !== normalizeNodeType(law.disallowedNode)) {
    return false;
  }
  if (law.expression !== undefined && !node.text.includes(law.expression)) {
    return false;
  }
  if (law.parentType !== undefined && node.parent?.type !== normalizeNodeType(law.parentType)) {
    return false;
  }
  if (law.declarationType !== undefined && node.child(0)?.text !== law.declarationType) {
    return false;
  }
  return true;
};

const findViolation = (node: Node, law: Law): boolean => {
  if (matchesLaw(node, law)) {
    return true;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child !== null && findViolation(child, law)) {
      return true;
    }
  }
  return false;
};

/**
 * Rejects mutants that are thermally attractive but semantically illegal.
 *
 * Backed by the repo's tree-sitter stack (`LanguageParser`) rather than the
 * TypeScript compiler API: the installed `typescript` package is the native
 * Go port, which ships no `createSourceFile`/`SyntaxKind` surface at all.
 */
export class SemanticGuardian {
  private laws: Law[] = [];
  private readonly languageParser = new LanguageParser();

  constructor(private readonly lawsPath: string) {}

  /**
   * Loads the law manifest and prepares the tree-sitter grammar lazily: when
   * no manifest exists the guardian stays idle and never loads a WASM module.
   */
  async loadLaws(): Promise<void> {
    let content: string;
    try {
      content = await fs.readFile(this.lawsPath, 'utf8');
    } catch {
      logger.trace(`No law manifest at ${this.lawsPath}; semantic guardian idle.`);
      return;
    }

    this.laws = parseLawsManifest(content);
    if (this.laws.length > 0) {
      await this.languageParser.init();
    }
  }

  /**
   * Parses `content` and reports the first law it breaks. Files whose language
   * has no grammar cannot be judged, so they pass rather than fail silently.
   */
  async validateMutation(content: string, filePath: string): Promise<{ valid: boolean; violation?: string }> {
    if (this.laws.length === 0) {
      return { valid: true };
    }

    const lang = this.languageParser.guessTheLang(filePath);
    if (lang === undefined) {
      logger.trace(`No grammar for ${filePath}; semantic guardian cannot judge it.`);
      return { valid: true };
    }

    const parser = await this.languageParser.getParserForLang(lang);
    const tree = parser.parse(content);
    if (tree === null) {
      logger.trace(`Tree-sitter could not parse ${filePath}; semantic guardian cannot judge it.`);
      return { valid: true };
    }
    try {
      for (const law of this.laws) {
        if (findViolation(tree.rootNode, law)) {
          return { valid: false, violation: `Law ${law.id} violated: ${law.description}` };
        }
      }
      return { valid: true };
    } finally {
      tree.delete();
    }
  }

  async dispose(): Promise<void> {
    await this.languageParser.dispose();
  }
}
