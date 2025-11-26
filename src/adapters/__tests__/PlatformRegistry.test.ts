/**
 * PlatformRegistry test suite.
 *
 * Comprehensive tests for platform adapter management including:
 * - Registration and validation
 * - Adapter access and routing
 * - Unified device operations
 * - Event propagation
 * - Health monitoring
 * - Error handling and graceful degradation
 * - Thread safety and concurrent operations
 *
 * @module adapters/__tests__/PlatformRegistry.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PlatformRegistry } from '../PlatformRegistry.js';
import type { IDeviceAdapter } from '../base/IDeviceAdapter.js';
import {
  Platform,
  DeviceCapability,
  createUniversalDeviceId,
} from '../../types/unified-device.js';
import type { UniversalDeviceId, UnifiedDevice } from '../../types/unified-device.js';
import type { DeviceCommand, CommandResult } from '../../types/commands.js';
import type { DeviceState } from '../../types/device-state.js';
import { ConfigurationError, DeviceNotFoundError } from '../../types/errors.js';

/**
 * Create a mock adapter for testing.
 */
function createMockAdapter(platform: Platform, options?: {
  shouldFailInitialize?: boolean;
  shouldFailHealthCheck?: boolean;
  shouldFailListDevices?: boolean;
}): IDeviceAdapter {
  const adapter = new EventEmitter() as unknown as IDeviceAdapter;

  // Metadata (use Object.defineProperty to set readonly properties)
  Object.defineProperty(adapter, 'platform', { value: platform, writable: false });
  Object.defineProperty(adapter, 'platformName', { value: `${platform} Adapter`, writable: false });
  Object.defineProperty(adapter, 'version', { value: '1.0.0', writable: false });

  // State
  let initialized = false;

  // Lifecycle
  adapter.initialize = vi.fn(async () => {
    if (options?.shouldFailInitialize) {
      throw new Error('Initialization failed');
    }
    initialized = true;
  });

  adapter.dispose = vi.fn(async () => {
    initialized = false;
  });

  adapter.isInitialized = vi.fn(() => initialized);

  // Health
  adapter.healthCheck = vi.fn(async () => {
    if (options?.shouldFailHealthCheck) {
      throw new Error('Health check failed');
    }
    return {
      healthy: true,
      platform,
      apiReachable: true,
      authenticated: true,
      errorCount: 0,
    };
  });

  // Device operations
  adapter.listDevices = vi.fn(async () => {
    if (options?.shouldFailListDevices) {
      throw new Error('Failed to list devices');
    }
    return [
      {
        id: createUniversalDeviceId(platform, 'device-1'),
        platform,
        platformDeviceId: 'device-1',
        name: `${platform} Device 1`,
        capabilities: [DeviceCapability.SWITCH],
        online: true,
      } as UnifiedDevice,
    ];
  });

  adapter.getDevice = vi.fn(async (deviceId: string) => {
    return {
      id: deviceId as UniversalDeviceId,
      platform,
      platformDeviceId: deviceId.split(':')[1] || deviceId,
      name: `${platform} Device`,
      capabilities: [DeviceCapability.SWITCH],
      online: true,
    } as UnifiedDevice;
  });

  adapter.getDeviceState = vi.fn(async (deviceId: string) => {
    return {
      deviceId: deviceId as UniversalDeviceId,
      timestamp: new Date(),
      attributes: {
        'switch.switch': 'off',
      },
    } as DeviceState;
  });

  adapter.refreshDeviceState = vi.fn(async (deviceId: string) => {
    return adapter.getDeviceState(deviceId);
  });

  adapter.getDeviceCapabilities = vi.fn(async () => {
    return [DeviceCapability.SWITCH];
  });

  adapter.executeCommand = vi.fn(async (deviceId: string, command: DeviceCommand) => {
    return {
      success: true,
      deviceId: deviceId as UniversalDeviceId,
      command,
      executedAt: new Date(),
    } as CommandResult;
  });

  adapter.executeBatchCommands = vi.fn(async () => []);

  adapter.mapPlatformCapability = vi.fn(() => DeviceCapability.SWITCH);
  adapter.mapUnifiedCapability = vi.fn(() => 'switch');

  adapter.listLocations = vi.fn(async () => []);
  adapter.listRooms = vi.fn(async () => []);

  adapter.supportsScenes = vi.fn(() => false);
  adapter.listScenes = vi.fn(async () => []);
  adapter.executeScene = vi.fn(async () => {});

  return adapter;
}

