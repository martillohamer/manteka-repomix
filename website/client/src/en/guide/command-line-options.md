---
title: Command Line Options
description: Reference every Repomix CLI option for input, output, file selection, remote repositories, configuration, security, token counting, MCP, and agent skills.
---

# Command Line Options

## Basic Options
- `-v, --version`: Show version information and exit

## CLI Input/Output Options

| Option | Description |
|--------|-------------|
| `--verbose` | Enable detailed debug logging (shows file processing, token counts, and configuration details) |
| `--quiet` | Suppress all console output except errors (useful for scripting) |
| `--stdout` | Write packed output directly to stdout instead of a file (suppresses all logging) |
| `--stdin` | Read file paths from stdin, one per line (specified files are processed directly) |
| `--copy` | Copy the generated output to system clipboard after processing |
| `--token-count-tree [threshold]` | Show file tree with token counts; optional threshold to show only files with ≥N tokens (e.g., `--token-count-tree 100`) |
| `--top-files-len <number>` | Number of largest files to show in summary (default: `5`) |

## Repomix Output Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path (default: `repomix-output.xml`, use `"-"` for stdout) |
| `--style <style>` | Output format: `xml`, `markdown`, `json`, or `plain` (default: `xml`) |
| `--output-file-path-style <style>` | How file paths are shown in output: `target-relative` or `cwd-relative` (default: `target-relative`) |
| `--parsable-style` | Escape special characters to ensure valid XML/Markdown (needed when output contains code that breaks formatting) |
| `--compress` | Extract essential code structure (classes, functions, interfaces) using Tree-sitter parsing |
| `--output-show-line-numbers` | Prefix each line with its line number in the output |
| `--no-file-summary` | Omit the file summary section from output |
| `--no-directory-structure` | Omit the directory tree visualization from output |
| `--no-files` | Generate metadata only without file contents (useful for repository analysis) |
| `--remove-comments` | Strip all code comments before packing |
| `--remove-empty-lines` | Remove blank lines from all files |
| `--truncate-base64` | Truncate long base64 data strings to reduce output size |
| `--header-text <text>` | Custom text to include at the beginning of the output |
| `--instruction-file-path <path>` | Path to file containing custom instructions to include in output |
| `--split-output <size>` | Split output into multiple numbered files (e.g., `repomix-output.1.xml`); size like `500kb`, `2mb`, or `1.5mb` |
| `--include-empty-directories` | Include folders with no files in directory structure |
| `--include-full-directory-structure` | Show entire repository tree in the Directory Structure section, even when using `--include` patterns |
| `--no-git-sort-by-changes` | Don't sort files by git change frequency (default: most changed files first) |
| `--include-diffs` | Add git diff section showing working tree and staged changes |
| `--include-logs` | Add git commit history with messages and changed files |
| `--include-logs-count <count>` | Number of recent commits to include with `--include-logs` (default: `50`) |

## File Selection Options

| Option | Description |
|--------|-------------|
| `--include <patterns>` | Include only files matching these glob patterns (comma-separated, e.g., `"src/**/*.js,*.md"`) |
| `-i, --ignore <patterns>` | Additional patterns to exclude (comma-separated, e.g., `"*.test.js,docs/**"`) |
| `--no-gitignore` | Don't use `.gitignore` rules for filtering files |
| `--no-dot-ignore` | Don't use `.ignore` rules for filtering files |
| `--no-default-patterns` | Don't apply built-in ignore patterns (`node_modules`, `.git`, build dirs, etc.) |

## Remote Repository Options

