> Constraints, file map, execution order and Definition of Done: [README](./README.md).

## Task 6: CLI command wiring

**Files:**
- Create: `src/cli/commands/evolveCommand.ts`
- Modify: `src/cli/cliRun.ts` — two lines only
- Test: `tests/cli/commands/evolveCommand.test.ts`

**Interfaces:**
- Consumes: `runEvolution`, `formatEvolutionTable`, `writeEvolutionReport`, `isKnownOperator`, `MUTATION_OPERATOR_NAMES`, `FITNESS_WEIGHTS`, `THERMAL_POLICY_DEFAULTS`, `EvolutionPolicy`
- Produces: `registerEvolveCommand(program: Command): void`, `EvolveCliOptions`

**Watch the negated-flag trap.** Phase 4 shipped a real bug here: `--no-fail` was declared with an explicit `false` default and read as `options.noFail`, so Commander's negation (`--no-fail` → `fail`, default `true`) never took effect and the flag was inert. Do not repeat it. `evolve` has no negated flags; if you add one, read the positive name with the implicit `true` default.

- [ ] **Step 1: Create `tests/cli/commands/evolveCommand.test.ts`**

```ts
import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { registerEvolveCommand } from '../../../src/cli/commands/evolveCommand.js';
import { MUTATION_OPERATOR_NAMES } from '../../../src/biomimicry/types.js';

const buildProgram = () => {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerEvolveCommand(program);
  return program;
};

const evolveOf = (program: Command) => {
  const evolve = program.commands.find((command) => command.name() === 'evolve');
  if (!evolve) {
    throw new Error('evolve subcommand was not registered');
  }
  return evolve;
};

type ParsedOptions = {
  population?: number;
  operator?: string[];
  target?: string[];
  concurrency?: number;
  runTests?: boolean;
  testTimeout?: number;
  json?: boolean;
  report?: boolean;
};

const parseEvolve = async (argv: string[]): Promise<ParsedOptions> => {
  const program = buildProgram();
  const evolve = evolveOf(program);
  const captured: ParsedOptions = {};
  evolve.action((_directory: string, options: ParsedOptions) => {
    Object.assign(captured, options);
  });

  await program.parseAsync(['node', 'repomix', 'evolve', ...argv]);
  return captured;
};

describe('registerEvolveCommand', () => {
  it('registers the evolve subcommand', () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain('evolve');
  });

  it('declares every documented flag', () => {
    expect(evolveOf(buildProgram()).options.map((option) => option.long)).toEqual([
      '--population',
      '--operator',
      '--target',
      '--concurrency',
      '--run-tests',
      '--test-timeout',
      '--json',
      '--report',
    ]);
  });

  it('defaults the analysed directory to the current directory', async () => {
    const program = buildProgram();
    let directory: string | undefined;
    evolveOf(program).action((dir: string) => {
      directory = dir;
    });

    await program.parseAsync(['node', 'repomix', 'evolve']);
    expect(directory).toBe('.');

    await program.parseAsync(['node', 'repomix', 'evolve', 'some/dir']);
    expect(directory).toBe('some/dir');
  });

  it('applies the documented defaults', async () => {
    expect(await parseEvolve([])).toMatchObject({
      population: 5,
      concurrency: 2,
      runTests: false,
      testTimeout: 300000,
      json: false,
      report: false,
    });
  });

  it('collects repeated --operator values', async () => {
    const options = await parseEvolve(['--operator', 'dead-guard', '--operator', 'comment-noise']);

    expect(options.operator).toEqual(['dead-guard', 'comment-noise']);
  });

  it('collects repeated --target values', async () => {
    const options = await parseEvolve(['--target', 'a.ts', '--target', 'b.ts']);

    expect(options.target).toEqual(['a.ts', 'b.ts']);
  });

  it('sets runTests from --run-tests', async () => {
    expect((await parseEvolve(['--run-tests'])).runTests).toBe(true);
  });

  it('rejects a negative population', async () => {
    await expect(parseEvolve(['--population', '-1'])).rejects.toThrow(/Invalid value for --population/);
  });

  it('rejects a non-numeric test timeout', async () => {
    await expect(parseEvolve(['--test-timeout', 'soon'])).rejects.toThrow(/Invalid value for --test-timeout/);
  });

  it('rejects an unknown operator name', async () => {
    await expect(parseEvolve(['--operator', 'reorder-imports'])).rejects.toThrow(/Unknown mutation operator/);
  });

  it('accepts every declared operator name', async () => {
    for (const name of MUTATION_OPERATOR_NAMES) {
      expect((await parseEvolve(['--operator', name])).operator).toEqual([name]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/cli/commands/evolveCommand.test.ts`
Expected: FAIL with "Failed to resolve import" for `src/cli/commands/evolveCommand.js`.

- [ ] **Step 3: Create `src/cli/commands/evolveCommand.ts`**

