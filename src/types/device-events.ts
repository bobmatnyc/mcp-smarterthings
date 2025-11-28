/**
 * Device event type definitions for SmartThings event history.
 *
 * Design Decision: Separate event types file
 * Rationale: Event-related types are complex and domain-specific enough to
 * warrant their own module. This prevents smartthings.ts from growing too large
 * while maintaining clear separation of concerns.
 *
 * Architecture: Wraps SmartThings DeviceActivity with branded types and
 * adds metadata for LLM troubleshooting context.
 */

import type { DeviceId, LocationId, CapabilityName } from './smartthings.js';

/**
 * Device event from SmartThings API (DeviceActivity).
 *
 * Wraps the raw SmartThings DeviceActivity type with branded types
 * for domain safety and adds computed fields for troubleshooting.
 *
 * SmartThings Constraints:
 * - Events retained for 7 days maximum
 * - Timestamps in ISO-8601 format (UTC)
 * - Values are unknown type (need runtime validation)
 *
 * Design Decision: Include both time and epoch
 * Rationale: ISO-8601 for human readability, epoch for time calculations
 * and range queries. Both are provided by SmartThings API.
 */
export interface DeviceEvent {
  /** Device that generated the event */
  deviceId: DeviceId;

  /** Human-readable device name (if available) */
  deviceName?: string;

  /** Location ID where device resides */
  locationId: LocationId;

  /** Human-readable location name (if available) */
  locationName?: string;

  /** ISO-8601 timestamp (UTC) */
  time: string;

  /** Unix epoch timestamp (milliseconds) */
  epoch: number;

  /** Device component (e.g., "main", "switch1") */
  component: string;

  /** Component label (human-readable) */
  componentLabel?: string;

  /** Capability that triggered the event */
  capability: CapabilityName;

  /** Attribute that changed */
  attribute: string;

  /** New attribute value (requires runtime validation) */
  value: unknown;

  /** Unit of measurement (if applicable) */
  unit?: string;

  /** Human-readable event description */
  text?: string;

  /** Event hash for disambiguation (prevents duplicate processing) */
  hash?: string;

  /** Translated attribute name (localized) */
  translatedAttributeName?: string;

  /** Translated attribute value (localized) */
  translatedAttributeValue?: string;
}

/**
 * Time range specification for event queries.
 *
 * Design Decision: Support both absolute and relative time formats
 * Rationale: LLMs often think in relative terms ("last 24 hours") while
 * troubleshooting. Supporting relative formats reduces cognitive overhead
 * and makes the API more intuitive for AI-powered troubleshooting.
 *
 * Relative Format Examples:
 * - "1h" = 1 hour ago
 * - "24h" = 24 hours ago
 * - "7d" = 7 days ago (maximum retention)
 * - "30m" = 30 minutes ago
 *
 * Absolute Format:
 * - ISO-8601: "2025-01-15T10:30:00Z"
 * - Epoch milliseconds: 1705318200000
 */
export type TimeRange = string | number | Date;

/**
 * Options for querying device events.
 *
 * Design Decision: All fields optional except deviceId
 * Rationale: Flexibility for different query patterns while enforcing
 * device-scoped queries (prevents accidental location-wide queries).
 *
 * Performance Considerations:
 * - Default limit (100) balances context window vs completeness
 * - Max limit (500) prevents LLM context overflow
 * - locationId recommended for faster API responses
 *
 * Trade-offs:
 * - Flexibility vs Safety: All filters optional could lead to large result sets
 * - Solution: Reasonable default limits and clear documentation
 */
export interface DeviceEventOptions {
  /** Device to query (required for scoped queries) */
  deviceId: DeviceId;

  /** Location ID (optional but recommended for performance) */
  locationId?: LocationId;

  /** Start of time range (inclusive) */
  startTime?: TimeRange;

  /** End of time range (inclusive) */
  endTime?: TimeRange;

  /** Maximum events to return (default: 100, max: 500) */
  limit?: number;

  /** Return oldest events first (default: false = newest first) */
  oldestFirst?: boolean;

  /** Filter by specific capabilities */
  capabilities?: CapabilityName[];

  /** Filter by specific attributes */
  attributes?: string[];

  /** Include detailed metadata in response (default: true) */
  includeMetadata?: boolean;

  /** Format values in human-readable text (default: true for LLM context) */
  humanReadable?: boolean;
}

