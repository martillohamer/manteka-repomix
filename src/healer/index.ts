import * as path from 'node:path';
import { createDiagnostician } from './diagnostician.js';
import { createEngine } from './engine.js';
import { createSensor } from './sensor.js';
import type { HealerDeps, HealerEvent, HealerHandle, Patch } from './types.js';

const DEFAULT_MAX_ATTEMPTS = 3;

export const createHealer = (deps: HealerDeps = {}): HealerHandle => {
  const root = deps.root ? path.resolve(deps.root) : process.cwd();
  const dryRun = deps.dryRun ?? false;
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const readFile = deps.readFile ?? (async () => null);

  const sensor = createSensor({ root, readFile });
  const diagnostician = createDiagnostician({ readFile });
  const engine = createEngine({ readFile });

  const events: HealerEvent[] = [];
  let attemptCount = 0;

  const emit = (event: HealerEvent): void => {
    events.push(event);
  };

  const scanAndProceed = async (file?: string): Promise<Patch | null> => {
    const targetFile = file || root;

    emit({
      type: 'detected',
      ts: Date.now(),
      diagnostic: undefined,
    });

    const diagnostics = await sensor.scanFile(targetFile);
    if (diagnostics.length === 0) {
      emit({
        type: 'skipped',
        ts: Date.now(),
        details: 'No TODO/FIXME diagnostics found',
      });
      return null;
    }

    for (const diagnostic of diagnostics) {
      emit({
        type: 'diagnosed',
        ts: Date.now(),
        diagnostic,
      });

      const diagnosed = await diagnostician.diagnose(diagnostic);

      // Map message to content for the engine
      const engineInput = {
        ...diagnosed,
        content: diagnosed.message,
      };

      const patch = await engine.generatePatch(engineInput as any);

      if (!patch) {
        emit({
          type: 'skipped',
          ts: Date.now(),
          diagnostic,
          details: 'Engine could not generate a valid patch',
        });
        return null;
      }

      // Map engine patch to types.ts Patch shape
      const typedPatch: Patch = {
        id: diagnostic.id,
        diagnosticId: diagnostic.id,
        file: patch.file,
        startLine: diagnostic.lineStart,
        endLine: diagnostic.lineEnd,
        newText: '',
        confidence: patch.confidence,
        rationale: 'automatically generated',
        verified: false,
        diff: patch.diff,
      };

      emit({
        type: 'proposed',
        ts: Date.now(),
        diagnostic,
        patch: typedPatch,
      });

      if (!dryRun) {
        attemptCount += 1;
        if (attemptCount >= maxAttempts) {
          emit({
            type: 'error',
            ts: Date.now(),
            details: 'Max attempts reached',
          });
          return null;
        }
        emit({
          type: 'applied',
          ts: Date.now(),
          diagnostic,
          patch: typedPatch,
        });
      } else {
        emit({
          type: 'applied',
          ts: Date.now(),
          diagnostic,
          patch: typedPatch,
          details: 'dry-run: patch not applied',
        });
      }

      return typedPatch;
    }

    return null;
  };

  return {
    start(): Promise<void> {
      events.length = 0;
      attemptCount = 0;
      return Promise.resolve();
    },

    stop(): Promise<void> {
      events.length = 0;
      attemptCount = 0;
      return Promise.resolve();
    },

    emit,

    scanAndProceed,
  };
};

export type { HealerDeps, HealerHandle };
