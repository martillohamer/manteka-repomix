# Manteka Smart-Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--smart <entry>` / `--smart-depth <n>` CLI mode that packs only the forward relative-import dependency closure of an entry file.

**Architecture:** A new pure-ish module `src/core/smartSlice/` extracts relative import specifiers with regexes and walks them with a cycle-safe BFS bounded by depth. `defaultAction` computes the closure and passes the path list into `pack()`, which intersects it with `searchFiles` output so all existing include/ignore/gitignore semantics remain the single source of truth.

**Tech Stack:** TypeScript (ESM, NodeNext), Vitest, Commander.js, Node `fs/promises`, `path`; Biome for lint.

## Global Constraints

- ESM NodeNext: every relative import in `src/**` ends in `.js`.
- No new runtime dependencies.
- Inject I/O (`readFile`, `fileExists`) into the graph so tests use no real disk.
- Support exactly one target directory; reject `--smart` with `--stdin` or multiple directories.
- Default depth is `2` (`0` = entry only). Extensions: `.ts .tsx .js .jsx .mjs .cjs .mts .cts .json .vue`; index files: `index.<ext>` for all except `.json`.
- Banner: `🧠 Manteka Smart-Slice active: tracing dependencies from <entry> (depth N)`.
- `npm run lint` must end with 0 errors and 0 warnings; `npx tsc --noEmit`, `npm run build`, `npm test` must pass (2 baseline locale failures are pre-existing).
- Commits: Conventional Commits with a contextual body.

---

### Task 1: Types and import specifier extraction

**Files:**
- Create: `src/core/smartSlice/types.ts`
- Create: `src/core/smartSlice/importParser.ts`
- Test: `tests/core/smartSlice/importParser.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SmartSliceOptions { rootDir: string; entry: string; depth: number }`
  - `SmartSliceResult { entry: string; paths: string[]; warnings: string[] }`
  - `SmartSliceFsDeps { readFile(abs): Promise<string>; fileExists(abs): Promise<boolean> }`
  - `extractImportSpecifiers(content: string): string[]`
  - `toPosixPath(value: string): string`
  - `isInsideRoot(candidateAbs: string, rootAbs: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/smartSlice/importParser.test.ts
import { describe, expect, it } from 'vitest';
import {
  extractImportSpecifiers,
  isInsideRoot,
  toPosixPath,
} from '../../../src/core/smartSlice/importParser.js';

describe('extractImportSpecifiers', () => {
  it('extracts relative specifiers from import/export/require/import()', () => {
    const content = [
      "import { a } from './a.js';",
      "import type { B } from '../types/b';",
      "export * from './c';",
      "export { d } from './d.ts';",
      "const e = require('./e');",
      "const f = await import('./f');",
      "import './side-effect';",
    ].join('\n');
    expect(extractImportSpecifiers(content)).toEqual(
      ['./a.js', '../types/b', './c', './d.ts', './e', './f', './side-effect'].map((s) => s),
    );
  });

  it('ignores bare packages, aliases and urls', () => {
    const content = [
      "import react from 'react';",
      "import { x } from '@/alias';",
      "import { y } from 'https://example.com/y.js';",
      "import { z } from 'node:path';",
    ].join('\n');
    expect(extractImportSpecifiers(content)).toEqual([]);
  });

  it('handles multi-line named imports', () => {
    const content = "import {\n  a,\n  b,\n} from './multi';\n";
    expect(extractImportSpecifiers(content)).toEqual(['./multi']);
  });

  it('deduplicates repeated specifiers', () => {
    const content = "import './a';\nrequire('./a');\n";
    expect(extractImportSpecifiers(content)).toEqual(['./a']);
  });
});

describe('path helpers', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toPosixPath('a\\b\\c')).toBe('a/b/c');
  });

  it('detects paths inside the root and rejects siblings', () => {
    expect(isInsideRoot('/root/a/b.ts', '/root')).toBe(true);
    expect(isInsideRoot('/root', '/root')).toBe(true);
    expect(isInsideRoot('/root-sibling/a.ts', '/root')).toBe(false);
    expect(isInsideRoot('/other/a.ts', '/root')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/smartSlice/importParser.test.ts`
