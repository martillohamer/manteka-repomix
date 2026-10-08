import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { registerHeatCommand } from '../../../src/cli/commands/heatCommand.js';

type HeatArgs = { days?: number; limit?: number; tMax?: number; maxCommits?: number; fail?: boolean };

const buildProgram = () => {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerHeatCommand(program);
  return program;
};

const heatOf = (program: Command) => {
  const heat = program.commands.find((command) => command.name() === 'heat');
  if (!heat) {
    throw new Error('heat subcommand was not registered');
  }
  return heat;
};

const parseHeat = async (argv: string[]): Promise<HeatArgs> => {
  const program = buildProgram();
  const heat = heatOf(program);
  const captured: HeatArgs = {};
  heat.action((_directory: string, options: HeatArgs) => {
    Object.assign(captured, options);
  });

  await program.parseAsync(['node', 'repomix', 'heat', ...argv]);
  return captured;
};

describe('registerHeatCommand', () => {
  it('registers the heat subcommand on the parent program', () => {
    const program = new Command();
    registerHeatCommand(program);

    expect(program.commands.map((command) => command.name())).toContain('heat');
  });

  it('declares every heat flag', () => {
    const heat = heatOf(buildProgram());

    expect(heat.options.map((option) => option.long)).toEqual([
      '--days',
      '--max-commits',
      '--t-max',
      '--limit',
      '--json',
      '--no-fail',
      '--report',
    ]);
  });

  it('defaults to failing when boiling files are detected', async () => {
    const options = await parseHeat([]);

    expect(options.fail).toBe(true);
  });

  it('maps --no-fail to fail=false so the exit code check is skipped', async () => {
    const options = await parseHeat(['--no-fail']);

    expect(options.fail).toBe(false);
  });

  it('applies the documented defaults', async () => {
    const options = await parseHeat([]);

    expect(options).toMatchObject({ days: 90, maxCommits: 500, tMax: 80, limit: 20, json: false, report: false });
  });

  it('parses explicit numeric overrides', async () => {
    const options = await parseHeat(['--days', '3650', '--limit', '8', '--t-max', '50', '--max-commits', '10']);

    expect(options).toMatchObject({ days: 3650, limit: 8, tMax: 50, maxCommits: 10 });
  });

  it('accepts zero as a valid bound', async () => {
    const options = await parseHeat(['--days', '0', '--limit', '0']);

    expect(options).toMatchObject({ days: 0, limit: 0 });
  });

  it.each([
    ['--days', '-1', /Invalid value for --days/],
    ['--limit', 'abc', /Invalid value for --limit/],
    ['--t-max', '1.5', /Invalid value for --t-max/],
    ['--max-commits', '-3', /Invalid value for --max-commits/],
  ])('rejects invalid values for %s', async (flag, value, matcher) => {
    await expect(parseHeat([flag, value])).rejects.toThrow(matcher);
  });

  it('defaults the analysed directory to the current directory', async () => {
    const program = buildProgram();
    const heat = heatOf(program);
    let directory: string | undefined;
    heat.action((dir: string) => {
      directory = dir;
    });

    await program.parseAsync(['node', 'repomix', 'heat']);
    expect(directory).toBe('.');

    await program.parseAsync(['node', 'repomix', 'heat', 'some/dir']);
    expect(directory).toBe('some/dir');
  });
});
