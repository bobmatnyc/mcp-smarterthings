import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { environment } from './config/environment.js';
import {
  deviceControlTools,
  deviceQueryTools,
  deviceEventTools,
  sceneTools,
  systemTools,
  managementTools,
  diagnosticTools,
  initializeDeviceControlTools,
  initializeDeviceQueryTools,
  initializeDeviceEventTools,
  initializeSceneTools,
  initializeManagementTools,
  initializeDiagnosticTools,
} from './mcp/tools/index.js';
import { ServiceContainer } from './services/ServiceContainer.js';
import { smartThingsService } from './smartthings/client.js';
import logger from './utils/logger.js';

/**
 * MCP server configuration and initialization.
 *
 * Design Decision: Centralized server configuration with dependency injection
 * Rationale: Single source of truth for all MCP capabilities (tools, resources, prompts).
 * ServiceContainer provides dependency injection for all tools, enabling clean
 * separation between MCP layer and business logic layer.
 *
 * Architecture:
 * - ServiceContainer initialized with SmartThingsService
 * - All tools receive ServiceContainer during initialization
 * - Tools use services (DeviceService, LocationService, SceneService) instead of direct SmartThingsService
 *
 * Extensibility: New tools/resources added by importing, initializing, and registering here.
 */

/**
 * Creates and configures the MCP server.
 *
 * Lifecycle:
 * 1. Initialize ServiceContainer with SmartThingsService
 * 2. Initialize all tool modules with ServiceContainer
 * 3. Configure MCP server with tool handlers
 * 4. Return configured server
 *
 * @returns Configured MCP Server instance
 */
export function createMcpServer(): Server {
  logger.info('Creating MCP server', {
    name: environment.MCP_SERVER_NAME,
    version: environment.MCP_SERVER_VERSION,
  });

  // Initialize ServiceContainer with SmartThingsService dependency
  const serviceContainer = new ServiceContainer(smartThingsService);

  // Initialize all tool modules with ServiceContainer
  // This injects the service dependencies into each tool module
  initializeDeviceControlTools(serviceContainer);
  initializeDeviceQueryTools(serviceContainer);
  initializeDeviceEventTools(serviceContainer);
  initializeSceneTools(serviceContainer);
  initializeManagementTools(serviceContainer);
  initializeDiagnosticTools(serviceContainer);

  logger.info('ServiceContainer initialized and injected into all tool modules');

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
    ...deviceEventTools,
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
