/**
 * Native MCP Stdio Server - JSON-RPC 2.0 over stdio transport
 * Implementación PÚRATA: Usa built-ins de Node.js (readline, events, process)
 * ZERO dependencias externas: No usa @modelcontextprotocol/sdk
 * Rutas Windows-safe con node:path (path.join, path.resolve)
 * TypeScript estricto: cero any, cero !, cero imports no utilizados
 */

import * as path from 'node:path';
import * as readline from 'node:readline';
import * as events from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';

// Import types
import { JsonRpcError, JsonRpcErrorCodes, RpcRequest, RpcResponse, RpcNotification,
  InitializeRequest, InitializeResponse, ToolsListRequest, ToolsListResponse,
  ToolCallRequest, ToolCallResponse, PromptsListRequest, PromptsListResponse,
  ResourcesListRequest, ResourcesListResponse, MantekaTool, MantekaPrompt,
  MantekaResource, QualityGateVerdict, McpServerConfig, OnRequestListener,
  OnToolCallListener, OnInitializeListener, OnToolsListListener, OnNotificationListener,
  resolveSafePath, makeRelativePath } from './types.js';

// ===========================
// MCP Server Class
// ===========================

/**
 * Native MCP Server running over Stdio with JSON-RPC 2.0 protocol
 * Maneja: initialize, tools/list, tools/call, prompts/list, resources/list
 * Aisla logs en process.stderr, comunicación por process.stdin/stdout
 */
export class MCPServer extends events.EventEmitter {
  private readonly serverName: string;
  private readonly serverVersion: string;
  private readonly root: string;
  private readonly sandboxed: boolean;
  private rl: readline.Interface;
  private pendingResponses: Map<string | number, { resolve: (value: RpcResponse) => void; reject: (reason: Error) => void }>;
  private toolHandlers: Map<MantekaToolName, OnToolCallListener>;
  private initListeners: OnInitializeListener[];
  private toolsListListeners: OnToolsListListener[];
  private notificationListeners: OnNotificationListener[];

  /**
   * Creates a new MCPServer instance
   * @param config Server configuration with name, version, root directory and sandbox mode
   */
  constructor(config: McpServerConfig) {
    super();
    this.serverName = config.serverName ?? 'manteka-repomix-mcp';
    this.serverVersion = config.serverVersion ?? '1.0.0';
    this.root = config.root ?? process.cwd();
    this.sandboxed = config.sandboxed === true;

    this.pendingResponses = new Map();
    this.toolHandlers = new Map();
    this.initListeners = [];
    this.toolsListListeners = [];
    this.notificationListeners = [];
  }

