/**
 * smellAgent.ts - Especializado en code smells y refactorizaciones de
 * complejidad atómica (≤ 20 líneas).
 *
 * Restricciones: cero runtime deps, rutas Windows-safe, TypeScript estricto.
 */
import type { AgentMessage, AgentRole, SwarmAgent, SwarmDeps, SwarmProposal } from '../types.js';

const SMELL_AGENT_ROLE: AgentRole = 'smellAgent';

const smellAgentId = 'smell-agent-1';

export const smellAgent: SwarmAgent = {
  id: smellAgentId,
  role: SMELL_AGENT_ROLE,
  deps: {} as SwarmDeps,
  active: true,
};

/**
 * Detects code smells and complexity issues in source code.
 * @param filePath - Path to the source file
 * @param content - File content to analyze
 * @returns Array of detected smells and proposed patches
 */
export const detectSmells = async (filePath: string, content: string): Promise<AgentMessage[]> => {
  const smells: AgentMessage[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNum = i + 1;

    // Function with too many lines (simplified: count lines in function body)
    let funcStart = i;
    let funcEnd = i;
    let braceCount = 0;
    let inFunc = false;

    // Simple heuristic: look for function declaration pattern
    const funcDeclPattern = /^\s*(function\s+\w+|const\s+\w+\s*=\s*function)\s*\(/;
    if (funcDeclPattern.test(line)) {
      inFunc = true;
      funcStart = i;
      braceCount = (line.match(/\{/g) || []).length;
      // Count opening braces to find end
      for (let k = i + 1; k < lines.length; k += 1) {
        braceCount += (lines[k].match(/\{/g) || []).length;
        braceCount -= (lines[k].match(/\}/g) || []).length;
        if (braceCount <= 0 && inFunc) {
          funcEnd = k;
          break;
        }
      }
    }

    // If we found a function, check its length
    if (inFunc && funcEnd > funcStart) {
      const funcLength = funcEnd - funcStart + 1;
      if (funcLength > 20) {
        const issue: AgentMessage = {
          id: `${smellAgentId}:${filePath}:${funcStart + 1}`,
          role: SMELL_AGENT_ROLE,
          timestamp: Date.now(),
          sourceFile: filePath,
          severity: 'warn',
          message: `Function spans ${funcLength} lines (exceeds 20-line limit)`,
          context: `Lines ${funcStart + 1}-${funcEnd + 1}`,
          metadata: {
            detectedPattern: 'functionTooLarge',
            functionLength: funcLength,
            startLine: funcStart + 1,
            endLine: funcEnd + 1,
          },
        };
        smells.push(issue);
      }
    }

    // Large block comment (> 5 lines)
    if (line.trim().startsWith('/*')) {
      let commentLines = 1;
      for (let k = i + 1; k < lines.length; k += 1) {
        if (lines[k].trim().startsWith('*') || lines[k].trim() === '') {
          commentLines += 1;
        } else if (lines[k].trim().endsWith('*/')) {
          commentLines += 1;
          break;
        } else {
          break;
        }
      }
      if (commentLines > 5) {
        const issue: AgentMessage = {
          id: `${smellAgentId}:${filePath}:${lineNum}`,
          role: SMELL_AGENT_ROLE,
          timestamp: Date.now(),
          sourceFile: filePath,
          severity: 'info',
          message: `Large block comment spans ${commentLines} lines`,
          context: `Lines ${lineNum}-${lineNum + commentLines - 1}`,
          metadata: {
            detectedPattern: 'largeComment',
            commentLines: commentLines,
            startLine: lineNum,
            endLine: lineNum + commentLines - 1,
          },
        };
        smells.push(issue);
      }
    }

    // Long line (> 100 characters)
    if (line.length > 100) {
      const issue: AgentMessage = {
        id: `${smellAgentId}:${filePath}:${lineNum}`,
        role: SMELL_AGENT_ROLE,
        timestamp: Date.now(),
        sourceFile: filePath,
        severity: 'info',
        message: `Line exceeds 100 characters (${line.length})`,
        context: `${line.substring(0, 50)}...${line.substring(line.length - 50)}`,
        metadata: {
          detectedPattern: 'longLine',
          lineLength: line.length,
          lineNumber: lineNum,
        },
      };
      smells.push(issue);
    }
  }

  // Propose patches for detected smells
  const patches: AgentMessage[] = smells.map((smell) => {
    const patch: SwarmProposal['patch'] = {
      file: smell.sourceFile,
      diff: '',
      confidence: 0.5,
    };

    return {
      ...smell,
      metadata: {
        ...smell.metadata,
        proposedPatch: patch,
      },
    };
  });

  return patches;
};
