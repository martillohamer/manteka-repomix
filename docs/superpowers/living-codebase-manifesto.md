# The Living Codebase Manifesto

> **Pilar 3 de 3 — Fase 2: Estandarización del Patrón Living Codebase**
> Estado: norma vigente · Ámbito: todo repositorio que adopte `.manteka-memory/`

---

## Preámbulo

Este documento es la norma normativa del patrón *Living Codebase*. No es una guía
de estilo ni una recomendación: es un contrato verificable. Cada afirmación
normativa tiene una implementación correspondiente en el código, y el
[Apéndice A](#apéndice-a--trazabilidad) cita el fichero y la línea de cada una.

Cuando una afirmación de este documento **no** esté respaldada por código, está
marcada explícitamente como `PENDIENTE`. No se admiten afirmaciones normativas
sin respaldo. Si una regla y su implementación divergen, **manda el código** y
la divergencia es un bug del estándar, no una excepción tolerable.

---

## 1. Filosofía y Propósito Core

### 1.1 Definición

Un **Living Codebase** es un repositorio que ha dejado de ser un artefacto
estático y ha pasado a ser un **sistema auto-auditable, inteligente y
adaptativo**.

La analogía es anatómica: el código es el cuerpo, pero un cuerpo sin memoria ni
reflejos no se considera vivo. Un repositorio vivo tiene tres propiedades
simultáneas:

| Propiedad | Significado | Mecanismo |
|---|---|---|
| **Auto-auditable** | El sistema mide su propia salud sin intervención humana. | `manteka_analyze_code_health` |
| **Inteligente** | El sistema infiere contexto cruzando su propio historial. | `manteka_semantic_debug` |
| **Adaptativo** | El sistema mantiene un estado vivo que refleja la realidad actual. | `.manteka-memory/` |

Un repositorio que solo tenga tests automatizados **no** es un Living Codebase:
los tests verifican que el autor acertó al escribir el test. Un Living Codebase
se audita a sí mismo *después* de los tests, sobre el estado real del árbol de
ficheros, y deja constancia escrita de lo que encontró.

### 1.2 La ecuación

El patrón se sostiene sobre tres legs, y **ninguna es opcional**:

```
  Código            +        Memoria local         +        Protocolo MCP
   (qué hay)                   (qué pasó, por qué)              (quién pregunta y quién responde)
      │                                  │                                │
      └──────────────┬───────────────────┴────────────────────────────────┘
                     ▼
              Sistema auto-auditable
```

- **Código**: el estado actual, verificable por el SCM.
- **Memoria local** (`.manteka-memory/`): el estado histórico y el contexto. Sin
  ella no existe auditabilidad; solo existe el código actual.
- **Protocolo MCP**: el canal deinteropérabilidad. Sin él, la memoria es un
  directorio inerte que nadie consulta.

Retirar cualquiera de las tres legs degrada el sistema a una de dos formas
distintas, y conviene no confundirlas:

- Sin memoria → el repositorio es estático, pero **honesto**: no miente.
- Sin MCP → el repositorio acumula historia, pero **muda**: nadie la consulta.

### 1.3 Anti-objetivos

Lo que un Living Codebase **no** pretende ser:

- **No es un sustituto de los tests.** No descubre errores funcionales; mide
  forma y tamaño.
- **No es un linter.** No aplica estilo, ni formatea, ni falla el build.
- **No es observabilidad en tiempo de ejecución.** No instrumenta producción; es
  análisis estático con memoria.
- **No es un servicio centralizado.** La memoria es deliberadamente local.

---

## 2. La Regla de Oro del Código (< 400 líneas)

### 2.1 La métrica

** Norma: ningún fichero fuente superará las 400 líneas.**

Esta es la métrica de salud fundamental del patrón. Un fichero por encima de
ese umbral se registra automáticamente como *code smell* de severidad `medium`,
con el mensaje:

```
File exceeds 400 lines (N lines). Consider modularizing.
```

El razonamiento detrás del umbral no es arbitrario: por debajo de ~400 líneas un
fichero cabe en la ventana de contexto de un modelo de lenguaje con holgura, y
por tanto puede ser leído, razonado y revisado **completo** en una sola pasada.
Un fichero más largo no es "más grande", es **revisado peor**: el modelo lee un
porcentaje y extrapola el resto. El límite no es estético, es un límite de
*legibilidad por máquina*.

### 2.2 El principio de Extracción Pura

La respuesta a un smell de tamaño **no** es "partir el fichero en trozos", sino
**extraer responsabilidades completas**. Extraer por requisito es el error
clásico: produce varios ficheros incoherentes entre sí, duplicados, y con
importaciones cruzadas que hacen que leer uno exija leer los otros tres.

**Extracción Pura** significa: identificar una responsabilidad con nombre propio,
extraerla a un submódulo cohesivo, y hacerlo **sin alterar la API pública ni el
comportamiento observable**.

Invariantes de una Extracción Pura:

1. **La API pública no cambia.** Las firmas exportadas por el punto de entrada
   permanecen byte-idénticas. Si cambian, no es una extracción: es un rediseño, y
   exige su propio Just-In-Time review.
2. **El comportamiento observable no cambia.** Misma entrada, misma salida,
   mismos errores. Un cambio de comportamiento **no** puede colarse en un commit
   titulado "refactor".
3. **Cada submódulo extraído es cohesivo y autosuficiente.** Si necesita leer
   partes de tres ficheros distintos para explicarse, la frontera está mal puesta.
4. **La extracción es mecánica y verificable.** Si no puede describirse como un
   diff legible, probablemente no es una extracción pura.
5. **Sin ceremonia.** No se añaden capas, abstracciones ni indirecciones que no
   existieran antes. La meta es reducir líneas por fichero, **no** crear un
   framework.

Procedimiento:

```
1. Identificar la responsabilidad   →  darle nombre ("qué sabe hacer")
2. Localizar su frontera            →  clump de imports/estado que la surrounds
3. Extraer                          →  nuevo submódulo, imports hacia dentro
4. Verificar API + comportamiento   →  build + tsc + tests, sin tocar el estado
5. Verificar la métrica             →  el smell desaparece, la API no se movió
```

### 2.3 Alcance real y límites medidos de la métrica

Esta sección es normativa. Un estándar que oculta los límites de su propia
métrica es peor que no tener estándar, porque genera confianza falsa.

**a) Solo se auditan cinco extensiones.** El escáner acepta exclusivamente
`.ts`, `.tsx`, `.js`, `.jsx` y `.json`. En consecuencia, los ficheros `.sh`,
`.md`, `.py`, `.yaml` o `.css` **nunca** generan smell, por muy largos que sean.
La Regla de Oro sigue siendo la norma de equipo para esos ficheros; simplemente
no es verificable automáticamente hoy.

