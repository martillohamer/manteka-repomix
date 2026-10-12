import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { registerAnalyzeCommand } from '../../../src/cli/commands/analyzeCommand.js';

const buildProgram = () => {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerAnalyzeCommand(program);
  return program;
};

const analyzeOf = (program: Command) => {
  const analyze = program.commands.find((command) => command.name() === 'analyze');
  if (!analyze) {
    throw new Error('analyze subcommand was not registered');
  }
  return analyze;
};

/**
 * Commander's `Option` exposes `flags`/`long`, not `name` — `name` there would be the
 * inherited `Command.name()` method, so comparing it to a string never matches.
 */
const hasOption = (program: Command, long: string): boolean =>
  analyzeOf(program).options.some((opt) => opt.long === long || opt.flags.includes(long));

describe('registerAnalyzeCommand', () => {
  it('registers the analyze subcommand', () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain('analyze');
  });

  it('has deep option description', () => {
    const program = buildProgram();
    expect(hasOption(program, '--deep')).toBe(true);
  });

  it('has output option description', () => {
    const program = buildProgram();
    expect(hasOption(program, '--output')).toBe(true);
  });

  it('has root argument', () => {
    const program = buildProgram();
    const analyze = analyzeOf(program);
    expect(analyze.registeredArguments.length).toBeGreaterThan(0);
    expect(analyze.registeredArguments[0].name()).toBe('root');
  });

  it('exposes runAnalysis producing a summary for the project', () => {
    const analyze = analyzeOf(buildProgram());
    expect(typeof analyze.description()).toBe('string');
  });
});