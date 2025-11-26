# Diagnostic Tools Implementation Research

**Research Date:** 2025-11-25
**Ticket:** 1M-214 - Create debugging and diagnostics tools for troubleshooting
**Priority:** High
**Researcher:** Research Agent

---

## Executive Summary

This research provides comprehensive implementation guidance for building 6 diagnostic tools for the SmartThings MCP server. The analysis covers existing implementation patterns, SmartThings SDK capabilities for diagnostics, recommended file structure, and detailed implementation approaches for each tool.

### Key Findings

1. **Existing Pattern**: Well-established tool implementation pattern using Zod schemas, branded types, and structured error handling
2. **SDK Capabilities**: SmartThings SDK provides `devices.list()`, `devices.get()`, `devices.getStatus()` for health/status checking
3. **File Structure**: New file recommended: `src/mcp/tools/diagnostics.ts` following existing patterns
4. **Authentication**: PAT validation can be tested via API calls; OAuth2 not needed for basic diagnostics
5. **Rate Limits**: No direct API for rate limit status; must track client-side or infer from 429 errors

---

## 1. Existing Tool Implementation Patterns

### 1.1 Tool File Structure

All tools follow a consistent pattern across 5 existing tool files:

```
src/mcp/tools/
├── device-control.ts   # Device on/off operations
├── device-query.ts     # Device listing and capabilities
├── scenes.ts           # Scene execution
├── system.ts           # System configuration (logging)
├── management.ts       # Room/location management
└── index.ts            # Tool exports
```

**Key Pattern Elements:**

1. **Imports**:
```typescript
import { z } from 'zod';
import { smartThingsService } from '../../smartthings/client.js';
import { createMcpResponse } from '../../types/mcp.js';
import { createMcpError, classifyError } from '../../utils/error-handler.js';
import { deviceIdSchema } from '../../utils/validation.js';
import type { DeviceId } from '../../types/smartthings.js';
import type { McpToolInput } from '../../types/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
```

2. **Zod Schema Validation**:
```typescript
const toggleDebugSchema = z.object({
  enabled: z.boolean().describe('Enable (true) or disable (false) debug logging'),
});
```

3. **Handler Function Pattern**:
```typescript
export async function handleToolName(input: McpToolInput): Promise<CallToolResult> {
  try {
    // 1. Parse and validate input
    const { param1, param2 } = schemaName.parse(input);

    // 2. Execute business logic using smartThingsService
    const result = await smartThingsService.someMethod(param1);

    // 3. Return structured response
    return createMcpResponse('Success message', {
      data: result,
    });
  } catch (error) {
    // 4. Classify and return structured error
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}
```

4. **Tool Export Object**:
```typescript
export const diagnosticTools = {
  tool_name: {
    description: 'Human-readable description for LLM',
    inputSchema: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Parameter description',
        },
      },
      required: ['param1'],
    },
    handler: handleToolName,
  },
};
```

### 1.2 Server Registration Pattern

Tools are registered in `/Users/masa/Projects/mcp-smartthings/src/server.ts`:

```typescript
import {
  deviceControlTools,
  deviceQueryTools,
  sceneTools,
  systemTools,
  managementTools,
} from './mcp/tools/index.js';

// Combine all tools
const allTools = {
  ...deviceControlTools,
  ...deviceQueryTools,
  ...sceneTools,
  ...systemTools,
  ...managementTools,
  // Will add: ...diagnosticTools
};
```

### 1.3 Branded Types Pattern

The codebase uses TypeScript branded types for domain safety:

```typescript
// From src/types/smartthings.ts
export type DeviceId = string & { readonly __brand: 'DeviceId' };
export type LocationId = string & { readonly __brand: 'LocationId' };
export type RoomId = string & { readonly __brand: 'RoomId' };

// Helper functions
export function createDeviceId(id: string): DeviceId {
  return id as DeviceId;
}
```

### 1.4 Error Handling Pattern

**Error Classification** (`src/utils/error-handler.ts`):

```typescript
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SMARTTHINGS_API_ERROR: 'SMARTTHINGS_API_ERROR',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  CAPABILITY_NOT_SUPPORTED: 'CAPABILITY_NOT_SUPPORTED',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

export function classifyError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return ERROR_CODES.VALIDATION_ERROR;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('not found')) return ERROR_CODES.DEVICE_NOT_FOUND;
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return ERROR_CODES.AUTHENTICATION_ERROR;
    }
    if (message.includes('network') || message.includes('timeout')) {
      return ERROR_CODES.NETWORK_ERROR;
    }
    if (message.includes('capability')) {
      return ERROR_CODES.CAPABILITY_NOT_SUPPORTED;
    }
  }
  return ERROR_CODES.UNKNOWN_ERROR;
}
```

**Structured MCP Error Response**:

```typescript
export interface McpErrorResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
  code: string;
  details?: Record<string, unknown>;
}
```

### 1.5 Retry Logic Pattern

All SmartThings API calls use exponential backoff retry (`src/utils/retry.ts`):

```typescript
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
  } = options;

  // Retries on:
  // - Network errors (ECONNRESET, ETIMEDOUT)
  // - HTTP 5xx server errors
  // - HTTP 429 rate limit errors

  // No retry on:
  // - HTTP 4xx client errors (except 429)
  // - Authentication failures
}
```

---

## 2. SmartThings SDK Capabilities for Diagnostics

### 2.1 Available SDK Methods

**Device Health & Status** (`SmartThingsClient` from `@smartthings/core-sdk`):

```typescript
// Current usage in src/smartthings/client.ts:
this.client.devices.list()           // Line 64: List all devices
this.client.devices.get(deviceId)    // Line 163: Get device details
this.client.devices.getStatus(deviceId)  // Line 117: Get device status
this.client.devices.executeCommand() // Line 142: Execute command (can track failures)
this.client.locations.list()         // Line 208: List locations
this.client.rooms.list()             // Line 235: List rooms
this.client.rooms.get(roomId)        // Line 79: Get room details
this.client.scenes.list()            // Line 330: List scenes
```

### 2.2 Device Status Structure

**DeviceStatus Response** (from `src/types/smartthings.ts`):

