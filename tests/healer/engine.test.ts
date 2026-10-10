// Test suite for src/healer/engine.ts
// Implements TDD for rule-based trivial patch generation

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createEngine, type EngineDeps } from '../../src/healer/engine.js';

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

describe('Engine: ruleRemoveUnusedMarker', () => {
  test('generates patch for single unused marker', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = path.join(__dirname, 'test-remove-unused.ts');
    await fs.writeFile(testFile, '// TODO: UNUSED\nconst foo = 1;');

    const diagnostic = createDiagnostic(testFile, '// TODO: UNUSED');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).not.toBeNull();
    expect(patch.file).toBe(testFile);
    expect(patch.diff.split('\n').length).toBeLessThanOrEqual(20);
    expect(patch.confidence).toBeGreaterThan(0.2);
  });

  test('rejects when multiple unused markers exist', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = path.join(__dirname, 'test-multi-unused.ts');
    await fs.writeFile(testFile, '// TODO: UNUSED\n// TODO: UNUSED\nconst foo = 1;');

    const diagnostic = createDiagnostic(testFile, '// TODO: UNUSED');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});

describe('Engine: ruleFixWhitespace', () => {
  test('generates patch for single trailing space', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = path.join(__dirname, 'test-whitespace.ts');
    await fs.writeFile(testFile, 'const foo = 1; // trailing \nconst bar = 2;');

    const diagnostic = createDiagnostic(testFile, 'const foo = 1; // trailing');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).not.toBeNull();
    expect(patch.file).toBe(testFile);
    expect(patch.diff.split('\n').length).toBeLessThanOrEqual(20);
    expect(patch.confidence).toBeGreaterThan(0.2);
  });

  test('rejects when multiple trailing spaces exist', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = path.join(__dirname, 'test-multi-whitespace.ts');
    await fs.writeFile(testFile, 'const foo = 1; // trailing \nconst bar = 2; // trailing \nconst baz = 3;');

    const diagnostic = createDiagnostic(testFile, 'const foo = 1; // trailing');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});

describe('Engine: ruleCommentTodo', () => {
  test('generates patch for single unmarked todo', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = path.join(__dirname, 'test-todo.ts');
    await fs.writeFile(testFile, '// TODO: implement feature\nconst foo = 1;');

    const diagnostic = createDiagnostic(testFile, '// TODO: implement feature');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).not.toBeNull();
    expect(patch.file).toBe(testFile);
    expect(patch.diff.split('\n').length).toBeLessThanOrEqual(20);
    expect(patch.confidence).toBeGreaterThan(0.2);
  });

  test('rejects when multiple todos exist', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = path.join(__dirname, 'test-multi-todo.ts');
    await fs.writeFile(testFile, '// TODO: one\n// TODO: two\nconst foo = 1;');

    const diagnostic = createDiagnostic(testFile, '// TODO: one');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});

describe('Engine: no matching rule returns null', () => {
  test('returns null when diagnostic does not match any rule', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = path.join(__dirname, 'test-norule.ts');
    await fs.writeFile(testFile, 'const foo = 1;');

    const diagnostic = createDiagnostic(testFile, 'const foo = 1;');
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});

describe('Engine: safety constraints', () => {
  test('rejects patches exceeding 20-line diff limit', async () => {
    const engine = createEngine({ readFile: mockReadFile });
    const testFile = path.join(__dirname, 'test-large-diff.ts');
    const longContent = Array.from({ length: 25 }, (_, i) => `line${i}`).join('\n');
    await fs.writeFile(testFile, longContent);

    // Simulate a diagnostic that would trigger a large patch (artificial)
    const diagnostic = createDiagnostic(testFile, longContent);
    const patch = await engine.generatePatch(diagnostic);

    expect(patch).toBeNull();
  });
});
