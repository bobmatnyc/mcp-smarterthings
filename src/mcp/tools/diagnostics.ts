import { z } from 'zod';
import { smartThingsService } from '../../smartthings/client.js';
import { createMcpResponse } from '../../types/mcp.js';
import { createMcpError, classifyError } from '../../utils/error-handler.js';
import { deviceIdSchema } from '../../utils/validation.js';
import { diagnosticTracker } from '../../utils/diagnostic-tracker.js';
import { environment } from '../../config/environment.js';
import { API_CONSTANTS } from '../../config/constants.js';
import type { DeviceId } from '../../types/smartthings.js';
import type { McpToolInput } from '../../types/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import logger from '../../utils/logger.js';

/**
 * Diagnostic tools for troubleshooting SmartThings integration.
 *
 * These tools help users diagnose issues with API connectivity, device health,
 * command failures, and system configuration.
 *
 * Design Decision: All-in-one diagnostics file
 * Rationale: Diagnostic tools are conceptually related and share similar patterns.
 * Grouping them together improves maintainability and discoverability.
 */

// ============================================================================
// Input Schemas
// ============================================================================

// Schema for test_connection (no inputs required)
// const testConnectionSchema = z.object({});

const getDeviceHealthSchema = z.object({
  deviceId: deviceIdSchema,
});

const listFailedCommandsSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(10)
    .describe('Maximum number of failed commands to return'),
  deviceId: deviceIdSchema.optional().describe('Optional device ID to filter failures'),
});

// Schema for get_system_info (no inputs required)
// const getSystemInfoSchema = z.object({});

const validateDeviceCapabilitiesSchema = z.object({
  deviceId: deviceIdSchema,
  capability: z.string().describe('Capability to validate (e.g., "switch", "switchLevel")'),
  command: z.string().optional().describe('Optional specific command to validate'),
});

const exportDiagnosticsSchema = z.object({
  format: z
    .enum(['json', 'markdown'])
    .default('markdown')
    .describe('Output format for diagnostic report'),
  includeDeviceHealth: z.boolean().default(true).describe('Include device health status in report'),
  includeFailedCommands: z
    .boolean()
    .default(true)
    .describe('Include failed command history in report'),
  maxDevices: z
    .number()
    .int()
    .positive()
    .max(50)
    .default(10)
    .describe('Maximum number of devices to check health for'),
});

// ============================================================================
// Type Definitions
// ============================================================================

interface DeviceHealthEntry {
  deviceId: string;
  name: string;
  type?: string;
  healthStatus: string;
  battery?: number | null;
  lastUpdate?: string | null;
  isOnline?: boolean;
  error?: string;
}

interface FailedCommandEntry {
  deviceId: string;
  deviceName?: string;
  capability: string;
  command: string;
  timestamp: string;
  error?: string;
  duration?: number;
}

interface CommandStats {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  successRate: string;
}

interface RateLimitInfo {
  hitCount: number;
  lastHit: Date | null;
  byEndpoint: Record<string, number>;
  estimatedRemaining?: number | string;
}

interface TokenStatus {
  createdAt: Date;
  expiresAt: Date;
  remainingFormatted: string;
  expiringSoon: boolean;
}

