import process from 'node:process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { runEvolution } from '../../biomimicry/evolutionEngine.js';
import { isKnownOperator } from '../../biomimicry/mutationOperators.js';
import { formatEvolutionTable } from '../../biomimicry/render.js';
import { writeEvolutionReport } from '../../biomimicry/report.js';
import {
  type EvolutionPolicy,
  FITNESS_WEIGHTS,
  MUTATION_OPERATOR_NAMES,
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

const parsePositiveInt = (value: string, name: string): number => {
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
 *
 * Note the absence of negated flags: Phase 4 shipped an inert `--no-fail`
 * because the option was read under its negated name. Every flag below is
 * positive, and `--run-tests` is opt-in because it executes the project's own
 * suite against mutated source.
 */
export const registerEvolveCommand = (program: Command): void => {
  program
    .command('evolve')
    .description('Explore parallel code evolution and rank mutants by biological fitness')
    .argument('[directory]', 'repository to evolve', '.')
    .option('--population <n>', 'Maximum mutants to evaluate', (v) => parsePositiveInt(v, 'population'), 5)
    .option(
      '--operator <name>',
      `Mutation operator, repeatable (${MUTATION_OPERATOR_NAMES.join(', ')})`,
      (value: string, previous: string[] = []) => {
        if (!isKnownOperator(value)) {
          throw new RepomixError(
            `Unknown mutation operator: '${value}'. Expected one of ${MUTATION_OPERATOR_NAMES.join(', ')}.`,
          );
        }
        return [...previous, value];
      },
    )
    .option('--target <path>', 'Restrict to specific files, repeatable', (value: string, previous: string[] = []) => [
      ...previous,
      value,
    ])
    .option('--concurrency <n>', 'Mutants evaluated in parallel', (v) => parsePositiveInt(v, 'concurrency'), 2)
    .option('--run-tests', 'Include the test axis in the fitness index', false)
    .option(
      '--test-timeout <ms>',
      'Per-mutant test suite timeout in milliseconds',
      (v) => parsePositiveInt(v, 'test-timeout'),
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
