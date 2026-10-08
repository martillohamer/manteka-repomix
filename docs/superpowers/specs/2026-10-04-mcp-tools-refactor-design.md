# Descomposición de `src/mcp/tools.ts` — subsistema MCP

Fecha: 2026-10-04
Estado: aprobado (Opción B)
Alcance: refactor de estructura únicamente, sin cambios de comportamiento

## Problema

`src/mcp/tools.ts` tiene 563 líneas y es el segundo mayor code smell registrado
por `manteka_analyze_code_health` (umbral: 400 líneas). El fichero mezcla cuatro
responsabilidades:

1. Resolución de rutas de memoria (`MEMORY_DIR`, `resolveMemoryDirectory`).
2. Predicción de sesión (`predictSessionContext`, `SessionPrediction`), usada
   únicamente por `manteka_analyze_code_health`.
3. Motor de correlación semántica (`tokenizeQuery`, `relevanceFor`,
   `readMemoryDirectoryEntries`, `collect*Matches`, `summarizeContent`,
   `readHealthReport`, `buildSemanticSummary` — ~176 líneas), usado únicamente
   por `manteka_semantic_debug`.
4. Los seis registros `mcpServer.registerTool(...)` en línea dentro de un único
   `registerMantekaTools`.

El tamaño no proviene de una preocupación cohesionada sino de la acumulación de
seis herramientas heterogéneas, por lo que superarlo es aquí señal de mezcla de
responsabilidades.

La raíz `src/mcp/tools/` ya existe y sigue una convención inequívoca — **una
herramienta por fichero, exportando `registerXTool(mcpServer, config)`** — con
ocho registradores (`packCodebaseTool.ts`, `readRepomixOutputTool.ts`,
`grepRepomixOutputTool.ts`, `fileSystemReadFileTool.ts`,
`fileSystemReadDirectoryTool.ts`, `packRemoteRepositoryTool.ts`,
`generateSkillTool.ts`, `attachPackedOutputTool.ts`). `mcpServer.ts` ya importa
y cablea esos ocho de forma individual. `tools.ts` es el único resto del
subsistema que se aparta de ese patrón, y esa única excepción es exactamente el
smell que este refactor elimina.

## Objetivo

Homogeneizar el subsistema MCP bajo la convención existente: un registrador por
fichero, cableados directamente en `mcpServer.ts`, y borrar `src/mcp/tools.ts`.

## No objetivos

- Cambiar la lógica de ninguna de las seis herramientas.
- Modificar nombres de herramienta, `title`, `description`, `inputSchema`,
  `outputSchema` u orden de registro.
- Introducir `annotations` en las herramientas Manteka (las ocho existentes las
  declaran; las seis Manteka no, y añadirlas alteraría `tools/list`).
- Corregir el `exclude: ["src/mcp/**"]` de `tsconfig.json`, que resulta anulado
  (ver «Nota sobre typecheck»).
- Rediseñar `predictSessionContext`: su lógica de `primaryFocus` por
  `includes()` en cascada es mejorable, pero es un cambio de comportamiento.

## Arquitectura

```
src/mcp/
├── mcpServer.ts                       → cablea los 14 registradores
└── tools/
    ├── mcpToolRuntime.js              → helpers compartidos (existente)
    ├── memoryPaths.ts                 → MEMORY_DIR + resolveMemoryDirectory
    ├── sessionPrediction.ts           → SessionPrediction + predictSessionContext
    ├── memoryCorrelation.ts           → motor de correlación semántica
    ├── mantekaGetContextTool.ts       → registerMantekaGetContextTool
    ├── mantekaStoreNoteTool.ts        → registerMantekaStoreNoteTool
    ├── mantekaSearchMemoryTool.ts     → registerMantekaSearchMemoryTool
    ├── mantekaLogHistoryTool.ts       → registerMantekaLogHistoryTool
    ├── mantekaAnalyzeCodeHealthTool.ts → registerMantekaAnalyzeCodeHealthTool
    └── mantekaSemanticDebugTool.ts    → registerMantekaSemanticDebugTool
```

`src/mcp/tools.ts` se elimina. No queda fachada: el cableado pasa a ser tan
explícito como el de las otras ocho herramientas.

### Por qué un registrador por fichero (y no agrupación por dominio)

Una alternativa era agrupar por dominio (`tools/memory/`, `tools/health/`,
`tools/semantic/`). Se descarta porque el repo ya resolvió esta pregunta de forma
opuesta para ocho herramientas: el nombre `registerXTool` es el contrato local y
agrupar por dominio lo rompería y añadiría anidación sin ganancia real. La
cohesión se conserva distribuyendo cada preocupación, no renombrando el
contrato.

## Módulos

### `memoryPaths.ts`

`MEMORY_DIR` (`.manteka-memory`) y `resolveMemoryDirectory(config)`. Compartido
por `manteka_store_note`, `manteka_log_history` y `manteka_semantic_debug`.
Se extrae porque el nombre del directorio de memoria aparece en las seis
herramientas y su resolución en modo sandbox es una decisión no trivial que
debe vivir en un único sitio.

