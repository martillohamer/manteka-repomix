#!/usr/bin/env node

(async () => {
  try {
    const { runMcpServer } = await import('../lib/mcp/mcpServer.js');
    await runMcpServer();
  } catch (error) {
    console.error('Fatal Error starting MCP server:', error);
    process.exit(1);
  }
})();
