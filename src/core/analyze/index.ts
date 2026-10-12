/**
 * Motor de analisis del grafo de dependencias TypeScript/JavaScript.
 *
 * Vive en `core` para que el subcomando `manteka analyze` y la herramienta MCP
 * `manteka_analyze_codebase` compartan una sola implementacion en lugar de duplicarla.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';

/** Una sentencia de importación relativa detectada en un archivo fuente. */
export interface FileImport {
  /** Nombre base del archivo que declara la importación. */
  source: string;
  /** Specifier tal como aparece en el código, ya normalizado. */
  importPath: string;
  /** Ruta absoluta resuelta en disco, o '' si no se pudo resolver. */
  resolvedPath: string;
  /** Línea 1-indexed donde aparece la importación. */
  line: number;
}

/** Análisis de un archivo individual dentro del grafo de dependencias. */
export interface FileAnalysis {
  /** Ruta del archivo relativa a la raíz analizada. */
  path: string;
  /** Importaciones relativas detectadas. */
  imports: FileImport[];
  /** Lenguaje inferido por extensión. */
  language: 'typescript' | 'javascript';
  /** Exportaciones detectadas por `parseImportExports`. */
  exports?: string[];
}

/**
 * Parses import and export statements from TypeScript/JavaScript source
 *
 * Extracts relative import statements and export declarations
 *
 * @param content - Source code content
 * @param filePath - Path of the file being parsed
 * @returns Parsed imports and exports
 */
export function parseImportExports(content: string, filePath: string): {
  imports: FileImport[];
  exports: string[];
} {
  const imports: FileImport[] = [];
  const exports: string[] = [];

  const lines = content.split('\n');
  lines.forEach((line, lineNumber) => {
    const trimmed = line.trim();

    // Match export statements
    if (trimmed.startsWith('export')) {
      if (trimmed.includes('export from')) {
        const fromMatch = trimmed.match(/export\s+from\s+['"](.+?)['"]/i);
        if (fromMatch) {
          exports.push(fromMatch[1]);
        }
      } else {
        const nameMatch = trimmed.match(
          /export\s+(?:default\s+)?(?:function|class|interface|type|var|let|const|name)?\s*(\w+)/i
        );
        if (nameMatch) {
          exports.push(nameMatch[1]);
        } else {
          exports.push(trimmed);
        }
      }
    }

    // Match import statements
    if (trimmed.startsWith('import')) {
      const importMatch = trimmed.match(
        /^import\s+(?:\*\s+from\s+['"](.+?)['"]|(?:[\w\s{},*]+\s+from\s+['"](.+?)['"])|(?:import\s+['"](.+?)['"]))/i
      );

      if (importMatch) {
        let importPath: string;
        if (importMatch[1]) {
          importPath = importMatch[1];
        } else if (importMatch[2]) {
          importPath = importMatch[2];
        } else if (importMatch[3]) {
          importPath = importMatch[3];
        } else {
          importPath = '';
        }

const normalizedPath = path.normalize(importPath);
        // "Is this relative?" must be decided on the raw specifier: `path.normalize`
        // turns './helper.ts' into 'helper.ts', so filtering on the normalized value
        // rejected every sibling import and left the graph empty.
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          imports.push({
            source: path.basename(filePath),
            importPath: normalizedPath,
            resolvedPath: '',
            line: lineNumber + 1,
          });
        }
      }
    }
  });

  return { imports, exports };
}

/**
 * Walks the file tree and collects TypeScript/JavaScript files
 *
 * @param root - Root directory to search
 * @returns Arrays of .ts and .js file paths
 */
export function walkFileTree(root: string): { tsFiles: string[]; jsFiles: string[] } {
  const tsFiles: string[] = [];
  const jsFiles: string[] = [];

  const walkDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        tsFiles.push(fullPath);
      } else if (entry.name.endsWith('.js')) {
        jsFiles.push(fullPath);
      }
    }
  };

  walkDir(root);
  return { tsFiles, jsFiles };
}

/**
 * Analyzes a project's dependency graph
 *
 * Walks the file tree, parses import/export statements,
 * resolves dependency paths, and detects cycles.
 *
 * @param root - Root directory to analyze (default: process.cwd())
 * @returns Analysis result with metrics and graph data
 */
/**
 * Analiza el grafo de dependencias de un proyecto.
 *
 * @param root - Directorio raiz a analizar (default: process.cwd())
 * @param deep - Cuando es `false`, solo se expanden las importaciones directas de cada
 *   archivo; cuando es `true` (default) se sigue el grafo transitivamente. La expansion
 *   transitiva ya es el comportamiento natural del resolvedor, asi que `false` limita
 *   el resultado a los vecinos directos sin reescribir el algoritmo.
 */
