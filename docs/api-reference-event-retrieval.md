# Event Retrieval API Reference

Quick reference for event retrieval types and MCP tool.

## MCP Tool

### `get_device_events`

Retrieve device event history with flexible filtering and troubleshooting metadata.

**Input:**
```typescript
{
  deviceId: string;              // Required: Device UUID
  locationId?: string;           // Optional: Location UUID (recommended)
  startTime?: string | number;   // Optional: "24h", ISO-8601, or epoch (default: "24h")
  endTime?: string | number;     // Optional: "1h", ISO-8601, or epoch (default: now)
  limit?: number;                // Optional: Max events (default: 100, max: 500)
  oldestFirst?: boolean;         // Optional: Sort order (default: false)
  capabilities?: string[];       // Optional: Filter by capabilities
  attributes?: string[];         // Optional: Filter by attributes
  includeMetadata?: boolean;     // Optional: Include metadata (default: true)
  humanReadable?: boolean;       // Optional: Format text (default: true)
}
```

**Output:**
```typescript
{
  content: [{
    type: "text",
    text: "📊 Event History: Device Name\n..."
  }],
  data: {
    events: DeviceEvent[];
    metadata: DeviceEventMetadata;
    summary: string;
    gaps?: EventGap[];
  }
}
```

## Core Types

### `DeviceEvent`

Individual device event from SmartThings API.

```typescript
interface DeviceEvent {
  deviceId: DeviceId;           // Branded device ID
  deviceName?: string;          // Human-readable name
  locationId: LocationId;       // Branded location ID
  locationName?: string;        // Human-readable location
  time: string;                 // ISO-8601 timestamp (UTC)
  epoch: number;                // Unix epoch (milliseconds)
  component: string;            // Device component (e.g., "main")
  componentLabel?: string;      // Component label
  capability: CapabilityName;   // Branded capability name
  attribute: string;            // Attribute that changed
  value: unknown;               // New value (needs validation)
  unit?: string;                // Measurement unit
  text?: string;                // Human-readable description
  hash?: string;                // Event hash for deduplication
  translatedAttributeName?: string;   // Localized attribute
  translatedAttributeValue?: string;  // Localized value
}
```

### `DeviceEventOptions`

Query options for event retrieval.

```typescript
interface DeviceEventOptions {
  deviceId: DeviceId;                // Required: Device to query
  locationId?: LocationId;           // Optional: Location filter
  startTime?: TimeRange;             // Optional: Start of range
  endTime?: TimeRange;               // Optional: End of range
  limit?: number;                    // Optional: Max events (default: 100)
  oldestFirst?: boolean;             // Optional: Sort order (default: false)
  capabilities?: CapabilityName[];   // Optional: Capability filter
  attributes?: string[];             // Optional: Attribute filter
  includeMetadata?: boolean;         // Optional: Include metadata (default: true)
  humanReadable?: boolean;           // Optional: Format text (default: true)
}
```

### `DeviceEventResult`

Complete result with events and metadata.

```typescript
interface DeviceEventResult {
  events: DeviceEvent[];        // Array of events (sorted by time)
  metadata: DeviceEventMetadata; // Query metadata and diagnostics
  summary: string;              // Human-readable summary
}
```

### `DeviceEventMetadata`

Metadata for troubleshooting context.

```typescript
interface DeviceEventMetadata {
  totalCount: number;           // Events returned
  hasMore: boolean;             // More events available?
  dateRange: {
    earliest: string;           // ISO-8601 of oldest event
    latest: string;             // ISO-8601 of newest event
    durationMs: number;         // Range duration
  };
  appliedFilters: {
    capabilities?: string[];    // Applied capability filters
    attributes?: string[];      // Applied attribute filters
    timeRange?: {
      start: string;            // Query start time
      end: string;              // Query end time
    };
  };
  reachedRetentionLimit: boolean; // Hit 7-day limit?
  gapDetected?: boolean;        // Gaps found?
  largestGapMs?: number;        // Largest gap duration
}
```

### `EventGap`

Detected gap in event timeline.

```typescript
interface EventGap {
  gapStart: string;             // ISO-8601 of last event before gap
  gapEnd: string;               // ISO-8601 of first event after gap
  durationMs: number;           // Gap duration in milliseconds
  durationText: string;         // Human-readable duration (e.g., "4h 23m")
  likelyConnectivityIssue: boolean; // >1 hour = likely connectivity issue
}
```