Expected: FAIL — cannot resolve `src/core/smartSlice/importParser.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/smartSlice/types.ts
export interface SmartSliceOptions {
  rootDir: string;
  entry: string;
  depth: number;
}

export interface SmartSliceResult {
  entry: string;
  paths: string[];
  warnings: string[];
}

export interface SmartSliceFsDeps {
  readFile: (absolutePath: string) => Promise<string>;
  fileExists: (absolutePath: string) => Promise<boolean>;
}
```

```ts
// src/core/smartSlice/importParser.ts
import path from 'node:path';

const IMPORT_SPECIFIER_PATTERNS: RegExp[] = [
  /\b(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

export const extractImportSpecifiers = (content: string): string[] => {
  const specifiers = new Set<string>();
  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier?.startsWith('.')) {
        specifiers.add(specifier);
      }
    }
  }
  return [...specifiers];
};

export const toPosixPath = (value: string): string => value.replace(/\\/g, '/');

export const isInsideRoot = (candidateAbs: string, rootAbs: string): boolean => {
  const root = path.resolve(rootAbs);
  const candidate = path.resolve(candidateAbs);
  if (candidate === root) return true;
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate.startsWith(prefix);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/smartSlice/importParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/smartSlice/types.ts src/core/smartSlice/importParser.ts tests/core/smartSlice/importParser.test.ts
git commit -m "feat(smart-slice): Añade extracción heurística de imports relativos"
```

---

### Task 2: Relative specifier resolution

**Files:**
- Modify: `src/core/smartSlice/importParser.ts`
- Test: `tests/core/smartSlice/importParser.test.ts`

**Interfaces:**
- Consumes: `extractImportSpecifiers`, `toPosixPath`, `isInsideRoot`, `SmartSliceFsDeps`.
- Produces:
  - `RESOLVABLE_EXTENSIONS: readonly string[]`
  - `resolveSpecifier(args: { specifier: string; importerPath: string; rootDir: string; fileExists: SmartSliceFsDeps['fileExists'] }): Promise<string | null>`

- [ ] **Step 1: Write the failing test** (append to `importParser.test.ts`)

```ts
import { resolveSpecifier } from '../../../src/core/smartSlice/importParser.js';

describe('resolveSpecifier', () => {
  const rootDir = '/root';
  const importerPath = '/root/src/a.ts';
  const files = new Set(['/root/src/b.ts', '/root/src/dir/index.ts', '/root/src/exact.js']);
  const fileExists = async (p: string) => files.has(p);

  it('resolves an extensionless sibling to .ts', async () => {
    await expect(resolveSpecifier({ specifier: './b', importerPath, rootDir, fileExists })).resolves.toBe('src/b.ts');
  });

  it('resolves a directory to its index file', async () => {
    await expect(resolveSpecifier({ specifier: './dir', importerPath, rootDir, fileExists })).resolves.toBe(
      'src/dir/index.ts',
    );
  });

  it('resolves an exact specifier with extension', async () => {
    await expect(resolveSpecifier({ specifier: './exact.js', importerPath, rootDir, fileExists })).resolves.toBe(
      'src/exact.js',
    );
  });

  it('returns null for missing files', async () => {
    await expect(resolveSpecifier({ specifier: './missing', importerPath, rootDir, fileExists })).resolves.toBeNull();
  });

  it('returns null when the specifier escapes the root', async () => {
    await expect(resolveSpecifier({ specifier: '../../etc/passwd', importerPath, rootDir, fileExists })).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/smartSlice/importParser.test.ts`
Expected: FAIL — `resolveSpecifier` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `importParser.ts`)