**b) El umbral está codificado en el analizador.** El `400` es una constante en
el código, no una opción del protocolo. Esto tiene una consecuencia operativa
que debe aceptarse de forma explícita: la bandera `-t/--threshold` del script de
arranque **no reconfigura el analizador**; documenta la intención del proyecto.
Un equipo que fije `-t 250` seguirá viendo el aviso a los 401. *(Pendiente:
exponer el umbral en el schema del tool)*

**c) Hay un desfase de una línea.** El recuento se hace con
`content.split('\n').length`. Un fichero de 400 líneas reales terminado en salto
de línea produce 401 elementos, porque el `\n` final genera un elemento vacío.
El límite efectivo es por tanto **399 líneas de contenido**. No es un bug
crítico, pero es la clase de detalle que invalida un informe firmado sin
revisar. *(Pendiente: normalizar el recuento antes de comparar)*

**d) El smell de `TODO` es deliberadamente ingenuo.** Es una cuenta literal de
la subcadena `TODO`, con umbral `> 3` y severidad `low`. Cuenta igual un
`TODO:` real que un `TODO` dentro de un string, un identificador o un import.

**e) Los errores de lectura se tragan.** Si un fichero no es legible, el
escáner lo salta en silencio y el fichero **no aparece en el informe**. Una
ausencia en el informe significa "no se evaluó" o "no existe", y son cosas
distintas. No se debe interpretar el informe como cobertura completa.

**f) directorios excluidos del escaneo.** `node_modules`, `.git`, `lib`,
`dist`, `coverage` y `.manteka-memory` no se recorren.

