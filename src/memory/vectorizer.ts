/**
 * LocalVectorizer - Tokenización, vectores normalizados de dimensión fija
 * y similitud de coseno usando solo Node.js built-ins.
 *
 * Restricciones: cero runtime deps, rutas Windows-safe, TypeScript estricto.
 */
import type { LineageRecord } from './types.js';

const DEFAULT_DIMENSION = 64;

/**
 * Tokeniza un texto en un vector de dimensión fija usando hashing determinista.
 * @param text - Texto a vectorizar
 * @param dimension - Dimensión del vector (default: 64)
 * @returns Vector normalizado de float32
 */
export const tokenize = (text: string, dimension: number = DEFAULT_DIMENSION): Float32Array => {
  const vector = new Float32Array(dimension);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];

  // Hash determinista de palabras a índices
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j += 1) {
      const char = word.charCodeAt(j);
      hash = ((hash << 5) - hash + char) | 0; // Hash tipo JavaScript
    }
    const index = Math.abs(hash) % dimension;
    vector[index] = (vector[index] || 0) + 1;
  }

  // Normalización L2
  let magnitude = 0;
  for (let i = 0; i < dimension; i += 1) {
    magnitude += vector[i] * vector[i];
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude > 0) {
    for (let i = 0; i < dimension; i += 1) {
      vector[i] = vector[i] / magnitude;
    }
  }

  return vector;
};

/**
 * Calcula la similitud de coseno entre dos vectores.
 * @param a - Primer vector
 * @param b - Segundo vector
 * @returns Valor entre -1 y 1 (1 = idéntico, 0 = ortogonal, -1 = opuesto)
 */
export const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  const dimension = a.length;
  for (let i = 0; i < dimension; i += 1) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dotProduct / (magA * magB);
};

/**
 * Convierte un LineageRecord a un vector usando su descripción.
 * @param record - Registro de linaje a vectorizar
 * @returns Vector normalizado representando el registro
 */
export const recordToVector = (record: LineageRecord): Float32Array => {
  const text = [record.description, record.sourceFile, record.operation].join(' ');

  return tokenize(text);
};

/**
 * Evalúa la similitud entre un registro y un texto.
 * @param record - Registro de linaje
 * @param text - Texto para comparar
 * @returns Puntuación de similitud de coseno
 */
export const evaluateSimilitude = (record: LineageRecord, text: string): number => {
  const vector = recordToVector(record);
  const queryVector = tokenize(text);
  return cosineSimilarity(vector, queryVector);
};
