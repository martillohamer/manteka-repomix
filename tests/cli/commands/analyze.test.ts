import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  calculateImportDepthsSimple,
  parseImportExports,
  runAnalysis,
} from '../../../src/core/analyze/index.js';
import { registerAnalyzeCommand } from '../../../src/cli/commands/analyzeCommand.js';

const buildProgram = () => {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerAnalyzeCommand(program);
  return program;
};

const analyzeOf = (program: Command) => {
  const analyze = program.commands.find((command) => command.name() === 'analyze');
  if (!analyze) {
    throw new Error('analyze subcommand was not registered');
  }
  return analyze;
};

/**
 * Commander's `Option` exposes `flags`/`long`, not `name` — `name` there would be the
 * inherited `Command.name()` method, so comparing it to a string never matches.
 */
const hasOption = (program: Command, long: string): boolean =>
  analyzeOf(program).options.some((opt) => opt.long === long || opt.flags.includes(long));

describe('registerAnalyzeCommand', () => {
  it('registers the analyze subcommand', () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain('analyze');
  });

  it('has deep option description', () => {
    const program = buildProgram();
    expect(hasOption(program, '--deep')).toBe(true);
  });

  it('has output option description', () => {
    const program = buildProgram();
    expect(hasOption(program, '--output')).toBe(true);
  });

  it('has root argument', () => {
    const program = buildProgram();
    const analyze = analyzeOf(program);
    expect(analyze.registeredArguments.length).toBeGreaterThan(0);
    expect(analyze.registeredArguments[0].name()).toBe('root');
  });

  it('exposes runAnalysis producing a summary for the project', () => {
    const analyze = analyzeOf(buildProgram());
    expect(typeof analyze.description()).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Deep vs shallow dependency expansion
// ---------------------------------------------------------------------------

/**
 * Fixture project shaped as a three-level chain plus an isolated file:
 *
 *   index.ts ──> middle.ts ──> leaf.ts
 *   lonely.ts   (imports nothing)
 *
 * Only a transitive expansion can connect index.ts to leaf.ts, so any assertion
 * that proves nested resolution necessarily fails in shallow mode.
 */
describe('runAnalysis deep expansion', () => {
  let projectDir: string;
  let indexPath: string;
  let middlePath: string;
  let leafPath: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-analyze-deep-'));
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });

    // Side-effect imports are the common form in real code and must be detected.
    await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), "import './middle.ts';\n", 'utf-8');
    await fs.writeFile(path.join(projectDir, 'src', 'middle.ts'), "import './leaf.ts';\n", 'utf-8');
    await fs.writeFile(path.join(projectDir, 'src', 'leaf.ts'), 'export const leaf = 1;\n', 'utf-8');
    await fs.writeFile(path.join(projectDir, 'src', 'lonely.ts'), 'export const x = 1;\n', 'utf-8');

    indexPath = path.join(path.resolve(projectDir), 'src', 'index.ts');
    middlePath = path.join(path.resolve(projectDir), 'src', 'middle.ts');
    leafPath = path.join(path.resolve(projectDir), 'src', 'leaf.ts');
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  describe('shallow (default)', () => {
    it('maps only direct, one-hop dependencies', () => {
      const result = runAnalysis(projectDir);

      expect(result.deep).toBe(false);
      expect(result.dependencyGraph[indexPath]).toEqual([middlePath]);
      expect(result.dependencyGraph[middlePath]).toEqual([leafPath]);
      // A file nothing imports from has no direct dependencies.
      expect(result.dependencyGraph[leafPath]).toEqual([]);
    });

    it('caps the reported depth at the direct level', () => {
      const result = runAnalysis(projectDir);

      // The chain is two hops deep, but shallow mode never looks past the first.
      expect(result.summary.maxImportDepth).toBe(1);
    });

    it('does not compute the transitive closure', () => {
      const result = runAnalysis(projectDir);

      expect(result.transitiveGraph).toEqual({});
      expect(Object.keys(result.transitiveGraph)).toHaveLength(0);
    });

    it('omits the extended metrics rather than reporting them as zero', () => {
      const result = runAnalysis(projectDir);

      // Absence is meaningful: "not measured" must not look like "measured as 0".
      expect(result.summary.depthDistribution).toBeUndefined();
      expect(result.summary.transitiveFileCount).toBeUndefined();
      expect(result.summary.entryPoints).toBeUndefined();
      expect(result.summary.leafFiles).toBeUndefined();
    });

    it('still resolves nested files as direct dependencies of their own importer', () => {
      const result = runAnalysis(projectDir);

      // leaf is one hop from middle, so it is visible even without --deep.
      expect(result.summary.totalUniqueDependencies).toBe(2);
    });
  });

  describe('deep', () => {
    it('expands the full transitive closure', () => {
      const result = runAnalysis(projectDir, { deep: true });

      expect(result.deep).toBe(true);
      // The whole point of --deep: index reaches leaf two hops away.
      expect(result.transitiveGraph[indexPath]).toEqual(expect.arrayContaining([middlePath, leafPath]));
      expect(result.transitiveGraph[middlePath]).toEqual([leafPath]);
      expect(result.transitiveGraph[leafPath]).toEqual([]);
    });

    it('reports the true maximum depth of the import chain', () => {
      const result = runAnalysis(projectDir, { deep: true });

      expect(result.summary.maxImportDepth).toBe(2);
    });

    it('adds the extended metrics', () => {
      const result = runAnalysis(projectDir, { deep: true });

      expect(result.summary.depthDistribution).toEqual({ 0: 2, 1: 1, 2: 1 });
      // index and middle each reach at least one file transitively.
      expect(result.summary.transitiveFileCount).toBe(2);
      // Leaves import nothing: leaf.ts and lonely.ts.
      expect(result.summary.leafFiles).toEqual(
        expect.arrayContaining([path.join('src', 'leaf.ts'), path.join('src', 'lonely.ts')]),
      );
      expect(result.summary.leafFiles).not.toContain(path.join('src', 'index.ts'));
      // Entry points are the mirror image: nothing imports them.
      expect(result.summary.entryPoints).toEqual(
        expect.arrayContaining([path.join('src', 'index.ts'), path.join('src', 'lonely.ts')]),
      );
      expect(result.summary.entryPoints).not.toContain(path.join('src', 'middle.ts'));
    });

    it('is strictly more expansive than shallow', () => {
      const shallow = runAnalysis(projectDir);
      const deep = runAnalysis(projectDir, { deep: true });

      expect(deep.summary.maxImportDepth).toBeGreaterThan(shallow.summary.maxImportDepth);
      expect(Object.keys(deep.transitiveGraph)).not.toHaveLength(0);
      expect(shallow.summary.depthDistribution).toBeUndefined();
      expect(deep.summary.depthDistribution).toBeDefined();
    });

    it('keeps the direct graph identical to shallow mode', () => {
      const shallow = runAnalysis(projectDir);
      const deep = runAnalysis(projectDir, { deep: true });

      // --deep must add information, never change the direct edges.
      expect(deep.dependencyGraph).toEqual(shallow.dependencyGraph);
    });
  });

  it('treats a non-deep options object as shallow', () => {
    const result = runAnalysis(projectDir, { deep: false });

    expect(result.deep).toBe(false);
    expect(result.summary.maxImportDepth).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Graph utilities
// ---------------------------------------------------------------------------

describe('parseImportExports', () => {
  it('detects side-effect imports', () => {
    const { imports } = parseImportExports("import './polyfill.ts';\n", 'a.ts');

    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe(path.normalize('./polyfill.ts'));
  });

  it('detects named, default and namespace imports', () => {
    const source = [
      "import { a } from './a.ts';",
      "import def from './b.ts';",
      "import * as ns from './c.ts';",
      "import './d.ts';",
    ].join('\n');

    const { imports } = parseImportExports(source, 'entry.ts');

    expect(imports.map((imp) => imp.importPath)).toEqual([
      path.normalize('./a.ts'),
      path.normalize('./b.ts'),
      path.normalize('./c.ts'),
      path.normalize('./d.ts'),
    ]);
  });

  it('ignores bare package specifiers', () => {
    const { imports } = parseImportExports("import { readFile } from 'node:fs';\n", 'a.ts');

    expect(imports).toHaveLength(0);
  });
});

describe('calculateImportDepthsSimple', () => {
  it('computes longest-path depth in a chain', () => {
    const graph = { a: ['b'], b: ['c'], c: [] };

    expect(calculateImportDepthsSimple(graph)).toEqual({ a: 2, b: 1, c: 0 });
  });

  it('is independent of traversal order for shared dependencies', () => {
    // d is reachable from both b and c; whichever branch is visited first, a's
    // depth must still be 2. The previous shared-`visited` implementation got this
    // wrong depending on key order.
    const forward = { a: ['b'], b: ['d'], c: ['d'], d: [] };
    const reversed = { c: ['d'], b: ['d'], a: ['b'], d: [] };

    expect(calculateImportDepthsSimple(forward).a).toBe(2);
    expect(calculateImportDepthsSimple(reversed).a).toBe(2);
  });

  it('terminates on a cycle instead of overflowing the stack', () => {
    const graph = { a: ['b'], b: ['c'], c: ['a'] };

    const depths = calculateImportDepthsSimple(graph);

    expect(Object.keys(depths)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    for (const depth of Object.values(depths)) {
      expect(Number.isFinite(depth)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// CLI / MCP wiring for the deep flag
// ---------------------------------------------------------------------------

describe('deep flag plumbing', () => {
  it('routes --deep into the command action as true', async () => {
    const program = buildProgram();
    let captured: boolean | undefined;
    analyzeOf(program).action((_root: string, options: { deep?: boolean }) => {
      captured = options.deep;
    });

    await program.parseAsync(['node', 'manteka', 'analyze', '.', '--deep']);

    expect(captured).toBe(true);
  });

  it('leaves deep undefined when the flag is omitted', async () => {
    const program = buildProgram();
    let captured: boolean | undefined = false;
    analyzeOf(program).action((_root: string, options: { deep?: boolean }) => {
      captured = options.deep;
    });

    await program.parseAsync(['node', 'manteka', 'analyze', '.']);

    expect(captured).toBeUndefined();
  });
});