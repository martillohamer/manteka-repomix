export type AgentRole = 'typeAgent' | 'lintAgent' | 'smellAgent';

export interface AgentMessage {
  id: string;
  role: AgentRole;
  timestamp: number;
  sourceFile: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface SwarmProposal {
  id: string;
  agentId: string;
  role: AgentRole;
  file: string;
  patch: {
    file: string;
    diff: string;
    confidence: number;
  };
  rationale: string;
  confidence: number; // 0-1, weighted by agent expertise
  timestamp: number;
}

export interface SwarmAgent {
  id: string;
  role: AgentRole;
  deps: SwarmDeps;
  active: boolean;
}

export interface SwarmDeps {
  root?: string;
  readFile?: (file: string) => Promise<string | null>;
}

export interface SwarmEventBus {
  subscribe: (role: AgentRole, handler: (message: AgentMessage) => void) => void;
  publish: (message: AgentMessage) => void;
  getSubscribers: (role: AgentRole) => number;
}
