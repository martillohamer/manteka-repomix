// Test suite for src/hooks/mutator.ts
// Implements TDD for BiologicalMutator

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateMutations, getQualityVerdict, isReversible, mutateCode } from '../../src/hooks/mutator.js';
import type { HookConfig, MutationResult } from '../../src/hooks/types.js';

describe('BiologicalMutator', () => {
  let testCode: string;

  beforeEach(() => {
    testCode = `
function testBoolean(x: boolean): boolean {
  if (x) {
    return true;
  }
  return false;
}

const result = a && b;
const condition = a || b;
const isValid = !condition;
`;
  });

  afterEach(() => {
    testCode = '';
  });

  describe('mutateCode', () => {
    test('mutates boolean values deterministically', () => {
      const result = mutateCode(testCode, 'boolean', 0);

      expect(result.applied).toBe(true);
      expect(result.mutationType).toBe('boolean');
      expect(result.reversible).toBe(true);
      // Should have toggled a boolean
      expect(result.mutatedCode).not.toEqual(testCode);
    });

    test('mutates operators deterministically', () => {
      const result = mutateCode(testCode, 'operator', 0);

      expect(result.applied).toBe(true);
      expect(result.mutationType).toBe('operator');
      expect(result.reversible).toBe(true);
      // Should have changed an operator
      expect(result.mutatedCode).not.toEqual(testCode);
    });

    test('mutates constants deterministically', () => {
      const result = mutateCode(testCode, 'constant', 0);

      expect(result.applied).toBe(true);
      expect(result.mutationType).toBe('constant');
      expect(result.reversible).toBe(true);
      // Should have changed a constant
      expect(result.mutatedCode).not.toEqual(testCode);
    });

    test('returns non-applied result when no mutation possible', () => {
      const simpleCode = 'const x = 1;';
      const result = mutateCode(simpleCode, 'boolean', 0);

      expect(result.applied).toBe(false);
      expect(result.mutatedCode).toEqual(simpleCode);
    });

    test('isReversible returns true for applied mutations', () => {
      const result = mutateCode(testCode, 'boolean', 0);
      expect(isReversible(result)).toBe(true);
    });

    test('returns reversible=false when not applied', () => {
      const simpleCode = 'const x = 1;';
      const result = mutateCode(simpleCode, 'boolean', 0);
      expect(isReversible(result)).toBe(false);
    });
  });

  describe('generateMutations', () => {
    test('generates mutations based on config', () => {
      const config: HookConfig = {
        id: 'test-hook',
        name: 'Test Hook',
        enabled: true,
        mutationTypes: ['boolean', 'operator'],
        mutationRate: 1.0,
        qualityThreshold: 0.8,
      };

      const results = generateMutations(testCode, config);

      // Should generate mutations
      expect(results.length).toBeGreaterThan(0);
      // All results should be applicable
      results.forEach((result) => {
        expect(result.applied).toBe(true);
      });
    });

    test('respects mutationRate in generation', () => {
      const configLowRate: HookConfig = {
        id: 'test-hook',
        name: 'Test Hook',
        enabled: true,
        mutationTypes: ['boolean'],
        mutationRate: 0.1, // 10% rate
        qualityThreshold: 0.8,
      };

      const results = generateMutations(testCode, configLowRate);
      // With low rate, should generate fewer mutations
      expect(results.length).toBeLessThanOrEqual(5);
    });

    test('includes all mutation types specified in config', () => {
      const config: HookConfig = {
        id: 'test-hook',
        name: 'Test Hook',
        enabled: true,
        mutationTypes: ['boolean', 'operator', 'constant'],
        mutationRate: 1.0,
        qualityThreshold: 0.8,
      };

      const results = generateMutations(testCode, config);
      const types = new Set(results.map((r) => r.mutationType));
      expect(types.has('boolean')).toBe(true);
      expect(types.has('operator')).toBe(true);
      expect(types.has('constant')).toBe(true);
    });
  });

  describe('getQualityVerdict', () => {
    test('returns passed when mutationScore meets threshold', () => {
      const verdict = getQualityVerdict(0.85, 0.8);
      expect(verdict).toBe('passed');
    });

    test('returns blocked when mutationScore is very low', () => {
      const verdict = getQualityVerdict(0.2, 0.8);
      expect(verdict).toBe('blocked');
    });

    test('returns pending when mutationScore is above threshold but not extremely low', () => {
      const verdict = getQualityVerdict(0.7, 0.8);
      expect(verdict).toBe('pending');
    });
  });
});
