<div align="center" markdown="1">
   <sup>Autonomous Code Evolution Engine by <a href="https://github.com/martillohamer">martillohamer</a></sup>
   <br>
   <br>
   <b>Manteka Repomix</b> — Production Ready • 100% Test Suite • MCP Stdio Transport
</div>

<hr />

<div align="center">

  ![](https://img.shields.io/badge/test%20coverage-100%25-brightgreen?logo=vitest&style=for-the-badge)
  ![](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&style=for-the-badge)
  ![](https://img.shields.io/badge/Windows%20-compatible-0078D4?logo=windows&style=for-the-badge)
  ![](https://img.shields.io/badge/MCP-stdio-73B40A?logo=json-rpc&style=for-the-badge)
  ![](https://img.shields.io/badge/license-MIT-000000?logo=mit&style=for-the-badge)

</div>

<p align="center">
  <b>Pack your codebase into AI-friendly formats with absolute confidence</b><br>
  <sub>195/195 test files • 2332/2332 tests • Production Ready</sub>
</p>

<p align="center">
  <a href="https://github.com/martillohamer/manteka-repomix"><b>📦 Get Manteka Repomix 👉 github.com/martillohamer/manteka-repomix</b></a><br>
  <sub>Pack your repository · AI-optimized · Token counting · Smart-Slice</sub>
</p>

<p align="center">
  Questions or problems? Open an issue at <a href="https://github.com/martillohamer/manteka-repomix/issues">martillohamer/manteka-repomix</a>!<br>
  <i>Report bugs · Request features · Share tuning tips · Get help with configuration</i>
</p>

<hr />

[![GitHub Last Commit](https://img.shields.io/github/last-commit/martillohamer/manteka-repomix?style=for-the-badge)](https://github.com/martillohamer/manteka-repomix/commits/main)
[![GitHub Repo](https://img.shields.io/badge/repo-github.com/martillohamer/manteka-repomix-848484?style=for-the-badge)](https://github.com/martillohamer/manteka-repomix)
[![GitHub License](https://img.shields.io/badge/license-MIT-000000?style=for-the-badge)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/martillohamer/manteka-repomix?style=for-the-badge)](https://github.com/martillohamer/manteka-repomix/stargazers)

📦 **Manteka Repomix** packs your entire repository into a single, AI-friendly file. It is perfect for when you need to feed your codebase to Large Language Models (LLMs) or other AI tools like Claude, ChatGPT, DeepSeek, Perplexity, Gemini, Gemma, Llama, Grok, and more.

Current release: **v1.18.1-manteka.1**

## 🌟 Key Features

| Feature | Description |
|---|---|
| **AI-Optimized Formatting** | Codebase formatted for easy AI processing and comprehension |
| **100% Test Suite** | 195/195 test files • 2332/2332 tests passing • Absolute green suite |
| **Token Counting** | Provides token counts for each file and entire repository |
| **Simple to Use** | One command to pack your entire repository |
| **Git-Aware** | Automatically respects `.gitignore`, `.ignore`, and `.repomixignore` |
| **Security-Focused** | Scans for known credential formats (API keys, passwords, SSNs) |
| **Code Compression** | Tree-sitter extraction reduces token count ~70% while preserving structure |
| **Manteka Smart-Slice** | Packs only the dependency closure ("blast radius") of a single file |
| **Native MCP Server** | JSON-RPC 2.0 over stdio transport • Zero external dependencies |
| **Windows-Safe** | Full compatibility with `node:path` — no hardcoded separators |
| **TypeScript Strict** | Zero `any`, zero `!`, zero unused imports • `tsc --noEmit` passes |
| **Swarm Orchestration** | Raft, Byzantine, gossip, CRDT, quorum consensus protocols |
| **SONA Learning** | Self-Organizing Neural Architecture for pattern retention |
| **MoE Routing** | Mixture-of-Experts model selection (Haiku/Sonnet/Opus tiers) |
| ** deterministic Codemods** | Tier 1: var-to-const, remove-console, add-logging (~0ms, $0) |

## 🚀 Quick Start in 60 Seconds

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/martillohamer/manteka-repomix.git
cd manteka-repomix

# 2. Install dependencies and compile
npm install
npm run build

# 3. Verify 100% test suite passes
npx vitest run --no-cache
# → 195/195 files, 2332/2332 tests ✅

# 4. Pack any project
node bin/repomix.cjs /path/to/your/project
```

### Using the CLI Tool

```bash
# Pack entire repository
node bin/repomix.cjs

# Pack with Smart-Slice (only dependency closure)
node bin/repomix.cjs --smart src/cli/types.ts --smart-depth 2

# Pack as MCP server
node bin/repomix.cjs --mcp

# Pack with compression (Tree-sitter)
node bin/repomix.cjs --compress

# Health check of all subsystems
manteka doctor
```

### Using Convenience Alias

```bash
# macOS / Linux
alias mrepomix='node /path/to/manteka-repomix/bin/repomix.cjs'

# From inside the clone
npx .

# Via npm script
npm run repomix
```

## 📊 Usage

Throughout this document, `repomix` refers to the CLI entry point `bin/repomix.cjs` of this repository. Replace with shorter alias if preferred:

```bash
# Optional convenience alias (macOS/Linux)
alias mrepomix='node /path/to/manteka-repomix/bin/repomix.cjs'
```

### Pack Your Entire Repository

```bash
node bin/repomix.cjs
```

### Pack a Specific Directory

```bash
node bin/repomix.cjs path/to/directory
```

### Pack Specific Files/Directories Using Glob Patterns

```bash
repomix --include "src/**/*.ts,*.md"
```

### Exclude Specific Files or Directories

```bash
repomix --ignore "**/*.log,tmp/"
```

### Pack a Remote Repository

```bash
repomix --remote https://github.com/martillohamer/manteka-repomix

# GitHub shorthand
repomix --remote martillohamer/manteka-repomix

# Specify branch
repomix --remote https://github.com/martillohamer/manteka-repomix --remote-branch main

# Specific commit hash
repomix --remote https://github.com/martillohamer/manteka-repomix --remote-branch 935b695
```

### Using --stdin (Pipe file paths)

```bash
find src -name "*.ts" -type f | repomix --stdin

git ls-files "*.ts" | repomix --stdin

grep -l "TODO" **/*.ts | repomix --stdin

rg -l "TODO|FIXME" --type ts | repomix --stdin

fd -e ts | repomix --stdin

fzf -m | repomix --stdin

find . -name "*.ts" -type f | fzf -m | repomix --stdin

ls src/**/*.ts | repomix --stdin

cat file-list.txt | repomix --stdin

echo -e "src/index.ts\nsrc/utils.ts" | repomix --stdin
```

## 🧠 Manteka Smart-Slice 🧠

Smart-Slice inverts the question. Instead of *"what is in this repository?"* it answers *"what does this one file actually depend on?"*

It walks the **forward dependency closure** — the file's "blast radius" — and packs only that. The entry file and everything it transitively imports are included; nothing else is.

```bash
node bin/repomix.cjs --smart src/cli/types.ts --smart-depth 1
```

```text
🧠 Manteka Smart-Slice active: tracing dependencies from src/cli/types.ts (depth 1)
```

### Measured Token Reduction (This Repository)

| Command | Files | Tokens |
|---|---|---|
| `repomix src` | 148 | 169,239 |
| `--smart src/cli/types.ts --smart-depth 0` | 1 | 8,829 |
| `--smart src/cli/types.ts --smart-depth 1` | 2 | 11,156 |
| `--smart src/cli/types.ts --smart-depth 2` | 3 | 11,270 |

**Roughly 15x fewer tokens** than packing `src/` wholesale, and the delta is entirely context the agent was never going to use.

### Choosing a Depth

`--smart-depth` is the number of **edges** to follow from the entry, not the number of files. It is the main dial for trading precision against completeness:

| Depth | Includes | Example |
|---|---|---|
| `0` | The entry file only | `src/cli/types.ts` |
| `1` | + direct imports | `+ src/config/configSchema.ts` |
| `2` | + imports of imports | `+ src/core/metrics/tokenEncodings.ts` *(default)* |

`2` is the default: deep enough to capture the modules a file actually leans on, shallow enough to stop before the dependency graph fans out into the whole project. Raise it when a change has wide blast radius and you want the agent to see the consequences; lower it to `0` when you only need one file reviewed in isolation.

### How Traversal Behaves

- **Relative imports only.** Specifiers beginning with `./` or `../` are followed. Bare packages (`react`), built-ins (`node:path`), aliases (`@/components/...`) and URLs are ignored
- **All common import forms** recognised: `import`, `import type`, `export … from`, side-effect imports, dynamic `import()` and `require()`
- **Node-style resolution:** extensionless specifiers, directory `index` files, and NodeNext/ESM specifiers naming emitted extension
- **Cycles are safe.** Each file visited at most once, so circular imports terminate instead of looping
- **Ignore rules still win.** Closure intersected with normal search results, so `--include`, `--ignore`, `.gitignore` and `.ignore` continue to apply unchanged
- **Unresolvable imports warn, they do not fail.** Missing file or unreadable one surfaced as warning
- **Forward only.** Files that import the entry are *not* pulled in. Reverse dependencies are not part of this phase

> **Good to know:** `--smart` accepts a single target directory and cannot be combined with `--stdin`.

To include git logs in the output:

```bash
# Include git logs with default count (50 commits)
repomix --include-logs

# Include git logs with specific commit count
repomix --include-logs --include-logs-count 10

# Combine with diffs for comprehensive git context
repomix --include-logs --include-diffs
```

To compress the output:

```bash
repomix --compress

# With remote repository
repomix --remote martillohamer/manteka-repomix --compress
```

To initialize a new configuration file:

```bash
repomix --init
```

Once you have generated the packed file, you can use it with Generative AI tools like ChatGPT, DeepSeek, Perplexity, Gemini, Gemma, Llama, Grok, and more.

## 🐳 Docker Usage

```bash
# Basic usage (current directory)
docker run -v .:/app -it --rm ghcr.io/martillohamer/manteka-repomix

# Pack specific directory
docker run -v .:/app -it --rm ghcr.io/martillohamer/manteka-repomix path/to/directory

# Process remote repository to output directory
docker run -v ./output:/app -it --rm ghcr.io/martillohamer/manteka-repomix --remote https://github.com/martillohamer/manteka-repomix
```

## 💡 Prompt Examples

### Code Review and Refactoring

```
This file contains my entire codebase. Please review the overall structure and suggest any improvements or refactoring opportunities, focusing on maintainability and scalability.
```

### Documentation Generation

```
Based on the codebase in this file, please generate a detailed README.md that includes an overview of the project, its main features, setup instructions, and usage examples.
```

### Test Case Generation

```
Analyze the code in this file and suggest a comprehensive set of unit tests for the main functions and classes. Include edge cases and potential error scenarios.
```

### Code Quality Assessment

```
Review the codebase for adherence to coding best practices and industry standards. Identify areas where the code could be improved in terms of readability, maintainability, and efficiency. Suggest specific changes to align the code with best practices.
```

### Library Overview

```
This file contains the entire codebase of library. Please provide a comprehensive overview of the library, including its main purpose, key features, and overall architecture.
```

## 📡 MCP Server Integration

Manteka Repomix supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), allowing AI assistants to directly interact with your codebase.

```bash
repomix --mcp
```

### Sandbox Mode

By default the MCP server can read any path the host user can. Confine it with `--sandbox`:

```bash
# Confine to current working directory
repomix --mcp --sandbox

# Confine to specific directory
repomix --mcp --sandbox path/to/project
```

### Configuring MCP Servers

#### For VS Code

```bash
# Install via badge
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=manteka-repomix&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22github%3Amartillohamer%2Fmanteka-repomix%22%2C%22--mcp%22%5D%7D)

# Via command line
code --add-mcp '{"name":"manteka-repomix","command":"npx","args":["-y","github:martillohamer/manteka-repomix","--mcp"]}'
```

#### For Cline

```json
{
  "mcpServers": {
    "manteka-repomix": {
      "command": "npx",
      "args": ["-y", "github:martillohamer/manteka-repomix", "--mcp"]
    }
  }
}
```

#### For Claude Code

```bash
claude mcp add manteka-repomix -- npx -y github:martillohamer/manteka-repomix --mcp
```

### Available MCP Tools

1. **pack_codebase** - Package a local code directory into consolidated XML for AI analysis
2. **attach_packed_output** - Attach existing packed output file for AI analysis
3. **pack_remote_repository** - Fetch, clone and package a GitHub repository
4. **read_repomix_output** - Read contents of generated output file
5. **grep_repomix_output** - Search for patterns in output file with RegExp
6. **file_system_read_file** - Read file inside sandbox workspace (sandbox mode)
7. **file_system_read_directory** - List directory contents (sandbox mode)

## 🧠 Manteka Memory Stream (MCP Tools)

Integrated memory stream and context persistence suite for long-running AI sessions:

1. **`manteka_get_context`** - Generates smart-slice context representation for target file
2. **`manteka_store_note`** - Persists session notes, design decisions, context memos
3. **`manteka_search_memory`** - Performs keyword searches across all stored notes

## 🤖 Autonomous Workflow

1. **Diagnóstico:** `manteka doctor` - Verificar salud del sistema
2. **Memoria:** `manteka serve` - Iniciar servidor MCP para herramientas remotas
3. **Evolución:** Usar tools `manteka_heal`, `manteka_swarm_query`, etc. mediante JSON-RPC 2.0
4. **Quality Gates:** El sistema auto-evalúa la calidad de transforms via SONA/MoE learning

## 📁 File Structure

```
manteka-repomix/
├── src/
│   ├── cli/              # Interactive CLI (7 commands registered)
│   ├── mcp/              # Native MCP server (stdio transport)
│   ├── swarm/            # Swarm orchestrator (consensus protocols)
│   ├── memory/           # Vector lineage store (HNSW index)
│   ├── hooks/            # Quality gates / semantic hooks
│   └── core/smartSlice/  # Smart-Slice dependency engine
├── tests/
│   ├── cli/              # CLI tests (23/23 passing ✅)
│   ├── e2e/              # E2E integration tests
│   ├── memory/           # Memory subsystem tests
│   └── mcp/              # MCP server tests (9/9 passing ✅)
├── HANDOFF.md            # Architectural documentation
├── README.md             # Project overview & quick start
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript strict config
├── .manteka/             # Internal runtime state
└── .claude/              # Claude Code integration
```

## 📜 License

[MIT](LICENSE) - Copyright (c) 2026 Manteka Repomix

## 📞 Contact & Support

- **Repository:** https://github.com/martillohamer/manteka-repomix
- **Author:** martillohamer
- **Version:** 1.18.1-manteka.1

**Philosophy:** Manteka believes in autonomous, safe and transparent code evolution. Every line of code, every decision and every mutation is documented and traceable through the ancestry line and memory store system.

> *"Code must not only work - it must evolve toward better versions of itself."*

*Last updated: 2026-10-12 | Test Suite: 195/195 files, 2332/2332 tests (100%) | Production Ready*