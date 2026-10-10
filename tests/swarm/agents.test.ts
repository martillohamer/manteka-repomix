// Test suite for src/swarm/agents/
// Implements TDD for typeAgent, lintAgent, and smellAgent

import { describe, expect, it } from 'vitest';
import { lintFile } from '../../src/swarm/agents/lintAgent.js';
import { detectSmells } from '../../src/swarm/agents/smellAgent.js';
import { diagnoseAndPatch } from '../../src/swarm/agents/typeAgent.js';
import type { AgentMessage } from '../../src/swarm/types.js';

describe('typeAgent', () => {
  test('diagnoses missing type annotations', async () => {
    // Only variable WITHOUT type annotation
    const content = `const rawData = processResponse();
const message: string = 'hello';
`;
    const messages = await diagnoseAndPatch('test.ts', content);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    if (messages.length > 0) {
      // The unannotated variable should get 'info' severity
      expect(messages[0].severity).toBe('info');
      expect(messages[0].metadata?.detectedPattern).toBe('missingTypeAnnotation');
    }
  });

  test('diagnoses type mismatches', async () => {
    const content = `const count: number = 'not a number';
`;
    const messages = await diagnoseAndPatch('test.ts', content);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    if (messages.length > 0) {
      expect(messages[0].severity).toBe('warn');
      expect(messages[0].metadata?.detectedPattern).toBe('typeMismatch');
    }
  });
});

describe('lintAgent', () => {
  test('detects trailing whitespace', async () => {
    const content = `const x = 1;   \nconst y = 2;`;
    const messages = await lintFile('test.ts', content);
    const trailingMsgs = messages.filter((m) => m.message.includes('Trailing whitespace'));
    expect(trailingMsgs.length).toBeGreaterThanOrEqual(1);
  });

  test('detects multiple blank lines', async () => {
    const content = `const a = 1;\n\n\n\nconst b = 2;\nconst c = 3;`;
    const messages = await lintFile('test.ts', content);
    const blankMsgs = messages.filter((m) => m.message.includes('More than 2 consecutive'));
    expect(blankMsgs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('smellAgent', () => {
  test('detects functions larger than 20 lines', async () => {
    // Create a function with 30 lines
    const funcBody = Array(30).fill('const x = 1;').join('\n');
    const content = `function processData() {\n${funcBody}\n}\n`;
    const messages = await detectSmells('test.ts', content);
    const largeFuncMsgs = messages.filter((m) => m.message.includes('exceeds 20-line limit'));
    expect(largeFuncMsgs.length).toBeGreaterThanOrEqual(1);
  });

  test('detects long lines', async () => {
    const longLine = 'a'.repeat(120);
    const content = `const x = '${longLine}';\n`;
    const messages = await detectSmells('test.ts', content);
    const longLineMsgs = messages.filter((m) => m.message.includes('exceeds 100 characters'));
    expect(longLineMsgs.length).toBeGreaterThanOrEqual(1);
  });
});
