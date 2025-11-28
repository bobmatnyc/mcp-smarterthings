import { z } from 'zod';
import { createMcpResponse } from '../../types/mcp.js';
import { createMcpError, classifyError } from '../../utils/error-handler.js';
import { deviceIdSchema } from '../../utils/validation.js';
import type { DeviceId, LocationId } from '../../types/smartthings.js';
import type { McpToolInput } from '../../types/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServiceContainer } from '../../services/ServiceContainer.js';
import type {
  DeviceEventOptions,
  DeviceEventResult,
  DeviceEvent,
  ParsedTimeRange,
} from '../../types/device-events.js';
import {
  parseTimeRange,
  validateRetentionLimit,
  detectEventGaps,
  formatDuration,
} from '../../types/device-events.js';

/**
 * Device event retrieval tools for MCP server.
 *
 * Architecture: Phase 1 of AI-powered troubleshooting mode (Ticket 1M-274)
 * - Provides event history retrieval with flexible time ranges
 * - Supports relative time formats ("24h", "7d") for LLM convenience
 * - Includes gap detection for connectivity diagnostics
 * - Optimized response format for LLM troubleshooting context
 *
 * Design Decision: Event-centric troubleshooting
 * Rationale: Device event history is the primary data source for diagnosing
 * issues with SmartThings devices. By providing rich event data with metadata,
 * LLMs can identify patterns, detect anomalies, and suggest solutions.
 *
 * SmartThings Constraints:
 * - 7-day event retention limit (enforced by API)
 * - Device-scoped queries (locationId optional but recommended)
 * - Large result sets require pagination
 *
 * Trade-offs:
 * - Token Usage vs Context: Default limit (100 events) balances LLM context
 *   window with sufficient data for troubleshooting. Adjustable up to 500.
 * - Metadata Overhead: Rich metadata increases response size but provides
 *   essential context for accurate troubleshooting. Optional via includeMetadata.
 * - Gap Detection Cost: O(n) gap detection adds minimal overhead and provides
 *   high-value diagnostics for connectivity issues.
 */

// Service container instance (injected during initialization)
let serviceContainer: ServiceContainer;

/**
 * Zod schema for relative time formats.
 *
 * Supports:
 * - Minutes: "30m", "45m"
 * - Hours: "1h", "24h"
 * - Days: "1d", "7d" (max)
 */
const relativeTimeSchema = z
  .string()
  .regex(/^\d+[mhd]$/, 'Must be in format: number + unit (m/h/d), e.g., "24h" or "7d"')
  .refine(
    (val) => {
      const match = val.match(/^(\d+)([mhd])$/);
      if (!match) return false;
      const [, value = '0', unit = 'm'] = match;
      const num = parseInt(value, 10);

      // Validate reasonable ranges
      if (unit === 'm') return num <= 10080; // Max 7 days in minutes
      if (unit === 'h') return num <= 168; // Max 7 days in hours
      if (unit === 'd') return num <= 7; // Max 7 days
      return false;
    },
    { message: 'Time range exceeds 7-day retention limit' }
  );

/**
 * Zod schema for absolute time formats.
 *
 * Supports:
 * - ISO-8601: "2025-01-15T10:30:00Z"
 * - Epoch milliseconds: 1705318200000
 */
const absoluteTimeSchema = z.union([
  z.string().datetime({ message: 'Must be ISO-8601 format' }),
  z.number().int().positive({ message: 'Must be positive epoch milliseconds' }),
]);

/**
 * Zod schema for time range (relative or absolute).
 */
const timeRangeSchema = z.union([relativeTimeSchema, absoluteTimeSchema]);

/**
 * Input schema for getDeviceEvents tool.
 *
 * Design Decision: All optional except deviceId
 * Rationale: Flexibility for different query patterns:
 * - Simple: Just deviceId (defaults to last 24 hours)
 * - Time-based: deviceId + startTime/endTime
 * - Filtered: deviceId + capabilities/attributes
 * - Advanced: Combination of all filters + pagination
 *
 * Default Behavior:
 * - Time range: Last 24 hours if not specified
 * - Limit: 100 events (balances context vs completeness)
 * - Sort order: Newest first (most relevant for troubleshooting)
 * - Metadata: Included (essential for diagnostics)
 * - Human readable: Enabled (optimized for LLM comprehension)
 */
