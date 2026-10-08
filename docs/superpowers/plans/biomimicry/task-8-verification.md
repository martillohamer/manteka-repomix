> Constraints, file map, execution order and Definition of Done: [README](./README.md).

## Task 8: Full verification

**Files:** none modified. This task only verifies.

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: `Found 0 warnings and 0 errors.`

`lint-biome` and `lint-oxlint` run with `--write`. If they modify a file, re-run the full test suite afterwards.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0, no TypeScript diagnostics.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: **all files pass, zero failures**. Record the exact totals. Before this phase the baseline was 169 files / 2058 tests passing with 24 skipped; Phase 5 adds 6 test files, so roughly 175 files and ~2110 tests.

Any `stderr` noise from sandbox, path-guard, or clipboard tests is expected and is not a failure. Only the summary counts.

- [ ] **Step 4: Ratchet**

Run the local ratchet script used during Phase 4:
```bash
node C:\Users\astur\AppData\Local\Temp\opencode\ratchet.mjs
```
Expected:
```
OK     pagada: src/cli/cliRun.ts: 437 < 466
scanned=179 nuevas=0 regresiones=0
RATCHET OK
```
The four frozen entries must all read `congelada` or `pagada`, never `REGRESIONA`.

If the script is gone, reproduce the CI logic: for each of the four baseline entries in `.github/workflows/living-codebase-ci.yml`, compare `wc -l` against its limit, and separately assert no new `src/` file exceeds 400 lines:
```bash
Get-ChildItem -Path src -Recurse -Include *.ts,*.js,*.tsx,*.jsx |
  Where-Object { (Get-Content $_.FullName).Count -gt 400 } |
  Select-Object -ExpandProperty FullName
```
Expected: no output, except the four frozen baseline files if any remain over 400.

- [ ] **Step 5: End-to-end smoke test**

Run: `node bin/repomix.cjs evolve . --population 3 --concurrency 2`
Expected: exit 0, a ranked mutant table, and the honest ranking-semantics banner.

Run: `node bin/repomix.cjs evolve . --population 2 --run-tests --test-timeout 60000 --json`
Expected: exit 0, `"testSignal": "measured"`, and per-mutant `testPassed`. This will be slow — the suite is roughly 9 s per mutant, so budget about 20 s.

- [ ] **Step 6: Confirm the working tree is clean and the branch state is what you expect**

Run: `git status --short --branch`
Run: `git log --oneline -8`
Expected: working tree clean; one commit per task from this plan; nothing staged or uncommitted.

- [ ] **Step 7: Commit any verification-driven fixups**

If Step 1 through 5 required any change, commit it now with a Conventional Commits message describing what broke and why. If nothing changed, do not create an empty commit.

### Verification outcome (2026-10-05)

Two defects surfaced and were fixed before committing:

1. **The test axis was dead on Windows.** `probeTestSuite` spawned the package
   manager through `promisify(execFile)`. On Windows `spawn('npm')` throws
   ENOENT and `spawn('npm.cmd')` throws EINVAL, because `CreateProcess` cannot
   run a batch shim directly. Every baseline and mutant therefore reported
   `testPassed: false`, so `--run-tests` silently produced the same ranking as
   a thermal-only run. Fixed by routing npm/pnpm/yarn through `cmd.exe /c`
   (no shell option, so argument handling stays injection-free) and by adding
   `runPackageManager` to `FitnessDeps` in place of the git-oriented
   `execFileAsync`.
2. **Mutant worktrees had no dependencies.** A fresh worktree has no
   `node_modules`, so even a correctly-spawned suite could not run. Fixed with a
   directory junction from the worktree's `node_modules` to the main checkout's,
   created on `createWorktree` and unlinked on `removeWorktree`. A junction is a
   reparse point, so unlinking it never touches the target.

After the fix the smoke run reports `baseline.testPassed: true`, per-mutant
`testPassed`, and `testSignal: measured`.

---

## Definition of Done

- [ ] Every file in `src/biomimicry/` and `src/cli/commands/evolveCommand.ts` is under 400 lines.
- [ ] `src/cli/cliRun.ts` is exactly 437 lines, under its 466 baseline, with no ratchet baseline edit.
- [ ] No `console.*` anywhere in `src/`.
- [ ] Every Git invocation goes through `execFileAsync` with `GIT_UNTRUSTED_CONFIG_ARGS` applied.
- [ ] Immunity test #1: a quote-dense file is byte-identical after every operator.
- [ ] Immunity test #2: after a full cycle, HEAD, branch list, index and every tracked file are bit-identical.
- [ ] `git worktree list` shows no residue after a run.
- [ ] `npm run lint`, `npm run build`, `npx vitest run` all pass with zero failures.
- [ ] The local ratchet reports `nuevas=0 regresiones=0`.
- [ ] `heat` and `evolve` are documented in all 15 locale directories.
- [ ] The working tree is clean and no push was performed without explicit approval.
