# Fase 5.1 — Cooling Operators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two inverse mutation operators (`dead-guard-stripper`, `comment-reducer`) that can genuinely cool a file, turning the evolution ranking from "least harmful first" into a real "best first" optimization signal.

**Architecture:** Extend `src/biomimicry/mutationOperators.ts` with two conservative no-parser text transforms that are inverses of the existing heating operators. Register them in `types.ts`. No fitness-formula change — `thermalAxis = baseline.temp − mutant.temp` already rewards cooling. Update the `render.ts` ranking banner and the 15-locale docs.

**Tech Stack:** TypeScript (strict), Vitest, Biome, Git worktrees.

## Global Constraints

- Every file stays **under 400 lines** (CI ratchet). `mutationOperators.ts` grows from 85 to ~200; no other file grows significantly.
- **No parser.** Cooling operators are conservative text transforms. Real dead-code analysis is a non-goal.
- **Strict no-quote eligibility rule.** An operator never touches a line containing `'`, `"`, or backtick. This is what makes the subsystem defensible without a parser.
- **Deterministic.** No RNG. Given identical input, output is byte-identical.
- **No new CLI flags.** `--operator` already accepts the new names.
- **Docs in all 15 locales** under `website/client/src/`.
- **TDD.** Write the failing test, verify it fails, implement, verify it passes, commit.
- **Frequent commits.** One commit per task.

---

## Task 1: Register the new operator names

**Files:**
- Modify: `src/biomimicry/types.ts:10-16`
- Test: `tests/biomimicry/mutationOperators.test.ts`

**Interfaces:**
- Produces: `MutationOperatorName` includes `'dead-guard-stripper'` and `'comment-reducer'`; `MUTATION_OPERATOR_NAMES` lists all five.

- [ ] **Step 1: Write the failing test**

Add to `tests/biomimicry/mutationOperators.test.ts`:

```typescript
it('registers the cooling operator names', () => {
  expect(isKnownOperator('dead-guard-stripper')).toBe(true);
  expect(isKnownOperator('comment-reducer')).toBe(true);
  expect(isKnownOperator('not-an-operator')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/biomimicry/mutationOperators.test.ts -t "registers the cooling operator names"`
Expected: FAIL — `isKnownOperator('dead-guard-stripper')` returns `false`.

- [ ] **Step 3: Implement**

In `src/biomimicry/types.ts`, replace lines 10-16:

```typescript
export type MutationOperatorName = 'comment-noise' | 'dead-guard' | 'constant-perturbation' | 'dead-guard-stripper' | 'comment-reducer';

export const MUTATION_OPERATOR_NAMES: readonly MutationOperatorName[] = [
  'comment-noise',
  'dead-guard',
  'constant-perturbation',
  'dead-guard-stripper',
  'comment-reducer',
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/biomimicry/mutationOperators.test.ts -t "registers the cooling operator names"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/biomimicry/types.ts tests/biomimicry/mutationOperators.test.ts
git commit -m "feat(biomimicry): register cooling operator names"
```

---

## Task 2: Implement `dead-guard-stripper`

**Files:**
- Modify: `src/biomimicry/mutationOperators.ts`
- Test: `tests/biomimicry/mutationOperators.test.ts`

**Interfaces:**
- Consumes: `MutationApplication`, `notApplied`, `UNSAFE_CHARACTERS` (all in `mutationOperators.ts`).
- Produces: `MUTATION_OPERATORS['dead-guard-stripper']` with `apply(content: string) => MutationApplication`.

- [ ] **Step 1: Write the failing test**

Add to `tests/biomimicry/mutationOperators.test.ts`:

```typescript
describe('dead-guard-stripper', () => {
  it('removes a multi-line if (false) block', () => {
    const content = ['const x = 1;', 'if (false) {', '  const y = 2;', '}', 'const z = 3;', ''].join('\n');
    const result = applyMutation('dead-guard-stripper', content);
    expect(result.changed).toBe(true);
    expect(result.content).toBe(['const x = 1;', 'const z = 3;', ''].join('\n'));
  });

  it('removes the single-line if (false as boolean) guard', () => {
    const content = ['const x = 1;', 'if (false as boolean) { /* mutant:dead-guard */ }', 'const z = 3;', ''].join('\n');
    const result = applyMutation('dead-guard-stripper', content);
    expect(result.changed).toBe(true);
    expect(result.content).toBe(['const x = 1;', 'const z = 3;', ''].join('\n'));
  });

  it('reports not applicable when no dead guard exists', () => {
    const content = ['const x = 1;', 'const z = 3;', ''].join('\n');
    const result = applyMutation('dead-guard-stripper', content);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/biomimicry/mutationOperators.test.ts -t "dead-guard-stripper"`
