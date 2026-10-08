import type { MutationApplication, MutationOperatorName, OperatorDefinition } from './types.js';
import { MUTATION_OPERATOR_NAMES } from './types.js';

/**
 * Characters that open a string, template or comment body. A line containing
 * any of them is never touched. The exclusion is deliberately conservative:
 * some mutable lines are skipped, but no operator needs a parser to stay safe.
 * This single rule is what makes the subsystem defensible, and the immunity test
 * in this task asserts it directly.
 */
const UNSAFE_CHARACTERS = ["'", '"', '`'];

const COMMENT_PREFIXES = ['//', '/*', '*', '*/'];

export const isEligibleLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (UNSAFE_CHARACTERS.some((character) => line.includes(character))) {
    return false;
  }
  return !COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
};

const findEligibleLine = (lines: string[], extra?: (line: string) => boolean): number =>
  lines.findIndex((line) => isEligibleLine(line) && (extra ? extra(line) : true));

/** Insert a complete statement above `index`, reusing that line's indentation. */
const insertAbove = (content: string, index: number, statement: string): string => {
  const lines = content.split('\n');
  const indent = lines[index].match(/^\s*/)?.[0] ?? '';
  lines.splice(index, 0, `${indent}${statement}`);
  return lines.join('\n');
};

const notApplied = (content: string): MutationApplication => ({ content, line: null, changed: false });

/**
 * A bare integer literal: not glued to an identifier character, a member access
 * or a decimal point, so `0xFF`, `v2` and `1.5` are all left alone.
 */
const BARE_INTEGER = /(?<![\w$.])(\d+)(?![\w.])/;

const hasBareInteger = (line: string): boolean => BARE_INTEGER.test(line);

const firstOperator = (statement: string, extra?: (line: string) => boolean) => ({
  apply: (content: string): MutationApplication => {
    const index = findEligibleLine(content.split('\n'), extra);
    if (index === -1) {
      return notApplied(content);
    }
    return { content: insertAbove(content, index, statement), line: index + 1, changed: true };
  },
});

const DEAD_GUARD_PATTERN = /^\s*if\s*\(\s*false\b/;

export function stripDeadGuard(content: string): MutationApplication {
  const lines = content.split('\n');
  let startIndex = -1;
  let firstLineMatch = -1;

  for (let i = 0; i < lines.length; i++) {
    if (DEAD_GUARD_PATTERN.test(lines[i].trim())) {
      startIndex = i;
      firstLineMatch = i + 1;
      break;
    }
  }

  if (startIndex === -1) {
    return notApplied(content);
  }

  let braceDepth = 0;
  let opened = false;
  let endIndex = -1;

  for (let i = startIndex; i < lines.length; i++) {
    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      if (char === '{') {
        if (!opened) opened = true;
        braceDepth++;
      } else if (char === '}') {
        braceDepth--;
        if (opened && braceDepth === 0) {
          endIndex = i;
          break;
        }
      }
    }
    if (endIndex !== -1) break;
  }

  if (endIndex === -1) {
    return notApplied(content);
  }

  const blockContent = lines.slice(startIndex, endIndex + 1).join('\n');
  if (UNSAFE_CHARACTERS.some((character) => blockContent.includes(character))) {
    return notApplied(content);
  }

  const mutated = [...lines];
  mutated.splice(startIndex, endIndex - startIndex + 1);
  return { content: mutated.join('\n'), line: firstLineMatch, changed: true };
}

export function stripCommentsAndCollapse(content: string): MutationApplication {
  const lines = content.split('\n');
  const remove = new Array<boolean>(lines.length).fill(false);
  let inBlock = false;
  let firstRemovedLine: number | null = null;

  const isPureComment = (line: string, inside: boolean): boolean => {
    const trimmed = line.trim();
    if (inside) {
      const closeIndex = trimmed.indexOf('*/');
      if (closeIndex === -1) return true;
      return trimmed.slice(closeIndex + 2).trim().length === 0;
    }
    if (trimmed.startsWith('//')) return true;
    if (trimmed.startsWith('/*')) {
      const closeIndex = trimmed.indexOf('*/');
      if (closeIndex === -1) return true;
      return trimmed.slice(closeIndex + 2).trim().length === 0;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    if (isPureComment(lines[i], inBlock) && !UNSAFE_CHARACTERS.some((character) => lines[i].includes(character))) {
      remove[i] = true;
      if (firstRemovedLine === null) {
        firstRemovedLine = i + 1;
      }
    }

    const trimmed = lines[i].trim();
    if (inBlock) {
      if (trimmed.includes('*/')) {
        inBlock = false;
      }
    } else if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlock = true;
    }
  }

  const kept = lines.filter((_, index) => !remove[index]);

  const collapsed: string[] = [];
  let blanks = 0;
  for (const line of kept) {
    if (line.trim().length === 0) {
      blanks++;
      if (blanks === 1) collapsed.push(line);
    } else {
      blanks = 0;
      collapsed.push(line);
    }
  }

  const result = collapsed.join('\n');
  return { content: result, line: result !== content ? firstRemovedLine : null, changed: result !== content };
}

export const MUTATION_OPERATORS: Record<MutationOperatorName, OperatorDefinition> = {
  'comment-noise': {
    name: 'comment-noise',
    ...firstOperator('/* mutant:comment-noise */'),
  },
  'dead-guard': {
    name: 'dead-guard',
    ...firstOperator('if (false as boolean) { /* mutant:dead-guard */ }'),
  },
  'constant-perturbation': {
    name: 'constant-perturbation',
    apply: (content: string): MutationApplication => {
      const lines = content.split('\n');
      const index = findEligibleLine(lines, hasBareInteger);
      if (index === -1) {
        return notApplied(content);
      }
      const mutated = [...lines];
      mutated[index] = lines[index].replace(BARE_INTEGER, '($1 + 1)');
      return { content: mutated.join('\n'), line: index + 1, changed: true };
    },
  },
  'dead-guard-stripper': {
    name: 'dead-guard-stripper',
    apply: stripDeadGuard,
  },
  'comment-reducer': {
    name: 'comment-reducer',
    apply: stripCommentsAndCollapse,
  },
};

export const applyMutation = (name: MutationOperatorName, content: string): MutationApplication =>
  MUTATION_OPERATORS[name].apply(content);

export const isKnownOperator = (value: string): value is MutationOperatorName =>
  (MUTATION_OPERATOR_NAMES as readonly string[]).includes(value);
