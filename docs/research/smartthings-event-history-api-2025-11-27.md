# SmartThings API Event History Capabilities Research

**Research Date:** 2025-11-27
**Ticket:** 1M-274 - Implement AI-powered troubleshooting mode for smart home diagnostics
**Phase:** Phase 1 - Event History Foundation
**Researcher:** Claude Code (Research Agent)

## Executive Summary

SmartThings provides device event history through the `/v1/history/devices` REST API endpoint, accessible via the `@smartthings/core-sdk` version 8.4.1's `HistoryEndpoint` class. The API supports:

- ✅ **7-day event retention** with pagination support
- ✅ **Rich event data** including timestamps, device info, capability changes, and values
- ✅ **Bidirectional pagination** with epoch-based cursors
- ✅ **Multiple device filtering** via deviceId and locationId arrays
- ✅ **TypeScript interfaces** fully defined in SDK
- ⚠️ **Undocumented endpoint** - relies on SDK implementation for reference
- ⚠️ **No explicit REST API documentation** for history endpoint

**Recommendation:** Use the SDK's `client.history.devices()` method rather than direct REST calls, as it provides robust TypeScript types and handles pagination complexity.

## 1. SmartThings API Event History Endpoints

### Endpoint Information

**Base URL:** `https://api.smartthings.com/v1/history/devices`

**HTTP Method:** `GET`

**Status:** ⚠️ **Undocumented** - The endpoint exists and is functional but lacks official REST API documentation. Primary reference is the SDK implementation and SmartThings CLI.

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `locationId` | `string \| string[]` | Yes* | Location ID(s) to scope the query. Required in query string format: `?location={{locationId}}` |
| `deviceId` | `string \| string[]` | No | Device ID(s) to filter events. Can be single ID or array |
| `limit` | `number` | No | Maximum events to return (default: 20) |
| `before` | `number` | No | Epoch time in milliseconds - return events before this time (exclusive) |
| `beforeHash` | `number` | No | Hash value for disambiguation - required when `before` is specified |
| `after` | `number` | No | Epoch time in milliseconds - return events after this time (exclusive) |
| `afterHash` | `number` | No | Hash value for disambiguation - required when `after` is specified |
| `oldestFirst` | `boolean` | No | Sort order flag - true for ascending, false for descending (default: descending/newest first) |

**\*Note:** The locationId requirement is enforced by the SDK. Either specify it in the request or configure a default location on the client with `client.setLocation(id)`.

### Pagination Support

**Bidirectional Pagination:** The API uses epoch time + hash pairs for cursor-based pagination:
- **Previous Page:** Use `before` + `beforeHash` parameters
- **Next Page:** Use `after` + `afterHash` parameters
- **Hash Purpose:** Differentiates events with identical timestamps

**SDK Pagination Methods:**
```typescript
const result = await client.history.devices({ deviceId: 'abc-123' });

// Explicit paging
while (await result.next()) {
  // Process result.items
}

// Or async iteration
for await (const event of client.history.devices({ deviceId: 'abc-123' })) {
  // Process individual events
}
```

### Rate Limits

**Not Documented:** Rate limits for the history endpoint are not explicitly documented. Follow general SmartThings API rate limiting best practices:
- Use retry logic with exponential backoff (already implemented in `retryWithBackoff()`)
- Batch requests when possible
- Cache results to minimize API calls

## 2. @smartthings/core-sdk Event Methods

### SDK Support: ✅ FULLY SUPPORTED

The `@smartthings/core-sdk` v8.4.1+ includes complete support for device event history via the `HistoryEndpoint` class.

### Access Pattern

```typescript
import { SmartThingsClient, BearerTokenAuthenticator } from '@smartthings/core-sdk';

const client = new SmartThingsClient(
  new BearerTokenAuthenticator(token)
);

// Access history endpoint
const events = await client.history.devices({
  deviceId: 'device-uuid',
  limit: 50,
  oldestFirst: false
});
```

