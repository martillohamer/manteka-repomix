import type { RuntimeVersion, VersionParser } from './types.js';

// Version manager files that hold a single bare version string (e.g. `.node-version`,
// `.ruby-version`) all parse the same way: trim the content and, when non-empty, report
// it for the associated runtime. Build one parser per runtime from this shared logic.
const createSingleRuntimeParser =
  (runtime: string) =>
  (content: string): RuntimeVersion[] => {
    const version = content.trim();
    if (version) {
      return [{ runtime, version }];
    }
    return [];
  };

const parseNodeVersion = createSingleRuntimeParser('Node.js');
const parseRubyVersion = createSingleRuntimeParser('Ruby');
const parsePythonVersion = createSingleRuntimeParser('Python');
const parseGoVersion = createSingleRuntimeParser('Go');
const parseJavaVersion = createSingleRuntimeParser('Java');

// Version manager files and their parsers
export const VERSION_FILES: Record<string, VersionParser> = {
  '.node-version': parseNodeVersion,
  '.nvmrc': parseNodeVersion,
  '.ruby-version': parseRubyVersion,
  '.python-version': parsePythonVersion,
  '.go-version': parseGoVersion,
  '.java-version': parseJavaVersion,
  '.tool-versions': parseToolVersions,
};

export function parseToolVersions(content: string): RuntimeVersion[] {
  const versions: RuntimeVersion[] = [];
  const runtimeNameMap: Record<string, string> = {
    nodejs: 'Node.js',
    node: 'Node.js',
    ruby: 'Ruby',
    python: 'Python',
    golang: 'Go',
    go: 'Go',
    java: 'Java',
    rust: 'Rust',
    elixir: 'Elixir',
    erlang: 'Erlang',
    php: 'PHP',
    perl: 'Perl',
    deno: 'Deno',
    bun: 'Bun',
  };

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const tool = parts[0].toLowerCase();
      const version = parts[1];
      const runtime = runtimeNameMap[tool] || tool;
      versions.push({ runtime, version });
    }
  }

  return versions;
}
