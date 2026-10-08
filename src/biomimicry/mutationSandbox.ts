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
 * Mutant worktrees are fresh checkouts, so `node_modules` is absent and the
 * project's own suite cannot run. A directory junction reuses the main
 * checkout's dependencies without copying them. A junction is a reparse point
 * rather than a real directory, so unlinking it never touches the target.
 */
const linkDependencies = (worktree: string, repoRoot: string): void => {
  const source = path.join(repoRoot, 'node_modules');
  if (!fsSync.existsSync(source)) {
    return;
  }
  try {
    fsSync.symlinkSync(source, path.join(worktree, 'node_modules'), 'junction');
  } catch (error) {
    logger.trace('node_modules junction failed:', (error as Error).message);
  }
};

const unlinkDependencies = (worktree: string): void => {
  try {
    fsSync.rmdirSync(path.join(worktree, 'node_modules'));
  } catch {
    // Best effort: `git worktree remove` and the exit hook reclaim the rest.
  }
};

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

      linkDependencies(target, repoRoot);

      return target;
    },

    removeWorktree: async (target) => {
      unlinkDependencies(target);
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
