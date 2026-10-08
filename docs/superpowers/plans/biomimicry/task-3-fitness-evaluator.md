> Constraints, file map, execution order and Definition of Done: [README](./README.md).

## Task 3: Fitness evaluator

**Files:**
- Create: `src/biomimicry/fitnessEvaluator.ts`
- Test: `tests/biomimicry/fitnessEvaluator.test.ts`

**Interfaces:**
- Consumes: `runHeatAnalysis` from `src/thermodynamics/heatRun.js`; `FITNESS_WEIGHTS`, `FitnessWeights`, `FitnessInput`, `FitnessBreakdown`, `ThermalPolicy`, `ThermalRunResult` from `./types.js`; `ExecFileLike` from `./mutationSandbox.js`
- Produces:
  - `TestProbe = { passed: boolean; reason: string | null }`
  - `ProbeResult = TestProbe | null` (null means "no test suite available")
  - `FitnessDeps`: `{ runHeatAnalysis, readManifest, execFileAsync }`
  - `defaultFitnessDeps`: the production `FitnessDeps`, spread by the evolution engine
  - `measureThermal(directory, targetFile, thermal, deps): Promise<number | null>`
  - `probeTestSuite(directory, timeoutMs, deps): Promise<ProbeResult>`
  - `computeFitness(baseline: FitnessInput, mutant: FitnessInput, weights?): FitnessBreakdown`

**Design note — the test signal is binary, not a pass *rate*.** Parsing `2046 passed | 24 skipped` is format-fragile across Vitest, Jest, pytest and cargo; one upstream cosmetic change makes fitness silently wrong. Exit code is language-agnostic and cannot lie. The cost is granularity: the signal says *broke*, not *broke by how much*.

