import { describe, expect, test } from 'vitest';
import type { ColorizeFn } from '../../src/thermodynamics/heatColors.js';
import { formatThermalTable, printThermalReport } from '../../src/thermodynamics/render.js';
import {
  BOILING_ALERT,
  type FileTemperature,
  THERMAL_POLICY_DEFAULTS,
  type ThermalPolicy,
  type ThermalRunResult,
} from '../../src/thermodynamics/types.js';

/** Colour stripping without depending on whether the test stream is a TTY. */
const plain: ColorizeFn = (text) => text;

const file = (path: string, temperature: number, overrides: Partial<FileTemperature> = {}): FileTemperature => ({
  path,
  commits: 3,
  authors: 2,
  lines: 120,
  branchTokens: 8,
  logicalLines: 60,
  complexityDensity: 13.33,
  factors: { churn: 0.5, authors: 0.6, size: 0.4, complexity: 0.3 },
  temperature,
  band: 'Caliente',
  ...overrides,
});

const result = (
  files: FileTemperature[],
  overrides: Partial<ThermalRunResult> = {},
  policy: Partial<ThermalPolicy> = {},
): ThermalRunResult => {
  const resolvedPolicy = { ...THERMAL_POLICY_DEFAULTS, ...policy };
  const boilingFiles = files.filter((f) => f.temperature >= resolvedPolicy.tMax);
  return {
    repoRoot: '/repo',
    isGitRepo: true,
    head: 'abc1234',
    generatedAt: '2026-01-01T00:00:00.000Z',
    policy: resolvedPolicy,
    summary: {
      fileCount: files.length,
      boilingFiles: boilingFiles.length,
      maxTemperature: files.length ? Math.max(...files.map((f) => f.temperature)) : 0,
      meanTemperature: files.length ? files.reduce((sum, f) => sum + f.temperature, 0) / files.length : 0,
    },
    files,
    boilingFiles,
    ...overrides,
  };
};

describe('formatThermalTable', () => {
  test('orders files from hottest to coldest', () => {
    const output = formatThermalTable(
      result([file('cold.ts', 10, { band: 'Frío' }), file('hot.ts', 90, { band: 'Crítico' })]),
      { colorize: plain },
    );

    expect(output.indexOf('hot.ts')).toBeLessThan(output.indexOf('cold.ts'));
  });

  test('shows the file path, temperature and band', () => {
    const output = formatThermalTable(result([file('src/a.ts', 90, { band: 'Crítico' })]), { colorize: plain });

    expect(output).toContain('src/a.ts');
    expect(output).toContain('90.0');
    expect(output).toContain('Crítico');
  });

  test('limits rows to the requested count', () => {
    const files = Array.from({ length: 30 }, (_, index) => file(`f${index}.ts`, index, { band: 'Estable' }));
    const output = formatThermalTable(result(files, {}, { limit: 5 }), { colorize: plain });

    expect(output).toContain('f29.ts');
    expect(output).not.toContain('f10.ts');
  });

  test('announces the boiling alert when a file reaches tMax', () => {
    const output = formatThermalTable(result([file('boiling.ts', 80, { band: 'Crítico' })]), { colorize: plain });

    expect(output).toContain(BOILING_ALERT);
  });

  test('does not raise the alert below tMax', () => {
    const output = formatThermalTable(result([file('warm.ts', 79.9, { band: 'Muy Caliente' })]), {
      colorize: plain,
    });

    expect(output).not.toContain(BOILING_ALERT);
  });

  test('respects the configured tMax rather than a hardcoded threshold', () => {
    const files = [file('mild.ts', 85, { band: 'Crítico' })];
    const lenient = formatThermalTable(result(files, {}, { tMax: 90 }), { colorize: plain });
    const strict = formatThermalTable(result(files, {}, { tMax: 50 }), { colorize: plain });

    expect(lenient).not.toContain(BOILING_ALERT);
    expect(strict).toContain(BOILING_ALERT);
  });

  test('renders a header even when there are no files', () => {
    const output = formatThermalTable(result([]), { colorize: plain });

    expect(output).toContain('TEMP');
    expect(output).toContain('0');
  });

  test('notes when git data is unavailable', () => {
    const output = formatThermalTable(result([file('a.ts', 20, { band: 'Estable' })], { isGitRepo: false }), {
      colorize: plain,
    });

    expect(output).toContain('Git');
  });

  test('shows the commit and author columns for tracked files', () => {
    const output = formatThermalTable(result([file('a.ts', 20, { band: 'Estable' })]), { colorize: plain });

    expect(output).toContain('COMMITS');
    expect(output).toContain('AUTHORS');
  });
});

describe('printThermalReport', () => {
  test('returns the formatted table', () => {
    const output = printThermalReport(result([file('a.ts', 20, { band: 'Estable' })]), { colorize: plain });

    expect(output).toContain('a.ts');
  });

  test('includes the boiling summary line when files are hot', () => {
    const output = printThermalReport(result([file('a.ts', 95, { band: 'Crítico' })]), { colorize: plain });

    expect(output).toContain(BOILING_ALERT);
  });

  test('truncates very long paths instead of breaking the table', () => {
    const longPath = `src/${'deep/'.repeat(40)}file.ts`;
    const output = formatThermalTable(result([file(longPath, 20, { band: 'Estable' })]), { colorize: plain });

    expect(output).not.toContain(longPath);
    expect(output).toContain('…');
  });
});
