import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../shared/logger.js';
import { MUTATION_OPERATOR_NAMES } from './types.js';

/**
 * Genetic lineage: the persistent memory of what this repository's evolution
 * has already achieved. `.manteka-lineage.json` records every cooling win so
 * the next run starts wiser than a cold start, exactly as an epigenetic mark
 * persists across generations without editing the genome itself.
 */

export const LINEAGE_FILE_NAME = '.manteka-lineage.json';

export const LINEAGE_SCHEMA_VERSION = 1;

/** Oldest-first cap: telemetry that grows forever stops being telemetry. */
const MAX_ENTRIES = 500;

export interface LineageEntry {
  readonly operator: string;
  readonly targetFile: string;
  /** Cooling differential achieved (baseline − mutant); positive by definition of a win. */
  readonly thermalAxis: number;
  readonly fitness: number | null;
  /** ISO timestamp of the run that produced the win. */
  readonly recordedAt: string;
}

export interface Lineage {
  readonly schemaVersion: typeof LINEAGE_SCHEMA_VERSION;
  readonly entries: readonly LineageEntry[];
}

export const emptyLineage = (): Lineage => ({
  schemaVersion: LINEAGE_SCHEMA_VERSION,
  entries: [],
});

export const lineagePath = (repoRoot: string): string => path.join(repoRoot, LINEAGE_FILE_NAME);

const isLineageEntry = (value: unknown): value is LineageEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.operator === 'string' &&
    (MUTATION_OPERATOR_NAMES as readonly string[]).includes(entry.operator) &&
    typeof entry.targetFile === 'string' &&
    typeof entry.thermalAxis === 'number' &&
    Number.isFinite(entry.thermalAxis) &&
    (entry.fitness === null || typeof entry.fitness === 'number') &&
    typeof entry.recordedAt === 'string'
  );
};

/**
 * A missing, corrupt or partially invalid lineage is neutral history, not an
 * error: a run must never fail because telemetry is absent or unreadable.
 * Entries naming operators that no longer exist are dropped rather than kept
 * as dead weight in later rankings.
 */
export const loadLineage = async (repoRoot: string): Promise<Lineage> => {
  let raw: string;
  try {
    raw = await fs.readFile(lineagePath(repoRoot), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.trace('Lineage unreadable, starting from empty history:', (error as Error).message);
    }
    return emptyLineage();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return emptyLineage();
    }
    const candidate = parsed as { schemaVersion?: unknown; entries?: unknown };
    if (candidate.schemaVersion !== LINEAGE_SCHEMA_VERSION || !Array.isArray(candidate.entries)) {
      logger.trace('Lineage schema mismatch, starting from empty history.');
      return emptyLineage();
    }
    return {
      schemaVersion: LINEAGE_SCHEMA_VERSION,
      entries: candidate.entries.filter(isLineageEntry),
    };
  } catch (error) {
    logger.trace('Corrupt lineage, starting from empty history:', (error as Error).message);
    return emptyLineage();
  }
};

export const saveLineage = async (repoRoot: string, lineage: Lineage): Promise<void> => {
  await fs.writeFile(lineagePath(repoRoot), `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
};

/** Append a cooling win, trimming the oldest entry once the cap is reached. */
export const appendSuccess = (lineage: Lineage, entry: LineageEntry): Lineage => ({
  schemaVersion: LINEAGE_SCHEMA_VERSION,
  entries: [...lineage.entries, entry].slice(-MAX_ENTRIES),
});

const historyFor = (operators: readonly string[], lineage: Lineage): Map<string, { wins: number; cooling: number }> => {
  const history = new Map<string, { wins: number; cooling: number }>(
    operators.map((operator) => [operator, { wins: 0, cooling: 0 }]),
  );
  for (const entry of lineage.entries) {
    const bucket = history.get(entry.operator);
    if (bucket !== undefined) {
      bucket.wins += 1;
      bucket.cooling += entry.thermalAxis;
    }
  }
  return history;
};

/**
 * Epigenetic selection: operators with more historical wins rank first, ties
 * break by total cooling achieved and then by declaration order. The engine
 * feeds the result straight into the population cut, so favoured operators
 * earn the candidate slots first — without a single random draw, preserving
 * the "identical repository reproduces exactly" invariant.
 */
export const rankOperators = <T extends string>(operators: readonly T[], lineage: Lineage): T[] => {
  const history = historyFor(operators, lineage);

  return operators
    .map((operator, index) => {
      const bucket = history.get(operator) ?? { wins: 0, cooling: 0 };
      return { operator, index, wins: bucket.wins, cooling: bucket.cooling };
    })
    .sort((a, b) => b.wins - a.wins || b.cooling - a.cooling || a.index - b.index)
    .map((candidate) => candidate.operator);
};

/**
 * Smoothed success share per operator over the same lineage, on the
 * probability simplex (weights sum to 1). The +1 Laplace floor keeps an
 * untried operator at a non-zero probability — an operator weighted at zero
 * would never be tried again and could never prove itself.
 */
export const computeOperatorWeights = (operators: readonly string[], lineage: Lineage): Record<string, number> => {
  const history = historyFor(operators, lineage);
  const smoothed = operators.map((operator) => (history.get(operator)?.wins ?? 0) + 1);
  const total = smoothed.reduce((sum, weight) => sum + weight, 0);

  return Object.fromEntries(operators.map((operator, index) => [operator, smoothed[index] / total]));
};
