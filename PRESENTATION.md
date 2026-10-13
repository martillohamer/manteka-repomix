# Manteka-Repomix — Executive Presentation

*Compatible con Marp, Reveal.js, Slidev u otras herramientas de presentaciones basadas en Markdown.*

```yaml
---
marp: true
theme: uncover
class: invert
paginate: true
backgroundColor: #0F1117
color: #F5F7FA
style: |
  section {
    background: radial-gradient(ellipse at top, #0F172A 0%, #0F1117 100%);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: -0.01em;
  }
  h1 {
    color: #F5F7FA;
    font-size: 2.8rem;
    line-height: 1.05;
    margin-bottom: 0.25rem;
  }
  h2 {
    color: #F5F7FA;
    font-size: 2rem;
    line-height: 1.15;
    margin-bottom: 0.5rem;
  }
  h3 {
    color: #3DF5B3;
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }
  p, li {
    color: #E5E7EB;
    font-size: 1.05rem;
    line-height: 1.5;
  }
  strong {
    color: #F5F7FA;
  }
  .accent {
    color: #3DF5B3;
  }
  .muted {
    color: #9CA3AF;
  }
  code {
    background: rgba(17, 24, 39, 0.85);
    border: 1px solid rgba(61, 245, 179, 0.25);
    border-radius: 0.5rem;
    color: #3DF5B3;
    font-family: "JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    padding: 0.25rem 0.5rem;
  }
  pre {
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(61, 245, 179, 0.25);
    border-radius: 0.75rem;
    box-shadow: 0 40px 120px -40px rgba(34, 197, 94, 0.45);
    padding: 1.25rem 1.5rem;
  }
  .badge {
    background: linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(17,24,39,0.85) 100%);
    border: 1px solid rgba(61,245,179,0.45);
    border-radius: 999px;
    color: #3DF5B3;
    display: inline-block;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    margin: 0.25rem 0.35rem 0.25rem 0;
    padding: 0.45rem 0.85rem;
    text-transform: uppercase;
    backdrop-filter: blur(8px) saturate(140%);
    box-shadow: 0 20px 80px -40px rgba(61, 245, 179, 0.9);
  }
  .card {
    background: linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(15,17,23,0.96) 100%);
    border: 1px solid rgba(61,245,179,0.25);
    border-radius: 1rem;
    padding: 1.5rem 1.75rem;
    text-align: left;
    box-shadow: 0 60px 160px -60px rgba(34,197,94,0.45);
  }
  .grid-2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    text-align: left;
  }
  .kpi {
    font-size: 2.25rem;
    font-weight: 700;
    color: #3DF5B3;
    line-height: 1.05;
    margin-bottom: 0.25rem;
  }
  .kpi-label {
    color: #9CA3AF;
    font-size: 0.95rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  footer {
    color: #9CA3AF;
    font-size: 0.85rem;
    opacity: 0.85;
  }
---
```

---

<!-- _class: lead -->

# Manteka-Repomix

## Autonomous Code Evolution, AST Analysis & RAG-Ready Context Engine

> _"La evolución definitiva en la auditoría y empaquetado de código para Inteligencia Artificial."_

<div style="margin-top: 2rem;">
  <span class="badge">TypeScript Strict</span>
  <span class="badge">2371/2371 Tests Passing · 0 Failed</span>
  <span class="badge">JSON-RPC 2.0 · MCP over stdio</span>
  <span class="badge">Production-Grade Engineering</span>
</div>

<footer style="margin-top: 2.5rem;">
  Open-Source · CLI + MCP · Deterministic · Zero-Runtime AST Analysis
</footer>

---

<!-- _class: default -->

## 2. ¿Qué problema resolvemos?

<div class="grid-2" style="margin-top: 1.25rem;">

<div class="card">
  <h3>El Dolor</h3>

  - **Contexto explosivo.** Los LLMs y agentes de desarrollo necesitan contexto masivo y limpio, pero las bases de código grandes son imposibles de parsear manualmente.
  - **Ruido incontrolado.** Copiar repositorios enteros inunda al modelo con código muerto, tests irrelevantes o dependencias ajenas al alcance.
  - **Pérdida de precisión.** Sin comprensión estructural (AST), es imposible aislar la clausura de dependencias real de un módulo.
  - **Fragmentación de herramientas.** CLI, MCP y pipelines de RAG suelen divergir, generando resultados inconsistentes entre entornos.

</div>

<div class="card">
  <h3>La Solución: Manteka</h3>

  - **Motor híbrido nativo.** Consola (CLI) y servidor MCP (Model Context Protocol) comparten los mismos motores de `core/`, eliminando la deriva entre caminos de ejecución.
  - **Análisis sin ejecución.** Navegación estática de AST, con detección y protección de ciclos para garantizar determinismo.
  - **Clausuras de dependencias exactas.** Extrae únicamente el grafo transitivo necesario para reconstruir un módulo con fidelidad milimétrica.
  - **Optimizado para RAG.** Genera paquetes de contexto limpios, estructurados y reproducibles, listos para consumo por agentes autónomos.

</div>

</div>

<footer>De ruido no estructurado → contexto **RAG-ready** y determinista</footer>

---

<!-- _class: default -->

## 3. Arquitectura y Capacidades de Vanguardia

<div class="grid-2" style="margin-top: 1.25rem;">

