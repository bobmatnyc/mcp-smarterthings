/**
 * Unit tests for scene tools.
 *
 * Tests the new list_scenes_by_room tool with required roomName parameter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListScenesByRoom, initializeSceneTools } from '../../src/mcp/tools/scenes.js';
import * as client from '../../src/smartthings/client.js';
import { ServiceContainer } from '../../src/services/ServiceContainer.js';
import type {
  RoomInfo,
  SceneInfo,
  RoomId,
  LocationId,
  SceneId,
} from '../../src/types/smartthings.js';

// Mock the SmartThings client
vi.mock('../../src/smartthings/client.js', () => ({
  smartThingsService: {
    findRoomByName: vi.fn(),
    listScenes: vi.fn(),
  },
}));

describe('Scene Tools', () => {
  describe('handleListScenesByRoom', () => {
    // Initialize tools with ServiceContainer before tests
    beforeEach(() => {
      const serviceContainer = new ServiceContainer(client.smartThingsService);
      initializeSceneTools(serviceContainer);
    });

    const mockRoom: RoomInfo = {
      roomId: 'room-123' as RoomId,
      name: 'Living Room',
      locationId: 'loc-456' as LocationId,
      deviceCount: 2,
    };

    const mockScenes: SceneInfo[] = [
      {
        sceneId: 'scene-1' as SceneId,
        sceneName: 'Movie Time',
        sceneIcon: '🎬',
        sceneColor: '#FF5733',
        locationId: 'loc-456' as LocationId,
        lastExecutedDate: new Date('2025-01-15T20:00:00Z'),
      },
      {
        sceneId: 'scene-2' as SceneId,
        sceneName: 'Bright Lights',
        sceneIcon: '💡',
        sceneColor: '#FFFF00',
        locationId: 'loc-456' as LocationId,
        lastExecutedDate: new Date('2025-01-14T18:30:00Z'),
      },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should list scenes for a specific room location', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue(mockRoom);
      vi.spyOn(client.smartThingsService, 'listScenes').mockResolvedValue(mockScenes);

      const result = await handleListScenesByRoom({ roomName: 'Living Room' });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain(
        'Found 2 scene(s) in location for room "Living Room"'
      );
      expect(textContent?.text).toContain('Movie Time');
      expect(textContent?.text).toContain('Bright Lights');
      expect(textContent?.text).toContain('🎬');
      expect(textContent?.text).toContain('💡');

      expect(client.smartThingsService.findRoomByName).toHaveBeenCalledWith('Living Room');
      expect(client.smartThingsService.listScenes).toHaveBeenCalledWith(mockRoom.locationId);
    });

    it('should handle empty scene list for a room', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue(mockRoom);
      vi.spyOn(client.smartThingsService, 'listScenes').mockResolvedValue([]);

      const result = await handleListScenesByRoom({ roomName: 'Living Room' });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain(
        'No scenes found in location for room "Living Room"'
      );

      // Check data field instead of content
      const data = result.data as { count: number; roomName: string; scenes: unknown[] };
      expect(data.count).toBe(0);
      expect(data.roomName).toBe('Living Room');
      expect(data.scenes).toEqual([]);
    });

    it('should handle room not found error', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockRejectedValue(
        new Error('Room not found: "NonExistent"')
      );

      const result = await handleListScenesByRoom({ roomName: 'NonExistent' });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.text).toContain('Room not found');
    });

    it('should handle ambiguous room name error', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockRejectedValue(
        new Error('Multiple rooms match "Room": Room 1, Room 2. Please be more specific.')
      );

      const result = await handleListScenesByRoom({ roomName: 'Room' });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.text).toContain('Multiple rooms match');
    });

    it('should validate required roomName parameter', async () => {
      const result = await handleListScenesByRoom({});

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.text).toContain('Validation error');
    });

    it('should handle partial room name matching', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue({
        ...mockRoom,
        name: 'Living Room',
      });
      vi.spyOn(client.smartThingsService, 'listScenes').mockResolvedValue(mockScenes);

      const result = await handleListScenesByRoom({ roomName: 'living' });

      expect(result.isError).toBe(false);
      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Living Room');

      expect(client.smartThingsService.findRoomByName).toHaveBeenCalledWith('living');
    });

    it('should include last executed date in response', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue(mockRoom);
      vi.spyOn(client.smartThingsService, 'listScenes').mockResolvedValue(mockScenes);

      const result = await handleListScenesByRoom({ roomName: 'Living Room' });

      expect(result.isError).toBe(false);
      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Last Executed:');
    });

    it('should handle scenes without last executed date', async () => {
      const scenesWithoutDate: SceneInfo[] = [
        {
          sceneId: 'scene-3' as SceneId,
          sceneName: 'New Scene',
          locationId: 'loc-456' as LocationId,
        },
      ];

      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue(mockRoom);
      vi.spyOn(client.smartThingsService, 'listScenes').mockResolvedValue(scenesWithoutDate);

      const result = await handleListScenesByRoom({ roomName: 'Living Room' });

      expect(result.isError).toBe(false);
      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('New Scene');
      expect(textContent?.text).not.toContain('Last Executed:');
    });

    it('should include scene icon when available', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue(mockRoom);
      vi.spyOn(client.smartThingsService, 'listScenes').mockResolvedValue(mockScenes);

      const result = await handleListScenesByRoom({ roomName: 'Living Room' });

      expect(result.isError).toBe(false);
      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toMatch(/Movie Time.*🎬/);
      expect(textContent?.text).toMatch(/Bright Lights.*💡/);
    });
  });
});