/**
 * Metadata about event query results.
 *
 * Design Decision: Rich metadata for LLM troubleshooting context
 * Rationale: LLMs need context about data completeness, time ranges, and
 * potential gaps to provide accurate troubleshooting advice.
 *
 * Example Usage:
 * - hasMore=true → "Note: Only showing first 100 events, there are more"
 * - reachedRetentionLimit=true → "Warning: Query exceeds 7-day retention"
 * - gapDetected=true → "Possible connectivity issue detected (event gap)"
 */
export interface DeviceEventMetadata {
  /** Total events returned (after filtering) */
  totalCount: number;

  /** Whether more events exist beyond limit */
  hasMore: boolean;

  /** Actual time range of returned events */
  dateRange: {
    /** ISO-8601 timestamp of oldest event */
    earliest: string;

    /** ISO-8601 timestamp of newest event */
    latest: string;

    /** Duration in milliseconds */
    durationMs: number;
  };

  /** Filters applied to query */
  appliedFilters: {
    capabilities?: string[];
    attributes?: string[];
    timeRange?: {
      start: string;
      end: string;
    };
  };

  /** Whether query hit 7-day retention limit */
  reachedRetentionLimit: boolean;

  /** Detected event gaps (for connectivity diagnostics) */
  gapDetected?: boolean;

  /** Largest gap duration in milliseconds (if gaps detected) */
  largestGapMs?: number;
}

/**
 * Result of device event query.
 *
 * Design Decision: Separate events and metadata
 * Rationale: Clear separation allows LLM to focus on events while
 * metadata provides troubleshooting context when needed.
 *
 * Structure optimized for:
 * - Token efficiency (metadata optional)
 * - LLM comprehension (events array primary)
 * - Troubleshooting context (metadata for diagnostics)
 */
export interface DeviceEventResult {
  /** Array of device events (sorted by time) */
  events: DeviceEvent[];

  /** Query metadata and diagnostics */
  metadata: DeviceEventMetadata;

  /** Human-readable summary for LLM context */
  summary: string;
}

/**
 * Parsed time range with absolute timestamps.
 *
 * Internal type used after parsing relative time ranges.
 */
export interface ParsedTimeRange {
  /** Start timestamp (ISO-8601) */
  start: Date;

  /** End timestamp (ISO-8601) */
  end: Date;

  /** Original user input (for metadata) */
  original: {
    start?: string;
    end?: string;
  };

  /** Whether start time exceeds 7-day retention */
  exceedsRetention: boolean;
}

/**
 * Event gap detection result.
 *
 * Used for diagnosing connectivity issues and device health.
 *
 * Design Decision: Proactive gap detection
 * Rationale: Gaps in event history often indicate:
 * - Device offline/disconnected
 * - Hub connectivity issues
 * - Power outages
 * LLM can use this for root cause analysis.
 */
export interface EventGap {
  /** Start of gap (last event before gap) */
  gapStart: string;

  /** End of gap (first event after gap) */
  gapEnd: string;

  /** Gap duration in milliseconds */
  durationMs: number;

  /** Gap duration in human-readable format */
  durationText: string;

  /** Whether this gap suggests connectivity issue */
  likelyConnectivityIssue: boolean;
}

/**
 * Event pattern for troubleshooting analysis.
 *
 * Design Decision: Pre-computed patterns for LLM
 * Rationale: Identifying patterns like rapid state changes, repeated failures,
 * or anomalous behavior helps LLM provide better troubleshooting guidance.
 *
 * Future Extension Point: This interface can be expanded to include:
 * - Anomaly detection scores
 * - State transition analysis
 * - Correlation with other devices
 */
export interface EventPattern {
  /** Pattern type identifier */
  type: 'rapid_changes' | 'repeated_failures' | 'anomaly' | 'normal';

  /** Pattern description */
  description: string;

  /** Confidence score (0.0 - 1.0) */
  confidence: number;

  /** Events that match this pattern */
  matchingEvents: DeviceEvent[];

  /** Suggested troubleshooting actions */
  suggestions?: string[];
}

/**
 * Validates time range input.
 *
 * @param input Time range string, number, or Date
 * @returns Parsed Date object
 * @throws TypeError if format is invalid
 */