```ts
export const RESOLVABLE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.json',
  '.vue',
] as const;

const INDEX_FILES = RESOLVABLE_EXTENSIONS.filter((ext) => ext !== '.json').map((ext) => `index${ext}`);

export interface ResolveSpecifierArgs {
  specifier: string;
  importerPath: string;
  rootDir: string;
  fileExists: (absolutePath: string) => Promise<boolean>;
}

export const resolveSpecifier = async ({
  specifier,
  importerPath,
  rootDir,
  fileExists,
}: ResolveSpecifierArgs): Promise<string | null> => {
  const baseAbsolute = path.resolve(path.dirname(importerPath), specifier);
  if (!isInsideRoot(baseAbsolute, rootDir)) {
    return null;
  }

  const candidates = [baseAbsolute, ...RESOLVABLE_EXTENSIONS.map((ext) => `${baseAbsolute}${ext}`)];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return toPosixPath(path.relative(path.resolve(rootDir), candidate));
    }
  }

  for (const indexFile of INDEX_FILES) {
    const candidate = path.join(baseAbsolute, indexFile);
    if (await fileExists(candidate)) {
      return toPosixPath(path.relative(path.resolve(rootDir), candidate));
    }
  }

  return null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/smartSlice/importParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/smartSlice/importParser.ts tests/core/smartSlice/importParser.test.ts
git commit -m "feat(smart-slice): Resuelve rutas relativas con extensión e índice"
```

---

### Task 3: Cycle-safe BFS dependency graph

**Files:**
- Create: `src/core/smartSlice/dependencyGraph.ts`
- Test: `tests/core/smartSlice/dependencyGraph.test.ts`

**Interfaces:**
- Consumes: `extractImportSpecifiers`, `resolveSpecifier`, `isInsideRoot`, `toPosixPath`, `SmartSliceOptions`, `SmartSliceResult`, `SmartSliceFsDeps`.
- Produces: `buildClosure(options: SmartSliceOptions, deps: SmartSliceFsDeps): Promise<SmartSliceResult>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/smartSlice/dependencyGraph.test.ts
import { describe, expect, it } from 'vitest';
import { buildClosure } from '../../../src/core/smartSlice/dependencyGraph.js';
import { RepomixError } from '../../../src/shared/errorHandle.js';

const graph: Record<string, string> = {
  '/root/src/entry.ts': "import './a';\nimport './b';",
  '/root/src/a.ts': "import './c';",
  '/root/src/b.ts': "import './c';",
  '/root/src/c.ts': "import './a';", // cycle back
};

const deps = {
  readFile: async (p: string) => {
    if (!(p in graph)) throw new Error(`missing ${p}`);
    return graph[p];
  },
  fileExists: async (p: string) => p in graph,
};

describe('buildClosure', () => {
  it('depth 0 includes only the entry', async () => {
    const result = await buildClosure({ rootDir: '/root', entry: 'src/entry.ts', depth: 0 }, deps);
    expect(result.paths).toEqual(['src/entry.ts']);
  });

  it('depth 1 includes direct imports', async () => {
    const result = await buildClosure({ rootDir: '/root', entry: 'src/entry.ts', depth: 1 }, deps);
    expect(result.paths).toEqual(['src/a.ts', 'src/b.ts', 'src/entry.ts']);
  });

  it('depth 2 traverses transitively and survives cycles', async () => {
    const result = await buildClosure({ rootDir: '/root', entry: 'src/entry.ts', depth: 2 }, deps);
    expect(result.paths).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/entry.ts']);
    expect(result.entry).toBe('src/entry.ts');
    expect(result.warnings).toEqual([]);
  });

  it('warns on unresolvable imports', async () => {
    const localDeps = {
      ...deps,
      readFile: async (p: string) => (p === '/root/src/x.ts' ? "import './nope';" : graph[p]),
      fileExists: async (p: string) => p in graph || p === '/root/src/x.ts',
    };
    const result = await buildClosure({ rootDir: '/root', entry: 'src/x.ts', depth: 1 }, localDeps);
    expect(result.paths).toEqual(['src/x.ts']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('./nope');
  });

  it('throws when the entry is missing or escapes the root', async () => {
    await expect(buildClosure({ rootDir: '/root', entry: 'src/missing.ts', depth: 1 }, deps)).rejects.toThrow(
      RepomixError,
    );
    await expect(buildClosure({ rootDir: '/root', entry: '../outside.ts', depth: 1 }, deps)).rejects.toThrow(
      RepomixError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/smartSlice/dependencyGraph.test.ts`
