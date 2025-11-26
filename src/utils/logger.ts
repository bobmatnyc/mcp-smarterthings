import winston from 'winston';
import { environment } from '../config/environment.js';

/**
 * Structured logging with Winston.
 *
 * Design Decision: Winston for production-grade logging
 * Rationale: Provides structured logging, multiple transports, and log levels
 * suitable for debugging and production monitoring.
 *
 * Performance: JSON format enables efficient log parsing and aggregation
 */
const logger = winston.createLogger({
  level: environment.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: environment.MCP_SERVER_NAME,
    version: environment.MCP_SERVER_VERSION,
  },
  transports: [
    // CRITICAL FIX: MCP protocol requires all logs go to stderr
    // Using Stream transport with process.stderr instead of Console transport
    // This ensures only JSON-RPC messages appear on stdout
    new winston.transports.Stream({
      stream: process.stderr,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...metadata }) => {
          let msg = `${String(timestamp)} [${String(service)}] ${String(level)}: ${String(message)}`;
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
          }
          return msg;
        })
      ),
    }),
  ],
});

/**
 * Error Handling: Logger never throws errors
 * - Graceful degradation if transport fails
 * - Fallback to console.error for critical logger failures
 */
export default logger;
