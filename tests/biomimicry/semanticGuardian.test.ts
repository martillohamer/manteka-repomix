import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SemanticGuardian } from '../../src/biomimicry/semanticGuardian.js';

const LAWS_MANIFEST = [
  'laws:',
  '  - id: "no-console"',
  '    description: "no console"',
  '    disallowedNode: "CallExpression"',
  '    expression: "console.log"',
  '  - id: "no-mutable-exports"',
  '    description: "exported bindings must use const"',
  '    disallowedNode: "lexical_declaration"',
  '    parentType: "export_statement"',
  '    declarationType: "let"',
  '',
].join('\n');

describe('SemanticGuardian', () => {
  let tmp: string;
  let guardian: SemanticGuardian;

  beforeEach(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-laws-')));
    const lawsPath = path.join(tmp, '.manteka-laws.yaml');
    await fs.writeFile(lawsPath, LAWS_MANIFEST, 'utf8');
    guardian = new SemanticGuardian(lawsPath);
    await guardian.loadLaws();
  });

  afterEach(async () => {
    await guardian.dispose();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('accepts code that breaks no law', async () => {
    const result = await guardian.validateMutation(
      ['const x = 1;', 'export const y = x + 2;', ''].join('\n'),
      'test.ts',
    );

    expect(result.valid).toBe(true);
    expect(result.violation).toBeUndefined();
  });

  it('rejects a call expression banned by the manifest', async () => {
    const result = await guardian.validateMutation('console.log("hello");\n', 'test.ts');

    expect(result.valid).toBe(false);
    expect(result.violation).toContain('no-console');
  });

  it('rejects an exported let binding but allows an exported const', async () => {
    const mutable = await guardian.validateMutation('export let mutable = 1;\n', 'test.ts');
    expect(mutable.valid).toBe(false);
    expect(mutable.violation).toContain('no-mutable-exports');

    const immutable = await guardian.validateMutation('export const fixed = 1;\n', 'test.ts');
    expect(immutable.valid).toBe(true);
  });

  it('ignores a plain let that is not exported', async () => {
    const result = await guardian.validateMutation('let scoped = 1;\n', 'test.ts');

    expect(result.valid).toBe(true);
  });

  it('stays idle without a manifest instead of failing the run', async () => {
    const orphan = new SemanticGuardian(path.join(tmp, 'missing.yaml'));
    await orphan.loadLaws();

    const result = await orphan.validateMutation('console.log("anything");\n', 'test.ts');

    expect(result.valid).toBe(true);
    await orphan.dispose();
  });
});
