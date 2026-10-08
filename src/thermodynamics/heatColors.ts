import pc from 'picocolors';
import type { ThermalBandName } from './types.js';

export type ColorizeFn = (text: string) => string;

export interface ThermalBand {
  name: ThermalBandName;
  emoji: string;
  minTemperature: number;
  color: ColorizeFn;
}

/**
 * The colour scale, ordered cold to hot and ascending by lower bound.
 *
 * Colours are carried as function references rather than pre-rendered strings so
 * that a band can be resolved once and re-used for the whole table without
 * re-applying escapes, and so tests can assert which colour a band selects
 * without depending on whether the stream is a TTY.
 */
export const THERMAL_BANDS: readonly ThermalBand[] = [
  { name: 'Frío', emoji: '❄️', minTemperature: 0, color: pc.blue },
  { name: 'Estable', emoji: '🌿', minTemperature: 20, color: pc.green },
  { name: 'Caliente', emoji: '☀️', minTemperature: 40, color: pc.yellow },
  { name: 'Muy Caliente', emoji: '🔥', minTemperature: 60, color: pc.magenta },
  { name: 'Crítico', emoji: '⚠️', minTemperature: 80, color: pc.red },
];

/**
 * Resolve the band owning a temperature. Boundaries are inclusive at the lower
 * bound, so exactly 80 is already Crítico.
 */
export const bandFor = (temperature: number): ThermalBand => {
  if (!Number.isFinite(temperature)) {
    return THERMAL_BANDS[0];
  }
  let selected = THERMAL_BANDS[0];
  for (const band of THERMAL_BANDS) {
    if (temperature >= band.minTemperature) {
      selected = band;
    }
  }
  return selected;
};

/**
 * A file boils when it reaches the configured ceiling. Compared inclusively so
 * that hitting T_max exactly is already reported.
 */
export const isBoiling = (temperature: number, tMax: number): boolean =>
  Number.isFinite(temperature) && Number.isFinite(tMax) && temperature >= tMax;
