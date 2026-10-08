# HANDOFF.md — Manteka Repomix & Manteka Memory Stream

> **Documento maestro de preservación de contexto para desarrolladores y agentes de IA.**

---

## 1. Project Overview

**Manteka Repomix** es un empaquetador avanzado de bases de código optimizado para LLMs y flujos de trabajo de ingeniería asistida por Inteligencia Artificial. Mantiene compatibilidad total con empaquetado multi-formato (XML, Markdown, JSON, texto plano) e introduce capacidades empresariales como **Manteka Smart-Slice** (`--smart`) para cálculo de radio de impacto de dependencias.

Dentro de este ecosistema, **"Manteka Memory Stream"** es el subsistema de servidor MCP (Model Context Protocol) local ejecutado a través de transporte STDIO. Permite a agentes de IA y clientes externos (Claude Desktop, Claude Code, Cursor, Cline, etc.) acceder a lectura inteligente de contexto, persistencia local de notas y registro cronológico de eventos directamente en el entorno de desarrollo.

---

## 2. Current Architecture & Stack

- **Lenguaje & Entorno de Ejecución:** TypeScript 7 (`^7.0.2`, compilado a ESM con Node.js `>=22.0.0` según `engines`).
- **Protocolo de Integración:** Model Context Protocol (vía `@modelcontextprotocol/sdk` v1.30.0) sobre `StdioServerTransport`.
- **Validación de Esquemas:** Zod 4.6.x y Valibot.
- **Seguridad & Confinamiento de Rutas:** Resolución estricta de rutas con `resolveToolPath` y aislamiento en modo sandbox (`PathScopeError` ante intentos de traversal).
- **Directorio de Persistencia Local:** `.manteka-memory/` (ignorado por Git; nunca debe versionarse).

### Ficheros y Directorios Clave

| Fichero / Ruta | Responsabilidad |
|---|---|
| `src/mcp/tools.ts` | Registro e implementación de las herramientas MCP de Manteka (Memory Stream, Living Codebase y Semantic Time-Travel Debugging). |
| `src/mcp/mcpServer.ts` | Configuración, inicialización e instrucciones del servidor MCP (`manteka-repomix-mcp`). |
| `src/mcp/tools/mcpToolRuntime.ts` | Primitivas de runtime, resolución segura de paths y respuestas tipadas para herramientas. |
| `bin/manteka-mcp.cjs` | Punto de entrada ejecutable CLI (`manteka-mcp`) para transporte STDIO. |
| `package.json` | Registro de dependencias y comandos en la sección `bin` (`repomix`, `manteka-mcp`). |
| `scripts/integration-test.ts` | Suite de pruebas de integración automatizadas para verificar el ciclo de vida del servidor MCP. |
| `scripts/integration-test.types.ts` | Tipos JSON-RPC mínimos compartidos por el harness de integración. |
| `tests/mcp/tools/mantekaSemanticDebugTool.test.ts` | Pruebas de contrato, orden cronológico y aislamiento de `manteka_semantic_debug`. |

---

## 3. Complete Tool Suite (MCP)

El servidor expone las siguientes herramientas Manteka: Memory Stream (1-4), Living Codebase (5) y Semantic Time-Travel Debugging (6).

### 1. `manteka_get_context`
- **Propósito:** Genera una representación en formato *smart-slice* del archivo solicitado, garantizando que el modelo reciba únicamente el código relevante con delimitadores claros.
- **Parámetros:**
  - `filePath` (string, obligatorio): Ruta relativa o absoluta hacia el fichero a procesar.
- **Seguridad:** Pasa por `resolveToolPath`, respetando el modo sandbox si está activo.

### 2. `manteka_store_note`
- **Propósito:** Almacena notas de trabajo, arquitectura, resúmenes o descubrimientos en el directorio local persistente `.manteka-memory/`.
- **Parámetros:**
  - `noteName` (string, obligatorio): Nombre del archivo de nota (ej. `review-plan.md`).
  - `content` (string, obligatorio): Texto o contenido de la nota.

### 3. `manteka_search_memory`
- **Propósito:** Realiza búsquedas de texto plano y palabras clave en los ficheros existentes dentro de `.manteka-memory/`.
- **Parámetros:**
  - `query` (string, obligatorio): Término o patrón de búsqueda.
- **Respuesta:** Lista de ficheros coincidentes (`results: string[]`).

### 4. `manteka_log_history`
- **Propósito:** Auditoría y registro histórico de eventos, decisiones o cambios en `.manteka-memory/history.log`.
- **Parámetros:**
  - `message` (string, obligatorio): Descripción del cambio o evento.
  - `category` (string, opcional): Categoría (`feat`, `fix`, `audit`, `note`, etc.).
  - `filePath` (string, opcional): Ruta del fichero asociado al evento.

### 5. `manteka_analyze_code_health` (Manteka Living Codebase)
- **Propósito:** Escanea el código en busca de deuda técnica y *code smells*, genera un informe estructurado y adjunta la predicción de contexto de la próxima sesión.
- **Parámetros:**
  - `targetDirectory` (string, opcional): Directorio objetivo a escanear (por defecto `.`).
