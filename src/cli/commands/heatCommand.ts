import process from 'node:process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { logger } from '../../shared/logger.js';
import { runHeatAnalysis } from '../../thermodynamics/heatRun.js';
import { formatThermalTable } from '../../thermodynamics/render.js';
import { buildReport, writeReport } from '../../thermodynamics/report.js';
import { THERMAL_POLICY_DEFAULTS, type ThermalPolicy } from '../../thermodynamics/types.js';

export interface HeatCliOptions {
  days: number;
  maxCommits: number;
  tMax: number;
  limit: number;
  json: boolean;
  /** Negated flag: Commander maps `--no-fail` to `fail`, defaulting to true. */
  fail: boolean;
  report: boolean;
}

const parsePositiveInt = (value: string, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid value for --${name}: '${value}'. Must be a non-negative integer.`);
  }
  return parsed;
};

/**
 * Registers the `heat` subcommand. Lives under src/cli/commands/ rather than
 * inline in cliRun.ts so the Commander wiring for the subcommand has a single
 * home and cliRun.ts stays inside the line budget the CI ratchet audits.
 */
export const registerHeatCommand = (program: Command): void => {
  program
    .command('heat')
    .description('Analyse Git repository software thermodynamics')
    .argument('[directory]', 'directory to analyse', '.')
    .option('--days <n>', 'Days of Git history to analyse', (v) => parsePositiveInt(v, 'days'), 90)
    .option('--max-commits <n>', 'Maximum commits to analyse', (v) => parsePositiveInt(v, 'max-commits'), 500)
    .option('--t-max <n>', 'Temperature threshold for boiling files', (v) => parsePositiveInt(v, 't-max'), 80)
    .option('--limit <n>', 'Limit number of files in report', (v) => parsePositiveInt(v, 'limit'), 20)
    .option('--json', 'Output raw JSON report instead of table', false)
    .option('--no-fail', 'Do not exit with code 1 if boiling files detected')
    .option('--report', 'Write JSON report to file', false)
    .action(async (directory: string, options: HeatCliOptions) => {
      const policy: ThermalPolicy = {
        ...THERMAL_POLICY_DEFAULTS,
        windowDays: options.days,
        maxCommits: options.maxCommits,
        tMax: options.tMax,
        limit: options.limit,
      };

      try {
        const run = await runHeatAnalysis(directory, policy);

        if (options.report) {
          const report = buildReport(run);
          const path = await writeReport(report, run.repoRoot);
          logger.log(pc.green(`✔ Report written to ${path}`));
        }

        if (options.json) {
          logger.log(JSON.stringify(run, null, 2));
        } else {
          logger.log(formatThermalTable(run));
        }

        if (run.boilingFiles.length > 0 && options.fail) {
          process.exit(1);
        }
      } catch (error) {
        logger.error(pc.red(`✖ Failed to analyse: ${(error as Error).message}`));
        process.exit(2);
      }
    });
};