const getDeviceEventsSchema = z.object({
  deviceId: deviceIdSchema,

  locationId: z
    .string()
    .uuid('Location ID must be a valid UUID')
    .nullish()
    .describe('Optional location ID for faster API queries (recommended if known)'),

  startTime: timeRangeSchema
    .optional()
    .describe(
      'Start of time range. Supports relative ("24h", "7d") or absolute (ISO-8601, epoch ms). Default: 24 hours ago'
    ),

  endTime: timeRangeSchema
    .optional()
    .describe(
      'End of time range. Supports relative ("1h") or absolute (ISO-8601, epoch ms). Default: now'
    ),

  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe('Maximum events to return (default: 100, max: 500)'),

  oldestFirst: z
    .boolean()
    .optional()
    .describe('Sort oldest events first (default: false = newest first)'),

  capabilities: z
    .array(z.string())
    .optional()
    .describe('Filter by specific capabilities (e.g., ["switch", "temperatureMeasurement"])'),

  attributes: z
    .array(z.string())
    .optional()
    .describe('Filter by specific attributes (e.g., ["switch", "temperature"])'),

  includeMetadata: z
    .boolean()
    .optional()
    .describe('Include detailed metadata in response (default: true)'),

  humanReadable: z
    .boolean()
    .optional()
    .describe('Format event text in human-readable form (default: true)'),
});

/**
 * Parse and validate time range inputs.
 *
 * Converts relative time strings ("24h") or absolute timestamps into
 * Date objects, validating against 7-day retention limit.
 *
 * @param startTimeInput Optional start time input
 * @param endTimeInput Optional end time input
 * @returns Parsed time range with metadata
 */
function parseAndValidateTimeRange(
  startTimeInput?: string | number,
  endTimeInput?: string | number
): ParsedTimeRange {
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

  // Parse end time (default: now)
  const end = endTimeInput ? parseTimeRange(endTimeInput) : now;

  // Parse start time (default: 24 hours ago)
  const start = startTimeInput ? parseTimeRange(startTimeInput) : defaultStart;

  // Validate start is before end
  if (start >= end) {
    throw new Error('Start time must be before end time');
  }

  // Validate against 7-day retention limit
  const retentionCheck = validateRetentionLimit(start);

  return {
    start: retentionCheck.adjustedStart ?? start,
    end,
    original: {
      start: startTimeInput?.toString(),
      end: endTimeInput?.toString(),
    },
    exceedsRetention: retentionCheck.exceedsLimit,
  };
}

/**
 * Format event for human-readable display.
 *
 * Prioritizes SmartThings-provided text field, falls back to
 * formatted attribute/value pairs.
 *
 * @param event Device event
 * @returns Formatted event string
 */
function formatEventText(event: DeviceEvent): string {
  // Use SmartThings-provided text if available
  if (event.text) {
    return event.text;
  }

  // Format attribute name (remove camelCase)
  const attributeName =
    event.translatedAttributeName ?? event.attribute.replace(/([A-Z])/g, ' $1').trim();

  // Format value with unit
  const valueStr =
    event.translatedAttributeValue ??
    (typeof event.value === 'object' ? JSON.stringify(event.value) : String(event.value));

  const unitStr = event.unit ? ` ${event.unit}` : '';

  return `${attributeName}: ${valueStr}${unitStr}`;
}

/**
 * Build response summary for LLM context.
 *
 * Design Decision: Structured summary for LLM comprehension
 * Rationale: Provides high-level context before detailed event list,
 * helping LLM understand data scope and identify patterns quickly.
 *
 * @param result Event query result
 * @param deviceName Device name (if available)
 * @param timeRange Parsed time range
 * @returns Formatted summary text
 */
