import { z } from 'zod';
import logger from './logger.js';
import { ERROR_CODES } from '../config/constants.js';

/**
 * Structured error response for MCP tools.
 *
 * Design Decision: Explicit error types for debugging
 * Rationale: Structured errors enable better error handling and user feedback
 * in MCP clients. Includes error codes for programmatic handling.
 */
export interface McpErrorResponse {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError: true;
  code: string;
  details?: Record<string, unknown>;
}

/**
 * Creates an MCP-formatted error response.
 *
 * Usage Examples:
 * - Validation errors: createMcpError(error, ERROR_CODES.VALIDATION_ERROR)
 * - API errors: createMcpError(error, ERROR_CODES.SMARTTHINGS_API_ERROR)
 * - Not found: createMcpError(error, ERROR_CODES.DEVICE_NOT_FOUND)
 *
 * @param error Original error
 * @param code Error classification code
 * @returns Structured error response
 */
export function createMcpError(error: unknown, code: string): McpErrorResponse {
  let message = 'An unknown error occurred';
  let details: Record<string, unknown> | undefined;

  if (error instanceof z.ZodError) {
    message = 'Validation error';
    details = {
      validationErrors: error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      })),
    };
  } else if (error instanceof Error) {
    message = error.message;
    if (error.stack) {
      details = { stack: error.stack };
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  logger.error('MCP Error', { code, message, details });

  return {
    content: [
      {
        type: 'text',
        text: `Error (${code}): ${message}`,
      },
    ],
    isError: true,
    code,
    details,
  };
}

/**
 * Type guard to check if a value is an MCP error response.
 */
export function isMcpError(value: unknown): value is McpErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isError' in value &&
    value.isError === true &&
    'code' in value &&
    'content' in value
  );
}

/**
 * Classifies errors by type for appropriate handling.
 *
 * Error Classification:
 * - Validation errors: Input schema violations
 * - API errors: SmartThings API failures
 * - Network errors: Connectivity issues
 * - Authentication errors: Invalid or expired tokens
 */
export function classifyError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return ERROR_CODES.VALIDATION_ERROR;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('not found')) {
      return ERROR_CODES.DEVICE_NOT_FOUND;
    }
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return ERROR_CODES.AUTHENTICATION_ERROR;
    }
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset')
    ) {
      return ERROR_CODES.NETWORK_ERROR;
    }
    if (message.includes('capability')) {
      return ERROR_CODES.CAPABILITY_NOT_SUPPORTED;
    }
  }

  return ERROR_CODES.UNKNOWN_ERROR;
}
