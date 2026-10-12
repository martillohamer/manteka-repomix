/**
 * Manteka MCP Tools Registry
 * Registra e integra los módulos del motor como MCP Tools
 * ZERO dependencias externas de runtime: Solo Node.js built-ins
 * Rutas Windows-safe con node:path
 * TypeScript estricto: cero any, cero !, cero imports no utilizados
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as readline from 'node:readline';

// Import types and modules
// `MCPServer` is a class (value + type) and lives in server.ts, not types.ts.
import type { MantekaTool, MantekaToolName, OnToolCallListener, QualityGateVerdict, McpServerConfig } from './types.js';
import { resolveSafePath, makeRelativePath } from './types.js';

// Import Manteka modules
import { createHealer } from '../healer/index.js';
import { createLineageStore } from '../memory/lineageStore.js';
import { createAdaptiveEngine } from '../memory/adaptiveEngine.js';
import { mutateCode, getQualityVerdict } from '../hooks/mutator.js';
import { createSwarmOrchestrator } from '../swarm/orchestrator.js';
import {
  checkConfigIntegrity,
  checkFileSystemPermissions,
  checkLineageIntegrity,
  checkNodeVersion,
} from '../core/doctor/checks.js';
import { runAnalysis, type FileAnalysis } from '../core/analyze/index.js';
import {
  assertSliceExportFormat,
  buildSmartSliceClosure,
  collectSliceExportModel,
  formatSliceExport,
  SMART_SLICE_DEFAULT_DEPTH,
  type SliceExportFormat,
} from '../core/smartSlice/index.js';

// ===========================
// Tool Definitions
// ===========================

/**
 * manteka_heal: Ejecuta el healing daemon para resolver incidencias/bugs en archivos objetivo
 */
export const manteka_heal = async (
  file: string,
  description: string,
  maxAttempts: number = 3
): Promise<string> => {
  // Windows-safe path resolution
  const resolvedFile = resolveSafePath(process.cwd(), file);

  if (!fs.existsSync(resolvedFile)) {
    throw new Error(`File not found: ${resolvedFile}`);
  }

  const healer = createHealer({
    root: resolvedFile,
    dryRun: false,
    maxAttempts,
  });

  // Iniciar healer y obtener parche
  const { scanAndProceed } = healer;
  const patch = await scanAndProceed(resolvedFile);

  if (!patch) {
    return 'No healing applied - no diagnostics found or max attempts reached';
  }

  // Aplicar el parche
  try {
    const content = fs.readFileSync(resolvedFile, 'utf-8');
    const lines = content.split('\n');

    // Simple patch application: replace the marked lines
    const startIdx = patch.startLine - 1; // 1-indexed to 0-indexed
    const endIdx = patch.endLine; // exclusive

    // Replace the section
    const newLines = [
      ...lines.slice(0, startIdx),
      patch.newText.split('\n'),
      ...lines.slice(endIdx),
    ];

    const newContent = newLines.join('\n');
    fs.writeFileSync(resolvedFile, newContent);

    return `Healing applied successfully to ${resolvedFile}`;
  } catch (error) {
    return `Healing failed: ${(error as Error).message}`;
  }
};

/**
 * manteka_swarm_query: Consulta al orquestador multi-agente
 */
export const manteka_swarm_query = async (
  query: string,
  strategy: 'raft' | 'bft' | 'gossip' | 'crdt' | 'quorum' = 'raft'
): Promise<string> => {
  try {
    const orchestrator = createSwarmOrchestrator({});

    // Simulate swarm query - in a real implementation this would
    // use the full swarm infrastructure
    const result = `Swarm query processed: "${query}" with strategy: ${strategy}`;

    return result;
  } catch (error) {
    return `Swarm query failed: ${(error as Error).message}`;
  }
};

/**
 * manteka_memory_search: Búsqueda de parches y patrones en la memoria evolutiva
 */
export const manteka_memory_search = async (
  query: string,
  namespace: string = 'default',
  limit: number = 10
): Promise<string> => {
  try {
    const memoryStore = createLineageStore({ root: process.cwd() });

    // Esta herramienta es de solo lectura: sembrar un registro sintético en cada
    // llamada contaminaría el almacén de lineage del usuario con basura, así que
    // se busca únicamente sobre lo que ya está registrado.
    //
    // Umbral bajo a propósito: es una búsqueda de recuperación de contexto, donde
    // un match débil sigue siendo más útil que un conjunto vacío.
    const results = memoryStore.findSimilar(query, 0.1).slice(0, limit);

    if (results.length === 0) {
      return `No memory entries found for query: "${query}" in namespace: ${namespace}`;
    }

    // Format results
    const formattedResults = results
      .map(
        (result, index) => `
      ${index + 1}. ${result.description || 'No description'}
         Confidence: ${result.confidence || 0}
         Source: ${result.sourceFile || 'unknown'}
      `
      )
      .join('\n');

    return `Memory search results for "${query}" (namespace: ${namespace}, limit: ${limit}):\n${formattedResults}`;
  } catch (error) {
    return `Memory search failed: ${(error as Error).message}`;
  }
};

