> Constraints, file map, execution order and Definition of Done: [README](./README.md).

## Task 7: Documentation in all 15 locales

**Files:**
- Modify: `website/client/src/{de,en,es,fr,hi,id,it,ja,ko,pt-br,ru,tr,vi,zh-cn,zh-tw}/guide/command-line-options.md`

**Why this task exists:** `AGENTS.md` requires user-facing changes in all 15 locale directories. Phase 4's `heat` command is currently documented in **zero** of them (`grep -ri heat website/client/src` returns nothing) — a standing regression. This task closes both gaps.

- [ ] **Step 1: Confirm the gap before writing anything**

Run: `Select-String -Path 'website/client/src/*/guide/*.md' -Pattern 'heat|evolve'`
Expected: no matches. If there are matches, read them and update instead of appending, to avoid duplicate sections.

- [ ] **Step 2: Write the section content once, in English**

Append this to `website/client/src/en/guide/command-line-options.md`, immediately before the existing `## Related Resources` heading so the new options sit with the other option tables:

```markdown
## Thermodynamics and Evolution Commands

Repomix ships two analysis commands that read your repository's Git history and report where code is under stress. They are read-only with respect to your working tree: `heat` never writes anything, and `evolve` performs all of its work in throwaway Git worktrees under your temporary directory, leaving your branches, HEAD, and uncommitted work untouched.

### heat

Measures per-file "temperature" from commit churn, author count, file size, and cyclomatic density, then lists the files at or above the threshold as *boiling*.

```bash
# Analyse the last 90 days of history
repomix heat .

# Widen the window and the report size
repomix heat . --days 365 --limit 50

# Machine-readable output
repomix heat . --json
```

| Option | Default | Description |
| --- | --- | --- |
| `--days <n>` | `90` | Days of Git history to analyse |
| `--max-commits <n>` | `500` | Maximum commits to analyse |
| `--t-max <n>` | `80` | Temperature threshold for boiling files |
| `--limit <n>` | `20` | Number of files listed in the table |
| `--json` | off | Emit the raw report instead of a table |
| `--no-fail` | off | Exit `0` even when boiling files are detected |
| `--report` | off | Write `thermodynamic-report.json` to `.manteka-memory/` |

### evolve

Branches your repository into ephemeral mutants, mutates the boiling files, and ranks the mutants by a Biological Fitness Index. Every mutant is evaluated in its own detached Git worktree, so your repository is never modified.

```bash
# Explore five mutants from the current HEAD
repomix evolve .

# Restrict to one operator and two files
repomix evolve . --operator dead-guard --target src/legacy.ts

# Include the project's own test suite in the score
repomix evolve . --run-tests
```

| Option | Default | Description |
| --- | --- | --- |
| `--population <n>` | `5` | Maximum mutants to evaluate |
| `--operator <name>` | all three | Restrict to one operator; repeatable |
| `--target <path>` | boiling files | Restrict to specific files; repeatable |
| `--concurrency <n>` | `2` | Mutants evaluated in parallel |
| `--run-tests` | off | Include the test axis in the fitness index |
| `--test-timeout <ms>` | `300000` | Per-mutant test suite timeout |
| `--json` | off | Emit the raw report instead of a table |
| `--report` | off | Write `evolution-report.json` to `.manteka-memory/` |

`--target` narrows scope, it does not widen it: targets are intersected with the boiling set, so naming a file that is not boiling produces no mutants for it.

**Ranking semantics.** All three mutation operators add code, which slightly raises temperature. Every mutant therefore scores marginally worse than the unmodified baseline, and the ranking means **least harmful first**, not best improvement. Interpret the table that way until cooling operators arrive in a later release.

::: warning Running your test suite
`--run-tests` executes your project's own `test` script once per mutant, on mutated source. That is arbitrary project code running against modified input. Leave it off unless you intend to run it, and expect it to be slow.
:::
```

- [ ] **Step 3: Translate the section into the other 14 locales**

Apply the same section to each of:

```
website/client/src/de/guide/command-line-options.md
website/client/src/es/guide/command-line-options.md
website/client/src/fr/guide/command-line-options.md
website/client/src/hi/guide/command-line-options.md
website/client/src/id/guide/command-line-options.md
website/client/src/it/guide/command-line-options.md
website/client/src/ja/guide/command-line-options.md
website/client/src/ko/guide/command-line-options.md
website/client/src/pt-br/guide/command-line-options.md
website/client/src/ru/guide/command-line-options.md
website/client/src/tr/guide/command-line-options.md
website/client/src/vi/guide/command-line-options.md
website/client/src/zh-cn/guide/command-line-options.md
website/client/src/zh-tw/guide/command-line-options.md
```

Rules for each translation:

- Translate headings, prose, table headers and the option descriptions. **Never translate** option flag names (`--population`), file paths (`.manteka-memory/`), or the `::: warning` block type.
- Keep the `## Thermodynamics and Evolution Commands` heading as the single top-level section heading within the block; use the locale's established wording style found in that file's existing `##` headings.
- Insert immediately before that locale's existing `## Related Resources` heading. If a locale has no such heading, append at the end of the file.
- Preserve the existing file's line-ending and encoding. Some files in this tree show mojibake in console output; that is a display artefact of the Windows console, **not** file corruption. Do not "fix" unrelated text.
- Match the terminology already used in that locale for "temperature", "compression", and "options" so the page stays internally consistent.

- [ ] **Step 4: Verify every locale has the section**

Run:
```bash
Select-String -Path 'website/client/src/*/guide/command-line-options.md' -Pattern 'run-tests' | Group-Object Filename | Select-Object Count, Name
```
Expected: `3` for each of the 15 files. The section documents `--run-tests` three times: in the `evolve` bash example, in the options table and in the `::: warning` block. Counting occurrences of the section heading `### evolve` is the reliable structural check.

- [ ] **Step 5: Build the website client**

Run, from the `website/client` directory:
```bash
npm run docs:build
```
Expected: build succeeds. Root `npm run lint` does not typecheck the website client, so this step is the only way to catch a broken locale file.

If `npm run docs:build` cannot run because dependencies are not installed in that workspace, record that in the commit body rather than skipping verification silently.

Note for future runs: `biome.json` includes `website/**` and does not read `.gitignore`, so the `website/client/stats.html` bundle report emitted by `docs:build` is linted as JavaScript and fails `npm run lint` with hundreds of `noCommaOperator` diagnostics. Delete that generated file before linting. It is gitignored, so it never shows up in `git status`.

The `Default` column holds prose as well as values. Translate the cells whose English content is prose (`all three`, `boiling files`) and reuse each locale's own established wording for a boiling file, taken from the prose of that file's `heat` subsection. Boolean values such as `off` stay untranslated.

- [ ] **Step 6: Commit**

```bash
git add website/client/src
git commit -m "docs: document heat and evolve commands in all 15 locales"
```

---
