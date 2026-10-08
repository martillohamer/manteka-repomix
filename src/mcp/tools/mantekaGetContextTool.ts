import fs from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger } from '../../shared/logger.js';
import type { McpServerConfig } from '../mcpServer.js';
import {
  buildMcpToolErrorResponse,
  buildMcpToolSuccessResponse,
  buildSandboxErrorResponse,
  resolveToolPath,
} from './mcpToolRuntime.js';

/**
 * Register the Manteka smart-slice context tool
 */
export const registerMantekaGetContextTool = (
  mcpServer: McpServer,
  config: McpServerConfig = { sandboxed: false, root: process.cwd() },
) => {
  mcpServer.registerTool(
    'manteka_get_context',
    {
      title: 'Get Manteka Context',
      description: 'Retrieve a smart-slice context for a file.',
      inputSchema: z.object({
        filePath: z.string().describe('The file path to retrieve context from'),
      }),
      outputSchema: z.object({
        content: z.string().describe('The smart-slice context content'),
      }),
    },
    async ({ filePath }): Promise<CallToolResult> => {
      try {
        const { absPath, displayPath } = await resolveToolPath(config, filePath);
        const fileContent = await fs.readFile(absPath, 'utf8');
        const context = `--- SMART-SLICE START: ${displayPath} ---\n${fileContent}\n--- SMART-SLICE END ---\n`;
        return buildMcpToolSuccessResponse({ content: context });
      } catch (error) {
        logger.error(`Error in manteka_get_context tool: ${error}`);
        if (config.sandboxed) return buildSandboxErrorResponse(error, filePath);
        const message = error instanceof Error ? error.message : String(error);
        return buildMcpToolErrorResponse({ errorMessage: `Error: ${message}` });
      }
    },
  );
};
