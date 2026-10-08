import { describe, expect, test } from 'vitest';
import {
  clamp01,
  computeFactors,
  computeTemperature,
  normalizeFactor,
  type ThermalInputs,
} from '../../src/thermodynamics/temperature.js';

const SAT = { commits: 30, authors: 5, lines: 800, complexityDensity: 12 };
const WEIGHTS = { churn: 0.45, authors: 0.2, size: 0.2, complexity: 0.15 };

describe('clamp01', () => {
  test('keeps values already inside the unit interval', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
  });

  test('clamps values below zero up to zero', () => {
    expect(clamp01(-0.0001)).toBe(0);
    expect(clamp01(-99)).toBe(0);
  });

  test('clamps values above one down to one', () => {
    expect(clamp01(1.0001)).toBe(1);
    expect(clamp01(42)).toBe(1);
  });
});

describe('normalizeFactor', () => {
  test('maps zero input to zero output', () => {
    expect(normalizeFactor(0, SAT.commits)).toBe(0);
  });

  test('maps input equal to the saturation point to exactly one', () => {
    expect(normalizeFactor(SAT.commits, SAT.commits)).toBe(1);
    expect(normalizeFactor(SAT.authors, SAT.authors)).toBe(1);
    expect(normalizeFactor(SAT.lines, SAT.lines)).toBe(1);
    expect(normalizeFactor(SAT.complexityDensity, SAT.complexityDensity)).toBe(1);
  });

  test('clamps input beyond the saturation point to one', () => {
    expect(normalizeFactor(SAT.commits * 100, SAT.commits)).toBe(1);
  });

  test('is monotonically increasing', () => {
    const low = normalizeFactor(2, SAT.commits);
    const mid = normalizeFactor(10, SAT.commits);
    const high = normalizeFactor(25, SAT.commits);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  test('compresses large inputs logarithmically rather than linearly', () => {
    // Half the saturation must score well above the linear 0.5 ratio, which is
    // the whole point of the log curve: churn explodes long before lines do.
    const halfSaturation = normalizeFactor(SAT.commits / 2, SAT.commits);
    expect(halfSaturation).toBeGreaterThan(0.5);
  });

  test('returns zero instead of NaN when saturation is not positive', () => {
    expect(normalizeFactor(10, 0)).toBe(0);
    expect(normalizeFactor(10, -5)).toBe(0);
  });
});

describe('computeFactors', () => {
  const inputs = (over: Partial<ThermalInputs> = {}): ThermalInputs => ({
    commits: 0,
    authors: 0,
    lines: 0,
    complexityDensity: 0,
    ...over,
  });

  test('produces all zeros for a file with no activity and no size', () => {
    expect(computeFactors(inputs(), SAT)).toEqual({ churn: 0, authors: 0, size: 0, complexity: 0 });
  });

  test('produces all ones when every input sits at its saturation point', () => {
    const factors = computeFactors(
      inputs({
        commits: SAT.commits,
        authors: SAT.authors,
        lines: SAT.lines,
        complexityDensity: SAT.complexityDensity,
      }),
      SAT,
    );
    expect(factors).toEqual({ churn: 1, authors: 1, size: 1, complexity: 1 });
  });

  test('keeps every factor inside the unit interval for extreme input', () => {
    const factors = computeFactors(
      inputs({ commits: 99_999, authors: 400, lines: 250_000, complexityDensity: 900 }),
      SAT,
    );
    for (const value of Object.values(factors)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test('scores churn independently from size', () => {
    // A huge, ancient file must not inherit churn credit it never earned.
    const factors = computeFactors(inputs({ lines: SAT.lines * 10, commits: 0 }), SAT);
    expect(factors.churn).toBe(0);
    expect(factors.size).toBe(1);
  });
});

describe('computeTemperature', () => {
  const allOnes = { churn: 1, authors: 1, size: 1, complexity: 1 };

  test('returns 100 when every factor is fully saturated', () => {
    expect(computeTemperature(allOnes, WEIGHTS)).toBeCloseTo(100, 10);
  });

  test('returns 0 when every factor is zero', () => {
    expect(computeTemperature({ churn: 0, authors: 0, size: 0, complexity: 0 }, WEIGHTS)).toBe(0);
  });

  test('weights churn as the dominant factor', () => {
    const churnOnly = computeTemperature({ ...allOnes, churn: 1, authors: 0, size: 0, complexity: 0 }, WEIGHTS);
    const authorsOnly = computeTemperature({ ...allOnes, churn: 0, authors: 1, size: 0, complexity: 0 }, WEIGHTS);
    const sizeOnly = computeTemperature({ ...allOnes, churn: 0, authors: 0, size: 1, complexity: 0 }, WEIGHTS);
    const complexityOnly = computeTemperature({ ...allOnes, churn: 0, authors: 0, size: 0, complexity: 1 }, WEIGHTS);

    expect(churnOnly).toBeCloseTo(45, 10);
    expect(authorsOnly).toBeCloseTo(20, 10);
    expect(sizeOnly).toBeCloseTo(20, 10);
    expect(complexityOnly).toBeCloseTo(15, 10);
  });

  test('rises monotonically as churn grows', () => {
    const temps = [0, 0.25, 0.5, 0.75, 1].map((churn) =>
      computeTemperature({ ...allOnes, churn, authors: 0, size: 0, complexity: 0 }, WEIGHTS),
    );
    for (let i = 1; i < temps.length; i++) {
      expect(temps[i]).toBeGreaterThan(temps[i - 1]);
    }
  });

  test('is deterministic for identical input', () => {
    const first = computeTemperature({ churn: 0.42, authors: 0.13, size: 0.77, complexity: 0.31 }, WEIGHTS);
    const second = computeTemperature({ churn: 0.42, authors: 0.13, size: 0.77, complexity: 0.31 }, WEIGHTS);
    expect(first).toBe(second);
  });
});
