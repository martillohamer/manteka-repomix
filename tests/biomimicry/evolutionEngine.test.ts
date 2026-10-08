import { describe, expect, it, vi } from 'vitest';
import {
  buildCandidates,
  type EvolutionDeps,
  mapWithConcurrency,
  runEvolution,
} from '../../src/biomimicry/evolutionEngine.js';
import { emptyLineage } from '../../src/biomimicry/lineageStore.js';
import type { MutationSandbox } from '../../src/biomimicry/mutationSandbox.js';
import { EVOLUTION_POLICY_DEFAULTS, type EvolutionPolicy } from '../../src/biomimicry/types.js';
import { THERMAL_POLICY_DEFAULTS, type ThermalRunResult } from '../../src/thermodynamics/types.js';

vi.mock('../../src/shared/logger');

const policy = (overrides: Partial<EvolutionPolicy> = {}): EvolutionPolicy => ({
  ...EVOLUTION_POLICY_DEFAULTS,
  thermal: { ...THERMAL_POLICY_DEFAULTS },
  ...overrides,
});

const thermalResult = (
  temperatures: Record<string, number>,
  tMax: number = THERMAL_POLICY_DEFAULTS.tMax,
): ThermalRunResult => {
  const files = Object.entries(temperatures).map(([filePath, temperature]) => ({
    path: filePath,
    temperature,
    commits: 1,
    authors: 1,
    lines: 10,
    logicalLines: 10,
    branchTokens: 0,
    complexityDensity: 1,
    factors: { churn: 0, authors: 0, size: 0, complexity: 0 },
    band: 'Frío',
  }));
  const boiling = files.filter((file) => file.temperature >= tMax);
  return {
    repoRoot: '/repo',
    isGitRepo: true,
    head: 'abc1234',
    generatedAt: '2026-10-05T00:00:00.000Z',
    policy: { ...THERMAL_POLICY_DEFAULTS },
    summary: {
      fileCount: files.length,
      boilingFiles: boiling.length,
      maxTemperature: Math.max(0, ...Object.values(temperatures)),
      meanTemperature: 0,
    },
    files,
    boilingFiles: boiling,
  } as unknown as ThermalRunResult;
};

const fakeSandbox = (overrides: Partial<MutationSandbox> = {}): MutationSandbox => ({
  runDir: '/tmp/biomimicry/run',
  worktreePath: (id) => `/tmp/biomimicry/run/${id}`,
  // Derive the path from the id, as the real sandbox does: tests key their
  // fixtures off the worktree path, and a constant path would hide that.
  createWorktree: vi.fn(async (id: string) => `/tmp/biomimicry/run/${id}`),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const buildDeps = (overrides: Partial<EvolutionDeps> = {}): EvolutionDeps => ({
  isGitRepository: vi.fn().mockResolvedValue(true),
  execGitShortHead: vi.fn().mockResolvedValue('abc1234'),
  runHeatAnalysis: vi.fn().mockResolvedValue(thermalResult({ 'src/hot.ts': 80, 'src/warm.ts': 60 })),
  probeTestSuite: vi.fn().mockResolvedValue(null),
  readManifest: vi.fn().mockResolvedValue(null),
  runPackageManager: vi.fn().mockResolvedValue({ passed: true, reason: null }),
  createSandbox: vi.fn().mockReturnValue(fakeSandbox()),
  applyMutation: vi.fn().mockReturnValue({ content: 'mutated\n', line: 1, changed: true }),
  readFile: vi.fn().mockResolvedValue('original\n'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  loadLineage: vi.fn().mockResolvedValue(emptyLineage()),
  saveLineage: vi.fn().mockResolvedValue(undefined),
  now: () => new Date('2026-10-05T00:00:00.000Z'),
  ...overrides,
});

describe('mapWithConcurrency', () => {
  it('preserves input order in the results', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);

    expect(results).toEqual([10, 20, 30, 40]);
  });

  it('never exceeds the requested parallelism', async () => {
    let active = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });

    expect(peak).toBeLessThanOrEqual(2);
  });

  it('handles an empty input list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  it('handles a limit larger than the input list', async () => {
    expect(await mapWithConcurrency([1, 2], 99, async (n) => n)).toEqual([1, 2]);
  });
});

describe('buildCandidates', () => {
  it('produces the deterministic cross product in file-major order', () => {
    const candidates = buildCandidates(['b.ts', 'a.ts'], ['comment-noise', 'dead-guard'], 10);

    expect(candidates.map((c) => `${c.targetFile}:${c.operator}`)).toEqual([
      'b.ts:comment-noise',
      'b.ts:dead-guard',
      'a.ts:comment-noise',
      'a.ts:dead-guard',
    ]);
  });

  it('truncates to the population without duplicating work', () => {
    const candidates = buildCandidates(['a.ts', 'b.ts'], ['comment-noise', 'dead-guard'], 3);

    expect(candidates).toHaveLength(3);
  });

  it('is stable across calls', () => {
    expect(buildCandidates(['a.ts'], ['dead-guard'], 5)).toEqual(buildCandidates(['a.ts'], ['dead-guard'], 5));
  });
});

describe('runEvolution preconditions', () => {
  it('rejects a directory that is not a Git repository', async () => {
    const deps = buildDeps({ isGitRepository: vi.fn().mockResolvedValue(false) });

    await expect(runEvolution('/nope', policy(), deps)).rejects.toThrow(/Git repository/);
  });

  it('rejects a repository with no commits', async () => {
    const deps = buildDeps({ execGitShortHead: vi.fn().mockRejectedValue(new Error('no HEAD')) });

    await expect(runEvolution('/repo', policy(), deps)).rejects.toThrow(/no commits/i);
  });
});

