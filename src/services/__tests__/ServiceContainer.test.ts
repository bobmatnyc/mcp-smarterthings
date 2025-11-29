/**
 * ServiceContainer unit tests.
 *
 * Tests:
 * - Service container creation
 * - Service singleton behavior
 * - Service initialization
 * - Service disposal
 * - Lifecycle hooks (init, dispose, healthCheck)
 * - Service registration and lookup
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer } from '../ServiceContainer.js';
import type { SmartThingsService } from '../../smartthings/client.js';
import type { SmartThingsAdapter } from '../../platforms/smartthings/SmartThingsAdapter.js';

describe('ServiceContainer', () => {
  let mockSmartThingsService: SmartThingsService;
  let mockSmartThingsAdapter: SmartThingsAdapter;
  let container: ServiceContainer;

  beforeEach(() => {
    // Create mock SmartThingsService
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

    // Create mock SmartThingsAdapter for AutomationService
    mockSmartThingsAdapter = {
      platform: 'smartthings',
      platformName: 'SmartThings',
      version: '1.0.0',
      discoverDevices: vi.fn().mockResolvedValue([]),
      getDeviceState: vi.fn().mockResolvedValue({ capabilities: {} }),
      executeCommand: vi.fn().mockResolvedValue({ success: true }),
      listRules: vi.fn().mockResolvedValue([]),
      getRuleDetails: vi.fn().mockResolvedValue({}),
      createRule: vi.fn().mockResolvedValue({ ruleId: 'test-rule' }),
      updateRule: vi.fn().mockResolvedValue({}),
      deleteRule: vi.fn().mockResolvedValue(undefined),
    } as unknown as SmartThingsAdapter;

    container = new ServiceContainer(mockSmartThingsService, mockSmartThingsAdapter);
  });

  describe('Service Creation', () => {
    it('should create DeviceService instance', () => {
      const deviceService = container.getDeviceService();
      expect(deviceService).toBeDefined();
      expect(typeof deviceService.listDevices).toBe('function');
    });

    it('should create LocationService instance', () => {
      const locationService = container.getLocationService();
      expect(locationService).toBeDefined();
      expect(typeof locationService.listLocations).toBe('function');
    });

    it('should create SceneService instance', () => {
      const sceneService = container.getSceneService();
      expect(sceneService).toBeDefined();
      expect(typeof sceneService.listScenes).toBe('function');
    });

    it('should return all services via getAllServices', () => {
      const services = container.getAllServices();
      expect(services.deviceService).toBeDefined();
      expect(services.locationService).toBeDefined();
      expect(services.sceneService).toBeDefined();
    });
  });

  describe('Singleton Behavior', () => {
    it('should return same DeviceService instance on multiple calls', () => {
      const service1 = container.getDeviceService();
      const service2 = container.getDeviceService();
      expect(service1).toBe(service2);
    });

    it('should return same LocationService instance on multiple calls', () => {
      const service1 = container.getLocationService();
      const service2 = container.getLocationService();
      expect(service1).toBe(service2);
    });

    it('should return same SceneService instance on multiple calls', () => {
      const service1 = container.getSceneService();
      const service2 = container.getSceneService();
      expect(service1).toBe(service2);
    });
  });

  describe('Lifecycle Management', () => {
    it('should initialize all services', async () => {
      await container.initialize();

      // Verify services were created
      const services = container.getAllServices();
      expect(services.deviceService).toBeDefined();
      expect(services.locationService).toBeDefined();
      expect(services.sceneService).toBeDefined();
    });

    it('should dispose all services', async () => {
      // Create services first
      container.getDeviceService();
      container.getLocationService();
      container.getSceneService();

      // Dispose
      await container.dispose();

      // After disposal, getting services should create new instances
      const service1 = container.getDeviceService();
      const service2 = container.getDeviceService();
      expect(service1).toBe(service2); // Still singleton
    });
  });

  describe('Service Delegation', () => {
    it('should delegate listDevices to SmartThingsService', async () => {
      const deviceService = container.getDeviceService();
      await deviceService.listDevices();

      expect(mockSmartThingsService.listDevices).toHaveBeenCalledTimes(1);
    });

    it('should delegate listLocations to SmartThingsService', async () => {
      const locationService = container.getLocationService();
      await locationService.listLocations();

      expect(mockSmartThingsService.listLocations).toHaveBeenCalledTimes(1);
    });

    it('should delegate listScenes to SmartThingsService', async () => {
      const sceneService = container.getSceneService();
      await sceneService.listScenes();

      expect(mockSmartThingsService.listScenes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Enhanced Lifecycle Management', () => {
    it('should track initialization state', async () => {
      expect(container.isInitialized()).toBe(false);
      await container.initialize();
      expect(container.isInitialized()).toBe(true);
    });

    it('should be idempotent on multiple initialize calls', async () => {
      await container.initialize();
      await container.initialize();
      expect(container.isInitialized()).toBe(true);
    });

    it('should reset initialization state on dispose', async () => {
      await container.initialize();
      expect(container.isInitialized()).toBe(true);
      await container.dispose();
      expect(container.isInitialized()).toBe(false);
    });

    it('should perform health check on all services', async () => {
      const health = await container.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.services.device.healthy).toBe(true);
      expect(health.services.location.healthy).toBe(true);
      expect(health.services.scene.healthy).toBe(true);
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('should report unhealthy if service fails', async () => {
      mockSmartThingsService.listDevices = vi.fn().mockRejectedValue(new Error('API Error'));

      const health = await container.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.services.device.healthy).toBe(false);
      expect(health.services.device.message).toBe('API Error');
      expect(health.services.location.healthy).toBe(true);
      expect(health.services.scene.healthy).toBe(true);
    });
  });

  describe('Service Lookup', () => {
    it('should get service by type identifier', () => {
      const deviceService = container.getService('device');
      const locationService = container.getService('location');
      const sceneService = container.getService('scene');

      expect(deviceService).toBeDefined();
      expect(locationService).toBeDefined();
      expect(sceneService).toBeDefined();
    });

    it('should throw error for invalid service type', () => {
      expect(() => container.getService('invalid' as any)).toThrow('Unknown service type: invalid');
    });

    it('should return same instance for type-based lookup', () => {
      const service1 = container.getService('device');
      const service2 = container.getService('device');
      expect(service1).toBe(service2);
    });
  });

  describe('Factory Method', () => {
    it('should create new instance via static factory', () => {
      const newContainer = ServiceContainer.createInstance(mockSmartThingsService);
      expect(newContainer).toBeInstanceOf(ServiceContainer);
      expect(newContainer).not.toBe(container);
    });

    it('should create independent instances', () => {
      const container1 = ServiceContainer.createInstance(mockSmartThingsService);
      const container2 = ServiceContainer.createInstance(mockSmartThingsService);

      const service1 = container1.getDeviceService();
      const service2 = container2.getDeviceService();

      expect(service1).not.toBe(service2);
    });
  });
});
