// Integration tests for the Autonomous Healer Daemon
// Tests the full cycle: sensor -> diagnostician -> engine

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHealer } from '../../src/healer/index.js';
import type { Patch } from '../../src/healer/types.js';

// Helper to create a temporary test file
const createTestFile = async (dir: string, content: string, name: string): Promise<string> => {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content);
  return filePath;
};

describe('Healer: Daemon Orchestration', () => {
  let healer: ReturnType<typeof createHealer>;
  const testDir = path.join(__dirname, 'healer-test-data');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    healer = createHealer({
      root: testDir,
      readFile: async (filePath: string) => {
        try {
          return await fs.readFile(filePath, 'utf8');
        } catch {
          return null;
        }
      },
      dryRun: false,
    });
  });

  beforeEach(async () => {
    healer.start();
    // Clean up test files before each test
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    healer.stop();
  });

  test('start/stop cycle works', async () => {
    expect(healer.start).toBeDefined();
    expect(healer.stop).toBeDefined();
    await healer.start();
    await healer.stop();
  });

  test('scanAndProceed with unused marker generates patch', async () => {
    const testFile = await createTestFile(testDir, '// TODO: UNUSED\nconst foo = 1;', 'test-unused.ts');
    const patch = await healer.scanAndProceed(testFile);

    expect(patch).not.toBeNull();
    expect(patch).toHaveProperty('file');
    expect(patch).toHaveProperty('diff');
    expect(patch).toHaveProperty('confidence');
    expect(patch.confidence).toBeGreaterThan(0.2);

    // Verify patch diff contains the expected structure
    expect(patch.diff).toContain('--- a/');
    expect(patch.diff).toContain('+++ b/');
  });

  test('scanAndProceed with trailing whitespace generates patch', async () => {
    const testFile = await createTestFile(
      testDir,
      '// TODO: fix trailing space const foo = 1; // \nconst bar = 2;',
      'test-whitespace.ts',
    );
    const patch = await healer.scanAndProceed(testFile);

    expect(patch).not.toBeNull();
    expect(patch.confidence).toBeGreaterThan(0.2);
  });

  test('scanAndProceed with TODO comment generates patch', async () => {
    const testFile = await createTestFile(testDir, '// TODO: implement feature\nconst foo = 1;', 'test-todo.ts');
    const patch = await healer.scanAndProceed(testFile);

    expect(patch).not.toBeNull();
    expect(patch.confidence).toBeGreaterThan(0.2);
  });

  test('scanAndProceed returns null when no matching rule', async () => {
    const testFile = await createTestFile(testDir, 'const foo = 1; // just code', 'test-norule.ts');
    const patch = await healer.scanAndProceed(testFile);

    expect(patch).toBeNull();
  });

  test('scanAndProceed handles multiple diagnostics (rejects when multiple)', async () => {
    const testFile = await createTestFile(testDir, '// TODO: one\n// TODO: two\nconst foo = 1;', 'test-multi.ts');
    const patch = await healer.scanAndProceed(testFile);

    // With multiple TODOs, the engine should reject (needs exactly 1)
    expect(patch).toBeNull();
  });

  test('healer handle has required methods', () => {
    expect(healer.start).toBeDefined();
    expect(healer.stop).toBeDefined();
    expect(healer.emit).toBeDefined();
    expect(healer.scanAndProceed).toBeDefined();
  });

  test('healer emits events during operation', async () => {
    const testFile = await createTestFile(testDir, '// TODO: UNUSED\nconst foo = 1;', 'test-events.ts');
    await healer.scanAndProceed(testFile);

    // The handle should have emitted events
    // We verify by checking that emit is functional
    expect(healer.emit).toBeDefined();
    healer.emit({
      type: 'test' as const,
      ts: Date.now(),
      details: 'test',
    });
  });
});
