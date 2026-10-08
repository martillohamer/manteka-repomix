import fs from 'node:fs/promises';
import path from 'node:path';
import { computeOperatorWeights, type Lineage, type LineageEntry, loadLineage } from '../biomimicry/lineageStore.js';
import { defaultEvolutionReportPath } from '../biomimicry/report.js';
import { LAWS_FILE_NAME, type Law, parseLawsManifest } from '../biomimicry/semanticGuardian.js';
import { type EvolutionReport, type EvolutionSummary, MUTATION_OPERATOR_NAMES } from '../biomimicry/types.js';
import { execGitShortHead } from '../core/git/gitCommand.js';
import { isGitRepository } from '../core/git/gitRepositoryHandle.js';
import { defaultReportPath } from '../thermodynamics/report.js';
import type { ThermodynamicReport } from '../thermodynamics/types.js';

/**
 * Read-only projection of a repository's autonomy state for the dashboard.
 *
 * Every section degrades independently: a missing or corrupt persisted file
 * flips that section to `present: false` instead of failing the snapshot, so
 * the server can always answer and the SPA can always render cold-start state.
 */
export interface DashboardSnapshot {
  readonly root: string;
  readonly head: string | null;
  readonly guardian: { readonly present: boolean; readonly lawCount: number; readonly laws: Law[] };
  readonly lineage: {
    readonly wins: number;
    readonly entries: LineageEntry[];
    /** Normalised epigenetic weights (sum to 1) over the declared operators. */
    readonly weights: Record<string, number>;
  };
  readonly thermal: {
    readonly present: boolean;
    readonly generatedAt: string | null;
    readonly maxTemperature: number;
    readonly meanTemperature: number;
    readonly fileCount: number;
    readonly boilingFiles: number;
    readonly hottestFiles: { readonly file: string; readonly temperature: number; readonly band: string }[];
  };
  readonly evolution: {
    readonly present: boolean;
    readonly generatedAt: string | null;
    readonly summary: EvolutionSummary | null;
    readonly lastOperator: string | null;
    readonly lastDelta: number | null;
  };
  readonly watcher: { readonly lastBeatAt: number | null };
  readonly serverAt: number;
}

export interface SnapshotDeps {
  isGitRepository: (directory: string) => Promise<boolean>;
  execGitShortHead: (directory: string) => Promise<string>;
  loadLineage: (repoRoot: string) => Promise<Lineage>;
  /** Raw manifest text, or null when the guardian has no manifest at all. */
  readLaws: (repoRoot: string) => Promise<string | null>;
  readThermalReport: (repoRoot: string) => Promise<ThermodynamicReport | null>;
  readEvolutionReport: (repoRoot: string) => Promise<EvolutionReport | null>;
  /** Newest mtime (ms) across the persisted reports, or null when absent. */
  readBeat: (repoRoot: string) => Promise<number | null>;
  now: () => number;
}

const readJsonFile = async <T>(target: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8')) as T;
  } catch {
    return null;
  }
};

export const defaultSnapshotDeps: SnapshotDeps = {
  isGitRepository,
  execGitShortHead,
  loadLineage,
  readLaws: async (repoRoot) => {
    try {
      return await fs.readFile(path.join(repoRoot, LAWS_FILE_NAME), 'utf8');
    } catch {
      return null;
    }
  },
  readThermalReport: (repoRoot) => readJsonFile<ThermodynamicReport>(defaultReportPath(repoRoot)),
  readEvolutionReport: (repoRoot) => readJsonFile<EvolutionReport>(defaultEvolutionReportPath(repoRoot)),
  readBeat: async (repoRoot) => {
    const candidates = [defaultReportPath(repoRoot), defaultEvolutionReportPath(repoRoot)];
    let latest: number | null = null;
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        latest = latest === null ? stat.mtimeMs : Math.max(latest, stat.mtimeMs);
      } catch {
        // A missing file contributes no beat.
      }
    }
    return latest;
  },
  now: () => Date.now(),
};

const thermalSection = (report: ThermodynamicReport | null): DashboardSnapshot['thermal'] => {
  const absent = {
    present: false,
    generatedAt: null,
    maxTemperature: 0,
    meanTemperature: 0,
    fileCount: 0,
    boilingFiles: 0,
    hottestFiles: [],
  };
  if (report === null) {
    return absent;
  }
  try {
    return {
      present: true,
      generatedAt: report.generatedAt,
      maxTemperature: report.summary.maxTemperature,
      meanTemperature: report.summary.meanTemperature,
      fileCount: report.summary.fileCount,
      boilingFiles: report.summary.boilingFiles,
      hottestFiles: report.files
        .slice(0, 8)
        .map((file) => ({ file: file.path, temperature: file.temperature, band: file.band })),
    };
  } catch {
    // Valid JSON with the wrong shape degrades like a missing file.
    return absent;
  }
};

const evolutionSection = (report: EvolutionReport | null): DashboardSnapshot['evolution'] => {
  const absent = { present: false, generatedAt: null, summary: null, lastOperator: null, lastDelta: null };
  if (report === null) {
    return absent;
  }
  try {
    const best = report.mutants.find((mutant) => mutant.id === report.summary.best);
    return {
      present: true,
      generatedAt: report.generatedAt,
      summary: report.summary,
      lastOperator: best?.operator ?? null,
      lastDelta: best?.thermalAxis ?? null,
    };
  } catch {
    // Valid JSON with the wrong shape degrades like a missing file.
    return absent;
  }
};

/**
 * Collect the full biometric snapshot. Each reader is called defensively so a
 * single unreadable file never turns into a 500 for the whole endpoint.
 */
export const gatherSnapshot = async (
  requestedRoot: string,
  deps: SnapshotDeps = defaultSnapshotDeps,
): Promise<DashboardSnapshot> => {
  const root = path.resolve(requestedRoot);
  const repository = await deps.isGitRepository(root).catch(() => false);
  const head = repository ? await deps.execGitShortHead(root).catch(() => null) : null;

  const lawsText = await deps.readLaws(root);
  let laws: Law[] = [];
  if (lawsText !== null) {
    try {
      laws = parseLawsManifest(lawsText);
    } catch {
      laws = [];
    }
  }

  const lineage = await deps.loadLineage(root);
  const thermal = await deps.readThermalReport(root).catch(() => null);
  const evolution = await deps.readEvolutionReport(root).catch(() => null);
  const lastBeatAt = await deps.readBeat(root).catch(() => null);

  return {
    root,
    head,
    guardian: { present: lawsText !== null, lawCount: laws.length, laws },
    lineage: {
      wins: lineage.entries.length,
      entries: lineage.entries.slice(-20).reverse(),
      weights: computeOperatorWeights(MUTATION_OPERATOR_NAMES, lineage),
    },
    thermal: thermalSection(thermal),
    evolution: evolutionSection(evolution),
    watcher: { lastBeatAt },
    serverAt: deps.now(),
  };
};
