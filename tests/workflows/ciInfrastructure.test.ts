import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const readWorkflow = (name: string): string => readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8');
const readJson = (relative: string) => JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));

// Shell/GitHub Actions syntax as it appears inside the workflow files, not
// JavaScript interpolation, so it is held in constants and spliced into template
// literals below to keep the assertions readable.
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax inside a YAML file, not JS interpolation
const OWNER = '${{ github.repository_owner }}';
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax inside a YAML file, not JS interpolation
const IMAGE_NAME = '${{ env.IMAGE_NAME }}';
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax inside a YAML file, not JS interpolation
const PKG = '${PACKAGE_NAME}';
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax inside a YAML file, not JS interpolation
const RESOLVED = '${resolved}';
// biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax inside a YAML file, not JS interpolation
const EXPECTED = '${expected}';

const FORK_OWNER = 'DAW1BSergiomg26';
const FORK_SLUG = 'manteka-repomix';
const UPSTREAM_OWNER = 'yamadashy';

// Counting by splitting is deliberate: these assertions care about how many times a
// step repeats across jobs, and escaping a workflow fragment into a RegExp for that
// is easy to get subtly wrong (an over-escaped pattern silently matches nothing).
const countOccurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

const deriveName = `echo "package_name=$(node -p "require('./package.json').name")" >> "$GITHUB_OUTPUT"`;

const httpsInsteadOf = 'git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"';

const extraheader = 'git config --global "http.https://github.com/.extraheader"';

const GH_TOKEN_ENV = `GH_TOKEN: $\{{ secrets.GITHUB_TOKEN }}`;

const lowercaseOwnerTransform = `echo "IMAGE_NAME=ghcr.io/$(echo '${OWNER}' | tr '[:upper:]' '[:lower:]')/${FORK_SLUG}" >> "$GITHUB_ENV"`;

// These are fork-infrastructure workflows, so every reference to the owning repo
// has to track the repository the workflow actually runs in.
//
// The OCI namespace is the sharper failure: `github.repository_owner` keeps the
// owner's original casing (`DAW1BSergiomg26`), and the registry rejects a mixed
// case repository name, so publishing breaks with "repository name must be
// lowercase" -- while the workflow itself looks perfectly correct on review.
describe('docker.yml derives the OCI namespace from the running repository', () => {
  const workflow = readWorkflow('docker.yml');

  test('build and merge jobs both derive the image name from the owner', () => {
    // Two derivations: one per job. The merge job has no matrix, so it cannot
    // inherit the build job's Prepare step.
    expect(countOccurrences(workflow, lowercaseOwnerTransform)).toBe(2);
  });

  test('lowercases the owner so the registry accepts the name', () => {
    expect(workflow).toContain(lowercaseOwnerTransform);
  });

  test('metadata and build-push read the derived name', () => {
    expect(countOccurrences(workflow, IMAGE_NAME)).toBeGreaterThanOrEqual(3);
  });

  test('manifest creation uses the derived name, not a literal', () => {
    expect(workflow).toContain(`printf '%s@sha256:%s ' "$IMAGE_NAME" *`);
  });

  test('leaves no hardcoded upstream namespace behind', () => {
    expect(workflow).not.toContain(UPSTREAM_OWNER);
    expect(workflow).not.toContain('ghcr.io/yamadashy/repomix');
  });
});

