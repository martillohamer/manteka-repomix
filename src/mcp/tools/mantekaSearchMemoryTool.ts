import fs from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpServerConfig } from '../mcpServer.js';
import {
  buildMcpToolErrorResponse,
  buildMcpToolSuccessResponse,
  buildSandboxErrorResponse,
  resolveToolPath,
} from './mcpToolRuntime.js';
import { MEMORY_DIR } from './memoryPaths.js';

/**
 * Register the Manteka memory search tool
 */
export const registerMantekaSearchMemoryTool = (
  mcpServer: McpServer,
  config: McpServerConfig = { sandboxed: false, root: process.cwd() },
) => {
  mcpServer.registerTool(
    'manteka_search_memory',
    {
      title: 'Search Memory',
      description: 'Search for content within stored notes.',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
      }),
      outputSchema: z.object({
        results: z.array(z.string()),
      }),
    },
    async ({ query }) => {
      try {
        const { absPath } = await resolveToolPath(config, MEMORY_DIR);
        try {
          await fs.access(absPath);
        } catch {
          return buildMcpToolSuccessResponse({ results: [] });
        }

        const files = await fs.readdir(absPath);
        const results = [];

        for (const file of files) {
          const filePath = path.join(absPath, file);
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            const content = await fs.readFile(filePath, 'utf8');
            if (content.includes(query)) {
              results.push(`Found in ${file}`);
            }
          }
        }
        return buildMcpToolSuccessResponse({ results });
      } catch (error) {
        if (config.sandboxed) return buildSandboxErrorResponse(error, MEMORY_DIR);
        return buildMcpToolErrorResponse({ errorMessage: String(error) });
      }
    },
  );
};
