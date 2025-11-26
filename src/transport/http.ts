import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { environment } from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * HTTP transport with Server-Sent Events (SSE) for MCP server.
 *
 * Design Decision: SSE for web-based clients
 * Rationale: HTTP transport enables web-based MCP clients and remote access.
 * SSE provides bidirectional communication over HTTP.
 *
 * Usage: Suitable for web applications and remote clients
 *
 * Performance: SSE maintains persistent connections, efficient for real-time updates
 */
export async function startHttpTransport(server: Server): Promise<void> {
  logger.info('Starting MCP server with HTTP/SSE transport', {
    port: environment.MCP_SERVER_PORT,
  });

  const app = express();

  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: environment.MCP_SERVER_NAME,
      version: environment.MCP_SERVER_VERSION,
    });
  });

  // SSE endpoint for MCP protocol
  app.get('/sse', async (req, res) => {
    logger.info('New SSE connection', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    const transport = new SSEServerTransport('/message', res);
    await server.connect(transport);

    req.on('close', () => {
      logger.info('SSE connection closed');
    });
  });

  // POST endpoint for client messages
  app.post('/message', async (req, res) => {
    logger.debug('Received message', { body: req.body });
    // Message handling is done by the transport
    res.status(202).send();
  });

  // Error handling middleware
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Express error', { error: err.message, stack: err.stack });
      res.status(500).json({ error: 'Internal server error' });
    }
  );

  const httpServer = app.listen(environment.MCP_SERVER_PORT, () => {
    logger.info('HTTP server listening', {
      port: environment.MCP_SERVER_PORT,
      url: `http://localhost:${environment.MCP_SERVER_PORT}`,
    });
  });

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down HTTP server');
    void server.close().finally(() => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