<div class="card">
  <h3>Capacidades Clave</h3>

  - **Análisis profundo — `manteka analyze --deep`**<br/>
    Recorrido transitivo del grafo de importaciones con guardia de ciclos, memoización y métricas de profundidad distribuida.
  - **Smart-Slice — `manteka slice`**<br/>
    Empaquetado de clausuras de dependencias, exportable a **Markdown**, **JSON** o **XML** para flujos RAG deterministas.
  - **Diagnóstico de salud — `manteka doctor`**<br/>
    Autoevaluación integral (Node 22+, permisos, entorno, linaje NDJSON). Solo devuelve código de salida no-cero ante **fallos reales**.
  - **Inspección MCP — `manteka inspect`**<br/>
    Descubrimiento y registro interactivo de las **19 herramientas MCP** (subset con sandbox para operaciones con archivos/rutas), vía transporte `stdio` (JSON-RPC 2.0).

</div>

<div class="card">
  <h3>Comandos Reales de Producción</h3>

```bash
# Análisis estructural profundo y determinista
manteka analyze . --deep

# Diagnóstico de entorno (usable como gate CI)
manteka doctor

# Inspección del servidor MCP (JSON-RPC 2.0 over stdio)
manteka inspect --json

# Smart-Slice RAG-ready con export explícito
manteka slice src/core/analyze/index.ts --export json
```

**Arquitectura compartida:** `core/` (built-ins-only) alimenta **CLI** y **MCP** con una única fuente de verdad, evitando deriva entre caminos de ejecución.

</div>

</div>

<footer>Un único motor compartido · Determinismo garantizado · Diseñado para agentes autónomos</footer>

---

<!-- _class: default -->

## 4. Rigor Técnico y Estándares de Producción

<div class="grid-2" style="margin-top: 1rem;">

<div class="card">
  <h3>Puertas de Calidad Automatizadas (CI/CD)</h3>

  - **Pipeline estricto en GitHub Actions.** Se ejecuta en `push` a `main` y en cualquier `pull_request`, con matriz multi-plataforma y multi-versión de Node.
  - **Tres puertas blindadas.** `npm run build` · `npm run lint-ts` · `vitest run` aplicadas de forma obligatoria en los jobs relevantes.
  - **Cobertura de plataforma real.** Matriz **Ubuntu · Windows · macOS** sobre **Node 22.x · 24.x · 26.x**, con variantes de **Bun** para validar portabilidad.
  - **Verificación continua.** Jobs de lint (Biome, Oxlint, Secretlint), test-coverage, build-and-run y smoke tests del binario (`manteka.cjs`).

</div>

<div class="card">
  <h3>Métricas de Éxito Inquebrantables</h3>

  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 0.75rem; text-align: center;">
    <div>
      <div class="kpi">198</div>
      <div class="kpi-label">Archivos de Prueba</div>
    </div>
    <div>
      <div class="kpi">2,371</div>
      <div class="kpi-label">Tests Pasando</div>
    </div>
    <div>
      <div class="kpi">0</div>
      <div class="kpi-label">Errores TypeScript</div>
    </div>
    <div>
      <div class="kpi">0</div>
      <div class="kpi-label">Tests Fallidos</div>
    </div>
  </div>

- **TypeScript Strict Mode** en todo el código base.
- **2371/2371 passing · 18 skipped deliberados** (casos explícitos y justificados).
- **Build limpio, lint-ts 0 errores, suite completa verde** en cada verificación.
- **Ingeniería de grafos robusta.** Protección de ciclos, memoización, resolución consciente de efectos secundarios y diseño resistente a deriva entre caminos CLI/MCP.

</div>

</div>

<footer>Calidad verificada por **evidencia**, no por afirmaciones · Gates automatizados y reproducibles</footer>

---

<!-- _class: lead -->

## 5. Conclusión y Futuro — Production Ready

<div class="card" style="margin: 0 auto; max-width: 920px; text-align: center; padding: 2rem 2.25rem;">

  <h2 style="margin-bottom: 0.75rem;">100% Sincronizado · Documentado · Listo para Producción</h2>

  <p class="muted" style="font-size: 1.15rem; margin-bottom: 2rem;">
    Manteka-Repomix combina análisis estructural determinista, empaquetado RAG-ready y MCP nativo para habilitar agentes de código autónomos con contexto limpio y verificable.
  </p>

  <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 0.75rem; margin-bottom: 2rem;">
    <span class="badge">Determinista & Reproducible</span>
    <span class="badge">CLI + MCP Unificado</span>
    <span class="badge">Gates CI/CD Blindados</span>
    <span class="badge">TypeScript Strict End-to-End</span>
    <span class="badge">Zero Drift · Single Source of Truth</span>
  </div>

  <h3 style="color: #3DF5B3; letter-spacing: -0.01em; text-transform: none; font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem;">
    "De la idea al código autónomo. Código limpio, pruebas blindadas y arquitectura a prueba de fallos."
  </h3>

  <p class="muted" style="margin-top: 1.25rem; font-size: 1rem;">
    Estado verificado: <strong class="accent">198 test files · 2371/2371 tests passing · 0 TypeScript errors</strong><br/>
    Roadmap activo: Federated Learning & Nostr · Evolución Darwiniana Avanzada · Dashboard Web en tiempo real
  </p>

</div>

<footer style="margin-top: 2rem; text-align: center;">
  Manteka-Repomix · Open-Source · Built for Engineering Excellence at Scale
</footer>

---