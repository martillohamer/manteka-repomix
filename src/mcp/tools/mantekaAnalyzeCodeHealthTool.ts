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
import { predictSessionContext } from './sessionPrediction.js';

/**
 * Register the Manteka codebase health analysis tool
 */
export const registerMantekaAnalyzeCodeHealthTool = (
  mcpServer: McpServer,
  config: McpServerConfig = { sandboxed: false, root: process.cwd() },
) => {
  mcpServer.registerTool(
    'manteka_analyze_code_health',
    {
      title: 'Analyze Code Health',
      description:
        'Scan codebase for technical debt, large files, and smells, generating a health report and session prediction.',
      inputSchema: z.object({
        targetDirectory: z.string().optional().describe('Target directory to scan (relative to root)'),
      }),
      outputSchema: z.object({
        reportPath: z.string(),
        codeSmellsCount: z.number(),
        sessionPrediction: z.any(),
      }),
    },
    async ({ targetDirectory }) => {
      try {
        const scanDirInput = targetDirectory || '.';
        const { absPath: scanDirAbs } = await resolveToolPath(config, scanDirInput);

        const codeSmells: Array<{ file: string; issue: string; severity: 'low' | 'medium' | 'high' }> = [];

        // Recursive file walker avoiding heavy dirs
        const walk = async (dir: string) => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (!['node_modules', '.git', 'lib', 'dist', 'coverage', '.manteka-memory'].includes(entry.name)) {
                await walk(fullPath);
              }
            } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json)$/.test(entry.name)) {
              try {
                const content = await fs.readFile(fullPath, 'utf8');
                const lines = content.split('\n');

                // Smell 1: Excessively long file (> 400 lines)
                if (lines.length > 400) {
                  codeSmells.push({
                    file: path.relative(config.root, fullPath),
                    issue: `File exceeds 400 lines (${lines.length} lines). Consider modularizing.`,
                    severity: 'medium',
                  });
                }

                // Smell 2: Excessive TODO comments
                const todoCount = (content.match(/TODO/g) || []).length;
                if (todoCount > 3) {
                  codeSmells.push({
                    file: path.relative(config.root, fullPath),
                    issue: `High density of TODO comments (${todoCount} found).`,
                    severity: 'low',
                  });
                }
              } catch {
                // Ignore read errors on individual files
              }
            }
          }
        };

        await walk(scanDirAbs);

        // Run predictive session analysis
        const sessionPrediction = await predictSessionContext(config.root);

        const healthReport = {
          timestamp: new Date().toISOString(),
          totalSmells: codeSmells.length,
          codeSmells,
          sessionPrediction,
        };

        // Save report to .manteka-memory/health-report.json
        const { absPath: memoryAbs } = await resolveToolPath(config, MEMORY_DIR);
        await fs.mkdir(memoryAbs, { recursive: true });
        const reportPath = path.join(memoryAbs, 'health-report.json');
        await fs.writeFile(reportPath, JSON.stringify(healthReport, null, 2), 'utf8');

        return buildMcpToolSuccessResponse({
          reportPath: path.relative(config.root, reportPath),
          codeSmellsCount: codeSmells.length,
          sessionPrediction,
        });
      } catch (error) {
        if (config.sandboxed) return buildSandboxErrorResponse(error, targetDirectory || '.');
        return buildMcpToolErrorResponse({ errorMessage: String(error) });
      }
    },
  );
};
