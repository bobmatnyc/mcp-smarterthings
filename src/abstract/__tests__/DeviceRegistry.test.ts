/**
 * DeviceRegistry test suite.
 *
 * Tests all registry operations including:
 * - Device CRUD operations
 * - Multi-dimensional indexing
 * - Fuzzy name matching
 * - Query operations
 * - Persistence
 * - Performance requirements (<10ms for 200+ devices)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { DeviceRegistry } from '../DeviceRegistry.js';
import type { UnifiedDevice } from '../../types/unified-device.js';
import { createUniversalDeviceId } from '../../types/unified-device.js';
import { DeviceCapability as CapabilityEnum } from '../../types/unified-device.js';
import { Platform as PlatformEnum } from '../../types/unified-device.js';

// Test helper: Create mock device
function createMockDevice(overrides?: Partial<UnifiedDevice>): UnifiedDevice {
  const id =
    overrides?.id || createUniversalDeviceId(PlatformEnum.SMARTTHINGS, `device-${Math.random()}`);

  return {
    id,
    platform: PlatformEnum.SMARTTHINGS,
    platformDeviceId: id.split(':')[1] || 'test-device',
    name: 'Test Device',
    room: 'Living Room',
    capabilities: [CapabilityEnum.SWITCH],
    online: true,
    ...overrides,
  };
}

describe('DeviceRegistry', () => {
  let registry: DeviceRegistry;

  beforeEach(() => {
    registry = new DeviceRegistry();
  });

  describe('Device CRUD Operations', () => {
    it('should add a device successfully', () => {
      const device = createMockDevice({ name: 'Living Room Light' });

      registry.addDevice(device);

      const retrieved = registry.getDevice(device.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Living Room Light');
    });

    it('should not add duplicate device', () => {
      const device = createMockDevice();

      registry.addDevice(device);
      registry.addDevice(device); // Should be no-op

      const stats = registry.getStats();
      expect(stats.deviceCount).toBe(1);
    });

    it('should throw error for device without ID', () => {
      const device = createMockDevice();
      // @ts-expect-error Testing invalid input
      device.id = undefined;

      expect(() => registry.addDevice(device)).toThrow('Device must have an ID');
    });

    it('should throw error for device without name', () => {
      const device = createMockDevice();
      // @ts-expect-error Testing invalid input
      device.name = undefined;

      expect(() => registry.addDevice(device)).toThrow('Device must have a name');
    });

    it('should remove device successfully', () => {
      const device = createMockDevice();

      registry.addDevice(device);
      const removed = registry.removeDevice(device.id);

      expect(removed).toBe(true);
      expect(registry.getDevice(device.id)).toBeUndefined();
    });

    it('should return false when removing non-existent device', () => {
      const fakeId = createUniversalDeviceId(PlatformEnum.SMARTTHINGS, 'non-existent');
      const removed = registry.removeDevice(fakeId);

      expect(removed).toBe(false);
    });

    it('should update device name', () => {
      const device = createMockDevice({ name: 'Old Name' });

      registry.addDevice(device);
      registry.updateDevice(device.id, { name: 'New Name' });

      const updated = registry.getDevice(device.id);
      expect(updated?.name).toBe('New Name');
    });

    it('should update device room', () => {
      const device = createMockDevice({ room: 'Living Room' });

      registry.addDevice(device);
      registry.updateDevice(device.id, { room: 'Bedroom' });

      const updated = registry.getDevice(device.id);
      expect(updated?.room).toBe('Bedroom');

      // Verify room index updated
      const livingRoomDevices = registry.getDevicesInRoom('Living Room');
      const bedroomDevices = registry.getDevicesInRoom('Bedroom');
      expect(livingRoomDevices).toHaveLength(0);
      expect(bedroomDevices).toHaveLength(1);
    });

    it('should update device capabilities', () => {
      const device = createMockDevice({ capabilities: [CapabilityEnum.SWITCH] });

      registry.addDevice(device);
      registry.updateDevice(device.id, {
        capabilities: [CapabilityEnum.SWITCH, CapabilityEnum.DIMMER],
      });

      const updated = registry.getDevice(device.id);
      expect(updated?.capabilities).toContain(CapabilityEnum.DIMMER);
    });

    it('should throw error when changing device ID', () => {
      const device = createMockDevice();
      const newId = createUniversalDeviceId(PlatformEnum.SMARTTHINGS, 'different-id');

      registry.addDevice(device);

      expect(() => registry.updateDevice(device.id, { id: newId })).toThrow(
        'Cannot change device ID'
      );
    });

    it('should throw error when setting empty name', () => {
      const device = createMockDevice();

      registry.addDevice(device);

      expect(() => registry.updateDevice(device.id, { name: '' })).toThrow(
        'Device name cannot be empty'
      );
    });

    it('should return false when updating non-existent device', () => {
      const fakeId = createUniversalDeviceId(PlatformEnum.SMARTTHINGS, 'non-existent');
      const updated = registry.updateDevice(fakeId, { name: 'New Name' });

      expect(updated).toBe(false);
    });
  });

  describe('Device Resolution', () => {
    beforeEach(() => {
      // Add test devices
      registry.addDevice(
        createMockDevice({
          name: 'Living Room Light',
          label: 'LR Light',
        })
      );
      registry.addDevice(
        createMockDevice({
          name: 'Kitchen Light',
        })
      );
      registry.addDevice(
        createMockDevice({
          name: 'Bedroom Lamp',
        })
      );
    });

    it('should resolve by exact ID', () => {
      const device = createMockDevice({ name: 'Test Device' });
      registry.addDevice(device);

      const result = registry.resolveDevice(device.id);

      expect(result).toBeDefined();
      expect(result?.device.id).toBe(device.id);
      expect(result?.matchType).toBe('exact');
    });

    it('should resolve by exact name', () => {
      const result = registry.resolveDevice('Living Room Light');

      expect(result).toBeDefined();
      expect(result?.device.name).toBe('Living Room Light');
      expect(result?.matchType).toBe('exact');
    });

    it('should resolve by exact name (case-insensitive)', () => {
      const result = registry.resolveDevice('LIVING ROOM LIGHT');

      expect(result).toBeDefined();
      expect(result?.device.name).toBe('Living Room Light');
      expect(result?.matchType).toBe('exact');
    });

    it('should resolve by alias (label)', () => {
      const result = registry.resolveDevice('LR Light');

      expect(result).toBeDefined();
      expect(result?.device.name).toBe('Living Room Light');
      expect(result?.matchType).toBe('alias');
    });

    it('should resolve by fuzzy match with typo', () => {
      const result = registry.resolveDevice('Livng Room Light'); // Missing 'i'

      expect(result).toBeDefined();
      expect(result?.device.name).toBe('Living Room Light');
      expect(result?.matchType).toBe('fuzzy');
      expect(result?.confidence).toBeGreaterThan(0.6);
    });

    it('should not resolve with poor fuzzy match', () => {
      const result = registry.resolveDevice('Garage Door'); // Completely different

      expect(result).toBeUndefined();
    });
  });

  describe('Multi-Dimensional Queries', () => {
    beforeEach(() => {
      // Add diverse set of devices
      registry.addDevice(
        createMockDevice({
          name: 'Living Room Light',
          room: 'Living Room',
          platform: PlatformEnum.SMARTTHINGS,
          capabilities: [CapabilityEnum.SWITCH, CapabilityEnum.DIMMER],
          online: true,
        })
      );

      registry.addDevice(
        createMockDevice({
          name: 'Living Room Fan',
          room: 'Living Room',
          platform: PlatformEnum.SMARTTHINGS,
          capabilities: [CapabilityEnum.SWITCH, CapabilityEnum.FAN],
          online: true,
        })
      );

      registry.addDevice(
        createMockDevice({
          name: 'Bedroom Light',
          room: 'Bedroom',
          platform: PlatformEnum.SMARTTHINGS,
          capabilities: [CapabilityEnum.SWITCH],
          online: false,
        })
      );

      registry.addDevice(
        createMockDevice({
          name: 'Kitchen Sensor',
          room: 'Kitchen',
          platform: PlatformEnum.SMARTTHINGS,
          capabilities: [CapabilityEnum.TEMPERATURE_SENSOR],
          online: true,
        })
      );
    });

    it('should filter by room', () => {
      const devices = registry.findDevices({ roomId: 'Living Room' as any });

      expect(devices).toHaveLength(2);
      expect(devices.every((d) => d.room === 'Living Room')).toBe(true);
    });

    it('should filter by capability', () => {
      const devices = registry.findDevices({ capability: CapabilityEnum.DIMMER });

      expect(devices).toHaveLength(1);
      expect(devices[0]!.name).toBe('Living Room Light');
    });

    it('should filter by platform', () => {
      const devices = registry.findDevices({ platform: PlatformEnum.SMARTTHINGS });

      expect(devices).toHaveLength(4);
    });

    it('should filter by online status', () => {
      const devices = registry.findDevices({ online: true });

      expect(devices).toHaveLength(3);
      expect(devices.every((d) => d.online)).toBe(true);
    });

    it('should filter by name pattern', () => {
      const devices = registry.findDevices({ namePattern: /Light/i });

      expect(devices).toHaveLength(2);
      expect(devices.every((d) => d.name.includes('Light'))).toBe(true);
    });

    it('should combine multiple filters (AND logic)', () => {
      const devices = registry.findDevices({
        roomId: 'Living Room' as any,
        capability: CapabilityEnum.DIMMER,
        online: true,
      });

      expect(devices).toHaveLength(1);
      expect(devices[0]!.name).toBe('Living Room Light');
    });

    it('should return empty array when no devices match', () => {
      const devices = registry.findDevices({
        roomId: 'Garage' as any,
      });

      expect(devices).toHaveLength(0);
    });
  });

  describe('Room Operations', () => {
    beforeEach(() => {
      registry.addDevice(createMockDevice({ room: 'Living Room' }));
      registry.addDevice(createMockDevice({ room: 'Living Room' }));
      registry.addDevice(createMockDevice({ room: 'Bedroom' }));
    });

    it('should list all rooms', () => {
      const rooms = registry.getAllRooms();

      expect(rooms).toHaveLength(2);
      expect(rooms).toContain('Living Room');
      expect(rooms).toContain('Bedroom');
    });

    it('should get devices in room', () => {
      const devices = registry.getDevicesInRoom('Living Room');

      expect(devices).toHaveLength(2);
      expect(devices.every((d) => d.room === 'Living Room')).toBe(true);
    });

    it('should return empty array for non-existent room', () => {
      const devices = registry.getDevicesInRoom('Garage');

      expect(devices).toHaveLength(0);
    });

    it('should remove room from index when last device removed', () => {
      const device = createMockDevice({ room: 'Test Room' });
      registry.addDevice(device);

      expect(registry.getAllRooms()).toContain('Test Room');

      registry.removeDevice(device.id);

      expect(registry.getAllRooms()).not.toContain('Test Room');
    });
  });

  describe('Registry Statistics', () => {
    beforeEach(() => {
      registry.addDevice(
        createMockDevice({
          room: 'Living Room',
          platform: PlatformEnum.SMARTTHINGS,
          capabilities: [CapabilityEnum.SWITCH, CapabilityEnum.DIMMER],
        })
      );

      registry.addDevice(
        createMockDevice({
          room: 'Living Room',
          platform: PlatformEnum.SMARTTHINGS,
          capabilities: [CapabilityEnum.SWITCH],
        })
      );

      registry.addDevice(
        createMockDevice({
          room: 'Bedroom',
          platform: PlatformEnum.SMARTTHINGS,
          capabilities: [CapabilityEnum.TEMPERATURE_SENSOR],
        })
      );
    });

    it('should calculate correct device count', () => {
      const stats = registry.getStats();

      expect(stats.deviceCount).toBe(3);
    });

    it('should calculate correct room count', () => {
      const stats = registry.getStats();

      expect(stats.roomCount).toBe(2);
    });

    it('should calculate devices per room', () => {
      const stats = registry.getStats();

      expect(stats.devicesPerRoom.get('Living Room')).toBe(2);
      expect(stats.devicesPerRoom.get('Bedroom')).toBe(1);
    });

    it('should calculate devices per capability', () => {
      const stats = registry.getStats();

      expect(stats.devicesPerCapability.get(CapabilityEnum.SWITCH)).toBe(2);
      expect(stats.devicesPerCapability.get(CapabilityEnum.DIMMER)).toBe(1);
      expect(stats.devicesPerCapability.get(CapabilityEnum.TEMPERATURE_SENSOR)).toBe(1);
    });
  });

  describe('Persistence', () => {
    const testFilePath = '/tmp/test-registry.json';

    afterEach(async () => {
      try {
        await fs.unlink(testFilePath);
      } catch {
        // Ignore if file doesn't exist
      }
    });

    it('should save registry to file', async () => {
      registry.addDevice(createMockDevice({ name: 'Test Device 1' }));
      registry.addDevice(createMockDevice({ name: 'Test Device 2' }));

      await registry.save(testFilePath);

      const fileContent = await fs.readFile(testFilePath, 'utf-8');
      const devices = JSON.parse(fileContent);

      expect(devices).toHaveLength(2);
    });

    it('should load registry from file', async () => {
      const device1 = createMockDevice({ name: 'Device 1' });
      const device2 = createMockDevice({ name: 'Device 2' });

      registry.addDevice(device1);
      registry.addDevice(device2);
      await registry.save(testFilePath);

      // Create new registry and load
      const newRegistry = new DeviceRegistry();
      await newRegistry.load(testFilePath);

      expect(newRegistry.getStats().deviceCount).toBe(2);
      expect(newRegistry.getDevice(device1.id)).toBeDefined();
      expect(newRegistry.getDevice(device2.id)).toBeDefined();
    });

    it('should clear existing devices when loading', async () => {
      registry.addDevice(createMockDevice({ name: 'Old Device' }));

      // Create separate registry with different devices
      const tempRegistry = new DeviceRegistry();
      tempRegistry.addDevice(createMockDevice({ name: 'New Device' }));
      await tempRegistry.save(testFilePath);

      // Load into registry (should clear old device)
      await registry.load(testFilePath);

      expect(registry.getStats().deviceCount).toBe(1);
      const devices = registry.getAllDevices();
      expect(devices[0]!.name).toBe('New Device');
    });

    it('should rebuild all indices when loading', async () => {
      const device = createMockDevice({
        name: 'Test Device',
        room: 'Living Room',
        capabilities: [CapabilityEnum.SWITCH],
      });

      registry.addDevice(device);
      await registry.save(testFilePath);

      const newRegistry = new DeviceRegistry();
      await newRegistry.load(testFilePath);

      // Test all indices work
      expect(newRegistry.resolveDevice('Test Device')).toBeDefined();
      expect(newRegistry.getDevicesInRoom('Living Room')).toHaveLength(1);
      expect(newRegistry.findDevices({ capability: CapabilityEnum.SWITCH })).toHaveLength(1);
    });
  });

  describe('Performance Requirements', () => {
    it('should handle 200+ devices with <10ms lookup', () => {
      // Add 200 devices
      const devices: UnifiedDevice[] = [];
      for (let i = 0; i < 200; i++) {
        const device = createMockDevice({
          name: `Device ${i}`,
          room: `Room ${i % 10}`,
          capabilities: [CapabilityEnum.SWITCH],
        });
        devices.push(device);
        registry.addDevice(device);
      }

      // Test lookup performance
      const startTime = performance.now();
      const result = registry.resolveDevice('Device 100');
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(10); // <10ms requirement
    });

    it('should handle complex queries on 200+ devices efficiently', () => {
      // Add 200 diverse devices
      for (let i = 0; i < 200; i++) {
        registry.addDevice(
          createMockDevice({
            name: `Device ${i}`,
            room: `Room ${i % 10}`,
            platform: PlatformEnum.SMARTTHINGS,
            capabilities: i % 2 === 0 ? [CapabilityEnum.SWITCH] : [CapabilityEnum.DIMMER],
            online: i % 3 !== 0,
          })
        );
      }

      // Test complex query performance
      // Room 0 has even-numbered devices (0, 10, 20, ...) which have SWITCH capability
      // Of those, devices where i%3!==0 are online (10, 20, 40, 50, ...)
      const startTime = performance.now();
      const results = registry.findDevices({
        roomId: 'Room 0' as any,
        capability: CapabilityEnum.SWITCH,
        online: true,
      });
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10); // <10ms requirement
    });

    it('should handle fuzzy matching on large dataset efficiently', () => {
      // Add 200 devices with varied names
      for (let i = 0; i < 200; i++) {
        registry.addDevice(
          createMockDevice({
            name: `Living Room Device ${i}`,
          })
        );
      }

      // Test fuzzy matching performance
      const startTime = performance.now();
      const result = registry.resolveDevice('Livng Room Device 100'); // Typo: missing 'i'
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toBeDefined();
      expect(result?.matchType).toBe('fuzzy');
      // Fuzzy matching is O(n) so may take slightly longer, but should still be reasonable
      expect(duration).toBeLessThan(50); // More lenient for fuzzy matching
    });
  });

  describe('Edge Cases', () => {
    it('should handle device with no room', () => {
      const device = createMockDevice({ room: undefined });

      registry.addDevice(device);

      expect(registry.getDevice(device.id)).toBeDefined();
      expect(registry.getAllRooms()).toHaveLength(0);
    });

    it('should handle device with no label', () => {
      const device = createMockDevice({ label: undefined });

      registry.addDevice(device);

      const result = registry.resolveDevice(device.name);
      expect(result).toBeDefined();
    });

    it('should handle empty registry operations', () => {
      expect(registry.getAllDevices()).toHaveLength(0);
      expect(registry.getAllRooms()).toHaveLength(0);
      expect(registry.findDevices({})).toHaveLength(0);
    });

    it('should handle clear operation', () => {
      registry.addDevice(createMockDevice());
      registry.addDevice(createMockDevice());

      registry.clear();

      expect(registry.getStats().deviceCount).toBe(0);
      expect(registry.getAllRooms()).toHaveLength(0);
    });
  });
});
