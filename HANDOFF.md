# Manteka — Engineering Handoff

> Autonomous Code Evolution Engine · `martillohamer/manteka-repomix` · v1.18.1-manteka.1
>
> This document is written for the engineer picking the project up next. It records the
> **verified** state of the repository, the architectural decisions behind it, and the
> constraints that will bite you if you ignore them.

---

## 1. Current State — Production Ready

All three quality gates are green on `main` at commit `5d3ecd7`:

| Gate | Command | Result |
|---|---|---|
| Production build | `npm run build` | **exit 0** — 0 TypeScript errors |
| Static typecheck | `npm run lint-ts` | **exit 0** — 0 TypeScript errors |
| Test suite | `npx vitest run` | **2371 passed / 0 failed** (18 skipped) |

| Metric | Value |
|---|---|
| Test files | 198 passed, 1 skipped (199 total) |
| Tests | 2371 passed, 18 skipped, **0 failed** |
| Runtime dependencies | 29 packages (see §5 — *not* zero) |
| Platform | Windows + POSIX, enforced through `node:path` |
| MCP transport | JSON-RPC 2.0 over stdio |

### 1.1 On the 18 skipped tests

They are deliberate and are **not** a Vitest artifact:

| File | Skipped | Why |
|---|---|---|
| `tests/integration-tests/packager.test.ts` | 4 (whole file) | Packager integration suite, gated |
| `tests/core/file/fileProcessorRun.test.ts` | 4 | Platform/permission specific |
| `tests/core/file/fileSearch.test.ts` | 5 | Symlink and gitignore edge cases |
| `tests/core/git/gitCommand.test.ts` | 3 | Requires a live git binary |
| `tests/cli/actions/watch/watchIgnore.test.ts` | 1 | Timing dependent |
| `tests/mcp/tools/mantekaSemanticDebugTool.test.ts` | 1 | Sandbox-specific setup |

Earlier revisions of this document described a "Vitest module-caching artifact" causing
skips. That explanation was wrong — the skips are explicit and reproducible.

---

## 2. Capabilities Added in the CLI/MCP Expansion

### 2.1 `manteka analyze [--deep]`

Dependency-graph auditor over the `.ts`/`.js` tree, with a **real** distinction between
the two modes:

| | shallow (default) | `--deep` |
|---|---|---|
| `dependencyGraph` | direct one-hop edges | direct one-hop edges (**identical**) |
| `maxImportDepth` | capped at 1 | longest path in the graph |
| `transitiveGraph` | `{}` | transitive closure per node |
| `depthDistribution` | omitted | files per distance from a root |
| `transitiveFileCount` | omitted | files reachable transitively |
| `entryPoints` / `leafFiles` | omitted | roots / leaves of the graph |

`dependencyGraph` is deliberately byte-identical across modes, so `--deep` can only
*add* information — never change the direct edges. Shallow **omits** extended metrics
rather than reporting `0`, so "not measured" cannot be misread as "measured as none".

Cycle-safe: `calculateImportDepthsSimple` memoises per node and treats a back-edge as
depth 0, so `a → b → a` terminates instead of overflowing the stack.

### 2.2 `manteka inspect [--json]`

Prints the registered MCP tool registry — name, description and parameter map — as text
or as machine-readable JSON.

> Registered as the subcommand `inspect`. The advertised spelling `manteka mcp inspect`
> is **not** wired; use `manteka inspect`.
>
> Previously `main()` printed a placeholder here instead of dispatching, so the
> command was reachable only through `createMantekaProgram()` in tests. Both `inspect`
> and `slice` are now dispatched from `main()` and verified through the real binary.

### 2.3 `manteka doctor`

Four environment checks, owned by `src/core/doctor/checks.ts` and shared by the CLI and
the `manteka_doctor` MCP tool:

1. Node.js version (warn below 18, fail below 14)
2. Filesystem read/write in the temp dir
3. Memory lineage integrity (`.manteka/memory/lineage.ndjson`, NDJSON parse)
4. Configuration metadata (`package.json`, `server.json`)

