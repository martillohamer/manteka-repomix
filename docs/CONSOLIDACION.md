# Consolidación de fases — Manteka Repomix

Documento maestro que recoge el recorrido completo del proyecto, desde la documentación de arquitectura inicial hasta la aplicación del branding de Manteka Repomix. Resume qué se hizo en cada fase, por qué se hizo, cómo se verificó y qué queda pendiente de decisión.

**Repositorio:** `DAW1BSergiomg26/manteka-repomix` (fork de `yamadashy/repomix`)
**Base de trabajo:** `origin/main` @ `0b3f82b4`
**Alcance:** Fases 0 a 5

---

## 1. Arquitectura del proyecto

### 1.1. Qué es Repomix

Repomix empaqueta un repositorio completo en un único fichero con formato legible por modelos de IA. A diferencia de un volcado de texto plano, genera un documento estructurado que incluye: un resumen, el árbol de directorios, el contenido de cada fichero, y opcionalmente los diffs de Git y el historial de commits. Ese formato es el que consume un modelo cuando necesita entender un proyecto entero en una sola petición.

### 1.2. Stack tecnológico

| Elemento | Tecnología |
| --- | --- |
| Lenguaje | TypeScript (`^7.0.2`), ESM puro (`"type": "module"`) |
| Runtime | Node.js `>=22.0.0`; la referencia de desarrollo es `24.15.0` (`.tool-versions`) |
| Empaquetado | npm, paquete público `repomix` (`mcpName`: `io.github.yamadashy/repomix`) |
| Plantillas de salida | Handlebars |
| Validación de esquemas | Valibot + Zod (interoperabilidad en la carga de configuración) |
| Análisis de código | Tree-sitter + WebAssembly (compresión semántica con `--compress`) |
| Conteo de tokens | `gpt-tokenizer` (`o200k_base` por defecto, `cl100k_base` disponible) |
| Protocolo de contexto | Model Context Protocol (MCP) sobre stdio |
| Lint y formateo | Biome, Oxlint, Secretlint, `typos` |
| Pruebas | Vitest 5 |
| CI | GitHub Actions (4 workflows de validación) |

### 1.3. Estructura del código fuente

El árbol `src/` contiene 142 ficheros TypeScript repartidos en seis módulos de primer nivel:

```
src/
├── index.ts          API pública de librería (punto de entrada para consumidores)
├── cli/              Capa de línea de comandos
│   ├── cliRun.ts         Definición de opciones con Commander y despacho de acciones
│   ├── actions/          Implementación de cada acción (default, init, remote, watch, mcp, version, migration)
│   ├── prompts/          Diálogos interactivos de @clack/prompts
│   └── reporters/        Presentación de resultados en consola
├── config/           Carga, fusión y validación de configuración (Valibot)
├── core/             Lógica de negocio
│   ├── file/            Recolección, ordenación y procesamiento de ficheros
│   ├── git/             Integración con Git (diff, logs, remotos, archivado)
│   ├── metrics/         Conteo de tokens y métricas (con workers)
│   ├── output/          Generación de salida (Handlebars, estilos XML/Markdown/JSON/plain)
│   ├── packager/        Orquestación del empaquetado y escritura a disco
│   ├── security/        Detección de secretos y validación de seguridad
│   ├── skill/           Generación de Claude Agent Skills
│   └── treeSitter/      Parseo AST y estrategias por lenguaje
├── mcp/              Servidor MCP y sus herramientas
├── shared/           Utilidades transversales (logger, concurrencia, errores, workers)
└── types/            Declaraciones de tipos Ambientales
```

**Puntos de entrada reales del programa:**

- `bin/repomix.cjs` — ejecutable publicado en npm; es lo que invoca el usuario.
- `src/index.ts` — API pública de librería. Quien consume Repomix como dependencia entra por aquí, no por la CLI. La propia documentación de `serverJson.test.ts` advierte de esto: *"every registry-based install would launch repomix without MCP mode"*.
- `src/cli/cliRun.ts` — parseo de opciones y punto de bifurcación entre acción por defecto, remota, watch, MCP, init y version.

### 1.4. Arquitectura de la salida

La generación de salida es el corazón del producto y sigue una cadena de cuatro etapas:

