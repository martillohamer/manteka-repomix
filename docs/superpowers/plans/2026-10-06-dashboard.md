# Biometric Web Dashboard (Phase 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `manteka dashboard` — a zero-dependency local HTTP server that serves a cyberpunk biometric SPA plus a REST snapshot and an SSE stream exposing guardian, lineage, epigenetic weights, heat and evolution state.

**Architecture:** Native `node:http` server with fully injectable deps (`gatherSnapshot`, `watch`, `heartbeatMs`, `now`) created by `createDashboardServer()`; a pure snapshot gatherer reads the persisted `.manteka-*` / `.manteka-memory/*` files; the SPA is a single TypeScript module exporting a full HTML string with inlined CSS/vanilla JS. SSE carries `heartbeat`/`snapshot`/`mutation`/`guardian`/`lineage` events; chokidar (existing dependency) watches only the data files and feeds change events into the stream.

**Tech Stack:** `node:http`, `node:fs/promises`, `chokidar` (existing dep, lazy import), `commander`, `picocolors`, vitest 5. **Zero new dependencies.** Spec: `docs/superpowers/specs/2026-10-06-dashboard-design.md`.

## Global Constraints

- **Zero new dependencies**: only `node:` builtins and already-installed `chokidar` / `commander` / `picocolors`.
- **Single final commit.** The phase mandate is one clean commit at the end with the exact message `feat(dashboard): introduce zero-dependency biometric web dashboard and CLI command (Phase 8)`. **Do NOT commit between tasks** — leave everything staged/dirty until Task 6.
- **Ports:** tests always use port `0` (ephemeral). CLI default port is `3838`, valid range 1–65535.
- **No non-null assertions** (`value!`), no `any`, no unused imports — oxlint/biome reject them.
- **Windows-safe paths**: always `path.join`/`path.resolve`, never POSIX string literals for filesystem paths.
- **Embedded client JS must not contain backticks or `${`** — it lives inside the outer template literal of `dashboardHtml()`. Use string concatenation in the client script.
- After `node --run lint` (biome auto-fixes formatting), re-run the touched tests to confirm they still pass.
- Lint gate: `node --run lint` = biome --write + oxlint + tsc + secretlint. Only pre-existing accepted warning allowed: `src/biomimicry/mutationOperators.ts:113`.

---

### Task 1: Snapshot gatherer

**Files:**
- Create: `src/dashboard/snapshot.ts`
- Test: `tests/dashboard/dashboard.test.ts` (new file, `describe('gatherSnapshot')` block)

**Interfaces:**
- Consumes: `parseLawsManifest`/`LAWS_FILE_NAME`/`Law` (`src/biomimicry/semanticGuardian.ts:7,15,61`), `loadLineage`/`computeOperatorWeights`/`Lineage`/`LineageEntry` (`src/biomimicry/lineageStore.ts:20,30,64,144`), `MUTATION_OPERATOR_NAMES`/`EvolutionSummary` (`src/biomimicry/types.ts:17,117`), `defaultEvolutionReportPath` (`src/biomimicry/report.ts:8`), `defaultReportPath`/`MEMORY_DIRECTORY` (`src/thermodynamics/report.ts:5,8`), `isGitRepository`/`execGitShortHead`.
- Produces (relied on by Tasks 2–6):
  - `interface DashboardSnapshot { root: string; head: string | null; guardian: { present: boolean; lawCount: number; laws: Law[] }; lineage: { wins: number; entries: LineageEntry[]; weights: Record<string, number> }; thermal: { present: boolean; generatedAt: string | null; maxTemperature: number; meanTemperature: number; fileCount: number; boilingFiles: number; hottestFiles: { file: string; temperature: number; band: string }[] }; evolution: { present: boolean; generatedAt: string | null; summary: EvolutionSummary | null; lastOperator: string | null; lastDelta: number | null }; watcher: { lastBeatAt: number | null }; serverAt: number }`
  - `interface SnapshotDeps { isGitRepository; execGitShortHead; loadLineage; readLaws; readThermalReport; readEvolutionReport; readBeat; now }`
  - `gatherSnapshot(requestedRoot: string, deps?: SnapshotDeps): Promise<DashboardSnapshot>`
  - `defaultSnapshotDeps: SnapshotDeps`

- [ ] **Step 1: Write the failing tests**

Create `tests/dashboard/dashboard.test.ts`:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gatherSnapshot } from '../../src/dashboard/snapshot.js';