```typescript
export interface DeviceStatus {
  deviceId: DeviceId;
  components: Record<string, ComponentStatus>;
}

export interface ComponentStatus {
  [capability: string]: {
    [attribute: string]: {
      value: unknown;
      unit?: string;
      timestamp?: string;  // Last update timestamp
    };
  };
}
```

**Example Status Response**:
```json
{
  "deviceId": "abc-123",
  "components": {
    "main": {
      "switch": {
        "switch": {
          "value": "on",
          "timestamp": "2025-11-25T10:30:00Z"
        }
      },
      "battery": {
        "battery": {
          "value": 85,
          "unit": "%",
          "timestamp": "2025-11-25T10:30:00Z"
        }
      },
      "healthCheck": {
        "healthStatus": {
          "value": "online",
          "timestamp": "2025-11-25T10:30:00Z"
        }
      }
    }
  }
}
```

### 2.3 Common Health-Related Capabilities

**Standard SmartThings Capabilities for Diagnostics**:

1. **healthCheck**:
   - Attribute: `healthStatus` (values: `online`, `offline`, `unknown`)
   - Attribute: `checkInterval` (interval for health checks)

2. **battery**:
   - Attribute: `battery` (0-100%)

3. **powerSource**:
   - Attribute: `powerSource` (values: `battery`, `dc`, `mains`, `unknown`)

4. **signalStrength**:
   - Attribute: `lqi` (Link Quality Indicator, 0-255)
   - Attribute: `rssi` (Received Signal Strength Indicator, dBm)

### 2.4 SDK Limitations for Diagnostics

**What's NOT directly available**:

1. **Rate Limit Status**: No API endpoint to check current rate limit status
   - Must track client-side or infer from 429 errors
   - SmartThings doesn't publish official rate limit numbers

2. **Command History**: No API to retrieve failed commands
   - Must be tracked client-side in application logs

3. **Token Expiration**: PATs expire after 24 hours but no API to check remaining time
   - Must track token creation time client-side

4. **System-Wide Health**: No single endpoint for "server health"
   - Must synthesize from multiple API calls

---

## 3. File Structure Recommendations

### 3.1 New File: diagnostics.ts

**Location**: `/Users/masa/Projects/mcp-smartthings/src/mcp/tools/diagnostics.ts`

**Rationale**:
- Follows existing pattern (one file per functional group)
- Groups related diagnostic tools together
- Keeps separation of concerns (diagnostics vs. control vs. query)

### 3.2 Required Additions

**1. Update tool index** (`src/mcp/tools/index.ts`):
```typescript
export * from './device-control.js';
export * from './device-query.js';
export * from './scenes.js';
export * from './system.js';
export * from './management.js';
export * from './diagnostics.js';  // ADD THIS
```

**2. Update server registration** (`src/server.ts`):
```typescript
import {
  deviceControlTools,
  deviceQueryTools,
  sceneTools,
  systemTools,
  managementTools,
  diagnosticTools,  // ADD THIS
} from './mcp/tools/index.js';

const allTools = {
  ...deviceControlTools,
  ...deviceQueryTools,
  ...sceneTools,
  ...systemTools,
  ...managementTools,
  ...diagnosticTools,  // ADD THIS
};
```

**3. Add error codes** (`src/config/constants.ts`):
```typescript
export const ERROR_CODES = {
  // ... existing codes
  TOKEN_INVALID: 'TOKEN_INVALID',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  DIAGNOSTIC_FAILED: 'DIAGNOSTIC_FAILED',
} as const;
```

### 3.3 Optional: Diagnostic State Management

For tracking command failures and rate limits, consider adding:

**Location**: `/Users/masa/Projects/mcp-smartthings/src/utils/diagnostic-tracker.ts`

**Purpose**:
- In-memory storage of recent command failures
- Rate limit tracking
- Token expiration tracking

**Basic Structure**:
```typescript
export class DiagnosticTracker {
  private commandHistory: Array<{
    timestamp: Date;
    deviceId: string;
    command: string;
    success: boolean;
    error?: string;
  }> = [];

  private rateLimitHits: Array<{
    timestamp: Date;
    endpoint: string;
  }> = [];

  private tokenCreatedAt: Date;

  // Methods for tracking and retrieval
}

export const diagnosticTracker = new DiagnosticTracker();
```

---

## 4. Implementation Approach for Each Diagnostic Tool

### 4.1 Tool: test_connection

**Purpose**: Verify API connectivity and token validation

**Input Schema**:
```typescript
const testConnectionSchema = z.object({
  // No inputs required - tests current configuration
});
```

**Implementation Approach**:

```typescript
export async function handleTestConnection(_input: McpToolInput): Promise<CallToolResult> {
  try {
    const startTime = Date.now();

    // Test 1: Try to list locations (lightweight API call)
    let locations;
    try {
      locations = await smartThingsService.listLocations();
    } catch (error) {
      return createMcpResponse('Connection test FAILED: Unable to reach SmartThings API', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        recommendation: 'Check your SMARTTHINGS_PAT environment variable and network connection',
      });
    }

    const responseTime = Date.now() - startTime;

    // Test 2: Validate we can retrieve basic data
    const deviceCount = (await smartThingsService.listDevices()).length;

    return createMcpResponse(
      `Connection test PASSED: Successfully connected to SmartThings API`,
      {
        success: true,
        responseTime: `${responseTime}ms`,
        locationsFound: locations.length,
        devicesFound: deviceCount,
        apiEndpoint: API_CONSTANTS.SMARTTHINGS_BASE_URL,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}
```

**SDK Methods Used**:
- `smartThingsService.listLocations()` - Tests basic API connectivity
- `smartThingsService.listDevices()` - Validates data retrieval

**Error Scenarios**:
- Invalid/expired PAT → AUTHENTICATION_ERROR
- Network issues → NETWORK_ERROR
- API downtime → SMARTTHINGS_API_ERROR

---

### 4.2 Tool: get_device_health

**Purpose**: Check battery, online status, last communication for a device

**Input Schema**:
```typescript
const getDeviceHealthSchema = z.object({
  deviceId: deviceIdSchema,
});
```

**Implementation Approach**:

```typescript
export async function handleGetDeviceHealth(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { deviceId } = getDeviceHealthSchema.parse(input);

    // Get device details and status
    const [device, status] = await Promise.all([
      smartThingsService.getDevice(deviceId as DeviceId),
      smartThingsService.getDeviceStatus(deviceId as DeviceId),
    ]);

    // Extract health-related data from status
    const mainComponent = status.components['main'] || status.components[Object.keys(status.components)[0]!];

    const healthData = {
      deviceId,
      deviceName: device.name,
      deviceType: device.type,

      // Health status
      healthStatus: mainComponent?.healthCheck?.healthStatus?.value || 'unknown',
      lastUpdate: mainComponent?.healthCheck?.healthStatus?.timestamp || 'unknown',

      // Battery (if applicable)
      battery: mainComponent?.battery?.battery?.value || null,
      batteryUnit: mainComponent?.battery?.battery?.unit || null,
      powerSource: mainComponent?.powerSource?.powerSource?.value || 'unknown',

      // Signal strength (if applicable)
      signalStrength: {
        rssi: mainComponent?.signalStrength?.rssi?.value || null,
        lqi: mainComponent?.signalStrength?.lqi?.value || null,
      },

      // Connectivity
      isOnline: mainComponent?.healthCheck?.healthStatus?.value === 'online',
    };

    // Build human-readable message
    const statusEmoji = healthData.isOnline ? '✓' : '✗';
    const batteryInfo = healthData.battery
      ? `\nBattery: ${healthData.battery}${healthData.batteryUnit}`
      : '';

    const message = `${statusEmoji} Device Health: ${device.name}\nStatus: ${healthData.healthStatus}${batteryInfo}\nLast Update: ${healthData.lastUpdate}`;

    return createMcpResponse(message, healthData);
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}
```

**SDK Methods Used**:
- `smartThingsService.getDevice()` - Get device metadata
- `smartThingsService.getDeviceStatus()` - Get current status including health

**Data Extraction**:
- `healthCheck.healthStatus` → Online/offline status
- `battery.battery` → Battery percentage
- `powerSource.powerSource` → Power source type
- `signalStrength.rssi/lqi` → Connection quality
- Timestamp → Last communication time

---

### 4.3 Tool: list_failed_commands

**Purpose**: Retrieve recent command failures for troubleshooting

**Input Schema**:
```typescript
const listFailedCommandsSchema = z.object({
  limit: z.number().int().positive().max(100).default(10)
    .describe('Maximum number of failed commands to return'),
  deviceId: deviceIdSchema.optional()
    .describe('Optional device ID to filter failures'),
});
```

**Implementation Approach**:

```typescript
// Requires diagnostic-tracker.ts implementation

export async function handleListFailedCommands(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { limit, deviceId } = listFailedCommandsSchema.parse(input);

    // Get failed commands from tracker
    let failures = diagnosticTracker.getFailedCommands(limit);

    // Filter by device if specified
    if (deviceId) {
      failures = failures.filter(f => f.deviceId === deviceId);
    }

    if (failures.length === 0) {
      return createMcpResponse(
        'No failed commands found in recent history',
        { count: 0, failures: [] }
      );
    }

    // Format failures for display
    const failureList = failures.map((f, idx) =>
      `${idx + 1}. ${f.deviceName || f.deviceId}\n` +
      `   Command: ${f.capability}.${f.command}\n` +
      `   Time: ${f.timestamp.toISOString()}\n` +
      `   Error: ${f.error}`
    ).join('\n\n');

    const message = `Found ${failures.length} failed command(s):\n\n${failureList}`;

    return createMcpResponse(message, {
      count: failures.length,
      failures: failures.map(f => ({
        deviceId: f.deviceId,
        deviceName: f.deviceName,
        capability: f.capability,
        command: f.command,
        timestamp: f.timestamp.toISOString(),
        error: f.error,
      })),
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}
```

**Implementation Notes**:
- Requires modification to `smartThingsService.executeCommand()` to track failures
- In-memory storage (cleared on server restart)
- Should limit history to last 100-1000 commands to prevent memory bloat

**Tracking Integration**:
```typescript
// In src/smartthings/client.ts - executeCommand method
async executeCommand(...) {
  try {
    await retryWithBackoff(async () => {
      await this.client.devices.executeCommand(deviceId, {
        capability, command, arguments: args
      });
    });

    // Track success
    diagnosticTracker.recordCommand({
      deviceId, capability, command, success: true, timestamp: new Date()
    });

  } catch (error) {
    // Track failure
    diagnosticTracker.recordCommand({
      deviceId, capability, command, success: false,
      error: error.message, timestamp: new Date()
    });
    throw error;
  }
}
```

---

### 4.4 Tool: get_system_info

**Purpose**: Server version, locations count, devices count, rate limit status

**Input Schema**:
```typescript
const getSystemInfoSchema = z.object({
  // No inputs required
});
```

**Implementation Approach**:

```typescript
export async function handleGetSystemInfo(_input: McpToolInput): Promise<CallToolResult> {
  try {
    // Gather system information
    const [locations, devices, rooms] = await Promise.all([
      smartThingsService.listLocations(),
      smartThingsService.listDevices(),
      smartThingsService.listRooms(),
    ]);

    // Group devices by type
    const devicesByType: Record<string, number> = {};
    devices.forEach(d => {
      const type = d.type || 'Unknown';
      devicesByType[type] = (devicesByType[type] || 0) + 1;
    });

    // Get rate limit status from tracker
    const rateLimitInfo = diagnosticTracker.getRateLimitStatus();

    const systemInfo = {
      server: {
        name: environment.MCP_SERVER_NAME,
        version: environment.MCP_SERVER_VERSION,
        nodeVersion: process.version,
        uptime: process.uptime(),
        environment: environment.NODE_ENV,
      },
      smartthings: {
        locations: locations.length,
        locationNames: locations.map(l => l.name),
        rooms: rooms.length,
        devices: devices.length,
        devicesByType,
      },
      rateLimits: {
        recentHits: rateLimitInfo.hitCount,
        lastHitTime: rateLimitInfo.lastHit?.toISOString() || null,
        estimatedRemaining: rateLimitInfo.estimatedRemaining,
      },
      timestamp: new Date().toISOString(),
    };

    const message =
      `System Information:\n\n` +
      `Server: ${systemInfo.server.name} v${systemInfo.server.version}\n` +
      `Locations: ${systemInfo.smartthings.locations}\n` +
      `Rooms: ${systemInfo.smartthings.rooms}\n` +
      `Devices: ${systemInfo.smartthings.devices}\n` +
      `Rate Limit Hits (24h): ${systemInfo.rateLimits.recentHits}`;

    return createMcpResponse(message, systemInfo);
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}
```

