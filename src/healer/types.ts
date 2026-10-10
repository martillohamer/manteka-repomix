export type DiagnosticKind = 'lint' | 'type' | 'todo' | 'fixme' | 'smell';

export interface Diagnostic {
  id: string;
  kind: DiagnosticKind;
  file: string;
  lineStart: number;
  lineEnd: number;
  message: string;
  code?: string;
  severity: 'info' | 'warn' | 'error';
  context?: string;
  content?: string;
}

export interface Patch {
  id: string;
  diagnosticId: string;
  file: string;
  startLine: number;
  endLine: number;
  newText: string;
  confidence: number; // 0-1
  rationale: string;
  verified: boolean;
  diff: string;
}

export type HealerEventType = 'detected' | 'diagnosed' | 'proposed' | 'applied' | 'reverted' | 'skipped' | 'error';

export interface HealerEvent {
  type: HealerEventType;
  ts: number;
  diagnostic?: Diagnostic;
  patch?: Patch;
  details?: string;
}

export interface HealerDeps {
  root?: string;
  dryRun?: boolean;
  maxAttempts?: number;
  readFile?: (file: string) => Promise<string | null>;
}

export interface HealerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  emit(event: HealerEvent): void;
  scanAndProceed(file?: string): Promise<Patch | null>;
}
