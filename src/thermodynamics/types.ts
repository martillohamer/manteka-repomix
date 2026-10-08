/**
 * Policy and data contracts for the thermodynamics subsystem.
 *
 * Everything in this file is pure data. Keeping the weights and saturation
 * points in one auditable place is what lets a temperature be recomputed from
 * the persisted report alone, months later, without guessing the settings that
 * produced it.
 */

export interface ThermalWeights {
  readonly churn: number;
  readonly authors: number;
  readonly size: number;
  readonly complexity: number;
}

export const THERMAL_WEIGHTS: ThermalWeights = {
  churn: 0.45,
  authors: 0.2,
  size: 0.2,
  complexity: 0.15,
} as const;

export interface ThermalSaturations {
  readonly commits: number;
  readonly authors: number;
  readonly lines: number;
  readonly complexityDensity: number;
}

export const THERMAL_SATURATIONS: ThermalSaturations = {
  commits: 30,
  authors: 5,
  lines: 800,
  complexityDensity: 12,
} as const;

export const THERMAL_POLICY_DEFAULTS = {
  windowDays: 90,
  maxCommits: 500,
  tMax: 80,
  limit: 20,
} as const;

export const BOILING_ALERT = '🔥 [PUNTO DE EBULLICIÓN DETECTADO]';

export type ThermalBandName = 'Frío' | 'Estable' | 'Caliente' | 'Muy Caliente' | 'Crítico';

export interface ThermalPolicy {
  windowDays: number;
  maxCommits: number;
  tMax: number;
  limit: number;
}

export interface FileActivity {
  commits: number;
  authors: number;
}

export interface ComplexityProfile {
  logicalLines: number;
  branchTokens: number;
  density: number;
}

export interface ThermalFactors {
  churn: number;
  authors: number;
  size: number;
  complexity: number;
}

export interface FileTemperature {
  path: string;
  commits: number;
  authors: number;
  lines: number;
  logicalLines: number;
  branchTokens: number;
  complexityDensity: number;
  factors: ThermalFactors;
  temperature: number;
  band: ThermalBandName;
}

export interface ThermalSummary {
  fileCount: number;
  boilingFiles: number;
  maxTemperature: number;
  meanTemperature: number;
}

export interface ThermalRunResult {
  repoRoot: string;
  isGitRepo: boolean;
  head: string | null;
  generatedAt: string;
  policy: ThermalPolicy;
  summary: ThermalSummary;
  files: FileTemperature[];
  boilingFiles: FileTemperature[];
}

export interface ThermodynamicReport {
  schemaVersion: 1;
  generatedAt: string;
  repo: {
    root: string;
    isGitRepo: boolean;
    head: string | null;
  };
  policy: {
    windowDays: number;
    maxCommits: number;
    tMax: number;
    weights: ThermalWeights;
    saturations: ThermalSaturations;
  };
  summary: ThermalSummary;
  files: FileTemperature[];
}
