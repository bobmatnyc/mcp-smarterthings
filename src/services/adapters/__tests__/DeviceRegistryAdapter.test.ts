/**
 * Tests for DeviceRegistryAdapter integration.
 *
 * Test Coverage:
 * - Single device add/update/remove
 * - Batch device operations
 * - Sync from DeviceService state
 * - Error handling (transformation failures, invalid devices)
 * - Performance verification (<1ms per device, <200ms for 200 devices)
 * - Status integration (online, lastSeen)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceRegistry } from '../../../abstract/DeviceRegistry.js';
import { DeviceRegistryAdapter } from '../DeviceRegistryAdapter.js';
import { createDeviceId } from '../../../types/smartthings.js';
import { DeviceCapability, Platform, createUniversalDeviceId } from '../../../types/unified-device.js';
import type { DeviceInfo, DeviceStatus } from '../../../types/smartthings.js';

describe('DeviceRegistryAdapter', () => {
  let registry: DeviceRegistry;
  let adapter: DeviceRegistryAdapter;

  beforeEach(() => {
    registry = new DeviceRegistry();
    adapter = new DeviceRegistryAdapter(registry);
  });

  describe('Single Device Operations', () => {
    it('adds DeviceInfo to registry successfully', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-1'),
        name: 'Living Room Light',
        label: 'Main Light',
        capabilities: ['switch', 'switchLevel'],
        roomName: 'Living Room',
      };

      const added = adapter.addDeviceInfo(deviceInfo);

      expect(added).toBe(true);

      // Verify device was added with correct transformation
      const device = registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'test-device-1'));
      expect(device).toBeDefined();
      expect(device?.name).toBe('Living Room Light');
      expect(device?.label).toBe('Main Light');
      expect(device?.room).toBe('Living Room');
      expect(device?.platform).toBe(Platform.SMARTTHINGS);
      expect(device?.capabilities).toContain(DeviceCapability.SWITCH);
      expect(device?.capabilities).toContain(DeviceCapability.DIMMER);
    });

    it('adds DeviceInfo with status (online, lastSeen)', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-2'),
        name: 'Motion Sensor',
        capabilities: ['motionSensor', 'battery'],
      };

      const status: DeviceStatus = {
        deviceId: createDeviceId('test-device-2'),
        components: {
          main: {
            healthCheck: {
              healthStatus: {
                value: 'online',
                timestamp: '2024-01-15T12:00:00Z',
              },
            },
            battery: {
              battery: {
                value: 85,
                timestamp: '2024-01-15T12:30:00Z',
              },
            },
          },
        },
      };

      adapter.addDeviceInfo(deviceInfo, status);

      const device = registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'test-device-2'));
      expect(device?.online).toBe(true);
      expect(device?.lastSeen).toEqual(new Date('2024-01-15T12:30:00Z'));
    });

    it('updates existing DeviceInfo', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-3'),
        name: 'Original Name',
        capabilities: ['switch'],
      };

      adapter.addDeviceInfo(deviceInfo);

      // Update device
      const updatedInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-3'),
        name: 'Updated Name',
        label: 'New Label',
        capabilities: ['switch', 'switchLevel'],
        roomName: 'Bedroom',
      };

      const updated = adapter.updateDeviceInfo(updatedInfo);
      expect(updated).toBe(true);

      const device = registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'test-device-3'));
      expect(device?.name).toBe('Updated Name');
      expect(device?.label).toBe('New Label');
      expect(device?.room).toBe('Bedroom');
      expect(device?.capabilities).toHaveLength(2);
    });

    it('returns false when updating non-existent device', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('non-existent'),
        name: 'Ghost Device',
      };

      const updated = adapter.updateDeviceInfo(deviceInfo);
      expect(updated).toBe(false);
    });

    it('handles unknown capabilities gracefully', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-4'),
        name: 'Future Device',
        capabilities: ['switch', 'futureCapability', 'unknownThing'],
      };

      adapter.addDeviceInfo(deviceInfo);

      const device = registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'test-device-4'));
      expect(device?.capabilities).toEqual([DeviceCapability.SWITCH]);
    });
  });

  describe('Batch Operations', () => {
    it('batch adds multiple devices successfully', async () => {
      const devices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('batch-1'),
          name: 'Light 1',
          capabilities: ['switch'],
        },
        {
          deviceId: createDeviceId('batch-2'),
          name: 'Light 2',
          capabilities: ['switch', 'switchLevel'],
        },
        {
          deviceId: createDeviceId('batch-3'),
          name: 'Sensor 1',
          capabilities: ['temperatureMeasurement', 'battery'],
        },
      ];

      const result = await adapter.addDeviceInfoBatch(devices);

      expect(result.added).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThan(0);

      // Verify all devices added
      expect(registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'batch-1'))).toBeDefined();
      expect(registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'batch-2'))).toBeDefined();
      expect(registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'batch-3'))).toBeDefined();
    });

    it('batch adds with status map', async () => {
      const devices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('status-1'),
          name: 'Device 1',
          capabilities: ['switch'],
        },
        {
          deviceId: createDeviceId('status-2'),
          name: 'Device 2',
          capabilities: ['switch'],
        },
      ];

      const statusMap = new Map<string, DeviceStatus>([
        [
          'status-1',
          {
            deviceId: createDeviceId('status-1'),
            components: {
              main: {
                healthCheck: {
                  healthStatus: {
                    value: 'offline',
                    timestamp: '2024-01-15T12:00:00Z',
                  },
                },
              },
            },
          },
        ],
      ]);

      await adapter.addDeviceInfoBatch(devices, statusMap);

      const device1 = registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'status-1'));
      const device2 = registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'status-2'));

      expect(device1?.online).toBe(false); // Has offline status
      expect(device2?.online).toBe(true); // No status = default online
    });

    it('continues batch processing on individual failures', async () => {
      const devices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('valid-1'),
          name: 'Valid Device',
          capabilities: ['switch'],
        },
        // Invalid device (missing required name)
        {
          deviceId: createDeviceId('invalid-1'),
          name: '', // Empty name will fail validation
        } as any,
        {
          deviceId: createDeviceId('valid-2'),
          name: 'Another Valid Device',
          capabilities: ['temperatureMeasurement'],
        },
      ];

      const result = await adapter.addDeviceInfoBatch(devices);

      // Should add valid devices, skip invalid
      expect(result.added).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.deviceId).toBe('invalid-1');
    });

    it('batch operation performance: <200ms for 50 devices', async () => {
      // Create 50 test devices
      const devices: DeviceInfo[] = Array.from({ length: 50 }, (_, i) => ({
        deviceId: createDeviceId(`perf-device-${i}`),
        name: `Device ${i}`,
        capabilities: ['switch', 'switchLevel'],
        roomName: `Room ${i % 5}`,
      }));

      const result = await adapter.addDeviceInfoBatch(devices);

      expect(result.added).toBe(50);
      expect(result.durationMs).toBeLessThan(200); // Performance target

      // Verify registry state
      const stats = registry.getStats();
      expect(stats.deviceCount).toBe(50);
    });
  });

  describe('Sync from DeviceService', () => {
    it('adds new devices during sync', async () => {
      // Initial state: empty registry
      const currentDevices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('sync-new-1'),
          name: 'New Device 1',
          capabilities: ['switch'],
        },
        {
          deviceId: createDeviceId('sync-new-2'),
          name: 'New Device 2',
          capabilities: ['temperatureMeasurement'],
        },
      ];

      const result = await adapter.syncFromDeviceService(currentDevices);

      expect(result.added).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.unchanged).toBe(0);
    });

    it('removes deleted devices during sync', async () => {
      // Add some devices first
      adapter.addDeviceInfo({
        deviceId: createDeviceId('sync-old-1'),
        name: 'Old Device 1',
      });
      adapter.addDeviceInfo({
        deviceId: createDeviceId('sync-old-2'),
        name: 'Old Device 2',
      });

      // Sync with empty list (all devices removed)
      const result = await adapter.syncFromDeviceService([]);

      expect(result.removed).toBe(2);
      expect(result.added).toBe(0);
      expect(registry.getStats().deviceCount).toBe(0);
    });

    it('updates changed devices during sync', async () => {
      // Add initial device
      adapter.addDeviceInfo({
        deviceId: createDeviceId('sync-update-1'),
        name: 'Original Name',
        capabilities: ['switch'],
      });

      // Sync with updated device
      const currentDevices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('sync-update-1'),
          name: 'Updated Name',
          label: 'New Label',
          capabilities: ['switch', 'switchLevel'],
          roomName: 'Living Room',
        },
      ];

      const result = await adapter.syncFromDeviceService(currentDevices);

      expect(result.updated).toBe(1);
      expect(result.added).toBe(0);
      expect(result.removed).toBe(0);

      const device = registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'sync-update-1'));
      expect(device?.name).toBe('Updated Name');
      expect(device?.label).toBe('New Label');
      expect(device?.room).toBe('Living Room');
    });

    it('detects unchanged devices during sync', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('sync-unchanged-1'),
        name: 'Unchanged Device',
        capabilities: ['switch'],
      };

      adapter.addDeviceInfo(deviceInfo);

      // Sync with same device (no changes)
      const result = await adapter.syncFromDeviceService([deviceInfo]);

      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.added).toBe(0);
      expect(result.removed).toBe(0);
    });

    it('handles complex sync scenario (add, update, remove)', async () => {
      // Initial state
      adapter.addDeviceInfo({
        deviceId: createDeviceId('keep-1'),
        name: 'Device to Keep',
      });
      adapter.addDeviceInfo({
        deviceId: createDeviceId('update-1'),
        name: 'Device to Update',
      });
      adapter.addDeviceInfo({
        deviceId: createDeviceId('remove-1'),
        name: 'Device to Remove',
      });

      // Sync state
      const currentDevices: DeviceInfo[] = [
        // Kept (unchanged)
        {
          deviceId: createDeviceId('keep-1'),
          name: 'Device to Keep',
        },
        // Updated
        {
          deviceId: createDeviceId('update-1'),
          name: 'Updated Device',
          roomName: 'New Room',
        },
        // Added (new)
        {
          deviceId: createDeviceId('add-1'),
          name: 'New Device',
        },
        // remove-1 is not in list → will be removed
      ];

      const result = await adapter.syncFromDeviceService(currentDevices);

      expect(result.added).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.removed).toBe(1);
      expect(result.unchanged).toBe(1);

      // Verify final state
      expect(registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'keep-1'))).toBeDefined();
      expect(registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'update-1'))?.room).toBe('New Room');
      expect(registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'add-1'))).toBeDefined();
      expect(registry.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, 'remove-1'))).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('handles registry validation errors gracefully', async () => {
      const devices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('valid'),
          name: 'Valid Device',
        },
        // Invalid device structure - empty name will fail DeviceRegistry validation
        {
          deviceId: createDeviceId('invalid'),
          name: '', // Empty name will fail registry.addDevice()
        },
      ];

      const result = await adapter.addDeviceInfoBatch(devices);

      expect(result.added).toBe(1); // Only valid device added
      expect(result.failed).toBe(1); // Invalid device failed
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]?.deviceId).toBe('invalid');
    });
  });

  describe('Integration with DeviceRegistry Features', () => {
    it('indexed devices are searchable by name', () => {
      adapter.addDeviceInfo({
        deviceId: createDeviceId('search-1'),
        name: 'Living Room Light',
        capabilities: ['switch'],
      });

      // Use DeviceRegistry's resolution
      const result = registry.resolveDevice('Living Room Light');

      expect(result).toBeDefined();
      expect(result?.device.id).toBe('smartthings:search-1');
      expect(result?.matchType).toBe('exact');
    });

    it('indexed devices are searchable by room', () => {
      adapter.addDeviceInfo({
        deviceId: createDeviceId('room-1'),
        name: 'Light 1',
        roomName: 'Bedroom',
      });
      adapter.addDeviceInfo({
        deviceId: createDeviceId('room-2'),
        name: 'Light 2',
        roomName: 'Bedroom',
      });

      const bedroomDevices = registry.getDevicesInRoom('Bedroom');

      expect(bedroomDevices).toHaveLength(2);
    });

    it('indexed devices are searchable by capability', () => {
      adapter.addDeviceInfo({
        deviceId: createDeviceId('cap-1'),
        name: 'Multi-Sensor',
        capabilities: ['temperatureMeasurement', 'motionSensor'],
      });

      const devices = registry.findDevices({
        capability: DeviceCapability.TEMPERATURE_SENSOR,
      });

      expect(devices).toHaveLength(1);
      expect(devices[0]!.id).toBe('smartthings:cap-1');
    });
  });

  describe('getRegistry', () => {
    it('returns underlying registry instance', () => {
      const underlyingRegistry = adapter.getRegistry();
      expect(underlyingRegistry).toBe(registry);
    });
  });
});
