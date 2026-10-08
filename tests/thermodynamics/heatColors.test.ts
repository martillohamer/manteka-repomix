import pc from 'picocolors';
import { describe, expect, test } from 'vitest';
import { bandFor, isBoiling, THERMAL_BANDS } from '../../src/thermodynamics/heatColors.js';

describe('THERMAL_BANDS', () => {
  test('covers the whole scale from cold to critical', () => {
    expect(THERMAL_BANDS.map((band) => band.name)).toEqual(['Frío', 'Estable', 'Caliente', 'Muy Caliente', 'Crítico']);
  });

  test('starts the scale at zero and steps in even twenty-degree bands', () => {
    expect(THERMAL_BANDS.map((band) => band.minTemperature)).toEqual([0, 20, 40, 60, 80]);
  });

  test('gives every band a distinct colour', () => {
    const colours = new Set(THERMAL_BANDS.map((band) => band.color));
    expect(colours.size).toBe(THERMAL_BANDS.length);
  });

  test('gives every band a non-empty emoji', () => {
    for (const band of THERMAL_BANDS) {
      expect(band.emoji.length).toBeGreaterThan(0);
    }
  });

  test('paints the cold end blue and the hot end red', () => {
    expect(THERMAL_BANDS[0].color).toBe(pc.blue);
    expect(THERMAL_BANDS[1].color).toBe(pc.green);
    expect(THERMAL_BANDS[2].color).toBe(pc.yellow);
    expect(THERMAL_BANDS[3].color).toBe(pc.magenta);
    expect(THERMAL_BANDS[4].color).toBe(pc.red);
  });
});

describe('bandFor', () => {
  test('assigns the coldest band at the bottom of the scale', () => {
    expect(bandFor(0).name).toBe('Frío');
  });

  test('assigns each band at its exact lower boundary', () => {
    expect(bandFor(20).name).toBe('Estable');
    expect(bandFor(40).name).toBe('Caliente');
    expect(bandFor(60).name).toBe('Muy Caliente');
    expect(bandFor(80).name).toBe('Crítico');
  });

  test('keeps a value just below a boundary in the lower band', () => {
    expect(bandFor(19.99).name).toBe('Frío');
    expect(bandFor(79.99).name).toBe('Muy Caliente');
  });

  test('caps at the critical band', () => {
    expect(bandFor(100).name).toBe('Crítico');
    expect(bandFor(9_999).name).toBe('Crítico');
  });

  test('clamps below-zero temperatures into the coldest band', () => {
    expect(bandFor(-5).name).toBe('Frío');
  });

  test('falls back to the coldest band for a non-finite temperature', () => {
    expect(bandFor(Number.NaN).name).toBe('Frío');
  });
});

describe('isBoiling', () => {
  test('flags a temperature that reaches the threshold', () => {
    expect(isBoiling(80, 80)).toBe(true);
  });

  test('flags a temperature beyond the threshold', () => {
    expect(isBoiling(95, 80)).toBe(true);
  });

  test('does not flag a temperature just under the threshold', () => {
    expect(isBoiling(79.99, 80)).toBe(false);
  });

  test('honours a custom threshold', () => {
    expect(isBoiling(70, 60)).toBe(true);
    expect(isBoiling(50, 60)).toBe(false);
  });

  test('never flags on a non-finite input', () => {
    expect(isBoiling(Number.NaN, 80)).toBe(false);
    expect(isBoiling(90, Number.NaN)).toBe(false);
  });
});
