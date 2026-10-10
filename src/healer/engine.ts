export interface Patch {
  file: string;
  diff: string;
  confidence: number;
}

import { basename } from 'node:path';

export interface EngineDeps {
  readFile?: (file: string) => Promise<string | null>;
}

export interface EngineHandle {
  generatePatch(diagnostic: unknown): Promise<Patch | null>;
}

export const createEngine = (deps: EngineDeps = {}): EngineHandle => {
  const readFile = deps.readFile ?? (async () => null);

  const generateRemoveUnusedMarkerPatch = async (
    filePath: string,
    fileContent: string,
    _diagnosticLine: string,
  ): Promise<Patch | null> => {
    const unusedPattern = /\/\/.*UNUSED/;
    const lines = fileContent.split(/\r?\n/);
    const matches = lines.filter((line) => unusedPattern.test(line));
    if (matches.length !== 1) return null;

    const index = lines.findIndex((line) => unusedPattern.test(line));
    if (index === -1) return null;

    const newLines = [...lines];
    newLines.splice(index, 1);

    const diff = `--- a/${basename(filePath)}\n+++ b/${basename(filePath)}\n@@ -${index + 1},1 +${index + 1},0 @@\n-${lines[index]}\n`;
    return { file: filePath, diff, confidence: 0.5 };
  };

  const generateFixWhitespacePatch = async (
    filePath: string,
    fileContent: string,
    _diagnosticLine: string,
  ): Promise<Patch | null> => {
    const trailingSpacePattern = /\s$/;
    const lines = fileContent.split(/\r?\n/);
    const indices = lines.map((line, i) => ({ line, index: i })).filter(({ line }) => trailingSpacePattern.test(line));
    if (indices.length !== 1) return null;

    const { line, index } = indices[0];
    const trimmedLine = line.trimEnd();
    if (trimmedLine === line) return null;

    const diff = `--- a/${basename(filePath)}\n+++ b/${basename(filePath)}\n@@ -${index + 1},1 +${index + 1},1 @@\n-${line}\n+${trimmedLine}\n`;
    return { file: filePath, diff, confidence: 0.5 };
  };

  const generateCommentTodoPatch = async (
    filePath: string,
    fileContent: string,
    _diagnosticLine: string,
  ): Promise<Patch | null> => {
    const todoPattern = /^\/\/.+TODO/;
    const lines = fileContent.split(/\r?\n/);
    const indices = lines.map((line, i) => ({ line, index: i })).filter(({ line }) => todoPattern.test(line));
    if (indices.length !== 1) return null;

    const { line, index } = indices[0];
    const diff = `--- a/${basename(filePath)}\n+++ b/${basename(filePath)}\n@@ -${index + 1},1 +${index + 1},0 @@\n-${line}\n`;
    return { file: filePath, diff, confidence: 0.5 };
  };

  return {
    generatePatch: async (diagnostic: unknown): Promise<Patch | null> => {
      const filePath = (diagnostic as { file: string }).file;
      const diagnosticLine = (diagnostic as { content: string }).content;

      try {
        const fileContent = await readFile(filePath);
        if (!fileContent) return null;

        if (!fileContent.includes(diagnosticLine)) return null;

        const patches = await Promise.all([
          generateRemoveUnusedMarkerPatch(filePath, fileContent, diagnosticLine),
          generateFixWhitespacePatch(filePath, fileContent, diagnosticLine),
          generateCommentTodoPatch(filePath, fileContent, diagnosticLine),
        ]);

        const validPatch = patches.find((patch) => patch !== null);
        if (!validPatch) return null;

        const diffLines = validPatch.diff.split('\n');
        if (diffLines.length > 20) return null;

        return validPatch;
      } catch (_e) {
        return null;
      }
    },
  };
};
