# Autonomous Healer Daemon (Phase 9) Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or executing-plans. Checkbox syntax for tracking.

Goal: Implement AHD modularly with DI, TDD-first. Zero new runtime deps. Single final commit at end (do NOT commit between tasks). Lint gate: `node --run lint`; only pre-existing warning allowed at src/biomimicry/mutationOperators.ts:113. Windows-safe paths.

Spec: docs/superpowers/specs/2026-10-09-autonomous-healer-design.md

## Global Constraints
- Zero new runtime dependencies
- Single final commit only
- No non-null assertions, no any, no unused imports
- Windows-safe (path.join/resolve)
- Tests use ephemeral ports where applicable (healer standalone, no HTTP required)
- Lint clean except pre-existing warning

## Task 1: Scaffold healer module + types
Files: src/healer/types.ts, src/healer/index.ts (stubs)
- Define DiagnosticKind, Diagnostic, Patch, HealerEvent, HealerDeps, HealerHandle
- index.ts exports createAutonomousHealer(deps) returning handle with start/stop/emit
- Unit test: tests/healer/types.test.ts (type shape guards)

## Task 2: Sensor
src/healer/sensor.ts. DI runners (runLint/runTsc optional), debounce, TODO/FIXME scan, stable IDs, dedupe by id.
- Unit test: dedupe, ignores vendor/generated, filters paths

## Task 3: Diagnostician
src/healer/diagnostician.ts. tree-sitter lazy import with fallback to raw slice (±N lines), normalize 1-based, enrich context.
- Unit test: fallback works when tree-sitter unavailable; context window bounds.

## Task 4: Engine
src/healer/engine.ts. rule-based trivial fixes (e.g. remove unused import marker cases, trivial whitespace, TODO→comment only unambiguous), validation, confidence, reject >20 lines/multi-file.
- Unit test: safety checks (length, multi-file), rejects risky.

## Task 5: Sandbox
src/healer/sandbox.ts. temp worktree/branch from HEAD, apply patch, run targeted tests + gates (tsc --noEmit, linter subset), auto-revert on failure, cleanup. Windows-safe git ops.
- Unit test: revert-on-failure with fakes.

## Task 6: Orchestrator + CLI
src/healer/healer.ts (orchestrator), src/cli/commands/healCommand.ts, register in src/cli/index.ts.
- manteka heal --help registers; --dry-run true default, --max-attempts 1.
- Unit tests for state transitions, rate limits, dedupe bursts.

## Task 7: Dashboard SSE integration + final verification
Extend dashboard SSE event types to include healer events without breaking clients. Run full suite + lint. Single final commit with message: eat(healer): introduce Autonomous Healer Daemon (Phase 9) - sensor, diagnostician, engine, sandbox, CLI.

