import { z } from 'zod';
import { smartThingsService } from '../../smartthings/client.js';
import { turnOn, turnOff, getSwitchState } from '../../smartthings/capabilities/switch.js';
import { createMcpResponse } from '../../types/mcp.js';
import { createMcpError, classifyError } from '../../utils/error-handler.js';
import { deviceIdSchema } from '../../utils/validation.js';
import type { DeviceId } from '../../types/smartthings.js';
import type { McpToolInput } from '../../types/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Device control tools for MCP server.
 *
 * These tools provide device control capabilities through the MCP protocol.
 */

// Input schemas with Zod validation
const turnOnDeviceSchema = z.object({
  deviceId: deviceIdSchema,
});

const turnOffDeviceSchema = z.object({
  deviceId: deviceIdSchema,
});

const getDeviceStatusSchema = z.object({
  deviceId: deviceIdSchema,
});

/**
 * Turn on a device.
 *
 * MCP Tool: turn_on_device
 * Input: { deviceId: string (UUID) }
 * Output: Success message or error response
 *
 * Error Handling:
 * - Validation errors: Invalid device ID format
 * - Device not found: Device doesn't exist
 * - Capability errors: Device doesn't support switch capability
 * - API errors: SmartThings API failures
 */
export async function handleTurnOnDevice(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { deviceId } = turnOnDeviceSchema.parse(input);

    await turnOn(deviceId as DeviceId);

    return createMcpResponse(`Device ${deviceId} turned on successfully`, {
      deviceId,
      action: 'turn_on',
      success: true,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Turn off a device.
 *
 * MCP Tool: turn_off_device
 * Input: { deviceId: string (UUID) }
 * Output: Success message or error response
 *
 * Error Handling: Same as handleTurnOnDevice
 */
export async function handleTurnOffDevice(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { deviceId } = turnOffDeviceSchema.parse(input);

    await turnOff(deviceId as DeviceId);

    return createMcpResponse(`Device ${deviceId} turned off successfully`, {
      deviceId,
      action: 'turn_off',
      success: true,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Get device status.
 *
 * MCP Tool: get_device_status
 * Input: { deviceId: string (UUID) }
 * Output: Device status information or error response
 *
 * Returns:
 * - Device name and label
 * - Current switch state (if supported)
 * - All capability states
 *
 * Error Handling: Same as handleTurnOnDevice
 */
export async function handleGetDeviceStatus(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { deviceId } = getDeviceStatusSchema.parse(input);

    const [device, status] = await Promise.all([
      smartThingsService.getDevice(deviceId as DeviceId),
      smartThingsService.getDeviceStatus(deviceId as DeviceId),
    ]);

    // Extract switch state if available
    let switchState: string | undefined;
    try {
      switchState = await getSwitchState(deviceId as DeviceId);
    } catch {
      // Device may not support switch capability
      switchState = undefined;
    }

    const responseText = `Device: ${device.name}\nLabel: ${device.label ?? 'N/A'}\nSwitch State: ${switchState ?? 'N/A'}\nType: ${device.type ?? 'Unknown'}`;

    return createMcpResponse(responseText, {
      deviceId,
      name: device.name,
      label: device.label,
      switchState,
      type: device.type,
      capabilities: device.capabilities,
      status,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Tool metadata for MCP server registration.
 */
export const deviceControlTools = {
  turn_on_device: {
    description: 'Turn on a SmartThings device (requires switch capability)',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'SmartThings device UUID',
        },
      },
      required: ['deviceId'],
    },
    handler: handleTurnOnDevice,
  },
  turn_off_device: {
    description: 'Turn off a SmartThings device (requires switch capability)',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'SmartThings device UUID',
        },
      },
      required: ['deviceId'],
    },
    handler: handleTurnOffDevice,
  },
  get_device_status: {
    description: 'Get current status and state of a SmartThings device',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'SmartThings device UUID',
        },
      },
      required: ['deviceId'],
    },
    handler: handleGetDeviceStatus,
  },
} as const;
