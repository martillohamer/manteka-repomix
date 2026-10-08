import type { ThermalFactors, ThermalSaturations, ThermalWeights } from './types.js';

/**
 * Raw signals for one file, already reduced to the four thermodynamic axes.
 */
export interface ThermalInputs {
  commits: number;
  authors: number;
  lines: number;
  complexityDensity: number;
}

/**
 * Confine a ratio to the unit interval so no input can push T outside [0, 100].
 */
export const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

/**
 * Logarithmic saturation curve.
 *
 * The log is the load-bearing part of the whole design. Churn is a fundamentally
 * different quantity from size: a file touched 400 times is not merely "50x
 * hotter" than one touched 8 times, it has 50x the accumulated cognitive load.
 * A linear curve would either flatten churn (letting 400-touch files score the
 * same as 30) or explode size (a 2000-line file would always outrank a hot
 * small one). `ln(1+x)/ln(saturation)` spends the available range where the
 * evidence actually lives, and pins the value to 1 once the saturation point is
 * reached so a pathological file cannot distort the ranking.
 */
export const normalizeFactor = (value: number, saturation: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(saturation) || saturation <= 1) return 0;
  return clamp01(Math.log1p(value) / Math.log(saturation));
};

/**
 * Reduce the four raw signals to comparable [0,1] factors.
 */
export const computeFactors = (inputs: ThermalInputs, saturations: ThermalSaturations): ThermalFactors => ({
  churn: normalizeFactor(inputs.commits, saturations.commits),
  authors: normalizeFactor(inputs.authors, saturations.authors),
  size: normalizeFactor(inputs.lines, saturations.lines),
  complexity: normalizeFactor(inputs.complexityDensity, saturations.complexityDensity),
});

/**
 * Blend the factors into the scalar temperature, on a 0-100 scale.
 */
export const computeTemperature = (factors: ThermalFactors, weights: ThermalWeights): number =>
  100 *
  (weights.churn * factors.churn +
    weights.authors * factors.authors +
    weights.size * factors.size +
    weights.complexity * factors.complexity);
