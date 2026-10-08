import { THERMAL_POLICY_DEFAULTS, type ThermalPolicy } from '../thermodynamics/types.js';

/**
 * Genetic contracts for the biomimicry subsystem.
 *
 * Pure data only, mirroring `src/thermodynamics/types.ts`: every weight and
 * default lives here so a report stays recomputable months later.
 */

export type MutationOperatorName =
  | 'comment-noise'
  | 'dead-guard'
  | 'constant-perturbation'
  | 'comment-reducer'
  | 'dead-guard-stripper';

export const MUTATION_OPERATOR_NAMES: readonly MutationOperatorName[] = [
  'comment-noise',
  'dead-guard',
  'constant-perturbation',
  'comment-reducer',
  'dead-guard-stripper',
];

export interface MutationApplication {
  /** Whole file content after the transform, or the original when not applied. */
  readonly content: string;
  /** 1-based line the operator targeted, or null when it found none. */
  readonly line: number | null;
  readonly changed: boolean;
}

export interface OperatorDefinition {
  readonly name: MutationOperatorName;
  apply: (content: string) => MutationApplication;
}

export interface FitnessWeights {
  readonly thermal: number;
  readonly test: number;
}

export const FITNESS_WEIGHTS: FitnessWeights = { thermal: 0.6, test: 0.4 };

/**
 * Whether the test axis contributed to the score. A report with
 * `not-measured` must never be read as a fully evaluated mutant, so the state
 * travels with the number instead of being inferred.
 */
export type TestSignal = 'measured' | 'not-measured';

export interface FitnessInput {
  readonly temperature: number;
  /** null when the suite was not run, which downgrades the whole breakdown. */
  readonly testPassed: boolean | null;
}

export interface FitnessBreakdown {
  readonly thermalAxis: number;
  readonly testAxis: number | null;
  readonly fitness: number;
  readonly testSignal: TestSignal;
}

export type ExperimentState = 'scoping' | 'baselining' | 'branching' | 'evaluating' | 'reporting' | 'done' | 'failed';

export const EXPERIMENT_STATES: readonly ExperimentState[] = [
  'scoping',
  'baselining',
  'branching',
  'evaluating',
  'reporting',
  'done',
  'failed',
];

export interface EvolutionPolicy {
  population: number;
  operators: MutationOperatorName[];
  /** Explicit target paths; empty means "every boiling file". */
  targets: string[];
  concurrency: number;
  testEnabled: boolean;
  testTimeoutMs: number;
  weights: FitnessWeights;
  /** Phase 4 inputs, persisted so temperatures stay reproducible. */
  thermal: ThermalPolicy;
}

export const EVOLUTION_POLICY_DEFAULTS: EvolutionPolicy = {
  population: 5,
  operators: [...MUTATION_OPERATOR_NAMES],
  targets: [],
  concurrency: 2,
  testEnabled: false,
  testTimeoutMs: 300000,
  weights: FITNESS_WEIGHTS,
  thermal: { ...THERMAL_POLICY_DEFAULTS },
};

export interface MutantResult {
  readonly id: string;
  readonly targetFile: string;
  readonly operator: MutationOperatorName;
  readonly applied: boolean;
  readonly mutationLine: number | null;
  readonly temperatureBefore: number;
  readonly temperatureAfter: number | null;
  readonly thermalAxis: number | null;
  readonly testPassed: boolean | null;
  readonly testAxis: number | null;
  readonly fitness: number | null;
  readonly viable: boolean;
  readonly failure: string | null;
}

export interface EvolutionSummary {
  readonly total: number;
  readonly viable: number;
  readonly best: string | null;
  readonly worst: string | null;
}

export interface EvolutionReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly repo: {
    readonly root: string;
    readonly head: string;
    readonly runDir: string;
  };
  readonly policy: EvolutionPolicy;
  readonly testSignal: TestSignal;
  readonly baseline: {
    readonly temperature: Record<string, number>;
    readonly testPassed: boolean | null;
  };
  readonly mutants: MutantResult[];
  readonly summary: EvolutionSummary;
  readonly states: ExperimentState[];
}