1. **Recolección** (`core/file/`) — búsqueda de ficheros según patrones de inclusión, exclusión, `.gitignore` y patrones por defecto.
2. **Procesamiento** (`core/file/`) — por fichero: eliminación de comentarios, líneas vacías, truncado de base64, prefijo de números de línea, y opcionalmente compresión vía Tree-sitter.
3. **Construcción del contexto** (`core/output/outputGenerate.ts`) — `createRenderContext()` ensambla cabecera, propósito, guidelines, notas, árbol y contenidos.
4. **Renderizado** — dos caminos distintos según el estilo:
   - **Plantillas Handlebars** para `xml`, `markdown` y `plain` (`core/output/outputStyles/`), con caché de plantillas compiladas.
   - **Serializadores propios** para `json` y para el modo `--parsable-style` de XML (`fast-xml-builder`), que no pasan por Handlebars.

Esta bifurcación es relevante para cualquier cambio de branding: **las cabeceras generadas por `generateHeader()` alimentan a los cuatro caminos de salida**, pero las plantillas XML/Markdown/plain no contienen texto de marca propio — lo reciben vía el contexto de renderizado. Por eso el rebranding de cabeceras solo requiere tocar `outputStyleDecorate.ts`.

### 1.5. Rendimiento y concurrencia

El procesamiento usa `tinypool` para los worker pools, con afinidad por tipo de fichero, más una cola de tareas asíncronas (`shared/asyncMap.ts`). Los workers viven en `core/metrics/workers/` y `core/security/workers/`. La concurrencia se controla en `shared/processConcurrency.ts`.

---

## 2. Fase 0 — Documentación de arquitectura

**PR #1** · rama `docs/fase-0-arquitectura` · 1 fichero, +690 líneas

Primer punto de contacto con el repositorio. Se documentó la arquitectura con un diagrama del flujo de sistema, cubriendo los seis módulos, los puntos de entrada, la cadena de generación de salida y el sistema de build y empaquetado.

**Por qué era necesaria:** el repositorio es un fork de un proyecto upstream ajeno, con una base de 142 ficheros de código y 21 workflows de CI. Sin mapa arquitectónico previo, cualquier decisión de personalización era especulativa.

---

## 3. Fase 1 — Línea base y corrección de vulnerabilidades

**PR #2** · rama `chore/fase-1-baseline` · 2 ficheros, +171/-9

### 3.1. Hallazgo crítico: 431 errores de lint que no existían

La primera ejecución del lint en Windows produjo 431 errores de formato en Biome. La causa no era el código: era la configuración.

El repositorio declara `end_of_line = lf` en `.editorconfig`, pero **no tenía ninguna regla en Git que lo garantizara**. Con la configuración global por defecto de Windows (`core.autocrlf = true`), el checkout convertía todos los ficheros de texto a CRLF. Biome, que lee el byte real del disco, interpretaba cada salto de línea como un problema de formato.

La corrección de la Fase 1 fue deliberadamente local: `git config --local core.autocrlf false`. Esto arreglaba la máquina, pero **no viajaba con el repositorio**. Cualquier colaborador en Windows reproducía el problema. Esa limitación es exactamente lo que motivó la Fase 2.

### 3.2. Corrección de vulnerabilidades transitivas

`npm audit` reportaba 3 vulnerabilidades en dependencias transitivas (una alta, dos moderadas), corregidas con `npm audit fix` sobre el lockfile. Resultado: **0 vulnerabilidades**.

**Nota de trazabilidad:** el PR #2 parte de `origin/main`, igual que las fases posteriores. Por tanto, mientras #2 no se mergee, las 3 vulnerabilidades siguen presentes en `main` y reaparecen en el output de `npm audit` de las ramas de fases posteriores. Este PR no las reintroduce: sencillamente nunca las recibió.

---

## 4. Fase 2 — Normalización de saltos de línea (`.gitattributes`)

**PR #3** · rama `chore/fase-2-gitattributes` · 69 ficheros, +2009/-1982

### 4.1. El problema que resuelve

La solución local de la Fase 1 no era reproducible. La causa raíz seguía viva: nada en el repositorio obligaba a LF. La Fase 2 ataca el problema donde está —en la configuración versionada— para que el comportamiento sea idéntico en cualquier máquina y sistema operativo.

