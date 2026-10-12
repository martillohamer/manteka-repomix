// Test suite for src/healer/engine.ts
// Implements TDD for rule-based trivial patch generation

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createEngine, type EngineDeps, type Patch } from '../../src/healer/engine.js';

// Helper to create a mock diagnostic
const createDiagnostic = (file: string, content: string, line?: number) => ({
  file,
  content,
  line,
});

// Mock readFile for testing
const mockReadFile: EngineDeps['readFile'] = async (filePath: string) => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
};

// Scratch inputs live in a per-run temp directory. Writing them beside the tests
// used to leave `test-*.ts` artifacts inside the repository — one of them, a file
// full of `line0`…`line24`, was committed by accident.
let scratchDir: string;

beforeEach(async () => {
  scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-healer-engine-'));
});

afterEach(async () => {
  await fs.rm(scratchDir, { recursive: true, force: true });
});

const scratchFile = (name: string): string => path.join(scratchDir, name);

/**
 * Narrows a possibly-null patch while keeping "expected a patch" as the failure
 * mode, so these tests read as before but typecheck under strict null checks.
 */
const expectPatch = (patch: Patch | null): Patch => {
  expect(patch).not.toBeNull();
  if (patch === null) {
    throw new Error('expected engine.generatePatch to return a patch');
  }
  return patch;
};

describe('Engine: ruleRemoveUnusedMarker', () => {
  test('generates patch for single unused marker', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = scratchFile('test-remove-unused.ts');
    await fs.writeFile(testFile, '// TODO: UNUSED\nconst foo = 1;');

    const diagnostic = createDiagnostic(testFile, '// TODO: UNUSED');
    const patch = expectPatch(await engine.generatePatch(diagnostic));

    expect(patch.file).toBe(testFile);
    expect(patch.diff.split('\n').length).toBeLessThanOrEqual(20);
    expect(patch.confidence).toBeGreaterThan(0.2);
  });

  test('rejects when multiple unused markers exist', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = scratchFile('test-multi-unused.ts');
    await fs.writeFile(testFile, '// TODO: UNUSED\n// TODO: UNUSED\nconst foo = 1;');

    const diagnostic = createDiagnostic(testFile, '// TODO: UNUSED');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});

describe('Engine: ruleFixWhitespace', () => {
  test('generates patch for single trailing space', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = scratchFile('test-whitespace.ts');
    await fs.writeFile(testFile, 'const foo = 1; // trailing \nconst bar = 2;');

    const diagnostic = createDiagnostic(testFile, 'const foo = 1; // trailing');
    const patch = expectPatch(await engine.generatePatch(diagnostic));

    expect(patch.file).toBe(testFile);
    expect(patch.diff.split('\n').length).toBeLessThanOrEqual(20);
    expect(patch.confidence).toBeGreaterThan(0.2);
  });

  test('rejects when multiple trailing spaces exist', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = scratchFile('test-multi-whitespace.ts');
    await fs.writeFile(
      testFile,
      'const foo = 1; // trailing \nconst bar = 2; // trailing \nconst baz = 3;',
    );

    const diagnostic = createDiagnostic(testFile, 'const foo = 1; // trailing');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});

describe('Engine: ruleCommentTodo', () => {
  test('generates patch for single unmarked todo', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = scratchFile('test-todo.ts');
    await fs.writeFile(testFile, '// TODO: implement feature\nconst foo = 1;');

    const diagnostic = createDiagnostic(testFile, '// TODO: implement feature');
    const patch = expectPatch(await engine.generatePatch(diagnostic));

    expect(patch.file).toBe(testFile);
    expect(patch.diff.split('\n').length).toBeLessThanOrEqual(20);
    expect(patch.confidence).toBeGreaterThan(0.2);
  });

  test('rejects when multiple todos exist', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = scratchFile('test-multi-todo.ts');
    await fs.writeFile(testFile, '// TODO: one\n// TODO: two\nconst foo = 1;');

    const diagnostic = createDiagnostic(testFile, '// TODO: one');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});

describe('Engine: no matching rule returns null', () => {
  test('returns null when diagnostic does not match any rule', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = scratchFile('test-norule.ts');
    await fs.writeFile(testFile, 'const foo = 1;');

    const diagnostic = createDiagnostic(testFile, 'const foo = 1;');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});

describe('Engine: safety constraints', () => {
  test('rejects patches exceeding 20-line diff limit', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = scratchFile('test-large-diff.ts');
    const longContent = Array.from({ length: 25 }, (_, i) => `line${i}`).join('\n');
    await fs.writeFile(testFile, longContent);

    // Simulate a diagnostic that would trigger a large patch (artificial)
    const diagnostic = createDiagnostic(testFile, longContent);
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});