| Option | Description |
|--------|-------------|
| `--remote <url>` | Clone and pack a remote repository (GitHub URL or `user/repo` format) |
| `--remote-branch <name>` | Specific branch, tag, or commit to use (default: repository's default branch) |
| `--remote-trust-config` | Trust and load config files from remote repositories. A trusted config can run commands and read local files, so use it only for repositories you fully trust (disabled by default for security). On an interactive terminal, the config is shown and you are asked to confirm |

## Configuration Options

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Use custom config file instead of `repomix.config.json` |
| `--init` | Create a new `repomix.config.json` file with defaults |
| `--global` | With `--init`, create config in home directory instead of current directory |

## Security Options
- `--no-security-check`: Skip scanning for sensitive data like API keys and passwords (use with caution; may expose secrets in output)

## Token Count Options
- `--token-count-encoding <encoding>`: Tokenizer model for counting: o200k_base (GPT-4o), cl100k_base (GPT-3.5/4), etc. (default: o200k_base)
- `--token-budget <number>`: Fail with a non-zero exit code when the packed output exceeds N tokens. Useful as a guard in CI pipelines and agent workflows to keep output within a target model's context window. The output is still generated; only the exit code signals the overflow.

## MCP Options
- `--mcp`: Run as Model Context Protocol server for AI tool integration
- `--sandbox [dir]`: (with `--mcp`) Confine the MCP server's file tools to a workspace directory (defaults to the working directory; e.g. `--sandbox path/to/project`). Every path is relative to that root, absolute/host paths are refused, and remote packing, skill generation, and attaching external outputs are disabled. See [MCP Server](/guide/mcp-server).

## Agent Skills Generation Options

| Option | Description |
|--------|-------------|
| `--skill-generate [name]` | Generate Claude Agent Skills format output to `.claude/skills/<name>/` directory (name auto-generated if omitted) |
| `--skill-project-name <name>` | Override the project name used in generated Skills descriptions |
| `--skill-output <path>` | Specify skill output directory path directly (skips location prompt) |
| `-f, --force` | Skip all confirmation prompts (skill directory overwrite, remote config trust) |

## Watch Mode Options

- `-w, --watch`: Watch for file changes and automatically re-pack. New, changed, and deleted files are detected, rapid changes are debounced (300 ms), and a timestamp is printed after each rebuild. Press `Ctrl+C` to stop.

Watch mode only works with local directories, so it cannot be combined with `--remote`, a positional remote repository URL, `--stdout`, `--stdin`, `--split-output`, `--skill-generate`, or `--copy`. These restrictions apply whether the option is set on the command line or in your config file.

## Thermodynamics and Evolution Commands

Repomix ships two analysis commands that read your repository's Git history and report where code is under stress. They are read-only with respect to your working tree: `heat` never writes anything, and `evolve` performs all of its work in throwaway Git worktrees under your temporary directory, leaving your branches, HEAD, and uncommitted work untouched.

### heat

Measures per-file "temperature" from commit churn, author count, file size, and cyclomatic density, then lists the files at or above the threshold as *boiling*.

```bash
# Analyse the last 90 days of history
repomix heat .

# Widen the window and the report size
repomix heat . --days 365 --limit 50

# Machine-readable output
repomix heat . --json
```

| Option | Default | Description |
| --- | --- | --- |
| `--days <n>` | `90` | Days of Git history to analyse |
| `--max-commits <n>` | `500` | Maximum commits to analyse |
| `--t-max <n>` | `80` | Temperature threshold for boiling files |
| `--limit <n>` | `20` | Number of files listed in the table |
| `--json` | off | Emit the raw report instead of a table |
| `--no-fail` | off | Exit `0` even when boiling files are detected |
| `--report` | off | Write `thermodynamic-report.json` to `.manteka-memory/` |

### evolve

Branches your repository into ephemeral mutants, mutates the boiling files, and ranks the mutants by a Biological Fitness Index. Every mutant is evaluated in its own detached Git worktree, so your repository is never modified.

```bash
# Explore five mutants from the current HEAD
repomix evolve .

# Restrict to one operator and two files
repomix evolve . --operator dead-guard --target src/legacy.ts

# Include the project's own test suite in the score
repomix evolve . --run-tests
```

| Option | Default | Description |
| --- | --- | --- |
| `--population <n>` | `5` | Maximum mutants to evaluate |
| `--operator <name>` | all three | Restrict to one operator; repeatable |
| `--target <path>` | boiling files | Restrict to specific files; repeatable |
| `--concurrency <n>` | `2` | Mutants evaluated in parallel |
| `--run-tests` | off | Include the test axis in the fitness index |
| `--test-timeout <ms>` | `300000` | Per-mutant test suite timeout |
| `--json` | off | Emit the raw report instead of a table |
| `--report` | off | Write `evolution-report.json` to `.manteka-memory/` |

`--target` narrows scope, it does not widen it: targets are intersected with the boiling set, so naming a file that is not boiling produces no mutants for it.

**Ranking semantics.** All three mutation operators add code, which slightly raises temperature. Every mutant therefore scores marginally worse than the unmodified baseline, and the ranking means **least harmful first**, not best improvement. Interpret the table that way until cooling operators arrive in a later release.

::: warning Running your test suite
`--run-tests` executes your project's own `test` script once per mutant, on mutated source. That is arbitrary project code running against modified input. Leave it off unless you intend to run it, and expect it to be slow.
:::

## Related Resources

- [Configuration](/guide/configuration) - Set options in your config file instead of CLI flags
- [Output Formats](/guide/output) - Details on XML, Markdown, JSON, and plain text formats
- [Code Compression](/guide/code-compress) - How `--compress` works with Tree-sitter
- [Security](/guide/security) - What `--no-security-check` disables

## Examples

```bash
# Basic usage
repomix

# Custom output file and format
repomix -o my-output.md --style markdown
repomix -o my-output.json --style json

# Output to stdout
repomix --stdout > custom-output.txt

# Send output to stdout, then pipe into another command (for example, simonw/llm)
repomix --stdout | llm "Please explain what this code does."

# Custom output with compression
repomix --compress

# Split output into multiple files (max size per part)
repomix --split-output 20mb

# Process specific files with patterns
repomix --include "src/**/*.ts,*.md" --ignore "*.test.js,docs/**"

# Remote repository with branch
repomix --remote https://github.com/user/repo/tree/main

# Remote repository with commit
repomix --remote https://github.com/user/repo/commit/836abcd7335137228ad77feb28655d85712680f1

# Remote repository with shorthand
repomix --remote user/repo

# Remote repository with shorthand (auto-detected, no --remote needed)
repomix user/repo

# Using stdin for file list
find src -name "*.ts" -type f | repomix --stdin
git ls-files "*.js" | repomix --stdin
echo -e "src/index.ts\nsrc/utils.ts" | repomix --stdin

# Git integration
repomix --include-diffs  # Include git diffs for uncommitted changes
repomix --include-logs   # Include git logs (last 50 commits by default)
repomix --include-logs --include-logs-count 10  # Include last 10 commits
repomix --include-diffs --include-logs  # Include both diffs and logs

# Token count analysis
repomix --token-count-tree
repomix --token-count-tree 1000  # Only show files/directories with 1000+ tokens

# Watch mode — automatically re-pack on file changes
repomix --watch
repomix -w --include "src/**/*.ts"
```
