> Constraints, file map, execution order and Definition of Done: [README](./README.md).

## Task 2: Mutation sandbox

**Files:**
- Create: `src/biomimicry/mutationSandbox.ts`
- Test: `tests/biomimicry/mutationSandbox.test.ts`

**Interfaces:**
- Consumes: `GIT_UNTRUSTED_CONFIG_ARGS`, `validateGitRef` from `src/core/git/gitCommand.js`; `getRepomixTmpDir` from `src/shared/tmpDir.js`; `logger` from `src/shared/logger.js`
- Produces:
  - `ExecFileLike` type: `(file: string, args: string[], options?: { cwd?: string; timeout?: number; maxBuffer?: number }) => Promise<{ stdout: string; stderr: string }>`
  - `MutationSandboxDeps`
  - `MutationSandbox` interface: `{ runDir: string; worktreePath(id): string; createWorktree(id, baseRef): Promise<string>; removeWorktree(p): Promise<void>; dispose(): Promise<void> }`
  - `createMutationSandbox(repoRoot, runId, deps?): MutationSandbox`

**Why detached worktrees, not branches:** `git worktree add --detach` creates **no ref** in the user's repository, so a failed cleanup leaves nothing behind. `git checkout -b mutante/...` would create a branch that survives a crash. Because a worktree materialises from a commit rather than the index, **uncommitted work in the main tree is never at risk** — there is no clean-tree precondition.

- [ ] **Step 1: Write the failing test**

