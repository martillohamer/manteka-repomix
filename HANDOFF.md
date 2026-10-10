# Manteka: Autonomous Code Evolution Engine - HANDOFF DOCUMENTATION

## 🧠 Visión General

**Manteka** es un motor de evolución autónoma de código que integra múltiples subsistemas de IA para proporcionar capacidades de autocuración, orquestación de swarms, memoria vectorial, calidad semántica y protocolos de comunicación estandarizados. El sistema está diseñado para funcionar como un "programador senior" que puede auto-mejorar, auto-arreglar y auto-optimizar su propio código y el de proyectos asociados.

La arquitectura sigue un modelo de **fases progresivas**, donde cada fase agrega capacidades complejas manteniendo restricciones técnicas estrictas:
- Cero dependencias de runtime adicionales (solo built-ins de Node.js)
- Rutas Windows-safe usando `node:path`
- TypeScript estricto (cero `any`, cero `!`, cero imports no utilizados)
- Protocolo JSON-RPC 2.0 / MCP Stdio Transport para comunicación

---

## 📊 Arquitectura por Fases Completadas

### ✅ Fase 9: Autonomous Healer Daemon (`src/healer/`)
**Estado:** Completado y validado

**Descripción:** El daemon de autocuración autónomo que monitorea y repara código en tiempo ejecútivo. Proporciona:
- Detección de patrones de error y propagación
- Reversión de mutaciones no deseadas
- Calidad de código mediante quality gates
- Modo dry-run para validación segura

**Componentes clave:**
- `src/healer/engine.ts` - Motor principal de diagnóstico y reparación
- `src/healer/diagnostician.ts` - Analiza errores y sugiere fixes
- `src/healer/sensor.ts` - Sensores para monitorear estado del sistema
- `src/healer/mutator.ts` - Aplica transformaciones controladas al código

**Comandos relacionados:**
- `manteka doctor` - Check de salud de todos los subsistemas (incluye healer)

---

### ✅ Fase 10: E2E Integration & Stress Harness (`tests/e2e/`)
**Estado:** Completado y validado

**Descripción:** Suite de pruebas end-to-end y validación de stress que garantiza la integridad del sistema bajo carga y condiciones adversas. Incluye:
- Pruebas de resistencia bajo carga pesada
- Validación de pipelines de evolución
- Pruebas de estrés del sistema MCP
- Validación de regresiones y drift detection

**Validaciones clave:**
- `npx vitest run` - 100% de tests CLI pasando
- Drift detection entre versiones
- Validación de genomes y políticas evolutivas

---

### ✅ Fase 11: Swarm Intelligence Orchestrator (`src/swarm/`)
**Estado:** Completado y validado

**Descripción:** Orchestrador de inteligencia de enjambre que coordina múltiples agentes trabajando en colaboración. Características:
- Topologías de red: mesh, hierarchical, ring, star, hybrid, adaptive
- Protocolos de consenso: raft, byzantine, gossip, crdt, quorum
- Pheromone-adaptive scheduling para elegibilidad de agentes
- Shared memory state tracking

**Componentes clave:**
- `src/swarm/bus.ts` - Bus de comunicación entre agentes
- `src/swarm/orchestrator.ts` - Orchestrador principal
- `src/swarm/pheromone-status.ts` - Estado de feromonas
- `src/swarm/health.ts` - Health checks del swarm

**Capacidades:**
- Auto-organización de agentes
- Distribución de carga basada en EMA scores
- Sospensión/reactivación basada en performance
- Consensus protocols para decisiones críticas

---

### ✅ Fase 12: Evolutionary Memory & Vector Lineage Store (`src/memory/`)
**Estado:** Completado y validado

**Descripción:** Sistema de memoria evolutiva con embeddings vectoriales y almacenamiento de línea de ancestry. Proporciona:
- Búsqueda semántica por significado (no coincidencia literal)
- Almacenamiento persistente en `.swarm/memory.db` (SQLite/js)
- HNSW index para búsqueda vectorial eficiente
- Embeddings de 384 dimensiones (MiniLM-L6-v2)
- RaBitQ 1-bit quantization para índice comprimido

**Componentes clave:**
- `src/memory/vectorizer.ts` - Tokenization y cosine similarity
- `src/memory/lineageStore.ts` - Almacenamiento append-only NDJSON
- `src/memory/embeddings.ts` - Generación y búsqueda de embeddings
- `src/memory/adaptiveEngine.ts` - Motor adaptativo de aprendizaje

**Funcionalidades principales:**
- `memory_store` - Guardar patrones con embedding vectorial
- `memory_search` - Búsqueda semántica por significado
- `memory_retrieve` - Recuperar por clave exacta
- `memory_cleanup` - Prune entradas expiradas
- `memory_export/import` - Export/import a JSON

