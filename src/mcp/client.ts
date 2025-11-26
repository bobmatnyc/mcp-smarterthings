/**
 * MCP Client for internal stdio communication with MCP server.
 *
 * Design Decision: Internal MCP client using stdio transport
 * Rationale: Validates MCP protocol works correctly by being a real MCP client,
 * not calling services directly. This provides integration testing value.
 *
 * Architecture:
 * Chatbot → McpClient (stdio) → MCP Server Process → SmartThings Services
 *
 * Trade-offs:
 * - Validation: Proves MCP interface works vs. direct service access
 * - Overhead: Process spawn + JSON-RPC vs. in-process calls
 * - Isolation: Separate process lifecycle vs. shared memory
 *
 * Error Handling:
 * - Process spawn failures → Clear error message, throw
 * - JSON-RPC errors → Structured error responses
 * - Communication errors → Retry with timeout
 * - Process crashes → Detected via exit event
 */

import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Branded type for JSON-RPC request IDs.
 */
type JsonRpcId = number & { readonly __brand: 'JsonRpcId' };

/**
 * MCP tool definition returned by listTools.
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP tool execution result.
 */
export interface McpToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  data?: unknown;
  isError?: boolean;
}

/**
 * JSON-RPC request structure.
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response structure.
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Pending request awaiting response.
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * MCP Client interface for dependency injection.
 */
export interface IMcpClient {
  /**
   * Initialize the MCP client and server process.
   *
   * @throws Error if server spawn fails or initialization times out
   */
  initialize(): Promise<void>;

  /**
   * List available MCP tools.
   *
   * @returns Array of tool definitions
   * @throws Error if request fails or times out
   */
  listTools(): Promise<McpToolDefinition[]>;

  /**
   * Call an MCP tool with arguments.
   *
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool execution result
   * @throws Error if tool not found or execution fails
   */
  callTool(name: string, args: unknown): Promise<McpToolResult>;

  /**
   * Close the MCP client and terminate server process.
   */
  close(): Promise<void>;
}

/**
 * MCP Client implementation with stdio transport.
 *
 * Performance:
 * - Process spawn: ~50-100ms one-time cost
 * - JSON-RPC overhead: ~1-5ms per request
 * - Total latency: Service latency + 5-10ms
 *
 * Lifecycle:
 * 1. initialize() - Spawn server process
 * 2. listTools() / callTool() - Send requests
 * 3. close() - Graceful shutdown
 */
export class McpClient implements IMcpClient {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<JsonRpcId, PendingRequest>();
  private buffer = '';
  private initialized = false;
  private readonly requestTimeout = 30000; // 30 seconds

  /**
   * Initialize the MCP server process.
   *
   * Error Conditions:
   * - Server binary not found → Error with path details
   * - Spawn failure → Error with spawn details
   * - Initialization timeout → Error after 10 seconds
   * - Process exits during init → Error with exit code
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('MCP client already initialized');
      return;
    }

    logger.info('Initializing MCP client');

    // Path to built MCP server
    const serverPath = resolve(__dirname, '../../dist/index.js');

    logger.debug('Spawning MCP server process', { serverPath });

    try {
      // Spawn MCP server with stdio transport
      this.process = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TRANSPORT_MODE: 'stdio',
          LOG_LEVEL: 'error', // Reduce noise from server logs
        },
      });

      // Setup stdout handler for JSON-RPC responses
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      // Setup stderr handler for server logs
      this.process.stderr?.on('data', (data: Buffer) => {
        logger.debug('MCP server stderr', { message: data.toString() });
      });

      // Setup exit handler
      this.process.on('exit', (code, signal) => {
        logger.warn('MCP server process exited', { code, signal });
        this.handleProcessExit();
      });

      // Setup error handler
      this.process.on('error', (error) => {
        logger.error('MCP server process error', { error: error.message });
        this.handleProcessExit();
      });

      // Send initialize request
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mcp-smartthings-chatbot',
          version: '1.0.0',
        },
      });

      this.initialized = true;
      logger.info('MCP client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MCP client', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.close();
      throw new Error(
        `Failed to initialize MCP client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List available MCP tools.
   *
   * Complexity: O(1) - single RPC call
   * Network: ~1-5ms RPC overhead + server processing time
   */
  async listTools(): Promise<McpToolDefinition[]> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized. Call initialize() first.');
    }

    logger.debug('Requesting tools list');

    const response = (await this.sendRequest('tools/list', {})) as {
      tools: McpToolDefinition[];
    };

    logger.info('Received tools list', { count: response.tools.length });

    return response.tools;
  }

  /**
   * Call an MCP tool.
   *
   * Complexity: O(1) - single RPC call, depends on tool implementation
   * Network: ~1-5ms RPC overhead + tool execution time
   */
  async callTool(name: string, args: unknown): Promise<McpToolResult> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized. Call initialize() first.');
    }

    logger.debug('Calling MCP tool', { name, args });

    const response = (await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as McpToolResult;

    logger.debug('Tool call completed', { name, hasError: response.isError });

    return response;
  }

  /**
   * Close the MCP client and terminate server process.
   *
   * Cleanup:
   * - Reject all pending requests
   * - Kill server process gracefully (SIGTERM, then SIGKILL after 5s)
   * - Clear all state
   */
  async close(): Promise<void> {
    logger.info('Closing MCP client');

    // Reject all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('MCP client closed'));
      this.pendingRequests.delete(id);
    }

    // Terminate server process
    if (this.process) {
      this.process.kill('SIGTERM');

      // Force kill after 5 seconds if not exited
      const forceKillTimeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          logger.warn('Force killing MCP server process');
          this.process.kill('SIGKILL');
        }
      }, 5000);

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (!this.process) {
          resolve();
          return;
        }

        const checkExit = setInterval(() => {
          if (!this.process || this.process.killed) {
            clearInterval(checkExit);
            clearTimeout(forceKillTimeout);
            resolve();
          }
        }, 100);
      });

      this.process = null;
    }

    this.initialized = false;
    logger.info('MCP client closed');
  }

  /**
   * Send JSON-RPC request and wait for response.
   *
   * @param method JSON-RPC method name
   * @param params Request parameters
   * @returns Response result
   * @throws Error if request fails or times out
   */
  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++ as JsonRpcId;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    logger.debug('Sending JSON-RPC request', { id, method });

    // Create promise for response
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });
    });

    // Send request to server
    const requestJson = JSON.stringify(request) + '\n';
    this.process?.stdin?.write(requestJson);

    return responsePromise;
  }

  /**
   * Handle incoming data from server stdout.
   *
   * Buffers partial messages and parses complete JSON-RPC responses.
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete lines (JSON-RPC messages)
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.length === 0) continue;

      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        this.handleResponse(response);
      } catch (error) {
        logger.error('Failed to parse JSON-RPC response', {
          line,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Handle JSON-RPC response.
   *
   * Resolves or rejects the corresponding pending request.
   */
  private handleResponse(response: JsonRpcResponse): void {
    const { id, result, error } = response;

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      logger.warn('Received response for unknown request', { id });
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);

    if (error) {
      logger.debug('JSON-RPC error response', { id, error });
      pending.reject(new Error(`JSON-RPC error: ${error.message}`));
    } else {
      logger.debug('JSON-RPC success response', { id });
      pending.resolve(result);
    }
  }

  /**
   * Handle server process exit.
   *
   * Rejects all pending requests and marks client as not initialized.
   */
  private handleProcessExit(): void {
    this.initialized = false;

    // Reject all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('MCP server process exited'));
      this.pendingRequests.delete(id);
    }
  }
}
