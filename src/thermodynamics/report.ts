import fs from 'node:fs/promises';
import path from 'node:path';
import { THERMAL_SATURATIONS, THERMAL_WEIGHTS, type ThermalRunResult, type ThermodynamicReport } from './types.js';

export const MEMORY_DIRECTORY = '.manteka-memory';
export const REPORT_FILE_NAME = 'thermodynamic-report.json';

export const defaultReportPath = (repoRoot: string): string => path.join(repoRoot, MEMORY_DIRECTORY, REPORT_FILE_NAME);

/**
 * Project the run into the persisted contract.
 *
 * Weights and saturations are copied into the report on purpose. Without them a
 * stored temperature is just an unexplained number, and any later change to the
 * defaults would silently make past reports incomparable to new ones. With them
 * the report stays self-describing.
 */
export const buildReport = (run: ThermalRunResult): ThermodynamicReport => {
  const ordered = [...run.files].sort((a, b) => b.temperature - a.temperature || a.path.localeCompare(b.path));

  return {
    schemaVersion: 1,
    generatedAt: run.generatedAt,
    repo: {
      root: run.repoRoot,
      isGitRepo: run.isGitRepo,
      head: run.head,
    },
    policy: {
      windowDays: run.policy.windowDays,
      maxCommits: run.policy.maxCommits,
      tMax: run.policy.tMax,
      weights: { ...THERMAL_WEIGHTS },
      saturations: { ...THERMAL_SATURATIONS },
    },
    summary: { ...run.summary },
    files: ordered,
  };
};

export const writeReport = async (
  report: ThermodynamicReport,
  repoRoot: string,
  targetPath?: string,
): Promise<string> => {
  const destination = targetPath ?? defaultReportPath(repoRoot);

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return destination;
};
