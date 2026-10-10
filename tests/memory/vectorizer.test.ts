// Test suite for src/memory/vectorizer.ts
// Implements TDD for LocalVectorizer

import { describe, expect, it } from 'vitest';
import type { LineageRecord } from '../../src/memory/types.js';
import { cosineSimilarity, evaluateSimilitude, recordToVector, tokenize } from '../../src/memory/vectorizer.js';

describe('LocalVectorizer', () => {
  test('tokenize produces vector with correct dimension', () => {
    const text = 'This is a test sentence';
    const vector = tokenize(text);
    expect(vector.length).toBe(64);
    expect(vector instanceof Float32Array).toBe(true);
  });

  test('tokenize produces deterministic output', () => {
    const text = 'deterministic test';
    const vector1 = tokenize(text);
    const vector2 = tokenize(text);
    expect(vector1).toEqual(vector2);
  });

  test('tokenize different texts produce different vectors', () => {
    const vector1 = tokenize('first text');
    const vector2 = tokenize('second text');
    // Vectors should not be identical
    expect(vector1).not.toEqual(vector2);
  });

  test('cosineSimilarity with identical vectors returns 1', () => {
    const vector = new Float32Array(64).fill(1 / Math.sqrt(64));
    const similarity = cosineSimilarity(vector, vector);
    expect(similarity).toBeCloseTo(1, 5);
  });

  test('cosineSimilarity with orthogonal vectors returns 0', () => {
    const vectorA = new Float32Array(64).fill(1 / Math.sqrt(64));
    const vectorB = new Float32Array(64).fill(0);
    const similarity = cosineSimilarity(vectorA, vectorB);
    expect(similarity).toBeCloseTo(0, 5);
  });

  test('cosineSimilarity with opposite vectors returns -1', () => {
    const vectorA = new Float32Array(64).fill(1 / Math.sqrt(64));
    const vectorB = new Float32Array(64).fill(-1 / Math.sqrt(64));
    const similarity = cosineSimilarity(vectorA, vectorB);
    expect(similarity).toBeCloseTo(-1, 5);
  });

  test('recordToVector produces a valid vector', () => {
    const record: LineageRecord = {
      id: 'rec-1',
      timestamp: Date.now(),
      sourceFile: 'test.ts',
      operation: 'insert',
      description: 'Added variable x',
      confidence: 0.8,
    };
    const vector = recordToVector(record);
    expect(vector.length).toBe(64);
    expect(vector instanceof Float32Array).toBe(true);

    // Verify all values are finite
    for (let i = 0; i < vector.length; i += 1) {
      expect(Number.isFinite(vector[i])).toBe(true);
    }
  });

  test('evaluateSimilitude computes similarity', () => {
    const record: LineageRecord = {
      id: 'rec-1',
      timestamp: Date.now(),
      sourceFile: 'test.ts',
      operation: 'insert',
      description: 'Added variable x',
      confidence: 0.8,
    };

    const similarText = 'Added variable x in test.ts';
    const differentText = 'Completely different operation';

    const similarScore = evaluateSimilitude(record, similarText);
    const differentScore = evaluateSimilitude(record, differentText);

    // Similar text should have higher similarity
    expect(similarScore).toBeGreaterThan(differentScore);
    // Both should be between -1 and 1
    expect(similarScore).toBeGreaterThanOrEqual(-1);
    expect(similarScore).toBeLessThanOrEqual(1);
    expect(differentScore).toBeGreaterThanOrEqual(-1);
    expect(differentScore).toBeLessThanOrEqual(1);
  });
});