```ts
import { execFile, execFileSync } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMutationSandbox,
  type MutationSandboxDeps,
} from '../../src/biomimicry/mutationSandbox.js';
import { isGitInstalled } from '../../src/core/git/gitRepositoryHandle.js';

vi.mock('../../src/shared/logger');

/** `promisify(execFile)`, not `execFileSync`: the sandbox contract is a promise returning `{ stdout, stderr }`. */
const realExec = promisify(execFile) as unknown as MutationSandboxDeps['execFileAsync'];

describe('createMutationSandbox (argv contract)', () => {
  const buildDeps = (overrides: Partial<MutationSandboxDeps> = {}): MutationSandboxDeps => ({
    execFileAsync: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    rmSync: vi.fn(),
    registerExitHook: vi.fn().mockReturnValue(vi.fn()),
    tmpRoot: path.join(os.tmpdir(), 'biomimicry-test'),
    ...overrides,
  });

  it('creates a detached worktree with hardening args and no branch', async () => {
    const deps = buildDeps();
    const sandbox = createMutationSandbox('/repo', 'run-1', deps);

    await sandbox.createWorktree('mutant-aaa', 'HEAD');

    // Call 0 is the defensive prune; the `add` that materialises the mutant is call 1.
    const [file, args] = (deps.execFileAsync as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(file).toBe('git');
    expect(args).toContain('-c');
    expect(args).toContain('core.fsmonitor=');
    expect(args).toContain('--detach');
    expect(args).toContain('worktree');
    expect(args).not.toContain('-b');
  });

  it('places the worktree inside the run directory', async () => {
    const deps = buildDeps();
    const sandbox = createMutationSandbox('/repo', 'run-1', deps);

    const worktree = await sandbox.createWorktree('mutant-aaa', 'HEAD');

    expect(path.dirname(worktree)).toBe(sandbox.runDir);
    expect(path.basename(worktree)).toBe('mutant-aaa');
  });

  it('rejects a base ref that could be read as an option', async () => {
    const sandbox = createMutationSandbox('/repo', 'run-1', buildDeps());

    await expect(sandbox.createWorktree('mutant-aaa', '--upload-pack=evil')).rejects.toThrow(/must not start with '-'/);
  });

  it('rejects a mutation id that could be read as an option', async () => {
    const sandbox = createMutationSandbox('/repo', 'run-1', buildDeps());

    await expect(sandbox.createWorktree('-oops', 'HEAD')).rejects.toThrow(/must not start with '-'/);
  });

  it('prunes before adding so a previous crash cannot block the call', async () => {
    const deps = buildDeps();
    const sandbox = createMutationSandbox('/repo', 'run-1', deps);

    await sandbox.createWorktree('mutant-aaa', 'HEAD');

    const calls = (deps.execFileAsync as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][1]).toContain('prune');
    expect(calls[1][1]).toContain('add');
  });

  it('never throws when removal fails, so a successful run stays successful', async () => {
    const execFileAsync = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockRejectedValue(new Error('worktree is locked'));
    const sandbox = createMutationSandbox('/repo', 'run-1', buildDeps({ execFileAsync }));

    await sandbox.createWorktree('mutant-aaa', 'HEAD');
    await expect(sandbox.removeWorktree(path.join(sandbox.runDir, 'mutant-aaa'))).resolves.toBeUndefined();
  });
});

describe('createMutationSandbox (real git)', () => {
  let repo: string;
  let gitAvailable = false;

  beforeEach(async () => {
    gitAvailable = await isGitInstalled();
    repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-biome-repo-')));
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    // Pin line endings in the fixture: the machine-wide autocrlf setting would
    // otherwise make the checked-out content CRLF and the assertion platform-dependent.
    git('config', 'core.autocrlf', 'false');
    await fs.writeFile(path.join(repo, 'a.ts'), 'const port = 8080;\n', 'utf8');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  const realDeps = (): MutationSandboxDeps => ({
    execFileAsync: realExec,
    mkdir: async (target) => {
      await fs.mkdir(target, { recursive: true });
      return undefined;
    },
    rm: async (target) => {
      await fs.rm(target, { recursive: true, force: true });
    },
    rmSync: (target) => {
      fsSync.rmSync(target, { recursive: true, force: true });
    },
    registerExitHook: () => () => {},
    // Deliberately outside the repository: a worktree nested inside the source
    // tree would show up as untracked and muddy the isolation assertion.
    tmpRoot: path.join(os.tmpdir(), 'biomimicry-real'),
  });

  it('materialises HEAD in an isolated checkout and removes it cleanly', { timeout: 60000 }, async () => {
    if (!gitAvailable) {
      return;
    }

    const sandbox = createMutationSandbox(repo, `run-real-${path.basename(repo)}`, realDeps());

    const worktree = await sandbox.createWorktree('mutant-aaa', 'HEAD');
    expect(await fs.readFile(path.join(worktree, 'a.ts'), 'utf8')).toBe('const port = 8080;\n');

    await fs.writeFile(path.join(worktree, 'a.ts'), 'const port = 9090;\n', 'utf8');
    await sandbox.removeWorktree(worktree);
    await sandbox.dispose();

    // The original work tree is untouched by the mutation.
    expect(await fs.readFile(path.join(repo, 'a.ts'), 'utf8')).toBe('const port = 8080;\n');
  });

  it('creates no branch ref in the source repository', { timeout: 60000 }, async () => {
    if (!gitAvailable) {
      return;
    }

    const sandbox = createMutationSandbox(repo, `run-noref-${path.basename(repo)}`, realDeps());

    await sandbox.createWorktree('mutant-bbb', 'HEAD');
    const branches = execFileSync('git', ['-C', repo, 'branch', '--list'], { encoding: 'utf8' });

    expect(branches).not.toContain('mutant-bbb');
    await sandbox.dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/biomimicry/mutationSandbox.test.ts`
Expected: FAIL with "Failed to resolve import" for `src/biomimicry/mutationSandbox.js`.

- [ ] **Step 3: Create `src/biomimicry/mutationSandbox.ts`**