**Exit code is 1 only on a `fail`.** Warnings do not fail the command — see ADR-4.

### 2.4 `manteka slice --export <markdown|json|xml>`

Exports the Smart-Slice dependency closure as retrieval-ready context for LLM prompts.

```bash
manteka slice src/index.ts --export markdown
manteka slice src/index.ts --export json --out ctx/slice.json
manteka slice src/index.ts --export xml  --out ctx/slice.xml
```

`--export` is **required** and strictly validated; an unknown value fails loudly rather
than silently defaulting to a format the caller did not ask for. `--out` creates missing
parent directories and tolerates `EPERM` on the `mkdir` (Windows 8.3 temp paths raise it
on fully accessible directories); a genuinely denied write still raises.

Formatting details that matter downstream:

- Markdown fences escalate past any fence present in the file content, so a nested
  ```` ``` ```` cannot terminate the block early.
- XML escapes the five metacharacters in attributes and carries content in `CDATA`,
  splitting `]]>` as `]]]]><![CDATA[>` so contents cannot close the section.
- Files are capped at 20,000 characters each (`SLICE_EXPORT_MAX_FILE_CHARS`); truncated
  files are flagged `truncated="true"` in all three formats.

The renderer lives in `src/core/smartSlice/export.ts`. The CLI and the
`manteka_smart_slice` MCP tool share it, and a test asserts both emit byte-identical
output for the same input.

---

## 3. Recent Architecture Decisions

### ADR-1 — `bin/manteka.cjs` pointed at `src/`, not `lib/`

**Problem.** `bin/manteka.cjs` did `await import('../src/cli/index.js', ...)`. The build
emits to `lib/`, so that specifier resolves to a `.ts` file that never exists at runtime.
**Every `manteka <command>` died with `ERR_MODULE_NOT_FOUND`.**

`repomix.cjs` and `manteka-mcp.cjs` already imported from `../lib`; `manteka.cjs` was the
outlier.

**Decision.** Point it at `../lib/cli/index.js`, matching its siblings.

**Impact.** The binary works. No test covered this — it surfaced only when verifying
`--deep` end-to-end through the real CLI. **Lesson: bin shims need at least one
smoke test.**

### ADR-2 — Module-cache isolation with `vi.resetModules()`

**Problem.** Vitest hoists module state across a full-suite run, so tests that mutate a
module-level singleton (the MCP tool registry, the Swarm event bus) interfere with each
other when the whole suite shares a worker.

**Decision.** `vi.resetModules()` in the test body plus a file-level `vi.mock` of
`../../src/shared/logger`, for any suite that depends on module init order.

**Impact.** Deterministic full-suite runs; the Smart-Slice and MCP suites no longer
depend on execution order.

### ADR-3 — Sandbox gating for path- and write-touching tools

**Problem.** `createMcpServer` registered the Manteka native tools unconditionally —
including under `--sandbox`. But `manteka_heal` writes to a caller-supplied path,
`manteka_analyze_codebase` walks a caller-supplied root, and `manteka_memory_search`
reads the process cwd's lineage store. None of them are root-confined, so exposing them
inside the sandbox handed the agent exactly the unbounded access `--sandbox` exists to
remove.

**Decision.** Register the Manteka native tools only when `!config.sandboxed`, alongside
the other non-sandboxed tools. A test asserts `manteka_heal`, `manteka_analyze_codebase`
and `manteka_memory_search` are **absent** in sandbox mode.

**Impact.** Non-sandboxed: 19 tools. Sandboxed: 11.

### ADR-4 — `doctor` exits non-zero only on failure

**Problem.** `runDoctor` exited 1 whenever any check was not `ok`, i.e. also on warnings.
Since "lineage file not found" and "server.json missing serverName" are normal states,
`manteka doctor` returned 1 on a healthy checkout — useless as a CI gate.

**Decision.** Exit 1 only when at least one check reports `fail`; warnings still print
and are reported in the summary line.

**Impact.** `manteka doctor` is now a usable CI signal.

### ADR-5 — The SDK server cannot take the native handler map

**Problem.** `registerMantekaTools` calls `server.registerToolHandler(...)`, a method of
the **native** `MCPServer` in `src/mcp/server.ts`. The `McpServer` from
`@modelcontextprotocol/sdk` has no such method — it exposes `registerTool`. Passing the
SDK instance would throw `TypeError` at startup. The suite did not catch it because
`tests/mcp/mcpServer.test.ts` **faked** `registerToolHandler` on the mock.

**Decision.** Keep one `registerMantekaTools` and add `registerMantekaToolsForSdk`,
which adapts each handler onto `registerTool` with a real JSON Schema
(`MANTEKA_TOOL_SCHEMAS`) and wraps the result in the protocol's `content` block. The
adapter's parameter is typed `{ registerTool: any }` with a `biome-ignore`, because the
SDK's generic Zod signature admits no structural type — a single documented `any` at
that seam instead of `any` spread through the registry.

**Impact.** The SDK server starts for real; every Manteka tool carries a schema.
**Lesson: a mock that is more permissive than reality will hide a crash indefinitely.**

### ADR-6 — Shared engines in `core/`, consumed by CLI and MCP

`slice` export rendering, `doctor` checks and the `analyze` engine each had a
duplicate implementation in the CLI layer. All three now live in `src/core/*` and are
imported by both layers, with tests asserting the two entry points agree.

This also removed an `mcp → cli` import inversion: `src/mcp/tools.ts` importing from
`src/cli/commands/` inverts the layering and couples the MCP surface to Commander.

---

## 4. Bugs Found by the Type Errors

`tsc` was never run in CI, so ~285 type errors had accumulated. Fixing them surfaced
seven genuine runtime defects. These are recorded because the type error was only the
*symptom*:

| Defect | Symptom | Real impact |
|---|---|---|
| `deps.readFile ?? (async () => {...})()` | union type on `content` | `??` binds looser than call: the fallback ran eagerly and a supplied reader was awaited to itself, so agents received a *function* as file content. No test covered the path. |
| `path.normalize('./x')` then `startsWith('.')` | none (logic bug) | `normalize` strips `./`, so **every** sibling import was filtered out; the dependency graph was permanently empty |
| `dirname(imp.source)` for resolution | none | `source` is a basename, so `dirname` is `'.'` — edges resolved from cwd instead of the importer's directory |
| Import regex required a second `import` | none | side-effect imports (`import './polyfill'`) never matched |
| Shared `visited` set in depth calc | none | cycles recursed until stack overflow; DAG depths depended on visit order |
| `ToolCallResponse.result` required | TS2741 | contradicted JSON-RPC 2.0, where a response carries `result` **xor** `error` |
| `expect(results[0]).toBeDefined` (no `()`) | none | a no-op assertion let an ordering test pass with zero results |

---

## 5. Constraints — the "God Mode" Rules

### 5.1 Dependencies are NOT zero

Earlier revisions of this document claimed "zero runtime dependencies" and specifically
denied `@modelcontextprotocol/sdk`. **That was false.** `src/mcp/mcpServer.ts` imports
the SDK, and `package.json` declares 29 runtime dependencies including it.

What *is* true: the native JSON-RPC server (`src/mcp/server.ts`), the Smart-Slice engine,
the RAG exporter and the analyzer are implemented on Node.js built-ins only
(`node:fs`, `node:path`, `node:os`, `node:readline`, `node:events`).

### 5.2 TypeScript strict — with honest caveats

`strict: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess` not enabled.

- **Zero `any`** — previously claimed, currently **8 occurrences** in `src/` (7 pre-existing
  in `Record<string, any>` handler signatures, 1 the deliberate ADR-5 seam).
- **Zero `!`** — previously claimed, currently **2** non-null assertions in `src/`.
- Type-only imports are mandatory under `verbatimModuleSyntax`.
- `tsconfig.json` excludes `src/mcp/**`, but the build config
  (`tsconfig.build.json`) **includes** it — so `npm run build` typechecks what
  `npm run lint-ts` does not.

### 5.3 `vitest` globals

`vitest.config` sets `globals: true`, so `tsconfig.json` must list `vitest/globals` in
`compilerOptions.types`. Without it, 140 type errors appear in files that use bare
`describe`/`test`/`expect`.

---

## 6. Operating the Project

```bash
npm install
npm run build            # tsc -p tsconfig.build.json
npm run lint-ts          # tsc --noEmit  (covers src + tests)
npx vitest run           # full suite

node bin/manteka.cjs doctor
node bin/manteka.cjs analyze . --deep
node bin/manteka.cjs inspect --json
node bin/manteka.cjs serve
```

Requires **Node.js 22+** (warns below). Developed and verified on Node 24.

### JSON-RPC 2.0 over stdio

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"serverInfo":{"name":"manteka-repomix-mcp","version":"1.18.1-manteka.1"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"manteka_smart_slice","arguments":{"exportFormat":"markdown","entry":"src/index.ts"}}}
```

---

## 7. Repository Map

```
manteka-repomix/
├── src/
│   ├── cli/
│   │   ├── commands/        # slice, doctor, inspect, analyze, dashboard, evolve, heat, status, watch
│   │   ├── index.ts         # main() dispatcher + createMantekaProgram()
│   │   └── cliRun.ts        # repomix entry point (separate from the manteka one)
│   ├── core/
│   │   ├── analyze/         # dependency-graph engine (deep/shallow)
│   │   ├── doctor/          # environment diagnostics
│   │   └── smartSlice/      # dependency closure + RAG export renderers
│   ├── mcp/                 # native JSON-RPC server + SDK server + tools
│   ├── swarm/               # consensus orchestrator, event bus, agents
│   ├── memory/              # lineage + vector store
│   ├── hooks/               # mutation operators, quality gate
│   └── healer/              # diagnose → patch loop
├── tests/                   # 199 files, mirrors src/
├── bin/                     # repomix.cjs, manteka.cjs, manteka-mcp.cjs → all import ../lib
└── .manteka/                # runtime state (lineage store)
```

> Note: `src/cli/cliRun.ts` (repomix) and `src/cli/index.ts` (manteka) are **two
> independent CLI entry points**. The `slice` command is registered on the manteka
> program; `repomix --smart` is the repomix-side equivalent.

> **Dispatcher caveat.** `createMantekaProgram()` (used by tests) and `main()` (used by
> the binary) are separate wiring paths, and they drifted: `doctor` had two
> implementations, `inspect` was a stub, and `slice` was missing entirely — all while
> the Commander-side tests stayed green. Any new subcommand must be added to **both**.
> The commands now covered by `main()` are `serve`, `doctor`, `version`, `analyze`,
> `inspect`, `slice` and `dashboard`.

---

## 8. Known Gaps

Honest list of what is *not* done:

- **`dashboard`** — registered but prints "requires further implementation".
- **`maxImportDepth` is longest-path**, exponential in the worst case for adversarial
  DAGs. Memoised so it is linear on real code and cycle-guarded; switching to the
  shortest-distance BFS already computed for `depthDistribution` is a one-line change.
- **Import resolution is literal** — `./helper.js` does not resolve to `helper.ts`;
  the analyzer matches the specifier against the filesystem with no extension inference.
- **Alias specifiers** (`@/components/…`) are not resolved by the analyzer.
- **18 skipped tests**, itemised in §1.1.
- **No CI workflow** enforces these three gates; they are currently run by hand.

---

## 9. Roadmap

- **Phase 15** — Federated learning & Nostr (NIP-42/NIP-44), swarm synchronisation.
- **Phase 16** — Advanced Darwin evolution: multi-objective fitness, epistasis detection.
- **Phase 17** — Web dashboard, real-time swarm visualisation.

---

*Verified on `main` @ `5d3ecd7` · 198 test files · 2371/2371 tests passing · 0 TypeScript errors*
