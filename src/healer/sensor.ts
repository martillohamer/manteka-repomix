import * as path from 'node:path';
import type { Diagnostic, DiagnosticKind } from './types.js';

export interface SensorDeps {
  root?: string;
  runLint?: (files?: string[]) => Promise<string | null>;
  runTsc?: () => Promise<string | null>;
  readFile?: (file: string) => Promise<string | null>;
}

export interface SensorHandle {
  scanFile(file: string): Promise<Diagnostic[]>;
  scanTodoFixme(file: string, content: string): Promise<Diagnostic[]>;
}

const makeId = (kind: DiagnosticKind, file: string, message: string): string => {
  const rel = path.relative('.', file);
  return `${kind}:${rel}:${message.trim()}`;
};

const isIgnoredPath = (file: string): boolean => {
  const rel = path.relative('.', file).replace(/\\/g, '/');
  if (rel.startsWith('dist/') || rel.startsWith('build/') || rel.startsWith('node_modules/')) {
    return true;
  }
  if (rel.endsWith('.d.ts')) {
    return true;
  }
  return false;
};

export const createSensor = (deps: SensorDeps = {}): SensorHandle => {
  const root = deps.root ? path.resolve(deps.root) : process.cwd();

  const scanTodoFixme = async (file: string, content: string): Promise<Diagnostic[]> => {
    if (isIgnoredPath(file)) {
      return [];
    }
    const lines = content.split('\n');
    const results: Diagnostic[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lower = line.toLowerCase();
      let kind: DiagnosticKind | null = null;
      if (lower.includes('todo')) {
        kind = 'todo';
      } else if (lower.includes('fixme')) {
        kind = 'fixme';
      }
      if (kind === null) {
        continue;
      }
      const lineNum = i + 1;
      const code = kind;
      const id = makeId(kind, file, line.trim());
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      results.push({
        id,
        kind,
        file: path.resolve(file),
        lineStart: lineNum,
        lineEnd: lineNum,
        message: line.trim(),
        code,
        severity: 'info',
        context: line.trim(),
      });
    }
    return results;
  };

  const scanFile = async (file: string): Promise<Diagnostic[]> => {
    if (isIgnoredPath(file)) {
      return [];
    }
    const fullPath = path.isAbsolute(file) ? path.resolve(file) : path.join(root, file);
    const content = deps.readFile ? await deps.readFile(fullPath) : null;
    if (content === null) {
      return [];
    }
    return scanTodoFixme(fullPath, content);
  };

  return {
    scanFile,
    scanTodoFixme,
  };
};

// export type { SensorDeps, SensorHandle };