**g) No se hace análisis de dependencias, complejidad ni duplicación.** La
métrica es de tamaño de fichero. No detecta deuda arquitectónica.

### 2.4 Checklist de refactor ante un smell de tamaño

- [ ] ¿El fichero supera 400 líneas **de contenido** (no 400 por el `\n` final)?
- [ ] ¿Se ha identificado una **responsabilidad con nombre**, no un rango de líneas?
- [ ] ¿La API pública del punto de entrada queda **sin tocar**?
- [ ] ¿Build, typecheck y tests pasan **sin modificar tests para adaptarlos**?
- [ ] ¿El smell desaparece del nuevo `health-report.json`?
- [ ] ¿No se ha añadido ninguna capa, abstracción ni indirección nueva?

---

## 3. Arquitectura de la Memoria Local (`.manteka-memory/`)

### 3.1 Por qué local y no un servicio

La memoria del sistema es **deliberadamente local** y está **obligada a quedar
excluida del versionado**. La razón es de gobernanza, no de conveniencia: un
`.manteka-memory/` versionado publica en el remoto la bitácora de decisiones
internas de un proyecto, incluidos nombres de módulos, rutas y fragmentos de
contexto que la organización ha decidido no publicar.

El coste es real y se acepta de forma consciente: **la memoria no se comparte con
el equipo**. Un `git clone` arranca con memoria vacía y `confidenceScore` de
`0.5`. El estándar no promete memoria compartida; promete memoria *presente*.

### 3.2 Los tres artefactos

| Artefacto | Naturaleza | Escritura | Propósito |
|---|---|---|---|
| `history.log` | Append-only | Solo anexar | Bitácora de hitos, decisiones y refactorizaciones |
| `health-report.json` | Instantánea | Sobrescritura | Última foto de salud del código |
| `living-codebase-status.md` | Narrativa | Sobrescritura | Estado y contexto activo del proyecto |

**`history.log` — registro cronológico e inmutable**

Es un log de líneas de texto con formato fijo:

```
[<ISO-8601>] [<categoria>] <mensaje> (file: <ruta>)
```

- El timestamp es ISO-8601 en UTC, generado por el servidor.
- La categoría es libre; si se omite, se registra `info`.
- El sufijo `(file: ...)` solo aparece si se aporta `filePath`.
- La escritura se realiza con operación de **anexado**, nunca de truncado. El
  histórico no se reescribe: una entrada errónea se corrige añadiendo la
  entrada correcta, nunca editando la anterior.

Ejemplo real de una entrada:

```
[2026-10-04T08:34:58.443Z] [milestone] Living Codebase inicializado en repo: memoria local creada, umbral de code smell 400 lineas. (file: .manteka-memory)
```

**`living-codebase-status.md` — estado actual y contexto activo**

Documento legible por persona, generado en el arranque. Describe el proyecto
(nombre, stack detectado, umbral, instante de inicialización), enumera los
artefactos y declara sus límites conocidos. Es la puerta de entrada humana: no
se requiere leer JSON para entender el estado del sistema.

**`health-report.json` — instantánea automatizada de salud**

Lo escribe `manteka_analyze_code_health`. Es una **foto**, no un histórico: cada
análisis lo sobrescribe por completo. El histórico de salud, si se necesita, debe
vivir en el `history.log` mediante entradas explícitas.

### 3.3 Contrato de datos

Esquema exacto del fichero en disco, tal y como lo emite el analizador:

```jsonc
{
  "timestamp": "2026-10-04T08:34:58.443Z",   // ISO-8601 UTC
  "totalSmells": 0,                          // número entero de code smells
  "codeSmells": [
    {
      "file": "src/core/thing.ts",            // relativa a la raíz del proyecto
      "issue": "File exceeds 400 lines (512 lines). Consider modularizing.",
      "severity": "medium"                    // "low" | "medium" | "high"
    }
  ],
  "sessionPrediction": {
    "recommendedFiles": [],
    "primaryFocus": "General Maintenance",
    "recentActivitySummary": "",
    "confidenceScore": 0.5
  }
}
```