### 4.2. Contenido de `.gitattributes`

Cuatro bloques, 20 líneas de regla:

1. **Normalización global** — `* text=auto eol=lf`
2. **Binarios** — 14 tipos declarados explícitamente (`png`, `jpg`, `gif`, `ico`, `pdf`, `zip`, `gz`, `woff`, `woff2`, `ttf`, `eot`, `mp4`, `webp`, `wasm`)
3. **Ficheros generados** — `linguist-generated=true` en `package-lock.json` y `.github/releases/**`
4. **Reglas defensivas CRLF** — `*.bat`, `*.cmd`, `*.ps1` con `text eol=crlf` (no existen hoy en el repositorio; deben funcionar si se añaden)

### 4.3. Verificación

La prueba crítica del PR no es "el lint pasa", sino que **el diff es exclusivamente de fin de línea**:

```console
$ git diff --cached --ignore-cr-at-eol --stat
 .gitattributes | 27 +++++++++++++++++++++++++++
 1 file changed, 27 insertions(+)
```

Al ignorar el carácter CR, el único cambio real de contenido es el propio `.gitattributes`. Las 68 notas de release son 100 % conversión CRLF→LF.

**Resultado del estado EOL:**

| Indicador | Antes | Después |
| --- | --- | --- |
| `i/lf` | 1090 | 1159 |
| `i/mixed` | **68** | **0** |
| `i/crlf` | 0 | 0 |
| `i/-text` (binarios) | 23 | 23 |
| `w/mixed` o `w/crlf` | 68 | **0** |

**Prueba de independencia respecto a la configuración local:** se clonó el repositorio en un directorio temporal con el valor por defecto de Windows (`core.autocrlf=true`) y se comprobó que Git entrega los 1159 ficheros de texto en LF pese a esa configuración. La configuración local dejó de ser necesaria para el comportamiento correcto.

### 4.4. Detalle técnico: ficheros puntero

`AGENTS.md`, `CLAUDE.md` y los directorios `.claude/agents`, `.cursor/`, `.kiro/` contienen ficheros de texto de una línea que emulan symlinks de Unix. Git los trata como texto, no como enlaces. Bajo `* text=auto eol=lf` ya cumplían las reglas, por lo que no requirieron cambios.

---

## 5. Fase 3 — Pipeline de validación local

**PR #4** · rama `chore/fase-3-ci-checks` · 1 fichero, +198 líneas

### 5.1. Revisión de los workflows de CI

El repositorio contiene 21 workflows. Los cuatro que validan el núcleo son:

| Workflow | Jobs |
| --- | --- |
| `ci.yml` | `lint-biome`, `lint-oxlint`, `lint-ts`, `lint-secretlint`, `test` (matriz 3 SO × 3 versiones de Node), `test-bun`, `test-coverage`, `build-and-run`, `build-and-run-bun` |
| `ci-quality.yml` | `actionlint`, `zizmor`, `typos` |
| `ci-browser.yml` | Lint y pruebas de la extensión de navegador (`browser/`) |
| `ci-website.yml` | Validación de `website/` |

Matriz de `test` y `build-and-run`: `ubuntu-latest`, `windows-latest` y `macos-latest`, contra Node `22.x`, `24.x` y `26.x`. Además, `test-bun` y `build-and-run-bun` validan Bun como runtime.

### 5.2. Detalle que condiciona la experiencia local

Los jobs `lint-biome` y `lint-oxlint` ejecutan `biome check --write` y `oxlint --fix` respectivamente, y acto seguido ejecutan `git diff --exit-code`. La semántica es: *aplica las correcciones automáticas y verifica que no hubiera nada que corregir*. En local esto significa que los linters **modifican ficheros** si el código no está limpio, y que `git diff --exit-code` posterior es el que determina si el código estaba limpio.

### 5.3. `docs/CI_LOCAL.md`

Guía con requisitos previos, ejecución rápida, desglose job por job con su equivalente local, tabla de matriz CI frente a local, y notas sobre los tests que fallan por locale y la diferencia entre `npm ci` y `npm install`.

### 5.4. Observación operativa

