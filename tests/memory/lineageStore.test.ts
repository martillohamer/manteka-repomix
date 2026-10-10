// Test suite for src/memory/lineageStore.ts
// Implements TDD for LineageStore persistence and similarity search

import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLineageStore, type LineageRecord } from '../../src/memory/lineageStore.js';
import { tokenize } from '../../src/memory/vectorizer.js';

const testStoreDir = `${__dirname}/../../tmp/memory-test`;

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
      const results = store.findSimilar('authentication');

      // First result should have highest similarity
      expect(results[0]).toBeDefined;
      if (results[1]) {
        expect(results[0].metadata?.similarity).toBeGreaterThanOrEqual(results[1].metadata?.similarity ?? 0);
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