describe('PlatformRegistry', () => {
  let registry: PlatformRegistry;
  let mockSmartThingsAdapter: IDeviceAdapter;
  let mockTuyaAdapter: IDeviceAdapter;
  let mockLutronAdapter: IDeviceAdapter;

  beforeEach(() => {
    registry = new PlatformRegistry();
    mockSmartThingsAdapter = createMockAdapter(Platform.SMARTTHINGS);
    mockTuyaAdapter = createMockAdapter(Platform.TUYA);
    mockLutronAdapter = createMockAdapter(Platform.LUTRON);
  });

  describe('Registration', () => {
    it('should register adapter successfully', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      expect(registry.hasAdapter(Platform.SMARTTHINGS)).toBe(true);
      expect(registry.getAdapter(Platform.SMARTTHINGS)).toBe(mockSmartThingsAdapter);
      expect(mockSmartThingsAdapter.initialize).toHaveBeenCalled();
    });

    it('should initialize adapter on registration', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      expect(mockSmartThingsAdapter.initialize).toHaveBeenCalledTimes(1);
      expect(mockSmartThingsAdapter.isInitialized()).toBe(true);
    });

    it('should reject duplicate registration', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      await expect(
        registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter)
      ).rejects.toThrow(ConfigurationError);
      await expect(
        registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter)
      ).rejects.toThrow('already registered');
    });

    it('should validate adapter interface', async () => {
      const invalidAdapter = { platform: Platform.SMARTTHINGS } as IDeviceAdapter;

      await expect(
        registry.registerAdapter(Platform.SMARTTHINGS, invalidAdapter)
      ).rejects.toThrow(ConfigurationError);
      await expect(
        registry.registerAdapter(Platform.SMARTTHINGS, invalidAdapter)
      ).rejects.toThrow('Invalid adapter');
    });

    it('should validate platform matches adapter', async () => {
      // Try to register Tuya adapter as SmartThings
      await expect(
        registry.registerAdapter(Platform.SMARTTHINGS, mockTuyaAdapter)
      ).rejects.toThrow(ConfigurationError);
      await expect(
        registry.registerAdapter(Platform.SMARTTHINGS, mockTuyaAdapter)
      ).rejects.toThrow('platform mismatch');
    });

    it('should emit adapterRegistered event', async () => {
      const listener = vi.fn();
      registry.on('adapterRegistered', listener);

      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: Platform.SMARTTHINGS,
          metadata: expect.objectContaining({
            platformName: mockSmartThingsAdapter.platformName,
            version: mockSmartThingsAdapter.version,
          }),
        })
      );
    });

    it('should throw on initialization failure', async () => {
      const failingAdapter = createMockAdapter(Platform.SMARTTHINGS, {
        shouldFailInitialize: true,
      });

      await expect(
        registry.registerAdapter(Platform.SMARTTHINGS, failingAdapter)
      ).rejects.toThrow('Initialization failed');

      expect(registry.hasAdapter(Platform.SMARTTHINGS)).toBe(false);
    });

    it('should unregister adapter', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      expect(registry.hasAdapter(Platform.SMARTTHINGS)).toBe(true);

      await registry.unregisterAdapter(Platform.SMARTTHINGS);

      expect(registry.hasAdapter(Platform.SMARTTHINGS)).toBe(false);
      expect(mockSmartThingsAdapter.dispose).toHaveBeenCalled();
    });

    it('should dispose adapter on unregister', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      await registry.unregisterAdapter(Platform.SMARTTHINGS, 'Test cleanup');

      expect(mockSmartThingsAdapter.dispose).toHaveBeenCalledTimes(1);
      expect(mockSmartThingsAdapter.isInitialized()).toBe(false);
    });

    it('should emit adapterUnregistered event', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      const listener = vi.fn();
      registry.on('adapterUnregistered', listener);

      await registry.unregisterAdapter(Platform.SMARTTHINGS, 'Test cleanup');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: Platform.SMARTTHINGS,
          reason: 'Test cleanup',
        })
      );
    });

    it('should throw when unregistering non-existent adapter', async () => {
      await expect(
        registry.unregisterAdapter(Platform.SMARTTHINGS)
      ).rejects.toThrow(DeviceNotFoundError);
      await expect(
        registry.unregisterAdapter(Platform.SMARTTHINGS)
      ).rejects.toThrow('not registered');
    });
  });

  describe('Adapter Access', () => {
    beforeEach(async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      await registry.registerAdapter(Platform.TUYA, mockTuyaAdapter);
    });

    it('should get registered adapter', () => {
      const adapter = registry.getAdapter(Platform.SMARTTHINGS);

      expect(adapter).toBe(mockSmartThingsAdapter);
    });

    it('should return undefined for unregistered adapter', () => {
      const adapter = registry.getAdapter(Platform.LUTRON);

      expect(adapter).toBeUndefined();
    });

    it('should list all registered adapters', () => {
      const platforms = registry.listAdapters();

      expect(platforms).toHaveLength(2);
      expect(platforms).toContain(Platform.SMARTTHINGS);
      expect(platforms).toContain(Platform.TUYA);
    });

    it('should check adapter existence', () => {
      expect(registry.hasAdapter(Platform.SMARTTHINGS)).toBe(true);
      expect(registry.hasAdapter(Platform.TUYA)).toBe(true);
      expect(registry.hasAdapter(Platform.LUTRON)).toBe(false);
    });

    it('should get adapter count', async () => {
      expect(registry.getAdapterCount()).toBe(2);

      await registry.registerAdapter(Platform.LUTRON, mockLutronAdapter);
      expect(registry.getAdapterCount()).toBe(3);
    });
  });

  describe('Device Routing', () => {
    beforeEach(async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      await registry.registerAdapter(Platform.TUYA, mockTuyaAdapter);
    });

    it('should route to correct adapter by device ID', () => {
      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'abc-123');
      const adapter = registry.getAdapterForDevice(deviceId);

      expect(adapter).toBe(mockSmartThingsAdapter);
      expect(adapter.platform).toBe(Platform.SMARTTHINGS);
    });

    it('should cache platform lookups', () => {
      const deviceId = createUniversalDeviceId(Platform.TUYA, 'device-456');

      // First lookup - parse and cache
      const adapter1 = registry.getAdapterForDevice(deviceId);
      expect(adapter1).toBe(mockTuyaAdapter);

      // Second lookup - from cache
      const adapter2 = registry.getAdapterForDevice(deviceId);
      expect(adapter2).toBe(mockTuyaAdapter);
    });

    it('should throw on unknown platform', () => {
      const deviceId = createUniversalDeviceId(Platform.LUTRON, 'zone-1');

      expect(() => registry.getAdapterForDevice(deviceId)).toThrow(
        DeviceNotFoundError
      );
      expect(() => registry.getAdapterForDevice(deviceId)).toThrow(
        /No adapter registered|Device not found/
      );
    });

    it('should handle invalid device ID format', () => {
      const invalidId = 'not-a-valid-id' as UniversalDeviceId;

      expect(() => registry.getAdapterForDevice(invalidId)).toThrow();
    });

    it('should clear cache when adapter unregistered', async () => {
      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'device-1');

      // Cache the device
      registry.getAdapterForDevice(deviceId);

      // Unregister adapter
      await registry.unregisterAdapter(Platform.SMARTTHINGS);

      // Should throw because platform no longer registered
      expect(() => registry.getAdapterForDevice(deviceId)).toThrow(
        DeviceNotFoundError
      );
    });
  });

  describe('Unified Operations', () => {
    beforeEach(async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      await registry.registerAdapter(Platform.TUYA, mockTuyaAdapter);
    });

    it('should list devices from all adapters', async () => {
      const devices = await registry.listAllDevices();

      expect(devices).toHaveLength(2);
      expect(mockSmartThingsAdapter.listDevices).toHaveBeenCalled();
      expect(mockTuyaAdapter.listDevices).toHaveBeenCalled();

      const platforms = devices.map((d) => d.platform);
      expect(platforms).toContain(Platform.SMARTTHINGS);
      expect(platforms).toContain(Platform.TUYA);
    });

    it('should filter devices by platform', async () => {
      const devices = await registry.listAllDevices({
        platform: Platform.SMARTTHINGS,
      });

      expect(devices).toHaveLength(1);
      expect(devices[0]?.platform).toBe(Platform.SMARTTHINGS);
      expect(mockSmartThingsAdapter.listDevices).toHaveBeenCalled();
      expect(mockTuyaAdapter.listDevices).not.toHaveBeenCalled();
    });

    it('should pass filters to adapters', async () => {
      const filter = {
        capability: DeviceCapability.SWITCH,
        online: true,
      };

      await registry.listAllDevices(filter);

      expect(mockSmartThingsAdapter.listDevices).toHaveBeenCalledWith(
        expect.objectContaining({
          capability: DeviceCapability.SWITCH,
          online: true,
        })
      );
    });

    it('should handle adapter failures gracefully', async () => {
      const failingAdapter = createMockAdapter(Platform.LUTRON, {
        shouldFailListDevices: true,
      });
      await registry.registerAdapter(Platform.LUTRON, failingAdapter);

      // Listen for error events
      const errorListener = vi.fn();
      registry.on('error', errorListener);

      // Should not throw, just skip failing adapter
      const devices = await registry.listAllDevices();

      expect(devices).toHaveLength(2); // Only SmartThings and Tuya
      expect(devices.every((d) => d.platform !== Platform.LUTRON)).toBe(true);
      expect(errorListener).toHaveBeenCalled();
    });

    it('should get device from correct adapter', async () => {
      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'device-1');

      const device = await registry.getDevice(deviceId);

      expect(device.platform).toBe(Platform.SMARTTHINGS);
      expect(mockSmartThingsAdapter.getDevice).toHaveBeenCalledWith(deviceId);
      expect(mockTuyaAdapter.getDevice).not.toHaveBeenCalled();
    });

    it('should execute command via correct adapter', async () => {
      const deviceId = createUniversalDeviceId(Platform.TUYA, 'device-1');
      const command: DeviceCommand = {
        capability: DeviceCapability.SWITCH,
        command: 'on',
      };

      const result = await registry.executeCommand(deviceId, command);

      expect(result.success).toBe(true);
      expect(mockTuyaAdapter.executeCommand).toHaveBeenCalledWith(
        deviceId,
        command,
        undefined
      );
      expect(mockSmartThingsAdapter.executeCommand).not.toHaveBeenCalled();
    });

    it('should get state from correct adapter', async () => {
      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'device-1');

      const state = await registry.getDeviceState(deviceId);

      expect(state.deviceId).toBe(deviceId);
      expect(mockSmartThingsAdapter.getDeviceState).toHaveBeenCalledWith(deviceId);
      expect(mockTuyaAdapter.getDeviceState).not.toHaveBeenCalled();
    });
  });

  describe('Lifecycle', () => {
    it('should initialize all adapters', async () => {
      // Register without automatic initialization
      const uninitializedAdapter = createMockAdapter(Platform.SMARTTHINGS);
      vi.mocked(uninitializedAdapter.isInitialized).mockReturnValue(false);

      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      await registry.registerAdapter(Platform.TUYA, mockTuyaAdapter);

      await registry.initializeAll();

      expect(mockSmartThingsAdapter.initialize).toHaveBeenCalled();
      expect(mockTuyaAdapter.initialize).toHaveBeenCalled();
    });

    it('should dispose all adapters', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      await registry.registerAdapter(Platform.TUYA, mockTuyaAdapter);

      await registry.disposeAll();

      expect(mockSmartThingsAdapter.dispose).toHaveBeenCalled();
      expect(mockTuyaAdapter.dispose).toHaveBeenCalled();
      expect(registry.getAdapterCount()).toBe(0);
    });

    it('should handle initialization failures gracefully', async () => {
      const failingAdapter = createMockAdapter(Platform.LUTRON, {
        shouldFailInitialize: true,
      });

      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      // Registration should fail due to initialization error
      await expect(
        registry.registerAdapter(Platform.LUTRON, failingAdapter)
      ).rejects.toThrow('Initialization failed');
    });

    it('should clear cache on disposeAll', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'device-1');
      registry.getAdapterForDevice(deviceId); // Cache the device

      await registry.disposeAll();

      // Cache should be cleared
      expect(() => registry.getAdapterForDevice(deviceId)).toThrow();
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      await registry.registerAdapter(Platform.TUYA, mockTuyaAdapter);
    });

    it('should aggregate health from all adapters', async () => {
      const health = await registry.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.adapterCount).toBe(2);
      expect(health.healthyAdapterCount).toBe(2);
      expect(health.adapters.size).toBe(2);
      expect(health.adapters.get(Platform.SMARTTHINGS)?.healthy).toBe(true);
      expect(health.adapters.get(Platform.TUYA)?.healthy).toBe(true);
    });

    it('should report unhealthy if all adapters fail', async () => {
      const failingSmartThings = createMockAdapter(Platform.SMARTTHINGS, {
        shouldFailHealthCheck: true,
      });
      const failingTuya = createMockAdapter(Platform.TUYA, {
        shouldFailHealthCheck: true,
      });

      // Clear registry and add failing adapters
      await registry.disposeAll();
      await registry.registerAdapter(Platform.SMARTTHINGS, failingSmartThings);
      await registry.registerAdapter(Platform.TUYA, failingTuya);

      const health = await registry.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.healthyAdapterCount).toBe(0);
      expect(health.error).toBeDefined();
    });

    it('should report healthy if at least one adapter works', async () => {
      const failingAdapter = createMockAdapter(Platform.LUTRON, {
        shouldFailHealthCheck: true,
      });
      await registry.registerAdapter(Platform.LUTRON, failingAdapter);

      const health = await registry.healthCheck();

      // Should be healthy because SmartThings and Tuya are healthy
      expect(health.healthy).toBe(true);
      expect(health.healthyAdapterCount).toBe(2);
      expect(health.adapterCount).toBe(3);
    });

    it('should include health check timestamp', async () => {
      const before = new Date();
      const health = await registry.healthCheck();
      const after = new Date();

      expect(health.lastCheck.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(health.lastCheck.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Event Propagation', () => {
    beforeEach(async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
    });

    it('should propagate stateChange events', () => {
      const listener = vi.fn();
      registry.on('stateChange', listener);

      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'device-1');
      const event = {
        device: {
          id: deviceId,
          platform: Platform.SMARTTHINGS,
          platformDeviceId: 'device-1',
          name: 'Test Device',
          capabilities: [DeviceCapability.SWITCH],
          online: true,
        } as UnifiedDevice,
        oldState: {
          deviceId,
          timestamp: new Date(),
          attributes: { 'switch.switch': 'off' },
        } as DeviceState,
        newState: {
          deviceId,
          timestamp: new Date(),
          attributes: { 'switch.switch': 'on' },
        } as DeviceState,
        timestamp: new Date(),
      };

      mockSmartThingsAdapter.emit('stateChange', event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should propagate deviceAdded events', () => {
      const listener = vi.fn();
      registry.on('deviceAdded', listener);

      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'new-device');
      const event = {
        device: {
          id: deviceId,
          platform: Platform.SMARTTHINGS,
          platformDeviceId: 'new-device',
          name: 'New Device',
          capabilities: [DeviceCapability.SWITCH],
          online: true,
        } as UnifiedDevice,
        timestamp: new Date(),
      };

      mockSmartThingsAdapter.emit('deviceAdded', event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should propagate deviceRemoved events', () => {
      const listener = vi.fn();
      registry.on('deviceRemoved', listener);

      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'removed-device');
      const event = {
        deviceId,
        timestamp: new Date(),
      };

      mockSmartThingsAdapter.emit('deviceRemoved', event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should update cache on deviceAdded', () => {
      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'new-device');
      const event = {
        device: {
          id: deviceId,
          platform: Platform.SMARTTHINGS,
          platformDeviceId: 'new-device',
          name: 'New Device',
          capabilities: [DeviceCapability.SWITCH],
          online: true,
        } as UnifiedDevice,
        timestamp: new Date(),
      };

      mockSmartThingsAdapter.emit('deviceAdded', event);

      // Device should now be in cache
      const adapter = registry.getAdapterForDevice(deviceId);
      expect(adapter).toBe(mockSmartThingsAdapter);
    });

    it('should clear cache on deviceRemoved', () => {
      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'device-1');

      // Cache the device
      registry.getAdapterForDevice(deviceId);

      // Remove device
      mockSmartThingsAdapter.emit('deviceRemoved', {
        deviceId,
        timestamp: new Date(),
      });

      // Cache should be cleared but adapter still resolvable via ID parsing
      const adapter = registry.getAdapterForDevice(deviceId);
      expect(adapter).toBe(mockSmartThingsAdapter);
    });
  });

  describe('Thread Safety', () => {
    it('should serialize concurrent registrations', async () => {
      const adapter1 = createMockAdapter(Platform.SMARTTHINGS);
      const adapter2 = createMockAdapter(Platform.TUYA);

      // Start both registrations concurrently
      const promise1 = registry.registerAdapter(Platform.SMARTTHINGS, adapter1);
      const promise2 = registry.registerAdapter(Platform.TUYA, adapter2);

      // One should succeed, one should fail with "in progress" error
      const results = await Promise.allSettled([promise1, promise2]);

      // At least one should succeed
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes.length).toBeGreaterThanOrEqual(1);

      // If there was a failure, it should be due to serialization
      if (failures.length > 0) {
        const rejection = failures[0] as PromiseRejectedResult;
        expect(rejection.reason).toBeInstanceOf(ConfigurationError);
      }

      // Register the second one if it failed
      if (failures.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 10)); // Wait for first to complete
        if (!registry.hasAdapter(Platform.TUYA)) {
          await registry.registerAdapter(Platform.TUYA, adapter2);
        }
      }

      // Both should eventually be registered
      expect(registry.hasAdapter(Platform.SMARTTHINGS)).toBe(true);
      expect(registry.hasAdapter(Platform.TUYA)).toBe(true);
    });

    it('should handle concurrent device lookups', async () => {
      await registry.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      await registry.registerAdapter(Platform.TUYA, mockTuyaAdapter);

      const deviceId1 = createUniversalDeviceId(Platform.SMARTTHINGS, 'device-1');
      const deviceId2 = createUniversalDeviceId(Platform.TUYA, 'device-2');

      // Concurrent lookups
      const [adapter1, adapter2] = await Promise.all([
        Promise.resolve(registry.getAdapterForDevice(deviceId1)),
        Promise.resolve(registry.getAdapterForDevice(deviceId2)),
      ]);

      expect(adapter1.platform).toBe(Platform.SMARTTHINGS);
      expect(adapter2.platform).toBe(Platform.TUYA);
    });
  });

  describe('Configuration', () => {
    it('should support disabling cache', () => {
      const registryNoCache = new PlatformRegistry({ enableCaching: false });

      // Cache should not be used
      const deviceId = createUniversalDeviceId(Platform.SMARTTHINGS, 'device-1');

      // Without adapter, should throw
      expect(() => registryNoCache.getAdapterForDevice(deviceId)).toThrow();
    });

    it('should support disabling event propagation', async () => {
      const registryNoEvents = new PlatformRegistry({ propagateEvents: false });
      await registryNoEvents.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);

      const listener = vi.fn();
      registryNoEvents.on('stateChange', listener);

      // Emit event from adapter
      mockSmartThingsAdapter.emit('stateChange', {
        device: {} as UnifiedDevice,
        oldState: {} as DeviceState,
        newState: {} as DeviceState,
        timestamp: new Date(),
      });

      // Should not propagate
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support disabling graceful degradation', async () => {
      const registryFailFast = new PlatformRegistry({ gracefulDegradation: false });

      const failingAdapter = createMockAdapter(Platform.LUTRON, {
        shouldFailListDevices: true,
      });
      await registryFailFast.registerAdapter(Platform.SMARTTHINGS, mockSmartThingsAdapter);
      await registryFailFast.registerAdapter(Platform.LUTRON, failingAdapter);

      // Should throw on first failure
      await expect(registryFailFast.listAllDevices()).rejects.toThrow(
        'Failed to list devices'
      );
    });
  });
});
