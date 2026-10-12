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
    // `deep` must actually change the analysis, not merely be accepted. The shared
    // fixture is a single hop, so build a three-level chain here: only a transitive
    // expansion can connect index.ts to leaf.ts.
    const chainDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-analyze-chain-'));
    try {
      await fs.mkdir(path.join(chainDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(chainDir, 'src', 'index.ts'), "import './middle.ts';\n", 'utf-8');
      await fs.writeFile(path.join(chainDir, 'src', 'middle.ts'), "import './leaf.ts';\n", 'utf-8');
      await fs.writeFile(path.join(chainDir, 'src', 'leaf.ts'), 'export const leaf = 1;\n', 'utf-8');

      const shallow = JSON.parse(await manteka_analyze_codebase(chainDir, false, 'json'));
      const deep = JSON.parse(await manteka_analyze_codebase(chainDir, true, 'json'));

      expect(shallow.deep).toBe(false);
      expect(deep.deep).toBe(true);

      // Shallow stops at the direct import; deep walks the whole chain.
      expect(shallow.summary.maxImportDepth).toBe(1);
      expect(deep.summary.maxImportDepth).toBe(2);

      // The transitive closure only exists in deep mode.
      expect(shallow.transitiveGraph).toEqual({});
      expect(deep.transitiveGraph[path.join(path.resolve(chainDir), 'src', 'index.ts')]).toEqual(
        expect.arrayContaining([path.join(path.resolve(chainDir), 'src', 'leaf.ts')]),
      );

      // Text mode surfaces the mode so the difference is visible to a human too.
      expect(await manteka_analyze_codebase(chainDir, false)).toContain('shallow');
      expect(await manteka_analyze_codebase(chainDir, true)).toContain('deep (transitive)');
    } finally {
      await fs.rm(chainDir, { recursive: true, force: true });
    }
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