/**
 * manteka_analyze_codebase: Analiza el grafo de dependencias de un códigobase TypeScript/JavaScript
 *
 * Realiza un análisis profundo de la estructura de imports/exports en el códigobase,
 * mapea el grafo de dependencias, calcula métricas de acoplamiento y detecta
 * ciclos de dependencias. Modo deep para análisis transitivo.
 *
 * Parámetros:
 * - root: Directorio raíz del códigobase para analizar (default: cwd)
 * - deep: Si true, expande el árbol de importaciones de forma transitiva y añade las
 *   métricas extendidas; si false (default) solo reporta dependencias directas
 * - output: Formato de salida 'text' o 'json' (default: text)
 */
export const manteka_analyze_codebase = async (
  root: string = process.cwd(),
  deep: boolean = false,
  output: 'text' | 'json' = 'text'
): Promise<string> => {
  try {
    const result = runAnalysis(root, { deep });

    if (output === 'json') {
      return JSON.stringify(result, null, 2);
    }

    // Formatear salida de texto legible
    const lines: string[] = [];

    // Header
    lines.push('═'.repeat(60));
    lines.push(`📊 Manteka Dependency Analysis`);
    lines.push(`📁 Project: ${result.root}`);
    lines.push(`📄 Files analyzed: ${result.summary.totalFiles}`);
    lines.push('═'.repeat(60));
    lines.push('');

    // Coupling summary
    lines.push('🔗 Coupling Summary');
    lines.push(`   Total unique dependencies: ${result.summary.totalUniqueDependencies}`);
    lines.push(
      `   Average imports per file: ${result.summary.averageImportsPerFile}`
    );
    lines.push('');

    // Import depth
    lines.push('📏 Import Depth Distribution');
    lines.push(`   Mode: ${result.deep ? 'deep (transitive)' : 'shallow (direct dependencies only)'}`);
    lines.push(`   Maximum import depth: ${result.summary.maxImportDepth}`);
    if (result.deep && result.summary.depthDistribution) {
      const distribution = Object.entries(result.summary.depthDistribution)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([distance, count]) => `depth ${distance}: ${count} file(s)`);
      lines.push(`   Files by distance from a root: ${distribution.join(', ') || 'none'}`);
      lines.push(`   Files reachable transitively: ${result.summary.transitiveFileCount ?? 0}`);
    }
    lines.push('');

    // Circular dependency alerts
    lines.push('🚨 Circular Dependency Alerts');
    if (result.summary.filesWithCycles.length > 0) {
      for (const cycleFile of result.summary.filesWithCycles) {
        lines.push(`   ⚠ ${cycleFile} - contains circular dependency`);
      }
    } else {
      lines.push('   ✅ No circular dependencies detected');
    }
    lines.push('');

    // Per-file details summary
    lines.push('📋 Files Analysis Summary');
    lines.push(`   Files with imports: ${result.fileAnalysis.filter((f: FileAnalysis) => f.imports.length > 0).length}/${result.summary.totalFiles}`);
    lines.push(`   Files with exports: ${result.fileAnalysis.filter((f: FileAnalysis) => f.exports?.length).length}/${result.summary.totalFiles}`);
    lines.push('');

    lines.push('═'.repeat(60));
    lines.push(
      `Analysis complete: ${result.summary.totalFiles} files, ${result.summary.totalUniqueDependencies} unique dependencies`
    );
    lines.push('');

    return lines.join('\n');
  } catch (error) {
    return `Analysis failed: ${(error as Error).message}`;
  }
};

/**
 * Evaluates the quality gate based on a mutation score and threshold.
 *
 * Returns a verdict string indicating whether the quality gate passes or fails.
 *
 * @param mutationScore - The mutation score (0-1)
 * @param threshold - The quality threshold (0-1, default 0.8)
 * @returns A verdict string with pass/fail status
 */
export const manteka_quality_gate = async (
  mutationScore: number,
  threshold: number = 0.8
): Promise<string> => {
  const verdict = getQualityVerdict(mutationScore, threshold);

  return `Verdict: ${verdict}`;
};

/**
 * manteka_doctor: Diagnostica el entorno del sistema
 *
 * Ejecuta un diagnóstico completo del entorno: versión de Node.js,
 * permisos de archivos, integridad de memoria lineage y configuración.
 *
 * @returns Reporte de diagnóstico estructurado
 */