describe('gatherSnapshot', () => {
  it('reports a cold start when nothing has run yet', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-dashboard-'));
    try {
      const snapshot = await gatherSnapshot(dir);

      expect(snapshot.root).toBe(path.resolve(dir));
      expect(snapshot.head).toBeNull();
      expect(snapshot.guardian).toEqual({ present: false, lawCount: 0, laws: [] });
      expect(snapshot.lineage.wins).toBe(0);
      expect(snapshot.thermal.present).toBe(false);
      expect(snapshot.evolution.present).toBe(false);
      expect(snapshot.watcher.lastBeatAt).toBeNull();
      expect(typeof snapshot.serverAt).toBe('number');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('assembles guardian, lineage, thermal and evolution sections from persisted files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-dashboard-'));
    try {
      await fs.writeFile(
        path.join(dir, '.manteka-laws.yaml'),
        ['- id: no-console', '  description: "no logging"', '  disallowedNode: CallExpression'].join('\n'),
        'utf8',
      );
      await fs.writeFile(
        path.join(dir, '.manteka-lineage.json'),
        JSON.stringify({
          schemaVersion: 1,
          entries: [
            { operator: 'comment-reducer', targetFile: 'src/a.ts', thermalAxis: 4, fitness: 2.4, recordedAt: '2026-10-06T00:00:00.000Z' },
            { operator: 'dead-guard', targetFile: 'src/b.ts', thermalAxis: 6, fitness: 3.1, recordedAt: '2026-10-06T00:01:00.000Z' },
          ],
        }),
        'utf8',
      );
      await fs.mkdir(path.join(dir, '.manteka-memory'));
      await fs.writeFile(
        path.join(dir, '.manteka-memory', 'thermodynamic-report.json'),
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-10-06T00:00:00.000Z',
          repo: { root: dir, isGitRepo: false, head: null },
          policy: { windowDays: 90, maxCommits: 500, tMax: 80, weights: {}, saturations: {} },
          summary: { fileCount: 2, boilingFiles: 1, maxTemperature: 82, meanTemperature: 41 },
          files: [
            { path: 'src/hot.ts', temperature: 82, band: 'Crítico' },
            { path: 'src/warm.ts', temperature: 0, band: 'Frío' },
          ],
        }),
        'utf8',
      );
      await fs.writeFile(
        path.join(dir, '.manteka-memory', 'evolution-report.json'),
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-10-06T00:02:00.000Z',
          repo: { root: dir, head: 'abc1234', runDir: '/tmp/run' },
          policy: {},
          testSignal: 'not-measured',
          baseline: { temperature: {}, testPassed: null },
          mutants: [
            { id: 'src/hot.ts::comment-reducer', targetFile: 'src/hot.ts', operator: 'comment-reducer', applied: true, mutationLine: 3, temperatureBefore: 82, temperatureAfter: 76, thermalAxis: 6, testPassed: null, testAxis: null, fitness: 4.2, viable: true, failure: null },
            { id: 'src/hot.ts::dead-guard', targetFile: 'src/hot.ts', operator: 'dead-guard', applied: false, mutationLine: null, temperatureBefore: 82, temperatureAfter: null, thermalAxis: null, testPassed: null, testAxis: null, fitness: null, viable: false, failure: 'no target' },
          ],
          summary: { total: 2, viable: 1, best: 'src/hot.ts::comment-reducer', worst: 'src/hot.ts::dead-guard' },
          states: ['done'],
        }),
        'utf8',
      );

      const snapshot = await gatherSnapshot(dir);

      expect(snapshot.guardian.present).toBe(true);
      expect(snapshot.guardian.lawCount).toBe(1);
      expect(snapshot.guardian.laws.map((law) => law.id)).toContain('no-console');
      expect(snapshot.lineage.wins).toBe(2);
      expect(snapshot.lineage.entries).toHaveLength(2);
      expect(snapshot.lineage.weights['comment-reducer']).toBeGreaterThan(snapshot.lineage.weights['dead-guard'] ?? 0);
      expect(snapshot.thermal).toMatchObject({
        present: true,
        maxTemperature: 82,
        meanTemperature: 41,
        fileCount: 2,
        boilingFiles: 1,
      });
      expect(snapshot.thermal.hottestFiles).toEqual([{ file: 'src/hot.ts', temperature: 82, band: 'Crítico' }]);
      expect(snapshot.evolution).toEqual({
        present: true,
        generatedAt: '2026-10-06T00:02:00.000Z',
        summary: { total: 2, viable: 1, best: 'src/hot.ts::comment-reducer', worst: 'src/hot.ts::dead-guard' },
        lastOperator: 'comment-reducer',
        lastDelta: 6,
      });
      expect(snapshot.watcher.lastBeatAt).not.toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('degrades a corrupt persisted report to an empty section', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-dashboard-'));
    try {
      await fs.mkdir(path.join(dir, '.manteka-memory'));
      await fs.writeFile(path.join(dir, '.manteka-memory', 'evolution-report.json'), 'not json', 'utf8');

      const snapshot = await gatherSnapshot(dir);

      expect(snapshot.evolution.present).toBe(false);
      expect(snapshot.thermal.present).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: FAIL — `Cannot find module '../../src/dashboard/snapshot.js'` (or `src/dashboard/` does not exist).

- [ ] **Step 3: Implement the snapshot gatherer**

Create `src/dashboard/snapshot.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { type Lineage, type LineageEntry, computeOperatorWeights, loadLineage } from '../biomimicry/lineageStore.js';
import { defaultEvolutionReportPath } from '../biomimicry/report.js';
import { LAWS_FILE_NAME, type Law, parseLawsManifest } from '../biomimicry/semanticGuardian.js';
import { type EvolutionReport, type EvolutionSummary, MUTATION_OPERATOR_NAMES } from '../biomimicry/types.js';
import { execGitShortHead } from '../core/git/gitCommand.js';
import { isGitRepository } from '../core/git/gitRepositoryHandle.js';
import { defaultReportPath } from '../thermodynamics/report.js';
import type { ThermodynamicReport } from '../thermodynamics/types.js';

/**
 * Read-only projection of a repository's autonomy state for the dashboard.
 *
 * Every section degrades independently: a missing or corrupt persisted file
 * flips that section to `present: false` instead of failing the snapshot, so
 * the server can always answer and the SPA can always render cold-start state.
 */
export interface DashboardSnapshot {
  readonly root: string;
  readonly head: string | null;
  readonly guardian: { readonly present: boolean; readonly lawCount: number; readonly laws: Law[] };
  readonly lineage: {
    readonly wins: number;
    readonly entries: LineageEntry[];
    /** Normalised epigenetic weights (sum to 1) over the declared operators. */
    readonly weights: Record<string, number>;
  };
  readonly thermal: {
    readonly present: boolean;
    readonly generatedAt: string | null;
    readonly maxTemperature: number;
    readonly meanTemperature: number;
    readonly fileCount: number;
    readonly boilingFiles: number;
    readonly hottestFiles: { readonly file: string; readonly temperature: number; readonly band: string }[];
  };
  readonly evolution: {
    readonly present: boolean;
    readonly generatedAt: string | null;
    readonly summary: EvolutionSummary | null;
    readonly lastOperator: string | null;
    readonly lastDelta: number | null;
  };
  readonly watcher: { readonly lastBeatAt: number | null };
  readonly serverAt: number;
}

export interface SnapshotDeps {
  isGitRepository: (directory: string) => Promise<boolean>;
  execGitShortHead: (directory: string) => Promise<string>;
  loadLineage: (repoRoot: string) => Promise<Lineage>;
  /** Raw manifest text, or null when the guardian has no manifest at all. */
  readLaws: (repoRoot: string) => Promise<string | null>;
  readThermalReport: (repoRoot: string) => Promise<ThermodynamicReport | null>;
  readEvolutionReport: (repoRoot: string) => Promise<EvolutionReport | null>;
  /** Newest mtime (ms) across the persisted reports, or null when absent. */
  readBeat: (repoRoot: string) => Promise<number | null>;
  now: () => number;
}

const readJsonFile = async <T>(target: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8')) as T;
  } catch {
    return null;
  }
};

export const defaultSnapshotDeps: SnapshotDeps = {
  isGitRepository,
  execGitShortHead,
  loadLineage,
  readLaws: async (repoRoot) => {
    try {
      return await fs.readFile(path.join(repoRoot, LAWS_FILE_NAME), 'utf8');
    } catch {
      return null;
    }
  },
  readThermalReport: (repoRoot) => readJsonFile<ThermodynamicReport>(defaultReportPath(repoRoot)),
  readEvolutionReport: (repoRoot) => readJsonFile<EvolutionReport>(defaultEvolutionReportPath(repoRoot)),
  readBeat: async (repoRoot) => {
    const candidates = [defaultReportPath(repoRoot), defaultEvolutionReportPath(repoRoot)];
    let latest: number | null = null;
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        latest = latest === null ? stat.mtimeMs : Math.max(latest, stat.mtimeMs);
      } catch {
        // A missing file contributes no beat.
      }
    }
    return latest;
  },
  now: () => Date.now(),
};

const thermalSection = (report: ThermodynamicReport | null): DashboardSnapshot['thermal'] => {
  if (report === null) {
    return {
      present: false,
      generatedAt: null,
      maxTemperature: 0,
      meanTemperature: 0,
      fileCount: 0,
      boilingFiles: 0,
      hottestFiles: [],
    };
  }
  return {
    present: true,
    generatedAt: report.generatedAt,
    maxTemperature: report.summary.maxTemperature,
    meanTemperature: report.summary.meanTemperature,
    fileCount: report.summary.fileCount,
    boilingFiles: report.summary.boilingFiles,
    hottestFiles: report.files
      .slice(0, 8)
      .map((file) => ({ file: file.path, temperature: file.temperature, band: file.band })),
  };
};

const evolutionSection = (report: EvolutionReport | null): DashboardSnapshot['evolution'] => {
  if (report === null) {
    return { present: false, generatedAt: null, summary: null, lastOperator: null, lastDelta: null };
  }
  const best = report.mutants.find((mutant) => mutant.id === report.summary.best);
  return {
    present: true,
    generatedAt: report.generatedAt,
    summary: report.summary,
    lastOperator: best?.operator ?? null,
    lastDelta: best?.thermalAxis ?? null,
  };
};

/**
 * Collect the full biometric snapshot. Each reader is called defensively so a
 * single unreadable file never turns into a 500 for the whole endpoint.
 */
export const gatherSnapshot = async (
  requestedRoot: string,
  deps: SnapshotDeps = defaultSnapshotDeps,
): Promise<DashboardSnapshot> => {
  const root = path.resolve(requestedRoot);
  const repository = await deps.isGitRepository(root).catch(() => false);
  const head = repository ? await deps.execGitShortHead(root).catch(() => null) : null;

  const lawsText = await deps.readLaws(root);
  let laws: Law[] = [];
  if (lawsText !== null) {
    try {
      laws = parseLawsManifest(lawsText);
    } catch {
      laws = [];
    }
  }

  const lineage = await deps.loadLineage(root);
  const thermal = await deps.readThermalReport(root).catch(() => null);
  const evolution = await deps.readEvolutionReport(root).catch(() => null);
  const lastBeatAt = await deps.readBeat(root).catch(() => null);

  return {
    root,
    head,
    guardian: { present: lawsText !== null, lawCount: laws.length, laws },
    lineage: {
      wins: lineage.entries.length,
      entries: lineage.entries.slice(-20).reverse(),
      weights: computeOperatorWeights(MUTATION_OPERATOR_NAMES, lineage),
    },
    thermal: thermalSection(thermal),
    evolution: evolutionSection(evolution),
    watcher: { lastBeatAt },
    serverAt: deps.now(),
  };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: PASS — 3/3.

---

### Task 2: Cyberpunk SPA module

**Files:**
- Create: `src/dashboard/ui.ts`
- Test: `tests/dashboard/dashboard.test.ts` (append `describe('dashboard SPA')`)

**Interfaces:**
- Consumes: nothing (pure string module).
- Produces: `dashboardHtml(): string` — full HTML document; relied on by Task 3's `GET /` route and Task 6 verification. The SPA calls `GET /api/status` and `GET /api/stream` (Tasks 3–4) and renders `DashboardSnapshot` (Task 1) plus SSE `heartbeat`/`snapshot`/`mutation`/`guardian`/`lineage` events.

- [ ] **Step 1: Write the failing tests**

Append to `tests/dashboard/dashboard.test.ts`:

```ts
import { dashboardHtml } from '../../src/dashboard/ui.js';

describe('dashboard SPA', () => {
  it('renders the biometric lab shell with every panel wired to the API', () => {
    const html = dashboardHtml();

    expect(html).toContain('<title>MANTEKA');
    expect(html).toContain('id="guardian-panel"');
    expect(html).toContain('id="heat-panel"');
    expect(html).toContain('id="weights-panel"');
    expect(html).toContain('id="evolution-panel"');
    expect(html).toContain('id="log-panel"');
    expect(html).toContain("new EventSource('/api/stream')");
    expect(html).toContain("fetch('/api/status')");
    expect(html).toContain('heartbeat');
    expect(html).toContain('RECONNECTING');
  });

  it('loads no external resources (fully self-contained)', () => {
    const html = dashboardHtml();

    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
    expect(html).not.toMatch(/url\(https?:/);
  });

  it('contains no backticks or template placeholders (it lives in a template literal)', () => {
    const html = dashboardHtml();

    expect(html).not.toContain('`');
    expect(html).not.toContain('${');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: FAIL — `dashboardHtml` is not exported from `../../src/dashboard/ui.js`.

- [ ] **Step 3: Implement the SPA**

Create `src/dashboard/ui.ts`:

```ts
/**
 * The biometric dashboard SPA: one self-contained HTML document with inlined
 * CSS and vanilla JS. No external requests — fonts are system stacks, icons
 * are unicode, the network surface is exactly `/api/status` and `/api/stream`.
 *
 * CONSTRAINT: this string is an outer template literal, so the embedded client
 * script must never contain backticks or the sequence `${`. Client-side string
 * building uses concatenation only.
 */
export const dashboardHtml = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MANTEKA · BIOMETRIC DASHBOARD</title>
<style>
:root{--bg:#05080f;--panel:#0b1220;--line:#16324a;--text:#c9e7ff;--dim:#6b7a90;--green:#39ff88;--cyan:#22d3ee;--magenta:#ff2bd6;--amber:#ffb020;--red:#ff4d6a;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--mono);background-image:radial-gradient(ellipse at 20% -10%,rgba(34,211,238,.12),transparent 55%),radial-gradient(ellipse at 90% 10%,rgba(57,255,136,.08),transparent 45%)}
.scanlines{position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px);mix-blend-mode:overlay;z-index:9}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--line);box-shadow:0 0 24px rgba(34,211,238,.15)}
.brand{letter-spacing:.28em;font-weight:700;color:var(--green);text-shadow:0 0 12px rgba(57,255,136,.6);font-size:14px}
.chip{border:1px solid var(--line);border-radius:3px;padding:3px 8px;font-size:12px;color:var(--dim)}
.chip b{color:var(--green)}
.lamp{display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.15em}
.dot{width:10px;height:10px;border-radius:50%;background:var(--dim)}
.lamp.live .dot{background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse 1s infinite}
.lamp.reconnecting .dot{background:var(--amber);box-shadow:0 0 10px var(--amber);animation:pulse .4s infinite}
.lamp.offline .dot{background:var(--red);box-shadow:0 0 10px var(--red)}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.55);opacity:.5}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;padding:18px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:14px 16px;box-shadow:0 0 18px rgba(0,0,0,.6),inset 0 0 24px rgba(34,211,238,.04)}
.panel h2{margin:0 0 10px;font-size:11px;letter-spacing:.24em;color:var(--cyan);text-transform:uppercase;border-bottom:1px dashed var(--line);padding-bottom:8px}
.panel.wide{grid-column:1/-1}
.stat{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
.stat b{color:var(--green);text-align:right;overflow-wrap:anywhere}
.verdict.active{color:var(--green)}.verdict.idle{color:var(--dim)}
.law{font-size:12px;color:var(--dim);padding:4px 0;border-top:1px solid rgba(22,50,74,.5)}
.law b{color:var(--text)}
.heat-row{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:4px 0 2px}
.heat-track{height:8px;border-radius:2px;background:#071018;margin-bottom:6px;overflow:hidden}
.heat-fill{height:100%;border-radius:2px;box-shadow:0 0 8px currentColor;transition:width .6s ease}
.weight-row{display:grid;grid-template-columns:180px 1fr 52px;gap:10px;align-items:center;font-size:12px;padding:5px 0}
.weight-track{height:14px;background:#071018;border:1px solid var(--line);border-radius:2px;overflow:hidden}
.weight-fill{height:100%;background:linear-gradient(90deg,var(--cyan),var(--green));box-shadow:0 0 10px rgba(57,255,136,.7);transition:width .6s ease}
.weight-value{text-align:right;color:var(--green)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.entries{max-height:220px;overflow-y:auto;font-size:12px;line-height:1.6}
.log-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.log-line .t{color:var(--dim)}
.log-line.mutation{color:var(--magenta)}.log-line.guardian{color:var(--amber)}
.log-line.lineage{color:var(--green)}.log-line.system{color:var(--cyan)}
.empty{color:var(--dim);font-size:12px;font-style:italic;padding:6px 0}
@media(max-width:900px){.weight-row{grid-template-columns:1fr;gap:4px}}
</style>
</head>
<body>
<div class="scanlines"></div>
<header>
  <div class="brand">MANTEKA · BIOMETRIC DASHBOARD</div>
  <div class="chips"><span class="chip" id="root-chip">—</span><span class="chip" id="head-chip">HEAD —</span><span class="chip" id="beat-chip">daemon offline</span></div>
  <div class="lamp offline" id="lamp"><span class="dot"></span><span id="lamp-text">CONNECTING</span></div>
</header>
<main class="grid">
  <section class="panel" id="guardian-panel"><h2>◈ Semantic Guardian</h2><div id="guardian-body" class="empty">awaiting snapshot…</div></section>
  <section class="panel" id="heat-panel"><h2>◉ Thermal Field</h2><div id="heat-body" class="empty">awaiting snapshot…</div></section>
  <section class="panel" id="weights-panel"><h2>◆ Epigenetic Weights</h2><div id="weights-body" class="empty">awaiting snapshot…</div></section>
  <section class="panel" id="evolution-panel"><h2>⧫ Evolution Cycle</h2><div id="evolution-body" class="empty">awaiting snapshot…</div></section>
  <section class="panel wide" id="log-panel"><h2>⌨ Event Stream</h2><div class="entries" id="log-entries"></div></section>
</main>
<script>
(function () {
  'use strict';
  var failures = 0;
  var lastBeat = null;
  var source = null;
  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

  function esc(value) { return String(value).replace(/[&<>"]/g, function (c) { return ESCAPES[c]; }); }
  function el(id) { return document.getElementById(id); }
  function setLamp(state, text) { var lamp = el('lamp'); lamp.className = 'lamp ' + state; el('lamp-text').textContent = text; }
  function heatColor(t) { return t >= 80 ? '#ff4d6a' : t >= 60 ? '#ff2bd6' : t >= 40 ? '#ffb020' : t >= 20 ? '#39ff88' : '#22d3ee'; }
  function pct(weight, max) { return Math.max(4, Math.round((weight / (max || 1)) * 100)); }
  function delta(value) { return value === null ? '—' : (value > 0 ? '+' : '') + value.toFixed(1); }

  function beatAge() {
    if (lastBeat === null) { return 'no daemon beat yet'; }
    var seconds = Math.max(0, Math.round((Date.now() - lastBeat) / 1000));
    return 'beat ' + seconds + 's ago';
  }

  function renderGuardian(g) {
    if (!g.present) { el('guardian-body').innerHTML = '<div class="empty">○ inactive · no .manteka-laws.yaml</div>'; return; }
    var verdict = g.lawCount > 0 ? '● active' : '○ idle';
    var html = '<div class="stat verdict ' + (g.lawCount > 0 ? 'active' : 'idle') + '"><span>' + verdict + '</span><b>' + g.lawCount + ' law' + (g.lawCount === 1 ? '' : 's') + '</b></div>';
    g.laws.forEach(function (law) {
      html += '<div class="law"><b>' + esc(law.id) + '</b> — ' + esc(law.description) + '</div>';
    });
    el('guardian-body').innerHTML = html;
  }

  function renderHeat(t) {
    if (!t.present) { el('heat-body').innerHTML = '<div class="empty">no thermal report — run manteka heat</div>'; return; }
    var html = '<div class="chips"><span class="chip">max <b>' + t.maxTemperature.toFixed(1) + '°</b></span><span class="chip">mean <b>' + t.meanTemperature.toFixed(1) + '°</b></span><span class="chip">boiling <b>' + t.boilingFiles + '/' + t.fileCount + '</b></span></div>';
    t.hottestFiles.forEach(function (f) {
      var width = Math.max(4, Math.min(100, Math.round((f.temperature / 80) * 100)));
      var color = heatColor(f.temperature);
      html += '<div class="heat-row"><span>' + esc(f.file) + '</span><span style="color:' + color + '">' + f.temperature.toFixed(1) + '° · ' + esc(f.band) + '</span></div>';
      html += '<div class="heat-track"><div class="heat-fill" style="width:' + width + '%;background:' + color + ';color:' + color + '"></div></div>';
    });
    el('heat-body').innerHTML = html;
  }

  function renderWeights(l) {
    if (l.wins === 0) { el('weights-body').innerHTML = '<div class="empty">cold start · no recorded wins yet</div>'; return; }
    var entries = Object.keys(l.weights).map(function (op) { return [op, l.weights[op]]; });
    entries.sort(function (a, b) { return b[1] - a[1]; });
    var max = entries.length > 0 ? entries[0][1] : 1;
    var html = '<div class="stat"><span>recorded wins</span><b>' + l.wins + '</b></div>';
    entries.forEach(function (pair) {
      html += '<div class="weight-row"><span>' + esc(pair[0]) + '</span><div class="weight-track"><div class="weight-fill" style="width:' + pct(pair[1], max) + '%"></div></div><span class="weight-value">' + (pair[1] * 100).toFixed(1) + '%</span></div>';
    });
    el('weights-body').innerHTML = html;
  }

  function renderEvolution(s) {
    var e = s.evolution;
    if (!e.present) { el('evolution-body').innerHTML = '<div class="empty">no evolution report — run manteka evolve</div>'; return; }
    var html = '<div class="stat"><span>generated</span><b>' + esc(e.generatedAt || '—') + '</b></div>';
    html += '<div class="stat"><span>viable mutants</span><b>' + (e.summary ? e.summary.viable + '/' + e.summary.total : '—') + '</b></div>';
    html += '<div class="stat"><span>best mutant</span><b>' + esc((e.summary && e.summary.best) || '—') + '</b></div>';
    html += '<div class="stat"><span>operator · ΔT</span><b>' + esc(e.lastOperator || '—') + ' · ' + delta(e.lastDelta) + '</b></div>';
    html += '<div class="stat"><span>watcher</span><b id="beat-age">' + beatAge() + '</b></div>';
    el('evolution-body').innerHTML = html;
  }

  function render(s) {
    el('root-chip').textContent = s.root;
    el('head-chip').textContent = 'HEAD ' + (s.head || '—');
    el('beat-chip').textContent = s.watcher.lastBeatAt === null ? 'daemon offline' : 'daemon beat';
    renderGuardian(s.guardian);
    renderHeat(s.thermal);
    renderWeights(s.lineage);
    renderEvolution(s);
  }

  function logLine(kind, payload) {
    var box = el('log-entries');
    var line = document.createElement('div');
    line.className = 'log-line ' + kind;
    line.innerHTML = '<span class="t">[' + new Date().toLocaleTimeString() + ']</span> ' + esc(kind) + ' · ' + esc(payload);
    box.insertBefore(line, box.firstChild);
    while (box.childNodes.length > 50) { box.removeChild(box.lastChild); }
  }

  function connect() {
    source = new EventSource('/api/stream');
    source.onopen = function () { failures = 0; setLamp('live', 'LIVE'); logLine('system', 'stream connected'); };
    source.onerror = function () {
      failures += 1;
      if (failures >= 5) { setLamp('offline', 'OFFLINE'); } else { setLamp('reconnecting', 'RECONNECTING'); }
    };
    source.addEventListener('heartbeat', function () {
      lastBeat = Date.now();
      setLamp('live', 'LIVE');
      var age = document.getElementById('beat-age');
      if (age) { age.textContent = beatAge(); }
      el('beat-chip').textContent = beatAge();
    });
    source.addEventListener('snapshot', function (event) { render(JSON.parse(event.data)); });
    ['mutation', 'guardian', 'lineage'].forEach(function (kind) {
      source.addEventListener(kind, function (event) {
        var data = JSON.parse(event.data);
        logLine(kind, data.file ? data.file + ' changed' : JSON.stringify(data));
      });
    });
  }

  fetch('/api/status').then(function (r) { return r.json(); }).then(render).catch(function () { logLine('system', 'initial snapshot failed'); });
  connect();
  setInterval(function () {
    var age = document.getElementById('beat-age');
    if (age) { age.textContent = beatAge(); }
    if (lastBeat !== null) { el('beat-chip').textContent = beatAge(); }
  }, 1000);
})();
</script>
</body>
</html>
`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: PASS — 6/6 (3 snapshot + 3 SPA).

---

### Task 3: HTTP server — lifecycle, `GET /`, `GET /api/status`

**Files:**
- Create: `src/dashboard/server.ts`
- Test: `tests/dashboard/dashboard.test.ts` (append `describe('dashboard server')`)

**Interfaces:**
- Consumes: `DashboardSnapshot` + `gatherSnapshot` shape from Task 1 (injected as `deps.gatherSnapshot`), `dashboardHtml()` from Task 2.
- Produces (Tasks 4–6):
  - `type DashboardEventType = 'heartbeat' | 'snapshot' | 'mutation' | 'guardian' | 'lineage'`
  - `interface DashboardDeps { root: string; gatherSnapshot: () => Promise<DashboardSnapshot>; watch?: (paths: string | string[], options?: ChokidarOptions) => FSWatcher; heartbeatMs?: number; now?: () => number }`
  - `interface DashboardServerHandle { start(port: number): Promise<{ port: number; url: string }>; close(): Promise<void>; emit(event: DashboardEventType, data: unknown): void }`
  - `createDashboardServer(deps: DashboardDeps): DashboardServerHandle`
  - `isDashboardDataPath(root: string, target: string): boolean`
  - Test helper `sampleSnapshot(): DashboardSnapshot` defined in the test file (reused by Task 4).

- [ ] **Step 1: Write the failing tests**

Append to `tests/dashboard/dashboard.test.ts` (add the imports at the top of the file as needed):

```ts
import type { DashboardSnapshot } from '../../src/dashboard/snapshot.js';
import { createDashboardServer, type DashboardServerHandle } from '../../src/dashboard/server.js';

const sampleSnapshot = (): DashboardSnapshot => ({
  root: path.resolve('fake-repo'),
  head: 'abc1234',
  guardian: {
    present: true,
    lawCount: 1,
    laws: [{ id: 'no-console', description: 'no logging', disallowedNode: 'CallExpression' }],
  },
  lineage: {
    wins: 3,
    entries: [
      { operator: 'comment-reducer', targetFile: 'src/a.ts', thermalAxis: 4, fitness: 2.4, recordedAt: '2026-10-06T00:00:00.000Z' },
    ],
    weights: { 'comment-reducer': 0.4, 'dead-guard': 0.2, 'comment-noise': 0.15, 'constant-perturbation': 0.15, 'dead-guard-stripper': 0.1 },
  },
  thermal: {
    present: true,
    generatedAt: '2026-10-06T00:00:00.000Z',
    maxTemperature: 72.5,
    meanTemperature: 31.2,
    fileCount: 12,
    boilingFiles: 1,
    hottestFiles: [{ file: 'src/hot.ts', temperature: 72.5, band: 'Muy Caliente' }],
  },
  evolution: {
    present: true,
    generatedAt: '2026-10-06T00:02:00.000Z',
    summary: { total: 5, viable: 2, best: 'src/hot.ts::comment-reducer', worst: null },
    lastOperator: 'comment-reducer',
    lastDelta: 6.4,
  },
  watcher: { lastBeatAt: 1770000000000 },
  serverAt: 1770000000000,
});

describe('dashboard server', () => {
  let handle: DashboardServerHandle | null = null;
  let baseUrl = '';

  const startServer = async (overrides: Partial<Parameters<typeof createDashboardServer>[0]> = {}) => {
    handle = createDashboardServer({
      root: path.resolve('fake-repo'),
      gatherSnapshot: async () => sampleSnapshot(),
      heartbeatMs: 30,
      ...overrides,
    });
    const started = await handle.start(0);
    baseUrl = `http://127.0.0.1:${started.port}`;
    return { handle, started };
  };

  afterEach(async () => {
    await handle?.close();
    handle = null;
  });

  it('starts on an ephemeral port and reports its URL', async () => {
    const { started } = await startServer();

    expect(started.port).toBeGreaterThan(0);
    expect(started.url).toBe(`http://127.0.0.1:${started.port}`);
  });

  it('serves the SPA at GET / as text/html', async () => {
    await startServer();

    const response = await fetch(`${baseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('MANTEKA · BIOMETRIC DASHBOARD');
  });

  it('serves the injected snapshot at GET /api/status', async () => {
    await startServer();

    const response = await fetch(`${baseUrl}/api/status`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(sampleSnapshot());
  });

  it('answers 404 for unknown routes and 405 for non-GET methods', async () => {
    await startServer();

    const missing = await fetch(`${baseUrl}/api/nope`);
    expect(missing.status).toBe(404);

    const posted = await fetch(`${baseUrl}/api/status`, { method: 'POST' });
    expect(posted.status).toBe(405);
    expect(posted.headers.get('allow')).toBe('GET');
  });

  it('closes cleanly and is idempotent', async () => {
    const { handle: server } = await startServer();

    await server.close();
    await expect(fetch(`${baseUrl}/api/status`)).rejects.toThrow();
    await expect(server.close()).resolves.toBeUndefined();
  });
});
```

Add `import { afterEach } from 'vitest';` to the vitest import line when creating the file (Task 1 imported only `describe/expect/it` — adjust the top-level import to `import { afterEach, describe, expect, it } from 'vitest';`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: FAIL — `Cannot find module '../../src/dashboard/server.js'`.

- [ ] **Step 3: Implement the server (REST part)**

Create `src/dashboard/server.ts`:

```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { ChokidarOptions, FSWatcher } from 'chokidar';
import { LINEAGE_FILE_NAME } from '../biomimicry/lineageStore.js';
import { EVOLUTION_REPORT_FILE_NAME } from '../biomimicry/report.js';
import { LAWS_FILE_NAME } from '../biomimicry/semanticGuardian.js';
import { logger } from '../shared/logger.js';
import { MEMORY_DIRECTORY } from '../thermodynamics/report.js';
import { type DashboardSnapshot, gatherSnapshot } from './snapshot.js';
import { dashboardHtml } from './ui.js';

export type DashboardEventType = 'heartbeat' | 'snapshot' | 'mutation' | 'guardian' | 'lineage';

export interface DashboardDeps {
  readonly root: string;
  gatherSnapshot: () => Promise<DashboardSnapshot>;
  watch?: (paths: string | string[], options?: ChokidarOptions) => FSWatcher;
  heartbeatMs?: number;
  now?: () => number;
}

export interface DashboardServerHandle {
  /** port 0 binds an ephemeral port; resolves with the bound URL. */
  start(port: number): Promise<{ port: number; url: string }>;
  close(): Promise<void>;
  emit(event: DashboardEventType, data: unknown): void;
}

/**
 * Whether chokidar should observe this path: the memory directory plus the
 * guardian and lineage files at the root. Everything else — source trees,
 * node_modules, .git — is pruned so the watcher costs nothing on large repos.
 */
export const isDashboardDataPath = (root: string, target: string): boolean => {
  const memoryDir = path.join(root, MEMORY_DIRECTORY);
  if (target === memoryDir || target.startsWith(`${memoryDir}${path.sep}`)) {
    return true;
  }
  const name = path.basename(target);
  return name === LAWS_FILE_NAME || name === LINEAGE_FILE_NAME;
};

export const createDashboardServer = (deps: DashboardDeps): DashboardServerHandle => {
  const heartbeatMs = deps.heartbeatMs ?? 1000;
  const now = deps.now ?? (() => Date.now());
  const clients = new Set<http.ServerResponse>();
  let watcher: FSWatcher | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let changeTimer: NodeJS.Timeout | null = null;
  let watching = false;
  let listening = false;
  let closed = false;

  const send = (response: http.ServerResponse, event: string, data: unknown): void => {
    if (response.writableEnded || response.destroyed) return;
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const emit: DashboardServerHandle['emit'] = (event, data) => {
    for (const client of clients) {
      send(client, event, data);
    }
  };

  const broadcastSnapshot = (): void => {
    void deps
      .gatherSnapshot()
      .then((snapshot) => emit('snapshot', snapshot))
      .catch((error: unknown) => logger.error(`Dashboard snapshot failed: ${(error as Error).message}`));
  };

  const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    try {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }

      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;

      if (pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(dashboardHtml());
        return;
      }

      if (pathname === '/api/status') {
        const snapshot = await deps.gatherSnapshot();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(snapshot));
        return;
      }

      if (pathname === '/api/stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        });
        res.write('retry: 2000\n\n');
        clients.add(res);
        res.on('close', () => {
          clients.delete(res);
        });
        void deps
          .gatherSnapshot()
          .then((snapshot) => send(res, 'snapshot', snapshot))
          .catch(() => undefined);
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch (error) {
      logger.error(`Dashboard request failed: ${(error as Error).message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal Server Error');
    }
  };

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });
  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  const start = async (port: number): Promise<{ port: number; url: string }> => {
    if (closed) {
      throw new Error('Dashboard server is already closed');
    }
    if (listening) {
      throw new Error('Dashboard server is already listening');
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', onError);
        resolve();
      });
    });
    listening = true;

    const address = server.address() as AddressInfo;
    return { port: address.port, url: `http://127.0.0.1:${address.port}` };
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;

    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    if (changeTimer !== null) clearTimeout(changeTimer);
    if (watching && watcher !== null) await watcher.close();

    for (const client of clients) client.end();
    clients.clear();

    if (listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      listening = false;
    }
  };

  return { start, close, emit };
};
```

(`heartbeatTimer`/`changeTimer`/watcher wiring are populated in Task 4; the declarations above keep the shape final so Task 4 only adds behaviour, not new state.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: PASS — 11/11 (3 snapshot + 3 SPA + 5 server).

---

### Task 4: SSE stream, heartbeats, chokidar wiring

**Files:**
- Modify: `src/dashboard/server.ts` (populate heartbeat timer + watcher in `start()`)
- Test: `tests/dashboard/dashboard.test.ts` (append `describe('dashboard SSE stream')`)

**Interfaces:**
- Consumes: `DashboardServerHandle.emit`, `isDashboardDataPath`, `createDashboardServer` from Task 3; `DashboardEventType` union.
- Produces: the live `GET /api/stream` contract used by the SPA (Task 2) and CLI (Task 5): frames `retry: 2000`, then `event: heartbeat|snapshot|mutation|guardian|lineage`. Tests rely on helper `openStream()` / `readUntil()` defined in this task's test block.

- [ ] **Step 1: Write the failing tests**

Append to `tests/dashboard/dashboard.test.ts` (imports: `type FSWatcher` and `type ChokidarOptions` from `chokidar`):

```ts
import type { ChokidarOptions, FSWatcher } from 'chokidar';

const createFakeWatcher = () => {
  const listeners = new Map<string, (target: string) => void>();
  const watcher = {
    on(event: string, listener: (target: string) => void) {
      listeners.set(event, listener);
      return watcher;
    },
    close: async () => {},
  };
  return {
    watcher: watcher as unknown as FSWatcher,
    trigger: (event: string, target: string) => listeners.get(event)?.(target),
  };
};

describe('dashboard SSE stream', () => {
  let handle: DashboardServerHandle | null = null;
  let baseUrl = '';
  const controllers: AbortController[] = [];

  const startServer = async (overrides: Partial<Parameters<typeof createDashboardServer>[0]> = {}) => {
    handle = createDashboardServer({
      root: path.resolve('fake-repo'),
      gatherSnapshot: async () => sampleSnapshot(),
      heartbeatMs: 30,
      ...overrides,
    });
    const started = await handle.start(0);
    baseUrl = `http://127.0.0.1:${started.port}`;
    return handle;
  };

  const openStream = async (): Promise<ReadableStreamDefaultReader<Uint8Array>> => {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${baseUrl}/api/stream`, { signal: controller.signal });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    if (!response.body) {
      throw new Error('SSE response has no body');
    }
    return response.body.getReader();
  };

  const readUntil = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    predicate: (chunk: string) => boolean,
  ): Promise<string> => {
    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      if (predicate(buffer)) return buffer;
    }
    return buffer;
  };

  afterEach(async () => {
    for (const controller of controllers) controller.abort();
    controllers.length = 0;
    await handle?.close();
    handle = null;
  });

  it('opens with retry guidance and a heartbeat frame', async () => {
    await startServer();
    const reader = await openStream();

    const buffer = await readUntil(reader, (chunk) => chunk.includes('event: heartbeat'));

    expect(buffer).toContain('retry: 2000');
    expect(buffer).toContain('event: heartbeat');
    expect(buffer).toContain('event: snapshot');
    await reader.cancel();
  });

  it('delivers emit() frames to connected clients', async () => {
    const server = await startServer();
    const reader = await openStream();
    await readUntil(reader, (chunk) => chunk.includes('event: heartbeat'));

    server.emit('mutation', { file: 'evolution-report.json', at: 1 });

    const buffer = await readUntil(reader, (chunk) => chunk.includes('event: mutation'));
    expect(buffer).toContain('"file":"evolution-report.json"');
    await reader.cancel();
  });

  it('classifies filesystem changes into named events and rebroadcasts snapshots', async () => {
    const fake = createFakeWatcher();
    let capturedOptions: ChokidarOptions | undefined;
    const root = path.resolve('fake-repo');
    await startServer({
      watch: (_paths: string | string[], options?: ChokidarOptions) => {
        capturedOptions = options;
        return fake.watcher;
      },
    });
    const reader = await openStream();
    await readUntil(reader, (chunk) => chunk.includes('event: heartbeat'));

    fake.trigger('change', path.join(root, '.manteka-memory', 'evolution-report.json'));
    const mutationBuffer = await readUntil(reader, (chunk) => chunk.includes('event: mutation'));
    expect(mutationBuffer).toContain('evolution-report.json');

    fake.trigger('change', path.join(root, '.manteka-laws.yaml'));
    const guardianBuffer = await readUntil(reader, (chunk) => chunk.includes('event: guardian'));
    expect(guardianBuffer).toContain('.manteka-laws.yaml');

    const ignored = capturedOptions?.ignored;
    expect(typeof ignored).toBe('function');
    const ignore = ignored as (target: string) => boolean;
    expect(ignore(root)).toBe(false);
    expect(ignore(path.join(root, '.manteka-laws.yaml'))).toBe(false);
    expect(ignore(path.join(root, '.manteka-memory'))).toBe(false);
    expect(ignore(path.join(root, 'src', 'app.ts'))).toBe(true);
    expect(ignore(path.join(root, 'node_modules', 'pkg', 'index.js'))).toBe(true);
    await reader.cancel();
  });

  it('broadcasts a snapshot after a debounced file change', async () => {
    const fake = createFakeWatcher();
    const root = path.resolve('fake-repo');
    await startServer({ watch: () => fake.watcher });
    const reader = await openStream();
    // Consume the connection-time snapshot plus the first heartbeat, so any
    // snapshot seen afterwards must be the debounced post-change broadcast.
    await readUntil(reader, (chunk) => chunk.includes('event: heartbeat'));

    fake.trigger('add', path.join(root, '.manteka-lineage.json'));
    await new Promise((resolve) => setTimeout(resolve, 400));

    const buffer = await readUntil(reader, (chunk) => chunk.includes('event: snapshot'));
    expect(buffer).toContain('event: snapshot');
    await reader.cancel();
  });

  it('ends client streams and releases the port on close()', async () => {
    const server = await startServer();
    const reader = await openStream();
    await readUntil(reader, (chunk) => chunk.includes('event: heartbeat'));

    await server.close();

    const tail = await readUntil(reader, () => false);
    expect(tail).toBeDefined();
    await expect(fetch(`${baseUrl}/api/status`)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: new SSE block FAILS — no `event: heartbeat` frames arrive (heartbeat timer not started; `deps.watch` never invoked so `fake.trigger` reaches nobody).

- [ ] **Step 3: Implement heartbeat + watcher wiring in `start()`**

Edit `src/dashboard/server.ts` — inside `start()`, after computing `address`, add:

```ts
    heartbeatTimer = setInterval(() => {
      emit('heartbeat', { at: now() });
    }, heartbeatMs);

    const watchFn = deps.watch ?? (await import('chokidar')).watch;
    const root = deps.root;
    watcher = watchFn(root, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100 },
      ignored: (target: string) => target !== root && !isDashboardDataPath(root, target),
    });
    watching = true;

    const classify = (target: string): DashboardEventType | null => {
      const name = path.basename(target);
      if (name === LAWS_FILE_NAME) return 'guardian';
      if (name === LINEAGE_FILE_NAME) return 'lineage';
      if (name === EVOLUTION_REPORT_FILE_NAME) return 'mutation';
      return null;
    };

    const onFsEvent = (target: string): void => {
      const kind = classify(target);
      if (kind !== null) {
        emit(kind, { file: path.basename(target), at: now() });
      }
      if (changeTimer !== null) clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        changeTimer = null;
        broadcastSnapshot();
      }, 150);
    };

    watcher.on('change', onFsEvent);
    watcher.on('add', onFsEvent);
```

Note: `heartbeatTimer` must be created **before** the promise returned by `listen` resolves is fine either way, but keep it after `listening = true` so `close()` always clears it. The `start()` function therefore becomes `async` with the chokidar dynamic import — already declared as returning a Promise.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: PASS — 16/16.

---

### Task 5: CLI command `manteka dashboard`

**Files:**
- Create: `src/cli/commands/dashboardCommand.ts`
- Modify: `src/cli/index.ts` (import + `registerDashboardCommand(program)` after `registerWatchCommand`)
- Test: `tests/dashboard/dashboard.test.ts` (append `describe('manteka dashboard command')`)

**Interfaces:**
- Consumes: `createDashboardServer`/`DashboardDeps` (Task 3), `gatherSnapshot` (Task 1), `RepomixError` (`src/shared/errorHandle.ts`), `logger`, `pc`.
- Produces: `registerDashboardCommand(program: Command): void`, `DEFAULT_DASHBOARD_PORT = 3838`; `createMantekaProgram()` includes the `dashboard` subcommand (asserted by test).

- [ ] **Step 1: Write the failing tests**

Append to `tests/dashboard/dashboard.test.ts` (imports: `Command` from `commander`, `createMantekaProgram` from `../../src/cli/index.js`, `registerDashboardCommand` from `../../src/cli/commands/dashboardCommand.js`, `vi` from vitest; add `vi.mock('../../src/shared/logger');` after imports):

```ts
describe('manteka dashboard command', () => {
  const buildProgram = (): Command => {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    registerDashboardCommand(program);
    return program;
  };

  it('defaults to port 3838 and the current directory', async () => {
    const program = buildProgram();
    let directory = '';
    let captured: { port?: number } = {};
    program.commands[0].action((value: string, options: { port?: number }) => {
      directory = value;
      captured = options;
    });

    await program.parseAsync(['node', 'manteka', 'dashboard']);

    expect(directory).toBe('.');
    expect(captured.port).toBe(3838);
  });

  it('accepts a custom port and directory', async () => {
    const program = buildProgram();
    let directory = '';
    let captured: { port?: number } = {};
    program.commands[0].action((value: string, options: { port?: number }) => {
      directory = value;
      captured = options;
    });

    await program.parseAsync(['node', 'manteka', 'dashboard', 'some/repo', '--port', '4000']);

    expect(directory).toBe('some/repo');
    expect(captured.port).toBe(4000);
  });

  it('rejects ports outside the valid range', async () => {
    const program = buildProgram();
    program.commands[0].action(() => {});

    await expect(program.parseAsync(['node', 'manteka', 'dashboard', '--port', '0'])).rejects.toThrow(
      /between 1 and 65535/,
    );
    await expect(program.parseAsync(['node', 'manteka', 'dashboard', '--port', '70000'])).rejects.toThrow(
      /between 1 and 65535/,
    );
  });

  it('rejects a non-numeric port', async () => {
    const program = buildProgram();
    program.commands[0].action(() => {});

    await expect(program.parseAsync(['node', 'manteka', 'dashboard', '--port', 'abc'])).rejects.toThrow(
      /between 1 and 65535/,
    );
  });

  it('is registered on the manteka program alongside evolve, status and watch', () => {
    expect(createMantekaProgram().commands.map((command) => command.name())).toContain('dashboard');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: FAIL — `registerDashboardCommand` not exported / `dashboard` missing from `createMantekaProgram()`.

- [ ] **Step 3: Implement the command**

Create `src/cli/commands/dashboardCommand.ts`:

```ts
import path from 'node:path';
import process from 'node:process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { createDashboardServer } from '../../dashboard/server.js';
import { gatherSnapshot } from '../../dashboard/snapshot.js';
import { RepomixError } from '../../shared/errorHandle.js';
import { logger } from '../../shared/logger.js';

export const DEFAULT_DASHBOARD_PORT = 3838;

export interface DashboardCliOptions {
  port: number;
}

const parsePort = (value: string): number => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RepomixError(`Invalid value for --port: '${value}'. Expected an integer between 1 and 65535.`);
  }
  return port;
};

/**
 * Registers the `dashboard` subcommand: a read-only observability server over
 * the repository's autonomy state. Unlike `watch`, a non-Git directory is a
 * valid target — every section simply renders cold-start state.
 */
export const registerDashboardCommand = (program: Command): void => {
  program
    .command('dashboard')
    .description('Serve the biometric web dashboard: guardian, lineage, heat and evolution in real time')
    .argument('[directory]', 'repository to observe', '.')
    .option('--port <number>', 'TCP port to listen on', parsePort, DEFAULT_DASHBOARD_PORT)
    .action(async (directory: string, options: DashboardCliOptions) => {
      const root = path.resolve(directory);
      const handle = createDashboardServer({ root, gatherSnapshot: () => gatherSnapshot(root) });

      let url = '';
      try {
        url = (await handle.start(options.port)).url;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          const suggestion = Math.min(options.port + 1, 65535);
          throw new RepomixError(`Port ${options.port} is already in use. Try: manteka dashboard --port ${suggestion}`);
        }
        throw error;
      }

      logger.log(`🧪 ${pc.bold('Manteka Dashboard')} ${pc.cyan(url)}`);
      logger.log(pc.dim('   observing guardian · lineage · heat · evolution — Ctrl+C to stop'));

      await new Promise<void>((resolve) => {
        const stop = (): void => {
          process.removeListener('SIGINT', stop);
          process.removeListener('SIGTERM', stop);
          resolve();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });

      await handle.close();
      logger.log(pc.dim('Dashboard stopped.'));
    });
};
```

- [ ] **Step 4: Register on the manteka program**

Edit `src/cli/index.ts` — add the import (alphabetically first among command imports) and call after `registerWatchCommand(program)`:

```ts
import { registerDashboardCommand } from './commands/dashboardCommand.js';
```

```ts
  registerWatchCommand(program);
  registerDashboardCommand(program);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: PASS — 21/21.

---

### Task 6: Full verification and the single phase commit

**Files:**
- No new files; possibly biome formatting fixes to any Phase 8 file.

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: the phase commit `feat(dashboard): introduce zero-dependency biometric web dashboard and CLI command (Phase 8)`.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all suites pass (previously 2192 passing + the new 21 = 2213 passed, 24 skipped, 0 failed).

- [ ] **Step 2: Run the lint gate**

Run: `node --run lint`
Expected: biome may auto-fix import order/formatting ("Fixed N files"), oxlint 0 errors (only the accepted `mutationOperators.ts:113` warning), tsc 0 errors, secretlint 0 errors.

- [ ] **Step 3: Re-run tests after any biome auto-fixes**

Run: `npx vitest run tests/dashboard/dashboard.test.ts`
Expected: PASS — 21/21. If biome changed formatting of source files, also re-run `node --run lint` once to confirm it reports "No fixes applied".

- [ ] **Step 4: Inspect the commit scope**

Run: `git status --porcelain`
Expected: only Phase 8 files dirty — `src/dashboard/snapshot.ts`, `src/dashboard/server.ts`, `src/dashboard/ui.ts`, `src/cli/commands/dashboardCommand.ts`, `src/cli/index.ts`, `tests/dashboard/dashboard.test.ts`. (The spec doc was committed earlier as `aa5a7e4b`.) If other files are modified by biome, verify the changes are formatting-only before staging.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(dashboard): introduce zero-dependency biometric web dashboard and CLI command (Phase 8)"
```

- [ ] **Step 6: Confirm a clean tree**

Run: `git status --porcelain`
Expected: empty output.
