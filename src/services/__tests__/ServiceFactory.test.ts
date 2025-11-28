/**
 * ServiceFactory unit tests.
 *
 * Tests:
 * - Factory method creation of services
 * - Type safety of factory methods
 * - Batch service creation
 * - Mock support for testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceFactory } from '../ServiceFactory.js';
import type { SmartThingsService } from '../../smartthings/client.js';
import type { IDeviceService, ILocationService, ISceneService } from '../interfaces.js';

describe('ServiceFactory', () => {
  let mockSmartThingsService: SmartThingsService;

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
  });

  describe('Individual Service Creation', () => {
    it('should create DeviceService via factory', () => {
      const deviceService = ServiceFactory.createDeviceService(mockSmartThingsService);

      expect(deviceService).toBeDefined();
      expect(typeof deviceService.listDevices).toBe('function');
      expect(typeof deviceService.getDeviceStatus).toBe('function');
      expect(typeof deviceService.executeCommand).toBe('function');
    });

    it('should create LocationService via factory', () => {
      const locationService = ServiceFactory.createLocationService(mockSmartThingsService);

      expect(locationService).toBeDefined();
      expect(typeof locationService.listLocations).toBe('function');
      expect(typeof locationService.listRooms).toBe('function');
      expect(typeof locationService.findRoomByName).toBe('function');
    });

    it('should create SceneService via factory', () => {
      const sceneService = ServiceFactory.createSceneService(mockSmartThingsService);

      expect(sceneService).toBeDefined();
      expect(typeof sceneService.listScenes).toBe('function');
      expect(typeof sceneService.executeScene).toBe('function');
      expect(typeof sceneService.findSceneByName).toBe('function');
    });
  });

  describe('Service Functionality', () => {
    it('should create functional DeviceService', async () => {
      const deviceService = ServiceFactory.createDeviceService(mockSmartThingsService);
      await deviceService.listDevices();

      expect(mockSmartThingsService.listDevices).toHaveBeenCalledTimes(1);
    });

    it('should create functional LocationService', async () => {
      const locationService = ServiceFactory.createLocationService(mockSmartThingsService);
      await locationService.listLocations();

      expect(mockSmartThingsService.listLocations).toHaveBeenCalledTimes(1);
    });

    it('should create functional SceneService', async () => {
      const sceneService = ServiceFactory.createSceneService(mockSmartThingsService);
      await sceneService.listScenes();

      expect(mockSmartThingsService.listScenes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Batch Service Creation', () => {
    it('should create all services via createAllServices', () => {
      const services = ServiceFactory.createAllServices(mockSmartThingsService);

      expect(services.deviceService).toBeDefined();
      expect(services.locationService).toBeDefined();
      expect(services.sceneService).toBeDefined();
    });

    it('should create independent service instances', () => {
      const services1 = ServiceFactory.createAllServices(mockSmartThingsService);
      const services2 = ServiceFactory.createAllServices(mockSmartThingsService);

      expect(services1.deviceService).not.toBe(services2.deviceService);
      expect(services1.locationService).not.toBe(services2.locationService);
      expect(services1.sceneService).not.toBe(services2.sceneService);
    });

    it('should create all functional services', async () => {
      const services = ServiceFactory.createAllServices(mockSmartThingsService);

      await services.deviceService.listDevices();
      await services.locationService.listLocations();
      await services.sceneService.listScenes();

      expect(mockSmartThingsService.listDevices).toHaveBeenCalledTimes(1);
      expect(mockSmartThingsService.listLocations).toHaveBeenCalledTimes(1);
      expect(mockSmartThingsService.listScenes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mock Support', () => {
    it('should create services with partial mocks', () => {
      const mockDeviceService: IDeviceService = {
        listDevices: vi.fn().mockResolvedValue([]),
        getDeviceStatus: vi.fn().mockResolvedValue({ components: { main: {} } }),
        executeCommand: vi.fn().mockResolvedValue(undefined),
        getDevice: vi
          .fn()
          .mockResolvedValue({ deviceId: 'mock', name: 'Mock Device', capabilities: [] }),
        getDeviceCapabilities: vi.fn().mockResolvedValue([]),
        getDeviceEvents: vi
          .fn()
          .mockResolvedValue({ events: [], metadata: {}, summary: 'No events' }),
      };

      const services = ServiceFactory.createServicesWithMocks(mockSmartThingsService, {
        deviceService: mockDeviceService,
      });

      expect(services.deviceService).toBe(mockDeviceService);
      expect(services.locationService).toBeDefined();
      expect(services.sceneService).toBeDefined();
    });

    it('should create services with all mocks', () => {
      const mockDeviceService: IDeviceService = {
        listDevices: vi.fn().mockResolvedValue([]),
        getDeviceStatus: vi.fn().mockResolvedValue({ components: { main: {} } }),
        executeCommand: vi.fn().mockResolvedValue(undefined),
        getDevice: vi
          .fn()
          .mockResolvedValue({ deviceId: 'mock', name: 'Mock Device', capabilities: [] }),
        getDeviceCapabilities: vi.fn().mockResolvedValue([]),
        getDeviceEvents: vi
          .fn()
          .mockResolvedValue({ events: [], metadata: {}, summary: 'No events' }),
      };

      const mockLocationService: ILocationService = {
        listLocations: vi.fn().mockResolvedValue([]),
        listRooms: vi.fn().mockResolvedValue([]),
        findRoomByName: vi.fn().mockResolvedValue({
          roomId: 'mock',
          name: 'Mock Room',
          locationId: 'loc1',
          deviceCount: 0,
        }),
      };

      const mockSceneService: ISceneService = {
        listScenes: vi.fn().mockResolvedValue([]),
        executeScene: vi.fn().mockResolvedValue(undefined),
        findSceneByName: vi.fn().mockResolvedValue({ sceneId: 'mock', sceneName: 'Mock Scene' }),
      };

      const services = ServiceFactory.createServicesWithMocks(mockSmartThingsService, {
        deviceService: mockDeviceService,
        locationService: mockLocationService,
        sceneService: mockSceneService,
      });

      expect(services.deviceService).toBe(mockDeviceService);
      expect(services.locationService).toBe(mockLocationService);
      expect(services.sceneService).toBe(mockSceneService);
    });

    it('should use real services when no mocks provided', () => {
      const services = ServiceFactory.createServicesWithMocks(mockSmartThingsService, {});

      expect(services.deviceService).toBeDefined();
      expect(services.locationService).toBeDefined();
      expect(services.sceneService).toBeDefined();
    });
  });

  describe('Service Independence', () => {
    it('should create services that do not share state', async () => {
      const service1 = ServiceFactory.createDeviceService(mockSmartThingsService);
      const service2 = ServiceFactory.createDeviceService(mockSmartThingsService);

      await service1.listDevices();
      await service2.listDevices();

      // Both should call the underlying service independently
      expect(mockSmartThingsService.listDevices).toHaveBeenCalledTimes(2);
    });
  });
});