describe('runEvolution pipeline', () => {
  it('records the full state trail', async () => {
    const report = await runEvolution('/repo', policy({ population: 1 }), buildDeps());

    expect(report.states).toEqual(['scoping', 'baselining', 'branching', 'evaluating', 'reporting', 'done']);
  });

  it('always disposes the sandbox', async () => {
    const sandbox = fakeSandbox();
    const deps = buildDeps({ createSandbox: vi.fn().mockReturnValue(sandbox) });

    await runEvolution('/repo', policy({ population: 1 }), deps);

    expect(sandbox.dispose).toHaveBeenCalled();
  });

  it('rejects before allocating a sandbox when the baseline test probe explodes', async () => {
    const sandbox = fakeSandbox();
    const createSandbox = vi.fn().mockReturnValue(sandbox);
    const deps = buildDeps({
      createSandbox,
      probeTestSuite: vi.fn().mockRejectedValue(new Error('npm not found')),
    });

    await expect(runEvolution('/repo', policy({ population: 1, testEnabled: true }), deps)).rejects.toThrow(
      /baseline test probe/i,
    );
    // The probe is a precondition, so it runs before any worktree directory or
    // exit hook exists: there is nothing to dispose, and nothing was allocated.
    expect(createSandbox).not.toHaveBeenCalled();
    expect(sandbox.dispose).not.toHaveBeenCalled();
  });

  it('produces a successful empty report when nothing is boiling', async () => {
    const deps = buildDeps({ runHeatAnalysis: vi.fn().mockResolvedValue(thermalResult({ 'src/cool.ts': 5 })) });

    const report = await runEvolution('/repo', policy(), deps);

    expect(report.summary.total).toBe(0);
    expect(report.summary.viable).toBe(0);
    expect(report.summary.best).toBeNull();
    expect(report.mutants).toEqual([]);
  });

  it('reports a not-measured signal when tests are disabled', async () => {
    const report = await runEvolution('/repo', policy({ population: 1 }), buildDeps());

    expect(report.testSignal).toBe('not-measured');
    expect(report.baseline.testPassed).toBeNull();
  });

  it('skips the test probe entirely when tests are disabled', async () => {
    const probeTestSuite = vi.fn().mockResolvedValue(null);
    await runEvolution('/repo', policy({ population: 2 }), buildDeps({ probeTestSuite }));

    expect(probeTestSuite).not.toHaveBeenCalled();
  });

  it('probes the baseline and each mutant when tests are enabled', async () => {
    const probeTestSuite = vi.fn().mockResolvedValue({ passed: true, reason: null });
    await runEvolution('/repo', policy({ population: 2, testEnabled: true }), buildDeps({ probeTestSuite }));

    expect(probeTestSuite).toHaveBeenCalled();
  });

  it('ranks the least harmful mutant first', async () => {
    // Keyed on the worktree path, not on call order: with concurrency 2 the
    // two probes interleave, so a sequential mock would make this flaky.
    const deps = buildDeps({
      runHeatAnalysis: vi.fn(async (directory: string) =>
        thermalResult({
          'src/hot.ts': directory === '/repo' ? 80 : directory.includes('comment-noise') ? 81 : 84,
        }),
      ),
    });

    const report = await runEvolution(
      '/repo',
      policy({ population: 2, operators: ['comment-noise', 'dead-guard'] }),
      deps,
    );

    expect(report.mutants[0].operator).toBe('comment-noise');
    expect(report.summary.best).toBe(report.mutants[0].id);
  });

  it('honours an explicit target list instead of the boiling set', async () => {
    // The mock decides what boils, not policy.thermal: tMax 0 here makes both
    // files boiling, so the requested list alone can explain why only one file
    // produced mutants.
    const deps = buildDeps({
      runHeatAnalysis: vi.fn().mockResolvedValue(thermalResult({ 'src/hot.ts': 80, 'src/warm.ts': 60 }, 0)),
    });

    const report = await runEvolution('/repo', policy({ population: 3, targets: ['src/warm.ts'] }), deps);

    expect(report.mutants).toHaveLength(3);
    expect(report.mutants.every((m) => m.targetFile === 'src/warm.ts')).toBe(true);
  });
});

describe('runEvolution failure containment', () => {
  it('records a mutant whose worktree could not be created as non-viable', async () => {
    const sandbox = fakeSandbox({
      createWorktree: vi.fn().mockRejectedValue(new Error('worktree add failed')),
    });
    const deps = buildDeps({ createSandbox: vi.fn().mockReturnValue(sandbox) });

    const report = await runEvolution('/repo', policy({ population: 1 }), deps);

    expect(report.mutants[0].viable).toBe(false);
    expect(report.mutants[0].failure).toContain('worktree add failed');
    expect(report.summary.viable).toBe(0);
  });

  it('records a mutant whose operator found no eligible line as not applied', async () => {
    const deps = buildDeps({
      applyMutation: vi.fn().mockReturnValue({ content: 'original\n', line: null, changed: false }),
    });

    const report = await runEvolution('/repo', policy({ population: 1 }), deps);

    expect(report.mutants[0].applied).toBe(false);
    expect(report.mutants[0].viable).toBe(false);
    expect(report.mutants[0].failure).toMatch(/no eligible line/i);
  });

  it('never lets one mutant abort the rest of the run', async () => {
    let call = 0;
    const createWorktree = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        throw new Error('transient failure');
      }
      return '/tmp/biomimicry/run/mutant';
    });
    const sandbox = fakeSandbox({ createWorktree });
    const deps = buildDeps({ createSandbox: vi.fn().mockReturnValue(sandbox) });

    const report = await runEvolution('/repo', policy({ population: 2 }), deps);

    expect(report.summary.total).toBe(2);
    expect(report.summary.viable).toBe(1);
  });
});