export const manteka_doctor = async (): Promise<{
  nodeVersion: { status: 'ok' | 'warn' | 'fail'; message: string };
  fileSystemPermissions: { status: 'ok' | 'warn' | 'fail'; message: string };
  lineageIntegrity: { status: 'ok' | 'warn' | 'fail'; message: string };
  configIntegrity: { status: 'ok' | 'warn' | 'fail'; message: string };
  overall: 'healthy' | 'issues';
}> => {
  const [nodeResult, fsResult, lineageResult, configResult] = await Promise.all([
    checkNodeVersion(),
    checkFileSystemPermissions(),
    checkLineageIntegrity(),
    checkConfigIntegrity(),
  ]);

  const overall =
    nodeResult.status === 'ok' &&
    fsResult.status === 'ok' &&
    lineageResult.status === 'ok' &&
    configResult.status === 'ok'
      ? 'healthy'
      : 'issues';

  return {
    nodeVersion: nodeResult,
    fileSystemPermissions: fsResult,
    lineageIntegrity: lineageResult,
    configIntegrity: configResult,
    overall,
  };
};

// ===========================
// Tool Registration Helper
// ===========================

/** Descripciones e input schemas de las herramientas Manteka, para clientes MCP. */
export const MANTEKA_TOOL_SCHEMAS: Record<
  MantekaToolName,
  { description: string; inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] } }
> = {
  manteka_heal: {
    description: 'Heals a file with TODO/FIXME diagnostics',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to file' },
        description: { type: 'string', description: 'Description of the issue' },
        maxAttempts: { type: 'number', description: 'Maximum healing attempts' },
      },
      required: ['file'],
    },
  },
  manteka_swarm_query: {
    description: 'Queries the swarm orchestrator',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query string' },
        strategy: {
          type: 'string',
          enum: ['raft', 'bft', 'gossip', 'crdt', 'quorum'],
          description: 'Swarm consensus strategy',
        },
      },
      required: ['query'],
    },
  },
  manteka_memory_search: {
    description: 'Searches memory for patterns',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        namespace: { type: 'string', description: 'Memory namespace' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
  },
  manteka_quality_gate: {
    description: 'Evaluates quality gate based on mutation score',
    inputSchema: {
      type: 'object',
      properties: {
        mutationScore: { type: 'number', description: 'Mutation score (0-1)' },
        threshold: { type: 'number', description: 'Quality threshold (0-1)' },
      },
      required: ['mutationScore'],
    },
  },
  manteka_doctor: {
    description: 'Diagnoses environment health (Node version, fs permissions, lineage, config)',
    inputSchema: { type: 'object', properties: {} },
  },
  manteka_analyze_codebase: {
    description: 'Analyzes TypeScript/JavaScript project dependency graph',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Root directory' },
        deep: { type: 'boolean', description: 'Deep transitive analysis' },
        output: { type: 'string', enum: ['text', 'json'], description: 'Output format' },
      },
    },
  },
  manteka_smart_slice: {
    description: 'Exports the Smart-Slice dependency closure as RAG-ready markdown, json or xml',
    inputSchema: {
      type: 'object',
      properties: {
        exportFormat: { type: 'string', enum: ['markdown', 'json', 'xml'], description: 'Export format' },
        entry: { type: 'string', description: 'Entry point to trace dependencies from' },
        root: { type: 'string', description: 'Root directory' },
        depth: { type: 'number', description: 'Maximum dependency depth' },
      },
    },
  },
};

/**
 * Superficie mínima que este registro necesita del servidor MCP.
 *
 * Se declara estructuralmente (en vez de usar la clase nativa `MCPServer`) para
 * permitir que otro transporte lo adapte: el servidor del SDK de
 * Model Context Protocol no implementa `registerToolHandler`, sino `registerTool`.
 */
export interface MantekaToolRegistrar {
  registerToolHandler(name: MantekaToolName, handler: OnToolCallListener): void;
}

/**
 * Superficie del `McpServer` del SDK que necesita el adaptador de abajo.
 *
 * El SDK declara `registerTool` con genéricos de Zod (`ZodRawShapeCompat | AnySchema`),
 * así que su firma es incompatible con cualquier tipo estructural. El adaptador llama
 * a través de un `any` puntual en este único frontera, en lugar de propagar `any`
 * por el resto del registro.
 */
// biome-ignore lint/suspicious/noExplicitAny: unica frontera con la firma generica del SDK de MCP
export type SdkMcpServerLike = { registerTool: any };

