#!/usr/bin/env node

/**
 * MCP SmartThings Server entry point.
 *
 * Initializes the MCP server with appropriate transport based on configuration.
 */

import { environment } from './config/environment.js';
import { createMcpServer } from './server.js';
import { startStdioTransport } from './transport/stdio.js';
import { startHttpTransport } from './transport/http.js';
import logger from './utils/logger.js';

/**
 * Main application entry point.
 *
 * Error Handling:
 * - Configuration errors: Caught during environment validation
 * - Transport errors: Logged and process exits with error code
 * - SmartThings client errors: Logged, retried where appropriate
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting MCP SmartThings Server', {
      name: environment.MCP_SERVER_NAME,
      version: environment.MCP_SERVER_VERSION,
      transport: environment.TRANSPORT_MODE,
      nodeEnv: environment.NODE_ENV,
    });

    // Create MCP server
    const server = createMcpServer();

    // Start appropriate transport
    if (environment.TRANSPORT_MODE === 'stdio') {
      await startStdioTransport(server);
    } else if (environment.TRANSPORT_MODE === 'http') {
      await startHttpTransport(server);
    } else {
      throw new Error(`Unknown transport mode: ${environment.TRANSPORT_MODE as string}`);
    }

    logger.info('MCP SmartThings Server started successfully');
  } catch (error) {
    logger.error('Failed to start MCP server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise,
  });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Start the server
main().catch((error) => {
  logger.error('Fatal error in main', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
