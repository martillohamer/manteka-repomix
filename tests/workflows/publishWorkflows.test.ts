import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const readWorkflow = (name: string): string => readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8');

const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

// These are shell variable references as they appear inside the workflow files,
// not JavaScript interpolation, so they are held in constants and spliced into
// template literals below. Naming them keeps the assertions readable and keeps
// the `noTemplateCurlyInString` suppression down to two lines.
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax inside a YAML file, not JS interpolation
const PKG = '${PACKAGE_NAME}';
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax inside a YAML file, not JS interpolation
const VER = '${PACKAGE_VERSION}';

// These workflows ship the package, so every reference to the package name has to
// track `package.json#name`. `npm pack` derives the tarball filename from that
// field, so a literal left behind makes `test -f "${TARBALL}"` fail on a renamed
// package -- and the release dies in the build job, before anything reaches npm.
//
// `npm view repomix@<version>` is the more dangerous case: `repomix` is the
// upstream package and it exists on npm, so the guard reads a real version from
// the wrong package, decides the release is already published, and aborts with
// an error that names a package this repo does not own.
describe('publish workflows derive the package name from package.json', () => {
  describe('npm-publish.yml', () => {
    const workflow = readWorkflow('npm-publish.yml');

    test('resolves the package name alongside the version', () => {
      expect(workflow).toContain('PACKAGE_NAME=$(node -p "require(\'./package.json\').name")');
    });

    test('builds the tarball filename from the resolved name', () => {
      expect(workflow).toContain(`echo "tarball=${PKG}-${VER}.tgz"`);
    });

    test('checks npm for the resolved package, not a literal', () => {
      expect(workflow).toContain(`npm view "${PKG}@${VER}" version`);
    });

    test('leaves no hardcoded repomix@ npm query', () => {
      expect(workflow).not.toMatch(/npm view "repomix@/);
    });
  });

  describe('mcp-registry-publish.yml', () => {
    const workflow = readWorkflow('mcp-registry-publish.yml');

    test('resolves the package name alongside the version', () => {
      expect(workflow).toContain('PACKAGE_NAME=$(node -p "require(\'./package.json\').name")');
    });

    test('verifies the mcpName of the resolved package', () => {
      expect(workflow).toContain(`npm view "${PKG}@${VER}" mcpName`);
    });

    test('reports the resolved package in its diagnostics', () => {
      expect(workflow).toContain(`${PKG}@${VER} is not visible on npm`);
      expect(workflow).toContain(`${PKG}@${VER} is published but has no mcpName field`);
      expect(workflow).toContain(`${PKG}@${VER} is published with mcpName=`);
    });

    test('leaves no hardcoded repomix@ npm query', () => {
      expect(workflow).not.toMatch(/npm view "repomix@/);
    });
  });

  // The two workflows above are the only ones that publish to npm or to the MCP
  // Registry. This guards the invariant rather than the current package name, so
  // renaming the package again does not require touching these tests.
  describe('no publisher queries a literal package name', () => {
    const publishers = ['npm-publish.yml', 'mcp-registry-publish.yml'];

    test.each(publishers)('%s has no bare repomix npm query', (name) => {
      expect(readWorkflow(name)).not.toMatch(/npm (view|publish) ["']?repomix/);
    });

    test('package.json declares a usable package name', () => {
      expect(packageJson.name).toBeTruthy();
      expect(packageJson.name).not.toMatch(/\s/);
    });
  });
});
