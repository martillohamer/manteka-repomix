# Decomposición de `skillTechStack.ts` — Fase 1

Fecha: 2026-10-03
Estado: aprobado
Alcance: refactor de estructura únicamente, sin cambios de comportamiento

## Problema

`src/core/skill/skillTechStack.ts` tiene 657 líneas y es el mayor code smell
registrado por `manteka_analyze_code_health` (umbral: 400 líneas). El fichero
mezcla cuatro responsabilidades:

1. Definición de tipos (`DependencyInfo`, `RuntimeVersion`, `TechStackInfo`).
2. Once parsers de manifiestos, uno por ecosistema/gestor.
3. Tablas de datos: `DEPENDENCY_FILES`, `VERSION_FILES` y 95 líneas de
   `CONFIG_FILE_PATTERNS`.
4. Orquestación (`detectTechStack`) y renderizado a Markdown (`generateTechStackMd`).

El tamaño no viene de una preocupación cohesionada, sino de la acumulación de
parsers, por lo que superar el tamaño es aquí una señal de mezcla de
responsabilidades, no de volumen inherente.

## Objetivo

Reducir el fichero a una fachada y distribuir cada responsabilidad en un módulo
focused, manteniendo la superficie pública y la salida idénticas bit a bit.

## No objetivos

- Cambiar la lógica de detección o el Markdown generado.
- Corregir la fragilidad de los parsers basados en regex (TOML, XML, Gradle).
- Unificar los once parsers repetitivos ni extraer el mapeo runtime→nombre.
- Convertir `CONFIG_FILE_PATTERNS` de `string[]` a `Set<string>`.

Los tres últimos puntos son cambios de código reales, no movimientos, y quedan
para una fase posterior.

## Arquitectura

```
src/core/skill/
├── skillTechStack.ts              → fachada (re-export), ~5 líneas
└── techStack/
    ├── types.ts                   → tipos compartidos + aliases de parser
    ├── configFilePatterns.ts      → CONFIG_FILE_PATTERNS
    ├── versionFiles.ts            → parsers de runtime + VERSION_FILES
    ├── manifestFiles.ts           → registro DEPENDENCY_FILES
    ├── parsers/
    │   ├── packageJson.ts
    │   ├── python.ts
    │   ├── go.ts
    │   ├── rust.ts
    │   ├── php.ts
    │   ├── ruby.ts
    │   └── jvm.ts
    ├── detectTechStack.ts
    └── generateTechStackMd.ts
```

Sigue el precedente de submódulos ya presente en el árbol: `core/file/workers/`,
`core/metrics/workers/`, `core/output/outputStyles/`,
`core/treeSitter/parseStrategies/`.

### Agrupación de parsers por ecosistema

Se agrupan por ecosistema en lugar de un fichero por formato: once ficheros de
~15 líneas fragmentarían la lógica sin aislar ninguna preocupación real, mientras
que `parsers/python.ts` (requirements.txt, pyproject.toml, Pipfile) o
`parsers/jvm.ts` (pom.xml, build.gradle) siguen siendo una responsabilidad única y
coherente — parsear los manifiestos de un ecosistema.

| Fichero | Formatos | Lenguaje declarado |
|---|---|---|
| `parsers/packageJson.ts` | `package.json` | Node.js |
| `parsers/python.ts` | `requirements.txt`, `pyproject.toml`, `Pipfile` | Python |
| `parsers/go.ts` | `go.mod` | Go |
| `parsers/rust.ts` | `Cargo.toml` | Rust |
| `parsers/php.ts` | `composer.json` | PHP |
| `parsers/ruby.ts` | `Gemfile` | Ruby |
| `parsers/jvm.ts` | `pom.xml`, `build.gradle`, `build.gradle.kts` | Java / Java-Kotlin / Kotlin |

## Contratos y tipos

`types.ts` exporta los tres tipos existentes sin modificarlos:

```ts
export interface DependencyInfo { name: string; version?: string; isDev?: boolean; }
export interface RuntimeVersion { runtime: string; version: string; }
export interface TechStackInfo { path: string; languages: string[]; frameworks: string[];
  dependencies: DependencyInfo[]; devDependencies: DependencyInfo[];
  packageManager?: string; runtimeVersions: RuntimeVersion[]; configFiles: string[]; }
```

Dos aliases nuevos reemplazan las firmas inline de los registros. Son
type-only, por lo que no afectan al runtime:

```ts
export type DependencyParser = (content: string) => Partial<TechStackInfo>;
export type VersionParser = (content: string) => RuntimeVersion[];
```

Exportar estos tipos es necesario para compartirlos entre módulos. No amplía la
API del paquete: la fachada solo re-exporta las dos funciones públicas.

### Grafo de dependencias

```
types.ts                ← manifestFiles, versionFiles, detectTechStack,
                          generateTechStackMd, parsers/*
parsers/*               ← types
manifestFiles.ts        ← types, parsers/*
versionFiles.ts         ← types
detectTechStack.ts      ← types, manifestFiles, versionFiles, configFilePatterns
generateTechStackMd.ts  ← types
skillTechStack.ts       ← detectTechStack, generateTechStackMd
```

Acíclico. `DEPENDENCY_FILES` y `VERSION_FILES` siguen siendo constantes que
referencian declaraciones de función definidas más abajo en su módulo, por lo que
el hoisting original se conserva y el orden de evaluación no cambia respecto al
fichero monolítico.

## Superficie pública

`skillTechStack.ts` queda como fachada:

```ts
export { detectTechStack } from './techStack/detectTechStack.js';
export { generateTechStackMd } from './techStack/generateTechStackMd.js';
```

Los consumidores no se modifican:

- `src/core/skill/packSkill.ts:16` — importa ambos desde `./skillTechStack.js`.
- `tests/core/skill/skillTechStack.test.ts` — 465 líneas, sin cambios.

## Verificación

1. `npm run build` — usa `tsconfig.build.json` (`rimraf lib && tsc`).
2. `npx tsc --noEmit` — `strict: true`, `verbatimModuleSyntax: true`,
   `declaration: true`. Todo import de tipos debe usar `import type`, y las
   rutas relativas deben llevar extensión `.js` (`moduleResolution: NodeNext`).
3. `npx vitest run` — suite completa. La extracción pura implica que los tests
   existentes pasan sin modificación; son la prueba de equivalencia.
4. `npm run lint` — Biome, oxlint, `tsc --noEmit`, secretlint.

Nota de alcance: `src/mcp/**` está excluido en `tsconfig.json:21` y por tanto
queda fuera del typecheck del raíz. Es preexistente y no afecta a este refactor.

## Riesgo

Bajo, y acotado por diseño: no hay ninguna línea de lógica nueva. El riesgo real
es un error de transcripción al mover el código, que la suite de tests existente
debe detectar. Las 465 líneas de `skillTechStack.test.ts` cubren los once
parsers, el agrupamiento por directorio, la deduplicación y el renderizado.