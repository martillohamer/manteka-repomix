import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSmartSliceClosure, SMART_SLICE_DEFAULT_DEPTH } from '../../../src/core/smartSlice/index.js';

describe('buildSmartSliceClosure', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-slice-'));
    await fs.mkdir(path.join(rootDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(rootDir, 'src', 'entry.ts'), "import './a';\n");
    await fs.writeFile(path.join(rootDir, 'src', 'a.ts'), "import './b';\n");
    await fs.writeFile(path.join(rootDir, 'src', 'b.ts'), 'export const b = 1;\n');
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('resolves the closure against the real filesystem', async () => {
    const result = await buildSmartSliceClosure({ rootDir, entry: 'src/entry.ts', depth: 2 });
    expect(result.paths).toEqual(['src/a.ts', 'src/b.ts', 'src/entry.ts']);
    expect(result.entry).toBe('src/entry.ts');
    expect(result.warnings).toEqual([]);
  });

  it('exposes a default depth of 2', () => {
    expect(SMART_SLICE_DEFAULT_DEPTH).toBe(2);
  });
});
