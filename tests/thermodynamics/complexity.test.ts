import { describe, expect, test } from 'vitest';
import {
  analyzeComplexity,
  computeComplexityDensity,
  countBranchTokens,
  countLogicalLines,
  lineCommentsForExtension,
  stripCommentsAndLiterals,
} from '../../src/thermodynamics/complexity.js';

describe('stripCommentsAndLiterals', () => {
  test('removes single-line comments', () => {
    expect(stripCommentsAndLiterals('const a = 1; // trailing note').trim()).toBe('const a = 1;');
  });

  test('removes whole-line comments', () => {
    expect(stripCommentsAndLiterals('// nothing here\nconst a = 1;').trim()).toBe('const a = 1;');
  });

  test('removes block comments including their content', () => {
    expect(stripCommentsAndLiterals('const a = /* if for while */ 1;').trim()).toBe('const a =  1;');
  });

  test('removes single-quoted string contents', () => {
    expect(stripCommentsAndLiterals("const a = 'if for while'; // x").trim()).toBe('const a = ;');
  });

  test('removes double-quoted string contents', () => {
    expect(stripCommentsAndLiterals('const a = "if for while";').trim()).toBe('const a = ;');
  });

  test('removes template literal contents', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal code containing template syntax
    expect(stripCommentsAndLiterals('const a = `if ${x} for`;').trim()).toBe('const a = ;');
  });

  test('respects an escaped quote instead of ending the string early', () => {
    const stripped = stripCommentsAndLiterals("const a = 'it\\'s if'; const b = 1;");
    expect(countBranchTokens(stripped)).toBe(0);
    expect(stripped).toContain('const b = 1;');
  });

  test('handles a backslash-escaped backslash before a closing quote', () => {
    const stripped = stripCommentsAndLiterals("const a = 'ends with backslash \\\\'; const b = 1;");
    expect(stripped).toContain('const b = 1;');
  });

  test('does not strip hash characters in TypeScript private fields', () => {
    expect(stripCommentsAndLiterals('this.#count += 1;')).toContain('#count');
  });

  test('strips hash comments when the caller declares them', () => {
    expect(stripCommentsAndLiterals('x = 1 # if for', ['#']).trim()).toBe('x = 1');
  });

  test('tolerates an unterminated block comment without throwing', () => {
    expect(() => stripCommentsAndLiterals('const a = 1;\n/* never closed')).not.toThrow();
  });

  test('returns an empty string for empty input', () => {
    expect(stripCommentsAndLiterals('')).toBe('');
  });
});

describe('lineCommentsForExtension', () => {
  test('uses hash comments for shell and python sources', () => {
    expect(lineCommentsForExtension('.py')).toEqual(['#']);
    expect(lineCommentsForExtension('.sh')).toEqual(['#']);
  });

  test('uses double-slash comments for c-family sources', () => {
    expect(lineCommentsForExtension('.ts')).toEqual(['//']);
    expect(lineCommentsForExtension('.rs')).toEqual(['//']);
  });

  test('falls back to double-slash comments for unknown extensions', () => {
    expect(lineCommentsForExtension('.unknown')).toEqual(['//']);
  });
});

describe('countBranchTokens', () => {
  test('counts each control-flow keyword once', () => {
    expect(countBranchTokens('if (a) { for (;;) {} while (b) {} }')).toBe(3);
  });

  test('counts case and catch as branching points', () => {
    expect(countBranchTokens('switch (v) { case 1: break; }')).toBe(1);
    expect(countBranchTokens('try {} catch (e) {}')).toBe(1);
  });

  test('counts short-circuit operators', () => {
    expect(countBranchTokens('const v = a && b || c;')).toBe(2);
  });

  test('counts nullish coalescing once', () => {
    expect(countBranchTokens('const v = a ?? b;')).toBe(1);
  });

  test('counts optional chaining once and not as a ternary', () => {
    expect(countBranchTokens('const v = a?.b?.c;')).toBe(2);
  });

  test('counts a ternary question mark once', () => {
    expect(countBranchTokens('const v = a ? b : c;')).toBe(1);
  });

  test('does not count else on its own', () => {
    expect(countBranchTokens('if (a) {} else {}')).toBe(1);
  });

  test('does not count else-if twice', () => {
    expect(countBranchTokens('if (a) {} else if (b) {}')).toBe(2);
  });

  test('does not match keywords embedded in longer identifiers', () => {
    expect(countBranchTokens('notify(iffy); format(x); forEachItem(y); whiled();')).toBe(0);
  });

  test('returns zero for code with no branching', () => {
    expect(countBranchTokens('const a = 1 + 2;')).toBe(0);
  });
});

