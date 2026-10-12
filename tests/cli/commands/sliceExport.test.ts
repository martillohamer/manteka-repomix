/**
 * Pruebas de `manteka slice --export <format>`.
 *
 * Cubre los tres formatos soportados (markdown, json, xml), la validación estricta
 * del flag `--export`, la escritura a disco vía `--out` (incluyendo rutas
 * anidadas) y el aislamiento de módulos con `vi.resetModules()`.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertSliceExportFormat,
  collectSliceExportModel,
  formatSliceExport,
  SLICE_EXPORT_FORMATS,
  type SliceExportModel,
} from '../../../src/core/smartSlice/export.js';
import { runSliceExport } from '../../../src/cli/commands/slice.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const model = (overrides: Partial<SliceExportModel> = {}): SliceExportModel => ({
  entry: 'src/index.ts',
  depth: 2,
  files: [
    {
      path: 'src/index.ts',
      content: "import { helper } from './helper.js';\nconsole.log(helper());",
      truncated: false,
      originalChars: 61,
    },
    {
      path: 'src/helper.ts',
      content: 'export const helper = () => 42;',
      truncated: false,
      originalChars: 34,
    },
  ],
  warnings: [],
  ...overrides,
});

let workDir: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manteka-slice-export-'));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

/** Crea un proyecto mínimo con entry point y una dependencia local. */
const seedProject = async (): Promise<void> => {
  await fs.mkdir(path.join(workDir, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(workDir, 'src', 'index.ts'),
    "import { helper } from './helper.js';\nexport const value = helper();\n",
    'utf-8',
  );
  await fs.writeFile(path.join(workDir, 'src', 'helper.ts'), 'export const helper = () => 42;\n', 'utf-8');
};

// ---------------------------------------------------------------------------
// Validación estricta del formato
// ---------------------------------------------------------------------------

describe('assertSliceExportFormat', () => {
  it('acepta los tres formatos soportados', () => {
    expect(SLICE_EXPORT_FORMATS).toEqual(['markdown', 'json', 'xml']);
    for (const format of SLICE_EXPORT_FORMATS) {
      expect(assertSliceExportFormat(format)).toBe(format);
    }
  });

  it('normaliza mayúsculas y espacios', () => {
    expect(assertSliceExportFormat('  JSON ')).toBe('json');
    expect(assertSliceExportFormat('Markdown')).toBe('markdown');
  });

  it('rechaza cualquier formato fuera del conjunto soportado', () => {
    // Un typo debe fallar ruidosamente en vez de caer a un default no pedido.
    expect(() => assertSliceExportFormat('yaml')).toThrow(/Unsupported --export format/);
    expect(() => assertSliceExportFormat('')).toThrow(/Unsupported --export format/);
    expect(() => assertSliceExportFormat('md')).toThrow(/markdown, json, xml/);
  });
});

// ---------------------------------------------------------------------------
// Renderizado por formato
// ---------------------------------------------------------------------------

describe('formatSliceExport', () => {
  it('renderiza markdown con el árbol de dependencias y el código extraído', () => {
    const output = formatSliceExport(model(), 'markdown');

    expect(output).toContain('# Manteka Smart-Slice Export');
    expect(output).toContain('- **Entry**: `src/index.ts`');
    expect(output).toContain('- **Depth**: 2');
    expect(output).toContain('- **Files**: 2');
    expect(output).toContain('## Dependency Tree');
    expect(output).toContain('1. `src/index.ts`');
    expect(output).toContain('2. `src/helper.ts`');
    expect(output).toContain('## Extracted Code');
    expect(output).toContain("import { helper } from './helper.js';");
    expect(output).toContain('export const helper = () => 42;');
  });

  it('renderiza json estructurado y parseable', () => {
    const output = formatSliceExport(model(), 'json');
    const parsed = JSON.parse(output);

    expect(parsed.entry).toBe('src/index.ts');
    expect(parsed.depth).toBe(2);
    expect(parsed.fileCount).toBe(2);
    expect(parsed.dependencyTree).toEqual(['src/index.ts', 'src/helper.ts']);
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files[0].path).toBe('src/index.ts');
    expect(parsed.files[0].content).toContain('helper');
    expect(parsed.files[0].truncated).toBe(false);
  });

  it('renderiza xml bien formado con los metacaracteres escapados', () => {
    const risky = model({
      entry: 'src/a&b<c>.ts',
      files: [
        {
          path: 'src/a&b<c>.ts',
          content: 'const compare = a < b && c > d;',
          truncated: false,
          originalChars: 32,
        },
      ],
    });

    const output = formatSliceExport(risky, 'xml');

    expect(output.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(output).toContain('<smart-slice');
    expect(output).toContain('&amp;');
    expect(output).toContain('&lt;');
    // El contenido viaja en CDATA, así que no debe aparecer escapado ni cerrar el bloque.
    expect(output).toContain('const compare = a < b && c > d;');
    expect(output).toContain('</smart-slice>');
  });

  it('preserva el contenido con CDATA aunque contenga el terminador ]]>', () => {
    const cdata = model({
      files: [{ path: 'src/x.ts', content: 'const s = "]]>";', truncated: false, originalChars: 15 }],
    });

    const output = formatSliceExport(cdata, 'xml');

    // ]]> se parte en ]]]]><![CDATA[> para no cerrar prematuramente la sección.
    expect(output).toContain(']]]]><![CDATA[>');
    expect(output.match(/<!\[CDATA\[/g)).toHaveLength(2);
  });

  it('elige un cercado más largo cuando el contenido trae fences markdown', () => {
    const fenced = model({
      files: [
        {
          path: 'README.md',
          content: '```js\nconst a = 1;\n```\n',
          truncated: false,
          originalChars: 21,
        },
      ],
    });

    const output = formatSliceExport(fenced, 'markdown');

    // Un cercado de 4 backticks evita que el fence interno cierre el bloque.
    expect(output).toContain('````');
    expect(output).toContain('### README.md');
  });

  it('expone las advertencias del motor en los tres formatos', () => {
    const warned = model({ warnings: ['Could not resolve ./missing.js'] });

    expect(formatSliceExport(warned, 'markdown')).toContain('- Could not resolve ./missing.js');
    expect(JSON.parse(formatSliceExport(warned, 'json')).warnings).toEqual([
      'Could not resolve ./missing.js',
    ]);
    expect(formatSliceExport(warned, 'xml')).toContain(
      '<warning>Could not resolve ./missing.js</warning>',
    );
  });

  it('marca los archivos recortados en el árbol de dependencias', () => {
    const truncated = model({
      files: [{ path: 'big.ts', content: 'x'.repeat(10), truncated: true, originalChars: 99_999 }],
    });

    expect(formatSliceExport(truncated, 'markdown')).toContain('1. `big.ts` _(truncated)_');
    expect(JSON.parse(formatSliceExport(truncated, 'json')).files[0].originalChars).toBe(99_999);
    expect(formatSliceExport(truncated, 'xml')).toContain('truncated="true"');
  });
});

// ---------------------------------------------------------------------------
// Recolección del modelo
// ---------------------------------------------------------------------------

describe('collectSliceExportModel', () => {
  it('lee el contenido de cada archivo del cierre', async () => {
    const collected = await collectSliceExportModel(
      { entry: 'src/index.ts', paths: ['src/index.ts', 'src/helper.ts'], warnings: [] },
      2,
      workDir,
      async (absolute) => (absolute.endsWith('helper.ts') ? 'export const helper = 1;' : 'export const index = 2;'),
    );

    expect(collected.files.map((file) => file.path)).toEqual(['src/index.ts', 'src/helper.ts']);
    expect(collected.files[0].content).toBe('export const index = 2;');
    expect(collected.files[0].truncated).toBe(false);
    expect(collected.files[0].originalChars).toBe('export const index = 2;'.length);
  });

  it('recorta archivos que superan el presupuesto de caracteres', async () => {
    const long = 'a'.repeat(500);
    const collected = await collectSliceExportModel(
      { entry: 'big.ts', paths: ['big.ts'], warnings: [] },
      1,
      workDir,
      async () => long,
      100,
    );

    expect(collected.files[0].content).toHaveLength(100);
    expect(collected.files[0].truncated).toBe(true);
    expect(collected.files[0].originalChars).toBe(500);
  });

  it(' degrada a una advertencia cuando un archivo no se puede leer', async () => {
    const collected = await collectSliceExportModel(
      { entry: 'a.ts', paths: ['a.ts', 'missing.ts'], warnings: ['base warning'] },
      1,
      workDir,
      async (absolute) => {
        if (absolute.endsWith('missing.ts')) {
          throw new Error('ENOENT: no such file');
        }
        return 'ok';
      },
    );

    // Un cierre parcial sigue siendo contexto RAG útil: se conserva y se avisa.
    expect(collected.files).toHaveLength(1);
    expect(collected.warnings[0]).toBe('base warning');
    expect(collected.warnings[1]).toContain('Could not read missing.ts for export');
  });
});

// ---------------------------------------------------------------------------
// Pipeline completo + escritura con --out
// ---------------------------------------------------------------------------

describe('runSliceExport', () => {
  it('resuelve el cierre real y lo devuelve sin escribir cuando no hay --out', async () => {
    await seedProject();

    const { content, writtenTo } = await runSliceExport(
      { exportFormat: 'json', entry: 'src/index.ts', directory: '.', depth: 2 },
      workDir,
    );

    expect(writtenTo).toBeUndefined();
    const parsed = JSON.parse(content);
    expect(parsed.entry).toBe('src/index.ts');
    expect(parsed.dependencyTree).toContain('src/index.ts');
    expect(parsed.dependencyTree).toContain('src/helper.ts');
    expect(parsed.files.some((file: { content: string }) => file.content.includes('helper'))).toBe(true);
  });

  it('escribe el export a disco con --out', async () => {
    await seedProject();
    const outFile = path.join(workDir, 'slice.json');

    const { writtenTo } = await runSliceExport(
      { exportFormat: 'json', out: outFile, entry: 'src/index.ts', directory: '.', depth: 2 },
      workDir,
    );

    expect(writtenTo).toBe(outFile);
    const onDisk = await fs.readFile(outFile, 'utf-8');
    expect(JSON.parse(onDisk).entry).toBe('src/index.ts');
  });

  it('crea los directorios intermedios de una ruta --out anidada', async () => {
    await seedProject();
    const nested = path.join(workDir, 'ctx', 'nested', 'slice.md');

    const { writtenTo } = await runSliceExport(
      { exportFormat: 'markdown', out: nested, entry: 'src/index.ts', directory: '.', depth: 1 },
      workDir,
    );

    expect(writtenTo).toBe(nested);
    const onDisk = await fs.readFile(nested, 'utf-8');
    expect(onDisk).toContain('# Manteka Smart-Slice Export');
    expect(onDisk).toContain('src/helper.ts');
  });

  it('resuelve un --out relativo contra el cwd con node:path', async () => {
    await seedProject();

    const { writtenTo } = await runSliceExport(
      { exportFormat: 'xml', out: 'out/slice.xml', entry: 'src/index.ts', directory: '.', depth: 1 },
      workDir,
    );

    expect(writtenTo).toBe(path.join(workDir, 'out', 'slice.xml'));
    const onDisk = await fs.readFile(writtenTo as string, 'utf-8');
    expect(onDisk.startsWith('<?xml')).toBe(true);
  });

  it('produce los tres formatos sobre el mismo proyecto', async () => {
    await seedProject();

    for (const format of SLICE_EXPORT_FORMATS) {
      const { content } = await runSliceExport(
        { exportFormat: format, entry: 'src/index.ts', directory: '.', depth: 2 },
        workDir,
      );
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('src/helper.ts');
    }
  });
});

// ---------------------------------------------------------------------------
// Herramienta MCP
// ---------------------------------------------------------------------------

describe('manteka_smart_slice MCP tool', () => {
  it('registra un handler que acepta el parámetro opcional exportFormat', async () => {
    vi.resetModules();
    const { registerMantekaTools } = await import('../../../src/mcp/tools.js');
    await seedProject();

    const handlers = new Map<string, (name: string, args: Record<string, unknown>) => Promise<unknown>>();
    const server = {
      registerToolHandler: (name: string, handler: (name: string, args: Record<string, unknown>) => Promise<unknown>) => {
        handlers.set(name, handler);
      },
    };

    registerMantekaTools(server as never);
    const handler = handlers.get('manteka_smart_slice');
    expect(handler).toBeDefined();

    const result = (await handler?.('manteka_smart_slice', {
      exportFormat: 'json',
      entry: 'src/index.ts',
      root: workDir,
      depth: 2,
    })) as string;

    expect(JSON.parse(result).entry).toBe('src/index.ts');

    // Sin exportFormat el handler debe seguir funcionando (parámetro opcional).
    const defaulted = (await handler?.('manteka_smart_slice', {
      entry: 'src/index.ts',
      root: workDir,
    })) as string;
    expect(defaulted).toContain('# Manteka Smart-Slice Export');
  });

  it('renderiza el formato solicitado y usa markdown por defecto', async () => {
    vi.resetModules();
    const { manteka_smart_slice } = await import('../../../src/mcp/tools.js');
    await seedProject();

    const json = await manteka_smart_slice('json', 'src/index.ts', workDir, 2);
    expect(JSON.parse(json).dependencyTree).toContain('src/helper.ts');

    const xml = await manteka_smart_slice('xml', 'src/index.ts', workDir, 2);
    expect(xml.startsWith('<?xml')).toBe(true);

    const defaulted = await manteka_smart_slice(undefined, 'src/index.ts', workDir, 2);
    expect(defaulted).toContain('# Manteka Smart-Slice Export');
  });

  it('produce el mismo contenido que el subcomando de CLI para el mismo formato', async () => {
    vi.resetModules();
    const { manteka_smart_slice } = await import('../../../src/mcp/tools.js');
    await seedProject();

    const viaTool = await manteka_smart_slice('markdown', 'src/index.ts', workDir, 2);
    const viaCli = await runSliceExport(
      { exportFormat: 'markdown', entry: 'src/index.ts', directory: '.', depth: 2 },
      workDir,
    );

    // Una sola fuente de verdad: la herramienta MCP y la CLI no pueden divergir.
    expect(viaTool).toBe(viaCli.content);
  });
});

// ---------------------------------------------------------------------------
// Integración con el programa de Commander
// ---------------------------------------------------------------------------

describe('manteka slice command wiring', () => {
  it('expone el subcomando slice con --export y --out', async () => {
    vi.resetModules();
    const { createMantekaProgram } = await import('../../../src/cli/index.js');
    const program = createMantekaProgram();
    program.exitOverride();

    const command = program.commands.find((candidate) => candidate.name() === 'slice');
    expect(command).toBeDefined();

    const flags = command?.options.map((option) => option.long) ?? [];
    expect(flags).toContain('--export');
    expect(flags).toContain('--out');
    expect(flags).toContain('--depth');
  });

  it('rechaza un formato no soportado al parsear', async () => {
    vi.resetModules();
    const { createMantekaProgram } = await import('../../../src/cli/index.js');
    const program = createMantekaProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });

    await expect(
      program.parseAsync(['node', 'manteka', 'slice', 'src/index.ts', '--export', 'yaml']),
    ).rejects.toThrow(/Unsupported --export format/);
  });

  it('rechaza una profundidad no numérica', async () => {
    vi.resetModules();
    const { createMantekaProgram } = await import('../../../src/cli/index.js');
    const program = createMantekaProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });

    await expect(
      program.parseAsync(['node', 'manteka', 'slice', 'src/index.ts', '--export', 'json', '--depth', '-1']),
    ).rejects.toThrow(/non-negative integer/);
  });

  it('entrega el formato parseado a la acción del subcomando', async () => {
    vi.resetModules();
    const { createMantekaProgram } = await import('../../../src/cli/index.js');
    const program = createMantekaProgram();
    program.exitOverride();

    let captured: { export?: string; out?: string; depth?: number } = {};
    const command = program.commands.find((candidate) => candidate.name() === 'slice');
    command?.action((_entry: string, options: { export?: string; out?: string; depth?: number }) => {
      captured = options;
    });

    await program.parseAsync([
      'node',
      'manteka',
      'slice',
      'src/index.ts',
      '--export',
      'json',
      '--out',
      'ctx/slice.json',
      '--depth',
      '3',
    ]);

    expect(captured).toMatchObject({ export: 'json', out: 'ctx/slice.json', depth: 3 });
  });
});