Ningún workflow de CI se ejecuta en los PRs de este fork: los 6 PRs abiertos no tienen checks asociados. La validación es, por tanto, íntegramente local. Esto es una limitación del entorno de fork, no del diseño de los workflows, que en el upstream sí se ejecutan.

---

## 6. Fase 4 — Preparación de personalizaciones

**PR #5** · rama `feat/fase-4-custom-prep` · 1 fichero, +134 líneas

`docs/CUSTOM_PREP.md` identifica los puntos de extensión del código fuente que la Fase 5 modificaría, con ruta, línea aproximada y cambio previsto para cada uno. La estimación fue de ~35 líneas en 9 ficheros, exclusivamente rebranding sin alterar lógica.

El mapa reveló dos puntos que la Fase 4 anticipó peor de lo previsto:

- **`server.json`** no figuraba en el mapa original. Resultó ser obligatorio: un test de contrato (`serverJson.test.ts`) comprueba que `mcpName` en `package.json` coincida con `name` en `server.json`, y que el identificador npm publicado coincida con `packageJson.name`. Cambiar el nombre del paquete obliga a cambiar `server.json` en el mismo commit.
- **`versionAction.test.ts`** no aparecía entre los tests que fallarían. Sí lo hizo.

Ambos se incorporaron en la Fase 5.

---

## 7. Fase 5 — Branding de Manteka Repomix

**PR #6** · rama `feat/fase-5-branding` · 15 ficheros, +38/-36

### 7.1. Metadatos del paquete

| Campo | Antes | Después |
| --- | --- | --- |
| `name` | `repomix` | `manteka-repomix` |
| `description` | `A tool to pack repository contents to single file for AI consumption` | `Manteka Repomix - Pack your repository into a single AI-friendly file` |
| `author` | `Kazuki Yamada` | `Sergio (DAW1BSergiomg26)` |
| `homepage` | `https://github.com/yamadashy/repomix` | `https://github.com/DAW1BSergiomg26/manteka-repomix` |
| `repository.url` | `git://github.com/yamadashy/repomix.git` | `git://github.com/DAW1BSergiomg26/manteka-repomix.git` |
| `bugs.url` | `https://github.com/yamadashy/repomix/issues` | `https://github.com/DAW1BSergiomg26/manteka-repomix/issues` |
| `mcpName` | `io.github.yamadashy/repomix` | `io.github.DAW1BSergiomg26/manteka-repomix` |

`server.json` se actualizó en el mismo commit (`name`, `title`, `repository.url`, `packages[].identifier`) para mantener el contrato que verifica `serverJson.test.ts`.

### 7.2. CLI, MCP y cabeceras de salida

| Ámbito | Cambio |
| --- | --- |
| `cli/cliRun.ts` | Descripción del programa y saludo `📦 Manteka Repomix v1.18.1` |
| `cli/actions/versionAction.ts` | `--version` imprime `Manteka Repomix v1.18.1` en lugar del número suelto |
| `cli/actions/initAction.ts` | Mensajes de bienvenida de `--init` |
| `cli/actions/mcpAction.ts` | Log de arranque del servidor MCP |
| `mcp/mcpServer.ts` | Nombre del servidor (`manteka-repomix-mcp-server`), instrucciones y logs de ciclo de vida |
| `core/output/outputStyleDecorate.ts` | Cabecera (`combined into a single document by Manteka Repomix.`) y notas de salida |
| `shared/constants.ts` | `REPOMIX_GITHUB_URL` apunta al fork |

Las plantillas de `core/output/outputStyles/` **no se modificaron**: no contienen texto de marca propio, sino que reciben las cabeceras vía `createRenderContext()`. Basta con modificar `outputStyleDecorate.ts` para que las cuatro rutas de salida (tres plantillas Handlebars más los serializadores JSON y XML-parsable) reflejen el branding.

### 7.3. Verificación en ejecución real

```console
$ node bin/repomix.cjs --version
Manteka Repomix v1.18.1

$ node bin/repomix.cjs --help
Manteka Repomix - Pack your repository into a single AI-friendly file

$ node bin/repomix.cjs --include 'src/shared/constants.ts' -o salida.xml
📦 Manteka Repomix v1.18.1
```

Cabecera del fichero generado:

```text
This file is a merged representation of a subset of the codebase, containing
specifically included files, combined into a single document by Manteka Repomix.
```

