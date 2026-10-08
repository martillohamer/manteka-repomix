import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger } from '../../shared/logger.js';
import type { McpServerConfig } from '../mcpServer.js';
import { buildMcpToolErrorResponse, buildMcpToolSuccessResponse, buildSandboxErrorResponse } from './mcpToolRuntime.js';
import {
  buildSemanticSummary,
  collectHealthReportMatches,
  collectHistoryMatches,
  collectNoteMatches,
  readMemoryDirectoryEntries,
  relevanceFor,
  type SemanticMatchCandidate,
  sortMatchesByTime,
  tokenizeQuery,
} from './memoryCorrelation.js';
import { resolveMemoryDirectory } from './memoryPaths.js';

/**
 * Register the Manteka semantic time-travel debugging tool
 */
export const registerMantekaSemanticDebugTool = (
  mcpServer: McpServer,
  config: McpServerConfig = { sandboxed: false, root: process.cwd() },
) => {
  mcpServer.registerTool(
    'manteka_semantic_debug',
    {
      title: 'Semantic Time-Travel Debugging',
      description:
        'Cross-correlate the history log, persisted session notes and the latest health report to reconstruct why and when past architectural changes or decisions happened.',
      inputSchema: z.object({
        query: z.string().min(1).describe('The debugging question about past decisions, regressions or changes'),
      }),
      outputSchema: z.object({
        query: z.string(),
        matches: z.array(
          z.object({
            source: z.string(),
            content: z.string(),
            relevance: z.enum(['high', 'medium', 'low']),
            timestamp: z.string().nullable(),
          }),
        ),
        summary: z.string(),
      }),
    },
    async ({ query }): Promise<CallToolResult> => {
      try {
        const memoryDir = await resolveMemoryDirectory(config);
        const entries = await readMemoryDirectoryEntries(memoryDir);

        const queryTerms = tokenizeQuery(query);
        if (queryTerms.length === 0) {
          return buildMcpToolSuccessResponse({
            query,
            matches: [],
            summary: `No searchable terms extracted from "${query}". Add concrete keywords to correlate past activity.`,
          });
        }

        const candidates: SemanticMatchCandidate[] = [
          ...(await collectHistoryMatches(entries, memoryDir, queryTerms)),
          ...(await collectNoteMatches(entries, memoryDir, queryTerms)),
          ...(await collectHealthReportMatches(memoryDir, queryTerms)),
        ];

        const matches = sortMatchesByTime(candidates).map(({ termsMatched, ...match }) => ({
          ...match,
          relevance: relevanceFor(termsMatched / queryTerms.length),
        }));

        return buildMcpToolSuccessResponse({
          query,
          matches,
          summary: buildSemanticSummary(query, matches.length, entries.hasHistory),
        });
      } catch (error) {
        logger.error(`Error in manteka_semantic_debug tool: ${error}`);
        if (config.sandboxed) return buildSandboxErrorResponse(error, query);
        const message = error instanceof Error ? error.message : String(error);
        return buildMcpToolErrorResponse({ errorMessage: `Error: ${message}` });
      }
    },
  );
};