### Available Methods

**`client.history.devices(options?: DeviceHistoryRequest): Promise<PaginatedList<DeviceActivity>>`**

Primary method for querying device events. Returns a `PaginatedList` that supports:
- **Explicit pagination:** `next()` and `previous()` methods
- **Async iteration:** Can be used in `for await` loops
- **Direct access:** `items` property contains current page of events

### Type Definitions

**Complete TypeScript support available:** `/node_modules/@smartthings/core-sdk/dist/endpoint/history.d.ts`

Key interfaces:
- `DeviceActivity` - Individual event structure
- `DeviceHistoryRequest` - Query parameters
- `PaginationRequest` - Pagination controls
- `PaginatedList<T>` - Paginated result container

## 3. Event Data Structure

### DeviceActivity Interface

```typescript
export interface DeviceActivity {
  /** Device ID (UUID) */
  deviceId: string;

  /** Device nickname/label */
  deviceName: string;

  /** Location ID */
  locationId: string;

  /** Location name */
  locationName: string;

  /** ISO-8601 timestamp in UTC (e.g., "2025-11-27T10:30:45.123Z") */
  time: string;

  /** Human-readable event description (localized based on Accept-Language header) */
  text: string;

  /** Device component ID (e.g., "main") - Not nullable */
  component: string;

  /** Device component label (e.g., "Main") - Nullable */
  componentLabel?: string;

  /** Capability name (e.g., "switch", "temperatureMeasurement") */
  capability: string;

  /** Attribute name (e.g., "switch", "temperature") */
  attribute: string;

  /** Attribute value (typed as object for flexibility) */
  value: object;

  /** Unit of measurement (e.g., "F", "C", "%") */
  unit?: string;

  /** Additional event metadata */
  data?: Record<string, object>;

  /** Localized attribute name based on Accept-Language header */
  translatedAttributeName?: string;

  /** Localized attribute value based on Accept-Language header */
  translatedAttributeValue?: string;

  /** UNIX epoch timestamp in milliseconds */
  epoch: number;

  /** Hash value to differentiate events with same epoch */
  hash: number;
}
```

### Key Event Fields

**Temporal Fields:**
- `time`: ISO-8601 string (human-readable)
- `epoch`: UNIX milliseconds (for programmatic sorting/filtering)
- `hash`: Disambiguates simultaneous events

**Device Context:**
- `deviceId`, `deviceName`: Device identification
- `locationId`, `locationName`: Location context
- `component`, `componentLabel`: Multi-component device support

**State Change Information:**
- `capability`: What capability changed (e.g., "switch", "motionSensor")
- `attribute`: Which attribute changed (e.g., "switch", "motion")
- `value`: New value (previous value not included)
- `unit`: Measurement unit if applicable

**Localization:**
- `text`: Pre-formatted human-readable description
- `translatedAttributeName`, `translatedAttributeValue`: I18n support

### Event Types Available

Based on the event structure and SmartThings documentation, events cover:

1. **Device State Changes** (`DEVICE_EVENT`)
   - Capability attribute changes (switch on/off, temperature readings, etc.)
   - Component-level changes for multi-component devices

2. **Device Health Events** (`DEVICE_HEALTH_EVENT`)
   - Online/offline status changes
   - Connectivity issues

3. **Device Lifecycle Events** (`DEVICE_LIFECYCLE_EVENT`)
   - Device creation, updates, deletion
   - Device relocation between rooms/locations

**Note:** The `/v1/history/devices` endpoint primarily returns `DEVICE_EVENT` types (state changes). Other event types may require different endpoints or subscription mechanisms.

### Missing Information: Previous Values

⚠️ **Important Limitation:** The `DeviceActivity` interface does **not include previous values**. Each event only contains:
- Current/new value
- Timestamp of change

