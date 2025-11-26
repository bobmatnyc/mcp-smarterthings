/**
 * MCP-specific type definitions.
 *
 * Types for Model Context Protocol tools, resources, and responses.
 */

/**
 * MCP tool success response.
 */
export interface McpSuccessResponse<T = unknown> {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  data?: T;
}

/**
 * MCP tool input arguments.
 */
export interface McpToolInput {
  [key: string]: unknown;
}

/**
 * MCP resource content.
 */
export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/**
 * MCP prompt template.
 */
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * Creates a successful text response for MCP tools.
 *
 * @param text Response text
 * @param data Optional structured data
 * @returns MCP-formatted success response
 */
export function createMcpResponse<T = unknown>(text: string, data?: T): McpSuccessResponse<T> {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    data,
  };
}