**SDK Methods Used**:
- `smartThingsService.listLocations()`
- `smartThingsService.listDevices()`
- `smartThingsService.listRooms()`

**Additional Data**:
- Server version from `environment.MCP_SERVER_VERSION`
- Node version from `process.version`
- Uptime from `process.uptime()`
- Rate limits from diagnostic tracker

---

### 4.5 Tool: validate_device_capabilities

**Purpose**: Check if device supports specific commands before execution

**Input Schema**:
```typescript
const validateDeviceCapabilitiesSchema = z.object({
  deviceId: deviceIdSchema,
  capability: z.string().describe('Capability to validate (e.g., "switch", "switchLevel")'),
  command: z.string().optional().describe('Optional specific command to validate'),
});
```

**Implementation Approach**:

```typescript
export async function handleValidateDeviceCapabilities(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { deviceId, capability, command } = validateDeviceCapabilitiesSchema.parse(input);

    // Get device details and capabilities
    const device = await smartThingsService.getDevice(deviceId as DeviceId);
    const capabilities = device.capabilities || [];

    // Check if capability is supported
    const hasCapability = capabilities.includes(capability);

    if (!hasCapability) {
      return createMcpResponse(
        `Device "${device.name}" does NOT support capability "${capability}"`,
        {
          deviceId,
          deviceName: device.name,
          requestedCapability: capability,
          supported: false,
          availableCapabilities: capabilities,
          recommendation: `Device supports: ${capabilities.join(', ')}`,
        }
      );
    }

    // If command specified, validate it exists for this capability
    let commandValidation = null;
    if (command) {
      // Get capability definition from SmartThings documentation
      // Note: SDK doesn't provide command lists, this would need to be hardcoded or fetched
      const validCommands = getCommandsForCapability(capability);
      const isValidCommand = validCommands.includes(command);

      commandValidation = {
        command,
        valid: isValidCommand,
        availableCommands: validCommands,
      };
    }

    const message = command
      ? `Device "${device.name}" ${commandValidation?.valid ? 'SUPPORTS' : 'does NOT support'} command "${command}" on capability "${capability}"`
      : `Device "${device.name}" SUPPORTS capability "${capability}"`;

    return createMcpResponse(message, {
      deviceId,
      deviceName: device.name,
      capability,
      supported: hasCapability,
      command: commandValidation,
      allCapabilities: capabilities,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

// Helper function - would need to be populated with SmartThings capability definitions
function getCommandsForCapability(capability: string): string[] {
  const capabilityCommands: Record<string, string[]> = {
    'switch': ['on', 'off'],
    'switchLevel': ['setLevel'],
    'colorControl': ['setColor', 'setHue', 'setSaturation'],
    'lock': ['lock', 'unlock'],
    'thermostatMode': ['setThermostatMode'],
    'thermostatCoolingSetpoint': ['setCoolingSetpoint'],
    'thermostatHeatingSetpoint': ['setHeatingSetpoint'],
    // Add more as needed
  };

  return capabilityCommands[capability] || [];
}
```

**SDK Methods Used**:
- `smartThingsService.getDevice()` - Get device capabilities list

**Validation Logic**:
1. Check if capability exists in device's capability list
2. Optionally validate specific command against known capability commands
3. Provide helpful error messages with available alternatives

---

### 4.6 Tool: export_diagnostics

**Purpose**: Generate comprehensive diagnostic report in JSON/markdown format

**Input Schema**:
```typescript
const exportDiagnosticsSchema = z.object({
  format: z.enum(['json', 'markdown']).default('markdown')
    .describe('Output format for diagnostic report'),
  includeDeviceHealth: z.boolean().default(true)
    .describe('Include device health status in report'),
  includeFailedCommands: z.boolean().default(true)
    .describe('Include failed command history in report'),
});
```

**Implementation Approach**:

```typescript
export async function handleExportDiagnostics(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { format, includeDeviceHealth, includeFailedCommands } = exportDiagnosticsSchema.parse(input);

    // Gather all diagnostic data
    const timestamp = new Date().toISOString();

    // 1. System info
    const [locations, devices, rooms] = await Promise.all([
      smartThingsService.listLocations(),
      smartThingsService.listDevices(),
      smartThingsService.listRooms(),
    ]);

    const report: any = {
      generatedAt: timestamp,
      server: {
        name: environment.MCP_SERVER_NAME,
        version: environment.MCP_SERVER_VERSION,
        nodeVersion: process.version,
        uptime: process.uptime(),
      },
      smartthings: {
        locations: locations.length,
        rooms: rooms.length,
        devices: devices.length,
      },
    };

    // 2. Device health (if requested)
    if (includeDeviceHealth) {
      report.deviceHealth = [];

      // Sample first 10 devices to avoid timeout
      const sampleDevices = devices.slice(0, 10);

      for (const device of sampleDevices) {
        try {
          const status = await smartThingsService.getDeviceStatus(device.deviceId);
          const mainComponent = status.components['main'] || status.components[Object.keys(status.components)[0]!];

          report.deviceHealth.push({
            deviceId: device.deviceId,
            name: device.name,
            type: device.type,
            healthStatus: mainComponent?.healthCheck?.healthStatus?.value || 'unknown',
            battery: mainComponent?.battery?.battery?.value || null,
            lastUpdate: mainComponent?.healthCheck?.healthStatus?.timestamp || null,
          });
        } catch (error) {
          report.deviceHealth.push({
            deviceId: device.deviceId,
            name: device.name,
            error: 'Failed to retrieve health status',
          });
        }
      }
    }

    // 3. Failed commands (if requested)
    if (includeFailedCommands) {
      report.failedCommands = diagnosticTracker.getFailedCommands(50);
    }

    // 4. Rate limit status
    report.rateLimits = diagnosticTracker.getRateLimitStatus();

    // Format output
    let output: string;
    if (format === 'json') {
      output = JSON.stringify(report, null, 2);
    } else {
      // Markdown format
      output = generateMarkdownReport(report);
    }

    return createMcpResponse(
      `Diagnostic report generated (${format} format)`,
      {
        format,
        report: format === 'json' ? report : undefined,
        markdown: format === 'markdown' ? output : undefined,
        timestamp,
      }
    );
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

function generateMarkdownReport(report: any): string {
  return `
