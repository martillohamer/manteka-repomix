/**
 * Manteka CLI - Phase 14: MCP Server & Interactive Interface
 * Modular CLI with subcommands: serve, doctor, version
 * ZERO runtime dependencies: Node.js built-ins only (readline, process, path)
 * Windows-safe paths with node:path (path.join, path.resolve)
 * TypeScript estricto: cero any, cero !, cero imports no utilizados
 */

import process from 'node:process';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

// Import Manteka modules (native imports, no external runtime deps)
import { createAndStartMcpServer } from '../mcp/server.js';
import type { MCPServer } from '../mcp/server.js';
import { registerMantekaTools } from '../mcp/tools.js';
import { getVersion } from '../core/file/packageJsonParse.js';
import { handleError } from '../shared/errorHandle.js';
import { registerMcpInspectCommand, runInspectCommand } from './commands/mcpInspect.js';
import { registerDashboardCommand } from './commands/dashboardCommand.js';
import { runDoctor as runDoctorChecksReport } from './commands/doctor.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerSliceCommand, runSliceCommand } from './commands/slice.js';
import { registerEvolveCommand } from './commands/evolveCommand.js';
import { registerAnalyzeCommand, runAnalyzeCommand } from './commands/analyzeCommand.js';
import { registerStatusCommand } from './commands/statusCommand.js';
import { registerWatchCommand } from './commands/watchCommand.js';

// ===========================
// MCP Server Management
// ===========================

// The awaited instance, not the factory's promise: callers below invoke `.stop()`
// on it, so the handle must hold the resolved server.
let mcpServer: MCPServer | null = null;

/**
 * Starts the MCP Stdio server
 */
const startMcpserver = async (): Promise<void> => {
  try {
    const config = {
      serverName: 'manteka-repomix-mcp',
      serverVersion: await getVersion(),
      root: process.cwd(),
      sandboxed: false,
    };

    const server = await createAndStartMcpServer(config);
    registerMantekaTools(server);
    mcpServer = server;

    // Listen for process exit to graceful shutdown
    process.on('beforeExit', () => {
      mcpServer?.stop();
    });

    process.on('SIGINT', () => {
      mcpServer?.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      mcpServer?.stop();
      process.exit(0);
    });

    console.log('MCP Server started on stdio transport');
    console.log('Available tools: manteka_heal, manteka_swarm_query, manteka_memory_search, manteka_quality_gate');
    console.log('Send JSON-RPC 2.0 messages via stdin, read responses via stdout');
    console.log('Use "manteka doctor" for subsystem health check');
    console.log('Use "manteka version" for version information');
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
};

/**
 * Runs the doctor command - environment health check.
 *
 * Delegates to `commands/doctor`, which owns the diagnostics in `core/doctor/checks`.
 * This file used to carry a second, older implementation that reported per-subsystem
 * status; keeping both meant the binary and the Commander program disagreed about what
 * `manteka doctor` does.
 */
const runDoctor = async (): Promise<void> => {
  await runDoctorChecksReport();
};

/**
 * Runs the version command
 */
const runVersion = async (): Promise<void> => {
  try {
    const version = await getVersion();
    console.log(`Manteka Version: ${version}`);
    console.log(`Package: manteka-repomix`);
    console.log(`CLI: manteka v${version}`);
    console.log('');
    console.log('Subcommands:');
    console.log('  serve    - Start MCP Stdio server transport');
    console.log('  doctor   - Health check of all subsystems');
    console.log('  version  - Show version information');
    console.log('');
    console.log('For MCP integration:');
    console.log('  Send JSON-RPC 2.0 messages via stdin');
    console.log('  Read responses via stdout');
    console.log('  Use tools: manteka_heal, manteka_swarm_query, manteka_memory_search, manteka_quality_gate');
  } catch (error) {
    handleError(error);
    process.exit(1);
  }
};

// ===========================
// CLI Main Loop
// ===========================

/**
 * Main CLI entry point
 */
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No arguments - show help and start interactive mode
    showHelp();
    startInteractiveMode();
    return;
  }

  const command = args[0];

  switch (command) {
    case 'serve':
      await startMcpserver();
      break;
    case 'doctor':
      await runDoctor();
      break;
    case 'version':
      await runVersion();
      break;
    case 'analyze':
      await runAnalyzeCommand(args);
      break;
    case 'inspect':
      runInspectCommand(args);
      break;
    case 'slice':
      await runSliceCommand(args);
      break;
    case 'dashboard':
      // TODO: Implement dashboard command start
      console.log('manteka dashboard command is available but requires further implementation');
      break;
    default:
      console.error(`Unknown command: "${command}"`);
      console.error('');
      showHelp();
      process.exit(1);
  }
};

