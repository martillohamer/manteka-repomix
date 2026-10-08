# Fase 5 — Git Time-Travel & Biomimicry

Status: approved design. Phase: 5. Supersedes nothing; builds on Phase 4 (`src/thermodynamics/`).

## Problem

Phase 4 measures which files are *hot* — churning, many authors, large, complex — and
names the ones at or above `T_max` as "boiling". That identifies where code is under
stress but stops there. It says nothing about whether that stress can be relieved.

Phase 5 asks the next question: if the codebase could fork and mutate, which mutations
would leave it healthier? It builds a genetic loop — branch, mutate, score, rank — over
real Git history, scoring each mutant with a **Biological Fitness Index** derived from the
Phase 4 thermodynamic engine plus (optionally) the project's own test suite.

## Non-goals

- Producing code that actually improves the repository. Phase 5 *measures*; it does not
  propose patches to apply.
- Multi-generation breeding. See [Single generation](#single-generation-n-branches).
- AI-generated mutations. All operators are deterministic text transforms.

---

## Architecture

```
src/biomimicry/
  types.ts              ~120  pure data contracts
  mutationOperators.ts  ~110  three deterministic transforms (pure, no I/O)
  mutationSandbox.ts    ~180  detached-worktree lifecycle
  fitnessEvaluator.ts   ~170  baseline + mutant scoring
  evolutionEngine.ts    ~160  orchestration, ranking, report
src/cli/commands/
  evolveCommand.ts      ~130  Commander wiring only
```

`src/biomimicry/` never imports `commander`. Commander wiring lives under
`src/cli/commands/`, mirroring `heatCommand.ts` from Phase 4. Registration in
`src/cli/cliRun.ts` costs one import and one call — 2 lines against a 466-line baseline
currently sitting at 435.

`mutationOperators.ts` is separate from `mutationSandbox.ts` on purpose: one defines
*what a mutation is*, the other *where mutations run*. Mixing them couples pure text
logic to Git lifecycle and makes neither independently testable.

Every file stays under the 400-line ratchet limit. No baseline edit is required.

---

## Mutation operators

Three operators, each a deterministic whole-line text transform.

**Eligibility rule.** An operator may only consider a candidate line that contains **no
quote character at all** (`'`, `"`, or backtick). This single rule makes it impossible to
corrupt a string literal, template literal, or comment body. It is deliberately
conservative: some mutable lines are skipped. No parser is required.

When no line qualifies, the operator reports *not applicable* and that branch is skipped
rather than silently faked.

| Operator | Eligible line | Transform |
|---|---|---|
| `comment-noise` | no quotes | insert `/* mutant:comment-noise */` above it |
| `dead-guard` | no quotes | insert `if (false as boolean) { /* mutant:dead-guard */ }` above it |
| `constant-perturbation` | no quotes, contains a bare integer | wrap the integer: `7` → `(7 + 1)` |

### Known limitation: this phase ranks blast radius, not improvement

All three operators *add* code, and Phase 4 temperature rises with size and complexity.
Every mutant therefore scores slightly **worse** than baseline. The ranking answers
"least harmful first", not "best improvement". A genetic algorithm in which nothing can
win is degenerate, and this is a deliberate, documented interim state — not an oversight.

Phase 5.1 closes it by adding inverse operators (strip dead code, collapse comment
blocks) that can genuinely cool a file, at which point top-of-table becomes a real signal.

---

## Mutation sandbox

Each mutant is materialised in its own **detached Git worktree** under
`$TMPDIR/repomix/biomimicry/<runId>/<mutationId>`.

Three deliberate deviations from the original `git checkout -b mutante/...` sketch, each
for a safety reason:

1. **Detached worktrees, not named branches.** `git worktree add --detach` creates no ref
   in the user's repository, so a failed cleanup leaves no branch to leak or delete. The
   `mutante/...` branch name came from an in-place mutation model that was rejected in
   favour of worktree isolation.
2. **No clean-tree precondition.** A worktree materialises from a commit, not from the
   index, so uncommitted work in the main tree is never at risk. This removes the hard
   blocker that would otherwise stop anyone with work in progress.
3. **Process-exit hook.** Beyond `finally`, the sandbox records its run directory so an
   abrupt exit (Ctrl+C, crash) leaves a trace that the next run prunes.

Cleanup failures log a warning naming the orphan path and **never throw**. A failed
`git worktree remove` must not convert a successful experiment into a failed command, nor
mask the results.

### Security

Every Git invocation goes through `execFileAsync` (never a shell) and reuses the
hardening constants already established in `src/core/git/gitCommand.ts`:

- `GIT_UNTRUSTED_CONFIG_ARGS` — `['-c', 'core.fsmonitor=']`, neutralising
  `core.fsmonitor` (which has no flag) on every invocation.
- `validateGitRef` — rejects refs starting with `-`, blocking argument injection.
- Branch names, worktree paths, and base refs are never passed through a shell.

These are the codebase's **first write-path Git commands**. The existing hardening
rationale at `gitCommand.ts:11-27` is explicitly scoped to read-only commands, so the
write path is additive and does not weaken any existing guarantee.

---

## Fitness evaluator

Both axes are expressed in the same unit — **points, positive meaning better** — so they
combine without a magic scale factor.

```
thermalAxis = baseline.temp(targetFile) − mutant.temp(targetFile)    // degrees, + = cooler
testAxis    = (mutantPassed − baselinePassed) × 100                    // percentage points
```

| Condition | Fitness |
|---|---|
| Tests not measured | `thermalAxis` |
| Tests measured | `0.6 · thermalAxis + 0.4 · testAxis` |

Weights live in `types.ts` alongside `THERMAL_WEIGHTS`, honouring the existing convention
that a score must be recomputable from the persisted report alone, and are overridable
through the policy object.

When tests are not measured, the report carries `testSignal: 'not-measured'` so nothing
downstream mistakes a thermal-only score for a complete one.

### Test signal is binary, not a pass rate

Parsing `2046 passed | 24 skipped` is format-fragile across Vitest, Jest, pytest, and
cargo; one upstream cosmetic change makes fitness silently wrong. Exit code is
language-agnostic and cannot lie. The cost is granularity — the signal says *broke*, not
*broke by how much*.

A broken mutant must dominate a cool one: at these weights, going from passing to failing
costs −40, which swamps the ~2 degrees of cooling any current operator could buy.
Correctness outranks thermal beauty by design.

### Test execution is opt-in

Running a project's suite *after* writing an automated mutation into its source means
executing arbitrary project code on mutated input. It is gated behind an explicit
`--run-tests` flag (default **off**) and requires `scripts.test` in `package.json`;
otherwise the axis is reported as not measured. Execution uses `execFileAsync` with a
hard timeout and an injectable seam for tests. The timeout defaults to 300 000 ms,
overridable with `--test-timeout`. A mutant whose suite times out is recorded as failed
and non-viable; it does not abort the run. Note the cost honestly: this repository's suite
takes ~9s, so N mutants with tests enabled means roughly N × 9s.

---

## Evolution engine

Pipeline, with `ExperimentState` recorded at every step:

```
scoping → baselining → branching → evaluating → reporting → done | failed
```

- **scoping** — run the Phase 4 analysis on the target repository; boiling files become
  mutation targets.
- **baselining** — evaluate the pristine tree once. Its temperature is the reference every
  mutant is scored against.
- **branching** — materialise one worktree per candidate and apply the mutation.
- **evaluating** — score each mutant under bounded concurrency.
- **reporting** — rank by fitness and emit the report.

### Single generation, N branches

The candidate set is the deterministic cross-product of *(target file × operator)*,
truncated to `--population`. Every mutant branches from the pristine baseline at `HEAD`.

If the product yields fewer candidates than `--population`, the engine stops at the
smaller set rather than duplicating work. If Phase 4 finds no boiling files at all, the
run is a **success with `summary.total === 0`**, not an error: a healthy repository is a
legitimate finding, and inventing targets would misrepresent it.

**No RNG anywhere.** Given identical repository state, a run reproduces byte-for-byte.
An evolutionary tool whose results shift between runs cannot be debugged. Fitness remains
baseline-relative, so a later multi-generation phase stays interpretable: descendants
would still be scored against the pristine tree and improvements would accumulate.

### Concurrency

Defaults to **2**, not `os.cpus().length`. Each mutant may spawn a full test suite, so
CPU-parallel mutants thrash rather than speed up. A small worker pool; `--concurrency`
tunes it.

### Error handling: failure is data

Any per-mutant failure — worktree creation, mutation application, evaluation, test
timeout — records `viable: false` with a reason, and the run continues. Only precondition
failures (not a Git repository, no commits) abort with a `RepomixError`.

### Exit code

**0 on success.** There is no meaningful failure signal yet: since nothing can beat
baseline, "did evolution improve anything" would always answer no, and a
`--fail-if-no-improvement` gate today would just be a permanently red CI check. It becomes
honest once Phase 5.1 lands the cooling operators.

---

## Command surface

`manteka evolve [directory]` — directory defaults to `.`, following `heat`.

| Flag | Default | Meaning |
|---|---|---|
| `--population <n>` | `5` | Maximum mutants to evaluate |
| `--operator <name>` | all three | Restrict to one operator; repeatable |
| `--target <path>` | boiling files | Restrict to specific files; repeatable |
| `--concurrency <n>` | `2` | Mutants evaluated in parallel |
| `--run-tests` | off | Include the test axis in fitness |
| `--test-timeout <ms>` | `300000` | Per-mutant suite timeout |
| `--json` | off | Emit raw JSON instead of a table |
| `--report` | off | Write the JSON report to disk |

`--operator` and `--target` are repeatable, matching the existing repeatable-option pattern
in `cliRun.ts`. An unknown operator name is a `RepomixError`, not a silent no-op.

---

## Report

Mirrors the Phase 4 thermodynamic report so it is recomputable from the persisted JSON
alone:

```ts
{
  schemaVersion: 1,
  generatedAt: string,
  repo:   { root, isGitRepo, head, baseRef },
  policy: { population, operators, concurrency, testEnabled, testTimeoutMs, weights },
  baseline: { thermal, testPassed },
  mutants: [{
    id, targetFile, operator, applied,
    temperatureBefore, temperatureAfter,
    thermalAxis, testPassed, testAxis,
    fitness, viable, failure
  }],
  summary: { total, viable, best, worst }
}
```

---

## Testing

DI via a trailing `deps` parameter, per `AGENTS.md`; `vi.mock` only for the logger.

| File | Approach |
|---|---|
| `tests/biomimicry/mutationOperators.test.ts` | Pure, no fs. Heaviest coverage — this is where damage would occur. |
| `tests/biomimicry/mutationSandbox.test.ts` | Fake `execFileAsync` for argv and hardening assertions, plus real-Git tests in a tmpdir. |
| `tests/biomimicry/fitnessEvaluator.test.ts` | Pure DI; fakes `runHeatAnalysis` and `runTests`. |
| `tests/biomimicry/evolutionEngine.test.ts` | DI throughout; asserts partial-failure containment. |
| `tests/cli/commands/evolveCommand.test.ts` | Mirrors `heatCommand.test.ts` from Phase 4. |

Two tests assert the **safety** claims rather than the logic, and are non-negotiable:

1. **A template-literal-dense file yields zero applicable mutations and is byte-identical
   afterwards.** If the no-quote eligibility rule ever regresses, this fails loudly
   instead of silently corrupting source.
2. **After a full run, the original repository's HEAD and working tree are identical.**
   This is the entire reason for choosing worktrees over `checkout -b`; if it stops being
   true, the architectural decision was wrong.

Real-Git tests need no shell — only `git init` plus a commit via `execFileSync` — so they
run cross-platform, guarded by an `isGitInstalled` skip rather than the platform check
used at `tests/core/git/gitCommand.test.ts:566`.

---

## Documentation

`AGENTS.md` requires user-facing changes to be documented in **all 15** locale directories
under `website/client/src/`. Phase 5 documents:

- `evolve` — the new command and its flags.
- `heat` — currently undocumented; `grep` finds no `heat` in `website/client/src/en/`.
  Covered in the same pass so the two phases are not entangled.

---

## Open items for later phases

- **Phase 5.1** — cooling operators, which turn ranking into a real signal.
- **Multi-generation breeding** — requires transferring a winner's uncommitted diff into
  the next worktree, plus a second failure mode when a diff does not apply cleanly.
- **Proposal output** — Phase 5 reports; it does not emit patches.
