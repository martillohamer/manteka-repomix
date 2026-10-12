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

/** Opciones del análisis. */
export interface AnalyzeOptions {
  /**
   * Cuando es `true`, se expande el árbol de importaciones de forma transitiva y se
   * calculan las métricas extendidas (`transitiveGraph`, `depthDistribution`,
   * `transitiveFileCount`, `entryPoints`, `leafFiles`). Cuando es `false` —el valor
   * por defecto— el análisis se detiene en el primer nivel: solo dependencias
   * directas.
   */
  deep?: boolean;
}

/** Métricas agregadas del grafo de dependencias. */
export interface AnalyzeSummary {
  /** Archivos `.ts`/`.js` encontrados bajo la raíz. */
  totalFiles: number;
  /** Destinos distintos alcanzados por al menos una arista directa. */
  totalUniqueDependencies: number;
  /** Media de sentencias de importación por archivo. */
  averageImportsPerFile: number;
  /** Archivos que participan en al menos un ciclo, en rutas relativas a la raíz. */
  filesWithCycles: string[];
  /**
   * Shallow: el nivel máximo alcanzado, que nunca pasa de 1 (las dependencias
   * directas). Deep: la longitud de la ruta más larga del grafo.
   */
  maxImportDepth: number;
  /** Solo en deep: archivos alcanzables a dos o más saltos. */
  transitiveFileCount?: number;
  /** Solo en deep: cantidad de archivos por distancia mínima desde una raíz. */
  depthDistribution?: Record<string, number>;
  /** Solo en deep: archivos de los que no importa nadie (raíces del grafo). */
  entryPoints?: string[];
  /** Solo en deep: archivos que no importan nada (hojas del grafo). */
  leafFiles?: string[];
}

/** Resultado completo del análisis. */
export interface AnalysisResult {
  root: string;
  /** `true` si el análisis se ejecutó con expansión transitiva. */
  deep: boolean;
  fileAnalysis: FileAnalysis[];
  summary: AnalyzeSummary;
  /** Aristas directas (un salto). Se rellena siempre. */
  dependencyGraph: Record<string, string[]>;
  /** Solo en deep: cierre transitivo por nodo. Objeto vacío en modo shallow. */
  transitiveGraph: Record<string, string[]>;
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
      // Three shapes: `import * as x from 'p'`, `import { a } from 'p'`, and the
      // side-effect form `import 'p'`. The bare-specifier branch must not repeat the
      // `import` keyword — `^import\s+` already consumed it, so requiring it again
      // silently dropped every side-effect import.
      const importMatch = trimmed.match(
        /^import\s+(?:\*\s+from\s+['"](.+?)['"]|[\w\s{},*]+\s+from\s+['"](.+?)['"]|['"](.+?)['"])/i
      );

      if (importMatch) {
        const importPath = importMatch[1] ?? importMatch[2] ?? importMatch[3] ?? '';
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

  const walkDir = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip build/dependency trees: walking them costs minutes and finds nothing.
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

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

/** Directorios excluidos del recorrido: ruido que no aporta dependencias del proyecto. */
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'lib',
  '.next',
  'out',
]);

/**
 * Analyzes a project's dependency graph.
 *
 * Parses import/export statements and resolves relative dependency paths for every
 * `.ts`/`.js` file under `root`.
 *
 * `deep` selects how far the graph is expanded:
 * - `false` (default): only direct (one-hop) dependencies are mapped and reported.
 * - `true`: the whole import tree is expanded transitively, adding `transitiveGraph`
 *   plus the extended summary metrics.
 *
 * @param root - Root directory to analyze (default: process.cwd())
 * @param options - Analysis options (currently just `deep`)
 */
