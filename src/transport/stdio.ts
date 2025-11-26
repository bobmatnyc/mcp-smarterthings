import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import logger from '../utils/logger.js';

/**
 * Standard I/O transport for MCP server.
 *
 * Design Decision: Stdio for CLI integration
 * Rationale: Stdio transport enables seamless integration with MCP clients
 * like Claude Desktop via process spawning. Standard for MCP servers.
 *
 * Usage: Suitable for local development and desktop client integration
 */
export async function startStdioTransport(server: Server): Promise<void> {
  logger.info('Starting MCP server with stdio transport');

  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info('MCP server connected via stdio transport');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down stdio transport');
    void server.close().finally(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down stdio transport');
    void server.close().finally(() => process.exit(0));
  });
}
