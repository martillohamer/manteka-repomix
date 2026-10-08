import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GIT_LOG_HARDENING_ARGS, GIT_UNTRUSTED_CONFIG_ARGS } from '../core/git/gitCommand.js';
import { logger } from '../shared/logger.js';
import type { FileActivity } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Control characters chosen by `--pretty=format:%x1e%H%x1f%an`.
 *
 * Delimiting records and fields with bytes that cannot appear in a commit
 * message, a path or an author name is what makes this parse safe. Splitting
 * `git log` output on blank lines or on the `* author` banner instead breaks the
 * moment a commit touches no files, a path contains a blank line, or a merge
 * appears, and those are not exotic cases in a real repository.
 */
const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

/**
 * Git expands these `%xNN` escapes itself; it does not want the raw control
 * bytes here. The parser above then splits on the bytes Git actually emits.
 */
const GIT_RECORD_FORMAT = '%x1e';
const GIT_FIELD_FORMAT = '%x1f';

export interface GitActivityOptions {
  windowDays: number;
  maxCommits: number;
}

export interface RawCommitBlock {
  hash: string;
  author: string;
  files: string[];
}

export type ExecFileLike = (command: string, args: string[]) => Promise<{ stdout: string }>;

export interface GitActivityDeps {
  execFileAsync: ExecFileLike;
}

const defaultExecFileAsync: ExecFileLike = async (command, args) => {
  const result = await execFileAsync(command, args);
  return { stdout: result.stdout };
};

export const parseCommitBlocks = (raw: string): RawCommitBlock[] => {
  if (!raw) {
    return [];
  }

  const blocks: RawCommitBlock[] = [];

  for (const chunk of raw.split(RECORD_SEPARATOR)) {
    if (!chunk.trim()) {
      continue;
    }

    const separatorIndex = chunk.indexOf(FIELD_SEPARATOR);
    if (separatorIndex === -1) {
      continue;
    }

    const hash = chunk.slice(0, separatorIndex).trim();
    if (!hash) {
      continue;
    }

    const [author, ...rest] = chunk.slice(separatorIndex + 1).split('\n');
    const files = rest.map((line) => line.trim()).filter((line) => line.length > 0);

    blocks.push({ hash, author: (author ?? '').trim(), files });
  }

  return blocks;
};

export const aggregateActivity = (blocks: RawCommitBlock[]): Map<string, { commits: number; authors: Set<string> }> => {
  const activity = new Map<string, { commits: number; authors: Set<string> }>();

  for (const block of blocks) {
    for (const file of block.files) {
      let entry = activity.get(file);
      if (!entry) {
        entry = { commits: 0, authors: new Set<string>() };
        activity.set(file, entry);
      }
      entry.commits += 1;
      if (block.author) {
        entry.authors.add(block.author);
      }
    }
  }

  return activity;
};

const execFileActivityLog = async (
  directory: string,
  options: GitActivityOptions,
  deps: GitActivityDeps,
): Promise<string> => {
  const windowDays = Math.max(1, Math.floor(options.windowDays));
  const maxCommits = Math.max(1, Math.floor(options.maxCommits));

  try {
    const result = await deps.execFileAsync('git', [
      '-C',
      directory,
      ...GIT_UNTRUSTED_CONFIG_ARGS,
      'log',
      ...GIT_LOG_HARDENING_ARGS,
      `--pretty=format:${GIT_RECORD_FORMAT}%H${GIT_FIELD_FORMAT}%an`,
      '--name-only',
      // Paths in `git log` are repo-root relative; analysing a subdirectory
      // would otherwise key every file to a path that does not exist.
      '--relative',
      `--since=${windowDays}.days`,
      '-n',
      maxCommits.toString(),
    ]);

    return result.stdout || '';
  } catch (error) {
    // A missing git binary, a non-repository directory, a repository with no
    // commits and a shallow clone all land here. Entropy degrades to size and
    // structure rather than aborting the run.
    logger.trace('Failed to read git activity:', (error as Error).message);
    return '';
  }
};

export const getFileActivity = async (
  directory: string,
  options: GitActivityOptions,
  deps: GitActivityDeps = { execFileAsync: defaultExecFileAsync },
): Promise<Map<string, FileActivity>> => {
  const raw = await execFileActivityLog(directory, options, deps);
  const accumulated = aggregateActivity(parseCommitBlocks(raw));

  const activity = new Map<string, FileActivity>();
  for (const [file, entry] of accumulated) {
    activity.set(file, { commits: entry.commits, authors: entry.authors.size });
  }
  return activity;
};
