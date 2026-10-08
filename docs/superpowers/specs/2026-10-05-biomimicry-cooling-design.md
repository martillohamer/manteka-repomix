# Fase 5.1 — Cooling Operators and Real Evolutionary Optimization

Status: approved design. Phase: 5.1. Supersedes the "Known limitation" section of
Phase 5 (`docs/superpowers/specs/2026-10-05-biomimicry-design.md`); builds on Phase 5
(`src/biomimicry/`).

## Problem

Phase 5 established a genetic loop — branch, mutate, score, rank — but every operator
*added* code, so every mutant scored slightly worse than baseline. The ranking answered
"least harmful first", which is degenerate: a genetic algorithm in which nothing can win
is not an optimizer.

Phase 5.1 adds **inverse operators** that remove code — dead guards, redundant comments,
blank-line noise — so a mutant can genuinely cool a file. Once cooling is possible,
top-of-table becomes a real signal and the ranking semantics flip from "least harmful
first" to "best first".

## Non-goals

- Real dead-code analysis with a parser. The cooling operators are conservative text
  transforms that target easily-recognizable inert patterns, not a full semantic analysis.
- Multi-generation breeding. Still a single generation (see Phase 5 spec).
- Changing the fitness formula. The existing `thermalAxis = baseline.temp − mutant.temp`
  already rewards cooling; no formula change is needed.
- New CLI flags. The `--operator` flag already accepts the new operator names.

---

## Architecture

```
src/biomimicry/
  types.ts              ~140  pure data contracts (+2 operator names)
  mutationOperators.ts  ~200  five deterministic transforms (pure, no I/O)
  mutationSandbox.ts    ~160  detached-worktree lifecycle (unchanged)
  fitnessEvaluator.ts   ~190  baseline + mutant scoring (unchanged)
  evolutionEngine.ts    ~310  orchestration, ranking, report (unchanged)
  render.ts             ~70   table + ranking banner (banner text updated)
```

`mutationOperators.ts` grows from 3 to 5 operators but stays well under the 400-line
ratchet. No new modules.

---

## Cooling operators

Both are **inverses** of existing heating operators, sharing the same safety philosophy:
no parser, strict no-quote eligibility rule, deterministic whole-line/block text
transforms. When no eligible target is found, the operator reports *not applicable* and
the branch is skipped rather than silently faked.

### `dead-guard-stripper` (inverse of `dead-guard`)

Removes syntactically inert guard blocks.

**Targets:**
- `if (false) { ... }` blocks (single- or multi-line).
- `if (false as boolean) { ... }` — the exact pattern the `dead-guard` operator creates.

**Algorithm:**
1. Split content into lines.
2. Find the first line matching `if (false` (word boundary, optional `as boolean`).
3. From that line, locate the opening `{`. If absent, skip.
4. Count braces from the opening `{` to find the matching `}`, tracking nesting.
5. If any line in the block (from `if` through `}`) contains a quote character (`'`, `"`,
   or backtick), **skip** — the no-quote safety rule.
6. Remove the lines from `if` through the matching `}`.
7. Return the mutated content.

**Effect on temperature:** reduces `lines` (size factor) and `branchTokens` (complexity
factor) → cools.

### `comment-reducer` (inverse of `comment-noise`)

Removes redundant comments and collapses blank-line noise.

**Targets:**
- Pure line comments (`// ...`).
- Pure block comments (`/* ... */`, single- or multi-line).
- 2+ consecutive blank lines → collapsed to 1.

**Algorithm:**
1. Split content into lines.
2. Walk lines with a block-comment state machine (`inBlockComment`):
   - If `inBlockComment`: the line is part of a block comment → mark for removal. If it
     contains `*/`, exit block state.
   - Else if trimmed line starts with `//`: mark for removal (line comment).
   - Else if trimmed line starts with `/*`: mark for removal. If it also contains `*/`
     on the same line, it is a single-line block comment (stay out of block state).
     Else, enter block state.
   - Else: keep (code or blank).
3. Apply the no-quote rule: if a line marked for removal contains a quote character,
   **skip** it (conservative).
4. Remove marked lines.
5. Collapse 2+ consecutive blank lines to 1.
6. Rejoin.

**Effect on temperature:** reduces `lines` (size factor) → cools. Complexity is
unaffected because `analyzeComplexity` already strips comments before counting logical
lines.

---

## Fitness evaluator validation

**No formula change.** The existing formula already rewards cooling:

```
thermalAxis = baseline.temp(targetFile) − mutant.temp(targetFile)    // + = cooler
fitness     = 0.6 · thermalAxis + 0.4 · testAxis
```

A cooling mutant has `thermalAxis > 0`. If it does not break the test suite
(`testAxis = 0`), then `fitness = 0.6 · thermalAxis > 0`. The baseline has
`fitness = 0`. **A cooling mutant formally surpasses the baseline.**

The evaluator is validated (not modified) by tests that certify:
- A cooling mutant produces `thermalAxis > 0`.
- A cooling mutant's `fitness > 0`.
- A cooling mutant's `fitness > baseline.fitness` (0).

---

## Ranking semantics change

With cooling operators in the default set, the ranking flips:

| Phase | Semantics | Banner |
|---|---|---|
| 5 | least harmful first | "every operator adds code, so no mutant can cool a file yet" |
| 5.1 | **best first** | cooling operators exist; top-of-table is a real improvement signal |

`render.ts` banner text is updated to reflect that cooling is now possible. The table
already sorts by fitness descending, so no sort change is needed — only the explanatory
text.

---

## Command surface

No new flags. `--operator` now accepts two additional names:

| Operator | Type |
|---|---|
| `comment-noise` | heating |
| `dead-guard` | heating |
| `constant-perturbation` | heating |
| `dead-guard-stripper` | **cooling** |
| `comment-reducer` | **cooling** |

Both cooling operators are added to `MUTATION_OPERATOR_NAMES` and thus to
`EVOLUTION_POLICY_DEFAULTS.operators`, so a default run includes both heating and
cooling. An unknown operator name remains a `RepomixError`.

---

## Report

Unchanged. The report schema already carries `thermalAxis`, `testAxis`, `fitness`, and
`testSignal`. No schema change.

---

## Testing

| File | New coverage |
|---|---|
| `tests/biomimicry/mutationOperators.test.ts` | Each cooling operator reduces temperature on controlled fixtures; immunity (quote-dense file unchanged). |
| `tests/biomimicry/fitnessEvaluator.test.ts` | Cooling mutant → `thermalAxis > 0` → `fitness > 0` → surpasses baseline. |
| `tests/biomimicry/evolutionEngine.test.ts` | Cooling operator in the cross product; ranking places a cooling mutant above baseline. |

The existing immunity test (quote-dense file byte-identical) is extended to cover both
new operators.

---

## Documentation

`AGENTS.md` requires user-facing changes in all 15 locale directories. Phase 5.1 updates:

- The operator list in the `evolve` options table (add `dead-guard-stripper`,
  `comment-reducer`).
- The ranking-semantics paragraph: "All three mutation operators add code..." → five
  operators, two of which cool; ranking is now "best first".
- The `::: warning` about `--run-tests` is unchanged.

All 15 locales: `de`, `en`, `es`, `fr`, `hi`, `id`, `it`, `ja`, `ko`, `pt-br`, `ru`,
`tr`, `vi`, `zh-cn`, `zh-tw`.

---

## Open items for later phases

- **Multi-generation breeding** — transfer a winner's diff into the next worktree.
- **Proposal output** — emit patches, not just reports.
- **More aggressive dead-code analysis** — requires a parser; deferred by design.