Advertencia de nomenclatura que ya ha causado errores de integración: **el
nombre de la clave cambia según dónde se mire**. En el **fichero** el total se
llama `totalSmells`; en la **respuesta del tool** se llama `codeSmellsCount`. No
son campos distintos: son el mismo número con dos nombres. Cualquier
consumidor debe fijarse en cuál de los dos Interfaces está leyendo.

Valores por defecto de `sessionPrediction` con la memoria vacía:

| Campo | Valor inicial | Comportamiento |
|---|---|---|
| `recommendedFiles` | `[]` | Se puebla con los ficheros de mayor puntuación |
| `primaryFocus` | `"General Maintenance"` | Se reclasifica por palabras clave: `auth`, `mcp`, `refactor` |
| `confidenceScore` | `0.5` | Sube a `0.8` cuando hay historial sembrado |
| `recentActivitySummary` | `""` | Resumen de la actividad reciente del historial |

`confidenceScore` es una **constante de baseline, no una probabilidad calculada**.
Con memoria vacía vale siempre `0.5`. No debe interpretarse como confianza
estadística.

### 3.4 Política de privacidad

Norma de cumplimiento, sin excepciones:

1. `.manteka-memory/` **debe** estar en `.gitignore` antes de que exista la
   memoria. El script de arranque lo garantiza y verifica la regla.
2. **Nunca** se fuerza la inclusión con `git add -f`. La memoria es local.
3. El contenido de la memoria se considera **no publicable**: no se copia a
   issues, PRs, wikis ni logs de CI.
4. La exclusión es por directorio, no por fichero: evita fugas por ficheros
   nuevos que nadie revisó.
5. En modo *sandboxed* el servidor **no expone rutas absolutas** en sus
   respuestas, precisamente para no filtrar la estructura del sistema de
   ficheros del anfitrión.

### 3.5 Resolución de rutas

El directorio de memoria es la constante `.manteka-memory`, resuelta **respecto
al directorio de trabajo del servidor**, no al del proceso. La distinción parece
menor y no lo es: es lo que ancla la memoria al repositorio que se está
auditando cuando el servidor se lanza desde otro punto del árbol.

---

## 4. Interoperabilidad Autónoma (Harness MCP)

### 4.1 Transporte

El servidor habla **STDIO**. Es un requisito, no una preferencia: por STDIO no
hay puertos, ni autenticación, ni superficie de red que proteger. El proceso
escucha sus comandos en la entrada estándar y escribe respuestas en la salida
estándar.

Consecuencia operativa que hay que respetar: **toda salida por `console.log` en
el camino de arranque corrompe el protocolo.** Los errores van a `stderr`.

### 4.2 Anatomía del servidor

```
Asistente de IA
     │  invocación de tool (JSON-RPC sobre STDIO)
     ▼
bin/manteka-mcp.cjs          ← arranque; importa lib/ compilado
     ▼
src/mcp/mcpServer.ts         ← StdioServerTransport + registro de tools
     ▼
src/mcp/tools/*.ts           ← un módulo por tool (refactor Opción B)
     ▼
.manteka-memory/             ← estado persistente
```

El punto de entrada carga el **JavaScript compilado** en `lib/`. Si `lib/` no
existe o está obsoleto, el arranque falla; esto implica un paso de build previo
para el uso local.

### 4.3 Catálogo de herramientas de memoria

| Tool | Propósito | Efecto lateral |
|---|---|---|
| `manteka_analyze_code_health` | Escanea el árbol y regenera `health-report.json`. | Sobrescribe la instantánea. |
| `manteka_log_history` | Añade una entrada a `history.log`. | Anexa. Nunca trunca. |
| `manteka_semantic_debug` | Cruza historial, notas e informe para reconstruir *por qué*. | Solo lectura. |
| `manteka_search_memory` | Busca contenido en las notas persistidas. | Solo lectura. |
| `manteka_store_note` | Persiste una nota en la memoria. | Crea o actualiza la nota. |
| `manteka_get_context` | Devuelve contexto de **un fichero**, no historial. | Solo lectura. |

La distinción de la última fila importa y ya ha inducido a error: el nombre
`get_context` sugiere historial, pero su contrato es contexto de fichero.

### 4.4 Contrato de instalación

El servidor se declara como servidor MCP en un descriptor `.mcp.json`:

```json
{
  "mcpServers": {
    "repomix": {
      "command": "npx",
      "args": ["-y", "github:DAW1BSergiomg26/manteka-repomix", "--mcp"]
    }
  }
}
```

Convenciones que este contrato fija:

- El **flag `--mcp`** es lo que conmuta el CLI al modo servidor. Sin él, el mismo
  binario se comporta como CLI.
- El campo `command` + `args[]` define el transporte STDIO: no hay campo de URL.
- El servidor arranca con la raíz por defecto en el directorio de trabajo del
  proceso, y es esa raíz la que delimita el análisis.

### 4.5 Modo sandboxed

Existe un segundo modo, `sandboxed`, que cambia el contrato de tres formas
simultáneas:

1. Las rutas se resuelven y se validan contra la raíz permitida.
2. Ante un error de ruta se devuelve un **error de sandbox** en lugar de
   propagar la excepción con su ruta absoluta.
3. Las instrucciones expuestas al modelo cambian, y las salidas que describen
   rutas se omiten.

En errores, el modo normal y el sandboxed divergen a propósito: el primero
prioriza diagnosticar, el segundo prioridad no filtrar.

---

## 5. Guía de Arranque Rápido

### 5.1 Un comando

```bash
./scripts/init-living-codebase.sh -t <umbral> [ruta]
```

