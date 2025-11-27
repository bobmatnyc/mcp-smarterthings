import { z } from 'zod';
import { smartThingsService } from '../../smartthings/client.js';
import { createMcpResponse } from '../../types/mcp.js';
import { createMcpError, classifyError } from '../../utils/error-handler.js';
import { deviceIdSchema } from '../../utils/validation.js';
import type { DeviceId } from '../../types/smartthings.js';
import type { McpToolInput } from '../../types/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ServiceContainer } from '../../services/ServiceContainer.js';

/**
 * Management tools for rooms, locations, and device assignments.
 *
 * These tools provide CRUD operations for organizing the smart home.
 *
 * Architecture: Uses ServiceContainer for dependency injection
 * - LocationService: Location and room operations
 * - DeviceService: Device queries for room operations
 *
 * Note: Some operations (create/update/delete room, assign device) currently
 * use SmartThingsService.client directly as these CRUD operations are not yet
 * abstracted in the service layer. This is a known limitation for Phase 1.
 */

// Service container instance (injected during initialization)
let serviceContainer: ServiceContainer;

// Input schemas
const createRoomSchema = z.object({
  name: z.string().min(1).describe('Room name'),
  locationId: z.string().optional().describe('Location ID (uses default if not provided)'),
});

const updateRoomSchema = z.object({
  roomName: z.string().describe('Current room name to update'),
  newName: z.string().min(1).describe('New name for the room'),
});

const deleteRoomSchema = z.object({
  roomName: z.string().describe('Room name to delete'),
});

const assignDeviceToRoomSchema = z.object({
  deviceId: deviceIdSchema,
  roomName: z.string().describe('Target room name'),
});

/**
 * Create a new room.
 *
 * MCP Tool: create_room
 * Input: { name: string, locationId?: string }
 * Output: Confirmation of room creation with room ID
 */
