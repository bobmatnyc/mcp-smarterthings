import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { environment } from './config/environment.js';
import {
  deviceControlTools,
  deviceQueryTools,
  sceneTools,
  systemTools,
  managementTools,
  diagnosticTools,
} from './mcp/tools/index.js';
import logger from './utils/logger.js';

/**
 * MCP server configuration and initialization.
 *
 * Design Decision: Centralized server configuration
 * Rationale: Single source of truth for all MCP capabilities (tools, resources, prompts).
 * Simplifies registration and provides clear overview of available features.
 *
 * Extensibility: New tools/resources added by importing and registering here.
 */

/**
 * Creates and configures the MCP server.
 *
 * @returns Configured MCP Server instance
 */
export function createMcpServer(): Server {
  logger.info('Creating MCP server', {
    name: environment.MCP_SERVER_NAME,
    version: environment.MCP_SERVER_VERSION,
  });

  const server = new Server(
    {
      name: environment.MCP_SERVER_NAME,
      version: environment.MCP_SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Combine all tools
  const allTools = {
    ...deviceControlTools,
    ...deviceQueryTools,
    ...sceneTools,
    ...systemTools,
    ...managementTools,
    ...diagnosticTools,
  };

  /**
   * List available tools handler.
   *
   * Returns metadata for all registered MCP tools.
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('ListTools request received');

    const tools = Object.entries(allTools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    logger.info('Returning tools list', { count: tools.length });

    return { tools };
  });

  /**
   * Call tool handler.
   *
   * Executes the requested tool with provided arguments.
   *
   * Error Handling:
   * - Tool not found: Returns error response
   * - Validation errors: Caught by tool handlers
   * - Execution errors: Caught by tool handlers
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info('CallTool request received', { tool: name });

    const tool = allTools[name as keyof typeof allTools];

    if (!tool) {
      logger.error('Tool not found', { tool: name });
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await tool.handler(args ?? {});

    logger.info('Tool execution completed', { tool: name, success: !('isError' in result) });

    return result;
  });

  logger.info('MCP server configured', {
    toolCount: Object.keys(allTools).length,
    tools: Object.keys(allTools),
  });

  return server;
}
