import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, '../bin/manteka-mcp.cjs');

console.log(`Starting MCP server from: ${binPath}`);

const child = spawn('node', [binPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

child.stderr.on('data', (data) => {
  console.error(`MCP Stderr: ${data}`);
});

child.stdout.on('data', (data) => {
  console.log(`MCP Stdout: ${data}`);
});

// MCP Initialization
const initializeRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
};

// Call manteka_get_context
const callToolRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'manteka_get_context',
    arguments: { filePath: 'package.json' },
  },
};

child.stdin.write(JSON.stringify(initializeRequest) + '\n');
child.stdin.write(JSON.stringify(callToolRequest) + '\n');

setTimeout(() => {
  child.kill();
  process.exit(0);
}, 3000);
