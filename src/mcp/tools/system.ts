import { z } from 'zod';
import { createMcpResponse } from '../../types/mcp.js';
import { createMcpError, classifyError } from '../../utils/error-handler.js';
import logger from '../../utils/logger.js';
import type { McpToolInput } from '../../types/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * System tools for MCP server.
 *
 * These tools provide system-level control like logging configuration.
 */

// Input schemas
const toggleDebugSchema = z.object({
  enabled: z.boolean().describe('Enable (true) or disable (false) debug logging'),
});

/**
 * Toggle debug logging.
 *
 * MCP Tool: toggle_debug
 * Input: { enabled: boolean }
 * Output: Confirmation of logging level change
 *
 * When enabled:
 * - Sets logger level to 'debug'
 * - Shows all MCP operations, API calls, and internal state
 *
 * When disabled:
 * - Sets logger level to 'error'
 * - Only shows errors (silent mode)
 *
 * Use cases:
 * - User says "turn on debug" → { enabled: true }
 * - User says "turn off logging" → { enabled: false }
 * - User says "show me what's happening" → { enabled: true }
 */
export async function handleToggleDebug(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { enabled } = toggleDebugSchema.parse(input);

    const previousLevel = logger.level;
    const newLevel = enabled ? 'debug' : 'error';

    logger.level = newLevel;

    const message = enabled
      ? `Debug logging enabled. You'll now see detailed information about all operations.`
      : `Debug logging disabled. Only errors will be shown.`;

    logger.info('Logging level changed', {
      previous: previousLevel,
      new: newLevel,
      enabled,
    });

    return createMcpResponse(message, {
      previousLevel,
      newLevel,
      enabled,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * System tools export.
 */
export const systemTools = {
  toggle_debug: {
    description:
      'Enable or disable debug logging. When enabled, shows detailed information about all operations. When disabled, only errors are shown (silent mode).',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'true to enable debug logging, false to disable',
        },
      },
      required: ['enabled'],
    },
    handler: handleToggleDebug,
  },
};
