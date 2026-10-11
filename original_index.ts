import process from 'node:process';
import { Command } from 'commander';
import { getVersion } from '../core/file/packageJsonParse.js';
import { handleError } from '../shared/errorHandle.js';
import { registerEvolveCommand } from './commands/evolveCommand.js';
import { registerStatusCommand } from './commands/statusCommand.js';
import { registerWatchCommand } from './commands/watchCommand.js';

/**
 * Entry point of the autonomous `manteka` CLI (Phase 7).
 *
 * The repomix packer keeps its own entry in cliRun.ts; this program exposes
 * only the evolution surface — evolve, status and the watch daemon — so each
 * binary has a single responsibility and one Commander program to own it.
 */
export const createMantekaProgram = (): Command => {
  const program = new Command();
  program.name('manteka').description('Manteka — autonomous code evolution CLI');
  registerEvolveCommand(program);
  registerStatusCommand(program);
  registerWatchCommand(program);
  return program;
};

export const runManteka = async (argv: readonly string[] = process.argv): Promise<void> => {
  const program = createMantekaProgram();
  try {
    program.version(await getVersion());
    await program.parseAsync([...argv]);
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
};