# SmartThings MCP Server Diagnostic Report

**Generated:** ${report.generatedAt}

## Server Information
- **Name:** ${report.server.name}
- **Version:** ${report.server.version}
- **Node Version:** ${report.server.nodeVersion}
- **Uptime:** ${Math.floor(report.server.uptime / 60)} minutes

## SmartThings Account
- **Locations:** ${report.smartthings.locations}
- **Rooms:** ${report.smartthings.rooms}
- **Devices:** ${report.smartthings.devices}

## Device Health Summary
${report.deviceHealth ? report.deviceHealth.map((d: any) =>
  `- **${d.name}**: ${d.healthStatus}${d.battery ? ` (Battery: ${d.battery}%)` : ''}`
).join('\n') : 'Not included'}

## Failed Commands
${report.failedCommands && report.failedCommands.length > 0
  ? report.failedCommands.map((f: any) =>
      `- ${f.deviceName}: ${f.capability}.${f.command} - ${f.error}`
    ).join('\n')
  : 'No failed commands in recent history'}

## Rate Limit Status
- **Recent Hits (24h):** ${report.rateLimits.hitCount || 0}
- **Last Hit:** ${report.rateLimits.lastHit || 'Never'}
`.trim();
}
```

**SDK Methods Used**:
- `smartThingsService.listLocations()`
- `smartThingsService.listDevices()`
- `smartThingsService.listRooms()`
- `smartThingsService.getDeviceStatus()` (for sampled devices)

**Report Sections**:
1. Server metadata (version, uptime, Node version)
2. SmartThings account summary (locations, rooms, devices)
3. Device health status (sample of 10 devices to avoid timeout)
4. Failed command history (last 50)
5. Rate limit statistics

---

## 5. Implementation Challenges and Solutions

### 5.1 Challenge: No Direct Rate Limit API

**Problem**: SmartThings API doesn't expose rate limit status or quotas

**Solution**: Client-side tracking
```typescript
// In diagnostic-tracker.ts
class DiagnosticTracker {
  private rateLimitHits: Array<{ timestamp: Date; endpoint: string }> = [];

  recordRateLimitHit(endpoint: string) {
    this.rateLimitHits.push({ timestamp: new Date(), endpoint });
    // Keep only last 24 hours
    this.rateLimitHits = this.rateLimitHits.filter(
      h => Date.now() - h.timestamp.getTime() < 24 * 60 * 60 * 1000
    );
  }

  getRateLimitStatus() {
    const last24h = this.rateLimitHits.filter(
      h => Date.now() - h.timestamp.getTime() < 24 * 60 * 60 * 1000
    );

    return {
      hitCount: last24h.length,
      lastHit: last24h[last24h.length - 1]?.timestamp,
      byEndpoint: this.groupByEndpoint(last24h),
    };
  }
}
```

**Integration Point**: Modify `retry.ts` to detect 429 errors:
```typescript
function isRetryableError(error: Error): boolean {
  // Existing logic...

  if (message.includes('429') || message.includes('rate limit')) {
    diagnosticTracker.recordRateLimitHit('unknown');
    return true; // Retry with backoff
  }
}
```

### 5.2 Challenge: No Command History API

**Problem**: SmartThings doesn't provide command execution history

**Solution**: Wrap executeCommand with tracking
```typescript
// In smartthings/client.ts
async executeCommand(deviceId, capability, command, args) {
  const startTime = Date.now();

  try {
    await retryWithBackoff(async () => {
      await this.client.devices.executeCommand(deviceId, {
        capability, command, arguments: args
      });
    });

    // Success tracking
    diagnosticTracker.recordCommand({
      deviceId, capability, command,
      success: true,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    });

  } catch (error) {
    // Failure tracking
    const device = await this.getDevice(deviceId).catch(() => ({ name: 'Unknown' }));

    diagnosticTracker.recordCommand({
      deviceId,
      deviceName: device.name,
      capability,
      command,
      success: false,
      error: error.message,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    });

    throw error;
  }
}
```

### 5.3 Challenge: PAT Expiration (24 hours)

**Problem**: PATs expire after 24 hours with no refresh mechanism

**Solution**: Track token creation time and warn before expiration
```typescript
// In diagnostic-tracker.ts
class DiagnosticTracker {
  private tokenCreatedAt: Date;

  setTokenCreatedAt(date: Date) {
    this.tokenCreatedAt = date;
  }

  getTokenTimeRemaining(): number {
    const expiresAt = new Date(this.tokenCreatedAt);
    expiresAt.setHours(expiresAt.getHours() + 24);
    return Math.max(0, expiresAt.getTime() - Date.now());
  }

  isTokenExpiringSoon(): boolean {
    return this.getTokenTimeRemaining() < 60 * 60 * 1000; // < 1 hour
  }
}

// In test_connection tool
const timeRemaining = diagnosticTracker.getTokenTimeRemaining();
if (diagnosticTracker.isTokenExpiringSoon()) {
  response.warning = `PAT expires in ${Math.floor(timeRemaining / 60000)} minutes. Refresh soon.`;
}
```

### 5.4 Challenge: Large Device Count Performance

**Problem**: Checking health for all devices could timeout with 100+ devices

**Solution**:
1. Implement sampling for `export_diagnostics` (only check first 10-20 devices)
2. Add pagination support to `get_device_health` if needed
3. Use `Promise.allSettled()` instead of `Promise.all()` to prevent single failure from blocking others