To track state transitions, you must:
1. Query events in chronological order
2. Compare consecutive events for the same attribute
3. Maintain state history in your application

Example:
```typescript
// Event 1: { attribute: "switch", value: "on", time: "10:30:00" }
// Event 2: { attribute: "switch", value: "off", time: "10:32:00" }
// Inference: Switch was turned off at 10:32:00 (was on from 10:30-10:32)
```

## 4. Historical Data Retention

### Retention Period: 7 Days

**Maximum History:** Events are retained for **7 days** from the event timestamp.

**Source:** SmartThings Community forums and CLI documentation consistently reference 7-day retention.

**Implications:**
- Cannot query events older than 7 days
- Troubleshooting mode should focus on recent issues (last week)
- For longer-term analysis, implement local event storage/caching

### No Retention Tiers

**Single Retention Policy:** All event types appear to use the same 7-day retention period. No documented differences between:
- State change events
- Health events
- Lifecycle events

## 5. Authentication & Permissions

### Required Authentication

**Method:** Bearer Token (Personal Access Token - PAT)

**Header Format:**
```
Authorization: Bearer {PAT_TOKEN}
```

### SDK Authentication

```typescript
import { BearerTokenAuthenticator } from '@smartthings/core-sdk';

const authenticator = new BearerTokenAuthenticator(
  process.env.SMARTTHINGS_PAT
);

const client = new SmartThingsClient(authenticator);
```

### Required OAuth Scopes

**Primary Scope:** `r:devices:*` (Read devices)

**Scope Format:** `permission:entity-type:entity-id`
- `r` = Read permission
- `devices` = Entity type
- `*` = All devices (wildcard)

**When Creating PAT:**
1. Navigate to https://account.smartthings.com/tokens
2. Click "Generate new token"
3. Select minimum permissions:
   - ✅ "List all devices"
   - ✅ "See details for all devices"
4. This grants `r:devices:*` scope

**Additional Scopes (if needed):**
- `w:devices:*` - Write/update device settings
- `x:devices:*` - Execute commands on devices
- `r:locations:*` - Read location information

### Current Implementation Compatibility

✅ **Our PAT token approach is sufficient** - The existing `BearerTokenAuthenticator` with a PAT token that has `r:devices:*` scope will work for event history retrieval.

**Verification:** Check current PAT scopes in environment configuration.

### PAT Expiration (Important Update)

⚠️ **PAT Expiration Policy Changed (Dec 30, 2024):**
- **New PATs:** Valid for **24 hours** from creation
- **Legacy PATs:** Created before Dec 30, 2024 may have up to 50-year expiration

**Action Required:** Implement PAT refresh mechanism or document PAT renewal process for users.

## 6. Recommended Implementation Approach

### Option 1: Use SDK Method (RECOMMENDED) ✅

**Advantages:**
- Type-safe TypeScript interfaces
- Built-in pagination handling
- Error handling and retries (when combined with our `retryWithBackoff()`)
- Future-proof against API changes

**Implementation:**
```typescript
// Add to SmartThingsService class
async getDeviceEvents(
  deviceId: DeviceId,
  options?: {
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    oldestFirst?: boolean;
  }
): Promise<DeviceActivity[]> {
  logger.debug('Fetching device events', { deviceId, options });

  const historyRequest: DeviceHistoryRequest = {
    deviceId,
    limit: options?.limit ?? 50,
    oldestFirst: options?.oldestFirst ?? false,
  };

  // Convert Date to epoch milliseconds
  if (options?.startTime) {
    historyRequest.after = options.startTime.getTime();
  }
  if (options?.endTime) {
    historyRequest.before = options.endTime.getTime();
  }

  const result = await retryWithBackoff(async () => {
    return await this.client.history.devices(historyRequest);
  });

  // Collect all events (handles pagination automatically)
  const events: DeviceActivity[] = [];
  for await (const event of result) {
    events.push(event);
  }

  logger.info('Device events retrieved', {
    deviceId,
    count: events.length
  });

  return events;
}
```

