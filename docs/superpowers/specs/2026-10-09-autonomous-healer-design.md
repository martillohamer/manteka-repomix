# Phase 9 - Autonomous Healer Daemon (AHD)

Status: complete. Phase: 9. Builds on prior phases (Dashboard, watcher, lineage/ast pipeline).

## Problem

Technical debt (lint/tsc errors, TODO/FIXME, minor smells) remains manual. Need closed-loop self-healing with: sensing failures at appearance; minimal AST-context extraction; surgical patch proposals; sandboxed isolation (Git worktree/branch) with automated regression checks; reporting to Dashboard SSE.

## Non-goals

- Full autonomous refactoring. Micro-fixes only.
- Blind mass edits. Anchored to diagnostics with minimal context.
- Bypassing safety gates. Sandbox + tests + lint/tsc non-negotiable. No force-pushes.
- New heavy dependencies. Prefer `node:` builtins and existing deps; graceful degradation.
- Human-out-of-loop for risky changes. Dry-run by default; ambiguous cases proposed-only.
- Hard coupling to watcher. Standalone `manteka heal` or attached.

## Architecture

```
src/healer/
  types.ts  diagnostician.ts  engine.ts  index.ts  sandbox.ts  sensor.ts
src/cli/commands/healCommand.ts
src/cli/index.ts
tests/healer/*.test.ts
```

**Types:** Diagnostic(kind, file, lineStart/End, message, code?, severity), Patch(diagnosticId, file, range, newText, confidence, rationale, verified), HealerEvent(type, ts, diagnostic?, patch?, details?).

**Components:**

| Component | Description |
|---|---|
| **Sensor** | chokidar + debounced lint/tsc probes + TODO/FIXME scan, stable IDs, dedupe by id |
| **Diagnostician** | ±N lines AST micro-context via tree-sitter with fallback to raw slice, normalize 1-based, enrich context |
| **Engine** | rule-based default fixes (unused marker, whitespace, TODO→comment only unambiguous), structural validation, reject >20 lines/multi-file |
| **Healer** | state machine + rate limits + backpressure + events (start/stop/emit/scanAndProceed) |
| **Sandbox** | temp worktree/branch from HEAD, apply patch, run targeted tests + gates (tsc --noEmit, lint subset), auto-revert on failure, cleanup |
| **CLI** | `manteka heal [--dry-run] [--max-attempts <n>]`; defaults: dry-run true, max-attempts 1 |
| **Dashboard integration** | healer SSE events (detected / diagnosed / proposed / applied / skipped / error) |

## Acceptance Criteria

- [x] Spec+plan exist; scaffold with type-only contracts; unit tests for sensor dedupe, diagnostician fallback, engine safety
- [x] `manteka heal --help` registers; `--dry-run` default safe
- [x] **Lint: 0 errors** (39 expected warnings only, e.g. test variables, pre-existing `mutationOperators.ts:113`)
- [x] **No new runtime dependencies** (zero; `node:` builtins only)
- [x] **E2E: 2232/2232 tests passed** (184/185 test files; healer: 23/23 green)
- [x] TypeScript source-level 0 errors (test runner type config pre-existing)
- [x] Single atomic commit with proper feat message
- [x] Documentation: `docs/superpowers/plans/2026-10-09-autonomous-healer.md` updated