Expected: FAIL — cannot resolve `dependencyGraph.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/smartSlice/dependencyGraph.ts
import path from 'node:path';
import { RepomixError } from '../../shared/errorHandle.js';
import { extractImportSpecifiers, isInsideRoot, resolveSpecifier, toPosixPath } from './importParser.js';
import type { SmartSliceFsDeps, SmartSliceOptions, SmartSliceResult } from './types.js';

interface FrontierNode {
  rel: string;
  depth: number;
}

export const buildClosure = async (
  { rootDir, entry, depth }: SmartSliceOptions,
  deps: SmartSliceFsDeps,
): Promise<SmartSliceResult> => {
  const rootAbs = path.resolve(rootDir);
  const entryAbs = path.resolve(rootAbs, entry);

  if (!isInsideRoot(entryAbs, rootAbs)) {
    throw new RepomixError(`Smart-Slice entry file escapes the target directory: ${entry}`);
  }
  if (!(await deps.fileExists(entryAbs))) {
    throw new RepomixError(`Smart-Slice entry file does not exist: ${entry}`);
  }

  const entryRel = toPosixPath(path.relative(rootAbs, entryAbs));
  const visited = new Set<string>([entryRel]);
  const warnings: string[] = [];
  let frontier: FrontierNode[] = [{ rel: entryRel, depth: 0 }];

  while (frontier.length > 0) {
    const nextFrontier: FrontierNode[] = [];

    for (const node of frontier) {
      if (node.depth >= depth) {
        continue;
      }

      const absolutePath = path.join(rootAbs, node.rel);
      let content: string;
      try {
        content = await deps.readFile(absolutePath);
      } catch {
        warnings.push(`Smart-Slice could not read ${node.rel}`);
        continue;
      }

      for (const specifier of extractImportSpecifiers(content)) {
        const resolved = await resolveSpecifier({
          specifier,
          importerPath: absolutePath,
          rootDir: rootAbs,
          fileExists: deps.fileExists,
        });

        if (resolved === null) {
          warnings.push(`Smart-Slice could not resolve "${specifier}" imported by ${node.rel}`);
          continue;
        }
        if (visited.has(resolved)) {
          continue;
        }

        visited.add(resolved);
        nextFrontier.push({ rel: resolved, depth: node.depth + 1 });
      }
    }

    frontier = nextFrontier;
  }

  return { entry: entryRel, paths: [...visited].sort(), warnings };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/smartSlice/dependencyGraph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/smartSlice/dependencyGraph.ts tests/core/smartSlice/dependencyGraph.test.ts
git commit -m "feat(smart-slice): Añade grafo BFS seguro contra ciclos con profundidad"
```

---

### Task 4: Public API with real filesystem

**Files:**
- Create: `src/core/smartSlice/index.ts`
- Test: `tests/core/smartSlice/smartSlice.test.ts`

**Interfaces:**
- Consumes: `buildClosure`, `SmartSliceOptions`, `SmartSliceResult`.
- Produces:
  - `SMART_SLICE_DEFAULT_DEPTH = 2`
  - `buildSmartSliceClosure(options: SmartSliceOptions): Promise<SmartSliceResult>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/smartSlice/smartSlice.test.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SMART_SLICE_DEFAULT_DEPTH, buildSmartSliceClosure } from '../../../src/core/smartSlice/index.js';

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
  });

  it('exposes a default depth of 2', () => {
    expect(SMART_SLICE_DEFAULT_DEPTH).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/smartSlice/smartSlice.test.ts`
