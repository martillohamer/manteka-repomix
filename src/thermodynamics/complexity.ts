import type { ComplexityProfile } from './types.js';

/**
 * Source extensions whose line comments begin with a hash rather than a
 * double slash. Missing one of these makes every `#` in a Python or shell file
 * swallow the rest of the line, which silently undercounts branching.
 */
const HASH_COMMENT_EXTENSIONS = new Set([
  '.py',
  '.sh',
  '.bash',
  '.zsh',
  '.rb',
  '.yml',
  '.yaml',
  '.toml',
  '.r',
  '.pl',
  '.mk',
  '.dockerfile',
]);

export const lineCommentsForExtension = (extension: string): string[] =>
  HASH_COMMENT_EXTENSIONS.has(extension.toLowerCase()) ? ['#'] : ['//'];

/**
 * Single-pass scanner that blanks out comments and string/template literals
 * while preserving byte offsets, so line and column positions in the result
 * still match the original source.
 *
 * A regex-based stripper cannot do this correctly: `//` appears inside URLs and
 * string literals, and `/*` sequences appear inside regular expressions and
 * template strings. Any regex chain that tries to remove comments will
 * eventually eat a closing brace of real code. Walking the source character by
 * character with explicit states is the only approach that survives real code.
 */
export const stripCommentsAndLiterals = (source: string, lineComments: string[] = ['//']): string => {
  const lineCommentTokens = new Set([...lineComments, '//']);
  const length = source.length;
  let out = '';
  let index = 0;

  const startsLineComment = (at: number): boolean => {
    for (const token of lineCommentTokens) {
      if (source.startsWith(token, at)) return true;
    }
    return false;
  };

  while (index < length) {
    const char = source[index];
    const next = source[index + 1];

    if (startsLineComment(index)) {
      // Consume up to but excluding the newline so line numbering is preserved.
      while (index < length && source[index] !== '\n') {
        index++;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < length && !(source[index] === '*' && source[index + 1] === '/')) {
        index++;
      }
      index = Math.min(length, index + 2);
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      index++;
      while (index < length) {
        const current = source[index];
        if (current === '\\') {
          index += 2;
          continue;
        }
        if (current === quote) {
          index++;
          break;
        }
        // An unterminated single-line string must not swallow the rest of the
        // file, which is the usual symptom of a lone apostrophe in a comment
        // we already failed to recognise.
        if (current === '\n' && quote !== '`') {
          break;
        }
        index++;
      }
      continue;
    }

    out += char;
    index++;
  }

  return out;
};

/**
 * Branching constructs, ordered so the two-character operators win over the
 * bare `?` ternary case. Word boundaries keep `notify`, `iffy`, `format` and
 * `whiled` out of the count.
 *
 * `else` and `switch` are deliberately excluded: `else if` would double count
 * against its own `if`, and `switch` is already represented by its `case` arms.
 */
const BRANCH_TOKEN_PATTERN = /\b(?:if|for|while|case|catch)\b|&&|\|\||\?\?|\?\.|\?(?![?.])/g;

export const countBranchTokens = (code: string): number => {
  const matches = code.match(BRANCH_TOKEN_PATTERN);
  return matches ? matches.length : 0;
};

export const countLogicalLines = (code: string): number =>
  code.split(/\r?\n/).filter((line) => line.trim().length > 0).length;

export const computeComplexityDensity = (branchTokens: number, logicalLines: number): number => {
  const divisor = Math.max(1, logicalLines);
  const density = (branchTokens / divisor) * 100;
  return Math.round(density * 100) / 100;
};

/**
 * Reduce a source file to its structural complexity signals.
 */
export const analyzeComplexity = (source: string, extension = ''): ComplexityProfile => {
  const stripped = stripCommentsAndLiterals(source, lineCommentsForExtension(extension));
  const logicalLines = countLogicalLines(stripped);
  const branchTokens = countBranchTokens(stripped);
  return {
    logicalLines,
    branchTokens,
    density: computeComplexityDensity(branchTokens, logicalLines),
  };
};
