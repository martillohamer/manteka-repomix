import { describe, expect, it, vi } from 'vitest';
import { createDiagnostician } from '../../src/healer/diagnostician.js';

describe('diagnostician', () => {
  it('builds micro context with context lines', async () => {
    const readFile = vi.fn().mockResolvedValue('line1\nline2\nline3\nline4\nline5');
    const diagnostician = createDiagnostician({ readFile });
    const context = await diagnostician.buildMicroContext('test.ts', 3, 3);
    // context lines 10, line 3. Should show lines 1-5.
    expect(context).toContain('1: line1');
    expect(context).toContain('3: line3');
    expect(context).toContain('5: line5');
  });

  it('returns empty string if file unreadable', async () => {
    const readFile = vi.fn().mockResolvedValue(null);
    const diagnostician = createDiagnostician({ readFile });
    const context = await diagnostician.buildMicroContext('test.ts', 1, 1);
    expect(context).toBe('');
  });
});
