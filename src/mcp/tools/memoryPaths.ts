import path from 'node:path';
import type { McpServerConfig } from '../mcpServer.js';
import { resolveToolPath } from './mcpToolRuntime.js';

export const MEMORY_DIR = '.manteka-memory';

/**
 * Resolve the memory directory for both modes. Non-sandbox `resolveToolPath` returns
 * the input verbatim, so an absolute join against `config.root` is what keeps the
 * memory (and the tools' reads of it) anchored to the server working directory
 * instead of the process cwd.
 */
export const resolveMemoryDirectory = async (config: McpServerConfig): Promise<string> => {
  const { absPath } = await resolveToolPath(config, MEMORY_DIR);
  return path.isAbsolute(absPath) ? absPath : path.resolve(config.root, absPath);
};
