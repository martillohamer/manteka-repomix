import { describe, expect, it } from 'vitest';
import { parseSmartDepth } from '../../src/cli/cliRun.js';
import { RepomixError } from '../../src/shared/errorHandle.js';

describe('parseSmartDepth', () => {
  it('parses non-negative integers', () => {
    expect(parseSmartDepth('0')).toBe(0);
    expect(parseSmartDepth('3')).toBe(3);
  });

  it('rejects non-numeric input', () => {
    expect(() => parseSmartDepth('abc')).toThrow(RepomixError);
  });

  it('rejects negative input', () => {
    expect(() => parseSmartDepth('-1')).toThrow(RepomixError);
  });

  it('rejects empty input', () => {
    expect(() => parseSmartDepth('')).toThrow(RepomixError);
  });
});
