import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultEvolutionDeps, type EvolutionDeps, runEvolution } from '../../src/biomimicry/evolutionEngine.js';
import {
  appendSuccess,
  computeOperatorWeights,
  emptyLineage,
  LINEAGE_FILE_NAME,
  type Lineage,
  type LineageEntry,
  lineagePath,
  loadLineage,
  rankOperators,
  saveLineage,
} from '../../src/biomimicry/lineageStore.js';
import type { MutationSandbox } from '../../src/biomimicry/mutationSandbox.js';
import {
  EVOLUTION_POLICY_DEFAULTS,
  type EvolutionPolicy,
  type MutationOperatorName,
} from '../../src/biomimicry/types.js';
import { THERMAL_POLICY_DEFAULTS, type ThermalRunResult } from '../../src/thermodynamics/types.js';

vi.mock('../../src/shared/logger');

const win = (overrides: Partial<LineageEntry> = {}): LineageEntry => ({
  operator: 'comment-reducer',
  targetFile: 'src/hot.ts',
  thermalAxis: 4,
  fitness: 2.4,
  recordedAt: '2026-10-05T00:00:00.000Z',
  ...overrides,
});

const lineageWith = (entries: LineageEntry[]): Lineage => ({
  schemaVersion: 1,
  entries,
});

const thermalResult = (temperatures: Record<string, number>): ThermalRunResult => {
  const files = Object.entries(temperatures).map(([filePath, temperature]) => ({
    path: filePath,
    temperature,
    commits: 1,
    authors: 1,
    lines: 10,
    logicalLines: 10,
    branchTokens: 0,
    complexityDensity: 1,
    factors: { churn: 0, authors: 0, size: 0, complexity: 0 },
    band: 'Frío',
  }));
  return {
    repoRoot: '/repo',
    isGitRepo: true,
    head: 'abc1234',
    generatedAt: '2026-10-05T00:00:00.000Z',
    policy: { ...THERMAL_POLICY_DEFAULTS },
    summary: {
      fileCount: files.length,
      boilingFiles: files.filter((file) => file.temperature >= THERMAL_POLICY_DEFAULTS.tMax).length,
      maxTemperature: Math.max(0, ...Object.values(temperatures)),
      meanTemperature: 0,
    },
    files,
    boilingFiles: files.filter((file) => file.temperature >= THERMAL_POLICY_DEFAULTS.tMax),
  } as unknown as ThermalRunResult;
};

const fakeSandbox = (): MutationSandbox => ({
  runDir: '/tmp/biomimicry/lineage/run',
  worktreePath: (id) => `/tmp/biomimicry/lineage/run/${id}`,
  createWorktree: vi.fn(async (id: string) => `/tmp/biomimicry/lineage/run/${id}`),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn().mockResolvedValue(undefined),
});

const buildDeps = (overrides: Partial<EvolutionDeps> = {}): EvolutionDeps => ({
  isGitRepository: vi.fn().mockResolvedValue(true),
  execGitShortHead: vi.fn().mockResolvedValue('abc1234'),
  runHeatAnalysis: vi.fn().mockResolvedValue(thermalResult({ 'src/hot.ts': 80 })),
  probeTestSuite: vi.fn().mockResolvedValue(null),
  readManifest: vi.fn().mockResolvedValue(null),
  runPackageManager: vi.fn().mockResolvedValue({ passed: true, reason: null }),
  createSandbox: vi.fn().mockReturnValue(fakeSandbox()),
  applyMutation: vi.fn().mockReturnValue({ content: 'mutated\n', line: 1, changed: true }),
  readFile: vi.fn().mockResolvedValue('original\n'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  loadLineage: vi.fn().mockResolvedValue(emptyLineage()),
  saveLineage: vi.fn().mockResolvedValue(undefined),
  now: () => new Date('2026-10-05T00:00:00.000Z'),
  ...overrides,
});

const policy = (overrides: Partial<EvolutionPolicy> = {}): EvolutionPolicy => ({
  ...EVOLUTION_POLICY_DEFAULTS,
  thermal: { ...THERMAL_POLICY_DEFAULTS },
  ...overrides,
});

describe('lineage persistence', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-lineage-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns empty history when the store does not exist', async () => {
    expect(await loadLineage(root)).toEqual(emptyLineage());
  });

  it('persists cooling wins and reloads them intact', async () => {
    const lineage = appendSuccess(
      appendSuccess(emptyLineage(), win({ operator: 'dead-guard', thermalAxis: 2 })),
      win({ operator: 'dead-guard', thermalAxis: 7.5 }),
    );

    await saveLineage(root, lineage);

    expect(await loadLineage(root)).toEqual(lineage);
    const raw = await fs.readFile(lineagePath(root), 'utf8');
    expect(raw).toContain('"schemaVersion": 1');
    expect(raw).toContain('.ts');
  });

  it('treats a corrupt store as empty history rather than failing', async () => {
    await fs.writeFile(lineagePath(root), 'not { valid json', 'utf8');

    expect(await loadLineage(root)).toEqual(emptyLineage());
  });

  it('drops entries whose operator no longer exists in the genome', async () => {
    await fs.writeFile(
      lineagePath(root),
      JSON.stringify({
        schemaVersion: 1,
        entries: [win(), win({ operator: 'removed-operator' })],
      }),
      'utf8',
    );

    const loaded = await loadLineage(root);
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0].operator).toBe('comment-reducer');
  });

  it('caps the store so telemetry cannot grow without bound', async () => {
    let lineage = emptyLineage();
    for (let i = 0; i < 520; i += 1) {
      lineage = appendSuccess(lineage, win({ thermalAxis: i }));
    }

    expect(lineage.entries).toHaveLength(500);
    expect(lineage.entries[0].thermalAxis).toBe(20);
  });
});

