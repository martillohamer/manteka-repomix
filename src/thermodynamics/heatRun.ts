import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execGitShortHead } from '../core/git/gitCommand.js';
import { isGitRepository } from '../core/git/gitRepositoryHandle.js';
import { logger } from '../shared/logger.js';
import { analyzeComplexity } from './complexity.js';
import { getFileActivity } from './gitActivity.js';
import { bandFor, isBoiling } from './heatColors.js';
import { computeFactors, computeTemperature } from './temperature.js';
import {
  type FileActivity,
  type FileTemperature,
  THERMAL_SATURATIONS,
  THERMAL_WEIGHTS,
  type ThermalPolicy,
  type ThermalRunResult,
} from './types.js';

/**
 * Source extensions the walker considers. Anything outside this list is skipped
 * before the file is opened, which keeps images, fixtures and lockfiles out of
 * the statistics without paying for a content sniff on every file.
 */
const SOURCE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'mts',
  'cts',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'rb',
  'php',
  'cs',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'swift',
  'scala',
  'sql',
  'sh',
  'bash',
  'zsh',
  'vue',
  'svelte',
]);

/**
 * Directories that hold generated or vendored code. Measuring them produces a
 * temperature that reflects the build, not the codebase, so they are pruned at
 * the directory level rather than filtered after the fact.
 */
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'lib',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  'vendor',
  'target',
  '.manteka-memory',
  '.idea',
  '.vscode',
]);

/** A NUL byte is the conventional marker of a non-text payload. */
const BINARY_MARKER = '\u0000';

const toPosix = (value: string): string => value.split(path.sep).join('/');

export interface HeatRunDeps {
  isGitRepository: (directory: string) => Promise<boolean>;
  execGitShortHead: (directory: string) => Promise<string>;
  getFileActivity: (
    directory: string,
    options: { windowDays: number; maxCommits: number },
  ) => Promise<Map<string, FileActivity>>;
  readFile: (target: string) => Promise<string>;
  collectSourceFiles: (root: string) => Promise<string[]>;
  now: () => Date;
}

const walk = async (directory: string, prefix: string, found: string[]): Promise<void> => {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    logger.trace('Skipping unreadable directory:', (error as Error).message);
    return;
  }

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isSymbolicLink()) {
      // Following links invites cycles and would let a tree escape its root.
      continue;
    }
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await walk(path.join(directory, entry.name), relative, found);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).slice(1).toLowerCase();
    if (SOURCE_EXTENSIONS.has(extension)) {
      found.push(relative);
    }
  }
};

/**
 * Enumerate analysable source files relative to the analysed directory.
 *
 * The returned paths use forward slashes so they line up with the keys produced
 * by `git log --name-only --relative`, which is what lets history be joined to
 * files without rewriting separators on Windows.
 */
export const collectSourceFiles = async (root: string): Promise<string[]> => {
  const found: string[] = [];
  await walk(root, '', found);
  return found.sort();
};

const defaultDeps: HeatRunDeps = {
  isGitRepository,
  execGitShortHead,
  getFileActivity,
  readFile: (target) => fs.readFile(target, 'utf8'),
  collectSourceFiles,
  now: () => new Date(),
};

const readFileLines = (content: string): number => (content.length === 0 ? 0 : content.split('\n').length);

const analyseFile = async (
  relativePath: string,
  root: string,
  activity: Map<string, FileActivity>,
  deps: HeatRunDeps,
): Promise<FileTemperature | null> => {
  let content: string;
  try {
    content = await deps.readFile(path.join(root, relativePath));
  } catch (error) {
    logger.trace('Skipping unreadable file:', (error as Error).message);
    return null;
  }

  if (content.includes(BINARY_MARKER)) {
    return null;
  }

  const activityForFile = activity.get(relativePath) ?? { commits: 0, authors: 0 };
  const lines = readFileLines(content);
  const profile = analyzeComplexity(content, path.extname(relativePath));

  const inputs = {
    commits: activityForFile.commits,
    authors: activityForFile.authors,
    lines,
    complexityDensity: profile.density,
  };

  const factors = computeFactors(inputs, THERMAL_SATURATIONS);
  const temperature = computeTemperature(factors, THERMAL_WEIGHTS);

  return {
    path: toPosix(relativePath),
    commits: inputs.commits,
    authors: inputs.authors,
    lines,
    logicalLines: profile.logicalLines,
    branchTokens: profile.branchTokens,
    complexityDensity: profile.density,
    factors,
    temperature,
    band: bandFor(temperature).name,
  };
};

const loadGitContext = async (
  root: string,
  policy: ThermalPolicy,
  deps: HeatRunDeps,
): Promise<{ isGitRepo: boolean; head: string | null; activity: Map<string, FileActivity> }> => {
  const isGitRepo = await deps.isGitRepository(root);
  if (!isGitRepo) {
    return { isGitRepo: false, head: null, activity: new Map() };
  }

  let head: string | null = null;
  try {
    head = await deps.execGitShortHead(root);
  } catch (error) {
    // A repository with no commits yet has a valid work tree but no HEAD.
    logger.trace('Could not resolve HEAD:', (error as Error).message);
  }

  let activity: Map<string, FileActivity> = new Map();
  try {
    activity = await deps.getFileActivity(root, {
      windowDays: policy.windowDays,
      maxCommits: policy.maxCommits,
    });
  } catch (error) {
    // Entropy degrades to size and complexity rather than failing the analysis.
    logger.trace('Could not read git activity:', (error as Error).message);
  }

  return { isGitRepo, head, activity };
};

/**
 * Analyse a directory and rank its files by temperature.
 *
 * Every collaborator is injected so the orchestration can be exercised without a
 * repository on disk, and so the degrade paths (no git, no commits, unreadable
 * file, binary payload) are reachable from tests instead of only from a
 * machine that happens to have that exact state.
 */
export const runHeatAnalysis = async (
  targetDirectory: string,
  policy: ThermalPolicy,
  deps: HeatRunDeps = defaultDeps,
): Promise<ThermalRunResult> => {
  const root = path.resolve(targetDirectory);
  const { isGitRepo, head, activity } = await loadGitContext(root, policy, deps);
  const discovered = await deps.collectSourceFiles(root);

  const analysed = (
    await Promise.all(discovered.map((relative) => analyseFile(relative, root, activity, deps)))
  ).filter((entry): entry is FileTemperature => entry !== null);

  const files = [...analysed].sort((a, b) => b.temperature - a.temperature || a.path.localeCompare(b.path));
  const boilingFiles = files.filter((file) => isBoiling(file.temperature, policy.tMax));

  return {
    repoRoot: root,
    isGitRepo,
    head,
    generatedAt: deps.now().toISOString(),
    policy,
    summary: {
      fileCount: files.length,
      boilingFiles: boilingFiles.length,
      maxTemperature: files.length > 0 ? files[0].temperature : 0,
      meanTemperature: files.length > 0 ? files.reduce((sum, file) => sum + file.temperature, 0) / files.length : 0,
    },
    files,
    boilingFiles,
  };
};
