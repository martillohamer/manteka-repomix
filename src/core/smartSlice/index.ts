import fs from 'node:fs/promises';
import { buildClosure } from './dependencyGraph.js';
import type { SmartSliceOptions, SmartSliceResult } from './types.js';

export const SMART_SLICE_DEFAULT_DEPTH = 2;

export const buildSmartSliceClosure = async (options: SmartSliceOptions): Promise<SmartSliceResult> =>
  buildClosure(options, {
    readFile: (absolutePath) => fs.readFile(absolutePath, 'utf8'),
    fileExists: async (absolutePath) => {
      try {
        return (await fs.stat(absolutePath)).isFile();
      } catch {
        return false;
      }
    },
  });

export { buildClosure } from './dependencyGraph.js';
export type { ResolveSpecifierArgs } from './importParser.js';
export {
  extractImportSpecifiers,
  isInsideRoot,
  RESOLVABLE_EXTENSIONS,
  resolveSpecifier,
  toPosixPath,
} from './importParser.js';
export type { SmartSliceFsDeps, SmartSliceOptions, SmartSliceResult } from './types.js';