export function runAnalysis(root: string = process.cwd(), options: AnalyzeOptions = {}): AnalysisResult {
  const deep = options.deep === true;
  const absoluteRoot = path.resolve(root);

  const { tsFiles, jsFiles } = walkFileTree(absoluteRoot);
  const allFiles = [...tsFiles, ...jsFiles];

  if (allFiles.length === 0) {
    return {
      root: absoluteRoot,
      deep,
      fileAnalysis: [],
      summary: emptySummary(deep),
      dependencyGraph: {},
      transitiveGraph: {},
    };
  }

  // Parse each file's imports/exports
  const filesMap = new Map<string, FileImport[]>();

  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { imports } = parseImportExports(content, filePath);
      filesMap.set(filePath, imports);
    } catch {
      // Skip files that can't be read
    }
  }

  // Direct (one-hop) edges: resolve relative to the importing file's directory.
  // Using `dirname(imp.source)` would resolve against '.' because `source` is only a
  // basename, so every sibling import was resolved from the process cwd instead.
  const dependencyGraph: Record<string, string[]> = {};
  for (const [filePath, imports] of filesMap) {
    const fileDir = path.dirname(filePath);
    const deps: string[] = [];
    for (const imp of imports) {
      const resolvedPath = path.normalize(path.resolve(fileDir, imp.importPath));
      if (fs.existsSync(resolvedPath)) {
        deps.push(resolvedPath);
      }
    }
    dependencyGraph[filePath] = deps;
  }

  const allDeps = new Set<string>();
  for (const deps of Object.values(dependencyGraph)) {
    for (const dep of deps) {
      allDeps.add(dep);
    }
  }

  const totalImports = allFiles.reduce((sum, filePath) => sum + (filesMap.get(filePath)?.length ?? 0), 0);
  const averageImportsPerFile = allFiles.length > 0 ? totalImports / allFiles.length : 0;

  const { hasCycles, cycles } = detectCyclesSimple(dependencyGraph);

  const filesWithCycles: string[] = [];
  if (hasCycles) {
    const seen = new Set<string>();
    for (const [filePath] of Object.entries(dependencyGraph)) {
      if (cycles.some((cycle) => cycle.includes(filePath)) && !seen.has(filePath)) {
        seen.add(filePath);
        filesWithCycles.push(path.relative(absoluteRoot, filePath));
      }
    }
  }

  const fileAnalysis: FileAnalysis[] = allFiles.map((filePath) => ({
    path: path.relative(absoluteRoot, filePath),
    imports: filesMap.get(filePath) ?? [],
    language: filePath.endsWith('.ts') ? 'typescript' : 'javascript',
  }));

  const summary: AnalyzeSummary = {
    totalFiles: allFiles.length,
    totalUniqueDependencies: allDeps.size,
    averageImportsPerFile: Number(averageImportsPerFile.toFixed(2)),
    filesWithCycles,
    // Shallow never looks past the first hop, so the deepest level it can report is 1.
    maxImportDepth: deep ? maxDepth(calculateImportDepthsSimple(dependencyGraph)) : directDepth(dependencyGraph),
  };

  if (!deep) {
    // Shallow mode: the closure is deliberately not computed, and the summary carries
    // no extended metrics so callers cannot mistake absence for "zero".
    return {
      root: absoluteRoot,
      deep,
      fileAnalysis,
      summary,
      dependencyGraph,
      transitiveGraph: {},
    };
  }

  const transitiveGraph = buildTransitiveClosure(dependencyGraph);

  const importedBy = new Set<string>();
  for (const deps of Object.values(dependencyGraph)) {
    for (const dep of deps) {
      importedBy.add(dep);
    }
  }

  let transitiveFileCount = 0;
  const depthDistribution: Record<string, number> = {};
  for (const reachable of Object.values(transitiveGraph)) {
    if (reachable.length > 0) {
      transitiveFileCount += 1;
    }
  }

  // Distribution of shortest distance from any file that imports the target.
  const shortestDistance = computeShortestDistances(dependencyGraph);
  for (const distance of shortestDistance.values()) {
    const key = String(distance);
    depthDistribution[key] = (depthDistribution[key] ?? 0) + 1;
  }

  summary.transitiveFileCount = transitiveFileCount;
  summary.depthDistribution = depthDistribution;
  // Nothing imports these -> they are the graph roots (the distance-0 set above).
  summary.entryPoints = Object.keys(dependencyGraph)
    .filter((filePath) => !importedBy.has(filePath))
    .map((filePath) => path.relative(absoluteRoot, filePath))
    .sort();
  // These import nothing -> they are the graph leaves.
  summary.leafFiles = Object.keys(dependencyGraph)
    .filter((filePath) => (dependencyGraph[filePath] ?? []).length === 0)
    .map((filePath) => path.relative(absoluteRoot, filePath))
    .sort();

  return {
    root: absoluteRoot,
    deep,
    fileAnalysis,
    summary,
    dependencyGraph,
    transitiveGraph,
  };
}