/**
 * Shows the CLI help message
 */
const showHelp = (): void => {
  console.log('Manteka - Autonomous Code Evolution CLI');
  console.log('========================================');
  console.log('');
  console.log('Usage: manteka <command>');
  console.log('');
  console.log('Commands:');
  console.log('  serve      Start MCP Stdio server transport');
  console.log('  doctor     Diagnose environment health (Node.js, fs permissions, lineage, config)');
  console.log('  version    Show version information');
  console.log('  analyze    Analyze the dependency graph (add --deep for transitive expansion)');
  console.log('  inspect    Inspect the registered MCP tools (add --json for machine output)');
  console.log('  slice      Export the Smart-Slice closure for RAG (--export markdown|json|xml)');
  console.log('  dashboard  Serve the biometric web dashboard (not implemented yet)');
  console.log('');
  console.log('Examples:');
  console.log('  manteka doctor');
  console.log('  manteka analyze . --deep');
  console.log('  manteka inspect --json');
  console.log('  manteka slice src/index.ts --export markdown');
  console.log('  manteka serve');
  console.log('');
  console.log('MCP Integration:');
  console.log('  Send JSON-RPC 2.0 messages via stdin');
  console.log('  Read responses via stdout');
  console.log('  Run "manteka inspect" to list every registered tool');
};

/**
 * Interactive readline mode for sending/receiving JSON-RPC messages
 */
const startInteractiveMode = (): void => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('Manteka Interactive Mode');
  console.log('Type "help" for commands, "exit" to quit');
  console.log('');

  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();

    if (input === 'exit' || input === 'quit') {
      rl.close();
      return;
    }

    if (input === 'help') {
      showHelp();
      rl.prompt();
      return;
    }

    if (input === 'doctor') {
      // We can't run doctor in interactive mode easily, just inform
      console.log('Use "manteka doctor" CLI command for full health check');
      rl.prompt();
      return;
    }

    if (input === 'version') {
      // Can't easily get version here, just inform
      console.log('Use "manteka version" CLI command');
      rl.prompt();
      return;
    }

    if (input.startsWith(' ')) {
      // Try to parse as JSON-RPC message
      try {
        const message = JSON.parse(input);
        console.log('Received JSON-RPC message:', JSON.stringify(message, null, 2));
        console.log('(Note: Interactive mode currently supports CLI commands only)');
      } catch (error) {
        console.log('Invalid JSON. Type "help" for available commands.');
      }
      rl.prompt();
      return;
    }

    console.log(`Unknown command: "${input}"`);
    console.log('Type "help" for available commands');
    rl.prompt();
  }).on('close', () => {
    console.log('\nExiting interactive mode');
    process.exit(0);
  });
};

// ===========================
// Entry Point
// ===========================

// Export for testing
export { main, startMcpserver, runDoctor, runVersion, showHelp, startInteractiveMode };

// Create a CLI program for testing - registers all commands including dashboard
export const createMantekaProgram = (): import('commander').Command => {
  const { Command } = require('commander');
  const program = new Command('manteka');

  program
    .command('serve')
    .description('Start MCP Stdio server transport');

  program
    .command('version')
    .description('Show version information');

  program
    .command('analyze')
    .description('Analyze TypeScript/JavaScript project dependency graph')
    .argument('[root]', 'Root directory to analyze', process.cwd())
    .option(
      '--deep',
      'Perform deep transitive dependency analysis',
      true,
      Boolean
    )
    .option(
      '--output <format>',
      'Output format: text or json',
      'text'
    )

  // Register evolve command
  registerEvolveCommand(program);

  // Register status command
  registerStatusCommand(program);

  // Register watch command
  registerWatchCommand(program);

  // Register MCP inspect command
  registerMcpInspectCommand(program);

  // Register slice command
  registerSliceCommand(program);

  // Register dashboard command
  registerDashboardCommand(program);

  // Register doctor command
  registerDoctorCommand(program);

  return program;
};

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    handleError(error);
    process.exit(1);
  });
}
