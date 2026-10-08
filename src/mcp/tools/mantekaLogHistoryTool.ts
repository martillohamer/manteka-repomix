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
 * Register the Manteka history log tool
 */
export const registerMantekaLogHistoryTool = (
  mcpServer: McpServer,
  config: McpServerConfig = { sandboxed: false, root: process.cwd() },
) => {
  mcpServer.registerTool(
    'manteka_log_history',
    {
      title: 'Log History',
      description: 'Log a change or context entry to the project history.',
      inputSchema: z.object({
        message: z.string().describe('The log message or change description'),
        category: z.string().optional().describe('Log category (e.g., "fix", "feat", "note")'),
        filePath: z.string().optional().describe('Associated file path, if any'),
      }),
      outputSchema: z.object({
        message: z.string(),
      }),
    },
    async ({ message, category, filePath }) => {
      try {
        const { absPath } = await resolveToolPath(config, MEMORY_DIR);
        const logPath = path.join(absPath, 'history.log');

        await fs.mkdir(absPath, { recursive: true });

        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${category || 'info'}] ${message}${filePath ? ` (file: ${filePath})` : ''}\n`;

        await fs.appendFile(logPath, logEntry, 'utf8');

        return buildMcpToolSuccessResponse({ message: `Log entry added to history.log` });
      } catch (error) {
        if (config.sandboxed) return buildSandboxErrorResponse(error, MEMORY_DIR);
        return buildMcpToolErrorResponse({ errorMessage: String(error) });
      }
    },
  );
};
