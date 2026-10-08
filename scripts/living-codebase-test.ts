import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, '../bin/manteka-mcp.cjs');

console.log(`Starting Living Codebase Integration Test from: ${binPath}`);

const child = spawn('node', [binPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

const pending = new Map<number, (res: any) => void>();
let buffer = '';

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const response = JSON.parse(line);
      if (response.id && pending.has(response.id)) {
        const resolve = pending.get(response.id)!;
        pending.delete(response.id);
        resolve(response);
      }
    } catch {
      // Ignore partial chunks
    }
  }
});

const callRpc = (method: string, params: any, id: number): Promise<any> => {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const request = { jsonrpc: '2.0', id, method, params };
    child.stdin.write(JSON.stringify(request) + '\n');
  });
};

const runLivingCodebaseTest = async () => {
  try {
    console.log('\n--- 1. Testing Initialize Handshake ---');
    await callRpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} }, 1);

    console.log('\n--- 2. Testing manteka_analyze_code_health ---');
    const healthRes = await callRpc('tools/call', {
      name: 'manteka_analyze_code_health',
      arguments: { targetDirectory: '.' },
    }, 2);
    
    console.log('Health Analysis Result:', JSON.stringify(healthRes.result?.structuredContent || healthRes.result, null, 2));

    console.log('\nLiving Codebase integration check passed successfully! ✨');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    child.kill();
    try {
      const memoryDir = join(__dirname, '../.manteka-memory');
      await fs.rm(memoryDir, { recursive: true, force: true });
      console.log('Cleanup completed.');
    } catch (err) {
      console.error('Cleanup error:', err);
    }
    process.exit(0);
  }
};

runLivingCodebaseTest();
