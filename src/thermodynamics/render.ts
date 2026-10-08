import pc from 'picocolors';
import { bandFor, type ColorizeFn } from './heatColors.js';
import { BOILING_ALERT, type FileTemperature, type ThermalRunResult } from './types.js';

export interface RenderOptions {
  colorize?: ColorizeFn;
  /** Longest path rendered in full before it is elided with an ellipsis. */
  maxPathWidth?: number;
}

const COLUMNS = [
  { header: 'TEMP', width: 6 },
  { header: 'COMMITS', width: 9 },
  { header: 'AUTHORS', width: 8 },
  { header: 'DENSITY', width: 8 },
  { header: 'LINES', width: 7 },
  { header: 'BAND', width: 12 },
] as const;

const DEFAULT_MAX_PATH_WIDTH = 52;
const PATH_ELLIPSIS = '…';

const formatNumber = (value: number): string => value.toFixed(1);

/**
 * Elide from the left so the file name stays visible. A path truncated at the
 * front keeps the only part a reader needs to identify the file, whereas a
 * trailing ellipsis would hide `src/.../file.ts` behind a wall of directories.
 */
const elidePath = (path: string, maxWidth: number): string => {
  if (path.length <= maxWidth) {
    return path;
  }
  return `${PATH_ELLIPSIS}${path.slice(-(maxWidth - 1))}`;
};

const buildRow = (file: FileTemperature, maxPathWidth: number, colorize: ColorizeFn): string => {
  const band = bandFor(file.temperature);
  const cells = [
    formatNumber(file.temperature),
    String(file.commits),
    String(file.authors),
    formatNumber(file.complexityDensity),
    String(file.lines),
    `${band.emoji} ${band.name}`,
  ];

  const parts = cells.map((cell, index) => cell.padEnd(COLUMNS[index].width));
  const path = elidePath(file.path, maxPathWidth).padEnd(maxPathWidth);

  return `  ${colorize(path)}${parts.join(' ')}`;
};

const buildHeader = (maxPathWidth: number, colorize: ColorizeFn): string => {
  const pathHeader = 'FILE'.padEnd(maxPathWidth);
  return `  ${colorize(pathHeader)}${COLUMNS.map((column) => column.header.padEnd(column.width)).join(' ')}`;
};

const renderBoilingBanner = (run: ThermalRunResult, colorize: ColorizeFn): string => {
  if (run.boilingFiles.length === 0) {
    return '';
  }

  const paths = run.boilingFiles.map((file) => file.path).join(', ');
  return `${colorize(BOILING_ALERT)}\n${colorize(`${run.boilingFiles.length} file(s) at or above T_max: ${paths}`)}\n`;
};

/**
 * Render the per-file thermal table. Ordering, row limit and colouring are all
 * concerns of presentation only, so the caller keeps the full ranked list and
 * the persisted report stays complete regardless of `--limit`.
 */
export const formatThermalTable = (run: ThermalRunResult, options: RenderOptions = {}): string => {
  const colorize = options.colorize ?? pc.yellow;
  const maxPathWidth = options.maxPathWidth ?? DEFAULT_MAX_PATH_WIDTH;

  const ordered = [...run.files].sort((a, b) => b.temperature - a.temperature || a.path.localeCompare(b.path));
  const rows = ordered.slice(0, Math.max(0, run.policy.limit));

  const lines: string[] = [];
  lines.push(renderBoilingBanner(run, pc.red).trimEnd());
  lines.push(buildHeader(maxPathWidth, colorize));
  for (const file of rows) {
    lines.push(buildRow(file, maxPathWidth, colorize));
  }

  const gitNote = run.isGitRepo
    ? `HEAD ${run.head ?? 'unknown'}`
    : 'No Git repository detected: entropy reflects size and complexity only';
  lines.push(colorize(gitNote));
  lines.push(
    `${run.summary.fileCount} file(s) analysed, mean ${formatNumber(run.summary.meanTemperature)}, max ${formatNumber(run.summary.maxTemperature)}`,
  );

  return lines.filter((line) => line !== '').join('\n');
};

export const printThermalReport = (run: ThermalRunResult, options: RenderOptions = {}): string =>
  formatThermalTable(run, options);
