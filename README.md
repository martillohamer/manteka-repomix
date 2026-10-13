<div align="center" markdown="1">
  <sub>Autonomous Code Evolution Engine by <a href="https://github.com/martillohamer">martillohamer</a></sub>
  <br><br>
  <b>Manteka Repomix</b><br>
  <sub>Pack your repository into AI-friendly formats — with a dependency-graph auditor, a RAG exporter and a native MCP server.</sub>
</div>

<br>

<div align="center">

[![CI](https://img.shields.io/badge/tests-2371%20passing%20%C2%B7%200%20failed-brightgreen?style=for-the-badge&logo=vitest)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![Build](https://img.shields.io/badge/build-0%20errors-49A748?style=for-the-badge&logo=githubactions&logoColor=white)](#)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-0078D4?style=for-the-badge&logo=windows&logoColor=white)](#)
[![MCP](https://img.shields.io/badge/MCP-JSON--RPC%202.0%20stdio-73B40A?style=for-the-badge&logo=modelcontextprotocol&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-MIT-000000?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)](package.json)

</div>

<br>

<p align="center">
  <b>2371 tests passing · 0 failures · 0 TypeScript errors</b><br>
  <sub>198 test files · verified on Node 24 · Windows and POSIX</sub>
</p>

<p align="center">
  <a href="#-get-started-in-60-seconds"><b>⚡ Get started in 60 seconds</b></a> ·
  <a href="#-command-reference">Commands</a> ·
  <a href="#-rag-export">RAG export</a> ·
  <a href="#-architecture">Architecture</a>
</p>

---

## 📖 What This Is

**Manteka Repomix** packs a repository into a single AI-friendly file you can paste into
Claude, ChatGPT, Gemini, DeepSeek, Perplexity, Llama, Grok and friends.

It is also a **static analysis workbench**. Around the packer sits a set of commands that
answer the questions you actually have when an agent needs to work inside your code:

| Question | Command |
|---|---|
| *Is my environment sane before I trust an agent?* | `manteka doctor` |
| *What does this one file actually depend on?* | `manteka slice <entry> --export markdown` |
| *How deep does this dependency graph go?* | `manteka analyze . --deep` |
| *What tools will the agent see over MCP?* | `manteka inspect --json` |

---

## ⚡ Get Started in 60 Seconds

### Install

```bash
git clone https://github.com/martillohamer/manteka-repomix.git
cd manteka-repomix
npm install
npm run build
```

Requires **Node.js 22+**. Run `manteka doctor` to confirm your environment.

### Diagnose

```bash
node bin/manteka.cjs doctor
```

```text
=== Manteka Environment Health Check ===

  1. ✅ Node.js Version
     Node.js v24.15.0 (compatible)
  2. ✅ File System Permissions
     File read/write permissions OK
  3. ✅ Memory Lineage Integrity
     Lineage file OK - 60 valid entries out of 60 lines
  4. ⚠️ Configuration Integrity
     Configuration issues: server.json missing "serverName" field

🟡 Some checks had warnings - review above
```

Exits non-zero only on a hard failure, so it is safe to use as a CI gate.

### Audit the dependency graph

```bash
# Direct dependencies only (default) — always fast
node bin/manteka.cjs analyze .

# Full transitive expansion with depth metrics
node bin/manteka.cjs analyze . --deep
```

```text
📊 Dependency Analysis Report
📁 Project: /path/to/project
📄 Files analyzed: 3
🔗 Unique dependencies: 2
📏 Average imports per file: 0.67
🕸️  Mode: deep (transitive)
📐 Maximum import depth: 2
🪜  Files by distance from a root: depth 0: 1 file(s), depth 1: 1 file(s), depth 2: 1 file(s)
🔭 Files reachable transitively: 2
🚪 Entry points: src\index.ts
🍃 Leaf files: src\leaf.ts
✅ No circular dependencies detected
```

`--deep` only ever **adds** information — the direct-edge graph is byte-identical in both
modes, and a test asserts it.

### Inspect the MCP surface

```bash
node bin/manteka.cjs inspect          # human readable
node bin/manteka.cjs inspect --json   # machine readable, with parameter schemas
```

```json
[
  {
    "name": "manteka_smart_slice",
    "description": "Exports the Smart-Slice dependency closure as RAG-ready markdown, json or xml",
    "parameters": {
      "exportFormat": "Optional export format: markdown, json or xml (default: markdown)",
      "entry": "Entry point to trace dependencies from",
      "root": "Root directory",
      "depth": "Maximum dependency depth"
    }
  }
]
```

### Pack a repository

```bash
node bin/repomix.cjs                              # whole repo
node bin/repomix.cjs src                          # one directory
node bin/repomix.cjs --include "src/**/*.ts,*.md"  # glob patterns
node bin/repomix.cjs --ignore "**/*.log,tmp/"     # exclude
node bin/repomix.cjs --remote martillohamer/manteka-repomix
node bin/repomix.cjs --compress                   # Tree-sitter extraction, ~70% fewer tokens
node bin/repomix.cjs --stdout | your-llm-client    # pipe straight into a tool
```

---

## 🧠 RAG Export — `manteka slice --export`

`--smart` packs the dependency closure as a repomix document. `slice` goes further: it
renders that closure **as retrieval context**, ready to be injected straight into a
prompt or an embedding pipeline.

```bash
# To stdout
node bin/manteka.cjs slice src/cli/types.ts --export markdown

# To a file (parent directories are created)
node bin/manteka.cjs slice src/cli/types.ts --export json --out ctx/slice.json
node bin/manteka.cjs slice src/cli/types.ts --export xml  --out ctx/slice.xml
```

### Formats compared

| Format | Shape | Best for |
|---|---|---|
| `markdown` | Fenced code blocks per file, plus a dependency tree and a context preamble | Direct prompt injection; survives chunking with per-file attribution |
| `json` | `{ schemaVersion, entry, depth, fileCount, dependencyTree[], files[], warnings[] }` | Pipelines needing structure — chunking, metadata, embedding, dedup |
| `xml` | `<smart-slice>` with `<dependency-tree>`, `<files>` and CDATA content | Toolchains that already parse XML; keeps content byte-exact via CDATA |

All three carry the same information: entry point, depth, resolved file list, per-file
content, truncation flags and engine warnings.

### Behaviour worth knowing

- **`--export` is required.** An unknown value (`yaml`, `md`) exits non-zero with a clear
  message rather than silently defaulting to a format you did not ask for.
- **Files are capped at 20,000 characters** each, so a single huge file cannot flood the
  context window. Truncated files are flagged in all three formats.
- **Markdown fences escalate** past any fence inside the content, so a nested ` ``` `
  cannot terminate the block early.
- **XML splits `]]>`** so file contents cannot close the CDATA section early.
- **`--depth`** bounds traversal: `0` = entry only, `2` (default) = imports of imports.

### Available as an MCP tool

The same renderer backs the `manteka_smart_slice` MCP tool, so an agent can pull the
closure for itself without shelling out:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call",
 "params":{"name":"manteka_smart_slice",
           "arguments":{"exportFormat":"markdown","entry":"src/index.ts","depth":2}}}
```

A test asserts the tool and the CLI produce byte-identical output for the same input.

---

## 📊 Command Reference

### `manteka` — analysis and diagnostics

| Command | Description |
|---|---|
| `manteka doctor` | Environment health: Node version, fs permissions, lineage integrity, config metadata |
| `manteka analyze [root]` | Dependency-graph audit; `--deep` for transitive expansion, `--output json` |
| `manteka slice [entry] --export <fmt>` | RAG export of the Smart-Slice closure (`--out <path>` to write a file) |
| `manteka inspect [--json]` | List registered MCP tools with parameter schemas |
| `manteka serve` | Start the native MCP stdio server (JSON-RPC 2.0) |
| `manteka version` | Print version information |

### `repomix` — packing

| Flag | Description |
|---|---|
| `--include <patterns>` | Only files matching these comma-separated globs |
| `--ignore <patterns>` | Exclude these globs (`.gitignore` / `.ignore` also apply) |
| `--smart <entry>` | Pack only the forward dependency closure of `<entry>` |
| `--smart-depth <n>` | Traversal depth for `--smart` (default `2`) |
| `--compress` | Tree-sitter extraction of signatures only (~70% fewer tokens) |
| `--remote <url>` | Pack a remote repository (`owner/repo` shorthand supported) |
| `--stdout` | Write to stdout instead of a file (pipe-friendly) |
| `--include-diffs` / `--include-logs` | Append git working-tree diffs / commit history |
| `--token-count-tree [n]` | File tree annotated with token counts |
| `--mcp [--sandbox [dir]]` | Run as an MCP server; `--sandbox` confines all file tools |

### Smart-Slice traversal

`--smart` walks the **forward** dependency closure — the file's blast radius — and packs
only that.

| Depth | Includes |
|---|---|
| `0` | The entry file only |
| `1` | + direct imports |
| `2` | + imports of imports *(default)* |

Relative imports only (`./`, `../`). Bare packages, Node built-ins and URLs are ignored.
Cycles terminate safely; ignore rules still win; unresolvable imports warn rather than
fail.

### MCP tools

19 tools are registered outside `--sandbox` (11 inside it):

**Packing & analysis** — `pack_codebase`, `pack_remote_repository`, `attach_packed_output`,
`read_repomix_output`, `grep_repomix_output`, `generate_skill`,
`manteka_analyze_code_health`, `manteka_analyze_codebase`, `manteka_semantic_debug`

**Memory stream** — `manteka_get_context`, `manteka_store_note`, `manteka_search_memory`,
`manteka_log_history`

**Manteka native** — `manteka_heal`, `manteka_swarm_query`, `manteka_memory_search`,
`manteka_quality_gate`, `manteka_doctor`, `manteka_smart_slice`

> The native tools write to caller-supplied paths and walk caller-supplied roots, so they
> are **not** registered under `--sandbox`. That is deliberate: exposing them inside the
> sandbox would hand an agent the unbounded access the sandbox exists to remove.

```bash
repomix --mcp                       # full tool set
repomix --mcp --sandbox path/to/repo # confined file tools only
```

---

## 🏗️ Architecture

```text
                          ┌──────────────────────────────────────────────┐
                          │                 Entry Points                 │
                          │                                              │
                          │   bin/repomix.cjs          bin/manteka.cjs   │
                          │        │                        │            │
                          │        ▼                        ▼            │
                          │   cliRun.ts                 cli/index.ts      │
                          │   (packer flags)            (main() +         │
                          │                             createManteka    │
                          │                             Program())        │
                          └────────┬─────────────────────────┬───────────┘
                                   │                         │
        ┌──────────────────────────┴─────────────────────────┴────────────┐
        │                            core/                                 │
        │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐   │
        │  │  smartSlice/     │  │   analyze/       │  │   doctor/     │   │
        │  │                  │  │                  │  │               │   │
        │  │ dependencyGraph  │  │ import parser    │  │ node version  │   │
        │  │ export renderers │  │ transitiveGraph  │  │ fs permissions│   │
        │  │ (md/json/xml)    │  │ depth + cycles   │  │ lineage       │   │
        │  └────────┬─────────┘  └────────┬─────────┘  │ config        │   │
        │           │                     │            └───────────────┘   │
        │           └──────────┬──────────┘                                │
        └──────────────────────┼───────────────────────────────────────────┘
                               │
   ┌───────────────────────────┼───────────────────────────────────────────┐
   │                           ▼                                           │
   │  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
   │  │   healer/      │  │    swarm/        │  │      memory/         │    │
   │  │ diagnose→patch │  │ agents + bus     │  │ lineage store        │    │
   │  └────────┬───────┘  │ Raft/BFT/CRDT    │  │ vectorizer           │    │
   │           │          └────────┬─────────┘  │ findSimilar()        │    │
   │  ┌────────┴───────┐           │            └──────────┬───────────┘    │
   │  │   hooks/       │           │                       │                │
   │  │ mutation ops   │           │                       │                │
   │  │ quality gate   │           │                       │                │
   │  └────────────────┘           │                       │                │
   └───────────────────────────────┼───────────────────────┼────────────────┘
                                   │                       │
                                   ▼                       ▼
                        ┌──────────────────┐   ┌──────────────────────────┐
                        │ .manteka/memory/ │   │      packager/          │
                        │ lineage.ndjson   │   │ tree-sitter · tokenize  │
                        │ (append-only)    │   │ → xml/md/json/plain     │
                        └──────────────────┘   └──────────────────────────┘

   ┌────────────────────────────────────────────────────────────────────────┐
   │                              mcp/                                       │
   │                                                                        │
   │   ┌──────────────────────┐        ┌──────────────────────────────┐    │
   │   │  server.ts           │        │  mcpServer.ts                 │    │
   │   │  Native JSON-RPC 2.0 │        │  @modelcontextprotocol/sdk   │    │
   │   │  over stdio          │        │  + tools/ (19 registered)    │    │
   │   │  registerToolHandler │        │  registerTool                │    │
   │   └──────────┬───────────┘        └──────────────┬───────────────┘    │
   │              │                                   │                    │
   │              └────────────► tools.ts ◄──────────┘                    │
   │                          (single registry,                           │
   │                           shared by both servers)                     │
   └────────────────────────────────────────────────────────────────────────┘
```

Three design points the diagram encodes:

1. **`core/` is the shared floor.** The Smart-Slice engine, the analyzer and the doctor
   checks are each implemented once and imported by both the CLI and the MCP layer — no
   duplicated formatter, no `mcp → cli` import inversion.
2. **Two MCP servers, one registry.** `server.ts` is a dependency-free native JSON-RPC
   implementation; `mcpServer.ts` wraps the official SDK. `tools.ts` holds the single tool
   registry, with `registerMantekaToolsForSdk` adapting handlers onto the SDK API.
3. **Memory is append-only.** `lineage.ndjson` records every mutation decision, making
   evolution traceable after the fact.

---

## 📦 Output Formats

`--style <type>` selects the packed document format:

| Style | Use |
|---|---|
| `xml` *(default)* | Best for LLM consumption; structured `<file>` elements |
| `markdown` | Human-readable, renders in most viewers |
| `json` | Programmatic post-processing |
| `plain` | Raw concatenation |

Useful extras: `--output-show-line-numbers`, `--remove-comments`,
`--remove-empty-lines`, `--truncate-base64`, `--split-output 2mb`,
`--parsable-style` (escapes characters that would break XML/markdown),
`--header-text`, `--instruction-file-path`.

---

## 🐳 Docker

```bash
docker run -v .:/app -it --rm ghcr.io/martillohamer/manteka-repomix
docker run -v ./out:/app -it --rm ghcr.io/martillohamer/manteka-repomix --remote martillohamer/manteka-repomix
```

---

## 💡 Prompt Examples

**Code review**
```text
This file contains my entire codebase. Review the overall structure and suggest
improvements to maintainability and scalability.
```

**Focused review (recommended)** — use the slice export so the agent sees only what matters:
```bash
node bin/manteka.cjs slice src/services/checkout.ts --export markdown --out ctx/checkout.md
```
```text
Here is the complete dependency closure of src/services/checkout.ts. Review it for
race conditions in the payment flow. Do not speculate about code outside this context.
```

**Test generation**
```text
Analyze the code in this file and suggest a comprehensive set of unit tests, including
edge cases and error scenarios.
```

---

## 🧪 Quality Gates

```bash
npm run build      # tsc -p tsconfig.build.json  → 0 errors
npm run lint-ts    # tsc --noEmit                → 0 errors
npx vitest run     # 2371 passed · 0 failed · 18 skipped
```

The 18 skipped tests are deliberate and itemised in [`HANDOFF.md`](HANDOFF.md#11-on-the-18-skipped-tests).
That document also records the architectural decisions, the seven runtime bugs the
type errors surfaced, and the known gaps.

---

## 🤝 Contributing

1. **Open an issue first** for anything beyond a trivial fix, so the approach can be
   agreed before the work.
2. **Branch** from `main`: `git checkout -b feat/your-change`.
3. **Keep all three gates green** before opening a PR — CI will run the same three.
4. **Match the surrounding code.** Type-only imports under `verbatimModuleSyntax`,
   `node:path` for all path work, zero new runtime dependencies in `core/`.
5. **Add tests for behaviour changes**, not just for new exports.
6. **Write the reasoning, not just the diff** — commit bodies use typed action lines
   (`intent(scope):`, `decision(scope):`, `rejected(scope):`, `constraint(scope):`,
   `learned(scope):`) so the next engineer knows *why*, not only *what*.
7. **Document the constraints you discovered.** If something bit you and would bite
   anyone else, it belongs in `HANDOFF.md`.

### Project layout

```text
src/
├── cli/          # two entry points: repomix (cliRun.ts) and manteka (index.ts)
├── core/         # analyze · doctor · smartSlice — shared by CLI and MCP
├── mcp/          # native JSON-RPC server, SDK server, shared tool registry
├── swarm/        # consensus orchestrator, event bus, specialised agents
├── memory/       # NDJSON lineage store + vectorizer
├── hooks/        # mutation operators, quality gate
└── healer/       # diagnose → patch loop
```

---

## 📜 License

[MIT](LICENSE). Copyright (c) 2024 Kazuki Yamada.

---

<div align="center">
  <sub>Built with the principle that code should not only work — it should evolve toward better versions of itself.</sub>
</div>

## Resources

- [📊 Executive Slide Deck](PRESENTATION.md)