export function parseTimeRange(input: TimeRange): Date {
  // Handle Date objects
  if (input instanceof Date) {
    return input;
  }

  // Handle epoch timestamps (milliseconds)
  if (typeof input === 'number') {
    return new Date(input);
  }

  // Handle relative time formats (e.g., "24h", "7d")
  if (typeof input === 'string') {
    const relativeMatch = input.match(/^(\d+)(m|h|d)$/);
    if (relativeMatch) {
      const [, value = '0', unit = 'h'] = relativeMatch;
      const now = new Date();
      const amount = parseInt(value, 10);

      switch (unit) {
        case 'm':
          return new Date(now.getTime() - amount * 60 * 1000);
        case 'h':
          return new Date(now.getTime() - amount * 60 * 60 * 1000);
        case 'd':
          return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
      }
    }

    // Handle ISO-8601 timestamps
    const isoDate = new Date(input);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }
  }

  throw new TypeError(
    `Invalid time range format: ${input}. Expected ISO-8601, epoch milliseconds, or relative format (e.g., "24h", "7d")`
  );
}

/**
 * Validates time range against SmartThings 7-day retention limit.
 *
 * @param startTime Start of time range
 * @returns Validation result with adjusted time if needed
 */
export function validateRetentionLimit(startTime: Date): {
  valid: boolean;
  adjustedStart?: Date;
  exceedsLimit: boolean;
  message?: string;
} {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (startTime < sevenDaysAgo) {
    return {
      valid: false,
      adjustedStart: sevenDaysAgo,
      exceedsLimit: true,
      message: `Start time exceeds 7-day retention limit. Adjusted to ${sevenDaysAgo.toISOString()}.`,
    };
  }

  return {
    valid: true,
    exceedsLimit: false,
  };
}

/**
 * Formats duration in milliseconds to human-readable text.
 *
 * @param durationMs Duration in milliseconds
 * @returns Human-readable duration (e.g., "2 hours 30 minutes")
 */
export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Detects significant gaps in event timeline.
 *
 * Design Decision: 30-minute threshold for gap detection
 * Rationale: Most active devices (sensors, switches) report changes frequently.
 * A 30-minute gap suggests potential connectivity or power issues.
 *
 * @param events Sorted array of events (newest to oldest or vice versa)
 * @param thresholdMs Minimum gap duration to report (default: 30 minutes)
 * @returns Array of detected gaps
 */
export function detectEventGaps(events: DeviceEvent[], thresholdMs = 30 * 60 * 1000): EventGap[] {
  if (events.length < 2) {
    return [];
  }

  const gaps: EventGap[] = [];
  const sortedEvents = [...events].sort((a, b) => a.epoch - b.epoch);

  for (let i = 1; i < sortedEvents.length; i++) {
    const prevEvent = sortedEvents[i - 1];
    const currentEvent = sortedEvents[i];

    if (!prevEvent || !currentEvent) {
      continue;
    }

    const gapDuration = currentEvent.epoch - prevEvent.epoch;

    if (gapDuration > thresholdMs) {
      gaps.push({
        gapStart: prevEvent.time,
        gapEnd: currentEvent.time,
        durationMs: gapDuration,
        durationText: formatDuration(gapDuration),
        likelyConnectivityIssue: gapDuration > 60 * 60 * 1000, // >1 hour suggests connectivity issue
      });
    }
  }

  return gaps;
}

/**
 * Creates a branded DeviceEvent from raw SmartThings DeviceActivity.
 *
 * @param activity Raw DeviceActivity from SmartThings API
 * @returns Typed DeviceEvent with branded types
 */
export function createDeviceEvent(activity: {
  deviceId: string;
  deviceName?: string;
  locationId: string;
  locationName?: string;
  time: string;
  epoch: number;
  component: string;
  componentLabel?: string;
  capability: string;
  attribute: string;
  value: unknown;
  unit?: string;
  text?: string;
  hash?: string;
  translatedAttributeName?: string;
  translatedAttributeValue?: string;
}): DeviceEvent {
  return {
    deviceId: activity.deviceId as DeviceId,
    deviceName: activity.deviceName,
    locationId: activity.locationId as LocationId,
    locationName: activity.locationName,
    time: activity.time,
    epoch: activity.epoch,
    component: activity.component,
    componentLabel: activity.componentLabel,
    capability: activity.capability as CapabilityName,
    attribute: activity.attribute,
    value: activity.value,
    unit: activity.unit,
    text: activity.text,
    hash: activity.hash,
    translatedAttributeName: activity.translatedAttributeName,
    translatedAttributeValue: activity.translatedAttributeValue,
  };
}
