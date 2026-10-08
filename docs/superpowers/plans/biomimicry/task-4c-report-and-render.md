> Constraints, file map, execution order and Definition of Done: [README](./README.md).

## Task 4c: Persistence and presentation

Phase 4 separates persistence (`thermodynamics/report.ts`) from presentation (`thermodynamics/render.ts`). Same split here: the engine returns data, these two modules decide where it lands and how it reads.

**Interfaces:**
- `report.ts`: `EVOLUTION_REPORT_FILE_NAME`, `defaultEvolutionReportPath(repoRoot)`, `writeEvolutionReport(report, repoRoot, targetPath?)`
- `render.ts`: `EvolutionRenderOptions`, `formatEvolutionTable(report, options?): string`

- [ ] **Step 1: Create `src/biomimicry/report.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/biomimicry/render.ts`**

```ts
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
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/biomimicry/evolutionEngine.test.ts`
Expected: PASS, 21 tests. `render.ts` has no test of its own yet: it is pure formatting reached only through the engine, and adding a snapshot would pin cosmetic choices rather than behaviour. Add a render assertion only if a real defect appears.

Run: `npm run lint`
Expected: `Found 0 warnings and 0 errors.`

- [ ] **Step 4: Commit (with task 4a and 4b)**

```bash
git add src/biomimicry/evolutionEngine.ts src/biomimicry/report.ts src/biomimicry/render.ts tests/biomimicry/evolutionEngine.test.ts
git commit -m "feat(biomimicry): add deterministic evolution engine with concurrency pool"
```

