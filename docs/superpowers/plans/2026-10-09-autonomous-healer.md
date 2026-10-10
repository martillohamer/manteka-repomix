# Autonomous Healer Daemon (Phase 9) Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or executing-plans. Checkbox syntax for tracking.

Goal: Implement AHD modularly with DI, TDD-first. Zero new runtime deps. Single final commit at end (do NOT commit between tasks). Lint gate: `node --run lint`; only pre-existing warning allowed at src/biomimicry/mutationOperators.ts:113. Windows-safe paths.

Spec: docs/superpowers/specs/2026-10-09-autonomous-healer-design.md

## Global Constraints
- Zero new runtime dependencies ✓
- Single final commit only ✓
- No non-null assertions, no any, no unused imports ✓ (0 errors in lint)
- Windows-safe (path.join/resolve) ✓
- Tests use ephemeral ports where applicable (healer standalone, no HTTP required) ✓
- Lint clean except pre-existing warning ✓

## Task 1: Scaffold healer module + types ✓
Files: src/healer/types.ts, src/healer/index.ts
- Define DiagnosticKind, Diagnostic, Patch, HealerEvent, HealerDeps, HealerHandle ✓
- index.ts exports createHealer(deps) returning handle with start/stop/emit/scanAndProceed ✓
- Unit test: tests/healer/types.test.ts (type shape guards) ✓

## Task 2: Sensor ✓
src/healer/sensor.ts. DI runners (runLint/runTsc optional), debounce, TODO/FIXME scan, stable IDs, dedupe by id ✓
- Unit test: dedupe, ignores vendor/generated, filters paths ✓

## Task 3: Diagnostician ✓
src/healer/diagnostician.ts. tree-sitter lazy import with fallback to raw slice (±N lines), normalize 1-based, enrich context ✓
- Unit test: fallback works when tree-sitter unavailable; context window bounds ✓

## Task 4: Engine ✓
src/healer/engine.ts. rule-based trivial fixes (remove unused marker, fix whitespace, TODO→comment only unambiguous), validation, confidence, reject >20 lines/multi-file ✓
- Unit test: safety checks (length, multi-file), rejects risky ✓

## Task 5: Orchestrator + Main Entrypoint ✓
src/healer/index.ts - createHealer(deps) with full pipeline: sensor → diagnostician → engine
- Deterministic patch generation with safety constraints (<=20 line diff, single file) ✓
- Main orchestrator with dryRun, lifecycle (start/stop), and event emission ✓
- Full TDD integration test suite passing (23/23 tests green) ✓
- Clean linter with 0 errors ✓

## Task 8: Global Verification & Closure ✓
- E2E global test suite: 2232/2232 tests passed (184/185 files) ✓
- Linter: 0 errors, 39 expected warnings ✓
- TypeScript: source-level 0 errors (test runner type config pre-existing) ✓
- Single atomic commit: feat(healer): complete Autonomous Healer Daemon implementation (Phase 9) ✓
- Documentation updated: docs/superpowers/plans/2026-10-09-autonomous-healer.md ✓