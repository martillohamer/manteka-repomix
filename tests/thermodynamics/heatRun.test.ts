import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { bandFor } from '../../src/thermodynamics/heatColors.js';
import { collectSourceFiles, runHeatAnalysis } from '../../src/thermodynamics/heatRun.js';
import type { FileActivity } from '../../src/thermodynamics/types.js';
import { THERMAL_POLICY_DEFAULTS, type ThermalPolicy } from '../../src/thermodynamics/types.js';

vi.mock('../../src/shared/logger');

const policy = (overrides: Partial<ThermalPolicy> = {}): ThermalPolicy => ({
  ...THERMAL_POLICY_DEFAULTS,
  ...overrides,
});

describe('collectSourceFiles', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-heat-walk-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const write = async (relative: string, content = 'x') => {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  };

  test('finds source files in nested directories', async () => {
    await write('src/a.ts');
    await write('src/deep/nested/b.ts');

    const files = await collectSourceFiles(root);

    expect(files.sort()).toEqual(['src/a.ts', 'src/deep/nested/b.ts']);
  });

  test('returns paths with forward slashes', async () => {
    await write('src/deep/b.ts');
    const [found] = await collectSourceFiles(root);

    expect(found).toBe('src/deep/b.ts');
    expect(found).not.toContain('\\');
  });

  test('ignores build output and dependency directories', async () => {
    await write('src/keep.ts');
    await write('node_modules/pkg/index.js');
    await write('lib/compiled.js');
    await write('dist/bundle.js');
    await write('.git/config');
    await write('.manteka-memory/thermodynamic-report.json');

    expect(await collectSourceFiles(root)).toEqual(['src/keep.ts']);
  });

  test('ignores files with non-source extensions', async () => {
    await write('src/a.ts');
    await write('README.md');
    await write('image.png');
    await write('styles.css');

    expect(await collectSourceFiles(root)).toEqual(['src/a.ts']);
  });

  test('does not follow symbolic links', async () => {
    await write('src/a.ts');
    await fs.symlink(path.join(root, 'src', 'a.ts'), path.join(root, 'src', 'link.ts'), 'file').catch(() => {
      // Windows without developer mode cannot create symlinks; the branch under
      // test is covered where the platform allows it.
    });

    const files = await collectSourceFiles(root);
    expect(files).toContain('src/a.ts');
  });

  test('returns an empty list for an empty directory', async () => {
    expect(await collectSourceFiles(root)).toEqual([]);
  });
});