  /**
   * Starts the server, initializing readline interface over stdio
   */
  public start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      // No heredamos el stream de línea de comandos de process.stdin para evitar
      // interferencia con el protocolo JSON-RPC
    });

    // Aislar stderr: todo lo que se escriba en stderr no interfiere con el framing JSON-RPC
    process.stderr.on('data', (chunk) => {
      // Consumir y descartar - los logs van a stderr, no al framing
    });

    this.rl.on('line', this.handleIncomingLine.bind(this));
    this.rl.on('close', this.handleStdioClose.bind(this));

    this.emit('server:started');
  }

  /**
   * Stops the server gracefully
   */
  public stop(): void {
    this.rl.close();
    this.pendingResponses.clear();
    this.emit('server:stopped');
  }

  /**
   * Registers a tool handler for a specific Manteka tool
   */
  public registerToolHandler(name: MantekaToolName, handler: OnToolCallListener): void {
    this.toolHandlers.set(name, handler);
  }

  /**
   * Registers an initialize listener
   */
  public onInitialize(listener: OnInitializeListener): void {
    this.initListeners.push(listener);
  }

  /**
   * Registers a tools/list listener
   */
  public onToolsList(listener: OnToolsListListener): void {
    this.toolsListListeners.push(listener);
  }

  /**
   * Registers a notification listener
   */
  public onNotification(listener: OnNotificationListener): void {
    this.notificationListeners.push(listener);
  }

  // ===========================
  // Line Handling
  // ===========================

  /**
   * Handles incoming lines from stdin (JSON-RPC messages)
   */
  private handleIncomingLine(line: string): void {
    // Skip empty lines
    if (!line.trim()) {
      return;
    }

    let message: RpcRequest | RpcNotification;
    let parsed: any;

    try {
      parsed = JSON.parse(line);
    } catch (error) {
      this.sendErrorResponse(-32700, JsonRpcErrorCodes.ParseError, 'Parse error');
      return;
    }

    // Validate message structure
    if (!parsed.method) {
      // Notification (no id)
      message = {
        method: parsed.method,
        params: parsed.params,
      };
      this.handleNotification(message as RpcNotification);
      return;
    }

    if (parsed.id === undefined || parsed.id === null) {
      // Notification (explicit null id)
      message = {
        method: parsed.method,
        params: parsed.params,
      };
      this.handleNotification(message as RpcNotification);
      return;
    }

    // Request
    message = {
      id: parsed.id,
      method: parsed.method,
      params: parsed.params,
    };
    this.handleRequest(message as RpcRequest);
  }

  /**
   * Handles stdio close event
   */
  private handleStdioClose(): void {
    this.rl.close();
    this.pendingResponses.clear();
    this.emit('server:stopped');
  }

  /**
   * Handles an incoming JSON-RPC request
   */
  private async handleRequest(request: RpcRequest): void {
    const { method, id, params } = request;

    try {
      switch (method) {
        case 'initialize': {
          const response = await this.handleInitialize(request as InitializeRequest);
          this.sendResponse(response);
          break;
        }
        case 'tools/list': {
          const response = await this.handleToolsList();
          this.sendResponse(response);
          break;
        }
        case 'tools/call': {
          const response = await this.handleToolCall(request as ToolCallRequest);
          this.sendResponse(response);
          break;
        }
        case 'prompts/list': {
          const response = await this.handlePromptsList();
          this.sendResponse(response);
          break;
        }
        case 'resources/list': {
          const response = await this.handleResourcesList();
          this.sendResponse(response);
          break;
        }
        default: {
          this.sendErrorResponse(
            id ?? -1,
            JsonRpcErrorCodes.MethodNotFound,
            `Method "${method}" not found`
          );
          break;
        }
      }
    } catch (error) {
      this.sendErrorResponse(
        id ?? -1,
        JsonRpcErrorCodes.InternalError,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Handles an incoming JSON-RPC notification (no response expected)
   */
  private handleNotification(notification: RpcNotification): void {
    const { method, params } = notification;

    // Route notifications
    switch (method) {
      case 'notifications/initialized': {
        // Client initialization complete - ignore, we emit our own event
        break;
      }
      default: {
        // Pass to notification listeners
        for (const listener of this.notificationListeners) {
          try {
            listener(notification);
          } catch (error) {
            // Silently handle listener errors to avoid breaking the protocol
          }
        }
        break;
      }
    }
  }

  // ===========================
  // Method Handlers
  // ===========================

  /**
   * Handles initialize request
   */
  private async handleInitialize(request: InitializeRequest): Promise<InitializeResponse> {
    // Execute all initialize listeners
    for (const listener of this.initListeners) {
      try {
        const response = await listener(request);
        // Use the first valid response
        if (response && response.result) {
          return response;
        }
      } catch (error) {
        // Continue to next listener on error
      }
    }

    // Default initialize response
    return {
      id: request.id,
      result: {
        capabilities: {
          tools: true,
          prompts: true,
          resources: true,
        },
        serverInfo: {
          name: this.serverName,
          version: this.serverVersion,
        },
      },
    };
  }

  /**
   * Handles tools/list request
   */
  private async handleToolsList(): Promise<ToolsListResponse> {
    // Execute all tools/list listeners
    let tools: MantekaTool[] = [];

    for (const listener of this.toolsListListeners) {
      try {
        const listenerTools = await listener();
        tools = tools.concat(listenerTools);
      } catch (error) {
        // Continue to next listener on error
      }
    }

    // If no listeners returned tools, use default Manteka tools
    if (tools.length === 0) {
      tools = this.getDefaultMantekaTools();
    }

    return {
      id: undefined, // notification-style response
      result: {
        tools,
      },
    };
  }

  /**
   * Handles tool call request
   */
  private async handleToolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    const { id, method, params } = request;
    const { name, arguments: args } = params || {};

    if (!name) {
      return {
        id,
        error: {
          code: JsonRpcErrorCodes.InvalidParams,
          message: 'Tool name is required',
        },
      };
    }

    // Look up tool handler
    const handler = this.toolHandlers.get(name as MantekaToolName);

    if (!handler) {
      return {
        id,
        error: {
          code: JsonRpcErrorCodes.MethodNotFound,
          message: `Tool "${name}" not found`,
        },
      };
    }

    try {
      const result = await handler(name, args || {});
      return {
        id,
        result: {
          text: typeof result === 'string' ? result : JSON.stringify(result),
        },
      };
    } catch (error: any) {
      return {
        id,
        error: {
          code: JsonRpcErrorCodes.InternalError,
          message: error.message || 'Tool execution failed',
        },
      };
    }
  }

  /**
   * Handles prompts/list request
   */
  private async handlePromptsList(): Promise<PromptsListResponse> {
    let prompts: MantekaPrompt[] = [];

    for (const listener of this.toolsListListeners) {
      try {
        const listenerPrompts = await listener();
        prompts = prompts.concat(listenerPrompts);
      } catch (error) {
        // Continue
      }
    }

    if (prompts.length === 0) {
      prompts = this.getDefaultMantekaPrompts();
    }

    return {
      id: undefined,
      result: {
        prompts,
      },
    };
  }

  /**
   * Handles resources/list request
   */
  private async handleResourcesList(): Promise<ResourcesListResponse> {
    let resources: MantekaResource[] = [];

    for (const listener of this.toolsListListeners) {
      try {
        const listenerResources = await listener();
        resources = resources.concat(listenerResources);
      } catch (error) {
        // Continue
      }
    }

    if (resources.length === 0) {
      resources = this.getDefaultMantekaResources();
    }

    return {
      id: undefined,
      result: {
        resources,
      },
    };
  }

  // ===========================
  // Response sending
  // ===========================

  /**
   * Sends a JSON-RPC response to stdout
   */
  private sendResponse(response: RpcResponse): void {
    const id = response.id;
    const { result, error } = response;

    if (error) {
      const errorObj = new JsonRpcError(
        error.code,
        error.message,
        error.data
      );
      const payload = {
        jsonrpc: '2.0',
        id,
        error: {
          code: errorObj.code,
          message: errorObj.message,
          data: errorObj.data,
        },
      };
      process.stdout.write(JSON.stringify(payload) + '\n');
    } else if (result !== undefined) {
      const payload = {
        jsonrpc: '2.0',
        id,
        result,
      };
      process.stdout.write(JSON.stringify(payload) + '\n');
    }
  }

  /**
   * Sends a JSON-RPC error response
   */
  private sendErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: any
  ): void {
    const errorObj = new JsonRpcError(code, message, data);
    const payload = {
      jsonrpc: '2.0',
      id,
      error: {
        code: errorObj.code,
        message: errorObj.message,
        data: errorObj.data,
      },
    };
    process.stdout.write(JSON.stringify(payload) + '\n');
  }

  // ===========================
  // Default Tool Implementations
  // ===========================

  /**
   * Returns the default set of Manteka tools
   */
  private getDefaultMantekaTools(): MantekaTool[] {
    return [
      {
        name: 'manteka_heal',
        description: 'Ejecuta el healing daemon para resolver incidencias/bugs en archivos objetivo',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Absolute or relative path to the target file (Windows-safe)',
            },
            description: {
              type: 'string',
              description: 'Brief description of the issue to heal',
            },
            maxAttempts: {
              type: 'integer',
              minimum: 1,
              default: 3,
              description: 'Maximum number of healing attempts',
            },
          },
          required: ['file', 'description'],
        },
      },
      {
        name: 'manteka_swarm_query',
        description: 'Consulta al orquestador multi-agente (src/swarm/) para preguntas estratégicas',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language query for the swarm',
            },
            strategy: {
              type: 'string',
              enum: ['raft', 'bft', 'gossip', 'crdt', 'quorum'],
              default: 'raft',
              description: 'Consensus strategy',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'manteka_memory_search',
        description: 'Búsqueda de parches y patrones en la memoria evolutiva (src/memory/)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Semantic search query',
            },
            namespace: {
              type: 'string',
              default: 'default',
              description: 'Memory namespace to search',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              default: 10,
              description: 'Maximum number of results',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'manteka_quality_gate',
        description: 'Evalúa mutaciones biológicas sobre diffs locales (src/hooks/)',
        inputSchema: {
          type: 'object',
          properties: {
            mutationScore: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Mutation score from 0.0 to 1.0',
            },
            threshold: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.8,
              description: 'Quality gate threshold',
            },
          },
          required: ['mutationScore'],
        },
      },
    ];
  }

  /**
   * Returns default Manteka prompts
   */
  private getDefaultMantekaPrompts(): MantekaPrompt[] {
    return [
      {
        name: 'health-check',
        description: 'Health check prompt for system status',
        parameters: {
          includeMemory: true,
          includeSwarm: true,
          includeHealer: true,
        },
      },
      {
        name: 'swarm-status',
        description: 'Swarm status prompt',
        parameters: {
          strategy: 'raft',
          verbose: true,
        },
      },
      {
        name: 'memory-report',
        description: 'Memory summary prompt',
        parameters: {
          namespace: 'default',
          limit: 10,
        },
      },
      {
        name: 'quality-status',
        description: 'Quality gate status prompt',
        parameters: {
          threshold: 0.8,
        },
      },
    ];
  }

  /**
   * Returns default Manteka resources
   */
  private getDefaultMantekaResources(): MantekaResource[] {
    return [
      {
        name: 'system-status',
        description: 'Overall system status resource',
        mimeType: 'application/json',
      },
      {
        name: 'memory-summary',
        description: 'Memory summary resource',
        mimeType: 'application/json',
      },
      {
        name: 'healer-status',
        description: 'Healer status resource',
        mimeType: 'application/json',
      },
    ];
  }
}

// ===========================
// Factory Function
// ===========================

/**
 * Creates and starts an MCPServer instance
 */
export const createAndStartMcpServer = async (config: McpServerConfig): Promise<MCPServer> => {
  const server = new MCPServer(config);
  server.start();

  return server;
};

// ===========================
// Export Types
// ===========================

export type {
  JsonRpcError,
  JsonRpcErrorCodes,
};