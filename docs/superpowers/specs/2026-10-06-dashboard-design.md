# Phase 8 — Real-Time Biometric Web Dashboard

Status: approved design. Phase: 8. Builds on Phase 7 (`src/cli/watcher.ts`),
Phase 6.1 (`src/biomimicry/semanticGuardian.ts`) and Phase 6.2
(`src/biomimicry/lineageStore.ts`). Approach: **Option A** — native
`node:http` server, zero new dependencies, SPA embedded as a TypeScript module.

## Problem

Phases 5–7 produce rich telemetry — guardian laws, lineage wins, epigenetic
operator weights, thermal reports, evolution cycle verdicts — but the only
consumer is the terminal, where history scrolls away. There is no surface on
which to *watch* the organism live: no heartbeat, no heat panel, no weight
bars. Phase 8 adds a read-only observability dashboard served locally by a
new `manteka dashboard` command.

## Non-goals

- **No controls.** Read-only observation plus heartbeat. No buttons that run
  evolution cycles, pause the watcher, or edit laws/lineage.
- **No coupling to the watch process.** The dashboard is autonomous and
  best-effort: it reads persisted state (`.manteka-*`, `.manteka-memory/*`)
  and watches those files for changes. A running `manteka watch` in another
  terminal feeds the same files, so the dashboard reflects it — but neither
  requires the other. If nothing has run yet, panels show cold-start state.
- **No new dependencies.** `node:http`, `node:fs`, existing `chokidar`,
  `picocolors`, `commander`. No express/hono/ws; no build step for the UI.
- **No auth / TLS.** Bound to localhost only; it is a local developer tool.
- **No temperature recomputation.** Thermal data comes exclusively from
  `.manteka-memory/thermodynamic-report.json` (written by `manteka heat`)
  and evolution data from `.manteka-memory/evolution-report.json` (written
  by the engine). Missing reports render as empty state.

---

## Architecture

```
src/dashboard/
  server.ts     DI HTTP server: createDashboardServer(deps) → handle
  ui.ts         SPA export: dashboardHtml(template data) → string (cyberpunk lab)
src/cli/commands/dashboardCommand.ts   manteka dashboard [directory] [--port <n>]
src/cli/index.ts                       registerDashboardCommand(program)
tests/dashboard/dashboard.test.ts
```

Rough sizes: `server.ts` ~260 lines, `ui.ts` ~400 lines (if it grows past
~450, split into `ui/head.ts` + `ui/body.ts`), command ~70. New top-level
`src/dashboard/` module. No changes to `src/biomimicry/` or
`src/cli/watcher.ts` — the watcher is *observed* through the files it
persists, never imported for its side effects.

### Server (`src/dashboard/server.ts`)

```ts
export interface DashboardDeps {
  gatherSnapshot: () => Promise<DashboardSnapshot>;  // default: real fs readers
  watch: (paths: string | string[], options?: ChokidarOptions) => FSWatcher; // default chokidar
  heartbeatMs: number;   // default 1000
  now: () => number;     // default Date.now
}

export interface DashboardServerHandle {
  start(port: number): Promise<{ port: number; url: string }>; // port 0 → ephemeral
  close(): Promise<void>;
  emit(event: DashboardEventType, data: unknown): void;  // watcher hooks / tests
}
```

- `createDashboardServer(deps)` builds the handle **without** listening —
  tests can drive `start(0)` (ephemeral port, released on `close()`) or call
  `emit` with a stubbed snapshot; no port is held outside a live session.
- Default deps read the real filesystem: `gatherSnapshot()` assembles
  guardian state (read `LAWS_FILE_NAME` → `parseLawsManifest`), lineage
  (`loadLineage` + `computeOperatorWeights(MUTATION_OPERATOR_NAMES, …)`),
  thermal + evolution persisted reports, git HEAD.
- chokidar (already a dependency) watches the data files under the repo root;
  a change triggers a debounced (150 ms) SSE re-broadcast of the new snapshot
  delta. This *is* the connection to the watcher hooks: `manteka watch`
  persists `.manteka-memory/evolution-report.json` and `.manteka-lineage.json`
  on every cycle, so file change → SSE event, with zero process coupling.
  `handle.emit()` exists so tests — or a future in-process integration — can
  inject `mutation` events directly.

**Routes** (GET only; other methods → 405; unknown path → 404):

| Route | Response |
|---|---|
| `GET /` | `200` `text/html; charset=utf-8` — the SPA |
| `GET /api/status` | `200` `application/json` — full `DashboardSnapshot` |
| `GET /api/stream` | `200` `text/event-stream` — SSE: `heartbeat` every `heartbeatMs`, plus `snapshot`, `mutation`, `guardian`, `lineage` events |

SSE responses send `retry: 2000`, flush headers immediately, heartbeat with
`event: heartbeat` + `data: {"at": <epoch ms>}`. The server tracks open SSE
clients; `close()` ends them (`res.end()`), removes listeners, closes the
chokidar watcher, and resolves only after the HTTP server has emitted
`close`. `clientError` and request-handler errors are contained (log +
`500`, never crash the process).

### Snapshot contract

