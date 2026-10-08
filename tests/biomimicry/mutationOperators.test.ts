// The immunity fixtures below embed template literals in plain strings on purpose:
// the whole point is to prove the operators never touch a line containing a quote.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: fixtures must contain literal ${...} source text
/* oxlint-disable no-template-curly-in-string */
import { describe, expect, it } from 'vitest';
import {
  applyMutation,
  isEligibleLine,
  isKnownOperator,
  MUTATION_OPERATORS,
} from '../../src/biomimicry/mutationOperators.js';
import { MUTATION_OPERATOR_NAMES } from '../../src/biomimicry/types.js';

describe('isEligibleLine', () => {
  it('rejects any line containing a quote character', () => {
    expect(isEligibleLine("const greeting = 'hello';")).toBe(false);
    expect(isEligibleLine('const greeting = "hello";')).toBe(false);
    expect(isEligibleLine('const greeting = `hello`;')).toBe(false);
  });

  it('rejects blank lines', () => {
    expect(isEligibleLine('')).toBe(false);
    expect(isEligibleLine('   \t ')).toBe(false);
  });

  it('rejects comment lines so numbers inside comments are never touched', () => {
    expect(isEligibleLine('// count = 5')).toBe(false);
    expect(isEligibleLine('/* count = 5 */')).toBe(false);
    expect(isEligibleLine(' * count = 5')).toBe(false);
  });

  it('accepts a plain code line', () => {
    expect(isEligibleLine('const port = 8080;')).toBe(true);
  });
});

describe('applyMutation', () => {
  const source = ['// header', 'const port = 8080;', 'export const run = () => port;', ''].join('\n');

  it('inserts a comment above the first eligible line', () => {
    const result = applyMutation('comment-noise', source);

    expect(result.changed).toBe(true);
    expect(result.line).toBe(2);
    expect(result.content.split('\n')[1]).toBe('/* mutant:comment-noise */');
  });

  it('injects a dead guard that TypeScript accepts', () => {
    const result = applyMutation('dead-guard', source);

    expect(result.content).toContain('if (false as boolean) { /* mutant:dead-guard */ }');
    expect(result.changed).toBe(true);
  });

  it('wraps the first bare integer and leaves the identifier alone', () => {
    const result = applyMutation('constant-perturbation', source);

    expect(result.content).toContain('const port = (8080 + 1);');
  });

  it('is deterministic across repeated runs', () => {
    const first = applyMutation('constant-perturbation', source);
    const second = applyMutation('constant-perturbation', source);

    expect(first.content).toBe(second.content);
    expect(first.line).toBe(second.line);
  });

  it('reuses the target line indentation', () => {
    // The first *eligible* line is the indented one: every doc-comment line
    // above it is ineligible, so the operator has to skip them and copy the indent.
    const indented = ['/**', ' * Block.', ' */', '  const inner = 1;'].join('\n');
    const result = applyMutation('comment-noise', indented);

    expect(result.content.split('\n')[3]).toBe('  /* mutant:comment-noise */');
  });

  it('never perturbs a hex literal, a member number or a version string', () => {
    const tricky = ['const mask = 0xFF;', 'const major = 2.5;', 'const version = "v1";'].join('\n');
    const result = applyMutation('constant-perturbation', tricky);

    expect(result.content).toBe(tricky);
    expect(result.changed).toBe(false);
  });

  it.each(MUTATION_OPERATOR_NAMES)('reports not-applied for an all-quote file: %s', (name) => {
    const quoted = ['const a = "one";', "const b = 'two';", 'const c = `three`;'].join('\n');
    const result = applyMutation(name, quoted);

    expect(result.changed).toBe(false);
    expect(result.line).toBeNull();
    expect(result.content).toBe(quoted);
  });
});

/**
 * IMMUNITY TEST #1 (non-negotiable, per spec §Testing).
 *
 * The no-quote eligibility rule is the entire safety argument for writing
 * automated mutations into a user's source. If it regresses, this test fails
 * loudly instead of silently corrupting string literals.
 */
describe('template-literal immunity', () => {
  it('leaves a template-literal-dense file byte-identical for every operator', () => {
    const dense = [
      "import type { Config } from './config.js';",
      'const template = `line one ${1 + 1}`;',
      'const other = `line two ${value}`;',
      'const label = "plain string";',
      'export const tpl = (v: string) => `value: ${v}`;',
      "const single = 'single quoted';",
    ].join('\n');

    for (const name of MUTATION_OPERATOR_NAMES) {
      const result = applyMutation(name, dense);

      expect(result.changed, `${name} must not mutate a quote-dense file`).toBe(false);
      expect(result.content).toBe(dense);
    }
  });
});

describe('MUTATION_OPERATORS', () => {
  it('exposes exactly the declared operator names', () => {
    // Comparar las claves de MUTATION_OPERATORS (ordenadas) con MUTATION_OPERATOR_NAMES (ordenadas)
    expect(Object.keys(MUTATION_OPERATORS).sort()).toEqual([...MUTATION_OPERATOR_NAMES].sort());
  });

  it.each(MUTATION_OPERATOR_NAMES)('self-identifies as %s', (name) => {
    expect(MUTATION_OPERATORS[name].name).toBe(name);
  });
});

describe('isKnownOperator', () => {
  it('accepts declared names', () => {
    for (const name of MUTATION_OPERATOR_NAMES) {
      expect(isKnownOperator(name)).toBe(true);
    }
  });

  it('rejects unknown names', () => {
    expect(isKnownOperator('reorder-imports')).toBe(false);
    expect(isKnownOperator('')).toBe(false);
  });
});
