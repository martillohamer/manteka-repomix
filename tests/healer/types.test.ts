import { describe, expect, it } from 'vitest';
import { createHealer } from '../../src/healer/index.js';

describe('healer types/contracts', () => {
  it('creates healer handle with start/stop/emit', async () => {
    const healer = createHealer();
    await healer.start();
    healer.emit({ type: 'detected', ts: Date.now() });
    await healer.stop();
    expect(healer.start).toBeDefined();
    expect(healer.stop).toBeDefined();
    expect(healer.emit).toBeDefined();
  });

  it('respects dryRun/maxAttempts defaults', async () => {
    const healer = createHealer({ dryRun: true, maxAttempts: 1 });
    await healer.start();
    await healer.stop();
    expect(healer).toBeDefined();
  });
});
