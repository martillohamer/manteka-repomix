> Constraints, file map, execution order and Definition of Done: [README](./README.md).

## Task 1b: Genetic contracts and mutation operators

**Files:** create `src/biomimicry/types.ts` and `src/biomimicry/mutationOperators.ts` (the test suite from [task 1a](./task-1a-operator-tests.md) must already be red).

**Interfaces:**
- Consumes: `THERMAL_POLICY_DEFAULTS`, `ThermalPolicy` from `src/thermodynamics/types.js`.
- Produces from `types.ts`: `MutationOperatorName`, `MUTATION_OPERATOR_NAMES`, `MutationApplication`, `OperatorDefinition`, `FitnessWeights`, `FITNESS_WEIGHTS`, `TestSignal`, `FitnessInput`, `FitnessBreakdown`, `ExperimentState`, `EXPERIMENT_STATES`, `EvolutionPolicy`, `EVOLUTION_POLICY_DEFAULTS`, `MutantResult`, `EvolutionSummary`, `EvolutionReport`.
- Produces from `mutationOperators.ts`: `isEligibleLine`, `MUTATION_OPERATORS`, `applyMutation`, `isKnownOperator`.

- [ ] **Step 1: Create `src/biomimicry/types.ts`**

```ts
import { THERMAL_POLICY_DEFAULTS, type ThermalPolicy } from '../thermodynamics/types.js';

/**
 * Genetic contracts for the biomimicry subsystem.
 *
 * Pure data only, mirroring `src/thermodynamics/types.ts`: every weight and
 * default lives here so a report stays recomputable months later.
 */

export type MutationOperatorName = 'comment-noise' | 'dead-guard' | 'constant-perturbation';

export const MUTATION_OPERATOR_NAMES: readonly MutationOperatorName[] = [
  'comment-noise',
  'dead-guard',
  'constant-perturbation',
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

export type ExperimentState =
  | 'scoping'
  | 'baselining'
  | 'branching'
  | 'evaluating'
  | 'reporting'
  | 'done'
  | 'failed';

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
```

- [ ] **Step 2: Create `src/biomimicry/mutationOperators.ts`**

```ts
import type { MutationApplication, MutationOperatorName, OperatorDefinition } from './types.js';
import { MUTATION_OPERATOR_NAMES } from './types.js';

/**
 * Characters that open a string, template or comment body. A line containing
 * any of them is never touched. The exclusion is deliberately conservative:
 * some mutable lines are skipped, but no operator needs a parser to stay safe.
 * This single rule is what makes the subsystem defensible, and the immunity test
 * in this task asserts it directly.
 */
const UNSAFE_CHARACTERS = ["'", '"', '`'];

const COMMENT_PREFIXES = ['//', '/*', '*', '*/'];

export const isEligibleLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (UNSAFE_CHARACTERS.some((character) => line.includes(character))) {
    return false;
  }
  return !COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
};

const findEligibleLine = (lines: string[], extra?: (line: string) => boolean): number =>
  lines.findIndex((line) => isEligibleLine(line) && (extra ? extra(line) : true));

/** Insert a complete statement above `index`, reusing that line's indentation. */
const insertAbove = (content: string, index: number, statement: string): string => {
  const lines = content.split('\n');
  const indent = lines[index].match(/^\s*/)?.[0] ?? '';
  lines.splice(index, 0, `${indent}${statement}`);
  return lines.join('\n');
};

const notApplied = (content: string): MutationApplication => ({ content, line: null, changed: false });

/**
 * A bare integer literal: not glued to an identifier character, a member access
 * or a decimal point, so `0xFF`, `v2` and `1.5` are all left alone.
 */
const BARE_INTEGER = /(?<![\w$.])(\d+)(?![\w.])/;

const hasBareInteger = (line: string): boolean => BARE_INTEGER.test(line);

const firstOperator = (statement: string, extra?: (line: string) => boolean) => ({
  apply: (content: string): MutationApplication => {
    const index = findEligibleLine(content.split('\n'), extra);
    if (index === -1) {
      return notApplied(content);
    }
    return { content: insertAbove(content, index, statement), line: index + 1, changed: true };
  },
});

export const MUTATION_OPERATORS: Record<MutationOperatorName, OperatorDefinition> = {
  'comment-noise': {
    name: 'comment-noise',
    ...firstOperator('/* mutant:comment-noise */'),
  },
  'dead-guard': {
    name: 'dead-guard',
    ...firstOperator('if (false as boolean) { /* mutant:dead-guard */ }'),
  },
  'constant-perturbation': {
    name: 'constant-perturbation',
    apply: (content: string): MutationApplication => {
      const lines = content.split('\n');
      const index = findEligibleLine(lines, hasBareInteger);
      if (index === -1) {
        return notApplied(content);
      }
      const mutated = [...lines];
      mutated[index] = lines[index].replace(BARE_INTEGER, '($1 + 1)');
      return { content: mutated.join('\n'), line: index + 1, changed: true };
    },
  },
};

export const applyMutation = (name: MutationOperatorName, content: string): MutationApplication =>
  MUTATION_OPERATORS[name].apply(content);

export const isKnownOperator = (value: string): value is MutationOperatorName =>
  (MUTATION_OPERATOR_NAMES as readonly string[]).includes(value);
```


- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/biomimicry/mutationOperators.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 4: Lint and typecheck**

Run: `npm run lint`
Expected: `Found 0 warnings and 0 errors.` `lint-biome` runs with `--write`, so re-run the tests if it reformats anything.

- [ ] **Step 5: Commit**

```bash
git add src/biomimicry/types.ts src/biomimicry/mutationOperators.ts tests/biomimicry/mutationOperators.test.ts
git commit -m "feat(biomimicry): add genetic contracts and safe mutation operators"
```