- `-t <umbral>` / `--threshold <umbral>`: líneas por fichero. Por defecto `400`.
  Ver [§2.3 b](#b-el-umbral-está-codificado-en-el-analizador): documenta la
  intención, no reconfigura el analizador.
- `[ruta]`: repositorio destino. Por defecto el directorio actual.

Ejemplos:

```bash
# Repositorio actual, estándar de 400 líneas
./scripts/init-living-codebase.sh

#Otro repositorio, umbral propio
./scripts/init-living-codebase.sh -t 250 ../legacy-api
```

### 5.2 Qué hace exactamente

En un repositorio limpio:

1. Crea `.manteka-memory/`.
2. Crea `history.log` con **una** entrada de hito inicial, en el formato canónico.
3. Crea `living-codebase-status.md` con el estado inicial y sus límites.
4. Crea `health-report.json` con el **esquema exacto** y los valores por defecto
   del analizador, para que un consumidor no Observe una estructura ajena a la
   que producirá el primer análisis real.
5. Añade la regla de exclusión a `.gitignore` y la verifica, deduplicando si ya
   existía.

En un repositorio que ya tiene memoria: **no hace nada destructivo**. No
trunca ni sobrescribe `history.log`, ni el informe, ni el estado, y preserva el
umbral ya registrado. La idempotencia no es un detalle: ejecutar el script sobre
un repositorio con auditoría real debe ser seguro por defecto.

### 5.3 Verificación del arranque

```bash
# ¿La memoria queda correctamente excluida?
git check-ignore -v .manteka-memory/

# ¿El informe es JSON válido con el esquema correcto?
node -e 'const r=require("./.manteka-memory/health-report.json");
         console.log(Object.keys(r), Object.keys(r.sessionPrediction))'

# ¿El formato de la bitácora es el canónico?
head -1 .manteka-memory/history.log
```

Un arranque correcto produce `history.log` con una única línea que empieza por
`[` y contiene un timestamp ISO-8601.

### 5.4 Checklist de adopción

- [ ] `scripts/init-living-codebase.sh` copiado al repositorio destino.
- [ ] Bit de ejecución fijado **en el índice de git** (ver más abajo).
- [ ] Ejecutado una vez; confirmado que `.manteka-memory/` existe.
- [ ] `git check-ignore` confirma la exclusión.
- [ ] `health-report.json` valida contra el esquema de [§3.3](#33-contrato-de-datos).
- [ ] Servidor MCP accesible por el asistente (ver [§4.4](#44-contrato-de-instalación)).
- [ ] Primera llamada a `manteka_analyze_code_health` ejecutada.
- [ ] Equipo informado de que la memoria **no se comparte** entre clones.

> **Aviso — bit de ejecución en Windows.** Con `core.fileMode=false`, un
> `chmod +x` no llega al índice de git y un clon en Linux recibe el fichero sin
> permiso de ejecución. Hay que forzar el modo explícitamente:
>
> ```bash
> git add scripts/init-living-codebase.sh
> git update-index --chmod=+x scripts/init-living-codebase.sh
> ```
>
> Verificado: `chmod` aislado → `100644` (no ejecutable); con
> `update-index --chmod=+x` → `100755`.

---

## Apéndice A — Trazabilidad

Cada afirmación normativa, con su fuente.

| Afirmación | Fuente |
|---|---|
| Umbral de 400 líneas, severidad `medium` | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:59` |
| Smell de `TODO` con umbral `> 3`, severidad `low` | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:69` |
| Extensiones auditadas: `.ts .tsx .js .jsx .json` | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:53` |
| Directorios excluidos del escaneo | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:50` |
| Lecturas fallidas ignoradas en silencio | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:76` |
| Desfase de una línea por `split('\n')` | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:56` |
| Esquema del informe en disco | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:88` |
| Nombre `codeSmellsCount` en la respuesta | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:103` |
| Escaneo excluye `.manteka-memory` | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:50` |
| `history.log` se anexa, no se trunca | `src/mcp/tools/mantekaLogHistoryTool.ts:45` |
| Formato `[ts] [cat] msg (file: ruta)` | `src/mcp/tools/mantekaLogHistoryTool.ts:43` |
| Categoría por defecto `info` | `src/mcp/tools/mantekaLogHistoryTool.ts:43` |
| Constante `MEMORY_DIR = '.manteka-memory'` | `src/mcp/tools/memoryPaths.ts:5` |
| Memoria anclada a la raíz del servidor | `src/mcp/tools/memoryPaths.ts:13` |
| Transporte STDIO | `src/mcp/mcpServer.ts:2`, `:112` |
| Raíz por defecto `process.cwd()` | `src/mcp/mcpServer.ts:42` |
| Divergencia de error en modo sandboxed | `src/mcp/tools/mantekaAnalyzeCodeHealthTool.ts:107` |
| Baseline de la predicción de sesión | `src/mcp/tools/sessionPrediction.ts:18` |
| `confidenceScore` 0.5 → 0.8 con historial | `src/mcp/tools/sessionPrediction.ts:21`, `:34` |
| Reclasificación por `auth` / `mcp` / `refactor` | `src/mcp/tools/sessionPrediction.ts:53` |
| Descriptor MCP y flag `--mcp` | `.claude/plugins/repomix-mcp/.mcp.json` |
| Arranque vía JS compilado | `bin/manteka-mcp.cjs` |

---

## Apéndice B — Límites declarados

Resumen ejecutivo de todo lo que el estándar **no** hace. Un estándar que solo
enumera aciertos no es auditable.

- No audita ficheros que no sean `.ts`, `.tsx`, `.js`, `.jsx` o `.json`.
- El umbral no es configurable por protocolo; 400 está codificado.
- El recuento tiene un desfase de una línea (límite efectivo: 399).
- El smell de `TODO` cuenta subcadenas, no intención.
- Los ficheros ilegibles no aparecen en el informe.
- No hay análisis de dependencias, complejidad ciclomática ni duplicación.
- La memoria es local: no se comparte entre clones ni entre miembros del equipo.
- `confidenceScore` es una constante de baseline, no una probabilidad.
- La predicción de sesión es heurística y se limita a tres palabras clave.

### Hoja de ruta

Trabajo pendiente para endurecer el estándar, por valor sobre esfuerzo:

1. Exponer el umbral en el schema del tool y eliminar el desfase de una línea.
   *(Cierra [§2.3 b](#b-el-umbral-está-codificado-en-el-analizador) y
   [§2.3 c](#c-hay-un-desfase-de-una-línea) con un cambio pequeño y verificable.)*
2. Declarar los ficheros ilegibles en el informe en lugar de omitirlos.
   *(Elimina la diferencia entre "no existe" y "no se evaluó", que es la más
   peligrosa del §2.3.)*
3. Ampliar el escaneo a `.md`, `.sh`, `.py` y `.yaml`.
4. Sustituir el recuento de `TODO` por un análisis con modelo de lenguaje.
5. Spec de formato para el intercambio de memoria entre equipos, si el coste de
   la memoria local llega a pesado en la práctica.
