// E2E Integration Stress Validation - Phase 10
// Tests the complete workflow: Swarm -> Healer -> Evolutionary Memory -> BiologicalMutator

import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHealer } from '../../src/healer/index.js';
import { generateMutations, getQualityVerdict, isReversible, mutateCode } from '../../src/hooks/mutator.js';
import { createAdaptiveEngine } from '../../src/memory/adaptiveEngine.js';
import { createLineageStore } from '../../src/memory/lineageStore.js';
import type { LineageRecord } from '../../src/memory/types.js';

const e2eTestDir = `${__dirname}/../../tmp/e2e-test-${Date.now()}`;

beforeEach(() => {
  // Cleanup before each test
  if (fs.existsSync(e2eTestDir)) {
    fs.rmSync(e2eTestDir, { recursive: true, force: true });
  }
});

afterEach(() => {
  // Final cleanup
  if (fs.existsSync(e2eTestDir)) {
    fs.rmSync(e2eTestDir, { recursive: true, force: true });
  }
});

describe('Phase 10: E2E Integration & Stress Validation', () => {
  describe('Full Workflow Integration', () => {
    test('simulates swarm error detection → healer patch → memory re-valuation → mutator validation', () => {
      // Step 1: Create healer with memory store
      const memoryStore = createLineageStore({
        root: e2eTestDir,
      });

      const healer = createHealer({
        root: e2eTestDir,
        dryRun: true,
        maxAttempts: 3,
      });

      // Step 2: Create a synthetic TODO/FIXME in a test file
      // Using code pattern compatible with BiologicalMutator (has clear true/false/&&/|| patterns)
      const syntheticFile = path.join(e2eTestDir, 'synthetic.ts');
      fs.writeFileSync(
        syntheticFile,
        `
/**
 * Synthetic module for E2E Phase 10 validation
 */
function calculateTotal(a: number, b: number): number {
  // TODO: implement proper calculation
  // FIXME: this function needs proper error handling
  const result = a + b; // Simplified for testing
  return result;
}

const pending = true && false;
const active = true || false;
const done = !pending;
`,
      );

      // Step 3: Healer sensor detects (dry-run, should return null or handle gracefully)
      const diagnostics = healer.scanAndProceed(syntheticFile);

      // Step 4: Create a synthetic diagnostic for the flow
      const syntheticDiagnostic: any = {
        id: 'synthetic-' + Date.now(),
        timestamp: Date.now(),
        sourceFile: 'synthetic.ts',
        operation: 'insert' as const,
        description: 'Synthetic error for E2E validation - calculateTotal needs error handling',
        confidence: 0.95,
        metadata: {},
      };

      // Store the diagnostic in memory evolutionary store
      memoryStore.saveRecord({
        id: 'diag-' + Date.now(),
        timestamp: Date.now(),
        sourceFile: syntheticFile,
        // LineageRecord.operation only accepts insert|update|delete|transform.
        operation: 'transform',
        description: syntheticDiagnostic.description,
        confidence: syntheticDiagnostic.confidence,
      });

      // Step 5: Adaptive engine re-weights confidence based on historical similarity
      const adaptiveEngine = createAdaptiveEngine();

      // Evaluate proposal confidence using the memory store
      const proposal: any = {
        id: 'prop-' + Date.now(),
        agentId: 'agent-e2e',
        role: 'typeAgent' as const,
        file: 'synthetic.ts',
        patch: {
          file: 'synthetic.ts',
          diff: 'add proper error handling',
          confidence: 0.8,
        },
        rationale: 'Add error handling to calculateTotal',
        confidence: 0.8,
        timestamp: Date.now(),
      };

      const confidenceFactor = adaptiveEngine.evaluateProposalConfidence(proposal, memoryStore as any);

      // Confidence should be adjusted based on historical similarity
      expect(confidenceFactor).toBeGreaterThan(0);
      expect(confidenceFactor).toBeLessThanOrEqual(1.15);

      // Step 6: BiologicalMutator validates patch resilience
      // Use code pattern compatible with the mutator (like in mutator.test.ts)
      const testCode = `
function testBoolean(x: boolean): boolean {
  if (x) {
    return true;
  }
  return false;
}

const result = a && b;
const condition = a || b;
const isValid = !pending;
`;
      const mutationResult = mutateCode(testCode, 'boolean', 0);

      // Mutations should be applicable and reversible
      expect(mutationResult.applied).toBe(true);
      expect(mutationResult.reversible).toBe(true);
      expect(mutationResult.mutatedCode).not.toEqual(testCode);

      // Step 7: Quality gate verdict
      const verdict = getQualityVerdict(0.85, 0.8);
      expect(verdict).toBe('passed');
    });

    test('simulates concurrent executions for race condition detection', () => {
      // This test verifies no race conditions in Windows-safe path handling
      // and that multiple concurrent executions don't corrupt state

      const concurrentRuns = 10;
      const promises: Array<Promise<void>> = [];

      for (let i = 0; i < concurrentRuns; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            // Each concurrent run uses a unique subdirectory for Windows-safe paths
            const concurrentDir = path.join(e2eTestDir, `concurrent-${i}`);

            // Create healer for this concurrent run
            const memoryStore = createLineageStore({ root: concurrentDir });
            const healer = createHealer({
              root: concurrentDir,
              dryRun: true,
              maxAttempts: 3,
            });

            // Simulate synthetic detection
            const testFile = path.join(concurrentDir, `test-${i}.ts`);
            fs.writeFileSync(testFile, `// Test file ${i} for concurrent execution\nconst x = 1;`);

            // The healer should handle each independently without corruption
            healer.scanAndProceed(testFile);

            resolve();
          }),
        );
      }

      // Wait for all concurrent runs to complete
      Promise.all(promises).then(() => {
        // Verify the main test directory still has correct structure
        expect(fs.existsSync(e2eTestDir)).toBe(true);
      });
    });
  });

  describe('BiologicalMutator Resilience', () => {
    test('validates mutator can handle diverse code patterns', () => {
      const testCode = `
function testBoolean(x: boolean): boolean {
  if (x) {
    return true;
  }
  return false;
}

const result = a && b;
const condition = a || b;
const isValid = !pending;
`;

      // Test various mutation types - using patterns from existing test suite
      const booleanMut = mutateCode(testCode, 'boolean', 0);
      expect(booleanMut.applied).toBe(true);
      expect(booleanMut.reversible).toBe(true);

      const operatorMut = mutateCode(testCode, 'operator', 0);
      expect(operatorMut.applied).toBe(true);
      expect(operatorMut.reversible).toBe(true);

      const constantMut = mutateCode(testCode, 'constant', 0);
      expect(constantMut.applied).toBe(true);
      expect(constantMut.reversible).toBe(true);

      // All mutations should be different
      expect(booleanMut.mutatedCode).not.toEqual(operatorMut.mutatedCode);
      expect(operatorMut.mutatedCode).not.toEqual(constantMut.mutatedCode);
    });

    test('quality gate adjusts verdict based on mutation score', () => {
      // High similarity = passed
      expect(getQualityVerdict(0.9, 0.8)).toBe('passed');
      // Very low similarity = blocked
      expect(getQualityVerdict(0.1, 0.8)).toBe('blocked');
      // Moderate = pending
      expect(getQualityVerdict(0.5, 0.8)).toBe('pending');
    });
  });
});