### Option 2: Direct REST API Calls (NOT RECOMMENDED)

**Disadvantages:**
- Undocumented endpoint (may change without notice)
- Manual type definitions required
- Complex pagination logic
- No SDK safety net

**Only use if SDK is unavailable or has bugs.**

### Integration Points

**File Locations:**
- **Service Layer:** `/src/smartthings/client.ts` (SmartThingsService class)
- **Type Definitions:** `/src/types/smartthings.ts` (add event types)
- **MCP Tools:** New tool file `/src/mcp/tools/device-events.ts`
- **Interface:** `/src/services/interfaces.ts` (extend ISmartThingsService)

## 7. TypeScript Interface Definitions

### Recommended Type Additions

Add to `/src/types/smartthings.ts`:

```typescript
/**
 * Device event history activity.
 * Based on @smartthings/core-sdk DeviceActivity interface.
 */
export interface DeviceEvent {
  /** Device ID */
  deviceId: DeviceId;

  /** Device name/label */
  deviceName: string;

  /** Location context */
  locationId: string;
  locationName: string;

  /** Event timestamp (ISO-8601) */
  time: string;

  /** Event timestamp (Unix epoch milliseconds) */
  epoch: number;

  /** Human-readable event description */
  text: string;

  /** Device component (e.g., "main") */
  component: string;
  componentLabel?: string;

  /** Capability and attribute that changed */
  capability: string;
  attribute: string;

  /** New value and unit */
  value: unknown;
  unit?: string;

  /** Additional metadata */
  data?: Record<string, unknown>;

  /** Hash for event disambiguation */
  hash: number;

  /** Localized names/values */
  translatedAttributeName?: string;
  translatedAttributeValue?: string;
}

/**
 * Options for querying device event history.
 */
export interface DeviceEventOptions {
  /** Start time for event range (inclusive) */
  startTime?: Date;

  /** End time for event range (inclusive) */
  endTime?: Date;

  /** Maximum number of events to return */
  limit?: number;

  /** Sort oldest events first (default: false/newest first) */
  oldestFirst?: boolean;

  /** Filter by specific capabilities */
  capabilities?: string[];

  /** Filter by specific attributes */
  attributes?: string[];
}

/**
 * Device event query result with metadata.
 */
export interface DeviceEventResult {
  /** Device ID queried */
  deviceId: DeviceId;

  /** Events matching query */
  events: DeviceEvent[];

  /** Total events returned */
  count: number;

  /** Query parameters used */
  query: DeviceEventOptions;

  /** Time range covered (calculated from events) */
  timeRange?: {
    earliest: string;
    latest: string;
  };
}
```

### Type Conversion Utility

```typescript
/**
 * Convert SDK DeviceActivity to our DeviceEvent type.
 */
export function toDeviceEvent(activity: DeviceActivity): DeviceEvent {
  return {
    deviceId: activity.deviceId as DeviceId,
    deviceName: activity.deviceName,
    locationId: activity.locationId,
    locationName: activity.locationName,
    time: activity.time,
    epoch: activity.epoch,
    text: activity.text,
    component: activity.component,
    componentLabel: activity.componentLabel,
    capability: activity.capability,
    attribute: activity.attribute,
    value: activity.value,
    unit: activity.unit,
    data: activity.data,
    hash: activity.hash,
    translatedAttributeName: activity.translatedAttributeName,
    translatedAttributeValue: activity.translatedAttributeValue,
  };
}
```

## 8. Example API Calls / SDK Usage

### Example 1: Get Recent Events for a Device

```typescript
// Get last 24 hours of events for a switch
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

const events = await smartThingsService.getDeviceEvents(deviceId, {
  startTime: yesterday,
  limit: 100,
  oldestFirst: false, // Newest first
});

console.log(`Found ${events.length} events in last 24 hours`);
for (const event of events) {
  console.log(`${event.time}: ${event.text}`);
  console.log(`  ${event.attribute} = ${event.value} ${event.unit || ''}`);
}
```