Expected: FAIL — `applyMutation('dead-guard-stripper', ...)` throws (unknown operator).

- [ ] **Step 3: Implement**

In `src/biomimicry/mutationOperators.ts`, add to the `MUTATION_OPERATORS` record (after `constant-perturbation`):

```typescript
  'dead-guard-stripper': {
    name: 'dead-guard-stripper',
    apply: (content: string): MutationApplication => {
      const lines = content.split('\n');
      const startIndex = lines.findIndex((line) => /^\s*if\s*\(\s*false\b/.test(line));
      if (startIndex === -1) {
        return notApplied(content);
      }

      let braceDepth = 0;
      let opened = false;
      let endIndex = -1;
      for (let i = startIndex; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') {
            opened = true;
            braceDepth++;
          } else if (char === '}') {
            braceDepth--;
            if (opened && braceDepth === 0) {
              endIndex = i;
              break;
            }
          }
        }
        if (endIndex !== -1) break;
      }
      if (endIndex === -1) {
        return notApplied(content);
      }

      const block = lines.slice(startIndex, endIndex + 1).join('\n');
      if (UNSAFE_CHARACTERS.some((character) => block.includes(character))) {
        return notApplied(content);
      }

      const mutated = [...lines];
      mutated.splice(startIndex, endIndex - startIndex + 1);
      return { content: mutated.join('\n'), line: startIndex + 1, changed: true };
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/biomimicry/mutationOperators.test.ts -t "dead-guard-stripper"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/biomimicry/mutationOperators.ts tests/biomimicry/mutationOperators.test.ts
git commit -m "feat(biomimicry): add dead-guard-stripper cooling operator"
```

---

## Task 3: Implement `comment-reducer`

**Files:**
- Modify: `src/biomimicry/mutationOperators.ts`
- Test: `tests/biomimicry/mutationOperators.test.ts`

**Interfaces:**
- Consumes: `MutationApplication`, `notApplied`, `UNSAFE_CHARACTERS`.
- Produces: `MUTATION_OPERATORS['comment-reducer']` with `apply(content: string) => MutationApplication`.

- [ ] **Step 1: Write the failing test**

Add to `tests/biomimicry/mutationOperators.test.ts`:

```typescript
describe('comment-reducer', () => {
  it('removes pure comment lines and collapses consecutive blanks', () => {
    const content = ['const x = 1;', '// a comment', '/* block */', '', '', 'const y = 2;', ''].join('\n');
    const result = applyMutation('comment-reducer', content);
    expect(result.changed).toBe(true);
    expect(result.content).toBe(['const x = 1;', '', 'const y = 2;', ''].join('\n'));
  });

  it('removes multi-line block comments', () => {
    const content = ['const x = 1;', '/* start', ' * middle', ' */', 'const y = 2;', ''].join('\n');
    const result = applyMutation('comment-reducer', content);
    expect(result.changed).toBe(true);
    expect(result.content).toBe(['const x = 1;', 'const y = 2;', ''].join('\n'));
  });

  it('keeps lines that mix code and comments', () => {
    const content = ['const x = 1; // inline', 'const y = 2;', ''].join('\n');
    const result = applyMutation('comment-reducer', content);
    expect(result.changed).toBe(false);
  });

  it('reports not applicable when there is no comment or blank noise', () => {
    const content = ['const x = 1;', 'const y = 2;', ''].join('\n');
    const result = applyMutation('comment-reducer', content);
    expect(result.changed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/biomimicry/mutationOperators.test.ts -t "comment-reducer"`
Expected: FAIL — `applyMutation('comment-reducer', ...)` throws (unknown operator).

- [ ] **Step 3: Implement**

In `src/biomimicry/mutationOperators.ts`, add to the `MUTATION_OPERATORS` record (after `dead-guard-stripper`):