### `TimeRange`

Flexible time range specification.

```typescript
type TimeRange = string | number | Date;

// String formats:
// - Relative: "1h", "24h", "7d" (minutes, hours, days)
// - ISO-8601: "2025-01-15T10:30:00Z"
//
// Number format:
// - Epoch milliseconds: 1705318200000
//
// Date format:
// - JavaScript Date object
```

## Utility Functions

### `parseTimeRange()`

Parse time range input to Date object.

```typescript
function parseTimeRange(input: TimeRange): Date

// Examples:
parseTimeRange("24h")                      // 24 hours ago
parseTimeRange("7d")                       // 7 days ago
parseTimeRange("2025-01-15T10:00:00Z")    // ISO-8601
parseTimeRange(1705318200000)              // Epoch milliseconds
parseTimeRange(new Date())                 // Date object
```

### `validateRetentionLimit()`

Validate against SmartThings 7-day retention.

```typescript
function validateRetentionLimit(startTime: Date): {
  valid: boolean;              // Is within 7-day limit?
  adjustedStart?: Date;        // Adjusted start time (if needed)
  exceedsLimit: boolean;       // Did it exceed limit?
  message?: string;            // Warning message (if exceeded)
}

// Example:
const result = validateRetentionLimit(new Date("2025-01-01"));
if (result.exceedsLimit) {
  console.log(result.message);
  // Use result.adjustedStart instead
}
```

### `detectEventGaps()`

Detect gaps in event timeline.

```typescript
function detectEventGaps(
  events: DeviceEvent[],
  thresholdMs?: number  // Default: 30 minutes
): EventGap[]

// Example:
const gaps = detectEventGaps(events);
if (gaps.length > 0) {
  console.log(`Found ${gaps.length} gaps`);
  gaps.forEach(gap => {
    console.log(`${gap.durationText} gap detected`);
  });
}
```

### `formatDuration()`

Format milliseconds to human-readable text.

```typescript
function formatDuration(durationMs: number): string

// Examples:
formatDuration(1800000)      // "30m"
formatDuration(3600000)      // "1h"
formatDuration(86400000)     // "1d"
formatDuration(90000000)     // "1d 1h"
```

### `createDeviceEvent()`

Convert raw SmartThings API response to typed DeviceEvent.

```typescript
function createDeviceEvent(activity: {
  deviceId: string;
  locationId: string;
  time: string;
  epoch: number;
  capability: string;
  attribute: string;
  value: unknown;
  // ... other fields
}): DeviceEvent
```

## Example Usage

### Simple Query
```typescript
import { handleGetDeviceEvents } from './mcp/tools/device-events.js';

const result = await handleGetDeviceEvents({
  deviceId: "550e8400-e29b-41d4-a716-446655440000"
});

// Defaults:
// - Last 24 hours
// - 100 events max
// - Newest first
// - Metadata included
// - Human-readable format
```

### Advanced Query
```typescript
const result = await handleGetDeviceEvents({
  deviceId: "550e8400-e29b-41d4-a716-446655440000",
  locationId: "abc-def-123",
  startTime: "7d",
  endTime: "1d",
  capabilities: ["temperatureMeasurement"],
  attributes: ["temperature"],
  limit: 200,
  oldestFirst: true
});
```

### Analyze Results
```typescript
const { events, metadata, gaps } = result.data;

// Check for gaps
if (metadata.gapDetected) {
  console.log(`⚠️ Found ${gaps.length} gaps`);
  gaps.forEach(gap => {
    if (gap.likelyConnectivityIssue) {
      console.log(`🔍 Connectivity issue: ${gap.durationText} gap`);
    }
  });
}

// Check retention limit
if (metadata.reachedRetentionLimit) {
  console.log("⚠️ Query adjusted to 7-day retention limit");
}

// Process events
events.forEach(event => {
  console.log(`${event.time}: ${event.text}`);
});
```

## Error Handling

### Validation Errors
```typescript
// Invalid time format
{
  error: "Invalid time range format: '25h'. Expected ISO-8601, epoch milliseconds, or relative format (e.g., '24h', '7d')"
}

// Missing deviceId
{
  error: "Required field 'deviceId' is missing"
}

// Start after end
{
  error: "Start time must be before end time"
}
```