```typescript
// In export_diagnostics
const deviceHealthPromises = sampleDevices.map(device =>
  smartThingsService.getDeviceStatus(device.deviceId)
    .then(status => ({ device, status, success: true }))
    .catch(error => ({ device, error, success: false }))
);

const deviceHealthResults = await Promise.allSettled(deviceHealthPromises);
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Test File**: `/Users/masa/Projects/mcp-smartthings/tests/unit/diagnostics.test.ts`

**Key Test Cases**:

1. **test_connection**:
   - ✓ Success with valid PAT
   - ✓ Failure with invalid PAT (401)
   - ✓ Network error handling
   - ✓ Response time tracking

2. **get_device_health**:
   - ✓ Device with battery capability
   - ✓ Device without battery (mains-powered)
   - ✓ Offline device
   - ✓ Device not found error

3. **list_failed_commands**:
   - ✓ Empty history
   - ✓ Multiple failures
   - ✓ Device filtering
   - ✓ Limit parameter

4. **get_system_info**:
   - ✓ All data retrieval
   - ✓ Device grouping by type
   - ✓ Rate limit reporting

5. **validate_device_capabilities**:
   - ✓ Supported capability
   - ✓ Unsupported capability
   - ✓ Command validation
   - ✓ Invalid device ID

6. **export_diagnostics**:
   - ✓ JSON format
   - ✓ Markdown format
   - ✓ Optional sections (health, failures)
   - ✓ Large device count handling

### 6.2 Integration Tests

**Test File**: `/Users/masa/Projects/mcp-smartthings/tests/integration/diagnostics.integration.test.ts`

**Setup**: Requires live SmartThings PAT

**Test Cases**:
- End-to-end tool execution through MCP server
- Real API calls with retry logic
- Diagnostic tracker state management

### 6.3 Manual Testing with Test Gateway

**Command**: `pnpm run test-gateway`

**Test Commands**:
```bash
# Test connection
call_tool test_connection {}

# Get device health
call_tool get_device_health {"deviceId": "abc-123"}

# List failed commands
call_tool list_failed_commands {"limit": 10}

# Get system info
call_tool get_system_info {}

# Validate capabilities
call_tool validate_device_capabilities {"deviceId": "abc-123", "capability": "switch"}

# Export diagnostics
call_tool export_diagnostics {"format": "markdown"}
```

---

## 7. Code Patterns to Follow

### 7.1 Zod Schema Pattern

```typescript
// Always use descriptive .describe() for each field
const schema = z.object({
  param1: z.string().describe('Clear description for LLM understanding'),
  param2: z.number().int().positive().default(10).describe('With defaults when optional'),
  param3: deviceIdSchema, // Reuse existing schemas from validation.ts
});
```

### 7.2 Handler Function Pattern

```typescript
export async function handleToolName(input: McpToolInput): Promise<CallToolResult> {
  try {
    // 1. Parse with Zod (throws on validation error)
    const validatedInput = schema.parse(input);

    // 2. Business logic with smartThingsService
    const result = await smartThingsService.method();

    // 3. Format human-readable message
    const message = `Operation completed: ${result.summary}`;

    // 4. Return structured response with data
    return createMcpResponse(message, {
      key1: result.data,
      key2: result.metadata,
    });

  } catch (error) {
    // 5. Classify and return structured error
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}
```

### 7.3 Export Pattern

```typescript
export const diagnosticTools = {
  test_connection: {
    description: 'Test SmartThings API connectivity and validate authentication token. Returns response time and account summary.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: handleTestConnection,
  },

  get_device_health: {
    description: 'Get device health status including battery level, online status, and last communication time. Useful for troubleshooting offline or unresponsive devices.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'Device UUID to check health status',
        },
      },
      required: ['deviceId'],
    },
    handler: handleGetDeviceHealth,
  },

  // ... rest of tools
};
```

### 7.4 Logging Pattern

```typescript
// Use logger from utils/logger.ts
import logger from '../../utils/logger.js';

