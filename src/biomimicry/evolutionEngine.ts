import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execGitShortHead } from '../core/git/gitCommand.js';
import { isGitRepository } from '../core/git/gitRepositoryHandle.js';
import { RepomixError } from '../shared/errorHandle.js';
import { logger } from '../shared/logger.js';
import {
  computeFitness,
  defaultFitnessDeps,
  type FitnessDeps,
  measureThermal,
  type ProbeResult,
  probeTestSuite,
} from './fitnessEvaluator.js';
import { appendSuccess, type Lineage, loadLineage, rankOperators, saveLineage } from './lineageStore.js';
import { applyMutation, isKnownOperator } from './mutationOperators.js';
import { createMutationSandbox, type MutationSandbox } from './mutationSandbox.js';
import { LAWS_FILE_NAME, SemanticGuardian } from './semanticGuardian.js';
import {
  EVOLUTION_POLICY_DEFAULTS,
  type EvolutionPolicy,
  type EvolutionReport,
  type ExperimentState,
  type MutantResult,
  type MutationApplication,
  type MutationOperatorName,
  type TestSignal,
} from './types.js';

export interface MutationCandidate {
  readonly id: string;
  readonly targetFile: string;
  readonly operator: MutationOperatorName;
}

export interface EvolutionDeps extends FitnessDeps {
  isGitRepository: (directory: string) => Promise<boolean>;
  execGitShortHead: (directory: string) => Promise<string>;
  probeTestSuite: (directory: string, timeoutMs: number, deps: FitnessDeps) => Promise<ProbeResult>;
  createSandbox: (repoRoot: string, runId: string) => MutationSandbox;
  applyMutation: (name: MutationOperatorName, content: string) => MutationApplication;
  readFile: (target: string) => Promise<string>;
  writeFile: (target: string, content: string) => Promise<void>;
  loadLineage: (repoRoot: string) => Promise<Lineage>;
  saveLineage: (repoRoot: string, lineage: Lineage) => Promise<void>;
  now: () => Date;
}

/**
 * The production dependency graph. Exported so the integration test drives the
 * real collaborators rather than a reconstruction that could pass while the
 * shipped wiring is broken.
 */
export const defaultEvolutionDeps: EvolutionDeps = {
  ...defaultFitnessDeps,
  probeTestSuite,
  isGitRepository,
  execGitShortHead,
  createSandbox: createMutationSandbox,
  applyMutation,
  readFile: (target) => fs.readFile(target, 'utf8'),
  writeFile: async (target, content) => {
    await fs.writeFile(target, content, 'utf8');
  },
  loadLineage,
  saveLineage,
  now: () => new Date(),
};

/**
 * Run `worker` over `items` with at most `limit` in flight, preserving input
 * order in the output.
 *
 * The pool exists because each mutant may spawn a whole test suite, so sizing
 * it by CPU count would thrash rather than speed up.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length });
  let cursor = 0;

  const width = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: width }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
};

/**
 * Deterministic candidate set: the file x operator cross product in file-major
 * order, truncated to the population.
 *
 * No RNG. Given identical repository state a run reproduces exactly, because an
 * evolutionary tool whose results shift between runs cannot be debugged.
 */
export const buildCandidates = (
  targets: readonly string[],
  operators: readonly MutationOperatorName[],
  population: number,
): MutationCandidate[] => {
  const candidates: MutationCandidate[] = [];

  for (const targetFile of targets) {
    for (const operator of operators) {
      candidates.push({ id: `${targetFile}::${operator}`, targetFile, operator });
    }
  }

  return candidates.slice(0, Math.max(0, population));
};

const resolveTargets = (boilingPaths: string[], requested: string[]): string[] => {
  if (requested.length === 0) {
    return boilingPaths;
  }
  return requested.filter((candidate) => boilingPaths.includes(candidate));
};

const resolveTestSignal = (mutants: readonly MutantResult[]): TestSignal =>
  mutants.length > 0 && mutants.every((mutant) => mutant.testAxis !== null) ? 'measured' : 'not-measured';