### 7.4. Un test que deliberadamente no se modificó

`tests/cli/actions/migrationAction.test.ts` afirma que `fs.writeFile` recibe `'# Repomix Instructions'`. **Ese test se dejó intacto a propósito.**

El nombre del test sugiere que verifica un mensaje de marca, pero no lo hace. La acción de migración procesa ficheros del antiguo producto *Repopack*: lee el fichero legacy y copia su contenido al nuevo, con `replaceRepopackString()` aplicando únicamente la sustitución `repopack` → `repomix`. El texto `# Repomix Instructions` es **contenido de usuario de un fichero preexistente**, no branding de Manteka.

Durante la implementación se modificó la aserción y el test falló, lo que reveló el error de razonamiento. Se revirtió, y se dejó documentado el motivo en la descripción del PR para que nadie lo "arregle" en el futuro.

---

## 8. Estado de validación

Comandos ejecutados en la base de trabajo, con resultados verificados:

| Comprobación | Exit | Resultado |
| --- | --- | --- |
| `npm ci` | 0 | Instalación limpia desde el lockfile |
| `npm run lint` | 0 | Biome: 494 ficheros, 3 warnings preexistentes, 0 errores. Oxlint: 0/0. Secretlint: 0 |
| `npm run build` | 0 | `rimraf lib && tsc -p tsconfig.build.json` |
| `npx tsc --noEmit` | 0 | Sin errores de tipos |
| `npx vitest run` | 1 | 150 de 152 ficheros pasan; 1 omitido; **2 fallan** |
| `node bin/repomix.cjs --version` | 0 | `Manteka Repomix v1.18.1` (con el branding del PR #6 mergeado) |

### 8.1. Los dos tests que fallan

| Test | Motivo |
| --- | --- |
| `tests/cli/cliTokenBudget.test.ts` → `validateTokenBudget` | Formato de números con el separador decimal del locale del sistema |
| `tests/core/skill/skillStatistics.test.ts` → `generateStatisticsSection` | Formato de números grandes con `toLocaleString` |

Ambos dependen del locale del sistema operativo. En un Windows configurado con `es-ES`, `Intl` produce `1.234,56` en lugar de `1,234.56`, y la aserción espera el formato anglosajón. En CI (`ubuntu-latest`, locale `en-US`) pasan.

**No son regresiones de ninguna fase.** Aparecieron en la Fase 1, antes de tocar nada, y su número se ha mantenido constante en las seis fases. Corregirlos exigiría hacer los tests independientes del locale, lo que es trabajo de producto fuera del alcance de estas fases.

### 8.2. Los tres warnings de Biome

Preexistentes y en ficheros no relacionados con el rebranding: una supresión de regla en `src/cli/cliSpinner.ts`, una interpolación en un nombre de test en `tests/core/file/binaryDetection.test.ts`, y una cadena de `?.` opcional en `bin/repomix.cjs`. Los tres están suprimidos o son advertencias informativas, no errores.

---

## 9. Estado de los PRs abiertos

Los seis PRs cuelgan de `main` de forma independiente, sin dependencias entre ellos.

| PR | Rama | Alcance | Cambios |
| --- | --- | --- | --- |
| [#1](https://github.com/DAW1BSergiomg26/manteka-repomix/pull/1) | `docs/fase-0-arquitectura` | Documentación de arquitectura y diagrama de flujo | 1 fichero, +690 |
| [#2](https://github.com/DAW1BSergiomg26/manteka-repomix/pull/2) | `chore/fase-1-baseline` | Línea base y corrección de vulnerabilidades transitivas | 2 ficheros, +171/-9 |
| [#3](https://github.com/DAW1BSergiomg26/manteka-repomix/pull/3) | `chore/fase-2-gitattributes` | `.gitattributes` y normalización a LF | 69 ficheros, +2009/-1982 |
| [#4](https://github.com/DAW1BSergiomg26/manteka-repomix/pull/4) | `chore/fase-3-ci-checks` | Documentación del pipeline de CI local | 1 fichero, +198 |
| [#5](https://github.com/DAW1BSergiomg26/manteka-repomix/pull/5) | `feat/fase-4-custom-prep` | Mapa de puntos de extensión | 1 fichero, +134 |
| [#6](https://github.com/DAW1BSergiomg26/manteka-repomix/pull/6) | `feat/fase-5-branding` | Rebranding de metadatos, CLI, MCP y cabeceras | 15 ficheros, +38/-36 |
| #7 | `chore/fase-6-consolidation` | Este documento maestro | 1 fichero |

### 9.1. Orden de merge recomendado

El orden importa por dos motivos: el PR #3 modifica 68 ficheros de las notas de release, y el PR #2 toca el lockfile.

1. **#1 (arquitectura)** — sin dependencias, puramente aditivo.
2. **#2 (línea base)** — corrige el lockfile. Conviene mergearlo pronto para que `npm audit` deje de reportar vulnerabilidades en las ramas siguientes.
3. **#3 (`.gitattributes`)** — normaliza el índice. **Debe ir antes que cualquier cambio de código**, porque las fases siguientes modifican ficheros de texto: normalizar primero evita que el branding se introduzca con finales de línea inconsistentes.
4. **#4 (CI local)**, **#5 (custom prep)**, **#6 (branding)** — independientes entre sí, todos aditivos salvo #6, que no solapa ficheros con #3.
5. **#7 (este documento)** — en último lugar, para que el resumen refleje el estado final.

### 9.2. Ausencia de CI en los PRs del fork

Ninguno de los 7 PRs muestra checks. Los workflows existen y están activos, pero no se ejecutan para PRs desde un fork. La consecuencia práctica es que **la calidad de cada PR depende enteramente de la validación local descrita en `docs/CI_LOCAL.md`**. Las tablas de resultados de este documento son la evidencia disponible en lugar de los checks de CI.

---

## 10. Riesgos y decisiones pendientes

### 10.1. Publicación en el MCP Registry

`mcp-registry-publish.yml` publica bajo el espacio `io.github.<propietario>/`. Con `mcpName` en `io.github.DAW1BSergiomg26/manteka-repomix`, publicar el fork requerirá credenciales OIDC de esa cuenta y un paquete `manteka-repomix` existente en npm.

**Si la intención es publicar en el espacio de nombres del upstream, `mcpName` debe conservarse como `io.github.yamadashy/repomix`.** Decisión pendiente de Sergio antes de mergear #6.

### 10.2. Dependencias transitivas

Mientras #2 no se mergee, `npm audit` reporta 3 vulnerabilidades en las ramas que parten de `main`. Se resuelven al mergear #2.

### 10.3. Tests dependientes de locale

Los 2 tests que fallan localmente llevan fallando desde la Fase 1. Mergear el PR que los arregle reduciría el ruido de validación local, pero exige modificar tests de producto y queda fuera del alcance de estas fases.

### 10.4. Actualización respecto al upstream

`main` está en `0b3f82b4`, un merge de renovate del upstream. Cada PR abierto se ha creado desde ese mismo commit, lo que mantiene los seis alineados. Cuando se mergeen, la base común se moverá y `git rebase` sobre los restantes será necesario si el upstream ha avanzado.

---

## 11. Resumen ejecutivo

Seis fases han dejado el fork en un estado verificable y coherente:

- **Documentado** el punto de entrada al proyecto y su arquitectura (Fase 0).
- **Establecida una línea base** con las vulnerabilidades transitivas corregidas (Fase 1).
- **Resuelto un defecto de configuración que afectaba a todos los colaboradores en Windows**: 431 errores de lint falsos y 68 ficheros con finales de línea mezclados, mediante una solución versionada y verificada con un clon independiente (Fase 2).
- **Documentado cómo reproducir el pipeline de CI en local**, ante la ausencia de checks en PRs de fork (Fase 3).
- **Mapeados los puntos de extensión** antes de tocar nada (Fase 4).
- **Aplicado el branding de Manteka Repomix** en 15 ficheros, con dos correcciones al mapa original y un test que se dejó intacto deliberadamente (Fase 5).

El estado de validación es estable: lint, typecheck y build en exit 0; 150 de 152 ficheros de test en verde; los 2 fallos restantes son locale-dependent y preexistentes desde la Fase 1.

El siguiente paso natural es revisar los seis PRs abiertos, decidir sobre el `mcpName` del MCP Registry y mergear en el orden recomendado de la sección 9.1.