### Example 2: Detect Pattern (Light Turning On Randomly)

```typescript
// Troubleshooting: Find all "on" events for a light in last 7 days
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

const events = await smartThingsService.getDeviceEvents(lightDeviceId, {
  startTime: sevenDaysAgo,
  oldestFirst: true, // Chronological order
});

// Filter for "on" events during night hours (10 PM - 6 AM)
const nightTimeOnEvents = events.filter(event => {
  if (event.attribute !== 'switch' || event.value !== 'on') {
    return false;
  }

  const hour = new Date(event.time).getHours();
  return hour >= 22 || hour < 6; // 10 PM - 6 AM
});

console.log(`Found ${nightTimeOnEvents.length} night-time activations`);

// Analyze trigger sources
const sources = nightTimeOnEvents.map(event => ({
  time: event.time,
  source: event.data?.source || 'unknown',
  text: event.text,
}));

console.log('Activation sources:', sources);
```

### Example 3: Compare Device States Over Time

```typescript
// Track temperature changes for a sensor
const events = await smartThingsService.getDeviceEvents(sensorId, {
  startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
  oldestFirst: true,
});

const temperatureEvents = events.filter(
  event => event.capability === 'temperatureMeasurement'
);

// Calculate rate of change
for (let i = 1; i < temperatureEvents.length; i++) {
  const prev = temperatureEvents[i - 1];
  const curr = temperatureEvents[i];

  const tempChange = Number(curr.value) - Number(prev.value);
  const timeChange = curr.epoch - prev.epoch; // milliseconds
  const hoursElapsed = timeChange / (1000 * 60 * 60);

  const ratePerHour = tempChange / hoursElapsed;

  console.log(
    `${curr.time}: ${curr.value}°${curr.unit} ` +
    `(${tempChange > 0 ? '+' : ''}${tempChange.toFixed(1)}°, ` +
    `${ratePerHour.toFixed(2)}°/hour)`
  );
}
```

### Example 4: Async Iteration for Large Datasets

```typescript
// Process events in chunks without loading all into memory
let eventCount = 0;
let switchOnCount = 0;

for await (const event of client.history.devices({ deviceId })) {
  eventCount++;

  if (event.attribute === 'switch' && event.value === 'on') {
    switchOnCount++;
  }

  // Process event immediately
  await processEvent(event);
}

console.log(`Processed ${eventCount} events, ${switchOnCount} switch-on events`);
```

## 9. Limitations and Caveats

### 1. 7-Day Retention Limit ⚠️

**Impact:** Cannot analyze long-term patterns or historical trends beyond one week.

**Mitigation:**
- Implement local event caching/storage for long-term analysis
- Document retention limitation in troubleshooting mode
- Focus on recent issues (last 7 days)

### 2. No Previous Values ⚠️

**Impact:** Events only contain new values, not previous values.

**Mitigation:**
- Query events chronologically (`oldestFirst: true`)
- Compare consecutive events to infer state transitions
- Maintain state history in application memory

### 3. Undocumented Endpoint ⚠️

**Impact:** REST API may change without notice; limited official documentation.

**Mitigation:**
- **Use SDK exclusively** - abstracts API changes
- Monitor SDK release notes for breaking changes
- Test event retrieval after SDK updates

### 4. Location Scoping Required ⚠️

**Impact:** Must provide locationId or configure default location.

**Mitigation:**
```typescript
// Option 1: Provide locationId in query
await client.history.devices({
  deviceId,
  locationId: device.locationId
});

// Option 2: Set default location on client
client.setLocation(locationId);
await client.history.devices({ deviceId });
```

### 5. Rate Limiting (Unknown) ⚠️