export async function handleCreateRoom(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { name, locationId } = createRoomSchema.parse(input);

    const locationService = serviceContainer.getLocationService();

    // Get location ID if not provided
    let targetLocationId = locationId;
    if (!targetLocationId) {
      const locations = await locationService.listLocations();
      if (locations.length === 0) {
        throw new Error('No locations found. Please create a location first.');
      }
      const firstLocation = locations[0];
      if (!firstLocation) {
        throw new Error('No locations found. Please create a location first.');
      }
      targetLocationId = firstLocation.locationId;
    }

    // Create room using SmartThings SDK
    const room = await (smartThingsService as any).client.rooms.create({
      name,
      locationId: targetLocationId,
    });

    return createMcpResponse(`Room "${name}" created successfully.`, {
      roomId: room.roomId,
      name: room.name,
      locationId: room.locationId,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Update a room's name.
 *
 * MCP Tool: update_room
 * Input: { roomName: string, newName: string }
 * Output: Confirmation of room update
 */
export async function handleUpdateRoom(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { roomName, newName } = updateRoomSchema.parse(input);

    const locationService = serviceContainer.getLocationService();

    // Find room by name
    const room = await locationService.findRoomByName(roomName);

    // Update room using SmartThings SDK
    await (smartThingsService as any).client.rooms.update(room.roomId, {
      name: newName,
    });

    return createMcpResponse(`Room "${roomName}" renamed to "${newName}".`, {
      roomId: room.roomId,
      oldName: roomName,
      newName,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Delete a room.
 *
 * MCP Tool: delete_room
 * Input: { roomName: string }
 * Output: Confirmation of room deletion
 *
 * Warning: Deleting a room will unassign all devices from that room.
 */
export async function handleDeleteRoom(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { roomName } = deleteRoomSchema.parse(input);

    const locationService = serviceContainer.getLocationService();
    const deviceService = serviceContainer.getDeviceService();

    // Find room by name
    const room = await locationService.findRoomByName(roomName);

    // Check if room has devices
    const devices = await deviceService.listDevices(room.roomId);
    const deviceCount = devices.length;

    // Delete room using SmartThings SDK
    await (smartThingsService as any).client.rooms.delete(room.roomId);

    const warning =
      deviceCount > 0 ? ` Warning: ${deviceCount} device(s) were unassigned from this room.` : '';

    return createMcpResponse(`Room "${roomName}" deleted successfully.${warning}`, {
      roomId: room.roomId,
      name: roomName,
      devicesUnassigned: deviceCount,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Assign a device to a room.
 *
 * MCP Tool: assign_device_to_room
 * Input: { deviceId: string, roomName: string }
 * Output: Confirmation of device assignment
 */
export async function handleAssignDeviceToRoom(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { deviceId, roomName } = assignDeviceToRoomSchema.parse(input);

    const locationService = serviceContainer.getLocationService();
    const deviceService = serviceContainer.getDeviceService();

    // Find room by name
    const room = await locationService.findRoomByName(roomName);

    // Get device info for confirmation
    const device = await deviceService.getDevice(deviceId as DeviceId);

    // Update device room assignment
    await (smartThingsService as any).client.devices.update(deviceId, {
      roomId: room.roomId,
    });

    return createMcpResponse(`Device "${device.name}" assigned to room "${roomName}".`, {
      deviceId,
      deviceName: device.name,
      roomId: room.roomId,
      roomName: room.name,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * List all locations.
 *
 * MCP Tool: list_locations
 * Input: {}
 * Output: List of all locations with their details
 */
export async function handleListLocations(_input: McpToolInput): Promise<CallToolResult> {
  try {
    const locationService = serviceContainer.getLocationService();
    const locations = await locationService.listLocations();

    const locationList = locations
      .map((location) => {
        return `- ${location.name} (${location.locationId})`;
      })
      .join('\n\n');

    const responseText = `Found ${locations.length} location(s):\n\n${locationList}`;

    return createMcpResponse(responseText, {
      count: locations.length,
      locations,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Initialize management tools with ServiceContainer.
 *
 * Must be called during server initialization to inject dependencies.
 *
 * @param container ServiceContainer instance for dependency injection
 */
export function initializeManagementTools(container: ServiceContainer): void {
  serviceContainer = container;
}

/**
 * Management tools export.
 */
export const managementTools = {
  create_room: {
    description:
      'Create a new room in your SmartThings home. Rooms help organize devices by physical location.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the room (e.g., "Living Room", "Master Bedroom")',
        },
        locationId: {
          type: 'string',
          description: 'Optional location ID. Uses default location if not provided.',
        },
      },
      required: ['name'],
    },
    handler: handleCreateRoom,
  },
  update_room: {
    description: "Update a room's name. Devices in the room will remain assigned.",
    inputSchema: {
      type: 'object',
      properties: {
        roomName: {
          type: 'string',
          description: 'Current name of the room to update',
        },
        newName: {
          type: 'string',
          description: 'New name for the room',
        },
      },
      required: ['roomName', 'newName'],
    },
    handler: handleUpdateRoom,
  },
  delete_room: {
    description:
      'Delete a room. Warning: This will unassign all devices from the room (devices remain in your home but will be unassigned).',
    inputSchema: {
      type: 'object',
      properties: {
        roomName: {
          type: 'string',
          description: 'Name of the room to delete',
        },
      },
      required: ['roomName'],
    },
    handler: handleDeleteRoom,
  },
  assign_device_to_room: {
    description:
      'Move a device to a different room. The device will be unassigned from its current room (if any) and assigned to the new room.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'Device ID to move',
        },
        roomName: {
          type: 'string',
          description: 'Target room name',
        },
      },
      required: ['deviceId', 'roomName'],
    },
    handler: handleAssignDeviceToRoom,
  },
  list_locations: {
    description:
      'List all locations (homes/buildings) in your SmartThings account. Locations contain rooms and devices.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: handleListLocations,
  },
};
