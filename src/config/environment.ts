import { z } from 'zod';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

/**
 * Get package version from package.json (single source of truth).
 *
 * Design Decision: Dynamic version reading
 * Rationale: Eliminates version duplication between package.json and environment.ts.
 * Version is read once during module initialization, cached for performance.
 *
 * Trade-offs:
 * - Consistency: Single source of truth vs. potential runtime errors
 * - Performance: File read overhead during startup (negligible ~1ms)
 */
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      version: string;
    };
    return packageJson.version;
  } catch {
    console.warn('Failed to read package.json version, using fallback');
    return '0.0.0-unknown';
  }
}

/**
 * Environment variable schema with validation rules.
 *
 * Design Decision: Zod for runtime validation
 * Rationale: Ensures type safety for environment variables at runtime,
 * catching configuration errors before application starts.
 *
 * Trade-offs:
 * - Performance: Minimal overhead during startup vs. runtime failures
 * - Strictness: Fail-fast approach vs. permissive defaults
 */
const environmentSchema = z.object({
  // SmartThings Configuration
  SMARTTHINGS_PAT: z.string().min(1, 'SmartThings Personal Access Token is required'),

  // MCP Server Configuration
  MCP_SERVER_NAME: z.string().default('smartthings-mcp'),
  MCP_SERVER_VERSION: z.string().default(getPackageVersion()),
  MCP_SERVER_PORT: z.coerce.number().int().positive().default(3000),

  // Application Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Transport Configuration
  TRANSPORT_MODE: z.enum(['stdio', 'http']).default('stdio'),
});

/**
 * Validated environment configuration.
 *
 * Error Handling:
 * - ZodError: Thrown if required variables are missing or invalid
 * - Provides detailed field-level validation errors
 * - Fails fast during application startup
 */
export type Environment = z.infer<typeof environmentSchema>;

let config: Environment;

try {
  config = environmentSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    // NOTE: console.error is acceptable here (writes to stderr)
    // This runs during module init before logger is available
    console.error('Environment validation failed:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export const environment = config;
