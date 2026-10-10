// Test suite for src/swarm/orchestrator.ts
// Implements TDD for SwarmOrchestrator and createSwarmOrchestrator

import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SwarmOrchestrator,
  SwarmOrchestratorDeps,
  SwarmOrchestratorResult,
  SwarmOrchestratorState,
} from '../../src/swarm/orchestrator.js';
import { createSwarmOrchestrator } from '../../src/swarm/orchestrator.js';

describe('createSwarmOrchestrator', () => {
  test('creates an orchestrator with default agents', () => {
    const deps: SwarmOrchestratorDeps = {};
    const orchestrator = createSwarmOrchestrator(deps);
    expect(orchestrator).toBeDefined();
    expect((orchestrator as any).getState).toBeDefined();
  });

  test('orchestrator has expected agent roles', () => {
    const deps: SwarmOrchestratorDeps = {};
    const orchestrator = createSwarmOrchestrator(deps);
    const state = orchestrator.getState();
    expect(state.agentCount.typeAgent).toBe(1);
    expect(state.agentCount.lintAgent).toBe(1);
    expect(state.agentCount.smellAgent).toBe(1);
  });
});

describe('SwarmOrchestrator', () => {
  let orchestrator: ReturnType<typeof createSwarmOrchestrator>;
  const testFileDir = `${__dirname}/../../tmp`;
  const testDeps: SwarmOrchestratorDeps = {
    root: '.',
  };

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(testFileDir)) {
      fs.mkdirSync(testFileDir, { recursive: true });
    }
    orchestrator = createSwarmOrchestrator(testDeps);
    orchestrator.start();
  });

  afterEach(() => {
    orchestrator.stop();
    // Cleanup test files
    if (fs.existsSync(testFileDir)) {
      const files = fs.readdirSync(testFileDir);
      for (const file of files) {
        fs.unlinkSync(`${testFileDir}/${file}`);
      }
    }
  });

  test('processFile when not running throws', async () => {
    const stoppedOrchestrator = createSwarmOrchestrator(testDeps);
    await expect(stoppedOrchestrator.processFile('test.ts')).rejects.toThrow('Swarm Orchestrator is not running');
  });

  test('processFile processes file and returns result', async () => {
    const content = `
const message: string = 'hello';
const rawData = processResponse();

function compute(x: number, y: number) {
  return x + y;
}

import { unused } from './unused-module';
`;

    // Create a temporary test file
    const testFileName = 'orchestrator-test.ts';
    const testFilePath = path.join(testFileDir, testFileName);
    await fs.promises.writeFile(testFilePath, content);

    try {
      const result = await orchestrator.processFile(testFilePath);

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.events).toBeDefined();
      expect(result.proposal).toBeDefined();
      expect(result.rejected).toBeDefined();

      // Should have processed events from all agents
      expect(result.events.length).toBeGreaterThan(0);

      // Type agent should have detected something
      const typeEvents = result.events.filter((e) => e.role === 'typeAgent');
      expect(typeEvents.length).toBeGreaterThan(0);

      // Lint agent should have detected unused import
      const lintEvents = result.events.filter((e) => e.role === 'lintAgent');
      expect(lintEvents.length).toBeGreaterThan(0);

      // Should have a proposal
      expect(result.proposal).toBeDefined();
      expect(result.proposal?.confidence).toBeGreaterThan(0);
      expect(result.proposal?.confidence).toBeLessThanOrEqual(1);
    } finally {
      // Cleanup
      try {
        await fs.promises.rm(testFilePath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  test('getState returns proper state shape', () => {
    const state = orchestrator.getState();
    expect(state).toHaveProperty('isRunning');
    expect(state).toHaveProperty('agentCount');
    expect(state).toHaveProperty('totalProposalsProcessed');
    expect(typeof state.isRunning).toBe('boolean');
    expect(state.totalProposalsProcessed).toBe(0);
  });

  test('addAgent and removeAgent modify state', () => {
    const newAgent = {
      id: 'custom-agent',
      role: 'typeAgent' as AgentRole,
      deps: {} as import('../../src/swarm/types.js').SwarmDeps,
      active: true,
    };
    orchestrator.addAgent(newAgent);
    const state = orchestrator.getState();
    expect(state.agentCount.typeAgent).toBe(2);

    orchestrator.removeAgent('typeAgent' as import('../../src/swarm/types.js').AgentRole);
    const state2 = orchestrator.getState();
    expect(state2.agentCount.typeAgent).toBe(1);
  });
});
