import path from 'node:path';

// Heuristic, dependency-free import extraction for Manteka Smart-Slice. We only
// care about relative specifiers (./ and ../); bare packages, aliases and URLs
// are intentionally ignored in Phase 1 (see docs/superpowers/specs).
const IMPORT_SPECIFIER_PATTERNS: RegExp[] = [
  /\b(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Extracts the relative import specifiers referenced by a source file.
 * Returns a de-duplicated array preserving first-seen order.
 */
export const extractImportSpecifiers = (content: string): string[] => {
  const matches: Array<{ index: number; specifier: string }> = [];
  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier?.startsWith('.')) {
        matches.push({ index: match.index ?? 0, specifier });
      }
    }
  }

  matches.sort((a, b) => a.index - b.index);

  const specifiers = new Set<string>();
  for (const { specifier } of matches) {
    specifiers.add(specifier);
  }
  return [...specifiers];
};

export const RESOLVABLE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.json',
  '.vue',
] as const;

const INDEX_FILES = RESOLVABLE_EXTENSIONS.filter((ext) => ext !== '.json').map((ext) => `index${ext}`);

// TypeScript ESM (NodeNext) emits specifiers carrying the *emitted* extension:
// `./b.js` actually loads `b.ts`, `./c.jsx` loads `c.tsx`. Node's own resolver
// never does this rewrite, so it has to be explicit here.
const REWRITABLE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const REWRITE_TARGETS = ['.ts', '.tsx', '.mts', '.cts'];

export interface ResolveSpecifierArgs {
  specifier: string;
  importerPath: string;
  rootDir: string;
  fileExists: (absolutePath: string) => Promise<boolean>;
}

/**
 * Resolves a relative import specifier to a root-relative POSIX path, trying the
 * exact path, the known extensions, then directory index files. Returns null when
 * nothing matches or the target escapes `rootDir`.
 */
export const resolveSpecifier = async ({
  specifier,
  importerPath,
  rootDir,
  fileExists,
}: ResolveSpecifierArgs): Promise<string | null> => {
  const baseAbsolute = path.resolve(path.dirname(importerPath), specifier);
  if (!isInsideRoot(baseAbsolute, rootDir)) {
    return null;
  }

  const candidates: string[] = [baseAbsolute];

  const currentExtension = path.extname(baseAbsolute);
  if (REWRITABLE_EXTENSIONS.has(currentExtension)) {
    const withoutExtension = baseAbsolute.slice(0, baseAbsolute.length - currentExtension.length);
    for (const extension of REWRITE_TARGETS) {
      candidates.push(`${withoutExtension}${extension}`);
    }
  }

  for (const extension of RESOLVABLE_EXTENSIONS) {
    candidates.push(`${baseAbsolute}${extension}`);
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return toPosixPath(path.relative(path.resolve(rootDir), candidate));
    }
  }

  for (const indexFile of INDEX_FILES) {
    const candidate = path.join(baseAbsolute, indexFile);
    if (await fileExists(candidate)) {
      return toPosixPath(path.relative(path.resolve(rootDir), candidate));
    }
  }

  return null;
};

export const toPosixPath = (value: string): string => value.replace(/\\/g, '/');

/**
 * True when `candidateAbs` resolves to `rootAbs` or a descendant of it. Used to
 * reject specifiers that escape the target directory.
 */
export const isInsideRoot = (candidateAbs: string, rootAbs: string): boolean => {
  const root = path.resolve(rootAbs);
  const candidate = path.resolve(candidateAbs);
  if (candidate === root) {
    return true;
  }
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate.startsWith(prefix);
};