- [ ] **Step 1: Create `tests/biomimicry/fitnessEvaluator.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { computeFitness, measureThermal, probeTestSuite } from '../../src/biomimicry/fitnessEvaluator.js';
import { FITNESS_WEIGHTS, type ThermalPolicy } from '../../src/biomimicry/types.js';
import { THERMAL_POLICY_DEFAULTS, type ThermalRunResult } from '../../src/thermodynamics/types.js';

const thermalPolicy: ThermalPolicy = { ...THERMAL_POLICY_DEFAULTS };

const runResult = (files: Array<{ path: string; temperature: number }>): ThermalRunResult =>
  ({
    repoRoot: '/repo',
    isGitRepo: true,
    head: 'abc1234',
    generatedAt: '2026-10-05T00:00:00.000Z',
    policy: thermalPolicy,
    summary: { fileCount: files.length, boilingFiles: 0, maxTemperature: 0, meanTemperature: 0 },
    files,
    boilingFiles: [],
  }) as unknown as ThermalRunResult;

const buildDeps = (overrides = {}) => ({
  runHeatAnalysis: vi.fn().mockResolvedValue(runResult([])),
  readManifest: vi.fn().mockResolvedValue(null),
  execFileAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  ...overrides,
});

describe('computeFitness', () => {
  it('scores a cooled file as a positive thermal axis', () => {
    const breakdown = computeFitness({ temperature: 80, testPassed: null }, { temperature: 78, testPassed: null });

    expect(breakdown.thermalAxis).toBeCloseTo(2);
  });

  it('scores a hotter file as a negative thermal axis', () => {
    const breakdown = computeFitness({ temperature: 40, testPassed: null }, { temperature: 41.5, testPassed: null });

    expect(breakdown.thermalAxis).toBeCloseTo(-1.5);
  });

  it('falls back to thermal-only and flags the signal when tests were not measured', () => {
    const breakdown = computeFitness({ temperature: 80, testPassed: null }, { temperature: 78, testPassed: null });

    expect(breakdown.testAxis).toBeNull();
    expect(breakdown.testSignal).toBe('not-measured');
    expect(breakdown.fitness).toBeCloseTo(2);
  });

  it('downgrades to thermal-only when only one side has a test result', () => {
    const breakdown = computeFitness({ temperature: 80, testPassed: true }, { temperature: 78, testPassed: null });

    expect(breakdown.testSignal).toBe('not-measured');
    expect(breakdown.testAxis).toBeNull();
  });

  it('awards no test axis when baseline and mutant agree', () => {
    const breakdown = computeFitness({ temperature: 80, testPassed: true }, { temperature: 78, testPassed: true });

    expect(breakdown.testAxis).toBe(0);
    expect(breakdown.testSignal).toBe('measured');
    expect(breakdown.fitness).toBeCloseTo(0.6 * 2);
  });

  it('penalises a mutant that breaks a passing suite', () => {
    const breakdown = computeFitness({ temperature: 80, testPassed: true }, { temperature: 78, testPassed: false });

    expect(breakdown.testAxis).toBe(-100);
    expect(breakdown.fitness).toBeCloseTo(0.6 * 2 + 0.4 * -100);
  });

  it('rewards a mutant that fixes a failing suite', () => {
    const breakdown = computeFitness({ temperature: 80, testPassed: false }, { temperature: 78, testPassed: true });

    expect(breakdown.testAxis).toBe(100);
    expect(breakdown.fitness).toBeCloseTo(0.6 * 2 + 40);
  });

  it('honours overridden weights', () => {
    const breakdown = computeFitness(
      { temperature: 100, testPassed: true },
      { temperature: 100, testPassed: false },
      { thermal: 0, test: 1 },
    );

    expect(breakdown.fitness).toBe(-100);
  });

  it('defaults to the documented weights', () => {
    expect(FITNESS_WEIGHTS).toEqual({ thermal: 0.6, test: 0.4 });
  });
});

describe('measureThermal', () => {
  it('returns the temperature of the target file', async () => {
    const deps = buildDeps({
      runHeatAnalysis: vi.fn().mockResolvedValue(runResult([{ path: 'src/a.ts', temperature: 61.5 }])),
    });

    expect(await measureThermal('/repo', 'src/a.ts', thermalPolicy, deps)).toBeCloseTo(61.5);
  });

  it('returns null when the file is absent from the analysis', async () => {
    const deps = buildDeps({
      runHeatAnalysis: vi.fn().mockResolvedValue(runResult([{ path: 'src/other.ts', temperature: 10 }])),
    });

    expect(await measureThermal('/repo', 'src/a.ts', thermalPolicy, deps)).toBeNull();
  });

  it('returns null instead of throwing when the analysis fails', async () => {
    const deps = buildDeps({ runHeatAnalysis: vi.fn().mockRejectedValue(new Error('boom')) });

    expect(await measureThermal('/repo', 'src/a.ts', thermalPolicy, deps)).toBeNull();
  });
});

describe('probeTestSuite', () => {
  it('returns null when the project declares no test script', async () => {
    const deps = buildDeps({ readManifest: vi.fn().mockResolvedValue({ scripts: {} }) });

    expect(await probeTestSuite('/repo', 1000, deps)).toBeNull();
  });

  it('returns null when there is no manifest at all', async () => {
    const deps = buildDeps({ readManifest: vi.fn().mockResolvedValue(null) });

    expect(await probeTestSuite('/repo', 1000, deps)).toBeNull();
  });

  it('passes when the runner exits zero', async () => {
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({ scripts: { test: 'vitest' } }),
    });

    expect(await probeTestSuite('/repo', 1000, deps)).toEqual({ passed: true, reason: null });
  });

  it('reports a failure reason when the runner exits non-zero', async () => {
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({ scripts: { test: 'vitest' } }),
      execFileAsync: vi.fn().mockRejectedValue(new Error('1 test failed')),
    });

    const probe = await probeTestSuite('/repo', 1000, deps);

    expect(probe?.passed).toBe(false);
    expect(probe?.reason).toContain('1 test failed');
  });

  it('labels a killed process as a timeout', async () => {
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({ scripts: { test: 'vitest' } }),
      execFileAsync: vi.fn().mockRejectedValue(Object.assign(new Error('killed'), { killed: true })),
    });

    const probe = await probeTestSuite('/repo', 1000, deps);

    expect(probe?.reason).toBe('timed out');
  });

  it('runs npm with the project as its working directory', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({ scripts: { test: 'vitest' } }),
      execFileAsync,
    });

    await probeTestSuite('/worktree', 1000, deps);

    const [file, args, options] = execFileAsync.mock.calls[0];
    expect(file).toBe('npm');
    expect(args[0]).toBe('test');
    expect(options.cwd).toBe('/worktree');
    expect(options.timeout).toBe(1000);
  });

  it('honours the packageManager field', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({
        scripts: { test: 'vitest' },
        packageManager: 'pnpm@9.1.0',
      }),
      execFileAsync,
    });

    await probeTestSuite('/worktree', 1000, deps);

    expect(execFileAsync.mock.calls[0][0]).toBe('pnpm');
    expect(execFileAsync.mock.calls[0][1]).toEqual(['run', 'test']);
  });
});
```

