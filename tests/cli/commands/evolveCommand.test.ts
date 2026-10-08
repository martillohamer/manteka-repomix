import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { MUTATION_OPERATOR_NAMES } from '../../../src/biomimicry/types.js';
import { registerEvolveCommand } from '../../../src/cli/commands/evolveCommand.js';

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
