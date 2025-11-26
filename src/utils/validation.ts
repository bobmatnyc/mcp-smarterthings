import { z } from 'zod';

/**
 * Common validation schemas for MCP tools.
 *
 * Design Decision: Centralized validation schemas
 * Rationale: DRY principle - reusable schemas across multiple tools
 * reduces duplication and ensures consistency.
 */

/**
 * Device ID validation schema.
 * SmartThings device IDs are UUID v4 format.
 */
export const deviceIdSchema = z
  .string()
  .uuid('Device ID must be a valid UUID')
  .describe('SmartThings device UUID');

/**
 * Device name/label validation schema.
 */
export const deviceNameSchema = z
  .string()
  .min(1, 'Device name cannot be empty')
  .max(100, 'Device name too long')
  .describe('Device name or label');

/**
 * Capability name validation schema.
 */
export const capabilitySchema = z
  .string()
  .min(1, 'Capability name cannot be empty')
  .describe('SmartThings capability name (e.g., "switch", "switchLevel")');

/**
 * Command name validation schema.
 */
export const commandSchema = z
  .string()
  .min(1, 'Command name cannot be empty')
  .describe('Device command name (e.g., "on", "off", "setLevel")');

/**
 * Command arguments validation schema.
 */
export const commandArgsSchema = z
  .array(z.unknown())
  .optional()
  .describe('Optional command arguments');

/**
 * Generic response validation schema.
 */
export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

/**
 * Validates input against a Zod schema and returns typed result.
 *
 * @param schema Zod schema to validate against
 * @param input Input data to validate
 * @returns Validated and typed data
 * @throws ZodError if validation fails
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  return schema.parse(input);
}
