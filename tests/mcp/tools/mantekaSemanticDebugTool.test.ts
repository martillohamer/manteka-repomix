import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpServerConfig } from '../../../src/mcp/mcpServer.js';
import { registerMantekaSemanticDebugTool } from '../../../src/mcp/tools/mantekaSemanticDebugTool.js';

const MEMORY_DIR = '.manteka-memory';

interface RegisteredTool {
  name: string;
  config: { title?: string; description?: string };
  handler: (args: never) => Promise<CallToolResult>;
}

interface SemanticMatch {
  source: string;
  content: string;
  relevance: string;
  timestamp: string | null;
}

interface SemanticDebugResult {
  query: string;
  matches: SemanticMatch[];
  summary: string;
}

const createHarness = (config: McpServerConfig): RegisteredTool[] => {
  const registered: RegisteredTool[] = [];
  const server = {
    registerTool(name: string, toolConfig: unknown, handler: (args: never) => Promise<CallToolResult>) {
      registered.push({ name, config: toolConfig as RegisteredTool['config'], handler });
      return this;
    },
  } as unknown as McpServer;

  registerMantekaSemanticDebugTool(server, config);
  return registered;
};

const textOf = (result: CallToolResult): string => {
  const first = result.content?.[0];
  return first?.type === 'text' ? first.text : '';
};

