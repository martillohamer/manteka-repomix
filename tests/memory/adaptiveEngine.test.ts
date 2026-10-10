// Test suite for src/memory/adaptiveEngine.ts
// Implements TDD for Adaptive Confidence Engine

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adjustProposalsConfidence, evaluateProposalConfidence } from '../../src/memory/adaptiveEngine.js';
import { createLineageStore } from '../../src/memory/lineageStore.js';
import type { LineageRecord } from '../../src/memory/types.js';
import type { SwarmProposal } from '../../src/swarm/types.js';

describe('AdaptiveConfidenceEngine', () => {
  let store: ReturnType<typeof createLineageStore>;

  beforeEach(() => {
    store = createLineageStore({
      root: `${__dirname}/../../tmp/memory-test`,
    });
  });

  afterEach(() => {
    store.clear();
  });

  describe('evaluateProposalConfidence', () => {
    test('returns base factor when no similar records found', () => {
      const proposal: SwarmProposal = {
        id: 'prop-1',
        agentId: 'agent-1',
        role: 'typeAgent' as const,
        file: 'test.ts',
        patch: {
          file: 'test.ts',
          diff: 'some diff',
          confidence: 0.8,
        },
        rationale: 'Test proposal',
        confidence: 0.8,
        timestamp: Date.now(),
      };

      const factor = evaluateProposalConfidence(proposal, store);
      // Should return base factor when no records in store
      expect(factor).toBeCloseTo(0.9, 2);
    });

    test('returns adjusted factor when similar records exist', () => {
      // Pre-populate store with similar record
      store.saveRecord({
        id: 'rec-1',
        timestamp: Date.now(),
        sourceFile: 'test.ts',
        operation: 'insert',
        description: 'Added user authentication module',
        confidence: 0.9,
      });

      const proposal: SwarmProposal = {
        id: 'prop-1',
        agentId: 'agent-1',
        role: 'typeAgent' as const,
        file: 'test.ts',
        patch: {
          file: 'test.ts',
          diff: 'some diff',
          confidence: 0.8,
        },
        rationale: 'Added user authentication module',
        confidence: 0.8,
        timestamp: Date.now(),
      };

      const factor = evaluateProposalConfidence(proposal, store);
      // Should return adjusted factor (either medium or high similarity boost)
      expect(factor).toBeGreaterThan(0.9);
      expect(factor).toBeLessThanOrEqual(1.15);
    });

    test('returns base factor for empty proposal text', () => {
      const proposal: SwarmProposal = {
        id: 'prop-1',
        agentId: 'agent-1',
        role: 'typeAgent' as const,
        file: 'test.ts',
        patch: {
          file: 'test.ts',
          diff: '',
          confidence: 0.8,
        },
        rationale: '',
        confidence: 0.8,
        timestamp: Date.now(),
      };

      const factor = evaluateProposalConfidence(proposal, store);
      expect(factor).toBeCloseTo(0.9, 2);
    });
  });

  describe('adjustProposalsConfidence', () => {
    test('adjusts proposals confidence when store has records', () => {
      store.saveRecord({
        id: 'rec-1',
        timestamp: Date.now(),
        sourceFile: 'app.ts',
        operation: 'insert',
        description: 'Added payment processing',
        confidence: 0.95,
      });

      const proposals: SwarmProposal[] = [
        {
          id: 'prop-1',
          agentId: 'agent-1',
          role: 'typeAgent' as const,
          file: 'app.ts',
          patch: {
            file: 'app.ts',
            diff: 'fix payment',
            confidence: 0.8,
          },
          rationale: 'Fix payment processing',
          confidence: 0.8,
          timestamp: Date.now(),
        },
        {
          id: 'prop-2',
          agentId: 'agent-2',
          role: 'lintAgent' as const,
          file: 'styles.css',
          patch: {
            file: 'styles.css',
            diff: 'color fix',
            confidence: 0.9,
          },
          rationale: 'Fix styles',
          confidence: 0.9,
          timestamp: Date.now(),
        },
      ];

      const adjusted = adjustProposalsConfidence(proposals, store);

      // Both proposals should have adjusted confidence
      expect(adjusted[0].confidence).toBeDefined();
      expect(adjusted[1].confidence).toBeDefined();
      // Confidence should be within valid range
      expect(adjusted[0].confidence).toBeGreaterThanOrEqual(0);
      expect(adjusted[0].confidence).toBeLessThanOrEqual(1);
      expect(adjusted[1].confidence).toBeGreaterThanOrEqual(0);
      expect(adjusted[1].confidence).toBeLessThanOrEqual(1);
    });

    test('preserves original proposal structure', () => {
      store.saveRecord({
        id: 'rec-1',
        timestamp: Date.now(),
        sourceFile: 'test.ts',
        operation: 'insert',
        description: 'Test description',
        confidence: 0.9,
      });

      const proposal: SwarmProposal = {
        id: 'prop-1',
        agentId: 'agent-1',
        role: 'typeAgent' as const,
        file: 'test.ts',
        patch: {
          file: 'test.ts',
          diff: 'some diff',
          confidence: 0.8,
        },
        rationale: 'Test proposal',
        confidence: 0.8,
        timestamp: Date.now(),
      };

      const adjusted = adjustProposalsConfidence([proposal], store);

      // Should preserve all original properties
      expect(adjusted[0].id).toBe('prop-1');
      expect(adjusted[0].agentId).toBe('agent-1');
      expect(adjusted[0].role).toBe('typeAgent');
      expect(adjusted[0].file).toBe('test.ts');
      expect(adjusted[0].patch).toBeDefined();
      expect(adjusted[0].rationale).toBe('Test proposal');
      expect(adjusted[0].timestamp).toBeDefined();
    });
  });
});
