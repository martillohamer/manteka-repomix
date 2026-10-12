/**
 * `manteka slice`: Smart-Slice con salida lista para RAG.
 *
 * Reutiliza el motor Smart-Slice para resolver el cierre de dependencias de un
 * entry point y lo renderiza en `markdown`, `json` o `xml`, listo para inyectarse
 * como contexto en prompts de LLM. Con `--out` el resultado se escribe a disco.
 *
 *   manteka slice src/index.ts --export markdown
 *   manteka slice src/index.ts --export json --out ctx/slice.json
 */
import path from 'node:path';
import process from 'node:process';
import { Command, Option } from 'commander';
import {
  assertSliceExportFormat,
  buildSmartSliceClosure,
  collectSliceExportModel,
  formatSliceExport,
  SLICE_EXPORT_FORMATS,
  SMART_SLICE_DEFAULT_DEPTH,
  writeSliceExport,
  type SliceExportFormat,
} from '../../core/smartSlice/index.js';
import { RepomixError } from '../../shared/errorHandle.js';

export interface SliceCommandOptions {
  /** Formato de exportación ya validado. */
  exportFormat: SliceExportFormat;
  /** Ruta de salida opcional; si se omite, se imprime en stdout. */
  out?: string;
  /** Entry point del slice. */
  entry: string;
  /** Directorio raíz al que se resuelve el entry. */
  directory: string;
  /** Profundidad máxima de dependencia. */
  depth: number;
}

/**
 * Ejecuta el slice y devuelve el texto renderizado más la ruta escrita (si hubo).
 *
 * Se exporta separada del `action` de Commander para que las pruebas puedan
 * invocar el pipeline completo (resolución + render + escritura) sin montar un
 * programa de CLI.
 */
export const runSliceExport = async (
  options: SliceCommandOptions,
  cwd: string = process.cwd(),
): Promise<{ content: string; writtenTo?: string }> => {
  const rootDir = path.resolve(cwd, options.directory);
  const entry = options.entry;

  const closure = await buildSmartSliceClosure({
    rootDir,
    entry,
    depth: options.depth,
  });

  const model = await collectSliceExportModel(closure, options.depth, rootDir);
  const content = formatSliceExport(model, options.exportFormat);

  if (options.out) {
    const writtenTo = await writeSliceExport(options.out, content, cwd);
    return { content, writtenTo };
  }

  return { content };
};

/**
 * Registra el subcomando `slice` en el programa de Commander.
 */
export const registerSliceCommand = (program: Command): void => {
  program
    .command('slice')
    .description('Smart-Slice export: render the dependency closure as RAG-ready markdown, json or xml')
    .argument('[entry]', 'Entry point to trace dependencies from (default: package entry or cwd)', '.')
    .option(
      '--export <format>',
      `Output format for RAG context: ${SLICE_EXPORT_FORMATS.join(', ')}`,
      assertSliceExportFormat,
    )
    .option('--out <path>', 'Write the export to this file instead of stdout')
    .addOption(
      new Option(
        '--depth <n>',
        'Maximum dependency depth, 0 = entry file only (default: 2)',
      ).argParser((value: string) => {
        if (!/^\d+$/.test(value)) {
          throw new RepomixError(`Invalid depth for --depth: '${value}'. Must be a non-negative integer.`);
        }
        return Number(value);
      }),
    )
    .action(async (entry: string, options: { export?: SliceExportFormat; out?: string; depth?: number }) => {
      const exportFormat = options.export;
      if (!exportFormat) {
        throw new RepomixError(
          `Missing required option --export. Supported formats: ${SLICE_EXPORT_FORMATS.join(', ')}.`,
        );
      }

      const { content, writtenTo } = await runSliceExport({
        exportFormat,
        out: options.out,
        entry,
        directory: '.',
        depth: options.depth ?? SMART_SLICE_DEFAULT_DEPTH,
      });

      if (writtenTo) {
        console.log(`Slice export written to ${writtenTo}`);
      } else {
        console.log(content);
      }
    });
};

/**
 * Punto de entrada para el dispatcher legacy `main()`.
 *
 * `src/cli/index.ts` despacha `manteka slice` por su propio switch en lugar de por
 * Commander, así que aquí se reconstruyen los argumentos crudos de process.argv.
 *
 * @param args - argv sin el nombre del binario, p. ej. `['slice', 'src/index.ts', '--export', 'json']`
 */
export async function runSliceCommand(args: string[]): Promise<void> {
  const flag = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };

  const entry = args[1] && !args[1].startsWith('-') ? args[1] : '.';
  const exportFlag = flag('--export');

  if (!exportFlag) {
    throw new RepomixError(
      `Missing required option --export. Supported formats: ${SLICE_EXPORT_FORMATS.join(', ')}.`,
    );
  }

  const depthFlag = flag('--depth');
  if (depthFlag !== undefined && !/^\d+$/.test(depthFlag)) {
    throw new RepomixError(`Invalid depth for --depth: '${depthFlag}'. Must be a non-negative integer.`);
  }

  const { content, writtenTo } = await runSliceExport({
    exportFormat: assertSliceExportFormat(exportFlag),
    out: flag('--out'),
    entry,
    directory: '.',
    depth: depthFlag === undefined ? SMART_SLICE_DEFAULT_DEPTH : Number(depthFlag),
  });

  if (writtenTo) {
    console.log(`Slice export written to ${writtenTo}`);
  } else {
    console.log(content);
  }
};
