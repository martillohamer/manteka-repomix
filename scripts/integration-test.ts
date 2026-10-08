import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import type { RpcResponse } from './integration-test.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, '../bin/manteka-mcp.cjs');
const memoryDir = join(__dirname, '../.manteka-memory');
const historyPath = join(memoryDir, 'history.log');

// Unique marker so these assertions cannot be satisfied by pre-existing memory.
const MARKER = 'integrationtestmarker';
const TEST_NOTE = 'integration-test-note.md';
const CALL_TIMEOUT_MS = 60_000;

console.log(`Starting Integration Tests for MCP server from: ${binPath}`);

const readIfExists = async (target: string): Promise<string | null> => {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return null;
  }
};

/**
 * Snapshot of the shared memory dir so cleanup can restore it exactly. The suite runs
 * against the real repository, so wiping `.manteka-memory` would destroy the user's own
 * notes and history.
 */
const snapshot = { history: await readIfExists(historyPath) };

const restoreMemory = async () => {
  await fs.rm(join(memoryDir, TEST_NOTE), { force: true });
  if (snapshot.history === null) {
    await fs.rm(historyPath, { force: true });
  } else {
    await fs.writeFile(historyPath, snapshot.history, 'utf8');
  }
};

const child = spawn('node', [binPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

const pending = new Map<number, (res: RpcResponse) => void>();
let buffer = '';

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const response = JSON.parse(line) as RpcResponse;
      if (response.id && pending.has(response.id)) {
        const resolve = pending.get(response.id);
        pending.delete(response.id);
        resolve?.(response);
      }
    } catch {
      // Ignore partial chunks or malformed lines
    }
  }
});

child.stderr.on('data', (data) => {
  console.error(`MCP Stderr: ${data}`);
});

/**
 * Send one JSON-RPC call and resolve only on a well-formed `result`. A JSON-RPC `error`
 * rejects, and an unanswered call times out, so a silent server can never be mistaken
 * for a passing suite.
 */
const callRpc = (method: string, params: unknown, id: number): Promise<RpcResponse> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out after ${CALL_TIMEOUT_MS}ms waiting for "${method}" (id ${id})`));
    }, CALL_TIMEOUT_MS);

    pending.set(id, (res) => {
      clearTimeout(timer);
      if (res.error) {
        reject(new Error(`JSON-RPC error for "${method}": ${JSON.stringify(res.error)}`));
        return;
      }
      resolve(res);
    });

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

const failures: string[] = [];

const check = (label: string, condition: boolean, detail?: unknown) => {
  if (condition) {
    console.log(`  PASS  ${label}`);
    return;
  }
  console.error(`  FAIL  ${label}`);
  failures.push(label);
  if (detail !== undefined) {
    console.error(`        ${JSON.stringify(detail)}`);
  }
};

/** Asserts the tool call itself succeeded (no `isError` flag in the MCP result). */
const callTool = async (name: string, args: unknown, id: number) => {
  const res = await callRpc('tools/call', { name, arguments: args }, id);
  const result = res.result;
  check(`${name}: response is not an MCP error`, !result?.isError, result);
  return result;
};

const structured = (result: Awaited<ReturnType<typeof callTool>>) =>
  result?.structuredContent as Record<string, unknown> | undefined;

const runTests = async () => {
  console.log('\n--- 1. Testing Handshake (initialize) ---');
  const initRes = await callRpc(
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
    1,
  );
  check('initialize returns serverInfo', initRes.result?.serverInfo?.name === 'manteka-repomix-mcp', {
    serverInfo: initRes.result?.serverInfo,
  });

  console.log('\n--- 2. Testing manteka_get_context ---');
  const context = await callTool('manteka_get_context', { filePath: 'package.json' }, 2);
  check('get_context returns file content', structured(context)?.content?.toString().includes('manteka-repomix'));

  console.log('\n--- 3. Testing manteka_store_note ---');
  const store = await callTool(
    'manteka_store_note',
    { noteName: TEST_NOTE, content: `Marker ${MARKER} stored for the auth token decision.` },
    3,
  );
  check(
    'store_note confirms the write',
    structured(store)?.message?.toString().includes(TEST_NOTE),
    structured(store),
  );

  console.log('\n--- 4. Testing manteka_search_memory ---');
  const search = await callTool('manteka_search_memory', { query: MARKER }, 4);
  check('search_memory finds the stored note', (structured(search)?.results as string[])?.length > 0, {
    results: structured(search)?.results,
  });

  console.log('\n--- 5. Testing manteka_log_history ---');
  const log = await callTool(
    'manteka_log_history',
    { message: `Integration entry ${MARKER}`, category: 'test', filePath: 'scripts/integration-test.ts' },
    5,
  );
  check('log_history confirms the append', structured(log)?.message?.toString().includes('history.log'), {
    structuredContent: structured(log),
  });

  console.log('\n--- 6. Testing manteka_semantic_debug ---');
  const debug = await callTool('manteka_semantic_debug', { query: `auth token ${MARKER}` }, 6);
  const matches = (structured(debug)?.matches ?? []) as Array<{ source: string; relevance: string }>;
  check('semantic_debug correlates the note just stored', matches.some((m) => m.source === `note:${TEST_NOTE}`), {
    matches,
  });
  check('semantic_debug correlates the history entry just logged', matches.some((m) => m.source === 'history.log'), {
    matches,
  });
  check('semantic_debug ranks a full-coverage source as high', matches.some((m) => m.relevance === 'high'), {
    matches,
  });

  console.log('\n--- 7. Testing empty-query rejection ---');
  const emptyQuery = await callRpc(
    'tools/call',
    { name: 'manteka_semantic_debug', arguments: { query: '' } },
    7,
  );
  const emptyRejected =
    emptyQuery.error !== undefined ||
    (emptyQuery.result?.content as Array<{ text?: string }> | undefined)?.[0]?.text?.includes('error');
  check('semantic_debug rejects an empty query', emptyRejected, {
    error: emptyQuery.error,
    content: emptyQuery.result?.content,
  });
};

const main = async () => {
  try {
    await runTests();
  } catch (error) {
    console.error('Integration test aborted:', error);
    failures.push(`aborted: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    child.kill();
    try {
      await restoreMemory();
      console.log('\nCleanup completed (test note and history entry reverted).');
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
      failures.push('cleanup failed');
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} integration check(s) failed:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nAll integration checks passed successfully!');
  process.exit(0);
};

void main();