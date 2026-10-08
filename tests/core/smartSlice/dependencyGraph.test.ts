import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildClosure } from '../../../src/core/smartSlice/dependencyGraph.js';
import { RepomixError } from '../../../src/shared/errorHandle.js';

const rootDir = path.resolve(path.sep, 'root');
const p = (...parts: string[]) => path.join(rootDir, ...parts);

const graph: Record<string, string> = {
  [p('src', 'entry.ts')]: "import './a';\nimport './b';",
  [p('src', 'a.ts')]: "import './c';",
  [p('src', 'b.ts')]: "import './c';",
  [p('src', 'c.ts')]: "import './a';", // cycle back
};

const deps = {
  readFile: async (absolutePath: string) => {
    if (!(absolutePath in graph)) throw new Error(`missing ${absolutePath}`);
    return graph[absolutePath];
  },
  fileExists: async (absolutePath: string) => absolutePath in graph,
};

describe('buildClosure', () => {
  it('depth 0 includes only the entry', async () => {
    const result = await buildClosure({ rootDir, entry: 'src/entry.ts', depth: 0 }, deps);
    expect(result.paths).toEqual(['src/entry.ts']);
  });

  it('depth 1 includes direct imports', async () => {
    const result = await buildClosure({ rootDir, entry: 'src/entry.ts', depth: 1 }, deps);
    expect(result.paths).toEqual(['src/a.ts', 'src/b.ts', 'src/entry.ts']);
  });

  it('depth 2 traverses transitively and survives cycles', async () => {
    const result = await buildClosure({ rootDir, entry: 'src/entry.ts', depth: 2 }, deps);
    expect(result.paths).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/entry.ts']);
    expect(result.entry).toBe('src/entry.ts');
    expect(result.warnings).toEqual([]);
  });

  it('warns on unresolvable imports', async () => {
    const localDeps = {
      ...deps,
      readFile: async (absolutePath: string) =>
        absolutePath === p('src', 'x.ts') ? "import './nope';" : graph[absolutePath],
      fileExists: async (absolutePath: string) => absolutePath in graph || absolutePath === p('src', 'x.ts'),
    };
    const result = await buildClosure({ rootDir, entry: 'src/x.ts', depth: 1 }, localDeps);
    expect(result.paths).toEqual(['src/x.ts']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('./nope');
  });

  it('throws when the entry is missing or escapes the root', async () => {
    await expect(buildClosure({ rootDir, entry: 'src/missing.ts', depth: 1 }, deps)).rejects.toThrow(RepomixError);
    await expect(buildClosure({ rootDir, entry: '../outside.ts', depth: 1 }, deps)).rejects.toThrow(RepomixError);
  });
});
