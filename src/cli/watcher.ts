import path from 'node:path';
import type { ChokidarOptions, FSWatcher } from 'chokidar';
import pc from 'picocolors';
import type { EvolutionReport } from '../biomimicry/types.js';
import { logger } from '../shared/logger.js';

/**
 * The Manteka Watcher daemon core (Phase 7.1).
 *
 * A save on any source file schedules one evolution cycle — semantic guardian,
 * thermal ranking and lineage write-back included — through a debounce +
 * single-flight queue, so a burst of editor events produces exactly one cycle
 * and a cycle is never run twice concurrently.
 */

const DEFAULT_DEBOUNCE_MS = 300;

/** chokidar `awaitWriteFinish`: half-written files must not trigger a cycle. */
const WRITE_STABILITY_THRESHOLD_MS = 100;

/** Extensions the heat analysis and the mutation operators can actually act on. */
const SOURCE_FILE_PATTERN = /\.(c|cc|cpp|cs|cjs|go|h|hpp|java|js|jsx|mjs|php|py|rb|rs|ts|tsx)$/i;

/** Never descend into dependency, VCS or build trees (relative path segments). */
const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'build',
  '.manteka-memory',
]);

/**
 * Builds the chokidar `ignored` predicate. Segment checks run on the path
 * relative to the watched root so a repository that merely lives inside a
 * directory named `build` is not silently excluded in its entirety.
 *
 * Directories are never filtered by extension (chokidar must descend into
 * them); extensionless paths are assumed to be directories when the caller
 * provides no stats, which is chokidar's own traversal order.
 */
export const createWatchIgnore =
  (root: string) =>
  (watchedPath: string, stats?: { isDirectory(): boolean }): boolean => {
    if (watchedPath === root) {
      return false;
    }
    const segments = path.relative(root, watchedPath).split(path.sep);
    if (segments.some((segment) => IGNORED_DIRECTORIES.has(segment))) {
      return true;
    }
    const looksLikeDirectory = stats === undefined ? path.extname(watchedPath) === '' : stats.isDirectory();
    if (looksLikeDirectory) {
      return false;
    }
    return !SOURCE_FILE_PATTERN.test(watchedPath);
  };

/**
 * One human line per cycle. The positive branch is the headline the daemon
 * exists for; viable-but-not-cooling runs are reported dimly so a watch session
 * reads as a stream of thermal verdicts rather than a wall of green.
 */
export const formatWatchCycleReport = (report: EvolutionReport): string => {
  const best = report.mutants[0];
  if (best === undefined || !best.viable) {
    return pc.dim('○ Sin mutaciones viables en este ciclo');
  }

  const axis = best.thermalAxis ?? 0;
  const percent = best.temperatureBefore > 0 ? (axis / best.temperatureBefore) * 100 : 0;
  const delta = `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;

  if (axis > 0) {
    return [
      '🧬',
      pc.green('Mutación térmica aplicada con éxito'),
      '|',
      pc.cyan(`ΔT: ${delta}`),
      '|',
      pc.yellow(`Operador: ${best.operator}`),
      '|',
      pc.dim(best.targetFile),
    ].join(' ');
  }
  return pc.dim(`○ Ciclo sin enfriamiento · mejor ${best.operator} (ΔT: ${delta})`);
};

export interface EvolutionWatcherOptions {
  readonly root: string;
  /** One full evolution cycle; injected so tests never spawn real Git worktrees. */
  readonly runCycle: (root: string) => Promise<EvolutionReport>;
  readonly debounceMs?: number;
  readonly onReport?: (line: string) => void;
  readonly onError?: (message: string) => void;
  /** chokidar's `watch`, injectable for tests; lazily imported by default. */
  readonly watch?: (paths: string | string[], options?: ChokidarOptions) => FSWatcher;
}

export interface EvolutionWatcherHandle {
  /** Fires a pending debounce immediately, then resolves when the queue is drained. */
  settle(): Promise<void>;
  /** Stops watching and waits for the in-flight cycle before resolving. */
  close(): Promise<void>;
}

const defaultWatch = async (): Promise<(paths: string | string[], options?: ChokidarOptions) => FSWatcher> => {
  const chokidar = await import('chokidar');
  return chokidar.watch;
};

export const startEvolutionWatcher = async (options: EvolutionWatcherOptions): Promise<EvolutionWatcherHandle> => {
  const { root, runCycle } = options;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const onReport = options.onReport ?? ((line: string) => logger.log(line));
  const onError = options.onError ?? ((message: string) => logger.error(pc.red(`✖ ${message}`)));

  const ignore = createWatchIgnore(root);
  const watchFn = options.watch ?? (await defaultWatch());

  const watcher = watchFn(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: WRITE_STABILITY_THRESHOLD_MS },
    ignored: ignore,
  });

  let closed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let queued = false;

  /** Single-flight drain: later triggers while a cycle runs queue exactly one follow-up. */
  const drain = (): Promise<void> => {
    if (inFlight !== null) {
      queued = true;
      return inFlight;
    }
    inFlight = (async () => {
      try {
        while (!closed) {
          queued = false;
          try {
            const report = await runCycle(root);
            onReport(formatWatchCycleReport(report));
          } catch (error) {
            // A failed cycle is data, not a dead daemon: keep watching.
            onError(`Evolution cycle failed: ${(error as Error).message}`);
          }
          if (!queued) {
            break;
          }
        }
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const onSourceEvent = (changedPath: string): void => {
    if (closed || ignore(changedPath)) {
      return;
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!closed) {
        void drain();
      }
    }, debounceMs);
  };

  watcher.on('change', onSourceEvent);
  watcher.on('add', onSourceEvent);
  watcher.on('unlink', onSourceEvent);
  watcher.on('error', (error: unknown) => {
    onError(`File watcher error: ${(error as Error).message}`);
  });

  const settle = async (): Promise<void> => {
    for (;;) {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        if (!closed) {
          void drain();
        }
      }
      if (inFlight === null) {
        return;
      }
      await inFlight;
    }
  };

  const close = async (): Promise<void> => {
    closed = true;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    try {
      await watcher.close();
    } catch (error) {
      onError(`Error closing watcher: ${(error as Error).message}`);
    }
    if (inFlight !== null) {
      await inFlight;
    }
  };

  return { settle, close };
};
