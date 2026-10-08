import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  computeFitness,
  measureThermal,
  probeTestSuite,
  spawnPackageManager,
} from '../../src/biomimicry/fitnessEvaluator.js';
import { FITNESS_WEIGHTS } from '../../src/biomimicry/types.js';
import { THERMAL_POLICY_DEFAULTS, type ThermalPolicy, type ThermalRunResult } from '../../src/thermodynamics/types.js';

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
  runPackageManager: vi.fn().mockResolvedValue({ passed: true, reason: null }),
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
      runPackageManager: vi.fn().mockResolvedValue({ passed: false, reason: '1 test failed' }),
    });

    const probe = await probeTestSuite('/repo', 1000, deps);

    expect(probe?.passed).toBe(false);
    expect(probe?.reason).toContain('1 test failed');
  });

  it('labels a killed process as a timeout', async () => {
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({ scripts: { test: 'vitest' } }),
      runPackageManager: vi.fn().mockResolvedValue({ passed: false, reason: 'timed out' }),
    });

    const probe = await probeTestSuite('/repo', 1000, deps);

    expect(probe?.reason).toBe('timed out');
  });

  it('runs npm with the project as its working directory', async () => {
    const runPackageManager = vi.fn().mockResolvedValue({ passed: true, reason: null });
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({ scripts: { test: 'vitest' } }),
      runPackageManager,
    });

    await probeTestSuite('/worktree', 1000, deps);

    expect(runPackageManager).toHaveBeenCalledWith('/worktree', 'npm', ['test'], 1000);
  });

  it('honours the packageManager field', async () => {
    const runPackageManager = vi.fn().mockResolvedValue({ passed: true, reason: null });
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({
        scripts: { test: 'vitest' },
        packageManager: 'pnpm@9.1.0',
      }),
      runPackageManager,
    });

    await probeTestSuite('/worktree', 1000, deps);

    expect(runPackageManager).toHaveBeenCalledWith('/worktree', 'pnpm', ['run', 'test'], 1000);
  });

  it('falls back to npm for an unknown package manager', async () => {
    const runPackageManager = vi.fn().mockResolvedValue({ passed: true, reason: null });
    const deps = buildDeps({
      readManifest: vi.fn().mockResolvedValue({
        scripts: { test: 'vitest' },
        packageManager: 'deno',
      }),
      runPackageManager,
    });

    await probeTestSuite('/worktree', 1000, deps);

    expect(runPackageManager).toHaveBeenCalledWith('/worktree', 'npm', ['test'], 1000);
  });
});

describe('spawnPackageManager (real child process)', () => {
  it('passes when the manager exits zero', async () => {
    const result = await spawnPackageManager(os.tmpdir(), 'npm', ['--version'], 30000);

    expect(result.passed).toBe(true);
    expect(result.reason).toBeNull();
  }, 60000);

  it('fails with a reason when the manager exits non-zero', async () => {
    const result = await spawnPackageManager(os.tmpdir(), 'npm', ['run', 'definitely-not-a-script'], 30000);

    expect(result.passed).toBe(false);
    expect(result.reason).toBeTruthy();
  }, 60000);

  it('labels a killed process as a timeout', async () => {
    const result = await spawnPackageManager(os.tmpdir(), 'node', ['-e', 'setTimeout(() => {}, 30000)'], 1000);

    expect(result.passed).toBe(false);
    expect(result.reason).toBe('timed out');
  }, 60000);
});
