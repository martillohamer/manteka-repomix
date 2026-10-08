import path from 'node:path';
import process from 'node:process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { runEvolution } from '../../biomimicry/evolutionEngine.js';
import { EVOLUTION_POLICY_DEFAULTS } from '../../biomimicry/types.js';
import { execGitShortHead } from '../../core/git/gitCommand.js';
import { isGitRepository } from '../../core/git/gitRepositoryHandle.js';
import { RepomixError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';
import { startEvolutionWatcher } from '../watcher.js';

export interface WatchCliOptions {
  debounce: number;
  population: number;
}

const parseNonNegativeInt = (value: string, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RepomixError(`Invalid value for --${name}: '${value}'. Must be a non-negative integer.`);
  }
  return parsed;
};

const parsePositiveInt = (value: string, name: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RepomixError(`Invalid value for --${name}: '${value}'. Must be a positive integer.`);
  }
  return parsed;
};

/**
 * Registers the `watch` subcommand: the Manteka Watcher daemon.
 *
 * Git preconditions are validated up front rather than left to the first save,
 * so a non-repository fails loudly at startup instead of erroring on every
 * cycle while the daemon sits happily watching nothing.
 */
export const registerWatchCommand = (program: Command): void => {
  program
    .command('watch')
    .description('Watch for source saves and re-evolve the repository in the background (Manteka Watcher)')
    .argument('[directory]', 'repository to watch', '.')
    .option(
      '--debounce <ms>',
      'Quiet period after a save before a cycle starts',
      (v) => parseNonNegativeInt(v, 'debounce'),
      300,
    )
    .option('--population <n>', 'Maximum mutants per cycle', (v) => parsePositiveInt(v, 'population'), 5)
    .action(async (directory: string, options: WatchCliOptions) => {
      const root = path.resolve(directory);

      if (!(await isGitRepository(root))) {
        throw new RepomixError(`watch requires a Git repository: ${root} is not inside one.`);
      }
      try {
        await execGitShortHead(root);
      } catch {
        throw new RepomixError(`watch requires at least one commit: ${root} has no commits yet.`);
      }

      const handle = await startEvolutionWatcher({
        root,
        debounceMs: options.debounce,
        runCycle: (target) => runEvolution(target, { ...EVOLUTION_POLICY_DEFAULTS, population: options.population }),
      });

      logger.log(`👁  ${pc.bold('Manteka Watcher')} ${pc.dim(`watching ${root} for source saves · Ctrl+C to stop`)}`);

      // The watcher keeps the process alive on its own; this promise only
      // bridges the first shutdown signal to a graceful close. The listeners
      // remove themselves when they fire, so a second Ctrl+C falls back to
      // Node's default termination if the in-flight cycle takes too long.
      await new Promise<void>((resolve) => {
        const stop = (): void => {
          process.removeListener('SIGINT', stop);
          process.removeListener('SIGTERM', stop);
          resolve();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
      await handle.close();
      logger.log(pc.dim('Watcher stopped.'));
    });
};
