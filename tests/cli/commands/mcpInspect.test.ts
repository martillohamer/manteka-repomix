import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
// ESM under NodeNext resolves the compiled specifier, so the import must use the
// `.js` extension (and `.ts` requires allowImportingTsExtensions, which is off).
import { createMantekaProgram } from '../../../src/cli/index.js';

const buildProgram = () => {
  const program = createMantekaProgram();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  return program;
};

const inspectOf = (program: Command) => {
  const inspect = program.commands.find((command) => command.name() === 'inspect');
  if (!inspect) {
    throw new Error('inspect subcommand was not registered');
  }
  return inspect;
};

describe('manteka mcp inspect', () => {
  it('registers the inspect subcommand', () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain('inspect');
  });

  it('has --json option', () => {
    const program = buildProgram();
    const inspect = inspectOf(program);
    // Commander's `Option` exposes `flags`/`long`; `name` would be the inherited
    // `Command.name()` method rather than the option's identifier.
    const jsonOption = inspect.options.find(
      (opt) => opt.long === '--json' || opt.flags.includes('--json')
    );
    expect(jsonOption).toBeDefined();
  });

  it('program includes all expected commands', () => {
    const program = buildProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('inspect');
    expect(commandNames).toContain('analyze');
  });
});