**Impact:** Rate limits not documented; risk of throttling.

**Mitigation:**
- Use existing `retryWithBackoff()` wrapper
- Implement request caching
- Batch queries when possible
- Monitor for 429 (Too Many Requests) responses

### 6. Event Type Filtering Limitations ⚠️

**Impact:** Cannot filter by event type (DEVICE_EVENT vs DEVICE_HEALTH_EVENT) in query parameters.

**Mitigation:**
- Filter events client-side after retrieval
- Use `capability` and `attribute` fields to identify relevant events

### 7. No Real-Time Events ⚠️

**Impact:** History endpoint is polling-based, not real-time.

**Mitigation:**
- For real-time needs, use SmartThings webhook subscriptions
- Combine history (for context) + subscriptions (for real-time)

### 8. PAT Token Expiration (24 Hours) ⚠️

**Impact:** New PATs expire after 24 hours.

**Mitigation:**
- Document PAT renewal process for users
- Consider OAuth 2.0 flow for production applications
- Monitor token expiration and prompt renewal

## 10. Implementation Checklist

### Phase 1: Core Event Retrieval ✅

- [x] Research SmartThings event history API capabilities
- [ ] Add `DeviceEvent` types to `/src/types/smartthings.ts`
- [ ] Extend `ISmartThingsService` interface with event methods
- [ ] Implement `getDeviceEvents()` in `SmartThingsService`
- [ ] Add unit tests for event retrieval
- [ ] Add integration tests with mock SmartThings API

### Phase 2: MCP Tool Integration

- [ ] Create `/src/mcp/tools/device-events.ts` MCP tool
- [ ] Define MCP tool schema for `getDeviceEvents`
- [ ] Implement tool handler with validation
- [ ] Add tool to MCP server tool list
- [ ] Document MCP tool usage in README

### Phase 3: Event Analysis Utilities

- [ ] Create event filtering utilities (by capability, attribute, time range)
- [ ] Implement event pattern detection algorithms
- [ ] Add event correlation logic (multi-device events)
- [ ] Build event timeline visualization helpers

### Phase 4: Troubleshooting Mode Integration

- [ ] Integrate event retrieval into troubleshooting workflow
- [ ] Add event analysis to system prompts
- [ ] Implement automated pattern recognition
- [ ] Create fix recommendation engine

## 11. References

### Official Documentation
- SmartThings API: https://developer.smartthings.com/docs/api/public
- Enterprise Eventing: https://developer.smartthings.com/docs/enterprise/enterprise-api-overview/eventing/overview
- Authorization: https://developer.smartthings.com/docs/getting-started/authorization-and-permissions

### SDK Resources
- SmartThings Core SDK: https://github.com/SmartThingsCommunity/smartthings-core-sdk
- SDK History Endpoint: https://github.com/SmartThingsCommunity/smartthings-core-sdk/blob/main/src/endpoint/history.ts
- SDK NPM Package: https://www.npmjs.com/package/@smartthings/core-sdk

### Community Resources
- SmartThings Community Forum: https://community.smartthings.com/
- History API Discussion: https://community.smartthings.com/t/smartthings-history-via-api/276392

### Tools
- SmartThings CLI: https://github.com/SmartThingsCommunity/smartthings-cli
- Personal Access Tokens: https://account.smartthings.com/tokens

## 12. Next Steps

1. **Implement Core Event Retrieval** (Priority: HIGH)
   - Add type definitions to codebase
   - Implement `getDeviceEvents()` method in `SmartThingsService`
   - Write comprehensive tests

2. **Create MCP Tool** (Priority: HIGH)
   - Expose event retrieval as MCP tool
   - Document tool parameters and usage
   - Add tool to server configuration

3. **Validate PAT Scopes** (Priority: MEDIUM)
   - Verify current PAT has `r:devices:*` scope
   - Test event retrieval with current token
   - Document required scopes in setup guide

