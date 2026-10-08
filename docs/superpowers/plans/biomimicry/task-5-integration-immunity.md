> Constraints, file map, execution order and Definition of Done: [README](./README.md).

## Task 5: Full-cycle integration and repository immunity

**Files:** create `tests/biomimicry/evolutionIntegration.test.ts`. This task adds no production code.

**Why this task exists:** Task 2's real-Git test proves a *single* worktree is isolated. This proves a *complete evolution run* leaves nothing behind — HEAD, branch list, index, and every tracked file.

**Interfaces:** consumes `runEvolution`, `defaultEvolutionDeps` from `src/biomimicry/evolutionEngine.js` and `isGitInstalled` from `src/core/git/gitRepositoryHandle.js`.

**Drive the production dependency graph.** These tests call `runEvolution(repo, policy)` with *no* injected deps in the happy paths. Reconstructing collaborators here would let the test pass while the shipped wiring is broken, which is the exact failure this file exists to catch.

- [ ] **Step 1: Create the test**

```ts
import { execFile, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultEvolutionDeps,
  runEvolution,
  type EvolutionDeps,
} from '../../src/biomimicry/evolutionEngine.js';
import { EVOLUTION_POLICY_DEFAULTS, type EvolutionPolicy } from '../../src/biomimicry/types.js';
import { THERMAL_POLICY_DEFAULTS } from '../../src/thermodynamics/types.js';
import { isGitInstalled } from '../../src/core/git/gitRepositoryHandle.js';

vi.mock('../../src/shared/logger');

const execFileAsync = promisify(execFile) as unknown as EvolutionDeps['execFileAsync'];

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
    await fs.writeFile(
      path.join(repo, 'hot.ts'),
      ['const limit = 10;', 'export const clamp = (n: number) => Math.min(n, limit);', ''].join('\n'),
      'utf8',
    );
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

  it('runs the whole pipeline against the real Git, thermal and mutation layers', async () => {
    if (!gitAvailable) {
      return;
    }

    // `execFileAsync` is asserted here rather than assumed: the probe only runs
    // when a package.json declares a test script, and this fixture has none.
    const deps: EvolutionDeps = { ...defaultEvolutionDeps, execFileAsync };

    const report = await runEvolution(repo, policy({ population: 1 }), deps);

    expect(report.testSignal).toBe('not-measured');
    expect(report.states).toEqual(['scoping', 'baselining', 'branching', 'evaluating', 'reporting', 'done']);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run tests/biomimicry/evolutionIntegration.test.ts`
Expected: PASS, 4 tests, each completing well inside 180 000 ms.

If it fails, **stop and diagnose rather than weakening the assertion.** A failure here means a mutant is escaping its worktree, which is the one bug this whole architecture exists to prevent.

- [ ] **Step 3: Confirm no worktree residue is left in the user's repository**

Run: `git worktree list`
Expected: exactly one entry, the main worktree. No `mutant` entries, no stale `prunable` markers.

Run: `git status --porcelain`
Expected: empty apart from files this phase legitimately changed.

- [ ] **Step 4: Commit**

```bash
git add tests/biomimicry/evolutionIntegration.test.ts
git commit -m "test(biomimicry): assert a full evolution cycle leaves the repository untouched"
```
