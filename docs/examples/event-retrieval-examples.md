# Event Retrieval Examples

Quick reference for using the `get_device_events` MCP tool.

## Basic Usage

### Last 24 Hours (Default)
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Last Week
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "startTime": "7d"
}
```

### Last Hour
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "startTime": "1h"
}
```

## Time Ranges

### Relative Time (LLM-Friendly)
```json
// 30 minutes ago
{
  "deviceId": "abc-123",
  "startTime": "30m"
}

// 48 hours ago
{
  "deviceId": "abc-123",
  "startTime": "48h"
}

// 3 days ago
{
  "deviceId": "abc-123",
  "startTime": "3d"
}
```

### Absolute Time (ISO-8601)
```json
{
  "deviceId": "abc-123",
  "startTime": "2025-01-15T00:00:00Z",
  "endTime": "2025-01-16T00:00:00Z"
}
```

### Epoch Timestamps
```json
{
  "deviceId": "abc-123",
  "startTime": 1705276800000,  // Jan 15, 2025 00:00:00 UTC
  "endTime": 1705363200000     // Jan 16, 2025 00:00:00 UTC
}
```

## Filtering

### By Capability
```json
// Temperature events only
{
  "deviceId": "abc-123",
  "capabilities": ["temperatureMeasurement"]
}

// Switch and level events
{
  "deviceId": "abc-123",
  "capabilities": ["switch", "switchLevel"]
}
```

### By Attribute
```json
// Temperature attribute only
{
  "deviceId": "abc-123",
  "attributes": ["temperature"]
}

// Multiple attributes
{
  "deviceId": "abc-123",
  "attributes": ["switch", "level"]
}
```

### Combined Filters
```json
{
  "deviceId": "abc-123",
  "startTime": "7d",
  "capabilities": ["switch"],
  "attributes": ["switch"],
  "limit": 200
}
```

## Pagination

### First 50 Events
```json
{
  "deviceId": "abc-123",
  "limit": 50
}
```

### Maximum Events (500)
```json
{
  "deviceId": "abc-123",
  "limit": 500,
  "startTime": "7d"
}
```

### Oldest First
```json
{
  "deviceId": "abc-123",
  "oldestFirst": true
}
```

## Performance Optimization

### With LocationId (Faster)
```json
{
  "deviceId": "abc-123",
  "locationId": "def-456",
  "startTime": "24h"
}
```

### Minimal Metadata (Fewer Tokens)
```json
{
  "deviceId": "abc-123",
  "includeMetadata": false,
  "humanReadable": false
}
```

## Troubleshooting Scenarios

### Check Device Connectivity
```json
{
  "deviceId": "abc-123",
  "startTime": "7d",
  "includeMetadata": true
}
// Look for gaps in metadata.gapDetected
```

### Analyze Switch Behavior
```json
{
  "deviceId": "abc-123",
  "capabilities": ["switch"],
  "startTime": "48h",
  "limit": 200
}
// Check for rapid on/off cycles
```

### Temperature Trends
```json
{
  "deviceId": "abc-123",
  "capabilities": ["temperatureMeasurement"],
  "startTime": "7d",
  "limit": 500
}
// Analyze temperature changes over time
```

### Diagnose Recent Issue
```json
{
  "deviceId": "abc-123",
  "startTime": "2025-01-19T14:00:00Z",  // When issue started
  "endTime": "2025-01-19T18:00:00Z",    // When issue ended
  "includeMetadata": true
}
// Focus on specific timeframe
```

## Response Format

### Successful Response
```typescript
{
  content: [{
    type: "text",
    text: `
📊 Event History: Living Room Light
⏱️  Time Range: 2025-01-19T10:00:00Z to 2025-01-20T10:00:00Z
📈 Total Events: 42

