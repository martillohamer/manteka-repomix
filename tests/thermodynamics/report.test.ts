import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { bandFor } from '../../src/thermodynamics/heatColors.js';
import { buildReport, defaultReportPath, writeReport } from '../../src/thermodynamics/report.js';
import { computeFactors, computeTemperature } from '../../src/thermodynamics/temperature.js';
import {
  type FileTemperature,
  THERMAL_POLICY_DEFAULTS,
  THERMAL_SATURATIONS,
  THERMAL_WEIGHTS,
  type ThermalRunResult,
  type ThermodynamicReport,
} from '../../src/thermodynamics/types.js';

vi.mock('../../src/shared/logger');

const file = (path: string, temperature: number, overrides: Partial<FileTemperature> = {}): FileTemperature => ({
  path,
  commits: 4,
  authors: 2,
  lines: 200,
  branchTokens: 10,
  logicalLines: 50,
  complexityDensity: 20,
  factors: { churn: 0.6, authors: 0.4, size: 0.5, complexity: 0.8 },
  temperature,
  band: 'Caliente',
  ...overrides,
});

/**
 * A file whose factors and temperature are actually derived from its raw
 * signals, the way the runner produces them. Fixtures with hand-picked factors
 * would make the reproducibility check pass or fail for the wrong reason.
 */
const measuredFile = (
  filePath: string,
  signals: Partial<Record<'commits' | 'authors' | 'lines' | 'complexityDensity', number>> = {},
): FileTemperature => {
  const commits = signals.commits ?? 4;
  const authors = signals.authors ?? 2;
  const lines = signals.lines ?? 200;
  const complexityDensity = signals.complexityDensity ?? 20;
  const factors = computeFactors({ commits, authors, lines, complexityDensity }, THERMAL_SATURATIONS);
  const temperature = computeTemperature(factors, THERMAL_WEIGHTS);

  return {
    path: filePath,
    commits,
    authors,
    lines,
    logicalLines: Math.round(lines / 4),
    branchTokens: Math.round((complexityDensity * lines) / 400),
    complexityDensity,
    factors,
    temperature,
    band: bandFor(temperature).name,
  };
};

const run = (files: FileTemperature[], overrides: Partial<ThermalRunResult> = {}): ThermalRunResult => ({
  repoRoot: '/repo',
  isGitRepo: true,
  head: 'abc1234',
  generatedAt: '2026-01-01T00:00:00.000Z',
  policy: { ...THERMAL_POLICY_DEFAULTS },
  summary: {
    fileCount: files.length,
    boilingFiles: files.filter((f) => f.temperature >= THERMAL_POLICY_DEFAULTS.tMax).length,
    maxTemperature: files.length ? Math.max(...files.map((f) => f.temperature)) : 0,
    meanTemperature: files.length ? files.reduce((sum, f) => sum + f.temperature, 0) / files.length : 0,
  },
  files,
  boilingFiles: files.filter((f) => f.temperature >= THERMAL_POLICY_DEFAULTS.tMax),
  ...overrides,
});

describe('buildReport', () => {
  test('stamps the schema version and the run timestamp', () => {
    const report = buildReport(run([]));

    expect(report.schemaVersion).toBe(1);
    expect(report.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test('records the repository identity and git availability', () => {
    const report = buildReport(run([], { repoRoot: '/tmp/x', isGitRepo: false, head: null }));

    expect(report.repo).toEqual({ root: '/tmp/x', isGitRepo: false, head: null });
  });

  test('records the policy together with the weights and saturations used', () => {
    const report = buildReport(run([], { policy: { ...THERMAL_POLICY_DEFAULTS, windowDays: 30, tMax: 70 } }));

    expect(report.policy.windowDays).toBe(30);
    expect(report.policy.tMax).toBe(70);
    expect(report.policy.weights).toEqual(THERMAL_WEIGHTS);
    expect(report.policy.saturations).toEqual(THERMAL_SATURATIONS);
  });

  test('records the summary unchanged', () => {
    const source = run([file('a.ts', 42)]);
    expect(buildReport(source).summary).toEqual(source.summary);
  });

  test('orders files from hottest to coldest', () => {
    const report = buildReport(run([file('cool.ts', 5), file('hot.ts', 95), file('mid.ts', 45)]));

    expect(report.files.map((f) => f.path)).toEqual(['hot.ts', 'mid.ts', 'cool.ts']);
  });

  test('keeps every file even when the display limit is small', () => {
    const files = Array.from({ length: 50 }, (_, index) => file(`f${index}.ts`, index));
    const report = buildReport(run(files, { policy: { ...THERMAL_POLICY_DEFAULTS, limit: 5 } }));

    expect(report.files).toHaveLength(50);
  });

  test('survives a JSON round trip', () => {
    const report = buildReport(run([file('a.ts', 61.23)]));
    const parsed: ThermodynamicReport = JSON.parse(JSON.stringify(report));

    expect(parsed.files[0].temperature).toBe(61.23);
    expect(parsed.policy.weights).toEqual(THERMAL_WEIGHTS);
  });

  test('permits recomputing each temperature from the persisted signals', () => {
    const report = buildReport(
      run([
        measuredFile('a.ts', { commits: 2, authors: 1, lines: 40, complexityDensity: 3 }),
        measuredFile('b.ts', { commits: 60, authors: 7, lines: 2000, complexityDensity: 30 }),
      ]),
    );

    for (const persisted of report.files) {
      const recomputedFactors = computeFactors(
        {
          commits: persisted.commits,
          authors: persisted.authors,
          lines: persisted.lines,
          complexityDensity: persisted.complexityDensity,
        },
        report.policy.saturations,
      );

      expect(persisted.factors).toEqual(recomputedFactors);
      expect(computeTemperature(persisted.factors, report.policy.weights)).toBeCloseTo(persisted.temperature, 10);
    }
  });
});

describe('defaultReportPath', () => {
  test('resolves inside the memory directory of the given root', () => {
    expect(defaultReportPath('/repo')).toBe(path.join('/repo', '.manteka-memory', 'thermodynamic-report.json'));
  });
});

describe('writeReport', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-heat-report-'));
  });

  afterEach(async () => {
    vi.resetAllMocks();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test('creates the memory directory and writes valid JSON', async () => {
    const written = await writeReport(buildReport(run([file('a.ts', 33)])), tempRoot);

    expect(written).toBe(defaultReportPath(tempRoot));
    const raw = await fs.readFile(written, 'utf8');
    expect(JSON.parse(raw).files[0].path).toBe('a.ts');
  });

  test('honours an explicit report path', async () => {
    const target = path.join(tempRoot, 'custom', 'nested-report.json');
    const written = await writeReport(buildReport(run([file('a.ts', 10)])), tempRoot, target);

    expect(written).toBe(target);
    expect(await fs.readFile(target, 'utf8')).toContain('a.ts');
  });

  test('overwrites a previous report without appending', async () => {
    const target = await writeReport(buildReport(run([file('first.ts', 10)])), tempRoot);
    await writeReport(buildReport(run([file('second.ts', 20)])), tempRoot, target);

    const parsed = JSON.parse(await fs.readFile(target, 'utf8'));
    expect(parsed.files[0].path).toBe('second.ts');
    expect(parsed.files).toHaveLength(1);
  });

  test('writes valid JSON for an empty analysis', async () => {
    const written = await writeReport(buildReport(run([])), tempRoot);
    const parsed = JSON.parse(await fs.readFile(written, 'utf8'));

    expect(parsed.files).toEqual([]);
    expect(parsed.summary.fileCount).toBe(0);
  });
});