```ts
import process from 'node:process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { isKnownOperator } from '../../biomimicry/mutationOperators.js';
import { writeEvolutionReport } from '../../biomimicry/report.js';
import { formatEvolutionTable } from '../../biomimicry/render.js';
import { runEvolution } from '../../biomimicry/evolutionEngine.js';
import {
  FITNESS_WEIGHTS,
  MUTATION_OPERATOR_NAMES,
  type EvolutionPolicy,
  type MutationOperatorName,
} from '../../biomimicry/types.js';
import { RepomixError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';
import { THERMAL_POLICY_DEFAULTS } from '../../thermodynamics/types.js';

export interface EvolveCliOptions {
  population: number;
  operator?: string[];
  target?: string[];
  concurrency: number;
  runTests: boolean;
  testTimeout: number;
  json: boolean;
  report: boolean;
}

const parseNonNegativeInt = (value: string, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RepomixError(`Invalid value for --${name}: '${value}'. Must be a positive integer.`);
  }
  return parsed;
};

/**
 * Registers the `evolve` subcommand.
 *
 * Lives under src/cli/commands/ rather than inside src/biomimicry/ so the
 * domain layer stays free of commander, matching how heat is wired.
 */
export const registerEvolveCommand = (program: Command): void => {
  program
    .command('evolve')
    .description('Explore parallel code evolution and rank mutants by biological fitness')
    .argument('[directory]', 'repository to evolve', '.')
    .option('--population <n>', 'Maximum mutants to evaluate', (v) => parseNonNegativeInt(v, 'population'), 5)
    .option(
      '--operator <name>',
      `Mutation operator, repeatable (${MUTATION_OPERATOR_NAMES.join(', ')})`,
      (value: string, previous: string[] = []) => {
        if (!isKnownOperator(value)) {
          throw new RepomixError(`Unknown mutation operator: '${value}'. Expected one of ${MUTATION_OPERATOR_NAMES.join(', ')}.`);
        }
        return [...previous, value];
      },
    )
    .option('--target <path>', 'Restrict to specific files, repeatable', (value: string, previous: string[] = []) => [
      ...previous,
      value,
    ])
    .option('--concurrency <n>', 'Mutants evaluated in parallel', (v) => parseNonNegativeInt(v, 'concurrency'), 2)
    .option('--run-tests', 'Include the test axis in the fitness index', false)
    .option(
      '--test-timeout <ms>',
      'Per-mutant test suite timeout in milliseconds',
      (v) => parseNonNegativeInt(v, 'test-timeout'),
      300000,
    )
    .option('--json', 'Output the raw evolution report as JSON', false)
    .option('--report', 'Write the JSON report to disk', false)
    .action(async (directory: string, options: EvolveCliOptions) => {
      const policy: EvolutionPolicy = {
        population: options.population,
        operators: (options.operator ?? [...MUTATION_OPERATOR_NAMES]) as MutationOperatorName[],
        targets: options.target ?? [],
        concurrency: options.concurrency,
        testEnabled: options.runTests,
        testTimeoutMs: options.testTimeout,
        weights: FITNESS_WEIGHTS,
        thermal: { ...THERMAL_POLICY_DEFAULTS },
      };

      try {
        const report = await runEvolution(directory, policy);

        if (options.report) {
          const written = await writeEvolutionReport(report, report.repo.root);
          logger.log(pc.green(`✔ Report written to ${written}`));
        }

        logger.log(options.json ? JSON.stringify(report, null, 2) : formatEvolutionTable(report));
      } catch (error) {
        logger.error(pc.red(`✖ Evolution failed: ${(error as Error).message}`));
        process.exit(2);
      }
    });
};
```

- [ ] **Step 4: Register the command in `src/cli/cliRun.ts`**

Add the import after line 13 (`import { registerHeatCommand } from './commands/heatCommand.js';`), keeping alphabetical order within the `./` group:

```ts
import { registerEvolveCommand } from './commands/evolveCommand.js';
```

Add the call immediately after `registerHeatCommand(program);`:

```ts
    registerEvolveCommand(program);
```

Verify the file is exactly **437** lines:

```bash
(Get-Content src/cli/cliRun.ts).Count
```

Expected: `437`. If it is 438 or more, something extra crept in.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/cli/commands/evolveCommand.test.ts tests/cli/cliRun.test.ts`
Expected: PASS. `cliRun.test.ts` must still pass — it spies on `program.description`, which registration must not disturb.

- [ ] **Step 6: Build and smoke test**

Run: `npm run build`
Expected: exit 0.

Run: `node bin/repomix.cjs evolve . --population 2 --json`
Expected: JSON with `schemaVersion: 1`, a `mutants` array, and `states` ending in `done`.

Run: `node bin/repomix.cjs evolve /tmp/not-a-repo`
Expected: exit 2 with a message naming the Git-repository requirement.

- [ ] **Step 7: Confirm the ratchet and commit**

Run the ratchet script (see Task 8 for its path) and confirm `src/cli/cliRun.ts: 437 < 466`.

```bash
git add src/cli/commands/evolveCommand.ts src/cli/cliRun.ts tests/cli/commands/evolveCommand.test.ts
git commit -m "feat(cli): register the evolve subcommand"
```

---