Expected: FAIL — cannot resolve `index.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/smartSlice/index.ts
import fs from 'node:fs/promises';
import { buildClosure } from './dependencyGraph.js';
import type { SmartSliceOptions, SmartSliceResult } from './types.js';

export const SMART_SLICE_DEFAULT_DEPTH = 2;

export const buildSmartSliceClosure = async (options: SmartSliceOptions): Promise<SmartSliceResult> =>
  buildClosure(options, {
    readFile: (absolutePath) => fs.readFile(absolutePath, 'utf8'),
    fileExists: async (absolutePath) => {
      try {
        return (await fs.stat(absolutePath)).isFile();
      } catch {
        return false;
      }
    },
  });

export { buildClosure } from './dependencyGraph.js';
export {
  RESOLVABLE_EXTENSIONS,
  extractImportSpecifiers,
  isInsideRoot,
  resolveSpecifier,
  toPosixPath,
} from './importParser.js';
export type { SmartSliceFsDeps, SmartSliceOptions, SmartSliceResult } from './types.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/smartSlice/smartSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/smartSlice/index.ts tests/core/smartSlice/smartSlice.test.ts
git commit -m "feat(smart-slice): Expone la API pública del cierre de dependencias"
```

---

### Task 5: CLI flags `--smart` and `--smart-depth`

**Files:**
- Modify: `src/cli/types.ts` (add fields, near `stdin` at line 42)
- Modify: `src/cli/cliRun.ts` (File Selection Options group, after `--ignore` at line 161)
- Test: `tests/cli/smartSliceOption.test.ts`

**Interfaces:**
- Consumes: `RepomixError`.
- Produces: `CliOptions.smart?: string`, `CliOptions.smartDepth?: number`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli/smartSliceOption.test.ts
import { Command } from 'commander';
import { describe, expect, it } from 'vitest';

const buildProgram = async () => {
  const { run } = await import('../../src/cli/cliRun.js');
  // run() parses process.argv; instead exercise the option parser via a fresh Command.
  return { run };
};

