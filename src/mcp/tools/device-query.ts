import { z } from 'zod';
import { smartThingsService } from '../../smartthings/client.js';
import { createMcpResponse } from '../../types/mcp.js';
import { createMcpError, classifyError } from '../../utils/error-handler.js';
import { deviceIdSchema } from '../../utils/validation.js';
import type { DeviceId, RoomId } from '../../types/smartthings.js';
import type { McpToolInput } from '../../types/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Device query tools for MCP server.
 *
 * These tools provide device discovery and capability querying.
 */

// Input schemas
const listDevicesSchema = z.object({
  roomName: z.string().optional().describe('Filter devices by room name (case-insensitive)'),
});

const listDevicesByRoomSchema = z.object({
  roomName: z.string().describe('Room name to filter devices (case-insensitive, required)'),
});

const getDeviceCapabilitiesSchema = z.object({
  deviceId: deviceIdSchema,
});

/**
 * List all devices.
 *
 * MCP Tool: list_devices
 * Input: { roomName?: string } (optional room filter)
 * Output: List of all accessible devices, optionally filtered by room
 *
 * Returns:
 * - Device ID, name, label
 * - Device type
 * - Supported capabilities
 * - Room and location information
 *
 * Error Handling:
 * - Validation errors: Invalid input parameters
 * - Room not found: Specified room doesn't exist
 * - API errors: SmartThings API failures
 * - Network errors: Connectivity issues (retried automatically)
 */
export async function handleListDevices(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { roomName } = listDevicesSchema.parse(input);

    let roomId: RoomId | undefined;
    let actualRoomName: string | undefined;

    // If room filter is specified, find the room
    if (roomName) {
      const room = await smartThingsService.findRoomByName(roomName);
      roomId = room.roomId;
      actualRoomName = room.name;
    }

    const devices = await smartThingsService.listDevices(roomId);

    const deviceList = devices
      .map((device) => {
        const roomInfo = device.roomName ? `\n  Room: ${device.roomName}` : '';
        return `- ${device.name} (${device.deviceId})\n  Type: ${device.type ?? 'Unknown'}${roomInfo}\n  Capabilities: ${device.capabilities?.join(', ') ?? 'None'}`;
      })
      .join('\n\n');

    const filterText = actualRoomName ? ` in room "${actualRoomName}"` : '';
    const responseText = `Found ${devices.length} device(s)${filterText}:\n\n${deviceList}`;

    return createMcpResponse(responseText, {
      count: devices.length,
      roomFilter: actualRoomName,
      devices,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * List devices in a specific room.
 *
 * MCP Tool: list_devices_by_room
 * Input: { roomName: string } (required room name)
 * Output: List of devices in the specified room
 *
 * Design Decision: Dedicated room-specific tool vs. optional parameter
 * Rationale: Explicit room parameter makes API intent clearer and prevents
 * accidental queries of all devices when room filtering is intended.
 * Better API design for room-specific use cases.
 *
 * Returns:
 * - Device ID, name, label
 * - Device type
 * - Supported capabilities
 * - Room and location information
 *
 * Error Handling:
 * - Validation errors: Missing roomName parameter
 * - Room not found: Specified room doesn't exist
 * - API errors: SmartThings API failures
 * - Network errors: Connectivity issues (retried automatically)
 *
 * Usage Example:
 *   { "roomName": "Living Room" }
 *   { "roomName": "Bedroom" }
 */
export async function handleListDevicesByRoom(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { roomName } = listDevicesByRoomSchema.parse(input);

    // Find the room (throws if not found or ambiguous)
    const room = await smartThingsService.findRoomByName(roomName);
    const devices = await smartThingsService.listDevices(room.roomId);

    if (devices.length === 0) {
      return createMcpResponse(`No devices found in room "${room.name}".`, {
        count: 0,
        roomName: room.name,
        roomId: room.roomId,
        devices: [],
      });
    }

    const deviceList = devices
      .map((device) => {
        const roomInfo = device.roomName ? `\n  Room: ${device.roomName}` : '';
        return `- ${device.name} (${device.deviceId})\n  Type: ${device.type ?? 'Unknown'}${roomInfo}\n  Capabilities: ${device.capabilities?.join(', ') ?? 'None'}`;
      })
      .join('\n\n');

    const responseText = `Found ${devices.length} device(s) in room "${room.name}":\n\n${deviceList}`;

    return createMcpResponse(responseText, {
      count: devices.length,
      roomName: room.name,
      roomId: room.roomId,
      devices,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * List all rooms.
 *
 * MCP Tool: list_rooms
 * Input: {} (no parameters)
 * Output: List of all rooms with device counts
 *
 * Returns:
 * - Room ID and name
 * - Location ID
 * - Number of devices in each room
 *
 * Error Handling:
 * - API errors: SmartThings API failures
 * - Network errors: Connectivity issues (retried automatically)
 */
export async function handleListRooms(_input: McpToolInput): Promise<CallToolResult> {
  try {
    const rooms = await smartThingsService.listRooms();

    const roomList = rooms
      .map(
        (room) =>
          `- ${room.name} (${room.roomId})\n  Location: ${room.locationId}\n  Devices: ${room.deviceCount ?? 0}`
      )
      .join('\n\n');

    const responseText = `Found ${rooms.length} room(s):\n\n${roomList}`;

    return createMcpResponse(responseText, {
      count: rooms.length,
      rooms,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Get device capabilities.
 *
 * MCP Tool: get_device_capabilities
 * Input: { deviceId: string (UUID) }
 * Output: List of capabilities supported by the device
 *
 * Returns:
 * - Array of capability names
 * - Device information
 *
 * Error Handling:
 * - Validation errors: Invalid device ID format
 * - Device not found: Device doesn't exist
 * - API errors: SmartThings API failures
 */
export async function handleGetDeviceCapabilities(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { deviceId } = getDeviceCapabilitiesSchema.parse(input);

    const [device, capabilities] = await Promise.all([
      smartThingsService.getDevice(deviceId as DeviceId),
      smartThingsService.getDeviceCapabilities(deviceId as DeviceId),
    ]);

    const responseText = `Device: ${device.name}\nCapabilities (${capabilities.length}):\n${capabilities.map((cap) => `- ${cap}`).join('\n')}`;

    return createMcpResponse(responseText, {
      deviceId,
      deviceName: device.name,
      capabilities,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Tool metadata for MCP server registration.
 */
export const deviceQueryTools = {
  list_devices: {
    description:
      'List all SmartThings devices accessible with the configured token. Optionally filter by room name.',
    inputSchema: {
      type: 'object',
      properties: {
        roomName: {
          type: 'string',
          description:
            'Optional room name to filter devices (case-insensitive, supports partial matching)',
        },
      },
    },
    handler: handleListDevices,
  },
  list_devices_by_room: {
    description:
      'List all SmartThings devices in a specific room. More explicit than list_devices with optional roomName parameter - use this when room filtering is required.',
    inputSchema: {
      type: 'object',
      properties: {
        roomName: {
          type: 'string',
          description: 'Room name to filter devices (case-insensitive, supports partial matching)',
        },
      },
      required: ['roomName'],
    },
    handler: handleListDevicesByRoom,
  },
  list_rooms: {
    description:
      'List all SmartThings rooms/locations with device counts. Use this to discover available rooms before filtering devices.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: handleListRooms,
  },
  get_device_capabilities: {
    description: 'Get the capabilities supported by a specific SmartThings device',
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
    handler: handleGetDeviceCapabilities,
  },
} as const;
