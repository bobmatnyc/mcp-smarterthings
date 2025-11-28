# Event Retrieval Design Documentation

**Ticket:** 1M-274 - Implement AI-powered troubleshooting mode
**Phase:** Phase 1 - Event History Foundation
**Status:** Design Complete - Ready for Implementation

## Overview

This document describes the design for device event retrieval in the SmartThings MCP server, optimized for AI-powered troubleshooting scenarios.

## Architecture

### Type System

**Location:** `/src/types/device-events.ts`

#### Core Types

```typescript
// Primary event wrapper with branded types
interface DeviceEvent {
  deviceId: DeviceId;
  deviceName?: string;
  locationId: LocationId;
  time: string;           // ISO-8601
  epoch: number;          // Unix timestamp
  capability: CapabilityName;
  attribute: string;
  value: unknown;
  // ... additional fields
}

// Query options with flexible time ranges
interface DeviceEventOptions {
  deviceId: DeviceId;
  startTime?: TimeRange;  // Supports relative ("24h") or absolute
  endTime?: TimeRange;
  limit?: number;         // Default: 100, Max: 500
  capabilities?: CapabilityName[];
  attributes?: string[];
  // ... additional options
}

// Result with rich metadata for troubleshooting
interface DeviceEventResult {
  events: DeviceEvent[];
  metadata: DeviceEventMetadata;
  summary: string;
}
```

#### Time Range Support

**Design Decision:** Support both absolute and relative time formats

**Rationale:** LLMs often think in relative terms ("last 24 hours") during troubleshooting. Supporting both formats reduces cognitive overhead and makes the API more intuitive.

**Supported Formats:**
- Relative: `"1h"`, `"24h"`, `"7d"` (minutes, hours, days)
- Absolute: ISO-8601 (`"2025-01-15T10:30:00Z"`)
- Epoch: Unix milliseconds (`1705318200000`)

**Implementation:**
```typescript
type TimeRange = string | number | Date;

function parseTimeRange(input: TimeRange): Date {
  // Handles relative formats (e.g., "24h")
  // Handles ISO-8601 strings
  // Handles epoch milliseconds
  // Throws TypeError for invalid formats
}
```

### MCP Tool Schema

**Location:** `/src/mcp/tools/device-events.ts`

#### Tool Definition: `get_device_events`

**Purpose:** Retrieve device event history with flexible filtering and troubleshooting metadata.

**Input Schema (Zod):**
```typescript
{
  deviceId: string (UUID, required),
  locationId?: string (UUID, optional),
  startTime?: string | number (default: "24h"),
  endTime?: string | number (default: now),
  limit?: number (default: 100, max: 500),
  oldestFirst?: boolean (default: false),
  capabilities?: string[],
  attributes?: string[],
  includeMetadata?: boolean (default: true),
  humanReadable?: boolean (default: true)
}
```

**Output Format:**
```typescript
{
  content: [{
    type: "text",
    text: "📊 Event History: Device Name\n..."
  }],
  data: {
    events: DeviceEvent[],
    metadata: {
      totalCount: number,
      hasMore: boolean,
      dateRange: { earliest, latest, durationMs },
      appliedFilters: { ... },
      reachedRetentionLimit: boolean,
      gapDetected?: boolean,
      largestGapMs?: number
    },
    summary: string,
    gaps?: EventGap[]
  }
}
```

## Design Decisions

### 1. Separate Event Types File

**Decision:** Create `/src/types/device-events.ts` separate from `smartthings.ts`

**Rationale:**
- Event types are complex and domain-specific
- Prevents `smartthings.ts` from growing too large
- Clear separation of concerns: device types vs. event types
- Easier to maintain and extend event-specific functionality

**Trade-offs:**
- Additional import statements (minimal overhead)
- Slightly more complex module structure
- Benefits: Better organization, easier navigation, focused testing

### 2. Rich Metadata for Troubleshooting

**Decision:** Include comprehensive metadata in results by default

**Rationale:**
- LLMs need context about data completeness for accurate diagnostics
- Gap detection provides high-value connectivity diagnostics
- Retention limit warnings prevent misleading conclusions
- Filter information helps LLM understand result scope

**Trade-offs:**
- Token Usage: ~50-100 additional tokens per query
- Processing Cost: O(n) gap detection (minimal overhead)
- Benefits: Significantly improved troubleshooting accuracy

**Optimization:** `includeMetadata: false` option for token-constrained scenarios

