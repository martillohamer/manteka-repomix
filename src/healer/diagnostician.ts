import * as path from 'node:path';
import type { Diagnostic } from './types.js';

export interface DiagnosticianDeps {
  readFile?: (file: string) => Promise<string | null>;
}

export interface DiagnosticianHandle {
  diagnose(diagnostic: Diagnostic): Promise<Diagnostic>;
  buildMicroContext(file: string, start: number, end: number): Promise<string>;
}

const DEFAULT_CONTEXT_LINES = 10;

export const createDiagnostician = (_deps: DiagnosticianDeps = {}): DiagnosticianHandle => {
  const readFile = _deps.readFile;

  const buildMicroContext = async (file: string, start: number, end: number): Promise<string> => {
    const fullPath = path.resolve(file);
    const content = readFile ? await readFile(fullPath) : null;
    if (content === null) {
      return '';
    }
    const lines = content.split('\n');
    const s = Math.max(0, start - 1 - DEFAULT_CONTEXT_LINES);
    const e = Math.min(lines.length, end + DEFAULT_CONTEXT_LINES);
    const parts: string[] = [];
    for (let i = s; i < e; i += 1) {
      const line = i < lines.length ? lines[i] : '';
      parts.push(`${s + i + 1}: ${line}`);
    }
    return parts.join('\n');
  };

  const diagnose = async (diagnostic: Diagnostic): Promise<Diagnostic> => {
    const ctx = await buildMicroContext(diagnostic.file, diagnostic.lineStart, diagnostic.lineEnd);
    return {
      ...diagnostic,
      context: ctx || diagnostic.context,
    };
  };

  return {
    diagnose,
    buildMicroContext,
  };
};

// export type { DiagnosticianDeps, DiagnosticianHandle };