### `sessionPrediction.ts`

`SessionPrediction` y `predictSessionContext(rootPath)`. Se separa de
`manteka_analyze_code_health` porque es la única capacidad predictiva del
subsistema y no comparte nada con el motor semántico.

### `memoryCorrelation.ts`

Todo el motor de correlación: tokenización y stop-words, `relevanceFor`,
ordenación cronológica, `readMemoryDirectoryEntries` (que excluye symlinks y
junctions), los tres `collect*Matches`, `summarizeContent`, `readHealthReport` y
`buildSemanticSummary`. Es un módulo autonomous: recibe `memoryDir` por
parámetro y no depende de `MEMORY_DIR` ni de `config`, lo que lo hace testeable
de forma aislada.

Preserva el **orden de declaración original**. `collectNoteMatches` referencia
`summarizeContent` y `collectHealthReportMatches` referencia `readHealthReport`,
ambas declaradas más abajo en el fichero original. Son llamadas en runtime
posteriores a la inicialización del módulo, así que no hay riesgo de TDZ, pero
conservar el orden mantiene el diff honesto como movimiento puro.

### Los seis registradores

Cada fichero contiene exactamente un `registerMantekaXTool(mcpServer, config)`,
con el mismo estilo que los ocho existentes: JSDoc sobre el export, `config` con
valor por defecto `{ sandboxed: false, root: process.cwd() }`, `import type`
para tipos, extensión `.js` en imports relativos y schemas Zod en línea.

El cuerpo de cada handler se traslada **sin cambios**: mismas cadenas de error,
mismos mensajes a `logger`, misma discriminate `config.sandboxed` entre
`buildSandboxErrorResponse` (que nunca filtra rutas del host) y
`buildMcpToolErrorResponse`.

## Cableado en `mcpServer.ts`

`import { registerMantekaTools } from './tools.js'` y la llamada
`registerMantekaTools(mcpServer, config)` se sustituyen por seis imports y seis
llamadas, en el **mismo punto** del árbol (tras `registerGrepRepomixOutputTool`,
antes del bloque condicional de sandbox), y en el **mismo orden** que el interior
de `registerMantekaTools`. Esto preserva el orden de `tools/list`, que es
parte de la interfaz observable del servidor STDIO.

## Garantía de interfaz

La superficie del servidor STDIO se conserva por construcción, no por
verificación posterior:

- Los seis nombres de herramienta son cadenas literales intactas.
- `title`, `description`, `inputSchema` y `outputSchema` se copian literalmente,
  incluidas las descripciones multilínea y el `z.any()` de
  `sessionPrediction`.
- El orden de registro se preserva (ver «Cableado»).
- Los valores por defecto de `config` coinciden con los de los ocho registradores
  existentes, por lo que un llamante que omita `config` obtiene el mismo
  comportamiento.

## Nota sobre typecheck

`tsconfig.json` declara `"exclude": ["tests/integration-tests/fixtures",
"src/mcp/**"]`, lo que sugiere que el subsistema MCP queda fuera del typecheck.
**No es así**: `exclude` solo filtra los globs de `include`, y los ficheros
alcanzables por `import` entran igualmente. `src/cli/actions/mcpAction.ts:1`
importa `runMcpServer`, por lo que el árbol `src/mcp` entra transitivamente en
el programa de `tsconfig.build.json`; los tests lo importan directamente, por lo
que también entra en el de `tsconfig.json`.

Verificado empíricamente con `tsc --listFiles`: los **13 ficheros** de
`src/mcp` aparecen en ambos programas, y `lib/mcp/` se emite en el build. Por
tanto `npm run build` y `npx tsc --noEmit` sí cubren el refactor; el `exclude`
es una entrada muerta que se deja fuera de alcance.

## Validación

1. `npm run build` — debe emitir `lib/mcp/tools/*.js` y.exit 0.
2. `npx tsc --noEmit` — exit 0.
3. `npx vitest run` — suite completa; los dos fallos de locale ya conocidos
   (`tests/core/skill/skillStatistics.test.ts`,
   `tests/cli/cliTokenBudget.test.ts`) son baseline preexistente documentado en
   `7643a3e2` y no pertenecen a este refactor.
4. `npm run lint` — sin errores.
5. `manteka_analyze_code_health` — el contador de code smells baja de 5 a 4.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Alterar el orden de `tools/list` | Las seis llamadas se insertan en el mismo punto y orden |
| Perder una cadena de error al mover código | Traslación literal; el test de `semantic_debug` cubre el camino de error de sandbox |
| Romper el aislamiento sandbox | `readMemoryDirectoryEntries` se traslada sin modificar; tres tests cubren symlink, junction y directorio no válido |
| Acoplamiento nuevo entre módulos | `memoryCorrelation` recibe `memoryDir` por parámetro; no depende de `MEMORY_DIR` ni de `config` |
