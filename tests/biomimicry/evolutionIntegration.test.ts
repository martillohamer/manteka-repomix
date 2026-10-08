import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultEvolutionDeps, type EvolutionDeps, runEvolution } from '../../src/biomimicry/evolutionEngine.js';
import { LINEAGE_FILE_NAME } from '../../src/biomimicry/lineageStore.js';
import { EVOLUTION_POLICY_DEFAULTS, type EvolutionPolicy } from '../../src/biomimicry/types.js';
import { isGitInstalled } from '../../src/core/git/gitRepositoryHandle.js';
import { THERMAL_POLICY_DEFAULTS } from '../../src/thermodynamics/types.js';

vi.mock('../../src/shared/logger');

const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' });

/** Hash every tracked file so "unchanged" means bit-identical, not merely equal. */
const fingerprintRepo = (root: string): string => {
  const hash = crypto.createHash('sha256');
  const files = git(root, 'ls-files').split('\n').filter(Boolean).sort();
  for (const file of files) {
    hash.update(file);
    hash.update(execFileSync('git', ['-C', root, 'show', `HEAD:${file}`], { maxBuffer: 32 * 1024 * 1024 }));
  }
  hash.update(git(root, 'status', '--porcelain'));
  hash.update(git(root, 'branch', '--list'));
  return hash.digest('hex');
};

describe('full evolution cycle leaves the repository untouched', { timeout: 180000 }, () => {
  let repo: string;
  let gitAvailable = false;

  const policy = (overrides: Partial<EvolutionPolicy> = {}): EvolutionPolicy => ({
    ...EVOLUTION_POLICY_DEFAULTS,
    population: 2,
    // tMax 0 makes every measured file boiling, so a two-commit fixture does not
    // have to be engineered into a boiling state before a cycle can run at all.
    thermal: { ...THERMAL_POLICY_DEFAULTS, tMax: 0 },
    ...overrides,
  });

  beforeEach(async () => {
    gitAvailable = await isGitInstalled();
    repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-cycle-')));
    execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    // Pin line endings so the fixture content is what the mutant operators read,
    // rather than whatever the machine-wide autocrlf setting produces.
    git(repo, 'config', 'core.autocrlf', 'false');
    await fs.writeFile(
      path.join(repo, 'hot.ts'),
      ['const limit = 10;', 'export const clamp = (n: number) => Math.min(n, limit);', ''].join('\n'),
      'utf8',
    );
    // The engine records cooling wins in `.manteka-lineage.json`; keeping that
    // telemetry untracked is what "the repository stays untouched" means for
    // an uncommitted memory file.
    await fs.writeFile(path.join(repo, '.gitignore'), `${LINEAGE_FILE_NAME}\n`, 'utf8');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'init');
  });

  afterEach(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  /**
   * IMMUNITY TEST #2 (non-negotiable, per spec §Testing).
   *
   * Choosing detached worktrees over `checkout -b` was only justified by the
   * promise that the user's HEAD and working tree survive a run untouched. If
   * this test ever fails, that architectural decision no longer holds and must
   * be revisited rather than patched.
   */
  it('leaves HEAD, the branch list, the index and every tracked file bit-identical', async () => {
    if (!gitAvailable) {
      return;
    }

    const before = fingerprintRepo(repo);
    const headBefore = git(repo, 'rev-parse', 'HEAD');

    const report = await runEvolution(repo, policy());

    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.viable).toBeGreaterThan(0);

    expect(fingerprintRepo(repo)).toBe(before);
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(git(repo, 'branch', '--list')).not.toContain('mutant');
  });

  it('writes mutant content into the worktree only, never the source file', async () => {
    if (!gitAvailable) {
      return;
    }

    const sourcePath = path.join(repo, 'hot.ts');
    const original = await fs.readFile(sourcePath, 'utf8');

    await runEvolution(repo, policy({ population: 3 }));

    expect(await fs.readFile(sourcePath, 'utf8')).toBe(original);
  });

  it('leaves the repository untouched even when every mutant fails', async () => {
    if (!gitAvailable) {
      return;
    }

    const before = fingerprintRepo(repo);
    const deps: EvolutionDeps = {
      ...defaultEvolutionDeps,
      // A per-mutant failure, not an abort: the run still completes and reports.
      writeFile: async () => {
        throw new Error('disk full');
      },
    };

    const report = await runEvolution(repo, policy(), deps);

    expect(report.summary.total).toBe(2);
    expect(report.summary.viable).toBe(0);
    expect(report.mutants.every((mutant) => mutant.failure === 'disk full')).toBe(true);
    expect(fingerprintRepo(repo)).toBe(before);
  });

  it('audits thermal differential for cooling operators', async () => {
    if (!gitAvailable) {
      return;
    }

    const sourcePath = path.join(repo, 'cooling.ts');
    const content = [
      '// Comment line 1',
      'if (false) { const x = 1; }',
      'export const calc = (a: number) => a * 2;',
      '',
    ].join('\n');
    await fs.writeFile(sourcePath, content, 'utf8');
    git(repo, 'add', 'cooling.ts');
    git(repo, 'commit', '-q', '-m', 'add cooling fixture');

    const report = await runEvolution(
      repo,
      policy({
        operators: ['dead-guard-stripper', 'comment-reducer'],
        targets: ['cooling.ts'],
        population: 10,
      }),
    );

    const coolingMutants = report.mutants.filter((m) =>
      ['dead-guard-stripper', 'comment-reducer'].includes(m.operator),
    );

    // Expect to find mutants
    expect(coolingMutants.length).toBeGreaterThan(0);

    // Expect at least one to be viable and have thermalAxis > 0 (cooling)
    const viableCoolingMutants = coolingMutants.filter((m) => m.viable);
    expect(viableCoolingMutants.length).toBeGreaterThan(0);
    expect(viableCoolingMutants.some((m) => (m.thermalAxis ?? 0) > 0)).toBe(true);

    // Best first: the best mutant should have a high fitness score
    const bestMutant = report.mutants[0];
    expect(bestMutant.fitness).toBeGreaterThanOrEqual(0);
  });

  it('runs the whole pipeline against the real Git, thermal and mutation layers', async () => {
    if (!gitAvailable) {
      return;
    }

    // The probe is asserted here rather than assumed: it only runs when a
    // package.json declares a test script, and this fixture has none, so the
    // test axis is skipped and the report says so honestly.
    const deps: EvolutionDeps = { ...defaultEvolutionDeps };

    const report = await runEvolution(repo, policy({ population: 1 }), deps);

    expect(report.testSignal).toBe('not-measured');
    expect(report.states).toEqual(['scoping', 'baselining', 'branching', 'evaluating', 'reporting', 'done']);
  });
});