**Cambios recientes (Fase 14):**
- `getStats()` method added - retorna `{totalRecords, totalVectors?, dimension?}`
- Memory subsystem now displays: `Entry count: 14, Dimensions: 384`

---

### ✅ Fase 13: Biomimetic Quality Gates / Semantic Hooks (`src/hooks/`)
**Estado:** Completado y validado

**Descripción:** Sistema de quality gates biomiméticos y hooks biológicos que proporcionan:
- Model routing optimizado (Haiku/Sonnet/Opus selection)
- SONA learning system (Self-Organizing Neural Architecture)
- MoE (Mixture of Experts) routing
- Attention-weighted similarity computation
- Pattern store con BM25+semantic hybrid search

**Componentes clave:**
- `src/hooks/intelligence.ts` - RuVector intelligence system
- `src/hooks/model-route.ts` - Route task to optimal Claude model
- `src/hooks/codemod.ts` - Transformaciones deterministas $0 (no LLM)
- `src/hooks/pre-task.ts` - Registro de inicio de tarea con routing

**Quality Gates:**
- Tier 1: Deterministic codemod (~0ms, $0) - var-to-const, remove-console, add-logging
- Tier 2: Haiku - simple transforms
- Tier 3: Sonnet/Opus - complex transforms

**Validación:**
- `verify` tool checks: empty/truncated output, refusal patterns, degenerate repetition
- Syntax parsing para code/JSON tasks (TypeScript compiler / JSON.parse)

---

### ✅ Fase 14: Native MCP Server & CLI Interactive Interface (`src/mcp/`, `src/cli/`)
**Estado:** Completado y validado

**Descripción:** Implementación nativa del protocolo Model Context Protocol (MCP) usando stdio transport y JSON-RPC 2.0. A diferencia de las implementaciones que dependen de `@modelcontextprotocol/sdk`, Manteka usa **built-ins puros de Node.js** (`readline`, `events`, `process`, `path`, `fs`).

**Características técnicas "Nivel Dios":**
- **ZERO dependencias externas:** No usa `@modelcontextprotocol/sdk`
- **Protocolo JSON-RPC 2.0 sobre stdio** - comunicación bidireccional
- **Rutas Windows-safe** con `node:path` (path.join, path.resolve)
- **TypeScript estricto** - cero any, cero !
- **Módulos ES nativos** - `node:readline`, `node:events`, `node:fs`

**Servicios MCP expuestos:**
- `manteka_heal` - Healer tool
- `manteka_swarm_query` - Swarm query tool
- `manteka_memory_search` - Memory semantic search tool
- `manteka_quality_gate` - Quality gate verdict tool

**Comandos CLI:**
- `manteka serve` - Start MCP Stdio server transport
- `manteka doctor` - Health check of all subsystems (Healer, Swarm, Memory, Hooks)
- `manteka version` - Show version information

**Estado actual:**
- ✅ 13/13 CLI tests passing
- ✅ MCP server starts correctly on stdio
- ✅ All 4 tools registered and functional
- ✅ Memory subsystem shows Entry count and Dimensions
- ✅ No `.bind()` errors (fixed `handleStdioClose` method)
- ✅ `getStats()` resolves `memoryStore.getStats is not a function`

---

## 🛡️ Restricciones Técnicas "Nivel Dios"

### Cero Dependencias de Runtime Añadidas
- **No** usa `@modelcontextprotocol/sdk` ni ningún paquete npm externo para el runtime
- Todas las funcionalidades usan built-ins de Node.js:
  - `node:fs` - File system operations
  - `node:path` - Path manipulation (Windows-safe)
  - `node:readline` - STDIO line reading
  - `node:events` - Event emitter patterns
  - `node:os` - OS operations
  - `node:crypto` - Cuando necesario para firma cryptográfica

