---
description: Pack local codebase with Repomix
---

Pack a local codebase using Repomix with AI-optimized format.

When the user asks to pack a local codebase, analyze their request and run the appropriate repomix command.

## User Intent Examples

The user might ask in various ways:
- "Pack this codebase"
- "Pack the src directory"
- "Pack this project as markdown"
- "Pack TypeScript files only"
- "Pack with compression and copy to clipboard"
- "Pack this project including git history"

## Your Responsibilities

1. **Understand the user's intent** from natural language
2. **Determine the appropriate options**:
   - Which directory to pack (default: current directory)
   - Output format: xml (default), markdown, json, or plain
   - Whether to compress (for large codebases)
   - File patterns to include/ignore
   - Additional features (copy to clipboard, include git diffs/logs)
3. **Execute the command** with: `npx -y github:DAW1BSergiomg26/manteka-repomix [directory] [options]`

## Available Options

- `--style <format>`: Output format (xml, markdown, json, plain)
- `--include <patterns>`: Include only matching patterns (e.g., "src/**/*.ts,**/*.md")
- `--ignore <patterns>`: Additional ignore patterns
- `--compress`: Enable Tree-sitter compression (~70% token reduction)
- `--output <path>`: Custom output path
- `--copy`: Copy output to clipboard
- `--include-diffs`: Include git diff output
- `--include-logs`: Include git commit history

## Command Examples

Based on user intent, you might run:

```bash
# "Pack this codebase"
npx -y github:DAW1BSergiomg26/manteka-repomix

# "Pack the src directory"
npx -y github:DAW1BSergiomg26/manteka-repomix src/

# "Pack as markdown with compression"
npx -y github:DAW1BSergiomg26/manteka-repomix --style markdown --compress

# "Pack only TypeScript and Markdown files"
npx -y github:DAW1BSergiomg26/manteka-repomix --include "src/**/*.ts,**/*.md"

# "Pack and copy to clipboard"
npx -y github:DAW1BSergiomg26/manteka-repomix --copy

# "Pack with git history"
npx -y github:DAW1BSergiomg26/manteka-repomix --include-diffs --include-logs
```

## Analyzing the Output

**IMPORTANT**: The generated output file can be very large and consume significant context.

If the user wants to analyze or explore the generated output:
- **DO NOT read the entire output file directly**
- **USE an appropriate sub-agent** to analyze the output
- The sub-agent will efficiently search and read specific sections using grep and incremental reading

**Agent Selection Strategy**:
1. If `repomix-explorer:explorer` agent is available, use it (optimized for repomix output analysis)
2. Otherwise, use the `general-purpose` agent or another suitable sub-agent
3. The sub-agent should use Grep and Read tools to analyze incrementally

Example:
```text
User: "Pack this codebase and analyze it"

Your workflow:
1. Run: npx -y github:DAW1BSergiomg26/manteka-repomix
2. Note the output file location (e.g., repomix-output.xml)
3. Launch an appropriate sub-agent with task:
   "Analyze the repomix output file at ./repomix-output.xml.
   Use Grep tool to search for patterns and Read tool to examine specific sections.
   Provide an overview of the codebase structure and main components.
   Do NOT read the entire file at once."
```

## Help and Documentation

If you need more information about available options or encounter any issues:
- Run `npx -y github:DAW1BSergiomg26/manteka-repomix -h` or `npx -y github:DAW1BSergiomg26/manteka-repomix --help` to see all available options
- Check the official documentation at https://github.com/DAW1BSergiomg26/manteka-repomix

Remember: Parse the user's natural language request and translate it into the appropriate repomix command. For analysis tasks, delegate to appropriate sub-agents to avoid consuming excessive context.