- [ ] **Step 2: Create `src/biomimicry/fitnessEvaluator.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { runHeatAnalysis } from '../thermodynamics/heatRun.js';
import type { ThermalPolicy, ThermalRunResult } from '../thermodynamics/types.js';
import type { ExecFileLike } from './mutationSandbox.js';
import { FITNESS_WEIGHTS, type FitnessBreakdown, type FitnessInput, type FitnessWeights } from './types.js';

/** Test runners emit far more than execFile's 1 MiB default before failing. */
const MAX_BUFFER = 10 * 1024 * 1024;

export interface TestProbe {
  readonly passed: boolean;
  readonly reason: string | null;
}

/** null means the project exposes no runnable suite, so the axis is skipped. */
export type ProbeResult = TestProbe | null;

export interface ProjectManifest {
  scripts?: { test?: string };
  packageManager?: string;
}

export interface FitnessDeps {
  runHeatAnalysis: (directory: string, policy: ThermalPolicy) => Promise<ThermalRunResult>;
  readManifest: (directory: string) => Promise<ProjectManifest | null>;
  execFileAsync: ExecFileLike;
}

/**
 * Exported so the evolution engine can spread the real implementations instead
 * of re-declaring them. `execFileAsync` deliberately throws: a caller who enables
 * the test axis without wiring a runner must fail loudly rather than score every
 * mutant as broken. The engine overrides it with a real promisified `execFile`.
 */
export const defaultFitnessDeps: FitnessDeps = {
  runHeatAnalysis,
  readManifest: async (directory) => {
    try {
      const raw = await fs.readFile(path.join(directory, 'package.json'), 'utf8');
      return JSON.parse(raw) as ProjectManifest;
    } catch {
      return null;
    }
  },
  execFileAsync: async () => {
    throw new Error('probeTestSuite requires an execFileAsync implementation');
  },
};

export const measureThermal = async (
  directory: string,
  targetFile: string,
  thermal: ThermalPolicy,
  deps: FitnessDeps = defaultFitnessDeps,
): Promise<number | null> => {
  try {
    const analysis = await deps.runHeatAnalysis(directory, thermal);
    const match = analysis.files.find((file) => file.path === targetFile);
    return match ? match.temperature : null;
  } catch {
    // A mutant that cannot be measured is scored as unknown, never as healthy.
    return null;
  }
};

const resolvePackageManager = (declared: string | undefined): string => declared?.split('@')[0] ?? 'npm';

/**
 * Execute the project's own suite via exit code only.
 *
 * Running a suite after writing an automated mutation into its source means
 * executing arbitrary project code on mutated input, which is why the caller
 * gates this behind an explicit opt-in flag.
 */
export const probeTestSuite = async (
  directory: string,
  timeoutMs: number,
  deps: FitnessDeps = defaultFitnessDeps,
): Promise<ProbeResult> => {
  const manifest = await deps.readManifest(directory);
  if (!manifest?.scripts?.test) {
    return null;
  }

  const manager = resolvePackageManager(manifest.packageManager);
  const args = manager === 'npm' ? ['test'] : ['run', 'test'];

  try {
    await deps.execFileAsync(manager, args, { cwd: directory, timeout: timeoutMs, maxBuffer: MAX_BUFFER });
    return { passed: true, reason: null };
  } catch (error) {
    const failure = error as Error & { killed?: boolean };
    return { passed: false, reason: failure.killed ? 'timed out' : failure.message };
  }
};

/**
 * Combine both axes into one score.
 *
 * Both are expressed in points where positive means better, so they combine
 * without a scale factor. A missing test result on either side degrades the
 * whole breakdown to thermal-only and flags it, because a thermal-only score
 * presented as a full one would misrank a mutant that merely skipped the suite.
 * That fallback is deliberately left in raw thermal points and unscaled: with no
 * test signal there is nothing to blend, and `not-measured` travels with it.
 */
export const computeFitness = (
  baseline: FitnessInput,
  mutant: FitnessInput,
  weights: FitnessWeights = FITNESS_WEIGHTS,
): FitnessBreakdown => {
  const thermalAxis = baseline.temperature - mutant.temperature;

  if (baseline.testPassed === null || mutant.testPassed === null) {
    return { thermalAxis, testAxis: null, fitness: thermalAxis, testSignal: 'not-measured' };
  }

  const testAxis = ((mutant.testPassed ? 1 : 0) - (baseline.testPassed ? 1 : 0)) * 100;

  return {
    thermalAxis,
    testAxis,
    fitness: weights.thermal * thermalAxis + weights.test * testAxis,
    testSignal: 'measured',
  };
};
```

**Note on `defaultFitnessDeps`:** it is exported so `evolutionEngine.ts` can build its own defaults from the real `runHeatAnalysis` and manifest reader. `execFileAsync` throws on purpose, so a caller who enables tests without wiring a runner fails loudly instead of silently scoring every mutant as broken.

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/biomimicry/fitnessEvaluator.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 4: Lint and commit**

Run: `npm run lint`
Expected: `Found 0 warnings and 0 errors.`

```bash
git add src/biomimicry/fitnessEvaluator.ts tests/biomimicry/fitnessEvaluator.test.ts
git commit -m "feat(biomimicry): add thermal and test fitness evaluator"
```

---

