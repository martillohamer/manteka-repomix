export interface LineageRecord {
  id: string;
  timestamp: number;
  sourceFile: string;
  operation: 'insert' | 'update' | 'delete' | 'transform';
  description: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryDeps {
  root?: string;
  readFile?: (file: string) => Promise<string | null>;
  writeFile?: (file: string, content: string) => Promise<void>;
}
