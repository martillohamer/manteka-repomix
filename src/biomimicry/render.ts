import pc from 'picocolors';
import type { EvolutionReport, MutantResult } from './types.js';

export interface EvolutionRenderOptions {
  colorize?: (text: string) => string;
}

const COLUMNS = [
  { header: 'FITNESS', width: 10 },
  { header: 'ΔTEMP', width: 8 },
  { header: 'TESTS', width: 7 },
  { header: 'OPERATOR', width: 22 },
] as const;

const DEFAULT_MAX_PATH_WIDTH = 40;

const formatAxis = (value: number | null): string => {
  if (value === null) {
    return '—';
  }
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
};

const buildRow = (mutant: MutantResult, maxPathWidth: number, colorize: (text: string) => string): string => {
  const tests = mutant.testPassed === null ? '—' : mutant.testPassed ? 'pass' : 'FAIL';
  const cells = [formatAxis(mutant.fitness), formatAxis(mutant.thermalAxis), tests, mutant.operator];
  const parts = cells.map((cell, index) => cell.padEnd(COLUMNS[index].width));
  const file = mutant.targetFile.padEnd(maxPathWidth);

  return `  ${colorize(file)}${parts.join(' ')}${mutant.viable ? '' : '  (non-viable)'}`;
};

/**
 * Render the ranked mutant table.
 *
 * The banner states the ranking semantics explicitly: every operator in this
 * phase adds code, so a positive fitness delta is not yet achievable and the
 * ordering means "least harmful first". Claiming otherwise would make the table
 * read as a recommendation it cannot support.
 */
export const formatEvolutionTable = (report: EvolutionReport, options: EvolutionRenderOptions = {}): string => {
  const colorize = options.colorize ?? pc.cyan;

  if (report.summary.total === 0) {
    return [
      colorize('No boiling files found: nothing to evolve.'),
      report.testSignal === 'not-measured'
        ? 'Test axis not measured: pass --run-tests to include it.'
        : `Test axis measured (baseline ${report.baseline.testPassed ? 'pass' : 'FAIL'}).`,
    ].join('\n');
  }

  const lines: string[] = [];
  lines.push(colorize(`Evolution run: ${report.summary.viable}/${report.summary.total} mutant(s) viable`));
  lines.push(colorize('Ranking is "least harmful first": every operator adds code, so no mutant can cool a file yet.'));
  if (report.testSignal === 'not-measured') {
    lines.push(colorize('Test axis not measured: pass --run-tests to include it.'));
  }
  lines.push('');
  lines.push(`  ${'FILE'.padEnd(DEFAULT_MAX_PATH_WIDTH)}${COLUMNS.map((c) => c.header.padEnd(c.width)).join(' ')}`);

  for (const mutant of report.mutants) {
    lines.push(buildRow(mutant, DEFAULT_MAX_PATH_WIDTH, colorize));
  }

  lines.push('');
  lines.push(colorize(`HEAD ${report.repo.head}`));

  return lines.join('\n');
};
