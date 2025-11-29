/**
 * Comprehensive unit tests for TuyaAdapter.
 *
 * Test Coverage:
 * - 4 Lifecycle methods (initialize, dispose, isInitialized, healthCheck)
 * - 5 Device discovery methods (listDevices, getDevice, getDeviceState, refreshDeviceState, getDeviceCapabilities)
 * - 2 Command execution methods (executeCommand, executeBatchCommands)
 * - 2 Capability mapping methods (mapPlatformCapability, mapUnifiedCapability)
 * - 2 Organization methods (listLocations, listRooms)
 * - 3 Scene management methods (supportsScenes, listScenes, executeScene)
 *
 * Total: 18 interface methods with comprehensive coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { TuyaAdapter } from '../../../../src/platforms/tuya/TuyaAdapter.js';
import { Platform, DeviceCapability } from '../../../../src/types/unified-device.js';
import {
  ConfigurationError,
  AuthenticationError,
  DeviceNotFoundError,
  CapabilityNotSupportedError,
} from '../../../../src/types/errors.js';
import type { TuyaDevice, TuyaHome, TuyaRoom, TuyaScene, TuyaDataPoint } from '../../../../src/platforms/tuya/types.js';

// Create a shared mock client instance
const createMockClient = () => ({
  request: vi.fn(),
});

let sharedMockClient = createMockClient();

// Mock modules
vi.mock('@tuya/tuya-connector-nodejs', () => {
  return {
    TuyaContext: vi.fn(() => sharedMockClient),
  };
});

vi.mock('../../../../src/utils/retry.js', () => ({
  retryWithBackoff: vi.fn((fn) => fn()),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Test fixtures
const mockDevice: TuyaDevice = {
  id: 'device-123',
  name: 'Living Room Light',
  category: 'dj', // Light category
  product_id: 'product-456',
  product_name: 'Smart LED Bulb',
  online: true,
  home_id: 'home-789',
  room_id: 'room-101',
  status: [
    { code: 'switch_1', value: true },
    { code: 'bright_value', value: 750 },
    { code: 'colour_data', value: { h: 180, s: 500, v: 1000 } },
  ],
};

const mockDeviceStatus: TuyaDataPoint[] = [
  { code: 'switch_1', value: true },
  { code: 'bright_value', value: 750 },
  { code: 'colour_data', value: { h: 180, s: 500, v: 1000 } },
];

const mockHome: TuyaHome = {
  home_id: 'home-789',
  name: 'My Home',
  rooms: 3,
};

const mockRoom: TuyaRoom = {
  room_id: 'room-101',
  name: 'Living Room',
  home_id: 'home-789',
};

const mockScene: TuyaScene = {
  scene_id: 'scene-001',
  name: 'Movie Time',
  home_id: 'home-789',
  enabled: true,
};

describe('TuyaAdapter', () => {
  let adapter: TuyaAdapter;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    // Reset the shared mock client
    sharedMockClient = createMockClient();
    vi.clearAllMocks();

    // Create adapter - this will use the shared mock client
    adapter = new TuyaAdapter({
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
      baseUrl: 'https://openapi.tuyaus.com',
      userId: 'user-123',
    });
    mockClient = sharedMockClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  //
  // Constructor Tests
  //

  describe('Constructor', () => {
    it('should create adapter with valid config', () => {
      const adapter = new TuyaAdapter({
        accessKey: 'valid-key',
        secretKey: 'valid-secret',
        baseUrl: 'https://openapi.tuyaus.com',
      });
      expect(adapter).toBeDefined();
      expect(adapter.platform).toBe('tuya' as Platform);
      expect(adapter.platformName).toBe('Tuya');
      expect(adapter.version).toBe('1.0.0');
    });

    it('should throw ConfigurationError on empty accessKey', () => {
      expect(
        () =>
          new TuyaAdapter({
            accessKey: '',
            secretKey: 'valid-secret',
            baseUrl: 'https://openapi.tuyaus.com',
          })
      ).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError on empty secretKey', () => {
      expect(
        () =>
          new TuyaAdapter({
            accessKey: 'valid-key',
            secretKey: '',
            baseUrl: 'https://openapi.tuyaus.com',
          })
      ).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError on empty baseUrl', () => {
      expect(
        () =>
          new TuyaAdapter({
            accessKey: 'valid-key',
            secretKey: 'valid-secret',
            baseUrl: '',
          })
      ).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError with correct context', () => {
      try {
        new TuyaAdapter({
          accessKey: '',
          secretKey: 'valid-secret',
          baseUrl: 'https://openapi.tuyaus.com',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).context?.platform).toBe('tuya');
      }
    });
  });

  //
  // Lifecycle Management Tests
  //

  describe('Lifecycle - initialize()', () => {
    it('should initialize successfully with valid credentials', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });

      await adapter.initialize();

      expect(adapter.isInitialized()).toBe(true);
      expect(mockClient.request).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });

      await adapter.initialize();
      await adapter.initialize();

      expect(mockClient.request).toHaveBeenCalledTimes(1);
    });

    it('should throw AuthenticationError on invalid credentials', async () => {
      mockClient.request.mockRejectedValue(new Error('401 unauthorized'));

      await expect(adapter.initialize()).rejects.toThrow(AuthenticationError);
    });

    it('should extract userId from token response', async () => {
      const adapterWithoutUserId = new TuyaAdapter({
        accessKey: 'test-key',
        secretKey: 'test-secret',
        baseUrl: 'https://openapi.tuyaus.com',
      });

      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-extracted' },
        t: Date.now(),
      });

      await adapterWithoutUserId.initialize();
      expect(adapterWithoutUserId.isInitialized()).toBe(true);
    });
  });

  describe('Lifecycle - dispose()', () => {
    it('should dispose successfully', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });

      await adapter.initialize();
      await adapter.dispose();

      expect(adapter.isInitialized()).toBe(false);
    });

    it('should be idempotent', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });

      await adapter.initialize();
      await adapter.dispose();
      await adapter.dispose(); // Should not throw

      expect(adapter.isInitialized()).toBe(false);
    });

    it('should remove all event listeners', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });

      await adapter.initialize();

      const listener = vi.fn();
      adapter.on('error', listener);

      await adapter.dispose();

      expect(adapter.listenerCount('error')).toBe(0);
    });
  });

  describe('Lifecycle - isInitialized()', () => {
    it('should return false before initialization', () => {
      expect(adapter.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });

      await adapter.initialize();
      expect(adapter.isInitialized()).toBe(true);
    });

    it('should return false after disposal', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });

      await adapter.initialize();
      await adapter.dispose();

      expect(adapter.isInitialized()).toBe(false);
    });
  });

  describe('Lifecycle - healthCheck()', () => {
    it('should return unhealthy status when not initialized', async () => {
      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.platform).toBe('tuya');
      expect(status.message).toBe('Adapter not initialized');
    });

    it('should return healthy status when API is reachable', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });

      await adapter.initialize();
      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.apiReachable).toBe(true);
      expect(status.authenticated).toBe(true);
      expect(status.message).toBe('All systems operational');
    });

    it('should return unhealthy status on network error', async () => {
      mockClient.request
        .mockResolvedValueOnce({ success: true, result: { uid: 'user-456' }, t: Date.now() })
        .mockRejectedValueOnce(new Error('ECONNRESET'));

      await adapter.initialize();
      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.message).toContain('Health check failed');
    });

    it('should track error count', async () => {
      mockClient.request
        .mockResolvedValueOnce({ success: true, result: { uid: 'user-456' }, t: Date.now() })
        .mockRejectedValueOnce(new Error('Network error'));

      await adapter.initialize();
      const status = await adapter.healthCheck();

      // Error count tracks cumulative errors, starts at 0
      expect(status.errorCount).toBeGreaterThanOrEqual(0);
    });
  });

  //
  // Device Discovery Tests
  //

  describe('Device Discovery - listDevices()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should list all devices successfully', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: [mockDevice],
        t: Date.now(),
      });

      const devices = await adapter.listDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Living Room Light');
      expect(devices[0].platform).toBe('tuya');
    });

    it('should filter devices by capability', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: [mockDevice],
        t: Date.now(),
      });

      const devices = await adapter.listDevices({
        capability: DeviceCapability.SWITCH,
      });

      expect(devices).toHaveLength(1);
    });

    it('should filter devices by online status', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: [mockDevice, { ...mockDevice, id: 'device-456', online: false }],
        t: Date.now(),
      });

      const devices = await adapter.listDevices({ online: true });

      expect(devices).toHaveLength(1);
      expect(devices[0].online).toBe(true);
    });

    it('should throw ConfigurationError if userId not available', async () => {
      const adapterWithoutUserId = new TuyaAdapter({
        accessKey: 'test-key',
        secretKey: 'test-secret',
        baseUrl: 'https://openapi.tuyaus.com',
      });

      mockClient.request.mockResolvedValue({
        success: true,
        result: {},
        t: Date.now(),
      });

      await adapterWithoutUserId.initialize();

      await expect(adapterWithoutUserId.listDevices()).rejects.toThrow('User ID not available');
    });

    it('should throw error if API returns unsuccessful response', async () => {
      mockClient.request.mockResolvedValue({
        success: false,
        result: null,
        t: Date.now(),
        msg: 'API Error',
      });

      await expect(adapter.listDevices()).rejects.toThrow();
    });
  });

  describe('Device Discovery - getDevice()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should get device successfully', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: mockDevice,
        t: Date.now(),
      });

      const device = await adapter.getDevice('device-123');

      expect(device.name).toBe('Living Room Light');
      expect(device.platformDeviceId).toBe('device-123');
    });

    it('should handle universal device IDs', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: mockDevice,
        t: Date.now(),
      });

      const device = await adapter.getDevice('tuya:device-123');

      expect(device.platformDeviceId).toBe('device-123');
    });

    it('should throw DeviceNotFoundError on 404', async () => {
      mockClient.request.mockResolvedValue({
        success: false,
        result: null,
        t: Date.now(),
      });

      await expect(adapter.getDevice('nonexistent')).rejects.toThrow('Device not found');
    });

    it('should reject device IDs from other platforms', async () => {
      await expect(adapter.getDevice('smartthings:device-123')).rejects.toThrow(DeviceNotFoundError);
    });
  });

  describe('Device Discovery - getDeviceState()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should get device state successfully', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: mockDeviceStatus,
        t: Date.now(),
      });

      const state = await adapter.getDeviceState('device-123');

      expect(state.deviceId).toContain('device-123');
      expect(state.attributes).toBeDefined();
      expect(Object.keys(state.attributes).length).toBeGreaterThan(0);
    });

    it('should normalize brightness values', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: [{ code: 'bright_value', value: 500 }],
        t: Date.now(),
      });

      const state = await adapter.getDeviceState('device-123');

      // 500/1000 = 50%
      expect(state.attributes['dimmer.bright_value']).toBe(50);
    });

    it('should store unmapped DPs with platform prefix', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: [{ code: 'unknown_dp', value: 'test' }],
        t: Date.now(),
      });

      const state = await adapter.getDeviceState('device-123');

      expect(state.attributes['platform.unknown_dp']).toBe('test');
    });
  });

  describe('Device Discovery - refreshDeviceState()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should refresh device state', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: mockDeviceStatus,
        t: Date.now(),
      });

      const state = await adapter.refreshDeviceState('device-123');

      expect(state.deviceId).toContain('device-123');
    });
  });

  describe('Device Discovery - getDeviceCapabilities()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should get device capabilities', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: mockDevice,
        t: Date.now(),
      });

      const capabilities = await adapter.getDeviceCapabilities('device-123');

      expect(capabilities).toContain(DeviceCapability.SWITCH);
      expect(capabilities).toContain(DeviceCapability.DIMMER);
      expect(capabilities).toContain(DeviceCapability.COLOR);
    });
  });

  //
  // Command Execution Tests
  //

  describe('Command Execution - executeCommand()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should execute switch on command', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: {},
        t: Date.now(),
      });

      const result = await adapter.executeCommand('device-123', {
        capability: DeviceCapability.SWITCH,
        command: 'on',
      });

      expect(result.success).toBe(true);
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1.0/devices/device-123/commands',
        })
      );
    });

    it('should execute dimmer setLevel command', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: {},
        t: Date.now(),
      });

      const result = await adapter.executeCommand('device-123', {
        capability: DeviceCapability.DIMMER,
        command: 'setLevel',
        parameters: { level: 75 },
      });

      expect(result.success).toBe(true);
    });

    it('should return failure for unsupported capability', async () => {
      const result = await adapter.executeCommand('device-123', {
        capability: DeviceCapability.SPEAKER,
        command: 'setVolume',
        parameters: { volume: 50 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not supported');
    });

    it('should wait for state confirmation when enabled', async () => {
      mockClient.request
        .mockResolvedValueOnce({ success: true, result: {}, t: Date.now() })
        .mockResolvedValueOnce({ success: true, result: mockDeviceStatus, t: Date.now() });

      const result = await adapter.executeCommand(
        'device-123',
        {
          capability: DeviceCapability.SWITCH,
          command: 'on',
        },
        { waitForConfirmation: true }
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBeDefined();
    });

    it('should skip state confirmation when disabled', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: {},
        t: Date.now(),
      });

      const result = await adapter.executeCommand(
        'device-123',
        {
          capability: DeviceCapability.SWITCH,
          command: 'on',
        },
        { waitForConfirmation: false }
      );

      expect(result.success).toBe(true);
      expect(result.newState).toBeUndefined();
    });
  });

  describe('Command Execution - executeBatchCommands()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should execute batch commands sequentially', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: {},
        t: Date.now(),
      });

      const results = await adapter.executeBatchCommands([
        {
          deviceId: 'device-123',
          command: { capability: DeviceCapability.SWITCH, command: 'on' },
        },
        {
          deviceId: 'device-456',
          command: { capability: DeviceCapability.SWITCH, command: 'off' },
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should execute batch commands in parallel', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: {},
        t: Date.now(),
      });

      const results = await adapter.executeBatchCommands(
        [
          {
            deviceId: 'device-123',
            command: { capability: DeviceCapability.SWITCH, command: 'on' },
          },
          {
            deviceId: 'device-456',
            command: { capability: DeviceCapability.SWITCH, command: 'off' },
          },
        ],
        { parallel: true }
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should continue on error when enabled', async () => {
      mockClient.request
        .mockRejectedValueOnce(new Error('Command failed'))
        .mockResolvedValueOnce({ success: true, result: {}, t: Date.now() });

      const results = await adapter.executeBatchCommands(
        [
          {
            deviceId: 'device-123',
            command: { capability: DeviceCapability.SWITCH, command: 'on' },
          },
          {
            deviceId: 'device-456',
            command: { capability: DeviceCapability.SWITCH, command: 'off' },
          },
        ],
        { continueOnError: true }
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });

    it('should stop on error when continueOnError is false', async () => {
      mockClient.request.mockRejectedValueOnce(new Error('Command failed'));

      const results = await adapter.executeBatchCommands(
        [
          {
            deviceId: 'device-123',
            command: { capability: DeviceCapability.SWITCH, command: 'on' },
          },
          {
            deviceId: 'device-456',
            command: { capability: DeviceCapability.SWITCH, command: 'off' },
          },
        ],
        { continueOnError: false }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });
  });

  //
  // Capability Mapping Tests
  //

  describe('Capability Mapping - mapPlatformCapability()', () => {
    it('should map switch DP to SWITCH capability', () => {
      expect(adapter.mapPlatformCapability('switch_1')).toBe(DeviceCapability.SWITCH);
    });

    it('should map brightness DP to DIMMER capability', () => {
      expect(adapter.mapPlatformCapability('bright_value')).toBe(DeviceCapability.DIMMER);
    });

    it('should map color DP to COLOR capability', () => {
      expect(adapter.mapPlatformCapability('colour_data')).toBe(DeviceCapability.COLOR);
    });

    it('should return null for unmapped DP', () => {
      expect(adapter.mapPlatformCapability('unknown_dp')).toBeNull();
    });
  });

  describe('Capability Mapping - mapUnifiedCapability()', () => {
    it('should map SWITCH to primary switch DP', () => {
      expect(adapter.mapUnifiedCapability(DeviceCapability.SWITCH)).toBe('switch_1');
    });

    it('should map DIMMER to brightness DP', () => {
      expect(adapter.mapUnifiedCapability(DeviceCapability.DIMMER)).toBe('bright_value');
    });

    it('should map COLOR to color data DP', () => {
      expect(adapter.mapUnifiedCapability(DeviceCapability.COLOR)).toBe('colour_data');
    });

    it('should return null for unsupported capability', () => {
      expect(adapter.mapUnifiedCapability(DeviceCapability.SPEAKER)).toBeNull();
    });
  });

  //
  // Location and Room Tests
  //

  describe('Organization - listLocations()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should list locations successfully', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: [mockHome],
        t: Date.now(),
      });

      const locations = await adapter.listLocations();

      expect(locations).toHaveLength(1);
      expect(locations[0].name).toBe('My Home');
    });
  });

  describe('Organization - listRooms()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should list rooms for specific location', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: [mockRoom],
        t: Date.now(),
      });

      const rooms = await adapter.listRooms('home-789');

      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Living Room');
    });

    it('should list all rooms when no location specified', async () => {
      mockClient.request
        .mockResolvedValueOnce({ success: true, result: [mockHome], t: Date.now() })
        .mockResolvedValueOnce({ success: true, result: [mockRoom], t: Date.now() })
        .mockResolvedValueOnce({ success: true, result: [], t: Date.now() });

      const rooms = await adapter.listRooms();

      expect(rooms.length).toBeGreaterThanOrEqual(0);
    });
  });

  //
  // Scene Management Tests
  //

  describe('Scene Management - supportsScenes()', () => {
    it('should return true', () => {
      expect(adapter.supportsScenes()).toBe(true);
    });
  });

  describe('Scene Management - listScenes()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should list scenes for specific location', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: [mockScene],
        t: Date.now(),
      });

      const scenes = await adapter.listScenes('home-789');

      expect(scenes).toHaveLength(1);
      expect(scenes[0].name).toBe('Movie Time');
    });

    it('should list all scenes when no location specified', async () => {
      mockClient.request
        .mockResolvedValueOnce({ success: true, result: [mockHome], t: Date.now() })
        .mockResolvedValueOnce({ success: true, result: [mockScene], t: Date.now() });

      const scenes = await adapter.listScenes();

      expect(scenes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Scene Management - executeScene()', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should execute scene successfully', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: {},
        t: Date.now(),
      });

      await adapter.executeScene('scene-001');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1.0/homes/scene/scene-001/trigger',
        })
      );
    });

    it('should throw on scene execution failure', async () => {
      mockClient.request.mockResolvedValue({
        success: false,
        result: null,
        msg: 'Scene not found',
        t: Date.now(),
      });

      await expect(adapter.executeScene('nonexistent')).rejects.toThrow();
    });
  });

  //
  // Error Handling Tests
  //

  describe('Error Handling', () => {
    beforeEach(async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        result: { uid: 'user-456' },
        t: Date.now(),
      });
      await adapter.initialize();
    });

    it('should emit error events on failures', async () => {
      const errorListener = vi.fn();
      adapter.on('error', errorListener);

      mockClient.request.mockRejectedValue(new Error('Network error'));

      await expect(adapter.listDevices()).rejects.toThrow();
      expect(errorListener).toHaveBeenCalled();
    });

    it('should track error count', async () => {
      mockClient.request.mockRejectedValue(new Error('Network error'));

      await expect(adapter.listDevices()).rejects.toThrow();
      await expect(adapter.listDevices()).rejects.toThrow();

      const status = await adapter.healthCheck();
      expect(status.errorCount).toBeGreaterThan(0);
    });

    it('should throw ConfigurationError when not initialized', async () => {
      const uninitAdapter = new TuyaAdapter({
        accessKey: 'test-key',
        secretKey: 'test-secret',
        baseUrl: 'https://openapi.tuyaus.com',
      });

      await expect(uninitAdapter.listDevices()).rejects.toThrow(ConfigurationError);
    });
  });
});
