# Diseño — Manteka Smart-Slice (Fase 1)

- Fecha: 2026-10-02
- Estado: aprobado
- Autor: Lead Developer (asistido por OpenCode)
- Versión de referencia: `v1.18.1-manteka.1`

## 1. Objetivo

Permitir empaquetar un subconjunto quirúrgico de un repositorio en lugar de su
totalidad, cuando el usuario solo necesita el "radio de explosión" de un archivo
concreto para dárselo a un agente de IA.

La CLI expone `--smart <entry>` y `--smart-depth <n>`. El motor resuelve, de forma
heurística y estática, el árbol de dependencias **hacia abajo** del archivo de
entrada (los archivos que este importa, y los que estos importan) y restringe el
empaquetado estrictamente a ese conjunto.

## 2. Decisiones de diseño

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Motor de análisis | Regex/heurístico sobre JS/TS | Sin dependencias nuevas; suficiente para `import`/`export`/`require`/`import()` relativos |
| Dirección del grafo | Solo forward (hacia abajo) en Fase 1 | Los importadores exigirían recorrer todo el repo, anulando el ahorro de tokens |
| Restricción del set | Intersección con el resultado de `searchFiles` | Reutiliza toda la semántica de `include`/`ignore`/gitignore en un solo lugar |
| Dependencias ignoradas | Se descartan con aviso en stderr | Evita empaquetar `node_modules`/`dist` aun si el grafo los alcanza |
| Sintaxis soportada | Solo rutas relativas `./` y `../` | Cubre el caso mayoritario con muy pocos falsos positivos |
| Base de la entrada | Relativa al directorio objetivo, un único objetivo | Semántica inequívoca |
| README | No se incluye automáticamente | El objetivo es el conjunto mínimo y predecible |
| Config-file | No soportado en Fase 1 (solo CLI) | Es un modo de ejecución, análogo a `--stdin` |

## 3. Fuera de alcance (Fase 1)

- Dependencias inversas (importadores).
- Alias de `tsconfig.json` (`@/foo`) y bare packages.
- Lenguajes distintos de JS/TS.
- Clave en `repomix.config.json`.
- Integración con modo `--watch`.
- Inclusión automática del README.

## 4. Arquitectura

Nuevo módulo `src/core/smartSlice/`:

```text
src/core/smartSlice/
  types.ts            # Contratos de entrada/salida
  importParser.ts     # Extracción de especificadores + resolución de rutas (puro)
  dependencyGraph.ts  # BFS con profundidad y detección de ciclos (I/O inyectable)
  index.ts            # API pública: buildSmartSliceClosure()
```

### 4.1 `types.ts`

```ts
export interface SmartSliceOptions {
  rootDir: string;
  entry: string;
  depth: number;
}

export interface SmartSliceResult {
  entry: string;        // ruta relativa POSIX respecto a rootDir
  paths: string[];      // cierre completo, relativo POSIX, ordenado
  warnings: string[];   // especificadores no resueltos u observaciones
}
```

### 4.2 `importParser.ts` (puro)

- `extractImportSpecifiers(content: string): string[]`
  Una única expresión regular combinada reconoce:
  - `import X from '…'`, `import { … } from '…'`, `import type … from '…'`
  - `export { … } from '…'`, `export * from '…'`
  - `import '…'` (efecto lateral)
  - `import('…')` (dinámico) y `require('…')`
  Devuelve **solo** los especificadores que empiezan por `.`.

- `resolveSpecifier(args): string | null`
  Dado el especificador y la ruta absoluta del importador:
  1. Calcula la ruta candidata y descarta las que escapen de `rootDir`.
  2. Prueba la ruta exacta.
  3. Prueba con extensiones en orden:
     `.ts .tsx .js .jsx .mjs .cjs .mts .cts .json .vue`.
  4. Prueba `<candidata>/index.<ext>`.
  Devuelve la ruta relativa POSIX dentro de `rootDir`, o `null` si no existe.

### 4.3 `dependencyGraph.ts`

