/**
 * Subcomando `manteka analyze`: expone el motor de grafo de dependencias.
 *
 * La implementacion vive en `core/analyze`, compartida con la herramienta MCP
 * `manteka_analyze_codebase` para que ambas capas produzcan el mismo analisis.
 */
import { Command } from 'commander';
import * as process from 'node:process';
import { runAnalysis } from '../../core/analyze/index.js';

export type { FileAnalysis, FileImport } from '../../core/analyze/index.js';
export { runAnalysis } from '../../core/analyze/index.js';

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
    .option('--deep', 'Perform deep transitive dependency analysis (default: true)')
    .option('--output <format>', 'Output format: text or json', 'text')
    .action((root: string, options: { deep?: boolean; output: string }) => {
      // `--deep` is a plain flag, so absence means "not passed"; the documented
      // default is transitive analysis, hence `!== false`.
      const result = runAnalysis(root, options.deep !== false);

      if (options.output === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`📊 Dependency Analysis Report`);
      console.log(`📁 Project: ${result.root}`);
      console.log(`📄 Files analyzed: ${result.summary.totalFiles}`);
      console.log(`🔗 Unique dependencies: ${result.summary.totalUniqueDependencies}`);
      console.log(`📏 Average imports per file: ${result.summary.averageImportsPerFile}`);
      if (result.summary.filesWithCycles.length > 0) {
        console.log(
          `🚨 Circular dependencies detected in: ${result.summary.filesWithCycles.join(', ')}`,
        );
      } else {
        console.log('✅ No circular dependencies detected');
      }
    });
}

/**
 * Ejecuta el análisis desde el dispatcher legacy de la CLI.
 *
 * `src/cli/index.ts` despacha `manteka analyze` por su propio switch, así que este
 * wrapper mantiene ese camino funcionando sin duplicar el formateo.
 */
export function runAnalyzeCommand(args: string[]): void {
  const root = args[1] ?? process.cwd();
  const result = runAnalysis(root, true);

  console.log(`📊 Dependency Analysis Report`);
  console.log(`📁 Project: ${result.root}`);
  console.log(`📄 Files analyzed: ${result.summary.totalFiles}`);
  console.log(`🔗 Unique dependencies: ${result.summary.totalUniqueDependencies}`);
}