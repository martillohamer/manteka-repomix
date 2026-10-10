/**
 * lintAgent.ts - Especializado en limpiar imports muertos, estilos y espacios en blanco.
 *
 * Restricciones: cero runtime deps, rutas Windows-safe, TypeScript estricto.
 */
import type { AgentMessage, AgentRole, SwarmAgent, SwarmDeps, SwarmProposal } from '../types.js';

const LINT_AGENT_ROLE: AgentRole = 'lintAgent';

const lintAgentId = 'lint-agent-1';

export const lintAgent: SwarmAgent = {
  id: lintAgentId,
  role: LINT_AGENT_ROLE,
  deps: {} as SwarmDeps,
  active: true,
};

/**
 * Lints a source file for common issues: unused imports, whitespace, style.
 * @param filePath - Path to the source file
 * @param content - File content to lint
 * @returns Array of lint issues and proposed patches
 */
export const lintFile = async (filePath: string, content: string): Promise<AgentMessage[]> => {
  const issues: AgentMessage[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNum = i + 1;

    // Unused import pattern (simplified): import statement not referenced
    const unusedImportPattern = /^import\s+.*\bfrom\b/;
    // Very simplified: check if line starts with "import" and has no usage marker
    if (unusedImportPattern.test(line) && !line.includes('// TODO') && !line.includes('// FIXME')) {
      // Check if this is likely unused by looking at the rest of the file
      const remainingContent = lines.slice(i + 1).join('\n');
      const refPattern = new RegExp(`\\b${line.match(/import\s+(\\w+)/)?.[1]}\\b`, 'm');
      const isReferenced = refPattern.test(remainingContent);

      if (!isReferenced) {
        const issue: AgentMessage = {
          id: `${lintAgentId}:${filePath}:${lineNum}`,
          role: LINT_AGENT_ROLE,
          timestamp: Date.now(),
          sourceFile: filePath,
          severity: 'info',
          message: `Potentially unused import detected`,
          context: line.trim(),
          metadata: {
            detectedPattern: 'unusedImport',
            lineNumber: lineNum,
            importName: line.match(/import\s+(\\w+)/)?.[1],
          },
        };
        issues.push(issue);
      }
    }

    // Trailing whitespace pattern
    const trailingWhitespacePattern = /\s$/;
    if (trailingWhitespacePattern.test(line) && line.trim() !== line) {
      const issue: AgentMessage = {
        id: `${lintAgentId}:${filePath}:${lineNum}`,
        role: LINT_AGENT_ROLE,
        timestamp: Date.now(),
        sourceFile: filePath,
        severity: 'info',
        message: `Trailing whitespace on line ${lineNum}`,
        context: line.trim(),
        metadata: {
          detectedPattern: 'trailingWhitespace',
          lineNumber: lineNum,
        },
      };
      issues.push(issue);
    }

    // Multiple blank lines pattern (more than 2 consecutive)
    const blankLinePattern = /^\s*$/;
    let consecutiveBlanks = 0;
    for (let j = i; j < lines.length; j += 1) {
      if (blankLinePattern.test(lines[j])) {
        consecutiveBlanks += 1;
      } else {
        break;
      }
    }
    if (consecutiveBlanks > 2) {
      const issue: AgentMessage = {
        id: `${lintAgentId}:${filePath}:${lineNum}`,
        role: LINT_AGENT_ROLE,
        timestamp: Date.now(),
        sourceFile: filePath,
        severity: 'warn',
        message: `More than 2 consecutive blank lines starting at line ${lineNum}`,
        context: `${consecutiveBlanks} blank lines`,
        metadata: {
          detectedPattern: 'multipleBlankLines',
          lineNumber: lineNum,
          consecutiveCount: consecutiveBlanks,
        },
      };
      issues.push(issue);
      i += consecutiveBlanks - 1; // Skip past the blank lines
    }
  }

  // Propose patches for detected lint issues
  const patches: AgentMessage[] = issues.map((issue) => {
    const patch: SwarmProposal['patch'] = {
      file: issue.sourceFile,
      diff: '',
      confidence: 0.7,
    };

    return {
      ...issue,
      metadata: {
        ...issue.metadata,
        proposedPatch: patch,
      },
    };
  });

  return patches;
};
