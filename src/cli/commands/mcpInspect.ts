/**
 * manteka mcp inspect: Inspecciona y lista todas las herramientas MCP registradas
 *
 * Muestra en consola todas las herramientas registradas en el servidor MCP
 * con sus nombres, descripciones y esquemas JSON Schema de parámetros.
 *
 * Soporta la opción --json para emitir la estructura JSON completa y limpia.
 */
import { Command } from 'commander';
import { registerMantekaTools } from '../../mcp/tools.js';

interface McpToolInfo {
  description: string;
  parameters: Record<string, string>;
}

// Registry of MCP tools with their descriptions and parameters
const MCP_TOOLS_INFO: Record<string, McpToolInfo> = {
  manteka_heal: {
    description: 'Heals a file with TODO/FIXME diagnostics',
    parameters: { file: 'Path to file', description: 'Description', maxAttempts: 'Max attempts' },
  },
  manteka_swarm_query: {
    description: 'Queries the swarm orchestrator',
    parameters: { query: 'Query string', strategy: 'Swarm strategy' },
  },
  manteka_memory_search: {
    description: 'Searches memory for patterns',
    parameters: { query: 'Search query', namespace: 'Memory namespace', limit: 'Max results' },
  },
  manteka_quality_gate: {
    description: 'Evaluates quality gate based on mutation score',
    parameters: { mutationScore: 'Mutation score (0-1)', threshold: 'Quality threshold (0-1)' },
  },
  manteka_analyze_codebase: {
    description: 'Analyzes TypeScript/JavaScript project dependency graph',
    parameters: { root: 'Root directory', deep: 'Deep analysis', output: 'Output format' },
  },
  manteka_doctor: {
    description: 'Diagnoses environment health (Node version, fs permissions, lineage, config)',
    parameters: {},
  },
  manteka_smart_slice: {
    description: 'Exports the Smart-Slice dependency closure as RAG-ready markdown, json or xml',
    parameters: {
      exportFormat: 'Optional export format: markdown, json or xml (default: markdown)',
      entry: 'Entry point to trace dependencies from',
      root: 'Root directory',
      depth: 'Maximum dependency depth',
    },
  },
};

/**
 * Get tool description by name
 */
function getToolDescription(name: string): string {
  return MCP_TOOLS_INFO[name]?.description || 'Unknown tool';
}

/**
 * Get tool parameters by name
 */
function getToolParameters(name: string): Record<string, string> {
  return MCP_TOOLS_INFO[name]?.parameters || {};
}

/**
 * Renders the MCP tool registry as text.
 */
function printToolSummary(): void {
  console.log('🔍 Manteka MCP Tools Inspection');
  console.log('================================');
  console.log();

  const tools = Object.keys(MCP_TOOLS_INFO).map((name) => ({
    name,
    description: getToolDescription(name),
  }));

  tools.forEach((tool, index) => {
    console.log(`  ${index + 1}. ${tool.name}`);
    console.log(`     ${tool.description}`);
  });

  console.log();
  console.log('Usage: manteka inspect --json');
}

/**
 * Snapshot of the registry, exposed for tests and for callers embedding the CLI.
 */
export const listMcpTools = (): Array<{
  name: string;
  description: string;
  parameters: Record<string, string>;
}> =>
  Object.keys(MCP_TOOLS_INFO).map((name) => ({
    name,
    description: getToolDescription(name),
    parameters: getToolParameters(name),
  }));

/**
 * Imprime el registro de herramientas, en texto o como JSON.
 *
 * Compartido por la ruta de Commander y por el dispatcher `main()`, para que ambas
 * muestren exactamente la misma salida.
 */
export function printMcpInspection(asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(listMcpTools(), null, 2));
  } else {
    printToolSummary();
  }
}

/**
 * Punto de entrada para el dispatcher legacy `main()`.
 *
 * `src/cli/index.ts` despacha `manteka inspect` por su propio switch en lugar de por
 * Commander, así que aquí se reconstruyen los argumentos crudos.
 */
export function runInspectCommand(args: string[]): void {
  printMcpInspection(args.includes('--json'));
}

/**
 * Registers the `inspect` subcommand on the given Commander program
 *
 * @param program - Commander Command instance to register on
 */
export function registerMcpInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Inspect MCP registered tools')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      printMcpInspection(options.json === true);
    });
}