// `npm link <name>` does not fail loudly on a wrong name: npm falls back to the
// npm registry, installs an unrelated package under that name, and the job goes
// green while testing someone else's code. Deriving the name from
// `package.json#name` is what keeps the rename from silently unlinking CI.
describe('ci-website.yml links the local build under the name the website imports', () => {
  const workflow = readWorkflow('ci-website.yml');

  const jobs = ['lint-website-server', 'test-website-server', 'bundle-website-server'];
  const jobCount = workflow.match(/- name: Install website server dependencies/g)?.length ?? 0;

  test('every server job derives the package name from package.json', () => {
    expect(jobCount).toBe(jobs.length);
    expect(countOccurrences(workflow, deriveName)).toBe(jobs.length);
  });

  test('fetches the git dependency over HTTPS, not SSH', () => {
    // npm resolves GitHub git dependencies over SSH regardless of the spec scheme,
    // and the workflow holds no SSH key, so without the rewrite every `npm ci`
    // aborts with "Permission denied (publickey)".
    expect(countOccurrences(workflow, httpsInsteadOf)).toBe(jobs.length);
  });

  test('authenticates the HTTPS fetch with the automatic runner token', () => {
    // The owner account is not readable anonymously, so the rewrite alone is not
    // enough. GITHUB_TOKEN is injected by the runner, so this must not depend on
    // a manually configured secret.
    expect(countOccurrences(workflow, extraheader)).toBe(jobs.length);
    expect(countOccurrences(workflow, GH_TOKEN_ENV)).toBe(jobs.length);
    expect(workflow).not.toContain('secrets.PERSONAL_ACCESS_TOKEN');
    expect(workflow).not.toContain('secrets.REPO_TOKEN');
  });

  test('links the resolved name instead of a literal', () => {
    expect(workflow).toContain(`npm link "${PKG}"`);
    expect(workflow).not.toContain('npm link repomix\n');
  });

  test('aliases the imported dependency key onto the local build', () => {
    // `npm link` only creates node_modules/<PACKAGE_NAME>, but the website source
    // imports the dependency key "repomix".
    expect(workflow).toContain('rm -rf node_modules/repomix');
    expect(workflow).toContain(`ln -s "${PKG}" node_modules/repomix`);
  });

  test('skips the alias when the package is not renamed', () => {
    // Without the guard, the alias would point node_modules/repomix at itself.
    expect(workflow).toContain(`if [ "${PKG}" != "repomix" ]; then`);
  });

  test('never uses "ln -sfn", which silently nests the link inside the target', () => {
    // `ln -sfn` is only safe when the destination is a symlink. `npm ci`
    // installs the git dependency as a real directory, in which case ln places
    // the link *inside* it and the step stays a silent no-op that still passes.
    expect(workflow).not.toMatch(/^\s*ln -sfn/m);
  });

  test('asserts the link resolved to this checkout, not the fork default branch', () => {
    expect(workflow).toContain(`resolved=$(node -e "process.stdout.write(require.resolve('repomix'))")`);
    expect(workflow).toContain('realpath -m');
    expect(workflow).toContain(`if [ "${RESOLVED}" != "${EXPECTED}" ]; then`);
  });
});

// The CLI command name follows the npm package name (string-form "bin"), which
// the branding PR renames. Hardcoding either name therefore breaks the build in
// exactly one of the two states, so the Dockerfile resolves it at build time.
describe('Dockerfile keeps a stable repomix entrypoint across the rename', () => {
  const dockerfile = readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');

  test('derives the CLI name from package.json', () => {
    expect(dockerfile).toContain('CLI_NAME="$(node -p "require(\'/repomix/package.json\').name")"');
  });

  test('creates the repomix alias only when the package was renamed', () => {
    expect(dockerfile).toContain('if [ "$CLI_NAME" != "repomix" ]; then ln -sf "$CLI_NAME" /usr/local/bin/repomix; fi');
  });

  test('has no hardcoded invocation of the pre-rename command', () => {
    expect(dockerfile).not.toMatch(/^RUN repomix /m);
  });

  test('keeps repomix as the image entrypoint', () => {
    expect(dockerfile).toContain('ENTRYPOINT ["repomix"]');
  });
});

// The website consumed the upstream package through a git dependency. Pointing it
// at this fork is what makes the website exercise fork code at all; leaving the
// upstream spec behind would silently build the website against `yamadashy/repomix`
// while the surrounding workflow claims to test this branch.
describe('website server depends on this fork', () => {
  const manifest = readJson('website/server/package.json');
  const lock = readJson('website/server/package-lock.json');

  test('the git dependency targets the fork', () => {
    expect(manifest.dependencies.repomix).toBe(`github:${FORK_OWNER}/${FORK_SLUG}#main`);
  });

  test('the lockfile resolves the git dependency to the fork', () => {
    expect(lock.packages['node_modules/repomix'].resolved).toContain(`github.com/${FORK_OWNER}/${FORK_SLUG}.git`);
  });

  test('neither manifest nor lockfile references the upstream repository', () => {
    expect(manifest.dependencies.repomix).not.toContain(UPSTREAM_OWNER);
    expect(JSON.stringify(lock.packages['node_modules/repomix'])).not.toContain(UPSTREAM_OWNER);
  });

  test('the import key is unchanged, so the website source keeps working', () => {
    // The whole aliasing strategy depends on the dependency key staying "repomix".
    expect(Object.keys(manifest.dependencies)).toContain('repomix');
    expect(manifest.dependencies).not.toHaveProperty(FORK_SLUG);
  });
});
