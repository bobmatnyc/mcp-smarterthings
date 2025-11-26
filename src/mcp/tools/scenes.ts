import { z } from 'zod';
import { smartThingsService } from '../../smartthings/client.js';
import { createMcpResponse } from '../../types/mcp.js';
import { createMcpError, classifyError } from '../../utils/error-handler.js';
import type { SceneId } from '../../types/smartthings.js';
import type { McpToolInput } from '../../types/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Scene management tools for MCP server.
 *
 * These tools provide scene listing and execution capabilities.
 */

// Input schemas
const listScenesSchema = z.object({
  roomName: z.string().optional().describe('Filter scenes by room name (case-insensitive)'),
});

const listScenesByRoomSchema = z.object({
  roomName: z.string().describe('Room name to filter scenes (case-insensitive, required)'),
});

const executeSceneSchema = z.object({
  sceneId: z.string().optional().describe('Scene UUID'),
  sceneName: z.string().optional().describe('Scene name (case-insensitive)'),
});

/**
 * List all scenes.
 *
 * MCP Tool: list_scenes
 * Input: { roomName?: string } (optional room filter)
 * Output: List of all accessible scenes, optionally filtered by room
 *
 * Returns:
 * - Scene ID and name
 * - Scene icon and color
 * - Location information
 * - Last execution date
 *
 * Error Handling:
 * - Validation errors: Invalid input parameters
 * - Room not found: Specified room doesn't exist
 * - API errors: SmartThings API failures
 * - Network errors: Connectivity issues (retried automatically)
 *
 * Design Decision: Room filtering via locationId
 * Rationale: SmartThings API scenes are filtered by location, not room.
 * We find the room first, then filter scenes by the room's location.
 * This provides room-level filtering as requested by the user.
 *
 * Trade-offs:
 * - Performance: Requires extra API call to resolve room -> location
 * - Accuracy: Shows all scenes in the location, not just room-specific
 * - UX: Provides expected room filtering behavior for users
 */
