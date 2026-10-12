import fs from 'node:fs/promises';
import path from 'node:path';
import type { SmartSliceResult } from './types.js';

/**
 * Formatos soportados por la exportación RAG de Smart-Slice.
 *
 * `markdown` y `xml` están pensados para inyectarse como texto plano en un prompt
 * (bloques cercados y etiquetas, respectivamente); `json` para consumidores que
 * necesitan estructura (chunking, metadatos, embeddings).
 */
export const SLICE_EXPORT_FORMATS = ['markdown', 'json', 'xml'] as const;

export type SliceExportFormat = (typeof SLICE_EXPORT_FORMATS)[number];

/** Límite por defecto de caracteres por archivo, para acotar el contexto RAG. */
export const SLICE_EXPORT_MAX_FILE_CHARS = 20_000;

/** Un archivo dentro del closure, ya leído y acotado. */
export interface SliceExportFile {
  /** Ruta relativa POSIX respecto al root del slice. */
  path: string;
  /** Contenido del archivo, recortado a `truncatedAt` caracteres si aplique. */
  content: string;
  /** `true` si el contenido fue recortado por exceder el presupuesto de caracteres. */
  truncated: boolean;
  /** Número de caracteres originals antes del recorte. */
  originalChars: number;
}

/**
 * Modelo intermedio independiente del formato: los renderizadores son funciones
 * puras sobre esta estructura, así los tres formatos comparten una sola fuente de
 * verdad y se prueban sin tocar el sistema de archivos.
 */
export interface SliceExportModel {
  /** Entry point del slice. */
  entry: string;
  /** Profundidad de dependencia solicitada. */
  depth: number;
  /** Archivos del closure, en orden determinista. */
  files: SliceExportFile[];
  /** Advertencias del motor Smart-Slice (dependencias no resueltas, etc.). */
  warnings: string[];
}

/**
 * Valida y normaliza un formato de exportación.
 *
 * Lanza `RepomixError` ante cualquier valor fuera del conjunto soportado, para que
 * un typo en `--export` falle ruidosamente en lugar de caer silenciosamente a un
 * formato por defecto que el usuario no pidió.
 */
export const assertSliceExportFormat = (value: string): SliceExportFormat => {
  const normalized = value.trim().toLowerCase();
  const match = SLICE_EXPORT_FORMATS.find((format) => format === normalized);
  if (!match) {
    throw new Error(
      `Unsupported --export format: '${value}'. Supported formats: ${SLICE_EXPORT_FORMATS.join(', ')}.`,
    );
  }
  return match;
};

/** Escapa los cinco metacaracteres XML. Las rutas pueden contener `&` o `<` legítimos. */
const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Elige un cercado de código más largo que el qualquer `` ``` `` que aparezca en el
 * contenido, para que un archivo con fences embebidos no rompa el bloque markdown.
 */
const pickCodeFence = (content: string): string => {
  const longestFence = Math.max(
    0,
    ...[...content.matchAll(/`{3,}/g)].map((match) => match[0].length),
  );
  return '`'.repeat(Math.max(3, longestFence + 1));
};

