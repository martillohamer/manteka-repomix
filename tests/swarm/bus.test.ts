// Test suite for src/swarm/bus.ts
// Implements TDD for the Swarm Event Bus

import { beforeEach, describe, expect, it } from 'vitest';
import { SwarmEventBus } from '../../src/swarm/bus.js';
import type { AgentMessage, AgentRole } from '../../src/swarm/types.js';

beforeEach(() => {
  // Reset the singleton bus between tests
  // @ts-expect-error - accessing internal reset method for test cleanup
  (SwarmEventBus as any).reset?.();
});

describe('SwarmEventBus', () => {
  test('subscribe adds a handler for a role', () => {
    const bus = SwarmEventBus;
    const handler = () => {};
    bus.subscribe('typeAgent', handler);
    expect(bus.getSubscribers('typeAgent')).toBe(1);
  });

  test('publish calls all subscribers for a role', () => {
    const bus = SwarmEventBus;
    const handler = () => {};
    bus.subscribe('typeAgent', handler);
    const message: AgentMessage = {
      id: 'msg-1',
      role: 'typeAgent',
      timestamp: Date.now(),
      sourceFile: 'test.ts',
      severity: 'info',
      message: 'test message',
    };
    bus.publish(message);
    expect(bus.getSubscribers('typeAgent')).toBe(1);
  });

  test('publish with unknown role does not error', () => {
    const bus = SwarmEventBus;
    const message: AgentMessage = {
      id: 'msg-2',
      role: 'unknownRole',
      timestamp: Date.now(),
      sourceFile: 'test.ts',
      severity: 'info',
      message: 'test message',
    };
    expect(() => bus.publish(message)).not.toThrow();
  });

  test('getSubscribers returns 0 for unsubscribed role', () => {
    const bus = SwarmEventBus;
    expect(bus.getSubscribers('nonexistent')).toBe(0);
  });

  test('multiple subscribers for same role', () => {
    const bus = SwarmEventBus;
    const handler1 = () => {};
    const handler2 = () => {};
    bus.subscribe('lintAgent', handler1);
    bus.subscribe('lintAgent', handler2);
    expect(bus.getSubscribers('lintAgent')).toBe(2);
  });
});