describe('epigenetic operator weighting', () => {
  const operators: MutationOperatorName[] = ['comment-noise', 'dead-guard', 'constant-perturbation'];

  it('keeps declaration order when history is empty', () => {
    expect(rankOperators(operators, emptyLineage())).toEqual(operators);
  });

  it('ranks historically successful operators ahead of untried ones', () => {
    const lineage = lineageWith([
      win({ operator: 'constant-perturbation', thermalAxis: 1 }),
      win({ operator: 'constant-perturbation', thermalAxis: 2 }),
    ]);

    expect(rankOperators(operators, lineage)).toEqual(['constant-perturbation', 'comment-noise', 'dead-guard']);
  });

  it('breaks success-count ties by total cooling achieved', () => {
    const lineage = lineageWith([
      win({ operator: 'comment-noise', thermalAxis: 0.5 }),
      win({ operator: 'dead-guard', thermalAxis: 9 }),
    ]);

    expect(rankOperators(operators, lineage)).toEqual(['dead-guard', 'comment-noise', 'constant-perturbation']);
  });

  it('normalises weights onto a probability simplex', () => {
    const lineage = lineageWith([win({ operator: 'comment-noise' }), win({ operator: 'comment-noise' })]);

    const weights = computeOperatorWeights(operators, lineage);

    expect(Object.values(weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
    expect(weights['comment-noise']).toBeGreaterThan(weights['dead-guard']);
    expect(weights['dead-guard']).toBeGreaterThan(0);
  });
});

describe('epigenetic selection in the evolution engine', () => {
  it('awards the population slot to the historically favoured operator', async () => {
    const deps = buildDeps({
      loadLineage: vi
        .fn()
        .mockResolvedValue(lineageWith([win({ operator: 'dead-guard' }), win({ operator: 'dead-guard' })])),
    });

    const report = await runEvolution(
      '/repo',
      policy({ population: 1, operators: ['comment-noise', 'dead-guard'] }),
      deps,
    );

    expect(report.mutants).toHaveLength(1);
    expect(report.mutants[0].operator).toBe('dead-guard');
  });

  it('records cooling wins into the store for the next generation', async () => {
    const saveLineageMock = vi.fn().mockResolvedValue(undefined);
    const deps = buildDeps({
      saveLineage: saveLineageMock,
      // Mutants measure 70 against an 80 baseline, so every win is a cooling.
      // Keyed on the worktree prefix rather than the literal root path, which
      // resolves differently per platform.
      runHeatAnalysis: vi.fn(async (directory: string) =>
        thermalResult({ 'src/hot.ts': directory.startsWith('/tmp/') ? 70 : 80 }),
      ),
    });

    const report = await runEvolution('/repo', policy({ population: 1 }), deps);

    expect(report.summary.viable).toBe(1);
    expect(saveLineageMock).toHaveBeenCalledTimes(1);

    const persisted = saveLineageMock.mock.calls[0][1] as Lineage;
    expect(persisted.entries).toHaveLength(1);
    expect(persisted.entries[0]).toMatchObject({
      operator: 'comment-noise',
      targetFile: 'src/hot.ts',
      thermalAxis: 10,
      recordedAt: '2026-10-05T00:00:00.000Z',
    });
  });

  it('leaves the store untouched when no mutant cools the codebase', async () => {
    const saveLineageMock = vi.fn().mockResolvedValue(undefined);
    const deps = buildDeps({
      saveLineage: saveLineageMock,
      runHeatAnalysis: vi.fn(async (directory: string) =>
        thermalResult({ 'src/hot.ts': directory.startsWith('/tmp/') ? 90 : 80 }),
      ),
    });

    await runEvolution('/repo', policy({ population: 1 }), deps);

    expect(saveLineageMock).not.toHaveBeenCalled();
  });

  it('carries wins from one generation into the next run’s selection', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-generations-'));
    try {
      const realMemory = {
        loadLineage: defaultEvolutionDeps.loadLineage,
        saveLineage: defaultEvolutionDeps.saveLineage,
      };
      const cooling = (directory: string) => thermalResult({ 'src/hot.ts': directory === root ? 80 : 70 });

      // Generation 1: dead-guard is declared first, wins, and is recorded.
      const first = await runEvolution(
        root,
        policy({ population: 1, operators: ['dead-guard', 'comment-noise'] }),
        buildDeps({ ...realMemory, runHeatAnalysis: vi.fn(async (d: string) => cooling(d)) }),
      );
      expect(first.mutants[0].operator).toBe('dead-guard');

      // Generation 2: the declaration order flips, but the lineage still puts
      // the historically winning operator in the population slot.
      const second = await runEvolution(
        root,
        policy({ population: 1, operators: ['comment-noise', 'dead-guard'] }),
        buildDeps({ ...realMemory, runHeatAnalysis: vi.fn(async (d: string) => cooling(d)) }),
      );
      expect(second.mutants[0].operator).toBe('dead-guard');

      const stored = JSON.parse(await fs.readFile(path.join(root, LINEAGE_FILE_NAME), 'utf8')) as Lineage;
      expect(stored.entries).toHaveLength(2);
      expect(stored.entries.map((entry) => entry.operator)).toEqual(['dead-guard', 'dead-guard']);
      expect(stored.entries.every((entry) => entry.thermalAxis === 10)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
