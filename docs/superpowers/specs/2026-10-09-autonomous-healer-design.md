# Phase 9 - Autonomous Healer Daemon (AHD)

Status: draft. Phase: 9. Builds on Phase 8 (Dashboard), Phase 7 (src/cli/watcher.ts), Phase 6.1 (src/biomimicry/semanticGuardian.ts), Phase 6.2 (src/biomimicry/lineageStore.ts), and the repository's AST/typing pipeline (tree-sitter, Biome/Oxlint/tsc).

## Problem

Technical debt (lint/tsc errors, TODO/FIXME, minor smells) remains manual. Need closed-loop self-healing with: sensing failures at appearance; minimal AST-context extraction; surgical patch proposals; sandboxed isolation (Git worktree/branch) with automated regression checks; reporting to Dashboard SSE.

## Non-goals

- Full autonomous refactoring. Micro-fixes only.
- Blind mass edits. Anchored to diagnostics with minimal context.
- Bypassing safety gates. Sandbox + tests + lint/tsc non-negotiable. No force-pushes.
- New heavy dependencies. Prefer 
ode: builtins and existing deps; graceful degradation.
- Human-out-of-loop for risky changes. Dry-run by default; ambiguous cases proposed-only.
- Hard coupling to watcher. Standalone manteka heal or attached.

## Architecture

`	ext
src/healer/
  types.ts diagnostician.ts engine.ts healer.ts index.ts sandbox.ts sensor.ts
src/cli/commands/healCommand.ts
src/cli/index.ts
tests/healer/*.test.ts
`

Types: Diagnostic(kind, file, lineStart/End, message, code?, severity), Patch(diagnosticId, file, range, newText, confidence, rationale, verified), HealerEvent(type, ts, ...).

Components: Sensor (chokidar + debounced lint/tsc probes + TODO/FIXME scan, stable IDs), Diagnostician (±3-10 lines AST micro-context via tree-sitter with fallback), Engine (rule-based default, structural validation, reject >20 lines/multi-file), Sandbox (temp worktree/branch, apply+test+gates, auto-revert on failure, cleanup), Healer (state machine + rate limits + backpressure + events), CLI (manteka heal [--dry-run] [--max-attempts <n>] [--port <n>], defaults dry-run true, max-attempts 1), Dashboard integration (healer SSE events).

## Acceptance Criteria

- Spec+plan exist; scaffold with type-only contracts; unit tests for sensor dedupe, diagnostician fallback, engine safety, sandbox revert-on-failure.
- manteka heal --help registers; --dry-run default safe.
- Lint clean except pre-existing warning at src/biomimicry/mutationOperators.ts:113.
- No new runtime dependencies.
