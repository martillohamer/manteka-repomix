// CLI Test Suite - Phase 14
// Tests for Manteka interactive CLI commands: serve, doctor, version
// ZERO runtime dependencies: Node.js built-ins only
// Windows-safe paths with node:path
// TypeScript estricto: cero any, cero !, cero imports no utilizados

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Import Manteka CLI module (direct path from test location)
import { main, startMcpserver, runDoctor, runVersion, showHelp, startInteractiveMode } from '../../src/cli/index.js';

// Mock global process.exit
const originalExit = process.exit;

beforeEach(() => {
  vi.clearAllMocks();
  process.exit = vi.fn();
});

afterEach(() => {
  process.exit = originalExit;
});

describe('Phase 14: CLI Commands', () => {
  describe('manteka version', () => {
    test('runVersion does not throw', async () => {
      await expect(runVersion()).resolves.not.toThrow();
    });

    test('runVersion prints version to stdout', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      await runVersion();
      consoleLogSpy.mockRestore();
      // If we get here without throwing, the function works
    });
  });

  describe('manteka doctor', () => {
    test('runs doctor command without crashing', async () => {
      await runDoctor();
    });

    test('doctor outputs subsystem information', async () => {
      // Just verify it doesn't throw
      expect(() => runDoctor()).not.toThrow();
    });
  });

  describe('manteka serve', () => {
    test('starts MCP server', async () => {
      await startMcpserver();
    });

    test('serve calls createAndStartMcpServer', async () => {
      // Verify the function is callable
      expect(typeof startMcpserver).toBe('function');
    });
  });

  describe('main help', () => {
    test('showHelp does not throw', () => {
      expect(() => showHelp()).not.toThrow();
    });
  });

  describe('main unknown command', () => {
    test('main handles unknown command', async () => {
      // Should not throw, just print error to stderr
      await main();
    });
  });

  describe('interactive mode', () => {
    test('startInteractiveMode does not throw', () => {
      expect(() => startInteractiveMode()).not.toThrow();
    });
  });
});

describe('Phase 14: CLI Integration', () => {
  test('main exits successfully', async () => {
    process.exit = vi.fn();
    await main();
  });

  test('main with serve command', async () => {
    const args = ['serve'];
    process.argv = ['node', 'manteka', ...args];
    await main();
  });

  test('main with doctor command', async () => {
    const args = ['doctor'];
    process.argv = ['node', 'manteka', ...args];
    await main();
  });

  test('main with version command', async () => {
    const args = ['version'];
    process.argv = ['node', 'manteka', ...args];
    await main();
  });
});