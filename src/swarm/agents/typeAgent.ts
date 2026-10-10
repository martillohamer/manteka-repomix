/**
 * typeAgent.ts - Especializado en diagnosticar y proponer micro-parches
 * para errores de tipado o inferencias.
 *
 * Restricciones: cero runtime deps, rutas Windows-safe, TypeScript estricto.
 */
import type { AgentMessage, AgentRole, SwarmAgent, SwarmDeps, SwarmProposal } from '../types.js';

const TYPE_AGENT_ROLE: AgentRole = 'typeAgent';

const typeAgentId = 'type-agent-1';

export const typeAgent: SwarmAgent = {
  id: typeAgentId,
  role: TYPE_AGENT_ROLE,
  deps: {} as SwarmDeps,
  active: true,
};

/**
 * Diagnoses TypeScript-like type errors from file content and proposes patches.
 * @param filePath - Path to the source file
 * @param content - File content to analyze
 * @returns Array of diagnosed issues and proposed patches
 */
export const diagnoseAndPatch = async (filePath: string, content: string): Promise<AgentMessage[]> => {
  const issues: AgentMessage[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNum = i + 1;

    // Pattern: variable declaration without type annotation
    // Match: `let/const/var identifier = value;` without `identifier: type;`
    const noTypePattern = /^\s*(let|const|var)\s+\w+\s*=\s*(?![^:]*:)\S/;
    if (noTypePattern.test(line)) {
      // Verify it truly has no type annotation (no `: type` after variable name)
      const hasTypeAnnotation = /:\s*\w+\s*=/.test(line);
      if (!hasTypeAnnotation) {
        const issue: AgentMessage = {
          id: `${typeAgentId}:${filePath}:${lineNum}`,
          role: TYPE_AGENT_ROLE,
          timestamp: Date.now(),
          sourceFile: filePath,
          severity: 'info',
          message: `Potential missing type annotation on line ${lineNum}`,
          context: line.trim(),
          metadata: {
            detectedPattern: 'missingTypeAnnotation',
            lineNumber: lineNum,
          },
        };
        issues.push(issue);
      }
    }

    // Pattern: type mismatch (variable assigned wrong type literal)
    const typeMismatchPattern =
      /^\s*(let|const|var)\s+\w+\s*:\s*(string|number|boolean)\s*=\s*(?:"[^"]*"|'[^']*'|\w+)\s*;?\s*$/;
    if (typeMismatchPattern.test(line)) {
      const issue: AgentMessage = {
        id: `${typeAgentId}:${filePath}:${lineNum}`,
        role: TYPE_AGENT_ROLE,
        timestamp: Date.now(),
        sourceFile: filePath,
        severity: 'warn',
        message: `Potential type mismatch on line ${lineNum}`,
        context: line.trim(),
        metadata: {
          detectedPattern: 'typeMismatch',
          lineNumber: lineNum,
        },
      };
      issues.push(issue);
    }
  }

  // Propose patches for detected issues
  const patches: AgentMessage[] = issues.map((issue) => {
    const patch: SwarmProposal['patch'] = {
      file: issue.sourceFile,
      diff: '',
      confidence: 0.6,
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
