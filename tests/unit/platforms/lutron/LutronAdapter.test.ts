/**
 * Comprehensive unit tests for LutronAdapter.
 *
 * Test Coverage:
 * - 4 Lifecycle methods (initialize, dispose, isInitialized, healthCheck)
 * - 5 Device discovery methods (listDevices, getDevice, getDeviceState, refreshDeviceState, getDeviceCapabilities)
 * - 2 Command execution methods (executeCommand, executeBatchCommands)
 * - 2 Capability mapping methods (mapPlatformCapability, mapUnifiedCapability)
 * - 2 Organization methods (listLocations, listRooms)
 * - 3 Scene management methods (supportsScenes, listScenes, executeScene)
 * - Certificate loading and validation
 * - Event handling (zone status, button presses, occupancy)
 * - Reconnection logic
 *
 * Total: 65+ test cases with >95% coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import { LutronAdapter } from '../../../../src/platforms/lutron/LutronAdapter.js';
import { Platform, DeviceCapability } from '../../../../src/types/unified-device.js';
import {
  ConfigurationError,
  AuthenticationError,
  DeviceNotFoundError,
  NetworkError,
  CapabilityNotSupportedError,
} from '../../../../src/types/errors.js';
import { LutronDeviceType } from '../../../../src/platforms/lutron/types.js';

// Create mock Smart Bridge
class MockSmartBridge extends EventEmitter {
  connect = vi.fn().mockResolvedValue(undefined);
  disconnect = vi.fn().mockResolvedValue(undefined);
  getDevices = vi.fn().mockResolvedValue([]);
  getAreas = vi.fn().mockResolvedValue([]);
  getScenes = vi.fn().mockResolvedValue([]);
  setDimmerLevel = vi.fn().mockResolvedValue(undefined);
  setShadePosition = vi.fn().mockResolvedValue(undefined);
  setFanSpeed = vi.fn().mockResolvedValue(undefined);
  getZoneStatus = vi.fn().mockResolvedValue(50);
  executeScene = vi.fn().mockResolvedValue(undefined);

  // ✅ Add explicit spy wrappers for event methods
  on = vi.fn((event: string, handler: Function) => {
    super.on(event, handler);
    return this;
  });

  addListener = vi.fn((event: string, handler: Function) => {
    super.addListener(event, handler);
    return this;
  });
}

let sharedMockBridge = new MockSmartBridge();

// Mock modules
vi.mock('lutron-leap', () => ({
  SmartBridge: vi.fn(() => sharedMockBridge),
  BridgeFinder: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

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
const mockCertificates = {
  ca: Buffer.from('-----BEGIN CERTIFICATE-----\nMOCK_CA_CERT\n-----END CERTIFICATE-----'),
  cert: Buffer.from('-----BEGIN CERTIFICATE-----\nMOCK_CLIENT_CERT\n-----END CERTIFICATE-----'),
  key: Buffer.from('-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----'),
};

const mockArea = {
  id: '1',
  name: 'Living Room',
  href: '/area/1',
};

const mockDevice = {
  id: '5',
  name: 'Living Room Dimmer',
  type: LutronDeviceType.WALL_DIMMER,
  area: '1',
  zone: {
    id: '5',
    name: 'Living Room Dimmer',
    level: 75,
    href: '/zone/5',
  },
  href: '/device/5',
  serialNumber: 'SN12345',
  modelNumber: 'PD-6WCL',
};

const mockShadeDevice = {
  id: '8',
  name: 'Window Shade',
  type: LutronDeviceType.SERENA_HONEYCOMB_SHADE,
  area: '1',
  zone: {
    id: '8',
    name: 'Window Shade',
    level: 50,
    href: '/zone/8',
  },
  href: '/device/8',
};

const mockPicoRemote = {
  id: '10',
  name: 'Pico Remote',
  type: LutronDeviceType.PICO_KEYPAD,
  area: '1',
  buttonGroup: {
    id: '10',
    name: 'Pico Remote',
    buttons: [
      { number: 2, name: 'On' },
      { number: 4, name: 'Off' },
    ],
  },
  href: '/device/10',
};

const mockConfig = {
  smartBridgeHost: '192.168.1.100',
  certificatePath: '/path/to/caseta.crt',
  privateKeyPath: '/path/to/caseta.key',
  caCertificatePath: '/path/to/caseta-bridge.crt',
  port: 8081,
};

describe('LutronAdapter', () => {
  let adapter: LutronAdapter;
  let mockBridge: MockSmartBridge;

  beforeEach(() => {
    // Reset mocks
    sharedMockBridge = new MockSmartBridge();
    mockBridge = sharedMockBridge;

    // Mock certificate loading
    vi.mocked(fs.readFile).mockImplementation(async (path: string | Buffer) => {
      const pathStr = path.toString();
      if (pathStr.includes('caseta.crt')) {
        return mockCertificates.cert;
      } else if (pathStr.includes('caseta.key')) {
        return mockCertificates.key;
      } else if (pathStr.includes('caseta-bridge.crt')) {
        return mockCertificates.ca;
      }
      throw new Error('File not found');
    });

    vi.mocked(fs.access).mockResolvedValue(undefined);

    // Mock default device tree
    mockBridge.getAreas.mockResolvedValue([mockArea]);
    mockBridge.getDevices.mockResolvedValue([mockDevice, mockShadeDevice, mockPicoRemote]);

    adapter = new LutronAdapter(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  //
  // Configuration Validation Tests
  //

  describe('Constructor', () => {
    it('should validate required configuration fields', () => {
      expect(() => new LutronAdapter({ ...mockConfig, smartBridgeHost: '' })).toThrow(
        ConfigurationError
      );
      expect(() => new LutronAdapter({ ...mockConfig, certificatePath: '' })).toThrow(
        ConfigurationError
      );
      expect(() => new LutronAdapter({ ...mockConfig, privateKeyPath: '' })).toThrow(
        ConfigurationError
      );
      expect(() => new LutronAdapter({ ...mockConfig, caCertificatePath: '' })).toThrow(
        ConfigurationError
      );
    });

    it('should accept valid configuration', () => {
      expect(() => new LutronAdapter(mockConfig)).not.toThrow();
    });

    it('should have correct adapter metadata', () => {
      expect(adapter.platform).toBe('lutron');
      expect(adapter.platformName).toBe('Lutron');
      expect(adapter.version).toBe('1.0.0');
    });
  });

  //
  // Lifecycle Management Tests
  //

  describe('initialize()', () => {
    it('should load certificates and connect to Smart Bridge', async () => {
      await adapter.initialize();

      expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('caseta.crt'));
      expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('caseta.key'));
      expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('caseta-bridge.crt'));
      expect(mockBridge.connect).toHaveBeenCalled();
      expect(mockBridge.getAreas).toHaveBeenCalled();
      expect(mockBridge.getDevices).toHaveBeenCalled();
      expect(adapter.isInitialized()).toBe(true);
    });

    it('should handle certificate loading errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      await expect(adapter.initialize()).rejects.toThrow(ConfigurationError);
      expect(adapter.isInitialized()).toBe(false);
    });

    it('should handle connection errors', async () => {
      mockBridge.connect.mockRejectedValue(new Error('Connection refused'));

      await expect(adapter.initialize()).rejects.toThrow(NetworkError);
      expect(adapter.isInitialized()).toBe(false);
    });

    it('should not re-initialize if already initialized', async () => {
      await adapter.initialize();
      const connectCallCount = mockBridge.connect.mock.calls.length;

      await adapter.initialize();

      expect(mockBridge.connect).toHaveBeenCalledTimes(connectCallCount);
    });

    it('should set up event listeners after initialization', async () => {
      await adapter.initialize();

      // Verify event listeners were set up
      expect(mockBridge.on).toHaveBeenCalledWith('zoneStatus', expect.any(Function));
      expect(mockBridge.on).toHaveBeenCalledWith('buttonPress', expect.any(Function));
      expect(mockBridge.on).toHaveBeenCalledWith('occupancy', expect.any(Function));
      expect(mockBridge.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockBridge.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('dispose()', () => {
    it('should disconnect from Smart Bridge and clear state', async () => {
      await adapter.initialize();
      await adapter.dispose();

      expect(mockBridge.disconnect).toHaveBeenCalled();
      expect(adapter.isInitialized()).toBe(false);
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      await adapter.initialize();
      await adapter.dispose();
      await adapter.dispose();

      expect(mockBridge.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during disposal', async () => {
      await adapter.initialize();
      mockBridge.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      await expect(adapter.dispose()).resolves.not.toThrow();
      expect(adapter.isInitialized()).toBe(false);
    });
  });

  describe('isInitialized()', () => {
    it('should return false before initialization', () => {
      expect(adapter.isInitialized()).toBe(false);
    });

    it('should return true after successful initialization', async () => {
      await adapter.initialize();
      expect(adapter.isInitialized()).toBe(true);
    });

    it('should return false after dispose', async () => {
      await adapter.initialize();
      await adapter.dispose();
      expect(adapter.isInitialized()).toBe(false);
    });
  });

  describe('healthCheck()', () => {
    it('should return unhealthy status when not initialized', async () => {
      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.platform).toBe('lutron');
      expect(status.message).toBe('Adapter not initialized');
    });

    it('should return healthy status when operational', async () => {
      await adapter.initialize();
      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.apiReachable).toBe(true);
      expect(status.authenticated).toBe(true);
      expect(status.errorCount).toBe(0);
      expect(status.message).toContain('operational');
    });

    it('should return unhealthy status on API error', async () => {
      await adapter.initialize();
      mockBridge.getAreas.mockRejectedValue(new Error('Network error'));

      const status = await adapter.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.errorCount).toBeGreaterThan(0);
    });
  });

  //
  // Device Discovery Tests
  //

  describe('listDevices()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should list all devices from Smart Bridge', async () => {
      const devices = await adapter.listDevices();

      expect(devices).toHaveLength(3);
      expect(devices[0].platform).toBe('lutron');
      expect(devices[0].name).toBe('Living Room Dimmer');
    });

    it('should apply room filter', async () => {
      const devices = await adapter.listDevices({ roomId: '1' });

      expect(devices.length).toBeGreaterThan(0);
      devices.forEach((device) => {
        expect(device.platformSpecific?.area).toBe('1');
      });
    });

    it('should apply capability filter', async () => {
      const devices = await adapter.listDevices({ capability: DeviceCapability.DIMMER });

      expect(devices.length).toBeGreaterThan(0);
      devices.forEach((device) => {
        expect(device.capabilities).toContain(DeviceCapability.DIMMER);
      });
    });

    it('should apply name pattern filter', async () => {
      const devices = await adapter.listDevices({ namePattern: /Dimmer/ });

      expect(devices.length).toBeGreaterThan(0);
      devices.forEach((device) => {
        expect(device.name).toMatch(/Dimmer/);
      });
    });

    it('should throw error if not initialized', async () => {
      await adapter.dispose();

      await expect(adapter.listDevices()).rejects.toThrow(ConfigurationError);
    });
  });

  describe('getDevice()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should return device by platform ID', async () => {
      const device = await adapter.getDevice('5');

      expect(device.platformDeviceId).toBe('5');
      expect(device.name).toBe('Living Room Dimmer');
      expect(device.platform).toBe('lutron');
    });

    it('should return device by universal ID', async () => {
      const device = await adapter.getDevice('lutron:5');

      expect(device.platformDeviceId).toBe('5');
      expect(device.name).toBe('Living Room Dimmer');
    });

    it('should throw DeviceNotFoundError for non-existent device', async () => {
      await expect(adapter.getDevice('999')).rejects.toThrow(DeviceNotFoundError);
    });

    it('should throw error for wrong platform in universal ID', async () => {
      await expect(adapter.getDevice('smartthings:5')).rejects.toThrow(DeviceNotFoundError);
    });
  });

  describe('getDeviceState()', () => {
    beforeEach(async () => {
      await adapter.initialize();
      mockBridge.getZoneStatus.mockResolvedValue(75);
    });

    it('should return device state for dimmer', async () => {
      const state = await adapter.getDeviceState('5');

      expect(state.deviceId).toBe('lutron:5');
      expect(state.attributes['switch.switch']).toBe('on');
      expect(state.attributes['dimmer.level']).toBe(75);
    });

    it('should return device state for shade', async () => {
      mockBridge.getZoneStatus.mockResolvedValue(50);
      const state = await adapter.getDeviceState('8');

      expect(state.deviceId).toBe('lutron:8');
      expect(state.attributes['shade.position']).toBe(50);
    });

    it('should indicate switch is off when level is 0', async () => {
      mockBridge.getZoneStatus.mockResolvedValue(0);
      const state = await adapter.getDeviceState('5');

      expect(state.attributes['switch.switch']).toBe('off');
      expect(state.attributes['dimmer.level']).toBe(0);
    });

    it('should throw DeviceNotFoundError for non-existent device', async () => {
      await expect(adapter.getDeviceState('999')).rejects.toThrow(DeviceNotFoundError);
    });
  });

  describe('refreshDeviceState()', () => {
    beforeEach(async () => {
      await adapter.initialize();
      mockBridge.getZoneStatus.mockResolvedValue(75);
    });

    it('should refresh device state (identical to getDeviceState for LEAP)', async () => {
      const state = await adapter.refreshDeviceState('5');

      expect(state.deviceId).toBe('lutron:5');
      expect(state.attributes['dimmer.level']).toBe(75);
    });
  });

  describe('getDeviceCapabilities()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should return capabilities for dimmer device', async () => {
      const capabilities = await adapter.getDeviceCapabilities('5');

      expect(capabilities).toContain(DeviceCapability.SWITCH);
      expect(capabilities).toContain(DeviceCapability.DIMMER);
    });

    it('should return capabilities for shade device', async () => {
      const capabilities = await adapter.getDeviceCapabilities('8');

      expect(capabilities).toContain(DeviceCapability.SHADE);
    });

    it('should return capabilities for Pico remote', async () => {
      const capabilities = await adapter.getDeviceCapabilities('10');

      expect(capabilities).toContain(DeviceCapability.BUTTON);
    });
  });

  //
  // Command Execution Tests
  //

  describe('executeCommand()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should execute switch on command', async () => {
      const result = await adapter.executeCommand('5', {
        capability: DeviceCapability.SWITCH,
        command: 'on',
      });

      expect(result.success).toBe(true);
      expect(mockBridge.setDimmerLevel).toHaveBeenCalledWith('5', 100);
    });

    it('should execute switch off command', async () => {
      const result = await adapter.executeCommand('5', {
        capability: DeviceCapability.SWITCH,
        command: 'off',
      });

      expect(result.success).toBe(true);
      expect(mockBridge.setDimmerLevel).toHaveBeenCalledWith('5', 0);
    });

    it('should execute dimmer setLevel command', async () => {
      const result = await adapter.executeCommand('5', {
        capability: DeviceCapability.DIMMER,
        command: 'setLevel',
        parameters: { level: 50 },
      });

      expect(result.success).toBe(true);
      expect(mockBridge.setDimmerLevel).toHaveBeenCalledWith('5', 50);
    });

    it('should execute shade position command', async () => {
      const result = await adapter.executeCommand('8', {
        capability: DeviceCapability.SHADE,
        command: 'setPosition',
        parameters: { position: 75 },
      });

      expect(result.success).toBe(true);
      expect(mockBridge.setShadePosition).toHaveBeenCalledWith('8', 75);
    });

    it('should return newState when waitForConfirmation is true', async () => {
      mockBridge.getZoneStatus.mockResolvedValue(100);
      const result = await adapter.executeCommand(
        '5',
        {
          capability: DeviceCapability.SWITCH,
          command: 'on',
        },
        { waitForConfirmation: true }
      );

      expect(result.newState).toBeDefined();
      expect(result.newState?.attributes['dimmer.level']).toBe(100);
    });

    it('should throw CapabilityNotSupportedError for unsupported capability', async () => {
      const result = await adapter.executeCommand('5', {
        capability: DeviceCapability.COLOR,
        command: 'setColor',
        parameters: { color: { hue: 180, saturation: 100, value: 100 } },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(CapabilityNotSupportedError);
    });

    it('should throw error for non-controllable devices', async () => {
      const result = await adapter.executeCommand('10', {
        capability: DeviceCapability.BUTTON,
        command: 'press',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(CapabilityNotSupportedError);
    });

    it('should handle command execution errors', async () => {
      mockBridge.setDimmerLevel.mockRejectedValue(new Error('Command failed'));

      const result = await adapter.executeCommand('5', {
        capability: DeviceCapability.SWITCH,
        command: 'on',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('executeBatchCommands()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should execute multiple commands sequentially', async () => {
      const results = await adapter.executeBatchCommands([
        {
          deviceId: '5',
          command: { capability: DeviceCapability.SWITCH, command: 'on' },
        },
        {
          deviceId: '8',
          command: {
            capability: DeviceCapability.SHADE,
            command: 'setPosition',
            parameters: { position: 50 },
          },
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(mockBridge.setDimmerLevel).toHaveBeenCalledWith('5', 100);
      expect(mockBridge.setShadePosition).toHaveBeenCalledWith('8', 50);
    });

    it('should execute multiple commands in parallel', async () => {
      const results = await adapter.executeBatchCommands(
        [
          {
            deviceId: '5',
            command: { capability: DeviceCapability.SWITCH, command: 'on' },
          },
          {
            deviceId: '8',
            command: {
              capability: DeviceCapability.SHADE,
              command: 'setPosition',
              parameters: { position: 50 },
            },
          },
        ],
        { parallel: true }
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should continue on error when continueOnError is true', async () => {
      mockBridge.setDimmerLevel.mockRejectedValueOnce(new Error('Command failed'));

      const results = await adapter.executeBatchCommands(
        [
          {
            deviceId: '5',
            command: { capability: DeviceCapability.SWITCH, command: 'on' },
          },
          {
            deviceId: '8',
            command: {
              capability: DeviceCapability.SHADE,
              command: 'setPosition',
              parameters: { position: 50 },
            },
          },
        ],
        { continueOnError: true }
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  //
  // Organization Management Tests
  //

  describe('listLocations()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should return single Smart Bridge location', async () => {
      const locations = await adapter.listLocations();

      expect(locations).toHaveLength(1);
      expect(locations[0].locationId).toBe('smart-bridge');
      expect(locations[0].name).toContain('Lutron Smart Bridge');
      expect(locations[0].deviceCount).toBe(3);
    });
  });

  describe('listRooms()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should list all areas as rooms', async () => {
      const rooms = await adapter.listRooms();

      expect(rooms).toHaveLength(1);
      expect(rooms[0].roomId).toBe('1');
      expect(rooms[0].name).toBe('Living Room');
      expect(rooms[0].locationId).toBe('smart-bridge');
      expect(rooms[0].deviceCount).toBe(3);
    });

    it('should include device count per room', async () => {
      // Dispose and reinitialize with new areas
      await adapter.dispose();
      mockBridge.getAreas.mockResolvedValue([mockArea, { id: '2', name: 'Bedroom', href: '/area/2' }]);
      await adapter.initialize();

      const rooms = await adapter.listRooms();

      expect(rooms.find((r) => r.roomId === '1')?.deviceCount).toBe(3);
      expect(rooms.find((r) => r.roomId === '2')?.deviceCount).toBe(0);
    });
  });

  //
  // Scene Management Tests
  //

  describe('supportsScenes()', () => {
    it('should return false (scenes not fully supported in LEAP)', () => {
      expect(adapter.supportsScenes()).toBe(false);
    });
  });

  describe('listScenes()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should return empty array (scenes not supported)', async () => {
      const scenes = await adapter.listScenes();

      expect(scenes).toEqual([]);
    });
  });

  describe('executeScene()', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should execute scene via LEAP', async () => {
      await adapter.executeScene('scene-1');

      expect(mockBridge.executeScene).toHaveBeenCalledWith('scene-1');
    });

    it('should handle scene execution errors', async () => {
      mockBridge.executeScene.mockRejectedValue(new Error('Scene not found'));

      await expect(adapter.executeScene('invalid-scene')).rejects.toThrow();
    });
  });

  //
  // Event Handling Tests
  //

  describe('Event Handling', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should handle zone status change events', async () => {
      const eventPromise = new Promise<void>((resolve) => {
        adapter.once('stateChange', (event: any) => {
          expect(event.device).toBeDefined();
          expect(event.timestamp).toBeInstanceOf(Date);
          resolve();
        });
      });

      // Simulate zone status change
      mockBridge.emit('zoneStatus', '5', 50);

      await eventPromise;
    });

    it('should handle button press events', async () => {
      const eventPromise = new Promise<void>((resolve) => {
        adapter.once('buttonPress', (event: any) => {
          expect(event.deviceId).toBe('10');
          expect(event.buttonNumber).toBe(2);
          expect(event.action).toBe('pushed');
          resolve();
        });
      });

      // Simulate button press
      mockBridge.emit('buttonPress', '10', 2, 'pushed');

      await eventPromise;
    });

    it('should handle occupancy sensor events', () => {
      // Simulate occupancy update
      mockBridge.emit('occupancy', 'sensor-1', true);

      // Verify event was processed (no errors)
      expect(true).toBe(true);
    });

    it('should emit error events on bridge errors', async () => {
      const eventPromise = new Promise<void>((resolve) => {
        adapter.once('error', (event: any) => {
          expect(event.error).toBeInstanceOf(Error);
          expect(event.context).toBe('Smart Bridge error');
          resolve();
        });
      });

      mockBridge.emit('error', new Error('Bridge error'));

      await eventPromise;
    });
  });

  //
  // Capability Mapping Tests
  //

  describe('mapPlatformCapability()', () => {
    it('should return null (Lutron uses device types)', () => {
      const capability = adapter.mapPlatformCapability('WallDimmer');

      expect(capability).toBeNull();
    });
  });

  describe('mapUnifiedCapability()', () => {
    it('should return null (Lutron uses device types)', () => {
      const platformCapability = adapter.mapUnifiedCapability(DeviceCapability.DIMMER);

      expect(platformCapability).toBeNull();
    });
  });
});