describe('--smart option parsing', () => {
  it('accepts an entry and a numeric depth', () => {
    const program = new Command();
    program
      .option('--smart <entry>', 'entry')
      .option('--smart-depth <n>', 'depth', (v: string) => {
        if (!/^\d+$/.test(v)) throw new Error('bad');
        return Number(v);
      })
      .exitOverride();
    program.parse(['--smart', 'src/index.ts', '--smart-depth', '1'], { from: 'user' });
    expect(program.opts()).toEqual({ smart: 'src/index.ts', smartDepth: 1 });
  });

  it('rejects a non-numeric depth', () => {
    const program = new Command();
    program
      .option('--smart-depth <n>', 'depth', (v: string) => {
        if (!/^\d+$/.test(v)) throw new Error('bad');
        return Number(v);
      })
      .exitOverride();
    expect(() => program.parse(['--smart-depth', 'abc'], { from: 'user' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/smartSliceOption.test.ts`
Expected: FAIL only if the parser wired to `cliRun` is asserted; this test passes once the production code exists because Commander behavior is standard. Run it as a regression guard after Step 3.

- [ ] **Step 3: Write minimal implementation**

In `src/cli/types.ts`, after `stdin?: boolean;`:

```ts
  smart?: string;
  smartDepth?: number;
```

In `src/cli/cliRun.ts`, after the `--ignore` option (line 161) inside "File Selection Options":

```ts
      .option(
        '--smart <entry>',
        'Pack only the dependency closure of <entry> relative to the target directory (Manteka Smart-Slice)',
      )
      .option('--smart-depth <n>', 'Maximum Smart-Slice dependency depth, 0 = entry only (default: 2)', (v: string) => {
        if (!/^\d+$/.test(v)) {
          throw new RepomixError(`Invalid number for --smart-depth: '${v}'. Must be a non-negative integer.`);
        }
        return Number(v);
      })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/smartSliceOption.test.ts`
Expected: PASS. Also run `node bin/repomix.cjs --help` and confirm both flags appear.

- [ ] **Step 5: Commit**

```bash
git add src/cli/types.ts src/cli/cliRun.ts tests/cli/smartSliceOption.test.ts
git commit -m "feat(smart-slice): Añade los flags CLI --smart y --smart-depth"
```

---

### Task 6: Validate combinations, banner, and compute the closure in defaultAction

**Files:**
- Modify: `src/cli/actions/defaultAction.ts` (imports; before the spinner; `packOptions`)
- Test: `tests/cli/actions/smartSlice.test.ts`

**Interfaces:**
- Consumes: `buildSmartSliceClosure`, `SMART_SLICE_DEFAULT_DEPTH`, `RepomixError`, `logger`, `pc`.
- Produces: `packOptions.smartSlice?: { entry: string; paths: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli/actions/smartSlice.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RepomixError } from '../../../src/shared/errorHandle.js';

const packMock = vi.fn().mockResolvedValue({
  totalFiles: 1,
  totalCharacters: 1,
  totalTokens: 1,
  fileCharCounts: {},
  fileTokenCounts: {},
  gitDiffTokenCount: 0,
  gitLogTokenCount: 0,
  suspiciousFilesResults: [],
  suspiciousGitDiffResults: [],
  suspiciousGitLogResults: [],
  processedFiles: [],
  safeFilePaths: [],
  skippedFiles: [],
});

vi.mock('../../../src/core/packager.js', () => ({ pack: packMock }));
vi.mock('../../../src/cli/cliReport.js', () => ({ reportResults: vi.fn() }));
vi.mock('../../../src/config/configLoad.js', () => ({
  loadFileConfig: vi.fn().mockResolvedValue({}),
  mergeConfigs: vi.fn().mockReturnValue({ output: {}, include: [], ignore: {}, skillGenerate: undefined }),
}));
vi.mock('../../../src/cli/actions/migrationAction.js', () => ({ runMigrationAction: vi.fn() }));

import { runDefaultAction } from '../../../src/cli/actions/defaultAction.js';

describe('runDefaultAction smart-slice', () => {
  beforeEach(() => {
    packMock.mockClear();
  });

  it('rejects --smart with --stdin', async () => {
    await expect(runDefaultAction(['.'], process.cwd(), { smart: 'src/index.ts', stdin: true })).rejects.toThrow(
      RepomixError,
    );
  });

  it('rejects --smart with multiple directories', async () => {
    await expect(runDefaultAction(['a', 'b'], process.cwd(), { smart: 'src/index.ts' })).rejects.toThrow(RepomixError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/actions/smartSlice.test.ts`
Expected: FAIL — Smart-Slice validation not implemented.

- [ ] **Step 3: Write minimal implementation**

Add imports to `src/cli/actions/defaultAction.ts`:

```ts
import pc from 'picocolors';
import { SMART_SLICE_DEFAULT_DEPTH, buildSmartSliceClosure } from '../../core/smartSlice/index.js';
```

After the skill-handling block (after line 129) insert:

```ts
  // Manteka Smart-Slice: restrict packing to the forward dependency closure of
  // the entry file. Computed before the spinner so entry errors surface early.
  let smartSlice: { entry: string; paths: string[] } | undefined;
  if (cliOptions.smart) {
    if (cliOptions.stdin) {
      throw new RepomixError('--smart cannot be used with --stdin.');
    }
    if (directories.length > 1) {
      throw new RepomixError('--smart supports a single target directory.');
    }

    const rootDir = path.resolve(cwd, directories[0] ?? '.');
    const depth = cliOptions.smartDepth ?? SMART_SLICE_DEFAULT_DEPTH;
    const closure = await buildSmartSliceClosure({ rootDir, entry: cliOptions.smart, depth });

    logger.log(pc.dim(`🧠 Manteka Smart-Slice active: tracing dependencies from ${closure.entry} (depth ${depth})`));
    for (const warning of closure.warnings) {
      logger.warn(warning);
    }

    smartSlice = { entry: closure.entry, paths: closure.paths };
  }
```

In the `packOptions` object (around line 157) add:

```ts
      smartSlice,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/actions/smartSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/actions/defaultAction.ts tests/cli/actions/smartSlice.test.ts
git commit -m "feat(smart-slice): Valida el flag, muestra el banner y calcula el cierre"
```

---

### Task 7: Intersect the closure in the packager

**Files:**
- Modify: `src/core/packager.ts` (`PackOptions`, `pack()`)
- Create: `src/core/smartSlice/restrict.ts`
- Test: `tests/core/smartSlice/restrict.test.ts`

**Interfaces:**
- Consumes: `SmartSliceResult`.
- Produces:
  - `PackOptions.smartSlice?: { entry: string; paths: string[] }`
  - `restrictFilePathsToSmartSlice(filePaths: string[], smartSlicePaths: Set<string>): { kept: string[]; skipped: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/smartSlice/restrict.test.ts
import { describe, expect, it } from 'vitest';
import { restrictFilePathsToSmartSlice } from '../../../src/core/smartSlice/restrict.js';

describe('restrictFilePathsToSmartSlice', () => {
  it('keeps only closure paths and reports skipped ones', () => {
    const result = restrictFilePathsToSmartSlice(
      ['src/a.ts', 'src/b.ts', 'other/c.ts'],
      new Set(['src/a.ts', 'src/ignored-by-rules.ts']),
    );
    expect(result.kept).toEqual(['src/a.ts']);
    expect(result.skipped).toEqual(['src/ignored-by-rules.ts']);
  });

  it('preserves the searched order', () => {
    const result = restrictFilePathsToSmartSlice(['src/b.ts', 'src/a.ts'], new Set(['src/a.ts', 'src/b.ts']));
    expect(result.kept).toEqual(['src/b.ts', 'src/a.ts']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/smartSlice/restrict.test.ts`
Expected: FAIL — cannot resolve `restrict.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/smartSlice/restrict.ts
export interface SmartSliceRestriction {
  kept: string[];
  skipped: string[];
}

export const restrictFilePathsToSmartSlice = (
  filePaths: string[],
  smartSlicePaths: Set<string>,
): SmartSliceRestriction => {
  const searched = new Set(filePaths);
  return {
    kept: filePaths.filter((filePath) => smartSlicePaths.has(filePath)),
    skipped: [...smartSlicePaths].filter((filePath) => !searched.has(filePath)).sort(),
  };
};
```

In `src/core/packager.ts`:

Add to imports:

```ts
import { RepomixError } from '../shared/errorHandle.js';
import { restrictFilePathsToSmartSlice } from './smartSlice/restrict.js';
```

Extend `PackOptions`:

```ts
  // Manteka Smart-Slice: when set, only these root-relative paths survive the
  // search phase. Entry is used for the error message only.
  smartSlice?: { entry: string; paths: string[] };
```

Replace the `searchResultsByDir` declaration (lines 104-111) so the restriction is applied per root:

```ts
  progressCallback('Searching for files...');
  const searchedResultsByDir = await withMemoryLogging('Search Files', async () =>
    Promise.all(
      rootDirs.map(async (rootDir) => {
        const result = await deps.searchFiles(rootDir, config, explicitFiles, options.confineToBaseDir);
        return { rootDir, filePaths: result.filePaths, emptyDirPaths: result.emptyDirPaths };
      }),
    ),
  );

  let searchResultsByDir = searchedResultsByDir;
  if (options.smartSlice) {
    const smartSlicePaths = new Set(options.smartSlice.paths);
    let totalKept = 0;
    searchResultsByDir = searchedResultsByDir.map((result) => {
      const { kept, skipped } = restrictFilePathsToSmartSlice(result.filePaths, smartSlicePaths);
      totalKept += kept.length;
      for (const skippedPath of skipped) {
        logger.warn(`Smart-Slice dependency skipped by ignore rules: ${skippedPath}`);
      }
      return { ...result, filePaths: kept };
    });
    if (totalKept === 0) {
      throw new RepomixError(
        `Smart-Slice found no packable files for entry "${options.smartSlice.entry}". Check include/ignore rules.`,
      );
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/smartSlice/restrict.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/packager.ts src/core/smartSlice/restrict.ts tests/core/smartSlice/restrict.test.ts
git commit -m "feat(smart-slice): Intersecta el cierre con los archivos empaquetados"
```

---

### Task 8: End-to-end acceptance on a fixture

**Files:**
- Test: `tests/core/smartSlice/e2e.test.ts`

**Interfaces:**
- Consumes: `pack`, `defaultConfig`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/smartSlice/e2e.test.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../../src/config/configSchema.js';
import { pack } from '../../../src/core/packager.js';
import { buildSmartSliceClosure } from '../../../src/core/smartSlice/index.js';

describe('Smart-Slice end to end', () => {
  let rootDir: string;
  let config: typeof defaultConfig;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-slice-e2e-'));
    await fs.writeFile(path.join(rootDir, 'entry.ts'), "import './used';\n");
    await fs.writeFile(path.join(rootDir, 'used.ts'), 'export const used = 1;\n');
    await fs.writeFile(path.join(rootDir, 'unused.ts'), 'export const unused = 2;\n');
    config = { ...defaultConfig, cwd: rootDir, output: { ...defaultConfig.output, filePath: 'out.txt' } };
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('packs only the closure and ignores unrelated files', async () => {
    const closure = await buildSmartSliceClosure({ rootDir, entry: 'entry.ts', depth: 2 });
    const result = await pack([rootDir], config, () => {}, {}, undefined, {
      smartSlice: { entry: closure.entry, paths: closure.paths },
    });
    const packedPaths = result.processedFiles.map((file) => file.path).sort();
    expect(packedPaths).toEqual(['entry.ts', 'used.ts']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/smartSlice/e2e.test.ts`
Expected: FAIL initially (restriction not yet wired); PASS after Task 7.

- [ ] **Step 3: Minimal implementation**

No production code: Task 7 supplies it. If the test fails after Task 7, inspect `processedFiles[].path` display style and adjust the assertion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/smartSlice/e2e.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/core/smartSlice/e2e.test.ts
git commit -m "test(smart-slice): Verifica de extremo a extremo que solo se empaqueta el cierre"
```

---

## Final validation

- [ ] `npm run lint` → 0 warnings, 0 errors
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → exit 0
- [ ] `npm test` → no new failures vs baseline
- [ ] `node bin/repomix.cjs --smart src/index.ts --smart-depth 1` → banner + restricted output

## Self-Review

- **Spec coverage:** module layout (Tasks 1-4), CLI flags (Task 5), banner/validation/closure (Task 6), intersection (Task 7), tests (Tasks 1-4,7,8), acceptance (Final validation). Out-of-scope items are intentionally absent.
- **Placeholders:** none; all steps carry code or exact commands.
- **Type consistency:** `SmartSliceOptions`/`SmartSliceResult`/`SmartSliceFsDeps` defined in Task 1 and reused verbatim; `resolveSpecifier` signature identical in Tasks 2-3; `PackOptions.smartSlice` shape `{ entry, paths }` consistent in Tasks 6-7.