```ts
interface DashboardSnapshot {
  root: string;
  head: string | null;
  guardian: { present: boolean; lawCount: number; laws: Law[] };
  lineage: { wins: number; entries: LineageEntry[]; weights: Record<string, number> };
  thermal: { present: boolean; maxTemperature: number; meanTemperature: number;
             fileCount: number; boilingFiles: number; hottestFiles: { file: string; temperature: number }[] };
  evolution: { present: boolean; generatedAt: string | null; summary: EvolutionSummary | null;
               lastOperator: string | null; lastDelta: number | null };
  watcher: { lastBeatAt: number | null };
  serverAt: number;
}
```

All fields are always present; absence is expressed as `present: false` /
`null`, so the SPA renders cold-start state without branching on shape.

### SPA (`src/dashboard/ui.ts`)

Single `dashboardHtml(): string` returning a full HTML document: inlined
CSS + vanilla JS, no external requests (fonts are system stacks; icons are
CSS/unicode). Aesthetic: **biomimetic laboratory / cyberpunk** — near-black
`#05080f` canvas, neon-green `#39ff88` + cyan `#22d3ee` + magenta accents,
scanline overlay, `box-shadow` glow panels, monospace typography
(`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`).

Layout (CSS grid, responsive to a single column under 900 px):

1. **Header bar** — `MANTEKA · BIOMETRIC DASHBOARD`, repo root, HEAD chip,
   and a **heartbeat lamp** (pulsing dot): green pulsing on `heartbeat`
   events, amber “RECONNECTING” on `EventSource.onerror`, gray `OFFLINE`
   after repeated failures.
2. **Guardian panel** — active/inactive verdict (●/○), law count, list of
   law ids + descriptions.
3. **Heat panel** — horizontal heat strip built from `hottestFiles`
   (per-file bar colored by `THERMAL_BANDS`-style ramp), plus
   max/mean/boiling stat chips. Empty state: “no thermal report — run
   `manteka heat`”.
4. **Epigenetic weights panel** — one animated bar per operator, sorted
   descending, neon fill proportional to weight, value shown as %.
5. **Evolution + watcher strip** — last cycle summary (viable/total, best
   operator, ΔT), last beat age (“beat 2s ago”).
6. **Event log** — reverse-chronological console of SSE events
   (`mutation`, `guardian`, `lineage`, connection lifecycle), max ~50 lines,
   monospace with timestamps and colored severity.

JS behavior: `new EventSource('/api/stream')`; `heartbeat` updates the lamp
+ beat age; `snapshot` re-renders all panels from the payload; `open`/`error`
drive the lamp state. Native EventSource auto-reconnect handles recovery; a
manual `onerror` counter escalates the lamp to `OFFLINE` after 5 failures
before rebuilding the source. Renderers are pure functions over the snapshot
so the initial paint can call `GET /api/status` immediately, then stay live
via SSE.

### CLI (`src/cli/commands/dashboardCommand.ts`)

```
manteka dashboard [directory]   # default '.'
  --port <number>               # default 3838, integer 1–65535 (RepomixError otherwise)
```

Startup: resolve root → `createDashboardServer(defaultDeps(root))` →
`start(port)` → print a clean banner (`🧪 Manteka Dashboard → http://127.0.0.1:3838`,
`Ctrl+C to stop`). Port-in-use (`EADDRINUSE`) surfaces as a `RepomixError`
suggesting `--port`. Graceful shutdown mirrors `watchCommand`: first
SIGINT/SIGTERM resolves a promise, `handle.close()` runs, banner `Dashboard
stopped.` prints; a second signal falls back to Node default termination.
Fail-fast on missing Git repository is **not** required (read-only cold
start is valid), but an invalid directory path throws.

Registered in `src/cli/index.ts` after `registerWatchCommand`. The
`bin/manteka.cjs` entry needs no change (it already loads `runManteka`).

---

## Error handling

- Snapshot readers are individually try/caught: a corrupt
  `evolution-report.json` degrades that section to `present: false` + logged
  warning, never a 500.
- SSE send failures (client vanished mid-write) remove the client; they never
  propagate to the request loop.
- `close()` is idempotent (second call resolves immediately).
- Server errors during `start()` reject with the original errno so the
  command can translate `EADDRINUSE` into actionable guidance.

## Testing (`tests/dashboard/dashboard.test.ts`)

Pattern: `createDashboardServer(injectedDeps)` → `start(0)` → real
`fetch('http://127.0.0.1:<port>/…')` → `close()` in `afterEach`. Ephemeral
ports only; no fixed ports, no cross-test leakage.

1. **Lifecycle** — `start` reports the bound port and URL; `GET /` returns
   200 `text/html` containing dashboard markers; `close()` resolves, the
   port refuses new connections, a second `close()` resolves.
2. **`GET /api/status`** — serves injected snapshot fields (guardian laws,
   lineage weights, thermal stats); cold-start snapshot serialises with
   `present: false` sections; unknown route → 404; `POST` → 405.
3. **SSE** — first frame is `retry:` + `heartbeat`; `handle.emit('mutation',
   …)` reaches the connected client; heartbeats repeat at the injected
   `heartbeatMs` (tests use ~30 ms); `close()` ends the stream.
4. **Command parsing** — `manteka dashboard` defaults to port 3838,
   `--port 4000` captured, `--port 0` / `--port abc` rejected.

## Verification

Full suite (`npx vitest run`), then `node --run lint` (biome + oxlint + tsc
+ secretlint). Re-run tests after biome auto-fixes. Commit:

```
feat(dashboard): introduce zero-dependency biometric web dashboard and CLI command (Phase 8)
```
