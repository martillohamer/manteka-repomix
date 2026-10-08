export interface DependencyInfo {
  name: string;
  version?: string;
  isDev?: boolean;
}

export interface RuntimeVersion {
  runtime: string;
  version: string;
}

export interface TechStackInfo {
  path: string;
  languages: string[];
  frameworks: string[];
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
  packageManager?: string;
  runtimeVersions: RuntimeVersion[];
  configFiles: string[];
}

/** Extracts the subset of tech-stack fields a dependency manifest can contribute. */
export type DependencyParser = (content: string) => Partial<TechStackInfo>;

/** Extracts zero or more runtime version entries from a version-manager file. */
export type VersionParser = (content: string) => RuntimeVersion[];

/** A recognized dependency manifest and the language its presence implies. */
export type DependencyFileConfig = {
  language: string;
  parser: DependencyParser;
};
