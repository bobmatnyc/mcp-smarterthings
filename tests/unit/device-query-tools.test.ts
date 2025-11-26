/**
 * Unit tests for device query tools.
 *
 * Tests the new list_devices_by_room tool with required roomName parameter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListDevicesByRoom } from '../../src/mcp/tools/device-query.js';
import * as client from '../../src/smartthings/client.js';
import type { RoomInfo, DeviceInfo, RoomId, DeviceId } from '../../src/types/smartthings.js';

// Mock the SmartThings client
vi.mock('../../src/smartthings/client.js', () => ({
  smartThingsService: {
    findRoomByName: vi.fn(),
    listDevices: vi.fn(),
  },
}));

describe('Device Query Tools', () => {
  describe('handleListDevicesByRoom', () => {
    const mockRoom: RoomInfo = {
      roomId: 'room-123' as RoomId,
      name: 'Living Room',
      locationId: 'loc-456' as import('../../src/types/smartthings.js').LocationId,
      deviceCount: 2,
    };

    const mockDevices: DeviceInfo[] = [
      {
        deviceId: 'device-1' as DeviceId,
        name: 'Living Room Light',
        type: 'Light',
        capabilities: ['switch', 'switchLevel'],
        roomName: 'Living Room',
        roomId: 'room-123',
      },
      {
        deviceId: 'device-2' as DeviceId,
        name: 'Living Room Thermostat',
        type: 'Thermostat',
        capabilities: ['temperatureMeasurement', 'thermostatMode'],
        roomName: 'Living Room',
        roomId: 'room-123',
      },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should list devices in a specific room', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue(mockRoom);
      vi.spyOn(client.smartThingsService, 'listDevices').mockResolvedValue(mockDevices);

      const result = await handleListDevicesByRoom({ roomName: 'Living Room' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Found 2 device(s) in room "Living Room"');
      expect(textContent?.text).toContain('Living Room Light');
      expect(textContent?.text).toContain('Living Room Thermostat');

      expect(client.smartThingsService.findRoomByName).toHaveBeenCalledWith('Living Room');
      expect(client.smartThingsService.listDevices).toHaveBeenCalledWith(mockRoom.roomId);
    });

    it('should handle empty device list for a room', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue(mockRoom);
      vi.spyOn(client.smartThingsService, 'listDevices').mockResolvedValue([]);

      const result = await handleListDevicesByRoom({ roomName: 'Living Room' });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('No devices found in room "Living Room"');

      // Check data field instead of content
      const data = result.data as { count: number; roomName: string; devices: unknown[] };
      expect(data.count).toBe(0);
      expect(data.roomName).toBe('Living Room');
      expect(data.devices).toEqual([]);
    });

    it('should handle room not found error', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockRejectedValue(
        new Error('Room not found: "NonExistent"')
      );

      const result = await handleListDevicesByRoom({ roomName: 'NonExistent' });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.text).toContain('Room not found');
    });

    it('should handle ambiguous room name error', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockRejectedValue(
        new Error('Multiple rooms match "Room": Room 1, Room 2. Please be more specific.')
      );

      const result = await handleListDevicesByRoom({ roomName: 'Room' });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.text).toContain('Multiple rooms match');
    });

    it('should validate required roomName parameter', async () => {
      const result = await handleListDevicesByRoom({});

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.text).toContain('Validation error');
    });

    it('should handle partial room name matching', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue({
        ...mockRoom,
        name: 'Living Room',
      });
      vi.spyOn(client.smartThingsService, 'listDevices').mockResolvedValue(mockDevices);

      const result = await handleListDevicesByRoom({ roomName: 'living' });

      expect(result.isError).toBeUndefined();
      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Living Room');

      expect(client.smartThingsService.findRoomByName).toHaveBeenCalledWith('living');
    });

    it('should include device capabilities in response', async () => {
      vi.spyOn(client.smartThingsService, 'findRoomByName').mockResolvedValue(mockRoom);
      vi.spyOn(client.smartThingsService, 'listDevices').mockResolvedValue(mockDevices);

      const result = await handleListDevicesByRoom({ roomName: 'Living Room' });

      expect(result.isError).toBeUndefined();
      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('switch, switchLevel');
      expect(textContent?.text).toContain('temperatureMeasurement, thermostatMode');
    });
  });
});
