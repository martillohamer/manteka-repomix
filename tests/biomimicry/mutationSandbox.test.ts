import { execFile, execFileSync } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMutationSandbox, type MutationSandboxDeps } from '../../src/biomimicry/mutationSandbox.js';
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

  it('links the main checkout dependencies into the worktree and unlinks them on removal', {
    timeout: 60000,
  }, async () => {
    if (!gitAvailable) {
      return;
    }

    const marker = path.join(repo, 'node_modules', 'marker.txt');
    await fs.mkdir(path.join(repo, 'node_modules'), { recursive: true });
    await fs.writeFile(marker, 'precious', 'utf8');

    const sandbox = createMutationSandbox(repo, `run-junction-${path.basename(repo)}`, realDeps());
    const worktree = await sandbox.createWorktree('mutant-junction', 'HEAD');

    const linked = path.join(worktree, 'node_modules', 'marker.txt');
    expect(await fs.readFile(linked, 'utf8')).toBe('precious');

    await sandbox.removeWorktree(worktree);
    await sandbox.dispose();

    expect(fsSync.existsSync(linked)).toBe(false);
    expect(await fs.readFile(marker, 'utf8')).toBe('precious');
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
