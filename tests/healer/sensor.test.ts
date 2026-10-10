import { describe, expect, it, vi } from 'vitest';
import { createSensor } from '../../src/healer/sensor.js';

describe('sensor', () => {
  it('detects TODOs and FIXMEs and deduplicates them', async () => {
    const readFile = vi.fn().mockResolvedValue('// TODO: fix this\n// FIXME: broken\n// TODO: fix this');
    const sensor = createSensor({ readFile });
    const diagnostics = await sensor.scanFile('test.ts');
    expect(diagnostics.length).toBe(2);
    expect(diagnostics.map((d) => d.message)).toContain('// TODO: fix this');
    expect(diagnostics.map((d) => d.message)).toContain('// FIXME: broken');
  });

  it('ignores vendor directories', async () => {
    const sensor = createSensor({});
    const diagnostics = await sensor.scanFile('node_modules/test.ts');
    expect(diagnostics.length).toBe(0);
  });

  it('returns empty array if file unreadable', async () => {
    const readFile = vi.fn().mockResolvedValue(null);
    const sensor = createSensor({ readFile });
    const diagnostics = await sensor.scanFile('test.ts');
    expect(diagnostics).toEqual([]);
  });
});