📋 Events:
1. 1/20/2025, 9:45:23 AM - Switch: off
2. 1/20/2025, 7:30:15 AM - Switch: on
...
    `
  }],
  data: {
    events: [
      {
        deviceId: "abc-123",
        deviceName: "Living Room Light",
        time: "2025-01-20T09:45:23Z",
        epoch: 1705745123000,
        capability: "switch",
        attribute: "switch",
        value: "off",
        text: "Switch: off"
      },
      // ... more events
    ],
    metadata: {
      totalCount: 42,
      hasMore: false,
      dateRange: {
        earliest: "2025-01-19T10:00:00Z",
        latest: "2025-01-20T09:45:23Z",
        durationMs: 86123000
      },
      appliedFilters: {},
      reachedRetentionLimit: false,
      gapDetected: false
    },
    summary: "📊 Event History: Living Room Light..."
  }
}
```

### Response with Gaps
```typescript
{
  content: [{
    type: "text",
    text: `
📊 Event History: Bedroom Sensor
⏱️  Time Range: 2025-01-13T10:00:00Z to 2025-01-20T10:00:00Z
📈 Total Events: 156
🔍 Gap Detected: 4h 23m gap in event history (possible connectivity issue)

📋 Events:
...

🔍 Detected Gaps:
- 4h 23m gap from 1/17/2025, 2:15:30 PM to 1/17/2025, 6:38:45 PM
    `
  }],
  data: {
    // ... events and metadata
    gaps: [
      {
        gapStart: "2025-01-17T14:15:30Z",
        gapEnd: "2025-01-17T18:38:45Z",
        durationMs: 15795000,
        durationText: "4h 23m",
        likelyConnectivityIssue: true
      }
    ]
  }
}
```

### Error Response
```typescript
{
  content: [{
    type: "text",
    text: "Error: Invalid time range format: '25h'. Expected ISO-8601, epoch milliseconds, or relative format (e.g., '24h', '7d')"
  }],
  isError: true
}
```

## LLM Interpretation Tips

### Check for Gaps
```typescript
if (result.data.metadata.gapDetected) {
  console.log(`Found ${result.data.gaps.length} gaps`);
  console.log(`Largest gap: ${result.data.metadata.largestGapMs}ms`);
}
```

### Identify Patterns
```typescript
// Rapid state changes (potential issue)
const switchEvents = events.filter(e => e.attribute === "switch");
const timeBetweenChanges = switchEvents.map((e, i) =>
  i > 0 ? e.epoch - switchEvents[i-1].epoch : null
).filter(Boolean);

const avgTimeMs = timeBetweenChanges.reduce((a, b) => a + b, 0) / timeBetweenChanges.length;
if (avgTimeMs < 60000) { // Less than 1 minute average
  console.log("Rapid state changes detected - possible automation issue");
}
```

### Detect Anomalies
```typescript
// Temperature spikes (sensor issue)
const tempEvents = events.filter(e => e.attribute === "temperature");
const temps = tempEvents.map(e => parseFloat(e.value));
const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
const maxDeviation = Math.max(...temps.map(t => Math.abs(t - avgTemp)));

if (maxDeviation > 10) {
  console.log("Large temperature deviation detected - possible sensor issue");
}
```

## Common Pitfalls

### ❌ Forgetting Device ID
```json
{
  "startTime": "24h"
}
// ERROR: deviceId is required
```

### ❌ Invalid Time Format
```json
{
  "deviceId": "abc-123",
  "startTime": "yesterday"
}
// ERROR: Use "24h" or ISO-8601
```

### ❌ Exceeding Retention Limit
```json
{
  "deviceId": "abc-123",
  "startTime": "30d"
}
// WARNING: Adjusted to 7-day maximum
```

### ❌ Start After End
```json
{
  "deviceId": "abc-123",
  "startTime": "2025-01-20T00:00:00Z",
  "endTime": "2025-01-19T00:00:00Z"
}
// ERROR: Start must be before end
```

### ✅ Correct Usage
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "startTime": "7d",
  "locationId": "def-456",
  "capabilities": ["switch"],
  "limit": 100
}
```