### 3. Default 100-Event Limit

**Decision:** Default to 100 events, maximum 500

**Rationale:**
- Balance between LLM context window and data completeness
- 100 events ≈ 2000-3000 tokens (manageable for most LLMs)
- 500 events ≈ 10k-15k tokens (still within limits for detailed analysis)
- Most troubleshooting scenarios resolved with <100 events

**Alternatives Considered:**
- 50 events: Too little context for pattern detection
- 200 events: Excessive for simple queries
- Unlimited: Risk of context overflow, API performance issues

### 4. Automatic Gap Detection

**Decision:** Detect event gaps >30 minutes by default

**Rationale:**
- Gaps often indicate connectivity or power issues
- 30-minute threshold balances sensitivity vs. false positives
- Proactive detection helps LLM diagnose root causes
- Minimal computational overhead (O(n) single pass)

**Threshold Logic:**
- 30 minutes: Report as gap
- 1 hour+: Flag as likely connectivity issue
- Configurable threshold for different device types

### 5. Human-Readable Formatting

**Decision:** Format events in human-readable text by default

**Rationale:**
- LLMs comprehend natural language better than JSON
- SmartThings provides `text` field with formatted descriptions
- Reduces cognitive load during troubleshooting
- Better user experience when LLM explains findings

**Example:**
```
// Human-readable (default)
"Temperature: 72°F"
"Switch: on"

// Raw format (humanReadable: false)
"temperature=72"
"switch=on"
```

### 6. Time Range Validation

**Decision:** Auto-adjust queries exceeding 7-day retention with warning

**Rationale:**
- SmartThings API enforces 7-day limit
- Silent failures mislead troubleshooting
- Explicit warnings help LLM provide accurate advice
- Automatic adjustment provides best available data

**Implementation:**
```typescript
function validateRetentionLimit(startTime: Date) {
  if (startTime < sevenDaysAgo) {
    return {
      valid: false,
      adjustedStart: sevenDaysAgo,
      exceedsLimit: true,
      message: "Start time exceeds 7-day retention..."
    };
  }
  return { valid: true, exceedsLimit: false };
}
```

## Performance Considerations

### Token Efficiency

**Estimated Token Usage:**
- Minimal query (deviceId only): ~300 tokens
  - 100 events × 2-3 tokens/event
  - Metadata: ~100 tokens
  - Summary: ~50 tokens

- Maximum query (500 events + metadata): ~12k tokens
  - 500 events × 20-25 tokens/event
  - Metadata: ~150 tokens
  - Gap details: ~50-100 tokens

**Optimization Strategies:**
1. Default 100-event limit balances context vs. completeness
2. `includeMetadata: false` reduces ~100 tokens
3. `humanReadable: false` reduces ~5-10 tokens/event
4. Capability/attribute filtering reduces result size
5. Pagination via `limit` parameter for iterative analysis

### API Performance

**SmartThings API Characteristics:**
- Event queries are relatively fast (<1s typical)
- LocationId parameter improves query performance
- Filtering by capability/attribute done client-side
- Large result sets (>500 events) require pagination

**Optimization:**
- Always request `locationId` when available
- Use smallest effective time window
- Apply capability/attribute filters to reduce client-side processing
- Cache device info to avoid repeated lookups

## Error Handling

### Validation Errors

**Time Format:**
```json
{
  "error": "Invalid time range format: '25h'. Expected ISO-8601, epoch milliseconds, or relative format (e.g., '24h', '7d')"
}
```

**Retention Limit:**
```json
{
  "warning": "Start time exceeds 7-day retention limit. Adjusted to 2025-01-13T10:00:00Z.",
  "metadata": {
    "reachedRetentionLimit": true
  }
}
```

### Device Not Found
```json
{
  "error": "Device not found: abc-123"
}
```

### API Errors
- Automatic retry with exponential backoff (handled by ServiceContainer)
- Clear error classification (network, auth, rate limit)
- Graceful degradation with partial results when possible

## Example Usage

### Simple Query (Last 24 Hours)
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```
📊 Event History: Living Room Light
⏱️  Time Range: 2025-01-19T10:00:00Z to 2025-01-20T10:00:00Z
📈 Total Events: 42

📋 Events:
1. 1/20/2025, 9:45:23 AM - Switch: off
2. 1/20/2025, 7:30:15 AM - Switch: on
3. 1/19/2025, 11:20:42 PM - Switch: off
...
```