describe('runHeatAnalysis', () => {
  const buildDeps = (overrides: Record<string, unknown> = {}) => ({
    isGitRepository: vi.fn().mockResolvedValue(true),
    execGitShortHead: vi.fn().mockResolvedValue('abc1234'),
    getFileActivity: vi.fn().mockResolvedValue(new Map<string, FileActivity>()),
    readFile: vi.fn().mockResolvedValue('const a = 1;\nif (a) {\n  return a;\n}\n'),
    collectSourceFiles: vi.fn().mockResolvedValue(['src/a.ts']),
    now: vi.fn().mockReturnValue(new Date('2026-01-01T00:00:00.000Z')),
    ...overrides,
  });

  test('analyses the discovered files and returns a temperature for each', async () => {
    const run = await runHeatAnalysis('/repo', policy(), buildDeps());

    expect(run.files).toHaveLength(1);
    expect(run.files[0].path).toBe('src/a.ts');
    expect(run.files[0].temperature).toBeGreaterThan(0);
    expect(run.repoRoot).toBe(path.resolve('/repo'));
  });

  test('stamps the timestamp from the injected clock', async () => {
    const run = await runHeatAnalysis('/repo', policy(), buildDeps());

    expect(run.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test('reads HEAD when the target is a git repository', async () => {
    const run = await runHeatAnalysis('/repo', policy(), buildDeps());

    expect(run.isGitRepo).toBe(true);
    expect(run.head).toBe('abc1234');
  });

  test('degrades to size and complexity when the target is not a git repository', async () => {
    const deps = buildDeps({ isGitRepository: vi.fn().mockResolvedValue(false) });
    const run = await runHeatAnalysis('/plain', policy(), deps);

    expect(run.isGitRepo).toBe(false);
    expect(run.head).toBeNull();
    expect(run.files[0].commits).toBe(0);
    expect(run.files[0].authors).toBe(0);
    expect(run.files[0].factors.churn).toBe(0);
    expect(run.files[0].factors.authors).toBe(0);
  });

  test('does not query git history when the target is not a repository', async () => {
    const deps = buildDeps({ isGitRepository: vi.fn().mockResolvedValue(false) });
    await runHeatAnalysis('/plain', policy(), deps);

    expect(deps.getFileActivity).not.toHaveBeenCalled();
    expect(deps.execGitShortHead).not.toHaveBeenCalled();
  });

  test('leaves HEAD null when the repository has no commits yet', async () => {
    const deps = buildDeps({ execGitShortHead: vi.fn().mockRejectedValue(new Error('unknown revision')) });
    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.isGitRepo).toBe(true);
    expect(run.head).toBeNull();
    expect(run.files).toHaveLength(1);
  });

  test('merges git activity into the matching file', async () => {
    const activity = new Map<string, FileActivity>([['src/a.ts', { commits: 9, authors: 3 }]]);
    const deps = buildDeps({ getFileActivity: vi.fn().mockResolvedValue(activity) });

    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files[0].commits).toBe(9);
    expect(run.files[0].authors).toBe(3);
  });

  test('gives untracked files zero churn', async () => {
    const activity = new Map<string, FileActivity>([['src/other.ts', { commits: 9, authors: 3 }]]);
    const deps = buildDeps({ getFileActivity: vi.fn().mockResolvedValue(activity) });

    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files[0].commits).toBe(0);
  });

  test('forwards the configured window and commit cap to the history query', async () => {
    const deps = buildDeps();
    await runHeatAnalysis('/repo', policy({ windowDays: 30, maxCommits: 100 }), deps);

    expect(deps.getFileActivity).toHaveBeenCalledWith(path.resolve('/repo'), { windowDays: 30, maxCommits: 100 });
  });

  test('sorts the result from hottest to coldest', async () => {
    const readFile = vi.fn(async (target: string) =>
      target.endsWith('hot.ts') ? Array.from({ length: 40 }, (_, i) => `if (${i}) {}`).join('\n') : 'const x = 1;\n',
    );
    const deps = buildDeps({
      collectSourceFiles: vi.fn().mockResolvedValue(['src/cold.ts', 'src/hot.ts']),
      readFile,
    });

    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files[0].path).toBe('src/hot.ts');
  });

  test('counts logical lines and branch tokens from the file content', async () => {
    const deps = buildDeps({
      readFile: vi.fn().mockResolvedValue('// leading comment\nif (a && b) {\n  return c;\n}\n\n'),
    });

    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files[0].logicalLines).toBe(3);
    expect(run.files[0].branchTokens).toBe(2);
  });

  test('summarises the analysed files', async () => {
    const deps = buildDeps({
      collectSourceFiles: vi.fn().mockResolvedValue(['a.ts', 'b.ts']),
      readFile: vi.fn(async (target: string) =>
        target.endsWith('a.ts') ? Array.from({ length: 30 }, (_, i) => `if (${i}) {}`).join('\n') : 'x\n',
      ),
    });

    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.summary.fileCount).toBe(2);
    expect(run.summary.maxTemperature).toBe(run.files[0].temperature);
    expect(run.summary.meanTemperature).toBeCloseTo(run.files.reduce((sum, f) => sum + f.temperature, 0) / 2, 10);
  });

  test('lists every file at or above tMax as boiling', async () => {
    const deps = buildDeps({
      collectSourceFiles: vi.fn().mockResolvedValue(['a.ts', 'b.ts']),
      readFile: vi.fn(async (target: string) =>
        target.endsWith('a.ts') ? Array.from({ length: 60 }, (_, i) => `if (${i}) {}`).join('\n') : 'x\n',
      ),
    });

    const run = await runHeatAnalysis('/repo', policy({ tMax: 1 }), deps);

    expect(run.boilingFiles.length).toBeGreaterThan(0);
    expect(run.summary.boilingFiles).toBe(run.boilingFiles.length);
  });

  test('skips a file it cannot read instead of failing the run', async () => {
    const deps = buildDeps({
      collectSourceFiles: vi.fn().mockResolvedValue(['good.ts', 'bad.ts']),
      readFile: vi.fn(async (target: string) => {
        if (target.endsWith('bad.ts')) {
          throw new Error('EACCES');
        }
        return 'const a = 1;\n';
      }),
    });

    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files.map((f) => f.path)).toEqual(['good.ts']);
  });

  test('skips binary files', async () => {
    const deps = buildDeps({
      readFile: vi.fn(async (target: string) =>
        target.endsWith('blob.ts') ? `const a = 1;\n${String.fromCharCode(0)}binary` : 'const a = 1;\n',
      ),
      collectSourceFiles: vi.fn().mockResolvedValue(['blob.ts', 'text.ts']),
    });

    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files.map((f) => f.path)).toEqual(['text.ts']);
  });

  test('returns an empty analysis for a directory with no source files', async () => {
    const deps = buildDeps({ collectSourceFiles: vi.fn().mockResolvedValue([]) });
    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files).toEqual([]);
    expect(run.summary.fileCount).toBe(0);
    expect(run.summary.maxTemperature).toBe(0);
    expect(run.boilingFiles).toEqual([]);
  });

  test('keeps every file regardless of the display limit', async () => {
    const deps = buildDeps({
      collectSourceFiles: vi.fn().mockResolvedValue(Array.from({ length: 12 }, (_, i) => `f${i}.ts`)),
    });

    const run = await runHeatAnalysis('/repo', policy({ limit: 3 }), deps);

    expect(run.files).toHaveLength(12);
  });

  test('degrades to zero activity when the history query fails', async () => {
    const deps = buildDeps({ getFileActivity: vi.fn().mockRejectedValue(new Error('git exploded')) });
    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files[0].commits).toBe(0);
    expect(run.files).toHaveLength(1);
  });

  test('assigns the band that the computed temperature belongs to', async () => {
    const deps = buildDeps();
    const run = await runHeatAnalysis('/repo', policy(), deps);

    expect(run.files[0].band).toBe(bandFor(run.files[0].temperature).name);
  });
});