4. **Implement Event Analysis** (Priority: MEDIUM)
   - Build event filtering and correlation utilities
   - Create pattern detection algorithms
   - Develop troubleshooting heuristics

5. **Plan for Real-Time Events** (Priority: LOW)
   - Research SmartThings webhook subscriptions
   - Evaluate need for real-time event stream
   - Design hybrid architecture (history + subscriptions)

## Appendix A: Example Event JSON Response

```json
{
  "deviceId": "abc-123-def-456",
  "deviceName": "Living Room Light",
  "locationId": "loc-789",
  "locationName": "Home",
  "time": "2025-11-27T14:30:45.123Z",
  "text": "Living Room Light switch is on",
  "component": "main",
  "componentLabel": "Main",
  "capability": "switch",
  "attribute": "switch",
  "value": "on",
  "unit": null,
  "data": {
    "source": "automation",
    "automationId": "auto-456"
  },
  "translatedAttributeName": "Switch",
  "translatedAttributeValue": "On",
  "epoch": 1732716645123,
  "hash": 12345
}
```

## Appendix B: Complete Service Method Implementation

```typescript
// Add to src/smartthings/client.ts

import type { DeviceActivity } from '@smartthings/core-sdk';
import type {
  DeviceEvent,
  DeviceEventOptions,
  DeviceEventResult
} from '../types/smartthings.js';

/**
 * Get event history for a device.
 *
 * Retrieves up to 7 days of historical events for the specified device.
 * Events include state changes, capability updates, and device activities.
 *
 * @param deviceId Device UUID
 * @param options Query options (time range, limit, sort order, filters)
 * @returns Array of device events with metadata
 * @throws Error if device not found or API request fails
 *
 * @example
 * // Get last 24 hours of events
 * const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
 * const events = await service.getDeviceEvents(deviceId, {
 *   startTime: yesterday,
 *   limit: 100
 * });
 *
 * @example
 * // Get all "switch" capability events
 * const events = await service.getDeviceEvents(deviceId, {
 *   capabilities: ['switch']
 * });
 */
async getDeviceEvents(
  deviceId: DeviceId,
  options?: DeviceEventOptions
): Promise<DeviceEventResult> {
  logger.debug('Fetching device events', { deviceId, options });

  // Get device info for location context
  const device = await this.getDevice(deviceId);

  // Build history request
  const historyRequest = {
    deviceId,
    locationId: device.locationId,
    limit: options?.limit ?? 50,
    oldestFirst: options?.oldestFirst ?? false,
    ...(options?.startTime && { after: options.startTime.getTime() }),
    ...(options?.endTime && { before: options.endTime.getTime() }),
  };

  // Fetch events with retry logic
  const result = await retryWithBackoff(async () => {
    return await this.client.history.devices(historyRequest);
  });

  // Collect all events (handles pagination)
  const allEvents: DeviceActivity[] = [];
  for await (const event of result) {
    allEvents.push(event);
  }

  // Apply client-side filters
  let filteredEvents = allEvents;

  if (options?.capabilities) {
    filteredEvents = filteredEvents.filter(event =>
      options.capabilities!.includes(event.capability)
    );
  }

  if (options?.attributes) {
    filteredEvents = filteredEvents.filter(event =>
      options.attributes!.includes(event.attribute)
    );
  }

  // Convert to our type
  const events: DeviceEvent[] = filteredEvents.map(toDeviceEvent);

  // Calculate time range
  const timeRange = events.length > 0 ? {
    earliest: events[events.length - 1]!.time,
    latest: events[0]!.time,
  } : undefined;

  logger.info('Device events retrieved', {
    deviceId,
    count: events.length,
    filtered: filteredEvents.length !== allEvents.length,
    timeRange,
  });

  return {
    deviceId,
    events,
    count: events.length,
    query: options ?? {},
    timeRange,
  };
}
```

---

**End of Research Document**
