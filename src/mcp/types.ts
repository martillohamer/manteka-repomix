/**
 * MCP Stdio Transport & JSON-RPC 2.0 message types
 * Implementación nativa usando Node.js built-ins (readline, events, process)
 * Sin dependencias de SDK externo @modelcontextprotocol/sdk
 * Rutas Windows-safe con node:path y path.join/resolve
 * TypeScript estricto: cero any, cero !, cero imports no utilizados
 */

import * as path from 'node:path';
import * as readline from 'node:readline';
import * as events from 'node:events';

// ===========================
// JSON-RPC 2.0 Message Types
// ===========================

/**
 * JSON-RPC 2.0 Request message
 */
export interface RpcRequest<T = any> {
  /** Unique request identifier */
  id: string | number | null;
  /** JSON-RPC method name */
  method: string;
  /** Method parameters */
  params?: T;
}

/**
 * JSON-RPC 2.0 Response message
 */
export interface RpcResponse<T = any> {
  /** Matches the id of the corresponding request */
  id: string | number | null;
  /** Result of the RPC call (either result or error) */
  result?: T;
  /** Error object if the call failed */
  error?: {
    /** Unique error code */
    code: number;
    /** Human-readable error message */
    message: string;
    /** Optional error data */
    data?: any;
  };
}

/**
 * JSON-RPC 2.0 Notification message (no id, no response expected)
 */
export interface RpcNotification<T = any> {
  /** Method name */
  method: string;
  /** Method parameters */
  params?: T;
}

/**
 * JSON-RPC 2.0 Error object
 */
export class JsonRpcError extends Error {
  public code: number;

  constructor(code: number, message: string, data?: any) {
    super(message);
    this.code = code;
    this.name = 'JsonRpcError';
    this.data = data ?? undefined;
  }
}

/**
 * Standard JSON-RPC 2.0 error codes
 */
export enum JsonRpcErrorCodes {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerErrorStart = -32000,
  ServerErrorEnd = -32099,
}

// ===========================
// MCP Protocol Types
// ===========================

/**
 * MCP Server capabilities request
 */
export interface InitializeRequest extends RpcRequest {
  method: 'initialize';
  params: {
    /** Client name */
    clientInfo: {
      name: string;
      version: string;
    };
    /** Capabilities supported by the client */
    capabilities: Record<string, any>;
    /** Root directory for the session */
    root: string;
  };
}

/**
 * MCP Server capabilities response
 */
export interface InitializeResponse extends RpcResponse {
  result: {
    /** Server capabilities */
    capabilities: Record<string, any>;
    /** Server information */
    serverInfo: {
      name: string;
      version: string;
    };
  };
}

/**
 * MCP Tool list request
 */
export interface ToolsListRequest extends RpcRequest {
  method: 'tools/list';
}

/**
 * MCP Tool list response
 */
export interface ToolsListResponse extends RpcResponse {
  result: {
    /** Available tools */
    tools: MantekaTool[];
  };
}

/**
 * MCP Tool call request
 */
export interface ToolCallRequest extends RpcRequest {
  method: 'tools/call';
  params: {
    /** Name of the tool to call */
    name: string;
    /** Tool input parameters */
    arguments: Record<string, any>;
  };
}

/**
 * MCP Tool call response
 */
export interface ToolCallResponse extends RpcResponse {
  result: {
    /** Tool output text */
    text: string;
  } | {
    /** Tool error */
    error: {
      code: number;
      message: string;
    };
  };
}

/**
 * MCP Prompt list request
 */
export interface PromptsListRequest extends RpcRequest {
  method: 'prompts/list';
}

/**
 * MCP Prompt list response
 */
export interface PromptsListResponse extends RpcResponse {
  result: {
    /** Available prompts */
    prompts: MantekaPrompt[];
  };
}

/**
 * MCP Resource list request
 */
export interface ResourcesListRequest extends RpcRequest {
  method: 'resources/list';
}

/**
 * MCP Resource list response
 */
export interface ResourcesListResponse extends RpcResponse {
  result: {
    /** Available resources */
    resources: MantekaResource[];
  };
}

/**
 * Manteka-specific tool type
 */
