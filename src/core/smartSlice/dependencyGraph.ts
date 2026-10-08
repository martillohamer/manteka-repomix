import path from 'node:path';
import { RepomixError } from '../../shared/errorHandle.js';
import { extractImportSpecifiers, isInsideRoot, resolveSpecifier, toPosixPath } from './importParser.js';
import type { SmartSliceFsDeps, SmartSliceOptions, SmartSliceResult } from './types.js';

interface FrontierNode {
  rel: string;
  depth: number;
}

/**
 * Walks the forward relative-import graph from `entry`, bounded by `depth`
 * (number of edges; 0 = entry only). Cycle-safe via a visited set. Missing or
 * unresolvable imports are reported as warnings instead of aborting the walk.
 */
export const buildClosure = async (
  { rootDir, entry, depth }: SmartSliceOptions,
  deps: SmartSliceFsDeps,
): Promise<SmartSliceResult> => {
  const rootAbs = path.resolve(rootDir);
  const entryAbs = path.resolve(rootAbs, entry);

  if (!isInsideRoot(entryAbs, rootAbs)) {
    throw new RepomixError(`Smart-Slice entry file escapes the target directory: ${entry}`);
  }
  if (!(await deps.fileExists(entryAbs))) {
    throw new RepomixError(`Smart-Slice entry file does not exist: ${entry}`);
  }

  const entryRel = toPosixPath(path.relative(rootAbs, entryAbs));
  const visited = new Set<string>([entryRel]);
  const warnings: string[] = [];
  let frontier: FrontierNode[] = [{ rel: entryRel, depth: 0 }];

  while (frontier.length > 0) {
    const nextFrontier: FrontierNode[] = [];

    for (const node of frontier) {
      if (node.depth >= depth) {
        continue;
      }

      const absolutePath = path.join(rootAbs, node.rel);
      let content: string;
      try {
        content = await deps.readFile(absolutePath);
      } catch {
        warnings.push(`Smart-Slice could not read ${node.rel}`);
        continue;
      }

      for (const specifier of extractImportSpecifiers(content)) {
        const resolved = await resolveSpecifier({
          specifier,
          importerPath: absolutePath,
          rootDir: rootAbs,
          fileExists: deps.fileExists,
        });

        if (resolved === null) {
          warnings.push(`Smart-Slice could not resolve "${specifier}" imported by ${node.rel}`);
          continue;
        }
        if (visited.has(resolved)) {
          continue;
        }

        visited.add(resolved);
        nextFrontier.push({ rel: resolved, depth: node.depth + 1 });
      }
    }

    frontier = nextFrontier;
  }

  return { entry: entryRel, paths: [...visited].sort(), warnings };
};