/** Git worktree paths must be filesystem-safe, and `/` or `::` are neither. */
const toWorktreeId = (candidateId: string): string => candidateId.replace(/[^A-Za-z0-9._-]/g, '_');

const failedMutant = (candidate: MutationCandidate, before: number, failure: string): MutantResult => ({
  id: candidate.id,
  targetFile: candidate.targetFile,
  operator: candidate.operator,
  applied: false,
  mutationLine: null,
  temperatureBefore: before,
  temperatureAfter: null,
  thermalAxis: null,
  testPassed: null,
  testAxis: null,
  fitness: null,
  viable: false,
  failure,
});

/**
 * Epigenetic write-back: every cooling win this run produced is appended to
 * the lineage so the next run can weight its operators. Best effort —
 * telemetry must never abort an evolution run, and a run with no wins leaves
 * the store untouched.
 */
const persistLineageSuccesses = async (
  repoRoot: string,
  lineage: Lineage,
  mutants: readonly MutantResult[],
  deps: EvolutionDeps,
): Promise<void> => {
  try {
    const recordedAt = deps.now().toISOString();
    let updated = lineage;
    let added = 0;
    for (const mutant of mutants) {
      const thermalAxis = mutant.thermalAxis;
      if (mutant.applied && mutant.viable && thermalAxis !== null && thermalAxis > 0) {
        updated = appendSuccess(updated, {
          operator: mutant.operator,
          targetFile: mutant.targetFile,
          thermalAxis,
          fitness: mutant.fitness,
          recordedAt,
        });
        added += 1;
      }
    }
    if (added > 0) {
      await deps.saveLineage(repoRoot, updated);
    }
  } catch (error) {
    logger.trace('Lineage persistence failed:', (error as Error).message);
  }
};

