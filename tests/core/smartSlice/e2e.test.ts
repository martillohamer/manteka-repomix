import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeConfigs } from '../../../src/config/configLoad.js';
import type { RepomixConfigMerged } from '../../../src/config/configSchema.js';
import { collectFiles } from '../../../src/core/file/fileCollect.js';
import { resolveFileLevel } from '../../../src/core/file/fileLevelResolve.js';
import { readRawFile } from '../../../src/core/file/fileRead.js';
import { searchFiles } from '../../../src/core/file/fileSearch.js';
import type { ProcessedFile } from '../../../src/core/file/fileTypes.js';
import fileProcessWorker from '../../../src/core/file/workers/fileProcessWorker.js';
import { produceOutput } from '../../../src/core/packager/produceOutput.js';
import { pack } from '../../../src/core/packager.js';
import { filterOutUntrustedFiles } from '../../../src/core/security/filterOutUntrustedFiles.js';
import { validateFileSafety } from '../../../src/core/security/validateFileSafety.js';
import { buildSmartSliceClosure } from '../../../src/core/smartSlice/index.js';

// End-to-end check for Manteka Smart-Slice: a real filesystem graph feeds the
// real packer, and only the closure of the entry must reach the output. The
// heavy deps are stubbed (as in multiRootSpec) so the assertion stays on the
// Smart-Slice intersection, not on worker pools or tokenizer startup.

const buildConfig = (cwd: string, outputFilePath: string): RepomixConfigMerged =>
  mergeConfigs(
    cwd,
    {},
    {
      output: {
        filePath: outputFilePath,
        style: 'plain',
        git: { sortByChanges: false, includeDiffs: false, includeLogs: false },
      },
    },
  );

const runPack = (rootDir: string, config: RepomixConfigMerged, smartSlice: { entry: string; paths: string[] }) =>
  pack(
    [rootDir],
    config,
    () => {},
    {
      searchFiles,
      sortPaths: (filePaths) => filePaths,
      collectFiles: (filePaths, root, cfg, progressCallback) =>
        collectFiles(filePaths, root, cfg, progressCallback, { readRawFile }),
      processFiles: async (rawFiles, cfg) => {
        const processedFiles: ProcessedFile[] = [];
        for (const rawFile of rawFiles) {
          const level = resolveFileLevel(rawFile.path, cfg.output);
          processedFiles.push(await fileProcessWorker({ rawFile, config: cfg, level }));
        }
        return processedFiles;
      },
      validateFileSafety: (rawFiles, progressCallback, cfg, gitDiff, gitLog) =>
        validateFileSafety(rawFiles, progressCallback, cfg, gitDiff, gitLog, {
          runSecurityCheck: async () => [],
          filterOutUntrustedFiles,
        }),
      produceOutput,
      createMetricsTaskRunner: () => ({
        taskRunner: { run: async () => 0, cleanup: async () => {} },
        warmupPromise: Promise.resolve(),
      }),
      calculateMetrics: async (processedFiles) => ({
        totalFiles: processedFiles.length,
        totalCharacters: processedFiles.reduce((acc, f) => acc + f.content.length, 0),
        totalTokens: 0,
        gitDiffTokenCount: 0,
        gitLogTokenCount: 0,
        fileCharCounts: Object.fromEntries(processedFiles.map((f) => [f.path, f.content.length])),
        fileTokenCounts: Object.fromEntries(processedFiles.map((f) => [f.path, 0])),
        suspiciousFilesResults: [],
        suspiciousGitDiffResults: [],
      }),
    },
    undefined,
    { smartSlice },
  );

const toPosix = (filePath: string): string => filePath.replaceAll(path.win32.sep, path.posix.sep);

describe('Smart-Slice end to end', () => {
  let rootDir: string;
  let outputDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-slice-e2e-'));
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-slice-e2e-out-'));

    await fs.writeFile(path.join(rootDir, 'entry.ts'), "import { used } from './used';\nexport const x = used;\n");
    await fs.writeFile(path.join(rootDir, 'used.ts'), 'export const used = "USED_MARKER";\n');
    await fs.writeFile(path.join(rootDir, 'unused.ts'), 'export const unused = "UNUSED_MARKER";\n');
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('packs only the dependency closure of the entry', async () => {
    const closure = await buildSmartSliceClosure({ rootDir, entry: 'entry.ts', depth: 2 });
    expect(closure.paths).toEqual(['entry.ts', 'used.ts']);

    const result = await runPack(rootDir, buildConfig(rootDir, path.join(outputDir, 'out.txt')), {
      entry: closure.entry,
      paths: closure.paths,
    });

    const packedPaths = result.processedFiles.map((file) => toPosix(file.path)).sort();
    expect(packedPaths).toEqual(['entry.ts', 'used.ts']);
  });

  it('fails when every closure path is filtered out by ignore rules', async () => {
    await expect(
      runPack(rootDir, buildConfig(rootDir, path.join(outputDir, 'out.txt')), {
        entry: 'entry.ts',
        paths: ['does-not-exist.ts'],
      }),
    ).rejects.toThrow('Smart-Slice found no packable files');
  });
});
