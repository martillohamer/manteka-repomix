# Biomimicry Phase 5 — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` and work through the task files below in order. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This plan is split across files because no file in this repository may exceed 400 lines. Read this page first; every task file assumes its constraints.

**Goal:** Build a Git-based genetic engine that forks the working tree into ephemeral mutants, mutates source with provably-safe deterministic operators, scores each mutant with a baseline-relative Biological Fitness Index, and ranks them.

**Architecture:** Six domain modules under `src/biomimicry/` hold pure logic and never import `commander`. Commander wiring lives at `src/cli/commands/evolveCommand.ts`, mirroring Phase 4's `heatCommand.ts`. Each mutant is materialised in a **detached Git worktree** under `$TMPDIR`, so the user's HEAD, branches, index and working tree are never touched — asserted by an integration test, not merely by design.

**Tech stack:** TypeScript, Node.js (`node:child_process.execFile` promisified, `node:fs/promises`), Commander, Vitest, Biome.

**Approved spec:** [`../specs/2026-10-05-biomimicry-design.md`](../specs/2026-10-05-biomimicry-design.md) (commit `358432a8`).

---

## Global constraints

These apply to every task. Violating any of them fails the task.

- **Hard line limit.** No created or modified file may exceed **400 lines**. CI's ratchet (`.github/workflows/living-codebase-ci.yml`) fails on any `src/` file above 400 that is not in the frozen baseline.
- **`src/cli/cliRun.ts` must stay under 466 lines.** It is at 435; Phase 5 adds exactly 2 (one import, one call), landing on 437. Anything above 437 means something crept in.
- **Never update the ratchet baseline.** Do not edit `.github/workflows/living-codebase-ci.yml`.
- **No `console.*` in `src/`.** All output goes through `src/shared/logger.ts`.
- **Git is always `execFileAsync`, never a shell.** Pass an argument array, never a string. Never `exec`, never `sh -c`.
- **Reuse the existing hardening constants** from `src/core/git/gitCommand.ts`: `GIT_UNTRUSTED_CONFIG_ARGS` (`['-c', 'core.fsmonitor=']`) on every invocation, and `validateGitRef` to reject refs starting with `-`.
- **DI via a trailing `deps` parameter** (per `AGENTS.md`). `vi.mock` only for the logger. Never `vi.mock` a module under test.
- **Production code carries no `undefined as never` placeholders.** Integration tests drive the exported `defaultEvolutionDeps`, never a reconstruction of it.
- **Formatting** (Biome): 2-space indent, 120-column width, single quotes, semicolons, trailing commas. Import order is enforced — node builtins first, then external, then local.
- **Comments in English**, only where the logic is non-obvious.
- **Test timeout is 15 000 ms globally** (`vitest.config.ts`). Tests doing real Git work declare a longer per-test timeout.

### Deviations from the approved spec

| Deviation | Rationale |
|---|---|
| Added `src/biomimicry/render.ts` | Phase 4 keeps presentation out of orchestration (`thermodynamics/render.ts` vs `heatRun.ts`). Folding a table renderer into the engine would repeat that coupling. |
| Added `src/biomimicry/report.ts` | Phase 4 separates persistence (`thermodynamics/report.ts`). Same reason. |
| `timeTravelCommand.ts` → `evolutionEngine.ts`; `biomimicry/cli.ts` → `src/cli/commands/evolveCommand.ts` | Approved in spec §Architecture: module names match the `evolve` command they implement, and `src/biomimicry/` must not depend on `commander`. |

### A deliberate degeneracy you must not "fix"

All three operators **add** code, and Phase 4 temperature rises with size and complexity. Every mutant therefore scores *worse* than baseline. Ranking means "least harmful first", not "best improvement". Do not add cooling operators, do not add a `--fail-if-no-improvement` gate, and do not reorder by absolute temperature. This is documented in spec §Known limitation.

---

## File structure

| File | Responsibility | Approx. lines |
|---|---|---|
| `src/biomimicry/types.ts` | Pure contracts: operators, weights, states, report shape | ~150 |
| `src/biomimicry/mutationOperators.ts` | The three deterministic transforms + eligibility rule | ~110 |
| `src/biomimicry/mutationSandbox.ts` | Detached-worktree lifecycle, orphan pruning, exit hook | ~170 |
| `src/biomimicry/fitnessEvaluator.ts` | Thermal measurement, test probe, pure fitness arithmetic | ~160 |
| `src/biomimicry/evolutionEngine.ts` | Orchestration, concurrency pool, failure containment | ~280 |
| `src/biomimicry/report.ts` | Persist a run under `.manteka-memory/` | ~40 |
| `src/biomimicry/render.ts` | Human-readable mutant table | ~90 |
| `src/cli/commands/evolveCommand.ts` | Commander wiring only | ~130 |

| Test file | Coverage |
|---|---|
| `tests/biomimicry/mutationOperators.test.ts` | Eligibility rule, transforms, determinism, immunity #1 |
| `tests/biomimicry/mutationSandbox.test.ts` | Argv/hardening via fake `execFileAsync`; real-Git worktree lifecycle |
| `tests/biomimicry/fitnessEvaluator.test.ts` | Pure fitness arithmetic, test probe, degradation paths |
| `tests/biomimicry/evolutionEngine.test.ts` | Pipeline order, state trail, concurrency pool, failure containment |
| `tests/biomimicry/evolutionIntegration.test.ts` | Immunity #2: repository bit-identical after a full cycle |
| `tests/cli/commands/evolveCommand.test.ts` | Flag registration, defaults, collection, validation |

---

## Execution order

| # | Task file | Commit message |
|---|---|---|
| 1 | [Contracts and mutation operators](./task-1-contracts-and-operators.md) | `feat(biomimicry): add genetic contracts and safe mutation operators` |
| 2 | [Mutation sandbox](./task-2-mutation-sandbox.md) | `feat(biomimicry): isolate mutants in detached Git worktrees` |
| 3 | [Fitness evaluator](./task-3-fitness-evaluator.md) | `feat(biomimicry): add thermal and test fitness evaluator` |
| 4a | [Engine tests](./task-4a-engine-tests.md) | — (written with 4b) |
| 4b | [Engine implementation](./task-4b-engine-impl.md) | `feat(biomimicry): add deterministic evolution engine with concurrency pool` |
| 4c | [Report and render](./task-4c-report-and-render.md) | (same commit as 4b) |
| 5 | [Integration and immunity](./task-5-integration-immunity.md) | `test(biomimicry): assert a full evolution cycle leaves the repository untouched` |
| 6 | [CLI wiring](./task-6-cli-wiring.md) | `feat(cli): register the evolve subcommand` |
| 7 | [Documentation, 15 locales](./task-7-documentation.md) | `docs: document heat and evolve commands in all 15 locales` |
| 8 | [Full verification](./task-8-verification.md) | fixups only, if any |

Tasks 4a–4c are one commit: the engine test file and the engine it exercises are not separable without a red suite.

---

## Definition of Done

Tracked in [task-8-verification.md](./task-8-verification.md).
