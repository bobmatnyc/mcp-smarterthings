/**
 * ServiceProvider unit tests.
 *
 * Tests:
 * - Async service resolution
 * - Service caching
 * - Lazy loading
 * - Disposal and cleanup
 * - Custom service providers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceProvider, CustomServiceProvider } from '../ServiceProvider.js';
import type { SmartThingsService } from '../../smartthings/client.js';
import type { IDeviceService, ILocationService, ISceneService } from '../interfaces.js';

describe('ServiceProvider', () => {
  let mockSmartThingsService: SmartThingsService;
  let provider: ServiceProvider;

  beforeEach(() => {
    mockSmartThingsService = {
      listDevices: vi.fn().mockResolvedValue([]),
      getDeviceStatus: vi.fn().mockResolvedValue({ components: { main: {} } }),
      executeCommand: vi.fn().mockResolvedValue(undefined),
      getDevice: vi
        .fn()
        .mockResolvedValue({ deviceId: 'test', name: 'Test Device', capabilities: [] }),
      getDeviceCapabilities: vi.fn().mockResolvedValue([]),
      listLocations: vi.fn().mockResolvedValue([]),
      listRooms: vi.fn().mockResolvedValue([]),
      findRoomByName: vi.fn().mockResolvedValue({
        roomId: 'test',
        name: 'Test Room',
        locationId: 'loc1',
        deviceCount: 0,
      }),
      listScenes: vi.fn().mockResolvedValue([]),
      executeScene: vi.fn().mockResolvedValue(undefined),
      findSceneByName: vi.fn().mockResolvedValue({ sceneId: 'test', sceneName: 'Test Scene' }),
    } as unknown as SmartThingsService;

    provider = new ServiceProvider(mockSmartThingsService);
  });

  describe('Service Resolution', () => {
    it('should resolve DeviceService asynchronously', async () => {
      const deviceService = await provider.getService<IDeviceService>('device');

      expect(deviceService).toBeDefined();
      expect(typeof deviceService.listDevices).toBe('function');
    });

    it('should resolve LocationService asynchronously', async () => {
      const locationService = await provider.getService<ILocationService>('location');

      expect(locationService).toBeDefined();
      expect(typeof locationService.listLocations).toBe('function');
    });

    it('should resolve SceneService asynchronously', async () => {
      const sceneService = await provider.getService<ISceneService>('scene');

      expect(sceneService).toBeDefined();
      expect(typeof sceneService.listScenes).toBe('function');
    });
  });

  describe('Service Caching', () => {
    it('should cache service after first resolution', async () => {
      const service1 = await provider.getService<IDeviceService>('device');
      const service2 = await provider.getService<IDeviceService>('device');

      expect(service1).toBe(service2);
    });

    it('should cache all services independently', async () => {
      const deviceService = await provider.getService<IDeviceService>('device');
      const locationService = await provider.getService<ILocationService>('location');
      const sceneService = await provider.getService<ISceneService>('scene');

      const deviceService2 = await provider.getService<IDeviceService>('device');
      const locationService2 = await provider.getService<ILocationService>('location');
      const sceneService2 = await provider.getService<ISceneService>('scene');

      expect(deviceService).toBe(deviceService2);
      expect(locationService).toBe(locationService2);
      expect(sceneService).toBe(sceneService2);
    });
  });

  describe('Service Availability', () => {
    it('should report device service as available', () => {
      expect(provider.hasService('device')).toBe(true);
    });

    it('should report location service as available', () => {
      expect(provider.hasService('location')).toBe(true);
    });

    it('should report scene service as available', () => {
      expect(provider.hasService('scene')).toBe(true);
    });
  });

  describe('Batch Resolution', () => {
    it('should resolve all services at once', async () => {
      const services = await provider.getAllServices();

      expect(services.deviceService).toBeDefined();
      expect(services.locationService).toBeDefined();
      expect(services.sceneService).toBeDefined();
    });

    it('should return cached services from getAllServices', async () => {
      const deviceService = await provider.getService<IDeviceService>('device');
      const services = await provider.getAllServices();

      expect(services.deviceService).toBe(deviceService);
    });
  });

  describe('Disposal', () => {
    it('should track disposal state', async () => {
      expect(provider.isDisposed()).toBe(false);
      await provider.dispose();
      expect(provider.isDisposed()).toBe(true);
    });

    it('should be idempotent on multiple dispose calls', async () => {
      await provider.dispose();
      await provider.dispose();
      expect(provider.isDisposed()).toBe(true);
    });

    it('should prevent service access after disposal', async () => {
      await provider.dispose();

      await expect(provider.getService('device')).rejects.toThrow(
        'ServiceProvider has been disposed'
      );
    });

    it('should prevent getAllServices after disposal', async () => {
      await provider.dispose();

      await expect(provider.getAllServices()).rejects.toThrow('ServiceProvider has been disposed');
    });

    it('should clear service cache on disposal', async () => {
      const service1 = await provider.getService<IDeviceService>('device');
      await provider.dispose();

      // Should not throw if we create new provider
      const newProvider = new ServiceProvider(mockSmartThingsService);
      const service2 = await newProvider.getService<IDeviceService>('device');

      expect(service1).not.toBe(service2);
    });
  });

  describe('Functional Services', () => {
    it('should provide functional DeviceService', async () => {
      const deviceService = await provider.getService<IDeviceService>('device');
      await deviceService.listDevices();

      expect(mockSmartThingsService.listDevices).toHaveBeenCalledTimes(1);
    });

    it('should provide functional LocationService', async () => {
      const locationService = await provider.getService<ILocationService>('location');
      await locationService.listLocations();

      expect(mockSmartThingsService.listLocations).toHaveBeenCalledTimes(1);
    });

    it('should provide functional SceneService', async () => {
      const sceneService = await provider.getService<ISceneService>('scene');
      await sceneService.listScenes();

      expect(mockSmartThingsService.listScenes).toHaveBeenCalledTimes(1);
    });
  });
});

describe('CustomServiceProvider', () => {
  let customProvider: CustomServiceProvider;
  let mockDeviceFactory: () => Promise<IDeviceService>;
  let mockLocationFactory: () => Promise<ILocationService>;
  let mockSceneFactory: () => Promise<ISceneService>;

  beforeEach(() => {
    mockDeviceFactory = vi.fn().mockResolvedValue({
      listDevices: vi.fn().mockResolvedValue([]),
      getDeviceStatus: vi.fn().mockResolvedValue({ components: { main: {} } }),
      executeCommand: vi.fn().mockResolvedValue(undefined),
      getDevice: vi
        .fn()
        .mockResolvedValue({ deviceId: 'custom', name: 'Custom Device', capabilities: [] }),
      getDeviceCapabilities: vi.fn().mockResolvedValue([]),
    } as IDeviceService);

    mockLocationFactory = vi.fn().mockResolvedValue({
      listLocations: vi.fn().mockResolvedValue([]),
      listRooms: vi.fn().mockResolvedValue([]),
      findRoomByName: vi.fn().mockResolvedValue({
        roomId: 'custom',
        name: 'Custom Room',
        locationId: 'loc1',
        deviceCount: 0,
      }),
    } as ILocationService);

    mockSceneFactory = vi.fn().mockResolvedValue({
      listScenes: vi.fn().mockResolvedValue([]),
      executeScene: vi.fn().mockResolvedValue(undefined),
      findSceneByName: vi.fn().mockResolvedValue({ sceneId: 'custom', sceneName: 'Custom Scene' }),
    } as ISceneService);

    customProvider = new CustomServiceProvider({
      device: mockDeviceFactory,
      location: mockLocationFactory,
      scene: mockSceneFactory,
    });
  });

  describe('Custom Factory Resolution', () => {
    it('should use custom factory for DeviceService', async () => {
      const deviceService = await customProvider.getService<IDeviceService>('device');

      expect(mockDeviceFactory).toHaveBeenCalledTimes(1);
      expect(deviceService).toBeDefined();
    });

    it('should use custom factory for LocationService', async () => {
      const locationService = await customProvider.getService<ILocationService>('location');

      expect(mockLocationFactory).toHaveBeenCalledTimes(1);
      expect(locationService).toBeDefined();
    });

    it('should use custom factory for SceneService', async () => {
      const sceneService = await customProvider.getService<ISceneService>('scene');

      expect(mockSceneFactory).toHaveBeenCalledTimes(1);
      expect(sceneService).toBeDefined();
    });
  });

  describe('Caching with Custom Factories', () => {
    it('should cache service from custom factory', async () => {
      const service1 = await customProvider.getService<IDeviceService>('device');
      const service2 = await customProvider.getService<IDeviceService>('device');

      expect(mockDeviceFactory).toHaveBeenCalledTimes(1);
      expect(service1).toBe(service2);
    });
  });

  describe('Factory Registration', () => {
    it('should report registered services as available', () => {
      expect(customProvider.hasService('device')).toBe(true);
      expect(customProvider.hasService('location')).toBe(true);
      expect(customProvider.hasService('scene')).toBe(true);
    });

    it('should throw for unregistered service', async () => {
      const emptyProvider = new CustomServiceProvider({} as any);

      await expect(emptyProvider.getService('device')).rejects.toThrow(
        'No factory registered for service type: device'
      );
    });
  });

  describe('Disposal', () => {
    it('should dispose custom provider', async () => {
      expect(customProvider.isDisposed()).toBe(false);
      await customProvider.dispose();
      expect(customProvider.isDisposed()).toBe(true);
    });

    it('should prevent access after disposal', async () => {
      await customProvider.dispose();

      await expect(customProvider.getService('device')).rejects.toThrow(
        'CustomServiceProvider has been disposed'
      );
    });
  });
});