interface DiagnosticReport {
  generatedAt: string;
  server: {
    name: string;
    version: string;
    nodeVersion: string;
    uptime: number;
    environment: string;
  };
  smartthings: {
    locations: number;
    locationNames?: string[];
    rooms: number;
    devices: number;
    devicesByType: Record<string, number>;
  };
  commands: CommandStats;
  rateLimits: RateLimitInfo;
  token: TokenStatus;
  deviceHealth?: DeviceHealthEntry[];
  failedCommands?: FailedCommandEntry[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get available commands for a SmartThings capability.
 *
 * Design Decision: Static capability-to-commands mapping
 * Rationale: SmartThings SDK doesn't provide command enumeration API.
 * Using documented standard capabilities from SmartThings documentation.
 *
 * Future Enhancement: Load from external JSON file for easier updates
 */
function getCommandsForCapability(capability: string): string[] {
  const capabilityCommands: Record<string, string[]> = {
    switch: ['on', 'off'],
    switchLevel: ['setLevel'],
    colorControl: ['setColor', 'setHue', 'setSaturation'],
    colorTemperature: ['setColorTemperature'],
    lock: ['lock', 'unlock'],
    thermostatMode: ['setThermostatMode', 'auto', 'cool', 'heat', 'off'],
    thermostatCoolingSetpoint: ['setCoolingSetpoint'],
    thermostatHeatingSetpoint: ['setHeatingSetpoint'],
    thermostatFanMode: ['setThermostatFanMode'],
    windowShade: ['open', 'close', 'pause'],
    valve: ['open', 'close'],
    alarm: ['off', 'both', 'siren', 'strobe'],
    tone: ['beep'],
    notification: ['deviceNotification'],
    mediaPlayback: ['play', 'pause', 'stop'],
    mediaTrackControl: ['nextTrack', 'previousTrack'],
    audioVolume: ['setVolume', 'volumeUp', 'volumeDown', 'mute', 'unmute'],
  };

  return capabilityCommands[capability] || [];
}

/**
 * Generate markdown format diagnostic report.
 *
 * @param report Report data structure
 * @returns Formatted markdown string
 */
function generateMarkdownReport(report: DiagnosticReport): string {
  const deviceHealthSection =
    report.deviceHealth && report.deviceHealth.length > 0
      ? report.deviceHealth
          .map(
            (d) =>
              `- **${d.name}**: ${d.healthStatus}${d.battery ? ` (Battery: ${d.battery}%)` : ''}${d.error ? ` - ERROR: ${d.error}` : ''}`
          )
          .join('\n')
      : 'Not included in report';

  const failedCommandsSection =
    report.failedCommands && report.failedCommands.length > 0
      ? report.failedCommands
          .map(
            (f) =>
              `- **${f.deviceName ?? f.deviceId}**: ${f.capability}.${f.command}\n  Error: ${f.error}\n  Time: ${f.timestamp}`
          )
          .join('\n\n')
      : 'No failed commands in recent history';

  const deviceTypeBreakdown = report.smartthings.devicesByType
    ? Object.entries(report.smartthings.devicesByType)
        .map(([type, count]) => `- **${type}**: ${count}`)
        .join('\n')
    : 'No devices';

  const rateLimitByEndpoint =
    report.rateLimits.byEndpoint && Object.keys(report.rateLimits.byEndpoint).length > 0
      ? '\n### By Endpoint\n' +
        Object.entries(report.rateLimits.byEndpoint)
          .map(([endpoint, count]) => `- **${endpoint}**: ${String(count)}`)
          .join('\n')
      : '';

  return `# SmartThings MCP Server Diagnostic Report

**Generated:** ${report.generatedAt}

## Server Information
- **Name:** ${report.server.name}
- **Version:** ${report.server.version}
- **Node Version:** ${report.server.nodeVersion}
- **Uptime:** ${Math.floor(report.server.uptime / 60)} minutes
- **Environment:** ${report.server.environment}

## SmartThings Account
- **Locations:** ${report.smartthings.locations}
${report.smartthings.locationNames ? `- **Location Names:** ${report.smartthings.locationNames.join(', ')}` : ''}
- **Rooms:** ${report.smartthings.rooms}
- **Devices:** ${report.smartthings.devices}

### Device Breakdown by Type
${deviceTypeBreakdown}

## Device Health Summary
${deviceHealthSection}

## Command Statistics
- **Total Commands:** ${report.commands.totalCommands}
- **Successful:** ${report.commands.successfulCommands}
- **Failed:** ${report.commands.failedCommands}
- **Success Rate:** ${report.commands.successRate}

## Failed Commands
${failedCommandsSection}

## Rate Limit Status
- **Recent Hits (24h):** ${report.rateLimits.hitCount}
- **Last Hit:** ${report.rateLimits.lastHit ? report.rateLimits.lastHit.toISOString() : 'Never'}
${rateLimitByEndpoint}

## Token Status
- **Created At:** ${report.token.createdAt.toISOString()}
- **Expires At:** ${report.token.expiresAt.toISOString()}
- **Time Remaining:** ${report.token.remainingFormatted}
- **Expiring Soon:** ${report.token.expiringSoon ? '⚠️ Yes' : 'No'}
`.trim();
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Test SmartThings API connectivity and validate authentication token.
 *
 * MCP Tool: test_connection
 * Input: {}
 * Output: Connection status, response time, and account summary
 *
 * Use Cases:
 * - Verify PAT is valid before performing operations
 * - Diagnose authentication failures
 * - Check API availability
 * - Measure baseline API performance
 */
export async function handleTestConnection(_input: McpToolInput): Promise<CallToolResult> {
  try {
    const startTime = Date.now();

    // Test 1: Try to list locations (lightweight API call)
    let locations;
    try {
      locations = await smartThingsService.listLocations();
    } catch (error) {
      // Connection failed - provide helpful error message
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return createMcpResponse('Connection test FAILED: Unable to reach SmartThings API', {
        success: false,
        error: errorMsg,
        recommendation:
          'Check your SMARTTHINGS_PAT environment variable and network connection. Ensure the PAT has not expired (PATs expire after 24 hours).',
        apiEndpoint: API_CONSTANTS.SMARTTHINGS_BASE_URL,
      });
    }

    const responseTime = Date.now() - startTime;

    // Test 2: Validate we can retrieve basic data
    const [devices, rooms] = await Promise.all([
      smartThingsService.listDevices(),
      smartThingsService.listRooms(),
    ]);

    // Check token expiration status
    const tokenStatus = diagnosticTracker.getTokenStatus();
    const expirationWarning = tokenStatus.expiringSoon
      ? ` ⚠️ Warning: PAT expires in ${tokenStatus.remainingFormatted}. Refresh soon.`
      : '';

    return createMcpResponse(
      `Connection test PASSED: Successfully connected to SmartThings API${expirationWarning}`,
      {
        success: true,
        responseTime: `${responseTime}ms`,
        locationsFound: locations.length,
        locationNames: locations.map((l) => l.name),
        devicesFound: devices.length,
        roomsFound: rooms.length,
        apiEndpoint: API_CONSTANTS.SMARTTHINGS_BASE_URL,
        timestamp: new Date().toISOString(),
        tokenStatus: {
          remainingTime: tokenStatus.remainingFormatted,
          expiringSoon: tokenStatus.expiringSoon,
        },
      }
    );
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Get device health status including battery, online status, and last communication.
 *
 * MCP Tool: get_device_health
 * Input: { deviceId: string }
 * Output: Device health report with battery, connectivity, and signal strength
 *
 * Use Cases:
 * - Troubleshoot offline or unresponsive devices
 * - Check battery level before replacing
 * - Verify signal strength for connectivity issues
 * - Confirm last communication timestamp
 */
export async function handleGetDeviceHealth(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { deviceId } = getDeviceHealthSchema.parse(input);

    // Get device details and status
    const [device, status] = await Promise.all([
      smartThingsService.getDevice(deviceId as DeviceId),
      smartThingsService.getDeviceStatus(deviceId as DeviceId),
    ]);

    // Extract health-related data from status
    const mainComponent =
      status.components['main'] || status.components[Object.keys(status.components)[0]!];

    if (!mainComponent) {
      return createMcpResponse(`Device "${device.name}" has no component data available`, {
        deviceId,
        deviceName: device.name,
        healthStatus: 'unknown',
        error: 'No component data',
      });
    }

    const battery = (mainComponent['battery']?.['battery']?.value as number) ?? null;
    const batteryUnit = (mainComponent['battery']?.['battery']?.unit as string) ?? null;
    const rssi = (mainComponent['signalStrength']?.['rssi']?.value as number) ?? null;
    const lqi = (mainComponent['signalStrength']?.['lqi']?.value as number) ?? null;
    const healthStatus =
      (mainComponent['healthCheck']?.['healthStatus']?.value as string) ?? 'unknown';
    const lastUpdate =
      (mainComponent['healthCheck']?.['healthStatus']?.timestamp as string) ?? 'unknown';

    const healthData = {
      deviceId,
      deviceName: device.name,
      deviceType: device.type,

      // Health status
      healthStatus,
      lastUpdate,

      // Battery (if applicable)
      battery,
      batteryUnit,
      powerSource:
        (mainComponent['powerSource']?.['powerSource']?.value as string | undefined) ?? 'unknown',

      // Signal strength (if applicable)
      signalStrength: {
        rssi,
        lqi,
      },

      // Connectivity
      isOnline: healthStatus === 'online',
    };

    // Build human-readable message
    const statusIndicator = healthData.isOnline ? '✓' : '✗';
    const batteryInfo = battery ? `\nBattery: ${battery}${batteryUnit ?? ''}` : '';
    const signalInfo =
      rssi || lqi ? `\nSignal: ${rssi ? `RSSI ${rssi}dBm` : ''}${lqi ? ` LQI ${lqi}` : ''}` : '';

    const message = `${statusIndicator} Device Health: ${device.name}\nStatus: ${healthStatus}${batteryInfo}${signalInfo}\nLast Update: ${lastUpdate}`;

    return createMcpResponse(message, healthData);
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * List recent command execution failures for troubleshooting.
 *
 * MCP Tool: list_failed_commands
 * Input: { limit?: number, deviceId?: string }
 * Output: List of failed commands with timestamps and error messages
 *
 * Use Cases:
 * - Diagnose why device commands are failing
 * - Identify patterns in command failures
 * - Track retry failures
 * - Debug capability compatibility issues
 */
export function handleListFailedCommands(input: McpToolInput): CallToolResult {
  try {
    const { limit, deviceId } = listFailedCommandsSchema.parse(input);

    // Get failed commands from tracker
    let failures = diagnosticTracker.getFailedCommands(limit);

    // Filter by device if specified
    if (deviceId) {
      failures = failures.filter((f) => f.deviceId === deviceId);
    }

    if (failures.length === 0) {
      const filterMsg = deviceId ? ` for device ${deviceId}` : '';
      return createMcpResponse(`No failed commands found in recent history${filterMsg}`, {
        count: 0,
        failures: [],
      });
    }

    // Format failures for display
    const failureList = failures
      .map(
        (f, idx) =>
          `${idx + 1}. ${f.deviceName || f.deviceId}\n` +
          `   Command: ${f.capability}.${f.command}\n` +
          `   Time: ${f.timestamp.toISOString()}\n` +
          `   Error: ${f.error}`
      )
      .join('\n\n');

    const message = `Found ${failures.length} failed command(s):\n\n${failureList}`;

    return createMcpResponse(message, {
      count: failures.length,
      failures: failures.map((f) => ({
        deviceId: f.deviceId,
        deviceName: f.deviceName,
        capability: f.capability,
        command: f.command,
        timestamp: f.timestamp.toISOString(),
        error: f.error,
        duration: f.duration,
      })),
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Get system information including server version, device counts, and statistics.
 *
 * MCP Tool: get_system_info
 * Input: {}
 * Output: Server metadata, account summary, and diagnostic statistics
 *
 * Use Cases:
 * - Get overview of SmartThings account
 * - Check server version and uptime
 * - Review device distribution by type
 * - Monitor rate limit usage
 */
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
    devices.forEach((d) => {
      const type = d.type || 'Unknown';
      devicesByType[type] = (devicesByType[type] || 0) + 1;
    });

    // Get diagnostic statistics
    const commandStats = diagnosticTracker.getCommandStats();
    const rateLimitInfo = diagnosticTracker.getRateLimitStatus();
    const tokenStatus = diagnosticTracker.getTokenStatus();

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
        locationNames: locations.map((l) => l.name),
        rooms: rooms.length,
        devices: devices.length,
        devicesByType,
      },
      commands: commandStats,
      rateLimits: {
        recentHits: rateLimitInfo.hitCount,
        lastHit: rateLimitInfo.lastHit?.toISOString() || null,
        byEndpoint: rateLimitInfo.byEndpoint,
        estimatedRemaining: rateLimitInfo.estimatedRemaining,
      },
      token: {
        createdAt: tokenStatus.createdAt.toISOString(),
        expiresAt: tokenStatus.expiresAt.toISOString(),
        remainingFormatted: tokenStatus.remainingFormatted,
        expiringSoon: tokenStatus.expiringSoon,
      },
      timestamp: new Date().toISOString(),
    };

    const deviceTypeList = Object.entries(devicesByType)
      .map(([type, count]) => `  - ${type}: ${count}`)
      .join('\n');

    const message =
      `System Information:\n\n` +
      `Server: ${systemInfo.server.name} v${systemInfo.server.version}\n` +
      `Node: ${systemInfo.server.nodeVersion}\n` +
      `Uptime: ${Math.floor(systemInfo.server.uptime / 60)} minutes\n\n` +
      `Locations: ${systemInfo.smartthings.locations}\n` +
      `Rooms: ${systemInfo.smartthings.rooms}\n` +
      `Devices: ${systemInfo.smartthings.devices}\n\n` +
      `Device Types:\n${deviceTypeList}\n\n` +
      `Commands: ${systemInfo.commands.totalCommands} total, ${systemInfo.commands.failedCommands} failed (${systemInfo.commands.successRate})\n` +
      `Rate Limit Hits (24h): ${systemInfo.rateLimits.recentHits}`;

    return createMcpResponse(message, systemInfo);
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Validate if device supports specific capability and commands.
 *
 * MCP Tool: validate_device_capabilities
 * Input: { deviceId: string, capability: string, command?: string }
 * Output: Capability validation result with alternatives if unsupported
 *
 * Use Cases:
 * - Check if device supports capability before sending command
 * - Validate command availability for capability
 * - Get list of available capabilities for device
 * - Troubleshoot "capability not supported" errors
 */
export async function handleValidateDeviceCapabilities(
  input: McpToolInput
): Promise<CallToolResult> {
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
      const validCommands = getCommandsForCapability(capability);
      const isValidCommand = validCommands.includes(command);

      commandValidation = {
        command,
        valid: isValidCommand,
        availableCommands: validCommands,
      };

      if (!isValidCommand) {
        return createMcpResponse(
          `Device "${device.name}" supports capability "${capability}" but command "${command}" is not available`,
          {
            deviceId,
            deviceName: device.name,
            capability,
            supported: true,
            command: commandValidation,
            recommendation: `Available commands for ${capability}: ${validCommands.join(', ') || 'none defined'}`,
          }
        );
      }
    }

    const message = command
      ? `Device "${device.name}" SUPPORTS command "${command}" on capability "${capability}"`
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

/**
 * Generate comprehensive diagnostic report in JSON or Markdown format.
 *
 * MCP Tool: export_diagnostics
 * Input: { format?: 'json'|'markdown', includeDeviceHealth?: boolean, includeFailedCommands?: boolean, maxDevices?: number }
 * Output: Complete diagnostic report with system info, device health, and command history
 *
 * Use Cases:
 * - Export diagnostics for support ticket
 * - Generate status report for monitoring
 * - Create documentation of system state
 * - Share configuration with team
 *
 * Performance: Samples devices to avoid timeout with large accounts (>50 devices)
 */
export async function handleExportDiagnostics(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { format, includeDeviceHealth, includeFailedCommands, maxDevices } =
      exportDiagnosticsSchema.parse(input);

    logger.info('Generating diagnostic report', {
      format,
      includeDeviceHealth,
      includeFailedCommands,
      maxDevices,
    });

    const timestamp = new Date().toISOString();

    // 1. System info
    const [locations, devices, rooms] = await Promise.all([
      smartThingsService.listLocations(),
      smartThingsService.listDevices(),
      smartThingsService.listRooms(),
    ]);

    // Group devices by type
    const devicesByType: Record<string, number> = {};
    devices.forEach((d) => {
      const type = d.type || 'Unknown';
      devicesByType[type] = (devicesByType[type] || 0) + 1;
    });

    const report: DiagnosticReport = {
      generatedAt: timestamp,
      server: {
        name: environment.MCP_SERVER_NAME,
        version: environment.MCP_SERVER_VERSION,
        nodeVersion: process.version,
        uptime: process.uptime(),
        environment: environment.NODE_ENV,
      },
      smartthings: {
        locations: locations.length,
        locationNames: locations.map((l) => l.name),
        rooms: rooms.length,
        devices: devices.length,
        devicesByType,
      },
      commands: diagnosticTracker.getCommandStats(),
      rateLimits: diagnosticTracker.getRateLimitStatus(),
      token: diagnosticTracker.getTokenStatus(),
    };

    // 2. Device health (if requested)
    if (includeDeviceHealth) {
      report.deviceHealth = [];

      // Sample devices to avoid timeout (max 10-20 devices)
      const sampleDevices = devices.slice(0, maxDevices);
      logger.debug('Checking device health', { sampleSize: sampleDevices.length });

      // Use Promise.allSettled to prevent single failure from blocking others
      const healthChecks = sampleDevices.map(async (device) => {
        try {
          const status = await smartThingsService.getDeviceStatus(device.deviceId);
          const mainComponent =
            status.components['main'] || status.components[Object.keys(status.components)[0]!];

          return {
            deviceId: device.deviceId,
            name: device.name,
            type: device.type,
            healthStatus: mainComponent?.['healthCheck']?.['healthStatus']?.value || 'unknown',
            battery: mainComponent?.['battery']?.['battery']?.value || null,
            lastUpdate: mainComponent?.['healthCheck']?.['healthStatus']?.timestamp || null,
            isOnline: mainComponent?.['healthCheck']?.['healthStatus']?.value === 'online',
          };
        } catch (error) {
          logger.warn('Failed to get device health', { deviceId: device.deviceId, error });
          return {
            deviceId: device.deviceId,
            name: device.name,
            healthStatus: 'error',
            error: error instanceof Error ? error.message : 'Failed to retrieve health status',
          } as DeviceHealthEntry;
        }
      });

      const healthResults = await Promise.allSettled(healthChecks);
      report.deviceHealth = healthResults
        .filter((r): r is PromiseFulfilledResult<DeviceHealthEntry> => r.status === 'fulfilled')
        .map((r) => r.value);
    }

    // 3. Failed commands (if requested)
    if (includeFailedCommands) {
      const failures = diagnosticTracker.getFailedCommands(50);
      report.failedCommands = failures.map((f) => ({
        deviceId: f.deviceId,
        deviceName: f.deviceName,
        capability: f.capability,
        command: f.command,
        timestamp: f.timestamp.toISOString(),
        error: f.error,
        duration: f.duration,
      }));
    }

    // Format output
    let output: string;
    if (format === 'json') {
      output = JSON.stringify(report, null, 2);
    } else {
      output = generateMarkdownReport(report);
    }

    const message = `Diagnostic report generated (${format} format)\n\nSummary:\n- Locations: ${report.smartthings.locations}\n- Devices: ${report.smartthings.devices}\n- Commands: ${report.commands.totalCommands} total, ${report.commands.failedCommands} failed\n- Token expires: ${report.token.remainingFormatted}`;

    return createMcpResponse(message, {
      format,
      timestamp,
      summary: {
        locations: report.smartthings.locations,
        devices: report.smartthings.devices,
        commands: report.commands,
        tokenStatus: report.token,
      },
      report: format === 'json' ? report : undefined,
      markdown: format === 'markdown' ? output : undefined,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

// ============================================================================
// Tool Exports
// ============================================================================

/**
 * Diagnostic tools export for MCP server registration.
 *
 * All diagnostic tools follow consistent patterns:
 * 1. Zod schema validation for inputs
 * 2. Business logic using smartThingsService or diagnosticTracker
 * 3. Human-readable message + structured data response
 * 4. Comprehensive error handling with classification
 */
export const diagnosticTools = {
  test_connection: {
    description:
      'Test SmartThings API connectivity and validate authentication token. Returns response time, account summary, and token expiration status. Use this tool first when troubleshooting connectivity issues.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: handleTestConnection,
  },

  get_device_health: {
    description:
      'Get device health status including battery level, online status, signal strength, and last communication time. Useful for troubleshooting offline or unresponsive devices.',
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

  list_failed_commands: {
    description:
      'List recent command execution failures with timestamps and error messages. Helps diagnose why device commands are failing and identify patterns. Can be filtered by device ID.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of failed commands to return (default: 10, max: 100)',
        },
        deviceId: {
          type: 'string',
          description: 'Optional device UUID to filter failures',
        },
      },
      required: [],
    },
    handler: handleListFailedCommands,
  },

  get_system_info: {
    description:
      'Get comprehensive system information including server version, uptime, location/room/device counts, device breakdown by type, command statistics, and rate limit status. Provides overview of entire SmartThings integration.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: handleGetSystemInfo,
  },

  validate_device_capabilities: {
    description:
      'Validate if a device supports a specific capability and optionally a command. Returns list of available capabilities and commands if the requested one is not supported. Helps prevent "capability not supported" errors.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'Device UUID to validate',
        },
        capability: {
          type: 'string',
          description: 'Capability name to validate (e.g., "switch", "switchLevel", "lock")',
        },
        command: {
          type: 'string',
          description: 'Optional command to validate for the capability (e.g., "on", "off")',
        },
      },
      required: ['deviceId', 'capability'],
    },
    handler: handleValidateDeviceCapabilities,
  },

  export_diagnostics: {
    description:
      'Generate comprehensive diagnostic report in JSON or Markdown format. Includes system info, device health status (sampled), command history, and rate limits. Useful for support tickets or system documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['json', 'markdown'],
          description: 'Output format (default: markdown)',
        },
        includeDeviceHealth: {
          type: 'boolean',
          description: 'Include device health checks in report (default: true)',
        },
        includeFailedCommands: {
          type: 'boolean',
          description: 'Include failed command history (default: true)',
        },
        maxDevices: {
          type: 'number',
          description: 'Maximum number of devices to check health for (default: 10, max: 50)',
        },
      },
      required: [],
    },
    handler: handleExportDiagnostics,
  },
};
