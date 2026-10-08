import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { ChokidarOptions, FSWatcher } from 'chokidar';
import { LINEAGE_FILE_NAME } from '../biomimicry/lineageStore.js';
import { EVOLUTION_REPORT_FILE_NAME } from '../biomimicry/report.js';
import { LAWS_FILE_NAME } from '../biomimicry/semanticGuardian.js';
import { logger } from '../shared/logger.js';
import { MEMORY_DIRECTORY } from '../thermodynamics/report.js';
import { type DashboardSnapshot, gatherSnapshot } from './snapshot.js';
import { dashboardHtml } from './ui.js';

export type DashboardEventType = 'heartbeat' | 'snapshot' | 'mutation' | 'guardian' | 'lineage';

export interface DashboardDeps {
  readonly root: string;
  gatherSnapshot: () => Promise<DashboardSnapshot>;
  watch?: (paths: string | string[], options?: ChokidarOptions) => FSWatcher;
  heartbeatMs?: number;
  now?: () => number;
}

export interface DashboardServerHandle {
  /** port 0 binds an ephemeral port; resolves with the bound URL. */
  start(port: number): Promise<{ port: number; url: string }>;
  close(): Promise<void>;
  emit(event: DashboardEventType, data: unknown): void;
}

/**
 * Whether chokidar should observe this path: the memory directory plus the
 * guardian and lineage files at the root. Everything else — source trees,
 * node_modules, .git — is pruned so the watcher costs nothing on large repos.
 */
export const isDashboardDataPath = (root: string, target: string): boolean => {
  const memoryDir = path.join(root, MEMORY_DIRECTORY);
  if (target === memoryDir || target.startsWith(`${memoryDir}${path.sep}`)) {
    return true;
  }
  const name = path.basename(target);
  return name === LAWS_FILE_NAME || name === LINEAGE_FILE_NAME;
};

export const createDashboardServer = (deps: DashboardDeps): DashboardServerHandle => {
  const heartbeatMs = deps.heartbeatMs ?? 1000;
  const now = deps.now ?? (() => Date.now());
  const clients = new Set<http.ServerResponse>();
  const watcher: FSWatcher | null = null;
  const heartbeatTimer: NodeJS.Timeout | null = null;
  const changeTimer: NodeJS.Timeout | null = null;
  const watching = false;
  let listening = false;
  let closed = false;

  const send = (response: http.ServerResponse, event: string, data: unknown): void => {
    if (response.writableEnded || response.destroyed) return;
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const emit: DashboardServerHandle['emit'] = (event, data) => {
    for (const client of clients) {
      send(client, event, data);
    }
  };

  const broadcastSnapshot = (): void => {
    void deps
      .gatherSnapshot()
      .then((snapshot) => emit('snapshot', snapshot))
      .catch((error: unknown) => logger.error(`Dashboard snapshot failed: ${(error as Error).message}`));
  };

  const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    try {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }

      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;

      if (pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(dashboardHtml());
        return;
      }

      if (pathname === '/api/status') {
        const snapshot = await deps.gatherSnapshot();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(snapshot));
        return;
      }

      if (pathname === '/api/stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        });
        res.write('retry: 2000\n\n');
        clients.add(res);
        res.on('close', () => {
          clients.delete(res);
        });
        void deps
          .gatherSnapshot()
          .then((snapshot) => send(res, 'snapshot', snapshot))
          .catch(() => undefined);
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch (error) {
      logger.error(`Dashboard request failed: ${(error as Error).message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal Server Error');
    }
  };

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });
  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  const start = async (port: number): Promise<{ port: number; url: string }> => {
    if (closed) {
      throw new Error('Dashboard server is already closed');
    }
    if (listening) {
      throw new Error('Dashboard server is already listening');
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', onError);
        resolve();
      });
    });
    listening = true;

    const address = server.address() as AddressInfo;
    return { port: address.port, url: `http://127.0.0.1:${address.port}` };
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;

    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    if (changeTimer !== null) clearTimeout(changeTimer);
    if (watching && watcher !== null) await watcher.close();

    for (const client of clients) client.end();
    clients.clear();

    if (listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      listening = false;
    }
  };

  return { start, close, emit };
};
