import { describe, expect, it } from 'vitest';
import { restrictFilePathsToSmartSlice } from '../../../src/core/smartSlice/restrict.js';

describe('restrictFilePathsToSmartSlice', () => {
  it('keeps only closure paths and reports skipped ones', () => {
    const result = restrictFilePathsToSmartSlice(
      ['src/a.ts', 'src/b.ts', 'other/c.ts'],
      new Set(['src/a.ts', 'src/ignored-by-rules.ts']),
    );
    expect(result.kept).toEqual(['src/a.ts']);
    expect(result.skipped).toEqual(['src/ignored-by-rules.ts']);
  });

  it('preserves the searched order', () => {
    const result = restrictFilePathsToSmartSlice(['src/b.ts', 'src/a.ts'], new Set(['src/a.ts', 'src/b.ts']));
    expect(result.kept).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('returns nothing kept when every closure path is filtered out', () => {
    const result = restrictFilePathsToSmartSlice(['other/c.ts'], new Set(['src/a.ts']));
    expect(result.kept).toEqual([]);
    expect(result.skipped).toEqual(['src/a.ts']);
  });
});