- `buildClosure(options, deps)` con `deps = { readFile, fileExists }` inyectables.
- BFS desde la entrada con `Set` de visitados (seguro ante ciclos) y corte por
  profundidad: `depth = 0` incluye solo la entrada; `depth = 1` añade sus imports
  directos; por defecto `depth = 2`.
- Los especificadores que no resuelven se acumulan en `warnings`.

### 4.4 `index.ts`

- `buildSmartSliceClosure(options): Promise<SmartSliceResult>` usa `fs/promises`
  reales, valida que la entrada exista y esté dentro de `rootDir`, y delega en
  `dependencyGraph`.

El motor **no** implementa lógica de ignore. Recorre las importaciones relativas
sin filtrar y la restricción final ocurre por intersección, de modo que
`include`/`ignore`/gitignore siguen teniendo un único punto de verdad.

## 5. Integración

### 5.1 CLI (`src/cli/cliRun.ts`)

En el grupo "File Selection Options":

- `--smart <entry>` — archivo de entrada para el empaquetado por dependencias.
- `--smart-depth <n>` — profundidad del árbol (entero ≥ 0, por defecto 2).
  Validador que lanza `RepomixError` ante valores no numéricos, igual que
  `--include-logs-count`.

### 5.2 `CliOptions` (`src/cli/types.ts`)

```ts
smart?: string;
smartDepth?: number;
```

Campos solo-CLI, sin cambios en `configSchema.ts` (precedente: `stdin`,
`enableFileProcessors`, `skillGenerate`). Cuando `--smart-depth` se omite, el
valor efectivo es `2`; la omisión se resuelve en `defaultAction` antes de invocar
al motor, no en el esquema de configuración.

### 5.3 `defaultAction.ts`

Antes de iniciar el spinner:

1. Valida combinaciones:
   - `--smart` con `--stdin` → error.
   - `--smart` con más de un directorio → error.
2. Resuelve `rootDir = targetPaths[0]` y la entrada relativa a él.
3. Llama a `buildSmartSliceClosure`.
4. Registra el banner:
   `🧠 Manteka Smart-Slice active: tracing dependencies from <entry> (depth N)`.
5. Emite los `warnings` por stderr.
6. Pasa `smartSlice: { entry, depth, paths }` a `pack()` vía `PackOptions`.

### 5.4 `packager.ts`

Tras `searchFiles` por raíz, intersecta `filePaths` con el conjunto del cierre.
El conjunto descartado por ignore se calcula como `cierre − buscados` y se
reporta como dependencias omitidas. El resto del pipeline no cambia.

## 6. Errores y casos límite

| Caso | Comportamiento |
| --- | --- |
| Entrada inexistente / ilegible | `RepomixError` con la ruta |
| Entrada fuera de `rootDir` | `RepomixError` |
| `--smart-depth` no entero o negativo | `RepomixError` en el parser |
| `--smart` + `--stdin` | `RepomixError` |
| `--smart` + varios directorios | `RepomixError` |
| Ciclo de importaciones | Resuelto por el `Set` de visitados |
| Especificador bare / alias / URL | Ignorado por diseño |
| Dependencia que cumple ignore | Descartada con aviso |

## 7. Testing

- `tests/core/smartSlice/importParser.test.ts`: extracción de especificadores,
  resolución con extensión e índice, rechazo de bare/alias, rechazo de escape.
- `tests/core/smartSlice/dependencyGraph.test.ts`: corte por profundidad, ciclos,
  archivos faltantes, deduplicación.
- Test de integración del `packager` con fixture temporal: el empaquetado
  contiene exactamente el cierre.
- Test de parseo CLI para `--smart` y `--smart-depth`.

## 8. Criterios de aceptación

- `npm run lint` sin errores ni advertencias.
- `npx tsc --noEmit` sin errores.
- `npm run build` correcto.
- `npm test` sin fallos nuevos respecto a la línea base.
- `node bin/repomix.cjs --smart src/index.ts --smart-depth 1` produce una salida
  limitada al cierre y muestra el banner.