function buildSummary(
  result: DeviceEventResult,
  deviceName: string | undefined,
  timeRange: ParsedTimeRange
): string {
  const { events, metadata } = result;
  const deviceStr = deviceName ? `${deviceName}` : `Device ${events[0]?.deviceId ?? 'unknown'}`;

  const lines: string[] = [
    `📊 Event History: ${deviceStr}`,
    `⏱️  Time Range: ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`,
    `📈 Total Events: ${metadata.totalCount}`,
  ];

  if (metadata.hasMore) {
    lines.push(`⚠️  Note: Result limited to ${events.length} events (more available)`);
  }

  if (metadata.reachedRetentionLimit) {
    lines.push(`⚠️  Warning: Query adjusted to 7-day retention limit`);
  }

  if (metadata.gapDetected) {
    lines.push(
      `🔍 Gap Detected: ${formatDuration(metadata.largestGapMs!)} gap in event history (possible connectivity issue)`
    );
  }

  // Add filter summary if applied
  if (metadata.appliedFilters.capabilities?.length) {
    lines.push(`🔎 Filtered by capabilities: ${metadata.appliedFilters.capabilities.join(', ')}`);
  }
  if (metadata.appliedFilters.attributes?.length) {
    lines.push(`🔎 Filtered by attributes: ${metadata.appliedFilters.attributes.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format events for LLM-friendly display.
 *
 * Design Decision: Chronological with contextual grouping
 * Rationale: Chronological order helps LLM identify patterns and sequences.
 * Grouping by capability/attribute reduces cognitive load.
 *
 * @param events Array of device events
 * @param humanReadable Whether to format in human-readable text
 * @returns Formatted event list
 */
function formatEventsForDisplay(events: DeviceEvent[], humanReadable: boolean): string {
  if (events.length === 0) {
    return 'No events found in the specified time range.';
  }

  const eventLines = events.map((event, index) => {
    const timestamp = new Date(event.time).toLocaleString();
    const text = humanReadable ? formatEventText(event) : `${event.attribute}=${event.value}`;
    const component = event.component !== 'main' ? ` [${event.component}]` : '';

    return `${index + 1}. ${timestamp}${component} - ${text}`;
  });

  return eventLines.join('\n');
}

/**
 * Get device events with flexible time ranges and filtering.
 *
 * MCP Tool: get_device_events
 * Input: { deviceId, startTime?, endTime?, limit?, capabilities?, attributes?, ... }
 * Output: Device event history with troubleshooting metadata
 *
 * Design Decision: Event-first troubleshooting
 * Rationale: Event history is the primary diagnostic data for SmartThings devices.
 * This tool provides comprehensive event retrieval optimized for LLM analysis.
 *
 * Features:
 * - Relative time ranges ("24h", "7d") for LLM convenience
 * - Automatic gap detection for connectivity diagnostics
 * - Human-readable formatting for LLM comprehension
 * - Rich metadata for context and pattern identification
 *
 * Performance Optimization:
 * - Default 100-event limit balances context vs completeness
 * - LocationId parameter enables faster API queries
 * - Capability/attribute filtering reduces result size
 *
 * Error Handling:
 * - Validation errors: Invalid deviceId, time format, or filters
 * - Retention limit: Automatic adjustment with warning
 * - Device not found: Clear error message
 * - API errors: Classified and formatted for LLM
 * - Network errors: Retried automatically by ServiceContainer
 *
 * Example Usage (LLM):
 * ```json
 * // Simple query (last 24 hours)
 * { "deviceId": "abc-123" }
 *
 * // Last week with gap detection
 * { "deviceId": "abc-123", "startTime": "7d" }
 *
 * // Filter by capability
 * { "deviceId": "abc-123", "capabilities": ["temperatureMeasurement"] }
 *
 * // Custom time range
 * {
 *   "deviceId": "abc-123",
 *   "startTime": "2025-01-15T00:00:00Z",
 *   "endTime": "2025-01-16T00:00:00Z"
 * }
 * ```
 */
export async function handleGetDeviceEvents(input: McpToolInput): Promise<CallToolResult> {
  try {
    const {
      deviceId,
      locationId,
      startTime,
      endTime,
      limit = 100,
      oldestFirst = false,
      capabilities,
      attributes,
      includeMetadata = true,
      humanReadable = true,
    } = getDeviceEventsSchema.parse(input);

    // Parse and validate time range
    const timeRange = parseAndValidateTimeRange(startTime, endTime);

    // Get device service
    const deviceService = serviceContainer.getDeviceService();

    // Fetch device info for display name
    const device = await deviceService.getDevice(deviceId as DeviceId);

    // Build query options
    const queryOptions: DeviceEventOptions = {
      deviceId: deviceId as DeviceId,
      locationId: locationId ? (locationId as LocationId) : undefined,
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit,
      oldestFirst,
      capabilities: capabilities as any,
      attributes,
      includeMetadata,
      humanReadable,
    };

    // Query events from SmartThings API via DeviceService
    const result = await deviceService.getDeviceEvents(deviceId as DeviceId, queryOptions);

    // Generate summary
    result.summary = buildSummary(result, device.name, timeRange);

    // Format response text
    const responseText = [
      result.summary,
      '',
      '📋 Events:',
      formatEventsForDisplay(result.events, humanReadable),
    ].join('\n');

    // Include gap details if detected
    if (result.metadata.gapDetected && includeMetadata) {
      // Re-detect gaps for detailed output (they're also in metadata)
      const gaps = detectEventGaps(result.events);
      const gapDetails = gaps
        .map(
          (gap) =>
            `- ${gap.durationText} gap from ${new Date(gap.gapStart).toLocaleString()} to ${new Date(gap.gapEnd).toLocaleString()}${gap.likelyConnectivityIssue ? ' ⚠️  (Connectivity Issue)' : ''}`
        )
        .join('\n');

      return createMcpResponse(`${responseText}\n\n🔍 Detected Gaps:\n${gapDetails}`, result);
    }

    return createMcpResponse(responseText, result);
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Initialize device event tools with ServiceContainer.
 *
 * Must be called during server initialization to inject dependencies.
 *
 * @param container ServiceContainer instance for dependency injection
 */
export function initializeDeviceEventTools(container: ServiceContainer): void {
  serviceContainer = container;
}

/**
 * Tool metadata for MCP server registration.
 *
 * Design Decision: Rich schema documentation
 * Rationale: Comprehensive descriptions help LLMs understand capabilities
 * and construct correct queries without trial-and-error.
 */
export const deviceEventTools = {
  get_device_events: {
    description: `Get event history for a SmartThings device with flexible time ranges and filtering.

🎯 Primary Use Case: AI-powered troubleshooting and diagnostics

Features:
- Relative time ranges: "24h", "7d" (LLM-friendly)
- Absolute time ranges: ISO-8601 or epoch milliseconds
- Automatic gap detection for connectivity issues
- Capability/attribute filtering for focused analysis
- Rich metadata for troubleshooting context

SmartThings Constraints:
- 7-day event retention (older queries adjusted automatically)
- Device-scoped (locationId recommended for performance)

Example Queries:
- Last 24 hours: { "deviceId": "abc-123" }
- Last week: { "deviceId": "abc-123", "startTime": "7d" }
- Temperature events: { "deviceId": "abc-123", "capabilities": ["temperatureMeasurement"] }
- Custom range: { "deviceId": "abc-123", "startTime": "2025-01-15T00:00:00Z", "endTime": "2025-01-16T00:00:00Z" }`,

    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'SmartThings device UUID (required)',
        },
        locationId: {
          type: 'string',
          description: 'Optional location UUID for faster API queries (recommended if known)',
        },
        startTime: {
          type: 'string',
          description:
            'Start of time range. Supports relative ("24h", "7d") or absolute (ISO-8601). Default: 24 hours ago',
        },
        endTime: {
          type: 'string',
          description:
            'End of time range. Supports relative ("1h") or absolute (ISO-8601). Default: now',
        },
        limit: {
          type: 'number',
          description: 'Maximum events to return (default: 100, max: 500)',
          default: 100,
          minimum: 1,
          maximum: 500,
        },
        oldestFirst: {
          type: 'boolean',
          description: 'Sort oldest events first (default: false = newest first)',
          default: false,
        },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter by specific capabilities (e.g., ["switch", "temperatureMeasurement"])',
        },
        attributes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by specific attributes (e.g., ["switch", "temperature"])',
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Include detailed metadata in response (default: true)',
          default: true,
        },
        humanReadable: {
          type: 'boolean',
          description: 'Format event text in human-readable form (default: true)',
          default: true,
        },
      },
      required: ['deviceId'],
    },
    handler: handleGetDeviceEvents,
  },
} as const;