// Log at appropriate levels
logger.debug('Starting diagnostic check', { deviceId });
logger.info('Health check completed', { deviceId, status: 'online' });
logger.warn('Device battery low', { deviceId, battery: 15 });
logger.error('Failed to retrieve health', { deviceId, error: error.message });
```

---

## 8. Potential Constraints and Limitations

### 8.1 API Rate Limits

**Constraint**: SmartThings doesn't publish official rate limits

**Mitigation**:
- Implement client-side tracking of 429 errors
- Use exponential backoff (already implemented in retry.ts)
- Limit diagnostic report to sample devices (10-20 max)
- Cache frequently accessed data when appropriate

### 8.2 PAT Expiration (24 hours)

**Constraint**: Personal Access Tokens expire every 24 hours

**Impact**: Diagnostic tools will fail after PAT expires

**Mitigation**:
- Add warning in `test_connection` when expiration is near
- Track token creation time in diagnostic tracker
- Document manual PAT refresh process
- Consider OAuth2 for production deployments

### 8.3 Command History Storage

**Constraint**: In-memory storage lost on server restart

**Impact**: `list_failed_commands` returns empty after restart

**Mitigation**:
- Document this limitation clearly
- Consider optional file-based persistence (future enhancement)
- Limit history to last 100-1000 commands to prevent memory bloat
- Add startup message indicating history is empty after restart

### 8.4 Device Health Polling Performance

**Constraint**: Getting status for 100+ devices takes significant time

**Impact**: `export_diagnostics` may timeout with large device counts

**Mitigation**:
- Implement sampling (first 10-20 devices only)
- Use `Promise.allSettled()` to prevent cascading failures
- Add optional `deviceIds` filter parameter for targeted checks
- Consider implementing pagination for health checks

### 8.5 No Real-Time Device Events

**Constraint**: SDK doesn't support WebSocket subscriptions for real-time events

**Impact**: Health status is point-in-time, not real-time

**Mitigation**:
- Document that status is snapshot, not live
- Encourage periodic polling for monitoring use cases
- Consider implementing caching with TTL for frequently accessed devices

---

## 9. Recommended Implementation Order

### Phase 1: Foundation (1-2 hours)

1. **Create `diagnostics.ts` file** with imports and basic structure
2. **Create `diagnostic-tracker.ts`** with command and rate limit tracking
3. **Update `index.ts`** and `server.ts`** to register diagnostic tools
4. **Add error codes** to `constants.ts`

### Phase 2: Simple Tools (2-3 hours)

1. **Implement `test_connection`** - No dependencies, straightforward API call
2. **Implement `get_system_info`** - Uses existing SmartThings service methods
3. **Test both tools** via test gateway

### Phase 3: Health Monitoring (2-3 hours)

1. **Implement `get_device_health`** - Parse DeviceStatus for health data
2. **Implement `validate_device_capabilities`** - Check capability support
3. **Test both tools** with various device types

### Phase 4: History Tracking (3-4 hours)

1. **Integrate tracking into `executeCommand`** in `smartthings/client.ts`
2. **Implement `list_failed_commands`** tool
3. **Test tracking** with intentional command failures

### Phase 5: Comprehensive Reporting (2-3 hours)

1. **Implement `export_diagnostics`** with JSON format
2. **Add markdown format** generation
3. **Test with large device counts** (performance validation)

### Phase 6: Testing and Documentation (2-3 hours)

1. **Write unit tests** for all handlers
2. **Write integration tests** for end-to-end flows
3. **Update README** with diagnostic tool documentation
4. **Add usage examples** to tool descriptions

**Total Estimated Time**: 12-18 hours

---

## 10. Success Criteria

### 10.1 Functional Requirements

✅ All 6 diagnostic tools implemented:
- `test_connection` - API connectivity validation
- `get_device_health` - Battery, online status, last communication
- `list_failed_commands` - Command failure history
- `get_system_info` - Server and account summary
- `validate_device_capabilities` - Capability verification
- `export_diagnostics` - Comprehensive report generation

### 10.2 Code Quality Requirements

✅ Follows existing patterns:
- Zod schema validation for all inputs
- Structured MCP responses with human-readable messages
- Comprehensive error handling with classification
- Consistent logging at appropriate levels
- TypeScript branded types for domain safety

✅ Testing coverage:
- Unit tests for all handler functions
- Integration tests for end-to-end flows
- Manual testing via test gateway

### 10.3 Documentation Requirements

✅ Tool descriptions:
- Clear, LLM-friendly descriptions for each tool
- Input parameter documentation
- Output format documentation
- Usage examples

✅ Code documentation:
- JSDoc comments for all public functions
- Inline comments for complex logic
- README updates with diagnostic tool section

### 10.4 Performance Requirements

✅ Response times:
- `test_connection`: < 2 seconds
- `get_device_health`: < 3 seconds per device
- `list_failed_commands`: < 500ms (in-memory)
- `get_system_info`: < 5 seconds
- `validate_device_capabilities`: < 2 seconds
- `export_diagnostics`: < 10 seconds (with sampling)

---

## 11. Future Enhancements (Out of Scope for 1M-214)

### 11.1 Persistent Command History

**Current**: In-memory storage, lost on restart
**Enhancement**: SQLite or file-based storage for persistent history

### 11.2 Real-Time Health Monitoring

**Current**: Point-in-time status checks
**Enhancement**: WebSocket subscriptions for real-time device events (if SmartThings API supports)

### 11.3 Historical Health Trends

**Current**: Current status only
**Enhancement**: Track device health over time, generate trend reports

### 11.4 Automated Diagnostics

**Current**: Manual tool invocation
**Enhancement**: Scheduled health checks with alerts for offline devices

### 11.5 Advanced Rate Limit Management

**Current**: Basic tracking and retry
**Enhancement**: Predictive rate limiting, request queuing, priority-based execution

---

## 12. References

### 12.1 Codebase Files

**Tool Implementation**:
- `/Users/masa/Projects/mcp-smartthings/src/mcp/tools/system.ts` - Example simple tool
- `/Users/masa/Projects/mcp-smartthings/src/mcp/tools/management.ts` - Example complex tool with SDK usage
- `/Users/masa/Projects/mcp-smartthings/src/mcp/tools/device-query.ts` - Example device querying

**Core Services**:
- `/Users/masa/Projects/mcp-smartthings/src/smartthings/client.ts` - SmartThings SDK wrapper
- `/Users/masa/Projects/mcp-smartthings/src/utils/error-handler.ts` - Error handling utilities
- `/Users/masa/Projects/mcp-smartthings/src/utils/validation.ts` - Zod schemas
- `/Users/masa/Projects/mcp-smartthings/src/utils/retry.ts` - Retry logic

**Type Definitions**:
- `/Users/masa/Projects/mcp-smartthings/src/types/smartthings.ts` - SmartThings types
- `/Users/masa/Projects/mcp-smartthings/src/types/mcp.ts` - MCP types
- `/Users/masa/Projects/mcp-smartthings/src/config/constants.ts` - Constants and error codes

### 12.2 External Documentation

**SmartThings API**:
- REST API Docs: https://developer.smartthings.com/docs/api/public/
- Capabilities Reference: https://developer.smartthings.com/docs/devices/capabilities/capabilities-reference
- SDK GitHub: https://github.com/SmartThingsCommunity/smartthings-core-sdk

**MCP Protocol**:
- Specification: https://modelcontextprotocol.io/specification/2025-06-18
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk

### 12.3 Previous Research

- `/Users/masa/Projects/mcp-smartthings/docs/research/mcp-smartthings-architecture-research-2025-11-25.md`

---

## Appendix A: Diagnostic Tracker Implementation

### Complete DiagnosticTracker Class

```typescript
// src/utils/diagnostic-tracker.ts

interface CommandRecord {
  timestamp: Date;
  deviceId: string;
  deviceName?: string;
  capability: string;
  command: string;
  success: boolean;
  error?: string;
  duration?: number;
}

interface RateLimitHit {
  timestamp: Date;
  endpoint: string;
}

export class DiagnosticTracker {
  private commandHistory: CommandRecord[] = [];
  private rateLimitHits: RateLimitHit[] = [];
  private tokenCreatedAt: Date = new Date();
  private readonly maxHistorySize = 1000;
  private readonly historyRetentionMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Record a command execution (success or failure).
   */
  recordCommand(record: CommandRecord): void {
    this.commandHistory.push(record);

    // Keep only last maxHistorySize items
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory = this.commandHistory.slice(-this.maxHistorySize);
    }

