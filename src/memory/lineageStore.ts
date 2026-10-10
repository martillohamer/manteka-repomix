/**
 * lineageStore.ts - Almacenamiento persistente append-only basado en NDJSON.
 *
 * Restricciones: cero runtime deps, rutas Windows-safe (node:path), TypeScript estricto.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LineageRecord } from './types.js';
import { cosineSimilarity, tokenize } from './vectorizer.js';

const DEFAULT_STORE_NAME = 'lineage';
const DEFAULT_ENCODING = 'utf-8';

const storePath = (deps: MemoryDeps): string => {
  const root = deps.root ?? '.';
  return path.join(root, '.manteka', 'memory', `${DEFAULT_STORE_NAME}.ndjson`);
};

export class LineageStore {
  private storePath: string;
  private deps: MemoryDeps;

  constructor(deps: MemoryDeps) {
    this.deps = deps;
    this.storePath = storePath(deps);

    // Asegurar que el directorio exista
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Guarda un registro de linaje en formato NDJSON (append-only).
   * @param record - Registro de linaje a guardar
   */
  public saveRecord(record: LineageRecord): void {
    // Validar que el record tenga las propiedades necesarias
    const validRecord: LineageRecord = {
      id: record.id,
      timestamp: record.timestamp,
      sourceFile: record.sourceFile,
      operation: record.operation,
      description: record.description,
      confidence: record.confidence,
      metadata: record.metadata,
    };

    const content = JSON.stringify(validRecord) + '\n';
    fs.appendFileSync(this.storePath, content, DEFAULT_ENCODING);
  }

  /**
   * Busca registros similares usando el vectorizador de tokens.
   * @param queryText - Texto para buscar similitud
   * @param threshold - Umbral de similitud (default: 0.5)
   * @returns Array de registros ordenados por similitud
   */
  public findSimilar(queryText: string, threshold: number = 0.5): LineageRecord[] {
    if (!fs.existsSync(this.storePath)) {
      return [];
    }

    const content = fs.readFileSync(this.storePath, DEFAULT_ENCODING);
    if (!content.trim()) {
      return [];
    }

    const records: LineageRecord[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        // Usar evaluateSimilitude que tokeniza tanto el description como la queryText
        const similarity = this.evaluateSimilitude(parsed, queryText);
        if (similarity >= threshold) {
          // Agregar similarity al metadata
          const metadata = parsed.metadata ? { ...parsed.metadata, similarity } : { similarity };
          records.push({ ...parsed, metadata });
        }
      } catch {
        // Ignorar líneas mal formateadas
      }
    }

    // Ordenar por similitud descendente
    records.sort((a, b) => {
      const simA = a.metadata?.similarity ?? 0;
      const simB = b.metadata?.similarity ?? 0;
      return simB - simA;
    });

    return records;
  }

  /**
   * Evalúa la similitud entre un registro guardado y un texto de query.
   * @param record - Registro parseado del store
   * @param queryText - Texto de búsqueda
   * @returns Puntuación de similitud de coseno
   */
  private evaluateSimilitude(record: LineageRecord, queryText: string): number {
    // Combinar fields para vectoreo: description + sourceFile + operation
    const recordText = [record.description, record.sourceFile, record.operation].join(' ');

    const queryVector = tokenize(queryText);
    const recordVector = tokenize(recordText);

    return cosineSimilarity(recordVector, queryVector);
  }

  /**
   * Obtiene todos los registros almacenados.
   * @returns Array de todos los registros
   */
  public getAllRecords(): LineageRecord[] {
    if (!fs.existsSync(this.storePath)) {
      return [];
    }

    const content = fs.readFileSync(this.storePath, DEFAULT_ENCODING);
    if (!content.trim()) {
      return [];
    }

    const records: LineageRecord[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed: LineageRecord = JSON.parse(line);
        records.push(parsed);
      } catch {
        // Ignorar líneas mal formateadas
      }
    }

    return records;
  }

  /**
   * Elimina todos los registros (útil para testing).
   */
  public clear(): void {
    if (fs.existsSync(this.storePath)) {
      fs.writeFileSync(this.storePath, '', DEFAULT_ENCODING);
    }
  }
}

/**
 * Factory function para crear un LineageStore
 * @param deps - Dependencias del store
 * @returns Instancia de LineageStore
 */
export const createLineageStore = (deps: MemoryDeps): LineageStore => {
  return new LineageStore(deps);
};