```typescript
  'comment-reducer': {
    name: 'comment-reducer',
    apply: (content: string): MutationApplication => {
      const lines = content.split('\n');
      const remove = new Array<boolean>(lines.length).fill(false);
      let inBlock = false;
      let firstRemoved: number | null = null;

      const isPureComment = (line: string, inside: boolean): boolean => {
        const trimmed = line.trim();
        if (inside) {
          const close = trimmed.indexOf('*/');
          if (close === -1) return true;
          return trimmed.slice(close + 2).trim().length === 0;
        }
        if (trimmed.startsWith('//')) return true;
        if (trimmed.startsWith('/*')) {
          const close = trimmed.indexOf('*/');
          if (close === -1) return true;
          return trimmed.slice(close + 2).trim().length === 0;
        }
        return false;
      };

      for (let i = 0; i < lines.length; i++) {
        if (isPureComment(lines[i], inBlock) && !UNSAFE_CHARACTERS.some((character) => lines[i].includes(character))) {
          remove[i] = true;
          if (firstRemoved === null) firstRemoved = i + 1;
        }
        const trimmed = lines[i].trim();
        if (inBlock) {
          if (trimmed.includes('*/')) inBlock = false;
        } else if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
          inBlock = true;
        }
      }

      const kept = lines.filter((_, index) => !remove[index]);
      const collapsed: string[] = [];
      let blanks = 0;
      for (const line of kept) {
        if (line.trim().length === 0) {
          blanks++;
          if (blanks === 1) collapsed.push(line);
        } else {
          blanks = 0;
          collapsed.push(line);
        }
      }

      const result = collapsed.join('\n');
      return { content: result, line: firstRemoved, changed: result !== content };
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/biomimicry/mutationOperators.test.ts -t "comment-reducer"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/biomimicry/mutationOperators.ts tests/biomimicry/mutationOperators.test.ts
git commit -m "feat(biomimicry): add comment-reducer cooling operator"
```

---

## Task 4: Immunity test for cooling operators

**Files:**
- Test: `tests/biomimicry/mutationOperators.test.ts`

**Interfaces:**
- Consumes: `applyMutation`, `MutationOperatorName`.

- [ ] **Step 1: Write the test**

Add to `tests/biomimicry/mutationOperators.test.ts`:

```typescript
it('cooling operators leave a quote-dense file byte-identical', () => {
  const content = ['const a = "don\'t";', 'const b = `template ${x}`;', "const c = 'single';", ''].join('\n');
  for (const name of ['dead-guard-stripper', 'comment-reducer'] as const) {
    const result = applyMutation(name, content);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  }
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/biomimicry/mutationOperators.test.ts -t "cooling operators leave a quote-dense"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/biomimicry/mutationOperators.test.ts
git commit -m "test(biomimicry): assert cooling operators preserve quote-dense files"
```

---

## Task 5: Fitness evaluator validation

**Files:**
- Test: `tests/biomimicry/fitnessEvaluator.test.ts`

**Interfaces:**
- Consumes: `computeFitness` from `src/biomimicry/fitnessEvaluator.js`.

- [ ] **Step 1: Write the test**

Add to `tests/biomimicry/fitnessEvaluator.test.ts`:

```typescript
it('a cooling mutant formally surpasses the baseline', () => {
  const baseline = computeFitness({ temperature: 80, testPassed: null }, { temperature: 80, testPassed: null });
  const cooling = computeFitness({ temperature: 80, testPassed: null }, { temperature: 78, testPassed: null });

  expect(baseline.fitness).toBe(0);
  expect(cooling.thermalAxis).toBeGreaterThan(0);
  expect(cooling.fitness).toBeGreaterThan(0);
  expect(cooling.fitness).toBeGreaterThan(baseline.fitness);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/biomimicry/fitnessEvaluator.test.ts -t "a cooling mutant formally surpasses"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/biomimicry/fitnessEvaluator.test.ts
git commit -m "test(biomimicry): certify cooling mutants surpass the baseline"
```

---

## Task 6: Update the ranking banner

**Files:**
- Modify: `src/biomimicry/render.ts:34-41,56`

**Interfaces:**
- Consumes: `EvolutionReport` (unchanged).

- [ ] **Step 1: Update the banner text**

In `src/biomimicry/render.ts`, replace the doc comment (lines 34-41) and the banner line (56):

```typescript
/**
 * Render the ranked mutant table.
 *
 * The banner states the ranking semantics explicitly: cooling operators can
 * reduce temperature, so a positive fitness delta is achievable and the ordering
 * means "best first". Claiming otherwise would hide a real improvement signal.
 */
```

