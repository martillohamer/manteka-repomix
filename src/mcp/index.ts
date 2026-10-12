/**
 * Manteka MCP Module Index
 * Re-exports core types and server functionality for CLI and tool integration
 * ZERO runtime dependencies: Node.js built-ins only
 * Windows-safe paths with node:path
 * TypeScript estricto: cero any, cero !, cero imports no utilizados
 */

export { createAndStartMcpServer } from './server.js';
export type { MCPServer } from './server.js';
export { registerMantekaTools, registerMantekaToolsForSdk } from './tools.js';
// `QualityGateVerdict` and `McpServerConfig` are types, so they must be re-exported
// through `export type` while `verbatimModuleSyntax` is enabled. `McpServer` was
// never exported from types.ts — the native class is `MCPServer` (in server.js) and
// the SDK class lives in mcpServer.ts.
export type { QualityGateVerdict, McpServerConfig } from './types.js';
export {
  manteka_heal,
  manteka_swarm_query,
  manteka_memory_search,
  manteka_quality_gate,
  manteka_doctor,
  manteka_analyze_codebase,
  manteka_smart_slice,
} from './tools.js';
export { JsonRpcError, JsonRpcErrorCodes } from './types.js';