```ts
import { execFile } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { GIT_UNTRUSTED_CONFIG_ARGS, validateGitRef } from '../core/git/gitCommand.js';
import { logger } from '../shared/logger.js';
import { getRepomixTmpDir } from '../shared/tmpDir.js';

const execFileAsync = promisify(execFile);

export const BIOMIMICRY_DIR_NAME = 'biomimicry';

const GIT_WORKTREE_TIMEOUT = 60000;

export type ExecFileLike = (
  file: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;

export interface MutationSandboxDeps {
  execFileAsync: ExecFileLike;
  mkdir: (target: string) => Promise<unknown>;
  rm: (target: string) => Promise<void>;
  rmSync: (target: string) => void;
  registerExitHook: (hook: () => void) => () => void;
  tmpRoot: string;
}

export interface MutationSandbox {
  readonly runDir: string;
  worktreePath: (mutationId: string) => string;
  createWorktree: (mutationId: string, baseRef: string) => Promise<string>;
  /** Never throws: a failed removal is logged, not surfaced. */
  removeWorktree: (worktreePath: string) => Promise<void>;
  dispose: () => Promise<void>;
}

const defaultDeps: MutationSandboxDeps = {
  execFileAsync: execFileAsync as unknown as ExecFileLike,
  mkdir: (target) => fs.mkdir(target, { recursive: true }),
  rm: (target) => fs.rm(target, { recursive: true, force: true }),
  rmSync: (target) => {
    fsSync.rmSync(target, { recursive: true, force: true });
  },
  // `exit` cannot await, so the hook only removes the directory tree. Dangling
  // worktree metadata is reclaimed by the `worktree prune` that runs at the
  // start of the next run.
  registerExitHook: (hook) => {
    process.on('exit', hook);
    return () => {
      process.off('exit', hook);
    };
  },
  tmpRoot: getRepomixTmpDir(),
};

const git = (deps: MutationSandboxDeps, args: string[]): Promise<{ stdout: string; stderr: string }> =>
  deps.execFileAsync('git', args, { timeout: GIT_WORKTREE_TIMEOUT });

/**
 * Materialises mutants in detached worktrees under `$TMPDIR/repomix/biomimicry/<runId>`.
 *
 * Detached rather than branched: `git worktree add --detach` writes no ref into
 * the user's repository, so an interrupted run cannot leave a stray branch
 * behind. Reading from a commit rather than the index means uncommitted work in
 * the main tree is never at risk, which is why there is no clean-tree
 * precondition here.
 */
export const createMutationSandbox = (
  repoRoot: string,
  runId: string,
  deps: MutationSandboxDeps = defaultDeps,
): MutationSandbox => {
  const runDir = path.join(deps.tmpRoot, BIOMIMICRY_DIR_NAME, runId);
  const worktreePath = (mutationId: string): string => path.join(runDir, mutationId);

  const releaseExitHook = deps.registerExitHook(() => {
    deps.rmSync(runDir);
  });

  return {
    runDir,
    worktreePath,

    createWorktree: async (mutationId, baseRef) => {
      validateGitRef(baseRef);
      validateGitRef(mutationId);

      const target = worktreePath(mutationId);
      await deps.mkdir(runDir);

      // A previous crash leaves metadata for a worktree whose directory is gone;
      // pruning first keeps that from blocking this call.
      try {
        await git(deps, ['-C', repoRoot, ...GIT_UNTRUSTED_CONFIG_ARGS, 'worktree', 'prune']);
      } catch (error) {
        logger.trace('worktree prune failed:', (error as Error).message);
      }

      // Pruning fixes dangling metadata but not a directory a crashed attempt
      // left behind, and `worktree add` refuses an existing path. Clearing it
      // makes a retried mutant id idempotent instead of a hard failure.
      await deps.rm(target);

      await git(deps, ['-C', repoRoot, ...GIT_UNTRUSTED_CONFIG_ARGS, 'worktree', 'add', '--detach', target, baseRef]);

      return target;
    },

    removeWorktree: async (target) => {
      try {
        await git(deps, ['-C', repoRoot, ...GIT_UNTRUSTED_CONFIG_ARGS, 'worktree', 'remove', '--force', target]);
      } catch (error) {
        // Cleanup must never convert a successful experiment into a failed
        // command, but the orphan path has to be visible so it can be removed.
        logger.warn(`Could not remove worktree ${target}: ${(error as Error).message}`);
      }
    },

    dispose: async () => {
      releaseExitHook();
      await deps.rm(runDir);
      try {
        await git(deps, ['-C', repoRoot, ...GIT_UNTRUSTED_CONFIG_ARGS, 'worktree', 'prune']);
      } catch (error) {
        logger.trace('worktree prune on dispose failed:', (error as Error).message);
      }
    },
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/biomimicry/mutationSandbox.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Lint and commit**

Run: `npm run lint`
Expected: `Found 0 warnings and 0 errors.`

```bash
git add src/biomimicry/mutationSandbox.ts tests/biomimicry/mutationSandbox.test.ts
git commit -m "feat(biomimicry): isolate mutants in detached Git worktrees"
```

---

