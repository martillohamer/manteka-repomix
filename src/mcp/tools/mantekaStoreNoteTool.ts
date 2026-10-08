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
 * Register the Manteka note storage tool
 */
export const registerMantekaStoreNoteTool = (
  mcpServer: McpServer,
  config: McpServerConfig = { sandboxed: false, root: process.cwd() },
) => {
  mcpServer.registerTool(
    'manteka_store_note',
    {
      title: 'Store Note',
      description: 'Store a note in the local memory directory.',
      inputSchema: z.object({
        noteName: z.string().describe('The name of the note (e.g., "my-note.md")'),
        content: z.string().describe('The content of the note'),
      }),
      outputSchema: z.object({
        message: z.string(),
      }),
    },
    async ({ noteName, content }) => {
      try {
        const { absPath, displayPath } = await resolveToolPath(config, path.join(MEMORY_DIR, noteName));
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content, 'utf8');
        return buildMcpToolSuccessResponse({ message: `Note stored successfully at ${displayPath}` });
      } catch (error) {
        if (config.sandboxed) return buildSandboxErrorResponse(error, noteName);
        return buildMcpToolErrorResponse({ errorMessage: String(error) });
      }
    },
  );
};
