import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractImportSpecifiers,
  isInsideRoot,
  resolveSpecifier,
  toPosixPath,
} from '../../../src/core/smartSlice/importParser.js';

describe('extractImportSpecifiers', () => {
  it('extracts relative specifiers from import/export/require/import()', () => {
    const content = [
      "import { a } from './a.js';",
      "import type { B } from '../types/b';",
      "export * from './c';",
      "export { d } from './d.ts';",
      "const e = require('./e');",
      "const f = await import('./f');",
      "import './side-effect';",
    ].join('\n');
    expect(extractImportSpecifiers(content)).toEqual([
      './a.js',
      '../types/b',
      './c',
      './d.ts',
      './e',
      './f',
      './side-effect',
    ]);
  });

  it('ignores bare packages, aliases and urls', () => {
    const content = [
      "import react from 'react';",
      "import { x } from '@/alias';",
      "import { y } from 'https://example.com/y.js';",
      "import { z } from 'node:path';",
    ].join('\n');
    expect(extractImportSpecifiers(content)).toEqual([]);
  });

  it('handles multi-line named imports', () => {
    const content = "import {\n  a,\n  b,\n} from './multi';\n";
    expect(extractImportSpecifiers(content)).toEqual(['./multi']);
  });

  it('deduplicates repeated specifiers', () => {
    const content = "import './a';\nrequire('./a');\n";
    expect(extractImportSpecifiers(content)).toEqual(['./a']);
  });
});

describe('path helpers', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toPosixPath('a\\b\\c')).toBe('a/b/c');
  });

  it('detects paths inside the root and rejects siblings', () => {
    expect(isInsideRoot('/root/a/b.ts', '/root')).toBe(true);
    expect(isInsideRoot('/root', '/root')).toBe(true);
    expect(isInsideRoot('/root-sibling/a.ts', '/root')).toBe(false);
    expect(isInsideRoot('/other/a.ts', '/root')).toBe(false);
  });
});

describe('resolveSpecifier', () => {
  const rootDir = path.resolve(path.sep, 'root');
  const importerPath = path.join(rootDir, 'src', 'a.ts');
  const files = new Set([
    path.join(rootDir, 'src', 'b.ts'),
    path.join(rootDir, 'src', 'dir', 'index.ts'),
    path.join(rootDir, 'src', 'exact.js'),
    path.join(rootDir, 'src', 'comp.tsx'),
  ]);
  const fileExists = async (p: string) => files.has(p);

  it('resolves an extensionless sibling to .ts', async () => {
    await expect(resolveSpecifier({ specifier: './b', importerPath, rootDir, fileExists })).resolves.toBe('src/b.ts');
  });

  it('resolves a directory to its index file', async () => {
    await expect(resolveSpecifier({ specifier: './dir', importerPath, rootDir, fileExists })).resolves.toBe(
      'src/dir/index.ts',
    );
  });

  it('resolves an exact specifier with extension', async () => {
    await expect(resolveSpecifier({ specifier: './exact.js', importerPath, rootDir, fileExists })).resolves.toBe(
      'src/exact.js',
    );
  });

  it('resolves a TypeScript-style .js specifier to its .ts source', async () => {
    // NodeNext/ESM TypeScript emits './b.js' specifiers that actually load b.ts.
    await expect(resolveSpecifier({ specifier: './b.js', importerPath, rootDir, fileExists })).resolves.toBe(
      'src/b.ts',
    );
  });

  it('resolves a .jsx specifier to its .tsx source', async () => {
    await expect(resolveSpecifier({ specifier: './comp.jsx', importerPath, rootDir, fileExists })).resolves.toBe(
      'src/comp.tsx',
    );
  });

  it('returns null for missing files', async () => {
    await expect(resolveSpecifier({ specifier: './missing', importerPath, rootDir, fileExists })).resolves.toBeNull();
  });

  it('returns null when the specifier escapes the root', async () => {
    await expect(
      resolveSpecifier({ specifier: '../../etc/passwd', importerPath, rootDir, fileExists }),
    ).resolves.toBeNull();
  });
});