```typescript
  lines.push(colorize('Ranking is "best first": cooling operators can reduce temperature, so top-of-table is a real improvement signal.'));
```

- [ ] **Step 2: Run the biomimicry tests**

Run: `npx vitest run tests/biomimicry`
Expected: PASS (no render test asserts the old text).

- [ ] **Step 3: Commit**

```bash
git add src/biomimicry/render.ts
git commit -m "feat(biomimicry): flip ranking semantics to best-first"
```

---

## Task 7: Update documentation in all 15 locales

**Files:**
- Modify: `website/client/src/{de,en,es,fr,hi,id,it,ja,ko,pt-br,ru,tr,vi,zh-cn,zh-tw}/guide/command-line-options.md`

**Interfaces:**
- Consumes: the `### evolve` section added in Phase 5.

- [ ] **Step 1: Update the English source**

In `website/client/src/en/guide/command-line-options.md`, in the `### evolve` options table, add two rows after the existing operator row:

```
| `--operator <name>` | all five | Restrict to one operator; repeatable |
```

Update the Default cell from `all three` to `all five`. Add the two new operators to the ranking-semantics paragraph: replace "All three mutation operators add code" with "Three mutation operators add code and two cool it", and replace "Until cooling operators are added in a later release" with "Cooling operators can reduce temperature, so top-of-table is a real improvement signal".

- [ ] **Step 2: Propagate to the other 14 locales**

For each of `de`, `es`, `fr`, `hi`, `id`, `it`, `ja`, `ko`, `pt-br`, `ru`, `tr`, `vi`, `zh-cn`, `zh-tw`: apply the same structural change — update the operator Default cell to the locale's wording for "all five", and update the ranking-semantics paragraph to reflect that two operators cool. Reuse each locale's own established wording for "boiling file" and "operator".

- [ ] **Step 3: Verify structure**

Run: `Select-String -Path 'website/client/src/*/guide/command-line-options.md' -Pattern 'dead-guard-stripper|comment-reducer' | Group-Object Filename | Select-Object Count, Name`
Expected: 15 files, each with 2 matches (table row + ranking paragraph).

- [ ] **Step 4: Build the website client**

Run: `cd website/client && npm run docs:build`
Expected: build succeeds. Remove the generated `website/client/stats.html` afterwards (Biome lints `website/**` without reading `.gitignore`).

- [ ] **Step 5: Commit**

```bash
git add website/client/src
git commit -m "docs: document cooling operators in all 15 locales"
```

---

## Task 8: Full verification

**Files:** none modified (verification only).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: `Found 0 warnings and 0 errors.` (If Biome reports "Fixed N files", re-run the full suite.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0, no TypeScript diagnostics.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all files pass, zero failures. Record the exact totals.

- [ ] **Step 4: Ratchet**

Run: `node C:\Users\astur\AppData\Local\Temp\opencode\ratchet.mjs`
Expected: `scanned=187 nuevas=0 regresiones=0` / `RATCHET OK`. The four frozen entries must all read `congelada` or `pagada`, never `REGRESIONA`.

- [ ] **Step 5: Smoke test**

Run: `node bin/repomix.cjs evolve . --population 5 --concurrency 2`
Expected: exit 0, ranked table, "best first" banner.

Run: `node bin/repomix.cjs evolve . --population 3 --operator dead-guard-stripper --json`
Expected: exit 0, `testSignal: not-measured`, mutants with `thermalAxis > 0` (cooling).

- [ ] **Step 6: Confirm clean environment**

Run: `git worktree list` / `git branch --list 'mutante/*'` / `git status --short --branch`
Expected: no orphan worktrees, no mutant branches, working tree clean.

- [ ] **Step 7: Commit any verification-driven fixup**

If Steps 1-6 required a change, commit it. If nothing changed, do not create an empty commit.

---

## Definition of Done

- [ ] `dead-guard-stripper` and `comment-reducer` are registered and reduce temperature on controlled fixtures.
- [ ] A cooling mutant produces `thermalAxis > 0`, `fitness > 0`, and surpasses the baseline.
- [ ] The ranking banner reads "best first".
- [ ] Both cooling operators are documented in all 15 locale directories.
- [ ] `npm run lint`, `npm run build`, `npx vitest run` all pass with zero failures.
- [ ] The ratchet reports `nuevas=0 regresiones=0`.
- [ ] No orphan worktrees, HEAD intact, working tree clean.
