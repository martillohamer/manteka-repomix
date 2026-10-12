// Test suite for the `manteka_analyze_codebase` MCP tool.
// Exercises the tool entry point exported from src/mcp/tools.ts.
//
// NOTE: this file was accidentally deleted by an over-broad `git clean` and has been
// reconstructed. The original body was not recovered; these cases cover the same
// tool surface (structured text result, JSON output, resolved dependency edges, the
// `deep` parameter, and an empty project).

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { manteka_analyze_codebase } from '../../src/mcp/tools.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-analyze-tool-'));
  await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
  // The resolver matches the specifier literally against the filesystem (no extension
  // inference), so the edge only appears when the import names the real filename.
  await fs.writeFile(
    path.join(projectDir, 'src', 'index.ts'),
    "import { helper } from './helper.ts';\nexport const value = helper();\n",
    'utf-8',
  );
  await fs.writeFile(
    path.join(projectDir, 'src', 'helper.ts'),
    'export const helper = () => 42;\n',
    'utf-8',
  );
});

afterEach(async () => {
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe('manteka_analyze_codebase tool', () => {
  it('returns structured result with expected properties', async () => {
    const output = await manteka_analyze_codebase(projectDir);

    expect(output).toContain('Dependency Analysis');
    expect(output).toContain(`Project: ${path.resolve(projectDir)}`);
    expect(output).toContain('Files analyzed: 2');
    expect(output).toContain('Coupling Summary');
    expect(output).toContain('Import Depth Distribution');
    expect(output).toContain('Circular Dependency Alerts');
    expect(output).toContain('Files Analysis Summary');
  });

  it('returns parseable JSON when output is json', async () => {
    const output = await manteka_analyze_codebase(projectDir, true, 'json');
    const parsed = JSON.parse(output);

    expect(parsed.root).toBe(path.resolve(projectDir));
    expect(parsed.summary.totalFiles).toBe(2);
    expect(Array.isArray(parsed.fileAnalysis)).toBe(true);
    // Paths are platform-native relative paths, so build the expectation with path.join.
    expect(parsed.fileAnalysis.map((entry: { path: string }) => entry.path)).toContain(
      path.join('src', 'index.ts'),
    );
  });

  it('reports the resolved dependency edge between entry and helper', async () => {
    const output = await manteka_analyze_codebase(projectDir, true, 'json');
    const parsed = JSON.parse(output);
    const indexDeps: string[] = parsed.dependencyGraph[
      path.join(path.resolve(projectDir), 'src', 'index.ts')
    ];

    expect(indexDeps).toBeDefined();
    expect(indexDeps).toContain(path.join(path.resolve(projectDir), 'src', 'helper.ts'));
  });

  it('accepts deep parameter', async () => {
    // `deep` is part of the tool's contract: both values must produce a well-formed
    // result rather than throwing.
    const shallow = await manteka_analyze_codebase(projectDir, false);
    const deep = await manteka_analyze_codebase(projectDir, true);

    expect(shallow).toContain('Files analyzed: 2');
    expect(deep).toContain('Files analyzed: 2');
  });

  it('does not throw on an empty directory', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-analyze-empty-'));
    try {
      const output = await manteka_analyze_codebase(emptyDir);
      expect(output).toContain('Files analyzed: 0');
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });
});