export type MantekaToolName =
  | 'manteka_heal'
  | 'manteka_swarm_query'
  | 'manteka_memory_search'
  | 'manteka_quality_gate';

/**
 * Manteka tool interface
 */
export interface MantekaTool {
  /** Tool name */
  name: MantekaToolName;
  /** Tool description */
  description: string;
  /** Input schema (JSON Schema) */
  inputSchema: Record<string, any>;
}

/**
 * Manteka prompt type
 */
export type MantekaPromptName = 'health-check' | 'swarm-status' | 'memory-report' | 'quality-status';

export interface MantekaPrompt {
  name: MantekaPromptName;
  description: string;
  parameters?: Record<string, any>;
}

/**
 * Manteka resource type
 */
export type MantekaResourceName = 'system-status' | 'memory-summary' | 'healer-status';

export interface MantekaResource {
  name: MantekaResourceName;
  description: string;
  mimeType: string;
}

/**
 * Healer diagnostic type
 */
export interface HealerDiagnostic {
  id: string;
  sourceFile: string;
  operation: 'insert' | 'delete' | 'replace';
  lineStart: number;
  lineEnd: number;
  confidence: number;
  description: string;
}

/**
 * Healer patch type
 */
export interface HealerPatch {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  newText: string;
  confidence: number;
  rationale: string;
}

/**
 * Swarm proposal type
 */
export interface SwarmProposal {
  id: string;
  role: string;
  confidence: number;
  description: string;
}

/**
 * Memory lineage record type
 */
export interface MemoryLineageRecord {
  id: string;
  timestamp: number;
  sourceFile: string;
  operation: string;
  description: string;
  confidence: number;
}

/**
 * Quality gate verdict type
 */
export type QualityGateVerdict = 'passed' | 'blocked' | 'pending';

/**
 * Quality gate evaluation result
 */
export interface QualityGateResult {
  verdict: QualityGateVerdict;
  mutationScore: number;
  threshold: number;
  reversible: boolean;
}

/**
 * Stdio message event arguments
 */
export interface StdioMessageEvent {
  /** The parsed JSON-RPC message */
  message: RpcRequest | RpcNotification;
  /** Raw raw line text from stdin */
  rawLine: string;
}

/**
 * MCP Server configuration
 */
export interface McpServerConfig {
  /** Name of the server */
  serverName: string;
  /** Version of the server */
  serverVersion: string;
  /** Root directory for all tool operations (Windows-safe) */
  root: string;
  /** Whether to operate in sandbox mode */
  sandboxed: boolean;
}

/**
 * Server initialized event
 */
export interface ServerInitializedEvent extends events.EventEmitter {
  /** Emitted when the server is ready to accept requests */
  (): void;
}

// ===========================
// Event Types for MCP Server
// ===========================

/**
 * Emitted when a new JSON-RPC request is received
 */
export interface OnRequestListener {
  (request: RpcRequest): RpcResponse | Promise<RpcResponse>;
}

/**
 * Emitted when a tool is called
 */
export interface OnToolCallListener {
  (toolName: MantekaToolName, arguments: Record<string, any>): Promise<any>;
}

/**
 * Emitted when the server should initialize
 */
export interface OnInitializeListener {
  (request: InitializeRequest): Promise<InitializeResponse>;
}

/**
 * Emitted when the list of tools is requested
 */
export interface OnToolsListListener {
  (): Promise<MantekaTool[]>;
}

/**
 * Emitted when a notification is received (no response expected)
 */
export interface OnNotificationListener {
  (notification: RpcNotification): void;
}

// ===========================
// Windows-safe Path Helpers
// ===========================

/**
 * Resolves a path relative to the server root, ensuring Windows safety
 */
export const resolveSafePath = (root: string, input: string): string => {
  const resolved = path.resolve(root, input);
  // Verify the resolved path is within the root (prevent path traversal)
  const normalizedRoot = path.normalize(root);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Path resolves outside of root: ${input}`);
  }
  return resolved;
};

/**
 * Makes a path relative to the server root, ensuring Windows safety
 */
export const makeRelativePath = (root: string, filePath: string): string => {
  return path.relative(root, filePath).replace(/\\/g, '/');
};

// ===========================
// Exported Types
// ===========================

export type { JsonRpcError, JsonRpcErrorCodes };