export function runAnalysis(root: string = process.cwd(), deep: boolean = true): {
  root: string;
  fileAnalysis: FileAnalysis[];
  summary: {
    totalFiles: number;
    totalUniqueDependencies: number;
    averageImportsPerFile: number;
    filesWithCycles: string[];
    maxImportDepth: number;
  };
  dependencyGraph: Record<string, string[]>;
} {
  const absoluteRoot = path.resolve(root);

  // Walk file tree and collect .ts and .js files
  const { tsFiles, jsFiles } = walkFileTree(absoluteRoot);
  const allFiles = [...tsFiles, ...jsFiles].filter(
    (f) => !fs.statSync(f).isDirectory()
  );

  if (allFiles.length === 0) {
    return {
      root: absoluteRoot,
      fileAnalysis: [],
      summary: {
        totalFiles: 0,
        totalUniqueDependencies: 0,
        averageImportsPerFile: 0,
        filesWithCycles: [],
        maxImportDepth: 0,
      },
      dependencyGraph: {},
    };
  }

  // Parse each file's imports/exports
  const filesMap = new Map<string, { imports: FileImport[] }>();

  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { imports } = parseImportExports(content, filePath);
      filesMap.set(filePath, { imports });
    } catch {
      // Skip files that can't be read
    }
  }

// Build dependency graph (simplified - just collect import paths)
  const dependencyGraph: Record<string, string[]> = {};
  for (const [filePath, fileData] of filesMap) {
    const deps: string[] = [];
    // Resolve relative to the importing file's directory. Using `dirname(imp.source)`
    // would resolve against '.' because `source` is only a basename, so every
    // sibling import was resolved from the process cwd instead.
    const fileDir = path.dirname(filePath);
    for (const imp of fileData.imports) {
      const resolvedPath = path.normalize(path.resolve(fileDir, imp.importPath));
      if (fs.existsSync(resolvedPath)) {
        deps.push(resolvedPath);
      }
    }
    dependencyGraph[filePath] = deps;
  }

  // Calculate summary metrics
  const allDeps = new Set<string>();
  for (const deps of Object.values(dependencyGraph)) {
    for (const dep of deps) {
      allDeps.add(dep);
    }
  }
  const totalUniqueDependencies = allDeps.size;

  let totalImports = 0;
  for (const fileData of filesMap.values()) {
    totalImports += fileData.imports.length;
  }
  const averageImportsPerFile = allFiles.length > 0 ? totalImports / allFiles.length : 0;

  // Simple cycle detection using DFS
  const { hasCycles, cycles } = detectCyclesSimple(dependencyGraph);

  // Files with cycles
  const filesWithCycles: string[] = [];
  if (hasCycles) {
    for (const [filePath, deps] of Object.entries(dependencyGraph)) {
      for (const cycle of cycles) {
        if (cycle.includes(filePath)) {
          filesWithCycles.push(path.relative(absoluteRoot, filePath));
          break;
        }
      }
    }
  }

  // Calculate import depths
  const importDepths = calculateImportDepthsSimple(dependencyGraph);

  // Build file analysis
  const fileAnalysis: FileAnalysis[] = [];

  for (const filePath of allFiles) {
    const deps = dependencyGraph[filePath] || [];
    fileAnalysis.push({
      path: path.relative(absoluteRoot, filePath),
      imports: filesMap.get(filePath)?.imports || [],
      language: filePath.endsWith('.ts') ? 'typescript' : 'javascript',
    });
  }

  return {
    root: absoluteRoot,
    fileAnalysis,
    summary: {
      totalFiles: allFiles.length,
      totalUniqueDependencies: totalUniqueDependencies,
      averageImportsPerFile: Number(averageImportsPerFile.toFixed(2)),
      filesWithCycles: filesWithCycles.length > 0 ? filesWithCycles : [],
      maxImportDepth:
        importDepths && Object.values(importDepths).length > 0
          ? Math.max(...Object.values(importDepths))
          : 0,
    },
    dependencyGraph,
  };
}

/**
 * Simple cycle detection using DFS
 */
function detectCyclesSimple(graph: Record<string, string[]>): { hasCycles: boolean; cycles: string[] } {
  const visited: Record<string, 'white' | 'gray' | 'black'> = {};
  for (const node of Object.keys(graph)) {
    visited[node] = 'white';
  }
  const cycles: string[] = [];

  const dfs = (node: string, path: string[]): boolean => {
    if (visited[node] === 'black') return false;
    if (visited[node] === 'gray') {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat([node]).join(' → '));
      return true;
    }
    visited[node] = 'gray';
    path.push(node);
    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      if (graphHasKey(graph, neighbor)) {
        dfs(neighbor, path);
      }
    }
    path.pop();
    visited[node] = 'black';
    return false;
  }

  for (const node of Object.keys(graph)) {
    if (visited[node] === 'white') {
      dfs(node, []);
    }
  }

  return { hasCycles: cycles.length > 0, cycles };
}

function graphHasKey(graph: Record<string, string[]>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(graph, key);
}

/**
 * Simple import depth calculation
 */
export function calculateImportDepthsSimple(graph: Record<string, string[]>): Record<string, number> {
  const depths: Record<string, number> = {};
  const visited: Set<string> = new Set();

  const bfsCalculateDepth = (startNode: string): number => {
    if (visited.has(startNode)) return depths[startNode];
    const neighbors = graph[startNode] || [];
    if (neighbors.length === 0) {
      visited.add(startNode);
      depths[startNode] = 0;
      return 0;
    }
    let maxChildDepth = 0;
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const childDepth = bfsCalculateDepth(neighbor);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }
    }
    visited.add(startNode);
    depths[startNode] = maxChildDepth + 1;
    return depths[startNode];
  };

  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      bfsCalculateDepth(node);
    }
  }
  return depths;
}