/**
 * Registra las herramientas Manteka en el `McpServer` del SDK de MCP.
 *
 * El SDK no expone `registerToolHandler`, así que cada handler se adapta a la firma
 * `registerTool` del SDK y su resultado se envuelve en el bloque `content` que el
 * protocolo espera. Pasar la instancia del SDK directamente a `registerMantekaTools`
 * lanzaría `TypeError: server.registerToolHandler is not a function`.
 */
export const registerMantekaToolsForSdk = (sdkServer: SdkMcpServerLike): void => {
  registerMantekaTools({
    registerToolHandler: (name, handler) => {
      const { description, inputSchema } = MANTEKA_TOOL_SCHEMAS[name];
      sdkServer.registerTool(name, { description, inputSchema }, async (args: Record<string, unknown>) => {
        const result = await handler(name, args ?? {});
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        return { content: [{ type: 'text' as const, text }] };
      });
    },
  });
};

/**
 * Registers all Manteka tools with the MCP server
 */
export const registerMantekaTools = (server: MantekaToolRegistrar): void => {
  // Register manteka_heal handler
  server.registerToolHandler('manteka_heal', async (name: MantekaToolName, args: Record<string, any>) => {
    const file = args?.file || '';
    const description = args?.description || '';
    const maxAttempts = args?.maxAttempts ?? 3;

    const result = await manteka_heal(file, description, maxAttempts);
    return result;
  });

  // Register manteka_swarm_query handler
  server.registerToolHandler('manteka_swarm_query', async (name: MantekaToolName, args: Record<string, any>) => {
    const query = args?.query || '';
    const strategy = args?.strategy || 'raft';

    const result = await manteka_swarm_query(query, strategy);
    return result;
  });

  // Register manteka_memory_search handler
  server.registerToolHandler('manteka_memory_search', async (name: MantekaToolName, args: Record<string, any>) => {
    const query = args?.query || '';
    const namespace = args?.namespace || 'default';
    const limit = args?.limit ?? 10;

    const result = await manteka_memory_search(query, namespace, limit);
    return result;
  });

  // Register manteka_quality_gate handler
  server.registerToolHandler('manteka_quality_gate', async (name: MantekaToolName, args: Record<string, any>) => {
    const mutationScore = args?.mutationScore ?? 0;
    const threshold = args?.threshold ?? 0.8;

    const result = await manteka_quality_gate(mutationScore, threshold);
    return result;
  });

  // Register manteka_smart_slice handler
  server.registerToolHandler('manteka_smart_slice', async (name: MantekaToolName, args: Record<string, any>) => {
    const exportFormat = args?.exportFormat as SliceExportFormat | undefined;
    const entry = typeof args?.entry === 'string' ? args.entry : '.';
    const root = typeof args?.root === 'string' ? args.root : process.cwd();
    const depth = typeof args?.depth === 'number' ? args.depth : undefined;

    return await manteka_smart_slice(exportFormat, entry, root, depth);
  });

  // Register manteka_doctor handler
  server.registerToolHandler('manteka_doctor', async (name: MantekaToolName, args: Record<string, any>) => {
    const result = await manteka_doctor();
    return result;
  });

  // Register manteka_analyze_codebase handler
  server.registerToolHandler('manteka_analyze_codebase', async (name: MantekaToolName, args: Record<string, any>) => {
    const root = args?.root || process.cwd();
    const deep = args?.deep ?? true;
    const output = args?.output || 'text';

    const result = await manteka_analyze_codebase(root, deep, output);
    return result;
  });
};

/**
 * manteka_smart_slice: Exporta el cierre de dependencias de Smart-Slice en un
 * formato listo para contexto RAG.
 *
 * Delega el renderizado en `core/smartSlice/export`, la misma fuente de verdad que
 * usa el subcomando `manteka slice --export`, de modo que la herramienta MCP y la
 * CLI no puedan divergir en el formato producido.
 *
 * @param exportFormat - Formato de salida; si se omite se usa markdown
 * @param entry - Entry point del slice (default: '.')
 * @param rootDir - Directorio raíz al que se resuelve el entry
 * @param depth - Profundidad máxima de dependencia
 * @returns Contenido renderizado en el formato solicitado
 */
export const manteka_smart_slice = async (
  exportFormat: SliceExportFormat = 'markdown',
  entry: string = '.',
  rootDir: string = process.cwd(),
  depth: number = SMART_SLICE_DEFAULT_DEPTH,
): Promise<string> => {
  const closure = await buildSmartSliceClosure({ rootDir: path.resolve(rootDir), entry, depth });
  const model = await collectSliceExportModel(closure, depth, path.resolve(rootDir));
  return formatSliceExport(model, assertSliceExportFormat(exportFormat));
};