export async function handleListScenes(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { roomName } = listScenesSchema.parse(input);

    let locationId: string | undefined;
    let actualRoomName: string | undefined;

    // If room filter is specified, find the room and get its location
    if (roomName) {
      const room = await smartThingsService.findRoomByName(roomName);
      locationId = room.locationId;
      actualRoomName = room.name;
    }

    const scenes = await smartThingsService.listScenes(
      locationId as import('../../types/smartthings.js').LocationId | undefined
    );

    if (scenes.length === 0) {
      const filterText = actualRoomName ? ` in room "${actualRoomName}"` : '';
      return createMcpResponse(`No scenes found${filterText}.`, {
        count: 0,
        roomFilter: actualRoomName,
        scenes: [],
      });
    }

    const sceneList = scenes
      .map((scene) => {
        const lastExecuted = scene.lastExecutedDate
          ? `\n  Last Executed: ${new Date(scene.lastExecutedDate).toLocaleString()}`
          : '';
        const icon = scene.sceneIcon ? ` ${scene.sceneIcon}` : '';
        return `- ${scene.sceneName}${icon} (${scene.sceneId})${lastExecuted}`;
      })
      .join('\n\n');

    const filterText = actualRoomName ? ` in location for room "${actualRoomName}"` : '';
    const responseText = `Found ${scenes.length} scene(s)${filterText}:\n\n${sceneList}`;

    return createMcpResponse(responseText, {
      count: scenes.length,
      roomFilter: actualRoomName,
      scenes,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * List scenes for a specific room.
 *
 * MCP Tool: list_scenes_by_room
 * Input: { roomName: string } (required room name)
 * Output: List of scenes in the location for the specified room
 *
 * Design Decision: Dedicated room-specific tool vs. optional parameter
 * Rationale: Explicit room parameter makes API intent clearer and prevents
 * accidental queries of all scenes when room filtering is intended.
 * Better API design for room-specific use cases.
 *
 * Technical Note: SmartThings API filters scenes by location, not room.
 * We resolve room -> location, then filter scenes by that location.
 *
 * Returns:
 * - Scene ID and name
 * - Scene icon and color
 * - Location information
 * - Last execution date
 *
 * Error Handling:
 * - Validation errors: Missing roomName parameter
 * - Room not found: Specified room doesn't exist
 * - API errors: SmartThings API failures
 * - Network errors: Connectivity issues (retried automatically)
 *
 * Usage Example:
 *   { "roomName": "Living Room" }
 *   { "roomName": "Kitchen" }
 */
export async function handleListScenesByRoom(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { roomName } = listScenesByRoomSchema.parse(input);

    // Find the room and get its location (throws if not found or ambiguous)
    const room = await smartThingsService.findRoomByName(roomName);
    const locationId = room.locationId;

    const scenes = await smartThingsService.listScenes(locationId);

    if (scenes.length === 0) {
      return createMcpResponse(`No scenes found in location for room "${room.name}".`, {
        count: 0,
        roomName: room.name,
        roomId: room.roomId,
        locationId,
        scenes: [],
      });
    }

    const sceneList = scenes
      .map((scene) => {
        const lastExecuted = scene.lastExecutedDate
          ? `\n  Last Executed: ${new Date(scene.lastExecutedDate).toLocaleString()}`
          : '';
        const icon = scene.sceneIcon ? ` ${scene.sceneIcon}` : '';
        return `- ${scene.sceneName}${icon} (${scene.sceneId})${lastExecuted}`;
      })
      .join('\n\n');

    const responseText = `Found ${scenes.length} scene(s) in location for room "${room.name}":\n\n${sceneList}`;

    return createMcpResponse(responseText, {
      count: scenes.length,
      roomName: room.name,
      roomId: room.roomId,
      locationId,
      scenes,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Execute a scene.
 *
 * MCP Tool: execute_scene
 * Input: { sceneId?: string, sceneName?: string } (one required)
 * Output: Execution status confirmation
 *
 * Design Decision: Support both ID and name-based execution
 * Rationale: Users may know the scene name but not the UUID.
 * Name-based search provides better UX at cost of extra API call.
 *
 * Returns:
 * - Execution confirmation
 * - Scene name and ID
 *
 * Error Handling:
 * - Validation errors: Neither sceneId nor sceneName provided
 * - Scene not found: Invalid ID or name
 * - Multiple matches: Ambiguous scene name
 * - API errors: SmartThings API failures
 * - Execution errors: Scene execution failed
 */
export async function handleExecuteScene(input: McpToolInput): Promise<CallToolResult> {
  try {
    const { sceneId, sceneName } = executeSceneSchema.parse(input);

    // Validate that at least one identifier is provided
    if (!sceneId && !sceneName) {
      throw new Error('Either sceneId or sceneName must be provided');
    }

    let targetScene: { sceneId: SceneId; sceneName: string };

    if (sceneId) {
      // Execute by ID directly (faster)
      await smartThingsService.executeScene(sceneId as SceneId);
      // Fetch scene details for confirmation message
      const scenes = await smartThingsService.listScenes();
      const scene = scenes.find((s) => s.sceneId === sceneId);
      targetScene = {
        sceneId: sceneId as SceneId,
        sceneName: scene?.sceneName ?? 'Unknown Scene',
      };
    } else {
      // Find by name first, then execute
      const scene = await smartThingsService.findSceneByName(sceneName!);
      await smartThingsService.executeScene(scene.sceneId);
      targetScene = {
        sceneId: scene.sceneId,
        sceneName: scene.sceneName,
      };
    }

    const responseText = `Scene "${targetScene.sceneName}" executed successfully.\nScene ID: ${targetScene.sceneId}`;

    return createMcpResponse(responseText, {
      sceneId: targetScene.sceneId,
      sceneName: targetScene.sceneName,
      executed: true,
    });
  } catch (error) {
    const errorCode = classifyError(error);
    return createMcpError(error, errorCode);
  }
}

/**
 * Tool metadata for MCP server registration.
 */
export const sceneTools = {
  list_scenes: {
    description:
      'List all SmartThings scenes accessible with the configured token. Optionally filter by room name to show scenes in that location.',
    inputSchema: {
      type: 'object',
      properties: {
        roomName: {
          type: 'string',
          description:
            'Optional room name to filter scenes by location (case-insensitive, supports partial matching)',
        },
      },
    },
    handler: handleListScenes,
  },
  list_scenes_by_room: {
    description:
      'List all SmartThings scenes for a specific room. More explicit than list_scenes with optional roomName parameter - use this when room filtering is required.',
    inputSchema: {
      type: 'object',
      properties: {
        roomName: {
          type: 'string',
          description:
            'Room name to filter scenes by location (case-insensitive, supports partial matching)',
        },
      },
      required: ['roomName'],
    },
    handler: handleListScenesByRoom,
  },
  execute_scene: {
    description:
      'Execute a SmartThings scene by ID or name. Provide either sceneId (UUID) or sceneName.',
    inputSchema: {
      type: 'object',
      properties: {
        sceneId: {
          type: 'string',
          description: 'SmartThings scene UUID (faster if known)',
        },
        sceneName: {
          type: 'string',
          description: 'Scene name (case-insensitive, supports partial matching)',
        },
      },
    },
    handler: handleExecuteScene,
  },
} as const;