### Last Week with Gap Detection
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "startTime": "7d"
}
```

**Response:**
```
📊 Event History: Living Room Light
⏱️  Time Range: 2025-01-13T10:00:00Z to 2025-01-20T10:00:00Z
📈 Total Events: 156
🔍 Gap Detected: 4h 23m gap in event history (possible connectivity issue)

📋 Events:
...

🔍 Detected Gaps:
- 4h 23m gap from 1/17/2025, 2:15:30 PM to 1/17/2025, 6:38:45 PM
```

### Temperature Events Only
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "capabilities": ["temperatureMeasurement"],
  "startTime": "48h"
}
```

**Response:**
```
📊 Event History: Bedroom Sensor
⏱️  Time Range: 2025-01-18T10:00:00Z to 2025-01-20T10:00:00Z
📈 Total Events: 96
🔎 Filtered by capabilities: temperatureMeasurement

📋 Events:
1. 1/20/2025, 9:50:12 AM - Temperature: 72°F
2. 1/20/2025, 9:40:08 AM - Temperature: 71°F
3. 1/20/2025, 9:30:05 AM - Temperature: 71°F
...
```

### Custom Time Range
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "startTime": "2025-01-15T00:00:00Z",
  "endTime": "2025-01-16T00:00:00Z",
  "limit": 200
}
```

## Troubleshooting Scenarios

### Scenario 1: Device Not Responding

**LLM Query:**
```json
{
  "deviceId": "abc-123",
  "startTime": "7d"
}
```

**Analysis:**
- Check for event gaps (connectivity issues)
- Verify recent state changes (device functional)
- Identify pattern anomalies (unusual behavior)

**LLM Diagnosis:**
> "I found a 6-hour gap in events on Jan 17th from 2 PM to 8 PM, suggesting the device lost connectivity. After reconnecting, normal operation resumed. This appears to be a temporary network issue rather than a device failure."

### Scenario 2: Unexpected State Changes

**LLM Query:**
```json
{
  "deviceId": "abc-123",
  "capabilities": ["switch"],
  "startTime": "24h"
}
```

**Analysis:**
- Review switch state transitions
- Identify rapid on/off cycles
- Check for automation triggers

**LLM Diagnosis:**
> "The switch toggled on/off 47 times in the last 24 hours. This rapid cycling pattern started at 3 AM and suggests either a faulty automation rule or a failing physical switch requiring replacement."

### Scenario 3: Sensor Drift

**LLM Query:**
```json
{
  "deviceId": "abc-123",
  "capabilities": ["temperatureMeasurement"],
  "startTime": "7d",
  "limit": 500
}
```

**Analysis:**
- Analyze temperature trend
- Detect sudden jumps (sensor malfunction)
- Compare to expected range

**LLM Diagnosis:**
> "Temperature readings show a sudden 20°F jump at 2 PM on Jan 18th, then returned to normal. This suggests a sensor glitch rather than actual temperature change. The sensor appears to have recovered and is now reporting normally."

## Future Extensions

### Phase 2 - Pattern Analysis
- Anomaly detection scoring
- State transition analysis
- Multi-device correlation
- Predictive failure detection

### Phase 3 - Advanced Troubleshooting
- Root cause analysis
- Suggested remediation actions
- Historical comparison
- Device health scoring

## Testing Strategy

### Unit Tests
- Time range parsing (relative/absolute)
- Retention limit validation
- Gap detection algorithm
- Event formatting

### Integration Tests
- SmartThings API integration
- End-to-end query flow
- Error handling scenarios
- Performance benchmarks

### LLM Testing
- Query comprehension accuracy
- Troubleshooting effectiveness
- Response quality metrics
- Token efficiency validation

## Success Metrics

**Type Safety:** 95%+ type coverage with branded types
**Test Coverage:** 90%+ for event retrieval logic
**Performance:** <2s response time for 100-event queries
**Token Efficiency:** <5k tokens for typical troubleshooting query
**Accuracy:** LLM diagnostics validated against known issues

## Conclusion

This design provides a robust foundation for AI-powered troubleshooting by:
1. Flexible time range queries (relative and absolute)
2. Rich metadata for diagnostic context
3. Automatic gap detection for connectivity issues
4. Human-readable formatting for LLM comprehension
5. Performance-optimized defaults
6. Comprehensive error handling

The implementation follows established codebase patterns (branded types, Zod validation, ServiceContainer DI) while introducing event-specific functionality optimized for LLM troubleshooting workflows.
