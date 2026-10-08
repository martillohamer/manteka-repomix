import { beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../../src/shared/logger.js';
import { aggregateActivity, getFileActivity, parseCommitBlocks } from '../../src/thermodynamics/gitActivity.js';

vi.mock('../../src/shared/logger');

/**
 * Reproduces the exact shape `git log --pretty=format:%x1e%H%x1f%an --name-only`
 * emits: a record separator, the hash, a field separator, the author, then one
 * file per line.
 */
const block = (hash: string, author: string, files: string[]): string =>
  `\x1e${hash}\x1f${author}\n${files.join('\n')}`;

describe('parseCommitBlocks', () => {
  test('parses a single commit with one file', () => {
    expect(parseCommitBlocks(block('abc123', 'Alice', ['src/a.ts']))).toEqual([
      { hash: 'abc123', author: 'Alice', files: ['src/a.ts'] },
    ]);
  });

  test('parses consecutive commits', () => {
    const raw = `${block('h1', 'Alice', ['a.ts', 'b.ts'])}\n${block('h2', 'Bob', ['a.ts'])}`;
    expect(parseCommitBlocks(raw)).toEqual([
      { hash: 'h1', author: 'Alice', files: ['a.ts', 'b.ts'] },
      { hash: 'h2', author: 'Bob', files: ['a.ts'] },
    ]);
  });

  test('drops the empty chunk before the leading record separator', () => {
    expect(parseCommitBlocks(block('h1', 'Alice', ['a.ts']))).toHaveLength(1);
  });

  test('ignores a chunk with no field separator', () => {
    expect(parseCommitBlocks('\x1egarbage-without-separator')).toEqual([]);
  });

  test('discards blank file lines', () => {
    const raw = `\x1eh1\x1fAlice\nsrc/a.ts\n\n\nsrc/b.ts\n`;
    expect(parseCommitBlocks(raw)[0].files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  test('returns a commit with no files for a merge record', () => {
    expect(parseCommitBlocks('\x1eh1\x1fAlice\n')).toEqual([{ hash: 'h1', author: 'Alice', files: [] }]);
  });

  test('tolerates carriage returns from git output', () => {
    const raw = block('h1', 'Alice', ['a.ts', 'b.ts']).replace(/\n/g, '\r\n');
    expect(parseCommitBlocks(raw)).toEqual([{ hash: 'h1', author: 'Alice', files: ['a.ts', 'b.ts'] }]);
  });

  test('preserves paths that contain spaces', () => {
    expect(parseCommitBlocks(block('h1', 'Alice', ['src/my file.ts']))[0].files).toEqual(['src/my file.ts']);
  });

  test('returns an empty list for empty output', () => {
    expect(parseCommitBlocks('')).toEqual([]);
  });

  test('never throws on unparseable garbage', () => {
    expect(() => parseCommitBlocks('\x1e\x1f\n\x1e\x1f\n')).not.toThrow();
  });
});

describe('aggregateActivity', () => {
  test('counts every commit that touched a file', () => {
    const activity = aggregateActivity([
      { hash: 'h1', author: 'Alice', files: ['a.ts'] },
      { hash: 'h2', author: 'Bob', files: ['a.ts'] },
    ]);
    expect(activity.get('a.ts')?.commits).toBe(2);
  });

  test('counts distinct authors per file', () => {
    const activity = aggregateActivity([
      { hash: 'h1', author: 'Alice', files: ['a.ts'] },
      { hash: 'h2', author: 'Bob', files: ['a.ts'] },
    ]);
    expect(activity.get('a.ts')?.authors.size).toBe(2);
  });

  test('counts one author once even across many of their commits', () => {
    const activity = aggregateActivity([
      { hash: 'h1', author: 'Alice', files: ['a.ts'] },
      { hash: 'h2', author: 'Alice', files: ['a.ts'] },
      { hash: 'h3', author: 'Alice', files: ['a.ts'] },
    ]);
    expect(activity.get('a.ts')?.commits).toBe(3);
    expect(activity.get('a.ts')?.authors.size).toBe(1);
  });

  test('tracks each file independently', () => {
    const activity = aggregateActivity([
      { hash: 'h1', author: 'Alice', files: ['a.ts', 'b.ts'] },
      { hash: 'h2', author: 'Bob', files: ['b.ts'] },
    ]);
    expect(activity.get('a.ts')?.commits).toBe(1);
    expect(activity.get('b.ts')?.commits).toBe(2);
    expect(activity.get('b.ts')?.authors.size).toBe(2);
  });

  test('ignores a file listed with no author', () => {
    const activity = aggregateActivity([
      { hash: 'h1', author: 'Alice', files: ['a.ts'] },
      { hash: 'h2', author: '', files: ['a.ts'] },
    ]);
    expect(activity.get('a.ts')?.commits).toBe(2);
    expect(activity.get('a.ts')?.authors.size).toBe(1);
  });

  test('returns an empty map for no commits', () => {
    expect(aggregateActivity([]).size).toBe(0);
  });
});

describe('getFileActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('reduces git output to commit and author counts per file', async () => {
    const raw = `${block('h1', 'Alice', ['a.ts'])}\n${block('h2', 'Bob', ['a.ts'])}\n${block('h3', 'Alice', ['b.ts'])}`;
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: raw });

    const result = await getFileActivity('/repo', { windowDays: 90, maxCommits: 500 }, { execFileAsync });

    expect(result.get('a.ts')).toEqual({ commits: 2, authors: 2 });
    expect(result.get('b.ts')).toEqual({ commits: 1, authors: 1 });
  });

  test('invokes git through execFile with the exact hardened argument vector', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '' });

    await getFileActivity('/repo', { windowDays: 90, maxCommits: 500 }, { execFileAsync });

    expect(execFileAsync).toHaveBeenCalledTimes(1);
    const [command, args] = execFileAsync.mock.calls[0] as [string, string[]];
    expect(command).toBe('git');
    expect(args).toEqual([
      '-C',
      '/repo',
      '-c',
      'core.fsmonitor=',
      'log',
      '--no-show-signature',
      '--no-ext-diff',
      '--no-textconv',
      '--pretty=format:%x1e%H%x1f%an',
      '--name-only',
      '--relative',
      '--since=90.days',
      '-n',
      '500',
    ]);
  });

  test('forwards the configured window and commit cap to git', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '' });

    await getFileActivity('/repo', { windowDays: 7, maxCommits: 25 }, { execFileAsync });

    const [, args] = execFileAsync.mock.calls[0] as [string, string[]];
    expect(args).toContain('--since=7.days');
    expect(args).toContain('25');
  });

  test('clamps a non-positive window and commit cap to a valid git value', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '' });

    await getFileActivity('/repo', { windowDays: 0, maxCommits: -5 }, { execFileAsync });

    const [, args] = execFileAsync.mock.calls[0] as [string, string[]];
    expect(args).toContain('--since=1.days');
    expect(args).toContain('1');
  });

  test('degrades to an empty map when git is unavailable', async () => {
    const execFileAsync = vi.fn().mockRejectedValue(new Error('git: command not found'));

    const result = await getFileActivity('/repo', { windowDays: 90, maxCommits: 500 }, { execFileAsync });

    expect(result.size).toBe(0);
    expect(logger.trace).toHaveBeenCalledWith('Failed to read git activity:', 'git: command not found');
  });

  test('degrades to an empty map when the repository has no commits', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '' });

    const result = await getFileActivity('/repo', { windowDays: 90, maxCommits: 500 }, { execFileAsync });

    expect(result.size).toBe(0);
  });

  test('tolerates unparseable git output without throwing', async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: 'not git output at all' });

    const result = await getFileActivity('/repo', { windowDays: 90, maxCommits: 500 }, { execFileAsync });

    expect(result.size).toBe(0);
  });
});
