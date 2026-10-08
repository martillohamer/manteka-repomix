import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runHeatAnalysis } from '../thermodynamics/heatRun.js';
import type { ThermalPolicy, ThermalRunResult } from '../thermodynamics/types.js';
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

export interface PackageManagerRunResult {
  readonly passed: boolean;
  readonly reason: string | null;
}

export type RunPackageManager = (
  directory: string,
  manager: string,
  args: string[],
  timeoutMs: number,
) => Promise<PackageManagerRunResult>;

export interface FitnessDeps {
  runHeatAnalysis: (directory: string, policy: ThermalPolicy) => Promise<ThermalRunResult>;
  readManifest: (directory: string) => Promise<ProjectManifest | null>;
  runPackageManager: RunPackageManager;
}

const PACKAGE_MANAGERS: readonly string[] = ['npm', 'pnpm', 'yarn', 'bun'];

/**
 * npm, pnpm and yarn ship as `.cmd` batch shims on Windows. `CreateProcess`
 * cannot run a batch file directly, so `spawn('npm.cmd')` throws EINVAL and
 * `spawn('npm')` throws ENOENT. Routing the shim through `cmd.exe /c` executes
 * it without a shell option, which keeps argument handling free of injection.
 */
const WINDOWS_BATCH_MANAGERS: ReadonlySet<string> = new Set(['npm', 'pnpm', 'yarn']);

const resolveManager = (declared: string | undefined): string => {
  const name = declared?.split('@')[0] ?? 'npm';
  return PACKAGE_MANAGERS.includes(name) ? name : 'npm';
};

export const spawnPackageManager = (
  directory: string,
  manager: string,
  args: string[],
  timeoutMs: number,
): Promise<PackageManagerRunResult> => {
  const isWindows = process.platform === 'win32';
  const executable = isWindows && WINDOWS_BATCH_MANAGERS.has(manager) ? `${manager}.cmd` : manager;
  const file = isWindows ? process.env.ComSpec || 'cmd.exe' : executable;
  const commandArgs = isWindows ? ['/d', '/s', '/c', executable, ...args] : args;

  return new Promise((resolve) => {
    const child = spawn(file, commandArgs, {
      cwd: directory,
      timeout: timeoutMs,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > MAX_BUFFER) {
        stderr = stderr.slice(-MAX_BUFFER);
      }
    });

    child.on('error', (error) => {
      resolve({ passed: false, reason: error.message });
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve({ passed: true, reason: null });
        return;
      }
      if (signal === 'SIGTERM') {
        resolve({ passed: false, reason: 'timed out' });
        return;
      }
      const detail = stderr.trim().slice(-200);
      resolve({ passed: false, reason: detail || `package manager exited with code ${code ?? 'null'}` });
    });
  });
};

/**
 * Exported so the evolution engine can spread the real implementations instead
 * of re-declaring them.
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
  runPackageManager: spawnPackageManager,
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

  const manager = resolveManager(manifest.packageManager);
  const args = manager === 'npm' ? ['test'] : ['run', 'test'];
  const result = await deps.runPackageManager(directory, manager, args, timeoutMs);

  return { passed: result.passed, reason: result.reason };
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
