// Test suite for src/memory/lineageStore.ts
// Implements TDD for LineageStore persistence and similarity search

import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLineageStore } from '../../src/memory/lineageStore.js';
// `LineageRecord` is declared in memory/types.ts; lineageStore.ts only imports it.
import type { LineageRecord } from '../../src/memory/types.js';
import { tokenize } from '../../src/memory/vectorizer.js';

/**
 * Reads a numeric value out of a record's loosely-typed metadata bag.
 * Returns undefined when absent or not a number.
 */
const numericMetadata = (record: LineageRecord, key: string): number | undefined => {
  const value = record.metadata?.[key];
  return typeof value === 'number' ? value : undefined;
};

const testStoreDir = `${__dirname}/../../tmp/memory-lineage-${Date.now()}`;

beforeEach(() => {
  // Cleanup test directory before each test
  if (fs.existsSync(testStoreDir)) {
    fs.rmSync(testStoreDir, { recursive: true, force: true });
  }
});

afterEach(() => {
  // Final cleanup
  if (fs.existsSync(testStoreDir)) {
    fs.rmSync(testStoreDir, { recursive: true, force: true });
  }
});

describe('LineageStore', () => {
  let store: ReturnType<typeof createLineageStore>;

  beforeEach(() => {
    store = createLineageStore({
      root: testStoreDir,
    });
  });

  describe('saveRecord', () => {
    test('saves a record to NDJSON format', () => {
      const record: LineageRecord = {
        id: 'test-1',
        timestamp: Date.now(),
        sourceFile: 'test.ts',
        operation: 'insert',
        description: 'Test record insertion',
        confidence: 0.9,
      };

      store.saveRecord(record);

      const storeFile = path.join(testStoreDir, '.manteka', 'memory', 'lineage.ndjson');
      expect(fs.existsSync(storeFile)).toBe(true);

      const content = fs.readFileSync(storeFile, 'utf-8');
      const parsed = JSON.parse(content.trim().split('\n')[0]);
      expect(parsed.id).toBe('test-1');
      expect(parsed.description).toBe('Test record insertion');
    });

    test('appends multiple records', () => {
      store.saveRecord({
        id: 'test-1',
        timestamp: Date.now(),
        sourceFile: 'test.ts',
        operation: 'insert',
        description: 'First record',
        confidence: 0.9,
      });
      store.saveRecord({
        id: 'test-2',
        timestamp: Date.now(),
        sourceFile: 'test.ts',
        operation: 'insert',
        description: 'Second record',
        confidence: 0.8,
      });

      const storeFile = path.join(testStoreDir, '.manteka', 'memory', 'lineage.ndjson');
      const content = fs.readFileSync(storeFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
    });
  });

  describe('findSimilar', () => {
    beforeEach(() => {
      // Pre-populate store with test records
      store.saveRecord({
        id: 'rec-1',
        timestamp: Date.now(),
        sourceFile: 'app.ts',
        operation: 'insert',
        description: 'Added user authentication',
        confidence: 0.95,
      });
      store.saveRecord({
        id: 'rec-2',
        timestamp: Date.now(),
        sourceFile: 'app.ts',
        operation: 'insert',
        description: 'Added payment processing',
        confidence: 0.9,
      });
      store.saveRecord({
        id: 'rec-3',
        timestamp: Date.now(),
        sourceFile: 'core.ts',
        operation: 'transform',
        description: 'Refactored authentication module',
        confidence: 0.85,
      });
    });

    test('finds similar records by description', () => {
      const results = store.findSimilar('authentication module');

      expect(results.length).toBeGreaterThan(0);
      // Should find records related to authentication
      if (results.length > 0) {
        // At least one record should have positive similarity
        expect(results[0].metadata?.similarity).toBeGreaterThan(0);
      }
    });

    test('orders results by similarity descending', () => {
      // Default threshold (0.5) yields nothing for a single-token query, so the
      // threshold is lowered here to guarantee a multi-record result set; otherwise
      // there is no ordering left to assert.
      const results = store.findSimilar('authentication module', 0.1);
      expect(results.length).toBeGreaterThanOrEqual(2);

      const similarities = results.map((record) => numericMetadata(record, 'similarity') ?? 0);
      for (let index = 1; index < similarities.length; index++) {
        expect(similarities[index - 1]).toBeGreaterThanOrEqual(similarities[index]);
      }
    });

    test('filters by threshold', () => {
      const results = store.findSimilar('authentication', 0.99);

      // With high threshold, should find very few or no records
      // Records should all have similarity >= 0.99
      results.forEach((record) => {
        expect(record.metadata?.similarity).toBeGreaterThanOrEqual(0.99);
      });
    });

    test('returns empty when store is empty', () => {
      // This is already handled by beforeEach clearing the store
      const emptyStore = createLineageStore({
        root: `${testStoreDir}-empty`,
      });
      const results = emptyStore.findSimilar('authentication');
      expect(results).toEqual([]);
    });
  });

  describe('getAllRecords', () => {
    test('returns all records in order', () => {
      store.saveRecord({
        id: 'first',
        timestamp: Date.now(),
        sourceFile: 'a.ts',
        operation: 'insert',
        description: 'First record',
        confidence: 0.9,
      });
      store.saveRecord({
        id: 'second',
        timestamp: Date.now(),
        sourceFile: 'b.ts',
        operation: 'insert',
        description: 'Second record',
        confidence: 0.8,
      });
      store.saveRecord({
        id: 'third',
        timestamp: Date.now(),
        sourceFile: 'c.ts',
        operation: 'insert',
        description: 'Third record',
        confidence: 0.7,
      });

      const all = store.getAllRecords();
      expect(all.length).toBe(3);
      expect(all[0].id).toBe('first');
      expect(all[1].id).toBe('second');
      expect(all[2].id).toBe('third');
    });

    test('returns empty when no records saved', () => {
      const emptyStore = createLineageStore({
        root: `${testStoreDir}-empty`,
      });
      const all = emptyStore.getAllRecords();
      expect(all).toEqual([]);
    });
  });
});
