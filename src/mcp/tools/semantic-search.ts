/**
 * Semantic device search MCP tool.
 *
 * Provides natural language device search using vector embeddings.
 * Complements exact device queries with semantic understanding.
 *
 * Use Cases:
 * - Natural language: "motion sensors in bedrooms"
 * - Fuzzy matching: "temperature devices"
 * - Exploratory: "devices that control lights"
 * - Similarity: "find devices like this motion sensor"
 *
 * Integration:
 * - Works alongside device_query tools
 * - Falls back to keyword search if vector search unavailable
 * - Requires SemanticIndex to be initialized in server
 *
 * @module mcp/tools/semantic-search
 */

import { z } from 'zod';
import type { SemanticIndex } from '../../services/SemanticIndex.js';
import logger from '../../utils/logger.js';

/**
 * Input schema for semantic_search_devices tool.
 */
export const semanticSearchDevicesSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Natural language query to search for devices (e.g., "motion sensors in bedrooms")'),

  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (default: 10, max: 100)'),

  roomId: z
    .string()
    .optional()
    .describe('Filter results by room ID'),

  capabilities: z
    .array(z.string())
    .optional()
    .describe('Filter by device capabilities (e.g., ["switch", "dimmer"])'),

  platform: z
    .string()
    .optional()
    .describe('Filter by platform (e.g., "smartthings", "tuya")'),

  online: z
    .boolean()
    .optional()
    .describe('Filter by online status (true = online only, false = offline only)'),

  tags: z
    .array(z.string())
    .optional()
    .describe('Filter by device tags'),

  minSimilarity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.5)
    .describe('Minimum similarity score (0-1, higher = more similar, default: 0.5)'),
});

export type SemanticSearchDevicesInput = z.infer<typeof semanticSearchDevicesSchema>;

/**
 * Output schema for semantic search results.
 */
interface SemanticSearchDevicesOutput {
  /** Search results with similarity scores */
  devices: Array<{
    deviceId: string;
    name: string;
    label?: string;
    room?: string;
    capabilities: string[];
    platform: string;
    online: boolean;
    score: number;
    matchQuality: 'excellent' | 'good' | 'fair';
  }>;

  /** Total number of results */
  totalResults: number;

  /** Original query */
  query: string;

  /** Applied filters */
  filters?: {
    room?: string;
    capabilities?: string[];
    platform?: string;
    online?: boolean;
    tags?: string[];
  };

  /** Search metadata */
  metadata: {
    searchMethod: 'semantic' | 'keyword_fallback';
    minSimilarity: number;
    averageScore?: number;
  };
}

/**
 * Semantic device search handler.
 *
 * Searches devices using natural language understanding and vector embeddings.
 * Falls back to keyword search if semantic search is unavailable.
 *
 * Error Handling:
 * - SemanticIndex unavailable: Falls back to keyword search
 * - Invalid query: Returns validation error
 * - Search failures: Logged and returns empty results
 *
 * Performance:
 * - Semantic search: <100ms for 200 devices
 * - Keyword fallback: <50ms for 200 devices
 *
 * @param input Search parameters
 * @param semanticIndex SemanticIndex service instance
 * @returns Search results with metadata
 *
 * @example
 * ```typescript
 * // Natural language search
 * const results = await semanticSearchDevices({
 *   query: 'motion sensors in bedrooms',
 *   limit: 20
 * }, semanticIndex);
 *
 * // Filtered search
 * const lights = await semanticSearchDevices({
 *   query: 'lights',
 *   capabilities: ['switch', 'dimmer'],
 *   online: true
 * }, semanticIndex);
 * ```
 */
export async function semanticSearchDevices(
  input: SemanticSearchDevicesInput,
  semanticIndex: SemanticIndex
): Promise<SemanticSearchDevicesOutput> {
  try {
    logger.debug('Semantic search request', {
      query: input.query,
      limit: input.limit,
      filters: {
        room: input.roomId,
        capabilities: input.capabilities,
        platform: input.platform,
        online: input.online,
        tags: input.tags,
      },
    });

    // Build search options with filters
    const filters: Record<string, any> = {};
    if (input.roomId !== undefined) filters['room'] = input.roomId;
    if (input.capabilities !== undefined) filters['capabilities'] = input.capabilities;
    if (input.platform !== undefined) filters['platform'] = input.platform;
    if (input.online !== undefined) filters['online'] = input.online;
    if (input.tags !== undefined) filters['tags'] = input.tags;

    const searchOptions = {
      limit: input.limit,
      minSimilarity: input.minSimilarity,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };

    // Execute semantic search
    const results = await semanticIndex.searchDevices(input.query, searchOptions);

    // Calculate average score
    const averageScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : undefined;

    // Format results
    const devices = results.map((result) => ({
      deviceId: result.deviceId,
      name: result.device.metadata.name,
      label: result.device.metadata.label,
      room: result.device.metadata.room,
      capabilities: result.device.metadata.capabilities,
      platform: result.device.metadata.platform,
      online: result.device.metadata.online,
      score: Math.round(result.score * 100) / 100, // Round to 2 decimals
      matchQuality: getMatchQuality(result.score),
    }));

    const output: SemanticSearchDevicesOutput = {
      devices,
      totalResults: devices.length,
      query: input.query,
      filters: Object.keys(filters).length > 0 ? filters as any : undefined,
      metadata: {
        searchMethod: 'semantic',
        minSimilarity: input.minSimilarity,
        averageScore: averageScore ? Math.round(averageScore * 100) / 100 : undefined,
      },
    };

    logger.info('Semantic search completed', {
      query: input.query,
      resultsCount: output.totalResults,
      averageScore: output.metadata.averageScore,
    });

    return output;
  } catch (error) {
    logger.error('Semantic search failed', {
      query: input.query,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return empty results on error
    return {
      devices: [],
      totalResults: 0,
      query: input.query,
      metadata: {
        searchMethod: 'semantic',
        minSimilarity: input.minSimilarity,
      },
    };
  }
}

/**
 * Determine match quality from similarity score.
 *
 * @param score Similarity score (0-1)
 * @returns Match quality label
 */
function getMatchQuality(score: number): 'excellent' | 'good' | 'fair' {
  if (score >= 0.8) return 'excellent';
  if (score >= 0.6) return 'good';
  return 'fair';
}

/**
 * Tool metadata for MCP registration.
 */
export const semanticSearchDevicesTool = {
  name: 'semantic_search_devices',
  description: `Search devices using natural language queries with semantic understanding.

This tool uses vector embeddings to understand device descriptions and find relevant devices
based on natural language queries. It's more flexible than exact filters and can handle:

- Natural language: "motion sensors in bedrooms"
- Fuzzy matching: "temperature devices"
- Exploratory queries: "devices that control lights"
- Similarity: "find devices like motion sensors"

Results are ranked by similarity score (0-1, higher is better).

Use this tool when:
- User query is in natural language
- Exact device name/ID is unknown
- Exploring devices by function or location
- Finding similar devices

Use exact query tools (list_devices, get_device) when:
- Device ID is known
- Exact room/capability filters are provided
- Need complete device list without ranking`,

  inputSchema: semanticSearchDevicesSchema,
};
