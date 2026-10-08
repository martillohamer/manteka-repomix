export interface SmartSliceOptions {
  rootDir: string;
  entry: string;
  depth: number;
}

export interface SmartSliceResult {
  entry: string;
  paths: string[];
  warnings: string[];
}

export interface SmartSliceFsDeps {
  readFile: (absolutePath: string) => Promise<string>;
  fileExists: (absolutePath: string) => Promise<boolean>;
}