### Rutas Windows-Safe
- Todo path manipulation usa `path.join()`, `path.resolve()`, `path.dirname()`
- Sin hardcoding de separadores (`/` vs `\`)
- `path.join('C:\\', 'users')` funciona cross-platform
- `path.win32` y `path.posix` disponibles cuando se necesita

### TypeScript Estricto
- **Cero `any`** - Type annotations en todos los lugares
- **Cero `!` (non-null assertions)** - Manejo apropiado de undefined/null
- **Cero imports no utilizados** - Cada import debe ser consumido
- **VerbatimModuleSyntax** habilitado en tsconfig
- Interfaces en lugar de tipos cuando es posible

---

## 🚀 Guía de Inicio Rápido

### Instalación
```bash
# Clonar repositorio
git clone https://github.com/DAW1BSergiomg26/manteka-repomix.git
cd manteka-repomix

# Instalar dependencias
npm install

# Compilar TypeScript
npm run build
```

### Comandos CLI Principales

#### 🏥 Health Check (Fase 10+)
```bash
manteka doctor
```
**Output:**
```
=== Manteka Subsystem Health Check ===

--- Healer Subsystem ---
  Status: ✅ Operational
  Max attempts: 3 (default)
  Dry-run mode: enabled

--- Swarm Subsystem ---
  Status: ✅ Operational
  Agent roles available

--- Memory Subsystem ---
  Status: ✅ Operational
  Entry count: 14
  Dimensions: 384

--- Hooks / Biological Mutator Subsystem ---
  Status: ✅ Operational
  Mutations applicable: true
  Mutations reversible: true
  Quality gate verdict: passed

--- MCP Server Subsystem ---
  Status: ⏸️  Not started
  Run "manteka serve" to start the MCP server

=== All Subsystem Checks Complete ===
```

#### 🌐 MCP Server (Fase 14)
```bash
manteka serve
```
**Output:**
```
MCP Server started on stdio transport
Available tools: manteka_heal, manteka_swarm_query, manteka_memory_search, manteka_quality_gate
Send JSON-RPC 2.0 messages via stdin, read responses via stdout
```

#### 📊 Versión
```bash
manteka version
```
**Output:**
```
Manteka Version: 1.18.1-manteka.1
Package: manteka-repomix
CLI: manteka v1.18.1-manteka.1
```

### 🔧 Desarrollo y Tests

```bash
# Run CLI tests
npx vitest run tests/cli/index.test.ts

# Run full test suite
npx vitest run

# TypeScript check
npx tsc --noEmit

# Lint
npm run lint
```

### 🤖 Autónomo: Flujo de Trabajo

1. **Diagnóstico:** `manteka doctor` - Verificar salud del sistema
2. **Memoria:** `manteka serve` - Iniciar servidor MCP para herramientas remotas
3. **Evolución:** Usar tools `manteka_heal`, `manteka_swarm_query`, etc. mediante JSON-RPC 2.0
4. **Quality Gates:** El sistema auto-evalúa la calidad de transforms via SONA/MoE learning

### 📡 Ejemplo JSON-RPC 2.0

```json
# Initialize
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "capabilities": {},
    "serverInfo": {
      "name": "manteka-repomix-mcp",
      "version": "1.0.0"
    }
  }
}

# Tool call
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tool_call",
  "params": {
    "name": "manteka_heal",
    "arguments": {
      "filePath": "/path/to/file.ts",
      "operation": "refactor"
    }
  }
}
```

---

## 📁 Estructura de Archivos Críticos

```
/manteka-repomix/
├── src/
│   ├── healer/           # Fase 9: Healer daemon
│   ├── swarm/            # Fase 11: Swarm orchestrator
│   ├── memory/           # Fase 12: Vector lineage store
│   ├── hooks/            # Fase 13: Quality gates/semantic hooks
│   ├── mcp/              # Fase 14: Native MCP server
│   └── cli/              # Fase 14: Interactive CLI
├── tests/
│   ├── cli/              # CLI tests (13/13 passing)
│   ├── e2e/              # Fase 10: E2E integration
│   └── memory/           # Memory subsystem tests
├── HANDOFF.md            # This file - documentation
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript strict config
└── .manteka/             # Internal runtime state
```

---

## 🔄 Siguientes Pasos / Roadmap

### Fase 15 (Planificada): Federated Learning & Nostr Integration
- Nostr protocol integration (NIP-42, NIP-44)
- Federated swarm synchronization
- Private channel communication
- Decentralized identity management

### Fase 16 (Planificada): Advanced Darwin Evolution
- Multi-objective optimization
- Behavioral diversity preservation
- Epistasis detection and crossover
- Fitness landscape analysis

### Fase 17 (Planificada): Web UI & Dashboard
- React-based dashboard
- Real-time swarm state visualization
- Interactive quality gate configuration
- Historical analytics and reporting

---

## 📞 Contacto y Soporte

- **Repositorio:** https://github.com/DAW1BSergiomg26/manteka-repomix
- **Issue Tracker:** GitHub Issues
- **Documentation:** `HANDOFF.md` (este archivo)
- **Version:** 1.18.1-manteka.1

**Filosofía:** Manteka cree en la evolución autónoma, segura y transparente del código. Cada línea de código, cada decisión y cada mutación está documentada y rastreable a través del sistema de línea de ancestry y memory store.

*"El código no debe solo funcionar - debe evolucionar hacia mejores versiones de sí mismo."*