export const runEvolution = async (
  targetDirectory: string,
  policy: EvolutionPolicy = EVOLUTION_POLICY_DEFAULTS,
  deps: EvolutionDeps = defaultEvolutionDeps,
): Promise<EvolutionReport> => {
  const states: ExperimentState[] = [];
  /**
   * Each lifecycle phase is recorded once, in the order it was first reached, so
   * a concurrent pool cannot interleave duplicates and two runs of the same
   * policy produce a comparable trail.
   */
  const advance = (state: ExperimentState): void => {
    if (!states.includes(state)) {
      states.push(state);
    }
  };

  for (const operator of policy.operators) {
    if (!isKnownOperator(operator)) {
      throw new RepomixError(`Unknown mutation operator: ${operator}`);
    }
  }

  const root = path.resolve(targetDirectory);

  if (!(await deps.isGitRepository(root))) {
    throw new RepomixError(`evolve requires a Git repository: ${root} is not inside one.`);
  }

  let head: string;
  try {
    head = await deps.execGitShortHead(root);
  } catch {
    throw new RepomixError(`evolve requires at least one commit: ${root} has no commits yet.`);
  }

  advance('scoping');
  const analysis = await deps.runHeatAnalysis(root, policy.thermal);
  const targets = resolveTargets(
    analysis.boilingFiles.map((file) => file.path),
    policy.targets,
  );

  /**
   * Epigenetic memory: operators are re-ranked by their historical wins in
   * `.manteka-lineage.json` before the population cut, so operators that have
   * already cooled this codebase earn their mutants the first candidate slots.
   * Ranking instead of a random draw keeps the determinism invariant above.
   */
  const lineage = await deps.loadLineage(root);
  const candidates = buildCandidates(targets, rankOperators(policy.operators, lineage), policy.population);

  advance('baselining');
  const baselineTemperature: Record<string, number> = {};
  for (const targetFile of targets) {
    const measured = analysis.files.find((file) => file.path === targetFile)?.temperature ?? null;
    if (measured !== null) {
      baselineTemperature[targetFile] = measured;
    }
  }

  // Without a baseline test signal the test axis cannot be computed at all, so
  // this is a precondition failure rather than per-mutant data.
  let baselineTestPassed: boolean | null = null;
  if (policy.testEnabled) {
    try {
      baselineTestPassed = (await deps.probeTestSuite(root, policy.testTimeoutMs, deps))?.passed ?? null;
    } catch (error) {
      throw new RepomixError(`The baseline test probe failed: ${(error as Error).message}`);
    }
  }

  advance('branching');
  const runId = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
  const sandbox = deps.createSandbox(root, runId);
  const guardian = new SemanticGuardian(path.join(root, LAWS_FILE_NAME));
  await guardian.loadLaws();

  let mutants: MutantResult[];
  try {
    mutants = await mapWithConcurrency(candidates, policy.concurrency, async (candidate) => {
      const before = baselineTemperature[candidate.targetFile] ?? 0;
      let worktree: string | null = null;
      try {
        worktree = await sandbox.createWorktree(toWorktreeId(candidate.id), head);
        const target = path.join(worktree, candidate.targetFile);
        const original = await deps.readFile(target);
        const application = deps.applyMutation(candidate.operator, original);

        if (!application.changed) {
          return failedMutant(candidate, before, 'no eligible line: every candidate line contains a quote character');
        }

        const violation = await guardian.validateMutation(application.content, target);
        if (!violation.valid) {
          return failedMutant(candidate, before, `semantic law violation: ${violation.violation}`);
        }

        await deps.writeFile(target, application.content);
        advance('evaluating');

        const temperatureAfter = await measureThermal(worktree, candidate.targetFile, policy.thermal, deps);
        const testPassed = policy.testEnabled
          ? ((await deps.probeTestSuite(worktree, policy.testTimeoutMs, deps))?.passed ?? null)
          : null;
        const breakdown =
          temperatureAfter === null
            ? null
            : computeFitness(
                { temperature: before, testPassed: baselineTestPassed },
                { temperature: temperatureAfter, testPassed },
                policy.weights,
              );

        return {
          id: candidate.id,
          targetFile: candidate.targetFile,
          operator: candidate.operator,
          applied: true,
          mutationLine: application.line,
          temperatureBefore: before,
          temperatureAfter,
          thermalAxis: breakdown?.thermalAxis ?? null,
          testPassed,
          testAxis: breakdown?.testAxis ?? null,
          fitness: breakdown?.fitness ?? null,
          viable: breakdown !== null,
          failure: breakdown === null ? 'temperature could not be measured' : null,
        } satisfies MutantResult;
      } catch (error) {
        // A mutant that fails is data. One broken branch must never abort the run.
        logger.trace('Mutant failed:', (error as Error).message);
        return failedMutant(candidate, before, (error as Error).message);
      } finally {
        if (worktree !== null) {
          await sandbox.removeWorktree(worktree);
        }
      }
    });
  } finally {
    // Runs before reporting, so `report.repo.runDir` is read first.
    await sandbox.dispose();
    await guardian.dispose();
  }

  advance('reporting');
  const ranked = [...mutants].sort((a, b) => {
    const scoreA = a.fitness ?? Number.NEGATIVE_INFINITY;
    const scoreB = b.fitness ?? Number.NEGATIVE_INFINITY;
    return scoreB - scoreA || a.id.localeCompare(b.id);
  });

  const viable = ranked.filter((mutant) => mutant.viable);

  await persistLineageSuccesses(root, lineage, mutants, deps);

  const evolutionReport: EvolutionReport = {
    schemaVersion: 1,
    generatedAt: deps.now().toISOString(),
    repo: { root, head, runDir: sandbox.runDir },
    policy,
    testSignal: resolveTestSignal(ranked),
    baseline: { temperature: baselineTemperature, testPassed: baselineTestPassed },
    mutants: ranked,
    summary: {
      total: ranked.length,
      viable: viable.length,
      best: viable[0]?.id ?? null,
      worst: viable.length > 0 ? viable[viable.length - 1].id : null,
    },
    states,
  };

  advance('done');

  return evolutionReport;
};