describe('countLogicalLines', () => {
  test('counts only lines with surviving code', () => {
    expect(countLogicalLines('const a = 1;\n\nconst b = 2;\n   \nconst c = 3;')).toBe(3);
  });

  test('does not count lines that were comments', () => {
    // countLogicalLines receives already-stripped code; the stripper is what
    // removes comment lines, leaving blanks that are then discarded here.
    const stripped = stripCommentsAndLiterals('// only a comment here\nconst a = 1;');
    expect(countLogicalLines(stripped)).toBe(1);
  });

  test('returns zero for an empty file', () => {
    expect(countLogicalLines('')).toBe(0);
  });
});

describe('computeComplexityDensity', () => {
  test('expresses branch tokens per hundred logical lines', () => {
    expect(computeComplexityDensity(10, 50)).toBe(20);
  });

  test('treats an empty file as one line so it cannot divide by zero', () => {
    expect(computeComplexityDensity(5, 0)).toBe(500);
  });

  test('returns zero when there is no branching at all', () => {
    expect(computeComplexityDensity(0, 100)).toBe(0);
  });

  test('rounds to two decimals for report stability', () => {
    expect(computeComplexityDensity(1, 3)).toBe(33.33);
  });
});

describe('analyzeComplexity', () => {
  test('reports logical lines, branch tokens and density for a realistic file', () => {
    const source = [
      'export const run = (items: string[]) => {',
      '  for (const item of items) {',
      '    if (item && item.length > 0) {',
      '      process(item);',
      '    }',
      '  }',
      '};',
    ].join('\n');

    const profile = analyzeComplexity(source, '.ts');
    expect(profile.logicalLines).toBe(7);
    expect(profile.branchTokens).toBe(3);
    expect(profile.density).toBe(42.86);
  });

  test('ignores branching that only appears in comments', () => {
    const source = ['// if for while case catch && || ??', 'const a = 1;'].join('\n');
    expect(analyzeComplexity(source, '.ts').branchTokens).toBe(0);
  });

  test('ignores branching that only appears in string literals', () => {
    const source = ['const sql = "SELECT * FROM t WHERE a AND b";', 'const q = `for`;'].join('\n');
    expect(analyzeComplexity(source, '.ts').branchTokens).toBe(0);
  });

  test('handles carriage-return-newline line endings', () => {
    const source = 'const a = 1;\r\nif (a) {\r\n  b();\r\n}';
    const profile = analyzeComplexity(source, '.ts');
    expect(profile.logicalLines).toBe(4);
    expect(profile.branchTokens).toBe(1);
  });

  test('reports zeroes for an empty file without dividing by zero', () => {
    expect(analyzeComplexity('', '.ts')).toEqual({ logicalLines: 0, branchTokens: 0, density: 0 });
  });

  test('reports zeroes for a comment-only file', () => {
    expect(analyzeComplexity('// nothing\n// to see\n', '.ts')).toEqual({
      logicalLines: 0,
      branchTokens: 0,
      density: 0,
    });
  });

  test('applies hash-comment syntax for python sources', () => {
    const source = ['x = 1  # if for', 'if x:', '    y = 2'].join('\n');
    const profile = analyzeComplexity(source, '.py');
    expect(profile.logicalLines).toBe(3);
    expect(profile.branchTokens).toBe(1);
  });

  test('strips a leading byte order mark without counting it as a line', () => {
    const profile = analyzeComplexity('\uFEFFconst a = 1;\nif (a) {}', '.ts');
    expect(profile.logicalLines).toBe(2);
  });
});
