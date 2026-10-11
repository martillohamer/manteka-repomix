import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ChokidarOptions, FSWatcher } from 'chokidar';
import type { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import type { LineageEntry } from '../../src/biomimicry/lineageStore.js';
import type { EvolutionReport, MutantResult } from '../../src/biomimicry/types.js';
import { EVOLUTION_POLICY_DEFAULTS } from '../../src/biomimicry/types.js';
import { formatStatus, gatherStatus, type StatusDeps } from '../../src/cli/commands/statusCommand.js';
import { createMantekaProgram } from '../../src/cli/index.js';
import { createWatchIgnore, formatWatchCycleReport, startEvolutionWatcher } from '../../src/cli/watcher.js';

// vi.mock('../../src/shared/logger') removed - causing module caching issues

// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------

const buildProgram = (): Command => {
  const program = createMantekaProgram();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  return program;
};

const subcommand = (program: Command, name: string): Command => {
  const command = program.commands.find((candidate) => candidate.name() === name);
  if (!command) {
    throw new Error(`${name} subcommand was not registered`);
  }
  return command;
};

describe('manteka command parsing', () => {
  it('exposes the evolve, status and watch commands', () => {
    const commandNames = buildProgram().commands.map((command) => command.name());
    // Verificar que todos los comandos esperados estén registrados
    expect(commandNames).toContain('evolve');
    expect(commandNames).toContain('status');
    expect(commandNames).toContain('watch');
    expect(commandNames).toContain('dashboard');
    expect(commandNames).toContain('serve');
    expect(commandNames).toContain('doctor');
    expect(commandNames).toContain('version');
    // También verificar que no haya comandos inesperados (mínimo 7)
    expect(commandNames.length).toBeGreaterThanOrEqual(7);
  });

  it('routes manteka evolve with its documented options', async () => {
    const program = buildProgram();
    let captured: { population?: number; json?: boolean } = {};
    subcommand(program, 'evolve').action((_directory: string, options: { population?: number; json?: boolean }) => {
      captured = options;
    });

    await program.parseAsync(['node', 'manteka', 'evolve', 'some/repo', '--population', '2', '--json']);

    expect(captured).toMatchObject({ population: 2, json: true });
  });

  it('defaults the status directory to the current directory', async () => {
    const program = buildProgram();
    let directory: string | undefined;
    subcommand(program, 'status').action((value: string) => {
      directory = value;
    });

    await program.parseAsync(['node', 'manteka', 'status']);
    expect(directory).toBe('.');

    await program.parseAsync(['node', 'manteka', 'status', 'other/repo']);
    expect(directory).toBe('other/repo');
  });

  it('parses manteka watch options with their documented defaults', async () => {
    const program = buildProgram();
    let directory = '';
    let captured: { debounce?: number; population?: number } = {};
    subcommand(program, 'watch').action((value: string, options: { debounce?: number; population?: number }) => {
      directory = value;
      captured = options;
    });

    await program.parseAsync(['node', 'manteka', 'watch']);
    expect(directory).toBe('.');
    expect(captured).toMatchObject({ debounce: 300, population: 5 });

    await program.parseAsync(['node', 'manteka', 'watch', 'pkg', '--debounce', '50', '--population', '3']);
    expect(directory).toBe('pkg');
    expect(captured).toMatchObject({ debounce: 50, population: 3 });
  });

  it('rejects a negative debounce', async () => {
    const program = buildProgram();
    subcommand(program, 'watch').action(() => {});

    await expect(program.parseAsync(['node', 'manteka', 'watch', '--debounce', '-1'])).rejects.toThrow(/non-negative/i);
  });

  it('rejects a zero population', async () => {
    const program = buildProgram();
    subcommand(program, 'watch').action(() => {});

    await expect(program.parseAsync(['node', 'manteka', 'watch', '--population', '0'])).rejects.toThrow(/positive/i);
  });

  it('rejects an unknown subcommand', async () => {
    await expect(buildProgram().parseAsync(['node', 'manteka', 'frobnicate'])).rejects.toThrow(/unknown command/i);
  });
});

// ---------------------------------------------------------------------------
// Watcher ignore rules
// ---------------------------------------------------------------------------

describe('createWatchIgnore', () => {
  const root = path.resolve('repo-under-watch');
  const ignore = createWatchIgnore(root);

  it('watches source files', () => {
    expect(ignore(path.join(root, 'src', 'app.ts'))).toBe(false);
    expect(ignore(path.join(root, 'index.js'))).toBe(false);
  });

  it('prunes dependency, VCS and build trees', () => {
    expect(ignore(path.join(root, 'node_modules', 'pkg', 'index.ts'))).toBe(true);
    expect(ignore(path.join(root, '.git', 'hooks', 'pre-commit.ts'))).toBe(true);
    expect(ignore(path.join(root, 'dist', 'app.js'))).toBe(true);
    expect(ignore(path.join(root, 'coverage', 'lcov-report.ts'))).toBe(true);
  });

  it('skips non-source artefacts such as the lineage store', () => {
    expect(ignore(path.join(root, '.manteka-lineage.json'))).toBe(true);
    expect(ignore(path.join(root, 'README.md'))).toBe(true);
  });

  it('never filters directories, so chokidar can descend', () => {
    expect(ignore(path.join(root, 'src'))).toBe(false);
    expect(ignore(path.join(root, 'dist'), { isDirectory: () => true })).toBe(true);
  });

  it('never excludes the watched root itself', () => {
    expect(ignore(root)).toBe(false);
    expect(createWatchIgnore(path.join(root, 'build', 'app'))(path.join(root, 'build', 'app'))).toBe(false);
    expect(createWatchIgnore(path.join(root, 'build', 'app'))(path.join(root, 'build', 'app', 'src', 'a.ts'))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Watcher cycle scheduling
// ---------------------------------------------------------------------------

type Listener = (payload?: unknown) => void;

const createFakeWatcher = () => {
  const listeners = new Map<string, Set<Listener>>();
  const watcher = {
    on(event: string, listener: Listener) {
      const bucket = listeners.get(event) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(event, bucket);
      return watcher;
    },
    emit(event: string, payload?: unknown) {
      for (const listener of listeners.get(event) ?? []) {
        listener(payload);
      }
    },
    close: vi.fn(async () => {}),
  };
  return watcher;
};

const mutant = (overrides: Partial<MutantResult> = {}): MutantResult => ({
  id: 'src/hot.ts::comment-reducer',
  targetFile: 'src/hot.ts',
  operator: 'comment-reducer',
  applied: true,
  mutationLine: 3,
  temperatureBefore: 100,
  temperatureAfter: 88,
  thermalAxis: 12,
  testPassed: null,
  testAxis: null,
  fitness: 7.2,
  viable: true,
  failure: null,
  ...overrides,
});

const reportWith = (mutants: MutantResult[]): EvolutionReport => ({
  schemaVersion: 1,
  generatedAt: '2026-10-06T00:00:00.000Z',
  repo: { root: '/repo', head: 'abc1234', runDir: '/tmp/run' },
  policy: EVOLUTION_POLICY_DEFAULTS,
  testSignal: 'not-measured',
  baseline: { temperature: {}, testPassed: null },
  mutants,
  summary: {
    total: mutants.length,
    viable: mutants.filter((entry) => entry.viable).length,
    best: mutants[0]?.id ?? null,
    worst: null,
  },
  states: ['scoping', 'baselining', 'branching', 'evaluating', 'reporting', 'done'],
});

const startWithFakeWatcher = async (
  overrides: Partial<Parameters<typeof startEvolutionWatcher>[0]> = {},
): Promise<{
  fake: ReturnType<typeof createFakeWatcher>;
  settle: () => Promise<void>;
  close: () => Promise<void>;
}> => {
  const fake = createFakeWatcher();
  const handle = await startEvolutionWatcher({
    root: path.resolve('repo-under-watch'),
    debounceMs: 5,
    runCycle: async () => reportWith([mutant()]),
    onReport: () => {},
    onError: () => {},
    watch: (() => fake) as unknown as (paths: string | string[], options?: ChokidarOptions) => FSWatcher,
    ...overrides,
  });
  return { fake, settle: handle.settle, close: handle.close };
};

describe('Manteka Watcher scheduling', () => {
  it('debounces a burst of saves into a single evolution cycle', async () => {
    const runCycle = vi.fn(async () => reportWith([mutant()]));
    const { fake, settle, close } = await startWithFakeWatcher({ runCycle });

    fake.emit('change', '/repo/src/a.ts');
    fake.emit('change', '/repo/src/b.ts');
    fake.emit('add', '/repo/src/c.ts');
    await settle();

    expect(runCycle).toHaveBeenCalledTimes(1);
    await close();
  });

  it('never runs two cycles concurrently and queues exactly one follow-up', async () => {
    let releaseFirst: (report: EvolutionReport) => void = () => {};
    const firstCycle = new Promise<EvolutionReport>((resolve) => {
      releaseFirst = resolve;
    });
    let active = 0;
    let peak = 0;
    const runCycle = vi
      .fn<(root: string) => Promise<EvolutionReport>>()
      .mockImplementationOnce(() => firstCycle)
      .mockImplementation(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return reportWith([mutant()]);
      });

    const { fake, settle, close } = await startWithFakeWatcher({ runCycle });

    fake.emit('change', '/repo/src/a.ts');
    const settled = settle();
    // Saves arriving while the first cycle is still running must coalesce into
    // a single queued follow-up rather than a concurrent second run.
    fake.emit('change', '/repo/src/b.ts');
    fake.emit('change', '/repo/src/c.ts');
    await new Promise((resolve) => setTimeout(resolve, 20));

    releaseFirst(reportWith([mutant()]));
    await settled;

    expect(runCycle).toHaveBeenCalledTimes(2);
    expect(peak).toBe(1);
    await close();
  });

  it('ignores saves outside the source tree', async () => {
    const runCycle = vi.fn(async () => reportWith([mutant()]));
    const { fake, settle, close } = await startWithFakeWatcher({ runCycle });

    fake.emit('change', path.join(path.resolve('repo-under-watch'), 'node_modules', 'pkg', 'index.ts'));
    fake.emit('change', path.join(path.resolve('repo-under-watch'), '.manteka-lineage.json'));
    fake.emit('change', path.join(path.resolve('repo-under-watch'), 'README.md'));
    await settle();

    expect(runCycle).not.toHaveBeenCalled();
    await close();
  });

  it('keeps watching after a failed cycle', async () => {
    const runCycle = vi
      .fn<(root: string) => Promise<EvolutionReport>>()
      .mockRejectedValueOnce(new Error('repo exploded'))
      .mockResolvedValue(reportWith([mutant()]));
    const onError = vi.fn();
    const { fake, settle, close } = await startWithFakeWatcher({ runCycle, onError });

    fake.emit('change', '/repo/src/a.ts');
    await settle();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('repo exploded'));

    fake.emit('change', '/repo/src/a.ts');
    await settle();
    expect(runCycle).toHaveBeenCalledTimes(2);
    await close();
  });

  it('reports a cooling win with the signature line', async () => {
    const onReport = vi.fn();
    const { fake, settle, close } = await startWithFakeWatcher({ onReport });

    fake.emit('change', '/repo/src/hot.ts');
    await settle();

    expect(onReport).toHaveBeenCalledTimes(1);
    const line = onReport.mock.calls[0][0] as string;
    expect(line).toContain('🧬');
    expect(line).toContain('ΔT: +12.0%');
    expect(line).toContain('Operador: comment-reducer');
    await close();
  });

  it('stops scheduling cycles after close', async () => {
    const runCycle = vi.fn(async () => reportWith([mutant()]));
    const { fake, settle, close } = await startWithFakeWatcher({ runCycle });

    fake.emit('change', '/repo/src/a.ts');
    await close();
    await settle();

    expect(runCycle).not.toHaveBeenCalled();
  });
});

describe('formatWatchCycleReport', () => {
  it('renders the success headline for a cooling mutant', () => {
    const line = formatWatchCycleReport(reportWith([mutant({ thermalAxis: 12, temperatureBefore: 100 })]));

    expect(line).toContain('Mutación térmica aplicada con éxito');
    expect(line).toContain('ΔT: +12.0%');
    expect(line).toContain('Operador: comment-reducer');
  });

  it('renders a dim verdict when no mutant is viable', () => {
    expect(formatWatchCycleReport(reportWith([]))).toContain('Sin mutaciones viables');
    expect(formatWatchCycleReport(reportWith([mutant({ thermalAxis: -8, viable: true })]))).toContain(
      'Ciclo sin enfriamiento',
    );
  });
});

// ---------------------------------------------------------------------------
// Status command
// ---------------------------------------------------------------------------

const lineageEntry = (overrides: Partial<LineageEntry> = {}): LineageEntry => ({
  operator: 'comment-reducer',
  targetFile: 'src/hot.ts',
  thermalAxis: 4,
  fitness: 2.4,
  recordedAt: '2026-10-06T00:00:00.000Z',
  ...overrides,
});

const statusDeps = (overrides: Partial<StatusDeps> = {}): StatusDeps => ({
  isGitRepository: async () => true,
  execGitShortHead: async () => 'abc1234',
  loadLineage: async () => ({ schemaVersion: 1, entries: [] }),
  readLaws: async () => null,
  ...overrides,
});

describe('manteka status', () => {
  it('aggregates guardian, lineage and epigenetic weights', async () => {
    const deps = statusDeps({
      loadLineage: async () => ({
        schemaVersion: 1,
        entries: [lineageEntry(), lineageEntry(), lineageEntry({ operator: 'dead-guard', thermalAxis: 9 })],
      }),
      readLaws: async () =>
        [
          '- id: no-console',
          '  description: "no logging"',
          '  disallowedNode: CallExpression',
          '  expression: console.log',
        ].join('\n'),
    });

    const status = await gatherStatus(path.resolve('anywhere'), deps);

    expect(status.head).toBe('abc1234');
    expect(status.lawsPresent).toBe(true);
    expect(status.lawCount).toBe(1);
    expect(status.lineageWins).toBe(3);
    expect(status.operatorWeights['comment-reducer']).toBeGreaterThan(status.operatorWeights['dead-guard'] ?? 0);
    expect(Object.values(status.operatorWeights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);

    const panel = formatStatus(status);
    expect(panel).toContain('Manteka Status');
    expect(panel).toContain('● active');
    expect(panel).toContain('3 recorded wins');
    expect(panel).toContain('Epigenetic weights');
    expect(panel).toContain('comment-reducer');
  });

  it('reports a cold start with an inactive guardian', async () => {
    const deps = statusDeps({
      isGitRepository: async () => false,
      execGitShortHead: async () => {
        throw new Error('no HEAD');
      },
    });

    const status = await gatherStatus(path.resolve('anywhere'), deps);

    expect(status.head).toBeNull();
    expect(status.lawsPresent).toBe(false);
    expect(status.lineageWins).toBe(0);

    const panel = formatStatus(status);
    expect(panel).toContain('○ inactive');
    expect(panel).toContain('cold start');
    expect(panel).not.toContain('Epigenetic weights');
  });

  it('inspects a real directory with default dependencies', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-status-'));
    try {
      const cold = await gatherStatus(directory);
      expect(cold.head).toBeNull();
      expect(cold.lawsPresent).toBe(false);
      expect(cold.lineageWins).toBe(0);

      await fs.writeFile(
        path.join(directory, '.manteka-lineage.json'),
        JSON.stringify({ schemaVersion: 1, entries: [lineageEntry()] }),
        'utf8',
      );
      const warm = await gatherStatus(directory);
      expect(warm.lineageWins).toBe(1);
      expect(formatStatus(warm)).toContain('1 recorded win');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
