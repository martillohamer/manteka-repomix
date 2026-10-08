import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../shared/logger.js';
import { MEMORY_DIR } from './memoryPaths.js';

export interface SessionPrediction {
  recommendedFiles: string[];
  primaryFocus: string;
  recentActivitySummary: string;
  confidenceScore: number;
}

/**
 * Predicts next session context by scanning notes and history.log
 */
export const predictSessionContext = async (rootPath: string): Promise<SessionPrediction> => {
  const prediction: SessionPrediction = {
    recommendedFiles: [],
    primaryFocus: 'General Maintenance',
    recentActivitySummary: 'No recent history found.',
    confidenceScore: 0.5,
  };

  try {
    const memoryAbsPath = path.join(rootPath, MEMORY_DIR);

    // 1. Read history.log if present
    let historyLines: string[] = [];
    try {
      const logContent = await fs.readFile(path.join(memoryAbsPath, 'history.log'), 'utf8');
      historyLines = logContent.split('\n').filter(Boolean).slice(-10); // last 10 entries
      if (historyLines.length > 0) {
        prediction.recentActivitySummary = historyLines[historyLines.length - 1];
        prediction.confidenceScore = 0.8;
      }
    } catch {
      // Ignore if missing
    }

    // 2. Scan notes for file paths & focus areas
    const fileScores = new Map<string, number>();
    try {
      const files = await fs.readdir(memoryAbsPath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await fs.readFile(path.join(memoryAbsPath, file), 'utf8');
          // Simple regex to match code paths like src/... or tests/...
          const pathMatches = content.match(/(?:src|tests|bin|scripts)\/[\w\-_./]+\.\w+/g) || [];
          for (const p of pathMatches) {
            fileScores.set(p, (fileScores.get(p) || 0) + 1);
          }

          if (content.toLowerCase().includes('auth')) prediction.primaryFocus = 'Authentication & Security';
          else if (content.toLowerCase().includes('mcp')) prediction.primaryFocus = 'MCP & Memory Stream Architecture';
          else if (content.toLowerCase().includes('refactor')) prediction.primaryFocus = 'Refactoring & Code Health';
        }
      }
    } catch {
      // Ignore if missing
    }

    prediction.recommendedFiles = Array.from(fileScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([filePath]) => filePath)
      .slice(0, 5);
  } catch (error) {
    logger.error(`Error in predictSessionContext: ${error}`);
  }

  return prediction;
};
