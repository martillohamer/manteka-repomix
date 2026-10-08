import fs from 'node:fs/promises';
import path from 'node:path';
import { MEMORY_DIRECTORY } from '../thermodynamics/report.js';
import type { EvolutionReport } from './types.js';

export const EVOLUTION_REPORT_FILE_NAME = 'evolution-report.json';

export const defaultEvolutionReportPath = (repoRoot: string): string =>
  path.join(repoRoot, MEMORY_DIRECTORY, EVOLUTION_REPORT_FILE_NAME);

/**
 * Persist the run.
 *
 * The policy — including the Phase 4 thermal inputs and the fitness weights —
 * is already inside the report, so a score stays recomputable without knowing
 * the settings that produced it.
 */
export const writeEvolutionReport = async (
  report: EvolutionReport,
  repoRoot: string,
  targetPath?: string,
): Promise<string> => {
  const destination = targetPath ?? defaultEvolutionReportPath(repoRoot);

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return destination;
};