/** Resumen vacío para proyectos sin archivos analizables. */
const emptySummary = (deep: boolean): AnalyzeSummary => ({
  totalFiles: 0,
  totalUniqueDependencies: 0,
  averageImportsPerFile: 0,
  filesWithCycles: [],
  maxImportDepth: 0,
  ...(deep ? { transitiveFileCount: 0, depthDistribution: {}, entryPoints: [], leafFiles: [] } : {}),
});

/** Profundidad maxima directa: 1 si existe alguna arista, 0 si el grafo esta vacio. */
const directDepth = (graph: Record<string, string[]>): number => {
  for (const deps of Object.values(graph)) {
    if (deps.length > 0) {
      return 1;
    }
  }
  return 0;
};

const maxDepth = (depths: Record<string, number>): number => {
  const values = Object.values(depths);
  return values.length > 0 ? Math.max(...values) : 0;
};

/**
 * Cierre transitivo: para cada nodo, el conjunto de archivos alcanzables a dos o mas
 * saltos. Usa una pila iterativa con conjunto `seen`, de modo que los ciclos no cuelgan
 * la recursion.
 */
export function buildTransitiveClosure(graph: Record<string, string[]>): Record<string, string[]> {
  const closure: Record<string, string[]> = {};

  for (const start of Object.keys(graph)) {
    const seen = new Set<string>();
    const stack = [...(graph[start] ?? [])];

    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === start || seen.has(current)) {
        continue;
      }
      seen.add(current);
      for (const next of graph[current] ?? []) {
        if (next !== start && !seen.has(next)) {
          stack.push(next);
        }
      }
    }

    closure[start] = [...seen].sort();
  }

  return closure;
}

/**
 * Distancia minima (en numero de saltos) desde cualquier archivo raiz —uno que no es
 * importado por nadie— hasta cada nodo. Los nodos que nunca se alcanzan se omiten.
 */
function computeShortestDistances(graph: Record<string, string[]>): Map<string, number> {
  const imported = new Set<string>();
  for (const deps of Object.values(graph)) {
    for (const dep of deps) {
      imported.add(dep);
    }
  }

  const distances = new Map<string, number>();
  const queue: Array<{ node: string; distance: number }> = [];

  for (const node of Object.keys(graph)) {
    if (!imported.has(node)) {
      distances.set(node, 0);
      queue.push({ node, distance: 0 });
    }
  }

  while (queue.length > 0) {
    const { node, distance } = queue.shift() as { node: string; distance: number };
    for (const next of graph[node] ?? []) {
      if (distances.has(next)) {
        continue;
      }
      distances.set(next, distance + 1);
      queue.push({ node: next, distance: distance + 1 });
    }
  }

  return distances;
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
  };

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
 * Longest-path depth per node.
 *
 * The previous implementation shared one `visited` set across every start node and
 * only marked a node once its recursion returned, so a cycle (`a -> b -> a`)
 * recursed forever until the stack blew up, and in an acyclic graph with shared
 * dependencies the depth depended on which node happened to be visited first. This
 * version memoises per node and treats a back-edge as depth 0, which is well defined
 * for both DAGs and cyclic graphs.
 */
export function calculateImportDepthsSimple(graph: Record<string, string[]>): Record<string, number> {
  const depths = new Map<string, number>();
  const onStack = new Set<string>();

  const visit = (node: string): number => {
    const memoised = depths.get(node);
    if (memoised !== undefined) {
      return memoised;
    }
    // Back-edge: the node is already on the current path, so stop descending.
    if (onStack.has(node)) {
      return 0;
    }

    onStack.add(node);
    let deepest = 0;
    for (const neighbour of graph[node] ?? []) {
      if (!graphHasKey(graph, neighbour)) {
        continue;
      }
      deepest = Math.max(deepest, 1 + visit(neighbour));
    }
    onStack.delete(node);

    depths.set(node, deepest);
    return deepest;
  };

  for (const node of Object.keys(graph)) {
    visit(node);
  }

  return Object.fromEntries(depths);
}