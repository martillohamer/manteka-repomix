import path from 'node:path';
import process from 'node:process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { createDashboardServer } from '../../dashboard/server.js';
import { gatherSnapshot } from '../../dashboard/snapshot.js';
import { RepomixError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';

export const DEFAULT_DASHBOARD_PORT = 3838;

export interface DashboardCliOptions {
  port: number;
}

const parsePort = (value: string): number => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RepomixError(`Invalid value for --port: '${value}'. Expected an integer between 1 and 65535.`);
  }
  return port;
};

/**
 * Registers the `dashboard` subcommand: a read-only observability server over
 * the repository's autonomy state. Unlike `watch`, a non-Git directory is a
 * valid target — every section simply renders cold-start state.
 */
export const registerDashboardCommand = (program: Command): void => {
  program
    .command('dashboard')
    .description('Serve the biometric web dashboard: guardian, lineage, heat and evolution in real time')
    .argument('[directory]', 'repository to observe', '.')
    .option('--port <number>', 'TCP port to listen on', parsePort, DEFAULT_DASHBOARD_PORT)
    .action(async (directory: string, options: DashboardCliOptions) => {
      const root = path.resolve(directory);
      const handle = createDashboardServer({ root, gatherSnapshot: () => gatherSnapshot(root) });

      let url = '';
      try {
        url = (await handle.start(options.port)).url;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          const suggestion = Math.min(options.port + 1, 65535);
          throw new RepomixError(`Port ${options.port} is already in use. Try: manteka dashboard --port ${suggestion}`);
        }
        throw error;
      }

      logger.log(`🧪 ${pc.bold('Manteka Dashboard')} ${pc.cyan(url)}`);
      logger.log(pc.dim('   observing guardian · lineage · heat · evolution — Ctrl+C to stop'));

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
      logger.log(pc.dim('Dashboard stopped.'));
    });
};