- **Detección actual:** ficheros excesivamente largos (>400 líneas) y alta densidad de `TODO`. No analiza todavía dependencias obsoletas ni duplicación de código.
- **Salida:** `reportPath`, `codeSmellsCount` y `sessionPrediction`.
- **Persistencia:** `.manteka-memory/health-report.json`.
- **Predicción de sesión:** El helper interno `predictSessionContext` lee las últimas líneas de `history.log` y las notas persistidas para recomendar hasta 5 ficheros y estimar el foco principal de la sesión siguiente.

### 6. `manteka_semantic_debug` (Semantic Time-Travel Debugging)
- **Propósito:** Correlaciona el historial, las notas de sesión y el último informe de salud para reconstruir *cuándo* y *por qué* ocurrieron cambios o decisiones arquitectónicas pasadas.
- **Parámetros:**
  - `query` (string, obligatorio, mínimo 1 carácter): Pregunta de depuración sobre decisiones, regresiones o cambios.
- **Correlación semántica:** La consulta se tokeniza (descartando palabras vacías) y cada fuente puntúa por número de términos cubiertos; la relevancia resultante es `high` / `medium` / `low`.
- **Orden:** Los resultados se devuelven cronológicamente (más antiguo → más reciente) usando el timestamp de la línea de `history.log`, el `mtime` de la nota y el campo `timestamp` del informe de salud. Las fuentes sin fecha se situan al final.
- **Fuentes:** `history.log`, notas `*.md` de primer nivel y `health-report.json`.
- **Seguridad:** Las entradas simbólicas (symlinks y *directory junctions*) se descartan al construir el snapshot de memoria, de modo que una nota enlazada no puede introducir contenido ajeno al root del sandbox. Los errores se reportan mediante `buildSandboxErrorResponse`, sin filtrar rutas del host.
- **Tolerancia:** Un directorio de memoria inexistente se trata como memoria vacía (`ENOENT`), no como error.

---

## 4. Integration & Testing

### Configuración en Clientes Externos (Claude Desktop)

Edita el archivo `claude_desktop_config.json` (ubicado en `%APPDATA%\Claude\claude_desktop_config.json` en Windows o `~/Library/Application Support/Claude/claude_desktop_config.json` en macOS):

```json
{
  "mcpServers": {
    "manteka-mcp": {
      "command": "node",
      "args": [
        "C:\\Users\\astur\\Desktop\\manteka-repomix\\bin\\manteka-mcp.cjs"
      ]
    }
  }
}
```

### Comandos de Verificación y Testing

1. **Tipado Estricto de TypeScript:**
   ```bash
   npx tsc --noEmit
   ```
2. **Compilación de Artefactos:**
   ```bash
   npm run build
   ```
3. **Batería de Pruebas Unitarias:**
   ```bash
   npm test
   ```
4. **Prueba de Integración End-to-End del Servidor MCP:**
   ```bash
   npx tsx scripts/integration-test.ts
   ```
   *El script levanta el proceso hijo STDIO y ejecuta handshake + las 6 herramientas con sincronización Promise-based. A diferencia de versiones previas, ahora **falla de verdad**: rechaza errores JSON-RPC, expira cada llamada a los 60 s, acumula assertions explícitas y termina con código de salida 1 si alguna falla. La limpieza es **no destructiva** (revierte la nota y la línea de historial creadas por la prueba) en lugar de borrar todo `.manteka-memory/`.*

### Línea Base Conocida de `npm test`

La suite completa **no** está en verde: existen 2 fallos preexistentes, ajenos a Manteka y dependientes del locale del sistema:

- `tests/cli/cliTokenBudget.test.ts` → *includes the actual and budget token counts in the message*
- `tests/core/skill/skillStatistics.test.ts` → *should format large numbers with locale string*

No reportar la suite como "100%" hasta que se corrijan o se excluyan explícitamente.

---

## 5. Current Status

- **Fase Actual:** **Fase 3: "Manteka Living Codebase" + Semantic Time-Travel Debugging** implementadas.
- **Rama:** `main`; el trabajo de esta fase se encuentra sin consolidar en el momento de esta actualización.
- **Disponibilidad:** El binario `manteka-mcp` está registrado y operativo localmente con 6 herramientas Manteka.
- **Integración Continua:** `npx tsc --noEmit`, `npm run lint` y `npm run build` limpios. `npm test` mantiene los 2 fallos de locale documentados arriba, sin regresiones introducidas. Suite MCP (`tests/mcp`) en verde: 284 pruebas.

---

## 6. Maintenance Rule

> **REGLA DE MANTENIMIENTO OBLIGATORIA:**  
> Cualquier modificación arquitectónica, creación de nuevas herramientas MCP, ampliación de esquemas de datos o transición de fase en el roadmap **DEBE actualizar este archivo `HANDOFF.md` de inmediato** para asegurar la continuidad y consistencia del contexto ante futuras intervenciones de agentes de IA o desarrolladores humanos.