### API Errors
```typescript
// Device not found
{
  error: "Device not found: abc-123"
}

// Network error (with retry)
{
  error: "Network request failed after 3 retries"
}
```

### Warnings
```typescript
// Retention limit exceeded
{
  data: {
    metadata: {
      reachedRetentionLimit: true
    }
  },
  content: [{
    text: "⚠️ Warning: Query adjusted to 7-day retention limit"
  }]
}
```

## Performance Notes

### Token Usage
- Minimal query: ~300 tokens (100 events, metadata)
- Maximum query: ~12k tokens (500 events, metadata, gaps)
- Without metadata: ~50-100 fewer tokens

### Response Time
- Typical: <1s (100 events)
- Large queries: <2s (500 events)
- With locationId: ~20% faster

### Optimization Tips
1. Always provide `locationId` when known
2. Use smallest effective time window
3. Apply capability/attribute filters
4. Disable metadata if not needed (`includeMetadata: false`)
5. Use raw format if token-constrained (`humanReadable: false`)

## SmartThings Constraints

### Event Retention
- Maximum: 7 days of history
- Queries exceeding limit are auto-adjusted
- Warning included in metadata

### Rate Limits
- Standard SmartThings API rate limits apply
- Retries with exponential backoff (handled by ServiceContainer)

### Data Availability
- Events may have slight delay (<1 minute typical)
- Some devices report more frequently than others
- Component labels may not always be available

## Best Practices

### 1. Always Check Metadata
```typescript
const { metadata, gaps } = result.data;

if (metadata.hasMore) {
  // More events available, consider pagination
}

if (metadata.reachedRetentionLimit) {
  // Query was adjusted, results may be incomplete
}

if (metadata.gapDetected) {
  // Potential connectivity issues
}
```

### 2. Use Appropriate Time Ranges
```typescript
// ✅ Good: Focused time range
{ startTime: "24h" }

// ❌ Bad: Unnecessary wide range
{ startTime: "7d" }  // unless you need full history
```

### 3. Filter Early
```typescript
// ✅ Good: Filter at query time
{ capabilities: ["temperatureMeasurement"] }

// ❌ Bad: Filter after fetching
// Fetching all events then filtering wastes tokens
```

### 4. Handle Gaps Gracefully
```typescript
if (gaps.length > 0) {
  const connectivityIssues = gaps.filter(g => g.likelyConnectivityIssue);
  if (connectivityIssues.length > 0) {
    // Investigate connectivity, not device malfunction
  }
}
```

### 5. Provide Context to LLM
```typescript
// Include summary in prompts
const prompt = `
Analyze these device events:
${result.data.summary}

Events show:
${formatEventsForAnalysis(result.data.events)}
`;
```

## Integration Example

### ServiceContainer Method (To Be Implemented)
```typescript
interface DeviceService {
  // ... existing methods

  /**
   * Get device event history.
   *
   * @param options Query options
   * @returns Event result with metadata
   */
  getDeviceEvents(options: DeviceEventOptions): Promise<DeviceEventResult>;
}
```

### Implementation Stub
```typescript
async getDeviceEvents(options: DeviceEventOptions): Promise<DeviceEventResult> {
  const { deviceId, startTime, endTime, limit, capabilities, attributes } = options;

  // 1. Query SmartThings API
  const activities = await this.client.devices.getDeviceActivity(
    deviceId,
    startTime,
    endTime,
    { limit, capabilities, attributes }
  );

  // 2. Convert to typed events
  const events = activities.map(createDeviceEvent);

  // 3. Detect gaps
  const gaps = detectEventGaps(events);

  // 4. Build metadata
  const metadata = { /* ... */ };

  // 5. Build summary
  const summary = buildSummary({ events, metadata, /* ... */ });

  return { events, metadata, summary };
}
```

## See Also

- [Design Documentation](/docs/event-retrieval-design.md)
- [Usage Examples](/docs/examples/event-retrieval-examples.md)
- [Design Summary](/DESIGN-SUMMARY-1M-274.md)
- [SmartThings API Documentation](https://developer.smartthings.com/)