const invokeTool = async (
  registered: RegisteredTool[],
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> => {
  const tool = registered.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool "${name}" was not registered`);
  }
  return tool.handler(args as never);
};

const callTool = async (
  registered: RegisteredTool[],
  name: string,
  args: Record<string, unknown>,
): Promise<SemanticDebugResult> => {
  const result = await invokeTool(registered, name, args);
  return result.structuredContent as unknown as SemanticDebugResult;
};

describe('manteka_semantic_debug', () => {
  let root: string;
  let memoryDir: string;
  let config: McpServerConfig;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-semantic-'));
    memoryDir = path.join(root, MEMORY_DIR);
    await fs.mkdir(memoryDir, { recursive: true });
    // Sandbox mode so every path resolves inside the temp root.
    config = { sandboxed: true, root };
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('is registered with a title and description', () => {
    const registered = createHarness(config);
    const tool = registered.find((candidate) => candidate.name === 'manteka_semantic_debug');

    expect(tool).toBeDefined();
    expect(tool?.config.title).toBe('Semantic Time-Travel Debugging');
    expect(tool?.config.description).toBeTruthy();
  });

  it('correlates history, notes and health report, ordered chronologically', async () => {
    await fs.writeFile(
      path.join(memoryDir, 'history.log'),
      '[2025-01-01T10:00:00.000Z] [fix] auth token refresh regression in src/auth/token.ts\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(memoryDir, 'decisions.md'),
      'We decided to rotate the auth signing key every 30 days.\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(memoryDir, 'health-report.json'),
      JSON.stringify({
        timestamp: '2025-01-03T12:00:00.000Z',
        codeSmells: [{ file: 'src/auth/token.ts', issue: 'auth module too large' }],
      }),
      'utf8',
    );

    const result = await callTool(createHarness(config), 'manteka_semantic_debug', { query: 'auth' });

    // Chronological, NOT source order: history (Jan 1) -> report (Jan 3) -> note (mtime = now).
    expect(result.matches.map((match) => match.source)).toEqual([
      'history.log',
      'health-report.json',
      'note:decisions.md',
    ]);
    expect(result.matches[0].content).toContain('auth token refresh regression');
    expect(result.matches[0].timestamp).toBe('2025-01-01T10:00:00.000Z');
    expect(result.matches[1].timestamp).toBe('2025-01-03T12:00:00.000Z');
  });

  it('matches individual query terms without requiring the exact phrase', async () => {
    await fs.writeFile(
      path.join(memoryDir, 'decisions.md'),
      'The token endpoint needs retry logic because the upstream provider times out.\n',
      'utf8',
    );

    const result = await callTool(createHarness(config), 'manteka_semantic_debug', {
      query: 'token retry backoff policy',
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].source).toBe('note:decisions.md');
  });

  it('ranks relevance by how many query terms a source covers', async () => {
    await fs.writeFile(
      path.join(memoryDir, 'full.md'),
      'token retry and backoff settings live in the token module.\n',
      'utf8',
    );
    await fs.writeFile(path.join(memoryDir, 'partial.md'), 'backoff is configured in config.\n', 'utf8');

    const result = await callTool(createHarness(config), 'manteka_semantic_debug', {
      query: 'token retry backoff',
    });

    const bySource = new Map(result.matches.map((match) => [match.source, match.relevance]));
    expect(bySource.get('note:full.md')).toBe('high');
    expect(bySource.get('note:partial.md')).toBe('low');
    expect(result.matches[0].source).toBe('note:full.md');
  });

  it('ignores files that are not notes', async () => {
    await fs.writeFile(path.join(memoryDir, 'notes.txt'), 'auth token notes live here\n', 'utf8');

    const result = await callTool(createHarness(config), 'manteka_semantic_debug', { query: 'auth token' });

    expect(result.matches).toEqual([]);
  });

  it('returns an explanatory summary when nothing matches', async () => {
    const result = await callTool(createHarness(config), 'manteka_semantic_debug', { query: 'nonexistent-topic' });

    expect(result.matches).toEqual([]);
    expect(result.summary).toContain('nonexistent-topic');
  });

  it('returns an explanatory summary when the memory directory does not exist', async () => {
    await fs.rm(memoryDir, { recursive: true, force: true });

    const result = await callTool(createHarness(config), 'manteka_semantic_debug', { query: 'auth' });

    expect(result.matches).toEqual([]);
    expect(result.summary).toContain('auth');
  });

  it('rejects an empty query', async () => {
    const registered = createHarness(config);
    const tool = registered.find((candidate) => candidate.name === 'manteka_semantic_debug');
    const schema = (tool?.config as { inputSchema?: { safeParse?: (value: unknown) => { success: boolean } } })
      ?.inputSchema;

    expect(schema?.safeParse?.({ query: '' }).success).toBe(false);
  });

  describe('sandbox isolation', () => {
    let outsideDir: string;
    let fileSymlinkError: Error | null = null;

    beforeEach(async () => {
      outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-outside-'));
      await fs.writeFile(path.join(outsideDir, 'leak.md'), 'auth token leaked from outside the workspace\n', 'utf8');
      try {
        await fs.symlink(path.join(outsideDir, 'leak.md'), path.join(memoryDir, 'leak.md'), 'file');
      } catch (error) {
        // Windows without developer mode cannot create file symlinks.
        fileSymlinkError = error as Error;
      }
    });

    afterEach(async () => {
      await fs.rm(outsideDir, { recursive: true, force: true });
      fileSymlinkError = null;
    });

    it('does not follow note symlinks that escape the workspace root', async ({ skip }) => {
      if (fileSymlinkError) {
        skip();
        return;
      }

      const result = await callTool(createHarness(config), 'manteka_semantic_debug', { query: 'auth token' });

      expect(result.matches).toEqual([]);
    });

    it('does not traverse directory junctions that escape the workspace root', async () => {
      await fs.symlink(outsideDir, path.join(memoryDir, 'linked'), 'junction');

      const result = await callTool(createHarness(config), 'manteka_semantic_debug', { query: 'auth token' });

      expect(result.matches).toEqual([]);
    });

    it('reports a path-free error when the memory directory is not a directory', async () => {
      await fs.rm(memoryDir, { recursive: true, force: true });
      await fs.writeFile(memoryDir, 'not a directory', 'utf8');

      const registered = createHarness(config);
      const result = await invokeTool(registered, 'manteka_semantic_debug', { query: 'auth' });
      const text = textOf(result);

      expect(result.isError).toBe(true);
      expect(text).toContain('not a directory');
      expect(text).not.toContain(root);
    });
  });
});
