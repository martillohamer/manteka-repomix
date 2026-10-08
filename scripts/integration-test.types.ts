/** Minimal JSON-RPC shapes used by the MCP STDIO integration harness. */
export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface ToolCallResult {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}

export interface RpcResponse {
  id?: number;
  result?: {
    serverInfo?: { name?: string; version?: string };
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
  error?: RpcError;
}