const renderMarkdown = (model: SliceExportModel): string => {
  const lines: string[] = [];

  lines.push('# Manteka Smart-Slice Export');
  lines.push('');
  lines.push('## Context');
  lines.push('');
  lines.push(`- **Entry**: \`${model.entry}\``);
  lines.push(`- **Depth**: ${model.depth}`);
  lines.push(`- **Files**: ${model.files.length}`);
  lines.push('');
  lines.push(
    'The dependency closure below is the complete set of files reachable from the entry',
    'point. Inject the whole section as retrieval context; each file is fenced so its',
    'contents stay attributable after chunking.',
  );
  lines.push('');

  if (model.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of model.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  lines.push('## Dependency Tree');
  lines.push('');
  for (const [index, file] of model.files.entries()) {
    lines.push(`${index + 1}. \`${file.path}\`${file.truncated ? ' _(truncated)_' : ''}`);
  }
  lines.push('');

  lines.push('## Extracted Code');
  for (const file of model.files) {
    lines.push('');
    lines.push(`### ${file.path}`);
    lines.push('');
    const fence = pickCodeFence(file.content);
    lines.push(`${fence}`);
    lines.push(file.content);
    lines.push(`${fence}`);
  }

  return `${lines.join('\n')}\n`;
};

const renderJson = (model: SliceExportModel): string =>
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generator: 'manteka slice --export json',
      entry: model.entry,
      depth: model.depth,
      fileCount: model.files.length,
      dependencyTree: model.files.map((file) => file.path),
      files: model.files.map((file) => ({
        path: file.path,
        truncated: file.truncated,
        originalChars: file.originalChars,
        content: file.content,
      })),
      warnings: model.warnings,
    },
    null,
    2,
  )}\n`;

const renderXml = (model: SliceExportModel): string => {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<smart-slice schema-version="1">');
  lines.push(`  <entry>${escapeXml(model.entry)}</entry>`);
  lines.push(`  <depth>${model.depth}</depth>`);
  lines.push(`  <file-count>${model.files.length}</file-count>`);

  if (model.warnings.length > 0) {
    lines.push('  <warnings>');
    for (const warning of model.warnings) {
      lines.push(`    <warning>${escapeXml(warning)}</warning>`);
    }
    lines.push('  </warnings>');
  }

  lines.push('  <dependency-tree>');
  for (const file of model.files) {
    lines.push(`    <file path="${escapeXml(file.path)}" truncated="${file.truncated}" />`);
  }
  lines.push('  </dependency-tree>');

  lines.push('  <files>');
  for (const file of model.files) {
    lines.push(`    <file path="${escapeXml(file.path)}" original-chars="${file.originalChars}">`);
    lines.push(`<![CDATA[${file.content.replace(']]>', ']]]]><![CDATA[>')}]]>`);
    lines.push('    </file>');
  }
  lines.push('  </files>');

  lines.push('</smart-slice>');

  return `${lines.join('\n')}\n`;
};

/**
 * Renderiza el modelo de slice en el formato solicitado.
 *
 * Función pura: no lee ni escribe el sistema de archivos, de modo que los tres
 * formatos se pueden verificar en pruebas unitarias sin stubs de `fs`.
 */
export const formatSliceExport = (model: SliceExportModel, format: SliceExportFormat): string => {
  switch (format) {
    case 'markdown':
      return renderMarkdown(model);
    case 'json':
      return renderJson(model);
    case 'xml':
      return renderXml(model);
  }
};

/**
 * Escribe el export a disco devolviendo la ruta absoluta usada.
 *
 * Resuelve siempre contra `cwd` con `node:path` para que el mismo argumento
 * funcione en Windows y POSIX. Al crear el directorio padre se toleran `EEXIST`
 * y `EPERM`: en Windows `fs.realpath`/`mkdir` lanzan `EPERM` sobre rutas totalmente
 * accesibles (notablemente las rutas 8.3 de temp, p. ej. `C:\Users\RUNNER~1`), y
 * tratar eso como fallo abortaría escrituras legítimas. Un permiso real denegado
 * sí se propaga como `RepomixError` con el código original.
 */
export const writeSliceExport = async (
  outPath: string,
  content: string,
  cwd: string = process.cwd(),
): Promise<string> => {
  const resolved = path.resolve(cwd, outPath);
  const parentDir = path.dirname(resolved);

  try {
    await fs.mkdir(parentDir, { recursive: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // El directorio ya existe (o el sandbox de Windows lo deniega sin efecto real):
    // seguimos e intentamos la escritura, que es la que decide de verdad.
    if (code !== 'EEXIST' && code !== 'EPERM') {
      throw error;
    }
  }

  try {
    await fs.writeFile(resolved, content, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(`Could not write slice export to ${resolved} (${code ?? 'unknown error'}): ${(error as Error).message}`);
  }

  return resolved;
};

/**
 * Construye el modelo de exportación leyendo el contenido de cada archivo del
 * closure. Los archivos ilegibles se omiten con una advertencia en lugar de abortar:
 * un cierre de dependencias parcial sigue siendo contexto RAG útil.
 */
export const collectSliceExportModel = async (
  closure: SmartSliceResult,
  depth: number,
  rootDir: string,
  readFile: (absolutePath: string) => Promise<string> = (absolutePath) => fs.readFile(absolutePath, 'utf8'),
  maxFileChars: number = SLICE_EXPORT_MAX_FILE_CHARS,
): Promise<SliceExportModel> => {
  const files: SliceExportFile[] = [];
  const warnings = [...closure.warnings];

  for (const relativePath of closure.paths) {
    const absolutePath = path.resolve(rootDir, relativePath);
    try {
      const raw = await readFile(absolutePath);
      const truncated = raw.length > maxFileChars;
      files.push({
        path: relativePath,
        content: truncated ? raw.slice(0, maxFileChars) : raw,
        truncated,
        originalChars: raw.length,
      });
    } catch (error) {
      warnings.push(`Could not read ${relativePath} for export: ${(error as Error).message}`);
    }
  }

  return { entry: closure.entry, depth, files, warnings };
};