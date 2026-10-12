/**
 * Subcomando `manteka analyze`: expone el motor de grafo de dependencias.
 *
 * La implementacion vive en `core/analyze`, compartida con la herramienta MCP
 * `manteka_analyze_codebase` para que ambas capas produzcan el mismo analisis.
 */
import { Command } from 'commander';
import * as process from 'node:process';
import { runAnalysis, type AnalysisResult } from '../../core/analyze/index.js';

export type { FileAnalysis, FileImport } from '../../core/analyze/index.js';
export { runAnalysis } from '../../core/analyze/index.js';

/**
 * Renderiza el reporte en texto plano.
 *
 * Compartido por la ruta de Commander y por el dispatcher legacy de `main()`, de
 * modo que ambas rutas muestren exactamente las mismas lineas — incluidas las
 * metricas extendidas que solo existen en modo deep.
 */
export function printAnalysisReport(result: AnalysisResult): void {
  console.log(`📊 Dependency Analysis Report`);
  console.log(`📁 Project: ${result.root}`);
  console.log(`📄 Files analyzed: ${result.summary.totalFiles}`);
  console.log(`🔗 Unique dependencies: ${result.summary.totalUniqueDependencies}`);
  console.log(`📏 Average imports per file: ${result.summary.averageImportsPerFile}`);
  console.log(
    `🕸️  Mode: ${result.deep ? 'deep (transitive)' : 'shallow (direct dependencies only)'}`,
  );
  console.log(`📐 Maximum import depth: ${result.summary.maxImportDepth}`);

  if (result.deep && result.summary.depthDistribution) {
    const distribution = Object.entries(result.summary.depthDistribution)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([distance, count]) => `depth ${distance}: ${count} file(s)`);
    console.log(`🪜  Files by distance from a root: ${distribution.join(', ') || 'none'}`);
    console.log(`🔭 Files reachable transitively: ${result.summary.transitiveFileCount ?? 0}`);
    console.log(`🚪 Entry points: ${result.summary.entryPoints?.join(', ') || 'none'}`);
    console.log(`🍃 Leaf files: ${result.summary.leafFiles?.join(', ') || 'none'}`);
  }

  if (result.summary.filesWithCycles.length > 0) {
    console.log(
      `🚨 Circular dependencies detected in: ${result.summary.filesWithCycles.join(', ')}`,
    );
  } else {
    console.log('✅ No circular dependencies detected');
  }
}

/**
 * Registers the `analyze` subcommand on the given Commander program
 *
 * @param program - Commander Command instance to register on
 */
export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Analyze TypeScript/JavaScript project dependency graph')
    .argument('[root]', 'Root directory to analyze', process.cwd())
    .option('--deep', 'Expand the import tree transitively (default: direct dependencies only)')
    .option('--output <format>', 'Output format: text or json', 'text')
    .action((root: string, options: { deep?: boolean; output: string }) => {
      // `--deep` is a plain flag, so an absent flag means shallow analysis: the
      // dependency graph stops at direct imports unless it is explicitly requested.
      const result = runAnalysis(root, { deep: options.deep === true });

      if (options.output === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printAnalysisReport(result);
    });
}

/**
 * Ejecuta el análisis desde el dispatcher legacy de la CLI.
 *
 * `src/cli/index.ts` despacha `manteka analyze` por su propio switch en lugar de por
 * Commander, asi que este wrapper reconstruye los argumentos crudos.
 */
export function runAnalyzeCommand(args: string[]): void {
  const positional = args[1];
  const root = positional && !positional.startsWith('-') ? positional : process.cwd();
  // Shallow unless `--deep` is explicitly present in the raw argv, matching the
  // Commander path so both entry points agree on the default.
  const deep = args.includes('--deep');

  const result = runAnalysis(root, { deep });

  if (args.includes('--output') && args[args.indexOf('--output') + 1] === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printAnalysisReport(result);
}