    // Clean old entries
    this.cleanOldEntries();
  }

  /**
   * Get failed commands from history.
   */
  getFailedCommands(limit: number = 50): CommandRecord[] {
    return this.commandHistory
      .filter(cmd => !cmd.success)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get all commands (success and failure).
   */
  getAllCommands(limit: number = 100): CommandRecord[] {
    return this.commandHistory.slice(-limit).reverse();
  }

  /**
   * Record a rate limit hit (429 error).
   */
  recordRateLimitHit(endpoint: string): void {
    this.rateLimitHits.push({
      timestamp: new Date(),
      endpoint,
    });

    this.cleanOldEntries();
  }

  /**
   * Get rate limit status for last 24 hours.
   */
  getRateLimitStatus() {
    const now = Date.now();
    const last24h = this.rateLimitHits.filter(
      hit => now - hit.timestamp.getTime() < this.historyRetentionMs
    );

    const byEndpoint: Record<string, number> = {};
    last24h.forEach(hit => {
      byEndpoint[hit.endpoint] = (byEndpoint[hit.endpoint] || 0) + 1;
    });

    return {
      hitCount: last24h.length,
      lastHit: last24h[last24h.length - 1]?.timestamp || null,
      byEndpoint,
      estimatedRemaining: 'Unknown', // SmartThings doesn't publish limits
    };
  }

  /**
   * Set token creation time for expiration tracking.
   */
  setTokenCreatedAt(date: Date): void {
    this.tokenCreatedAt = date;
  }

  /**
   * Get milliseconds until token expires (24 hours from creation).
   */
  getTokenTimeRemaining(): number {
    const expiresAt = new Date(this.tokenCreatedAt);
    expiresAt.setHours(expiresAt.getHours() + 24);
    return Math.max(0, expiresAt.getTime() - Date.now());
  }

  /**
   * Check if token is expiring soon (< 1 hour remaining).
   */
  isTokenExpiringSoon(): boolean {
    return this.getTokenTimeRemaining() < 60 * 60 * 1000;
  }

  /**
   * Get token expiration info.
   */
  getTokenStatus() {
    const remaining = this.getTokenTimeRemaining();
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    return {
      createdAt: this.tokenCreatedAt,
      expiresAt: new Date(this.tokenCreatedAt.getTime() + 24 * 60 * 60 * 1000),
      remainingMs: remaining,
      remainingFormatted: `${hours}h ${minutes}m`,
      expiringSoon: this.isTokenExpiringSoon(),
    };
  }

  /**
   * Clean entries older than retention period.
   */
  private cleanOldEntries(): void {
    const now = Date.now();

    this.commandHistory = this.commandHistory.filter(
      cmd => now - cmd.timestamp.getTime() < this.historyRetentionMs
    );

    this.rateLimitHits = this.rateLimitHits.filter(
      hit => now - hit.timestamp.getTime() < this.historyRetentionMs
    );
  }

  /**
   * Get diagnostic summary.
   */
  getSummary() {
    const totalCommands = this.commandHistory.length;
    const failedCommands = this.commandHistory.filter(cmd => !cmd.success).length;
    const successRate = totalCommands > 0
      ? ((totalCommands - failedCommands) / totalCommands * 100).toFixed(2)
      : '0';

    return {
      totalCommands,
      failedCommands,
      successRate: `${successRate}%`,
      rateLimitHits: this.getRateLimitStatus().hitCount,
      tokenStatus: this.getTokenStatus(),
    };
  }
}

/**
 * Singleton instance of diagnostic tracker.
 */
export const diagnosticTracker = new DiagnosticTracker();
```

---

## Appendix B: Tool Input/Output Examples

### test_connection

**Input**:
```json
{}
```

**Output**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Connection test PASSED: Successfully connected to SmartThings API"
    }
  ],
  "data": {
    "success": true,
    "responseTime": "342ms",
    "locationsFound": 2,
    "devicesFound": 45,
    "apiEndpoint": "https://api.smartthings.com/v1",
    "timestamp": "2025-11-25T10:30:00Z"
  }
}
```

### get_device_health

**Input**:
```json
{
  "deviceId": "abc-123-def-456"
}
```

**Output**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "✓ Device Health: Living Room Motion Sensor\nStatus: online\nBattery: 85%\nLast Update: 2025-11-25T10:25:00Z"
    }
  ],
  "data": {
    "deviceId": "abc-123-def-456",
    "deviceName": "Living Room Motion Sensor",
    "deviceType": "ZIGBEE",
    "healthStatus": "online",
    "lastUpdate": "2025-11-25T10:25:00Z",
    "battery": 85,
    "batteryUnit": "%",
    "powerSource": "battery",
    "signalStrength": {
      "rssi": -65,
      "lqi": 200
    },
    "isOnline": true
  }
}
```

### list_failed_commands

**Input**:
```json
{
  "limit": 5
}
```

**Output**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 2 failed command(s):\n\n1. Kitchen Light\n   Command: switch.on\n   Time: 2025-11-25T09:15:00Z\n   Error: Device offline\n\n2. Bedroom Thermostat\n   Command: thermostatMode.setThermostatMode\n   Time: 2025-11-25T08:30:00Z\n   Error: Network timeout"
    }
  ],
  "data": {
    "count": 2,
    "failures": [
      {
        "deviceId": "device-1",
        "deviceName": "Kitchen Light",
        "capability": "switch",
        "command": "on",
        "timestamp": "2025-11-25T09:15:00Z",
        "error": "Device offline"
      },
      {
        "deviceId": "device-2",
        "deviceName": "Bedroom Thermostat",
        "capability": "thermostatMode",
        "command": "setThermostatMode",
        "timestamp": "2025-11-25T08:30:00Z",
        "error": "Network timeout"
      }
    ]
  }
}
```

---

## Conclusion

This research provides a complete implementation roadmap for the 6 diagnostic tools required by ticket 1M-214. The implementation follows established patterns in the codebase, leverages available SmartThings SDK capabilities, and includes workarounds for API limitations like rate limit status and command history.

**Key Takeaways**:

1. **Consistent Patterns**: All tools follow the same Zod validation → business logic → structured response pattern
2. **SDK Coverage**: SmartThings SDK provides adequate health/status methods; gaps filled with client-side tracking
3. **Error Handling**: Comprehensive error classification and retry logic already in place
4. **Testing**: Clear testing strategy with unit, integration, and manual testing approaches
5. **Performance**: Sampling and pagination strategies for large device counts

**Next Steps**: Begin Phase 1 implementation (foundation setup) as outlined in Section 9.

**Estimated Total Implementation Time**: 12-18 hours across 6 phases.
