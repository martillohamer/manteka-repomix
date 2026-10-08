import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from '../../src/dashboard/server.js';
import { type DashboardSnapshot, gatherSnapshot } from '../../src/dashboard/snapshot.js';
import { dashboardHtml } from '../../src/dashboard/ui.js';

describe('gatherSnapshot', () => {
  it('reports a cold start when nothing has run yet', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-dashboard-'));
    try {
      const snapshot = await gatherSnapshot(dir);

      expect(snapshot.root).toBe(path.resolve(dir));
      expect(snapshot.head).toBeNull();
      expect(snapshot.guardian).toEqual({ present: false, lawCount: 0, laws: [] });
      expect(snapshot.lineage.wins).toBe(0);
      expect(snapshot.thermal.present).toBe(false);
      expect(snapshot.evolution.present).toBe(false);
      expect(snapshot.watcher.lastBeatAt).toBeNull();
      expect(typeof snapshot.serverAt).toBe('number');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('assembles guardian, lineage, thermal and evolution sections from persisted files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-dashboard-'));
    try {
      await fs.writeFile(
        path.join(dir, '.manteka-laws.yaml'),
        ['- id: no-console', '  description: "no logging"', '  disallowedNode: CallExpression'].join('\n'),
        'utf8',
      );
      await fs.writeFile(
        path.join(dir, '.manteka-lineage.json'),
        JSON.stringify({
          schemaVersion: 1,
          entries: [
            {
              operator: 'comment-reducer',
              targetFile: 'src/a.ts',
              thermalAxis: 4,
              fitness: 2.4,
              recordedAt: '2026-10-06T00:00:00.000Z',
            },
            {
              operator: 'comment-reducer',
              targetFile: 'src/b.ts',
              thermalAxis: 6,
              fitness: 3.1,
              recordedAt: '2026-10-06T00:01:00.000Z',
            },
          ],
        }),
        'utf8',
      );
      await fs.mkdir(path.join(dir, '.manteka-memory'));
      await fs.writeFile(
        path.join(dir, '.manteka-memory', 'thermodynamic-report.json'),
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-10-06T00:00:00.000Z',
          repo: { root: dir, isGitRepo: false, head: null },
          policy: { windowDays: 90, maxCommits: 500, tMax: 80, weights: {}, saturations: {} },
          summary: { fileCount: 2, boilingFiles: 1, maxTemperature: 82, meanTemperature: 41 },
          files: [{ path: 'src/hot.ts', temperature: 82, band: 'Crítico' }],
        }),
        'utf8',
      );
      await fs.writeFile(
        path.join(dir, '.manteka-memory', 'evolution-report.json'),
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-10-06T00:02:00.000Z',
          repo: { root: dir, head: 'abc1234', runDir: '/tmp/run' },
          policy: {},
          testSignal: 'not-measured',
          baseline: { temperature: {}, testPassed: null },
          mutants: [
            {
              id: 'src/hot.ts::comment-reducer',
              targetFile: 'src/hot.ts',
              operator: 'comment-reducer',
              applied: true,
              mutationLine: 3,
              temperatureBefore: 82,
              temperatureAfter: 76,
              thermalAxis: 6,
              testPassed: null,
              testAxis: null,
              fitness: 4.2,
              viable: true,
              failure: null,
            },
            {
              id: 'src/hot.ts::dead-guard',
              targetFile: 'src/hot.ts',
              operator: 'dead-guard',
              applied: false,
              mutationLine: null,
              temperatureBefore: 82,
              temperatureAfter: null,
              thermalAxis: null,
              testPassed: null,
              testAxis: null,
              fitness: null,
              viable: false,
              failure: 'no target',
            },
          ],
          summary: { total: 2, viable: 1, best: 'src/hot.ts::comment-reducer', worst: 'src/hot.ts::dead-guard' },
          states: ['done'],
        }),
        'utf8',
      );

      const snapshot = await gatherSnapshot(dir);

      expect(snapshot.guardian.present).toBe(true);
      expect(snapshot.guardian.lawCount).toBe(1);
      expect(snapshot.guardian.laws.map((law) => law.id)).toContain('no-console');
      expect(snapshot.lineage.wins).toBe(2);
      expect(snapshot.lineage.entries).toHaveLength(2);
      expect(snapshot.lineage.weights['comment-reducer']).toBeGreaterThan(snapshot.lineage.weights['dead-guard'] ?? 0);
      expect(snapshot.thermal).toMatchObject({
        present: true,
        maxTemperature: 82,
        meanTemperature: 41,
        fileCount: 2,
        boilingFiles: 1,
      });
      expect(snapshot.thermal.hottestFiles).toEqual([{ file: 'src/hot.ts', temperature: 82, band: 'Crítico' }]);
      expect(snapshot.evolution).toEqual({
        present: true,
        generatedAt: '2026-10-06T00:02:00.000Z',
        summary: { total: 2, viable: 1, best: 'src/hot.ts::comment-reducer', worst: 'src/hot.ts::dead-guard' },
        lastOperator: 'comment-reducer',
        lastDelta: 6,
      });
      expect(snapshot.watcher.lastBeatAt).not.toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('degrades a corrupt persisted report to an empty section', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-dashboard-'));
    try {
      await fs.mkdir(path.join(dir, '.manteka-memory'));
      await fs.writeFile(path.join(dir, '.manteka-memory', 'evolution-report.json'), 'not json', 'utf8');

      const snapshot = await gatherSnapshot(dir);

      expect(snapshot.evolution.present).toBe(false);
      expect(snapshot.thermal.present).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('degrades a valid-JSON report with the wrong shape without killing the snapshot', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-dashboard-'));
    try {
      await fs.mkdir(path.join(dir, '.manteka-memory'));
      await fs.writeFile(path.join(dir, '.manteka-memory', 'thermodynamic-report.json'), JSON.stringify({}), 'utf8');
      await fs.writeFile(path.join(dir, '.manteka-memory', 'evolution-report.json'), JSON.stringify({}), 'utf8');

      const snapshot = await gatherSnapshot(dir);

      expect(snapshot.thermal.present).toBe(false);
      expect(snapshot.evolution.present).toBe(false);
      expect(snapshot.root).toBe(path.resolve(dir));
      expect(snapshot.lineage.wins).toBe(0);
      expect(snapshot.watcher.lastBeatAt).not.toBeNull();
      expect(typeof snapshot.serverAt).toBe('number');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('dashboard SPA', () => {
  it('renders the biometric lab shell with every panel wired to the API', () => {
    const html = dashboardHtml();

    expect(html).toContain('<title>MANTEKA');
    expect(html).toContain('id="guardian-panel"');
    expect(html).toContain('id="heat-panel"');
    expect(html).toContain('id="weights-panel"');
    expect(html).toContain('id="evolution-panel"');
    expect(html).toContain('id="log-panel"');
    expect(html).toContain("new EventSource('/api/stream')");
    expect(html).toContain("fetch('/api/status')");
    expect(html).toContain('heartbeat');
    expect(html).toContain('RECONNECTING');
  });

  it('loads no external resources (fully self-contained)', () => {
    const html = dashboardHtml();

    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
    expect(html).not.toMatch(/url\(https?:/);
  });

  it('contains no backticks or template placeholders (it lives in a template literal)', () => {
    const html = dashboardHtml();

    expect(html).not.toContain('`');
    expect(html).not.toContain('${');
  });
});

const sampleSnapshot = (): DashboardSnapshot => ({
  root: path.resolve('fake-repo'),
  head: 'abc1234',
  guardian: {
    present: true,
    lawCount: 1,
    laws: [{ id: 'no-console', description: 'no logging', disallowedNode: 'CallExpression' }],
  },
  lineage: {
    wins: 3,
    entries: [
      {
        operator: 'comment-reducer',
        targetFile: 'src/a.ts',
        thermalAxis: 4,
        fitness: 2.4,
        recordedAt: '2026-10-06T00:00:00.000Z',
      },
    ],
    weights: {
      'comment-reducer': 0.4,
      'dead-guard': 0.2,
      'comment-noise': 0.15,
      'constant-perturbation': 0.15,
      'dead-guard-stripper': 0.1,
    },
  },
  thermal: {
    present: true,
    generatedAt: '2026-10-06T00:00:00.000Z',
    maxTemperature: 72.5,
    meanTemperature: 31.2,
    fileCount: 12,
    boilingFiles: 1,
    hottestFiles: [{ file: 'src/hot.ts', temperature: 72.5, band: 'Muy Caliente' }],
  },
  evolution: {
    present: true,
    generatedAt: '2026-10-06T00:02:00.000Z',
    summary: { total: 5, viable: 2, best: 'src/hot.ts::comment-reducer', worst: null },
    lastOperator: 'comment-reducer',
    lastDelta: 6.4,
  },
  watcher: { lastBeatAt: 1770000000000 },
  serverAt: 1770000000000,
});

describe('dashboard server', () => {
  let handle: DashboardServerHandle | null = null;
  let baseUrl = '';

  const startServer = async (overrides: Partial<Parameters<typeof createDashboardServer>[0]> = {}) => {
    handle = createDashboardServer({
      root: path.resolve('fake-repo'),
      gatherSnapshot: async () => sampleSnapshot(),
      heartbeatMs: 30,
      ...overrides,
    });
    const started = await handle.start(0);
    baseUrl = `http://127.0.0.1:${started.port}`;
    return { handle, started };
  };

  afterEach(async () => {
    await handle?.close();
    handle = null;
  });

  it('starts on an ephemeral port and reports its URL', async () => {
    const { started } = await startServer();

    expect(started.port).toBeGreaterThan(0);
    expect(started.url).toBe(`http://127.0.0.1:${started.port}`);
  });

  it('serves the SPA at GET / as text/html', async () => {
    await startServer();

    const response = await fetch(`${baseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('MANTEKA · BIOMETRIC DASHBOARD');
  });

  it('serves the injected snapshot at GET /api/status', async () => {
    await startServer();

    const response = await fetch(`${baseUrl}/api/status`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(sampleSnapshot());
  });

  it('answers 404 for unknown routes and 405 for non-GET methods', async () => {
    await startServer();

    const missing = await fetch(`${baseUrl}/api/nope`);
    expect(missing.status).toBe(404);

    const posted = await fetch(`${baseUrl}/api/status`, { method: 'POST' });
    expect(posted.status).toBe(405);
    expect(posted.headers.get('allow')).toBe('GET');
  });

  it('closes cleanly and is idempotent', async () => {
    const { handle: server } = await startServer();

    await server.close();
    await expect(fetch(`${baseUrl}/api/status`)).rejects.toThrow();
    await expect(server.close()).resolves.toBeUndefined();
  });
});
