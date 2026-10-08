import type { ProcessedFile } from '../../file/fileTypes.js';
import { CONFIG_FILE_PATTERNS } from './configFilePatterns.js';
import { DEPENDENCY_FILES } from './manifestFiles.js';
import type { DependencyInfo, RuntimeVersion, TechStackInfo } from './types.js';
import { VERSION_FILES } from './versionFiles.js';

const ROOT_DIR_LABEL = '.';

/**
 * Gets the directory path from a file path.
 * Returns ROOT_DIR_LABEL ('.') for root-level files.
 */
const getDirPath = (filePath: string): string => {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? ROOT_DIR_LABEL : filePath.substring(0, lastSlash);
};

/**
 * Detects tech stack from processed files, grouped by package directory.
 * Each directory containing a dependency file produces a separate TechStackInfo entry.
 */
export const detectTechStack = (processedFiles: ProcessedFile[]): TechStackInfo[] => {
  // First pass: find directories that have dependency files
  const packageDirs = new Set<string>();
  for (const file of processedFiles) {
    const fileName = file.path.split('/').pop() || file.path;
    if (DEPENDENCY_FILES[fileName]) {
      packageDirs.add(getDirPath(file.path));
    }
  }

  if (packageDirs.size === 0) {
    return [];
  }

  // Initialize result per directory
  const resultMap = new Map<string, TechStackInfo>();
  for (const dir of packageDirs) {
    resultMap.set(dir, {
      path: dir,
      languages: [],
      frameworks: [],
      dependencies: [],
      devDependencies: [],
      runtimeVersions: [],
      configFiles: [],
    });
  }

  // Second pass: assign files to their directory's TechStackInfo
  for (const file of processedFiles) {
    const fileName = file.path.split('/').pop() || file.path;
    const dirPath = getDirPath(file.path);
    const result = resultMap.get(dirPath);
    if (!result) continue;

    // Check dependency files
    const config = DEPENDENCY_FILES[fileName];
    if (config) {
      result.languages.push(config.language);

      const parsed = config.parser(file.content);
      if (parsed.dependencies) {
        result.dependencies.push(...parsed.dependencies);
      }
      if (parsed.devDependencies) {
        result.devDependencies.push(...parsed.devDependencies);
      }
      if (parsed.frameworks) {
        result.frameworks.push(...parsed.frameworks);
      }
      if (parsed.packageManager && !result.packageManager) {
        result.packageManager = parsed.packageManager;
      }
    }

    // Check version manager files
    const versionParser = VERSION_FILES[fileName];
    if (versionParser) {
      const versions = versionParser(file.content);
      result.runtimeVersions.push(...versions);
    }

    // Check configuration files
    if (CONFIG_FILE_PATTERNS.includes(fileName)) {
      result.configFiles.push(fileName);
    }
  }

  // Deduplicate within each package
  for (const result of resultMap.values()) {
    result.languages = [...new Set(result.languages)];
    result.frameworks = [...new Set(result.frameworks)];
    result.configFiles = [...new Set(result.configFiles)];
    result.dependencies = deduplicateByName(result.dependencies);
    result.devDependencies = deduplicateByName(result.devDependencies);
    result.runtimeVersions = deduplicateRuntimeVersions(result.runtimeVersions);
  }

  // Sort with (root) first, then alphabetically
  return [...resultMap.values()].sort((a, b) => {
    if (a.path === ROOT_DIR_LABEL) return -1;
    if (b.path === ROOT_DIR_LABEL) return 1;
    return a.path.localeCompare(b.path);
  });
};

const deduplicateByName = (deps: DependencyInfo[]): DependencyInfo[] => {
  const seen = new Set<string>();
  return deps.filter((dep) => {
    if (seen.has(dep.name)) return false;
    seen.add(dep.name);
    return true;
  });
};

const deduplicateRuntimeVersions = (versions: RuntimeVersion[]): RuntimeVersion[] => {
  const seen = new Set<string>();
  return versions.filter((v) => {
    const normalizedVersion = v.version.replace(/^v/, '');
    const key = `${v.runtime}:${normalizedVersion}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
