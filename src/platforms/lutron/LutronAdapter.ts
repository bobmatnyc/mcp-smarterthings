/**
 * Lutron Caseta platform adapter implementing IDeviceAdapter interface.
 *
 * This adapter provides unified device control for Lutron Caseta Smart Bridge
 * using the LEAP (Lutron Extensible Application Protocol) protocol via the
 * lutron-leap library.
 *
 * Design Decision: Local LEAP Protocol
 * Rationale: Lutron Caseta uses local-first architecture with LEAP protocol.
 * No cloud API available for third-party integrations. LEAP provides low
 * latency (30-100ms), high reliability, and certificate-based security.
 *
 * Performance:
 * - Low latency: 30-100ms (local LAN communication)
 * - No rate limits (local protocol)
 * - Event-driven state updates via LEAP subscriptions
 * - Zone state cache for immediate queries
 *
 * Error Handling:
 * - Wraps LEAP protocol errors in standardized DeviceError types
 * - Emits non-fatal errors via 'error' event
 * - Retry logic with exponential backoff for transient failures
 * - Reconnection handling for bridge disconnections
 *
 * @module platforms/lutron/LutronAdapter
 */

import { EventEmitter } from 'events';
import type { IDeviceAdapter } from '../../adapters/base/IDeviceAdapter.js';
import {
  type UnifiedDevice,
  DeviceCapability,
  type Platform,
  type UniversalDeviceId,
  type LocationId,
  type RoomId,
  type SceneId,
  createUniversalDeviceId,
  parseUniversalDeviceId,
} from '../../types/unified-device.js';
import type { DeviceState } from '../../types/device-state.js';
import type {
  DeviceCommand,
  CommandResult,
  CommandExecutionOptions,
  BatchCommandInput,
  BatchCommandOptions,
} from '../../types/commands.js';
import {
  type DeviceFilters,
  type AdapterHealthStatus,
  type LocationInfo,
  type RoomInfo,
  type SceneInfo,
  type AdapterErrorEvent,
  type StateChangeEvent,
} from '../../adapters/base/IDeviceAdapter.js';
import {
  DeviceError,
  AuthenticationError,
  DeviceNotFoundError,
  NetworkError,
  TimeoutError,
  CommandExecutionError,
  ConfigurationError,
  CapabilityNotSupportedError,
} from '../../types/errors.js';
import { retryWithBackoff } from '../../utils/retry.js';
import logger from '../../utils/logger.js';
import type {
  LutronAdapterConfig,
  LutronDevice,
  LutronZone,
  LutronArea,
  LutronScene,
  LutronButtonEvent,
  LutronButtonAction,
  LEAPZoneStatus,
  LEAPOccupancyUpdate,
  LEAPConnectionOptions,
} from './types.js';
import {
  loadCertificatesFromFiles,
  validateCertificateBundle,
  type CertificateBundle,
} from './certificate-manager.js';
import {
  extractDeviceCapabilities,
  isControllableDevice,
  isShadeDevice,
  isDimmerDevice,
  isFanDevice,
  normalizeLevel,
  denormalizeLevel,
  mapFanSpeed,
} from './capability-mapping.js';

// Import lutron-leap types (will be installed as dependency)
// Note: These are placeholder types - actual import will use installed package
interface SmartBridge extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getDevices(): Promise<any[]>;
  getAreas(): Promise<any[]>;
  getScenes(): Promise<any[]>;
  setDimmerLevel(deviceId: string, level: number): Promise<void>;
  setShadePosition(deviceId: string, position: number): Promise<void>;
  setFanSpeed(deviceId: string, speed: number): Promise<void>;
  getZoneStatus(zoneId: string): Promise<number>;
  executeScene(sceneId: string): Promise<void>;
  on(event: 'zoneStatus', listener: (zoneId: string, level: number) => void): this;
  on(event: 'buttonPress', listener: (deviceId: string, button: number, action: string) => void): this;
  on(event: 'occupancy', listener: (sensorId: string, occupied: boolean) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;
}

/**
 * Lutron Caseta platform adapter.
 *
 * Implements IDeviceAdapter interface for Lutron Smart Bridge control via LEAP protocol.
 * Extends EventEmitter to provide real-time event notifications.
 */
export class LutronAdapter extends EventEmitter implements IDeviceAdapter {
  // Adapter Metadata
  public readonly platform = 'lutron' as Platform;
  public readonly platformName = 'Lutron';
  public readonly version = '1.0.0';

  // Private state
  private bridge: SmartBridge | null = null;
  private initialized = false;
  private config: LutronAdapterConfig;
  private certificates: CertificateBundle | null = null;
  private zones: Map<string, LutronZone> = new Map();
  private areas: Map<string, LutronArea> = new Map();
  private devices: Map<string, LutronDevice> = new Map();
  private lastHealthCheck: Date | null = null;
  private errorCount = 0;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  constructor(config: LutronAdapterConfig) {
    super();
    this.config = config;

    // Validate configuration
    if (!config.smartBridgeHost || config.smartBridgeHost.trim().length === 0) {
      throw new ConfigurationError('Lutron Smart Bridge host is required', {
        platform: this.platform,
      });
    }

    if (!config.certificatePath || config.certificatePath.trim().length === 0) {
      throw new ConfigurationError('Lutron certificate path is required', {
        platform: this.platform,
      });
    }

    if (!config.privateKeyPath || config.privateKeyPath.trim().length === 0) {
      throw new ConfigurationError('Lutron private key path is required', {
        platform: this.platform,
      });
    }

    if (!config.caCertificatePath || config.caCertificatePath.trim().length === 0) {
      throw new ConfigurationError('Lutron CA certificate path is required', {
        platform: this.platform,
      });
    }
  }

  //
  // Lifecycle Management
  //

  /**
   * Initialize the adapter and establish Smart Bridge connection.
   *
   * Responsibilities:
   * - Load and validate TLS certificates
   * - Connect to Smart Bridge via LEAP protocol
   * - Subscribe to zone and device events
   * - Load initial device tree
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Lutron adapter already initialized');
      return;
    }

    logger.info('Initializing Lutron adapter', { platform: this.platform });

    try {
      // Load certificates
      this.certificates = await loadCertificatesFromFiles({
        certificatePath: this.config.certificatePath,
        privateKeyPath: this.config.privateKeyPath,
        caCertificatePath: this.config.caCertificatePath,
      });

      // Validate certificates
      validateCertificateBundle(this.certificates);

      // Connect to Smart Bridge
      await this.connectToBridge();

      // Load initial device tree
      await this.loadDeviceTree();

      // Set up event listeners
      this.setupEventListeners();

      this.initialized = true;
      this.errorCount = 0;
      this.reconnectAttempts = 0;
      this.lastHealthCheck = new Date();

      logger.info('Lutron adapter initialized successfully', {
        platform: this.platform,
        version: this.version,
        bridgeHost: this.config.smartBridgeHost,
        deviceCount: this.devices.size,
        areaCount: this.areas.size,
      });
    } catch (error) {
      const wrappedError = this.wrapError(error, 'initialize');
      logger.error('Failed to initialize Lutron adapter', {
        error: wrappedError.message,
        platform: this.platform,
      });
      throw wrappedError;
    }
  }

  /**
   * Dispose of adapter resources and close connections.
   *
   * Idempotent - safe to call multiple times.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Disposing Lutron adapter', { platform: this.platform });

    try {
      // Disconnect from Smart Bridge
      if (this.bridge) {
        await this.bridge.disconnect();
      }
    } catch (error) {
      logger.error('Error during adapter disposal', {
        error: error instanceof Error ? error.message : String(error),
        platform: this.platform,
      });
      // Don't throw - we're cleaning up regardless
    } finally {
      // ✅ Always reset state, even on error
      this.bridge = null;
      this.zones.clear();
      this.areas.clear();
      this.devices.clear();
      this.removeAllListeners();
      this.initialized = false;
      this.certificates = null;

      logger.info('Lutron adapter disposed', { platform: this.platform });
    }
  }

  /**
   * Check if adapter is initialized and ready.
   */
  isInitialized(): boolean {
    return this.initialized && this.bridge !== null;
  }

  /**
   * Perform health check on Smart Bridge connection.
   */
  async healthCheck(): Promise<AdapterHealthStatus> {
    logger.debug('Performing health check', { platform: this.platform });

    const status: AdapterHealthStatus = {
      healthy: false,
      platform: this.platform,
      apiReachable: false,
      authenticated: false,
      errorCount: this.errorCount,
      lastSuccessfulCall: this.lastHealthCheck ?? undefined,
    };

    if (!this.isInitialized()) {
      status.message = 'Adapter not initialized';
      return status;
    }

    try {
      // Test connectivity by fetching areas (lightweight operation)
      await retryWithBackoff(async () => {
        await this.bridge!.getAreas();
      });

      status.healthy = true;
      status.apiReachable = true;
      status.authenticated = true;
      status.message = 'All systems operational';
      this.lastHealthCheck = new Date();
      this.errorCount = 0;
      status.errorCount = 0; // ✅ Update status with reset count

      logger.info('Health check passed', { platform: this.platform });
    } catch (error) {
      const wrappedError = this.wrapError(error, 'healthCheck');
      this.errorCount++; // ✅ Increment error count first
      status.errorCount = this.errorCount; // ✅ Update status with new count
      status.message = `Health check failed: ${wrappedError.message}`;

      if (wrappedError instanceof AuthenticationError || wrappedError instanceof NetworkError) {
        status.authenticated = false;
      }

      logger.warn('Health check failed', {
        error: wrappedError.message,
        platform: this.platform,
      });
    }

    return status;
  }

  //
  // Device Discovery and Information
  //

  /**
   * List all devices accessible on this platform.
   *
   * @param filters Optional filters to narrow results
   * @returns Array of unified device models
   */
  async listDevices(filters?: DeviceFilters): Promise<UnifiedDevice[]> {
    this.ensureInitialized();

    logger.debug('Listing devices', {
      platform: this.platform,
      filters: filters || 'none',
    });

    try {
      // Convert cached devices to unified model
      let unifiedDevices = Array.from(this.devices.values()).map((device) =>
        this.mapDeviceToUnified(device)
      );

      // Apply filters
      if (filters) {
        unifiedDevices = this.applyFilters(unifiedDevices, filters);
      }

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Devices listed successfully', {
        platform: this.platform,
        count: unifiedDevices.length,
        filtered: !!filters,
      });

      return unifiedDevices;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'listDevices');
      this.errorCount++;
      this.emitError(wrappedError, 'listDevices');
      throw wrappedError;
    }
  }

  /**
   * Get detailed information about a specific device.
   *
   * @param deviceId Universal device ID or platform-specific ID
   * @returns Device information
   */
  async getDevice(deviceId: string): Promise<UnifiedDevice> {
    this.ensureInitialized();

    const platformDeviceId = this.extractPlatformDeviceId(deviceId);

    logger.debug('Getting device', {
      platform: this.platform,
      deviceId: platformDeviceId,
    });

    try {
      const device = this.devices.get(platformDeviceId);

      if (!device) {
        throw new DeviceNotFoundError(platformDeviceId, {
          platform: this.platform,
        });
      }

      const unifiedDevice = this.mapDeviceToUnified(device);

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Device retrieved', {
        platform: this.platform,
        deviceId: platformDeviceId,
        name: unifiedDevice.name,
      });

      return unifiedDevice;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'getDevice', { deviceId: platformDeviceId });
      this.errorCount++;
      // Don't emit error event for thrown errors - just throw
      throw wrappedError;
    }
  }

  /**
   * Get current state of a device.
   *
   * @param deviceId Universal device ID or platform-specific ID
   * @returns Current device state
   */
  async getDeviceState(deviceId: string): Promise<DeviceState> {
    this.ensureInitialized();

    const platformDeviceId = this.extractPlatformDeviceId(deviceId);

    logger.debug('Getting device state', {
      platform: this.platform,
      deviceId: platformDeviceId,
    });

    try {
      const device = this.devices.get(platformDeviceId);

      if (!device) {
        throw new DeviceNotFoundError(platformDeviceId, {
          platform: this.platform,
        });
      }

      // Get current state from zone cache or query bridge
      const deviceState = await this.getDeviceStateInternal(device);

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Device state retrieved', {
        platform: this.platform,
        deviceId: platformDeviceId,
        attributeCount: Object.keys(deviceState.attributes).length,
      });

      return deviceState;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'getDeviceState', { deviceId: platformDeviceId });
      this.errorCount++;
      // Don't emit error event for thrown errors - just throw
      throw wrappedError;
    }
  }

  /**
   * Refresh device state from platform (bypass cache).
   *
   * @param deviceId Universal device ID or platform-specific ID
   * @returns Fresh device state
   */
  async refreshDeviceState(deviceId: string): Promise<DeviceState> {
    // LEAP maintains real-time state via events, so this is identical to getDeviceState
    return this.getDeviceState(deviceId);
  }

  /**
   * Get capabilities supported by a device.
   *
   * @param deviceId Universal device ID or platform-specific ID
   * @returns Array of supported capabilities
   */
  async getDeviceCapabilities(deviceId: string): Promise<DeviceCapability[]> {
    this.ensureInitialized();

    const platformDeviceId = this.extractPlatformDeviceId(deviceId);

    logger.debug('Getting device capabilities', {
      platform: this.platform,
      deviceId: platformDeviceId,
    });

    try {
      const device = this.devices.get(platformDeviceId);

      if (!device) {
        throw new DeviceNotFoundError(platformDeviceId, {
          platform: this.platform,
        });
      }

      const capabilities = extractDeviceCapabilities(device);

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Device capabilities retrieved', {
        platform: this.platform,
        deviceId: platformDeviceId,
        count: capabilities.length,
      });

      return capabilities;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'getDeviceCapabilities', {
        deviceId: platformDeviceId,
      });
      this.errorCount++;
      this.emitError(wrappedError, 'getDeviceCapabilities');
      throw wrappedError;
    }
  }

  //
  // Command Execution
  //

  /**
   * Execute a command on a device.
   *
   * @param deviceId Universal device ID or platform-specific ID
   * @param command Command to execute
   * @param options Execution options
   * @returns Command execution result
   */
  async executeCommand(
    deviceId: string,
    command: DeviceCommand,
    options?: CommandExecutionOptions
  ): Promise<CommandResult> {
    this.ensureInitialized();

    const platformDeviceId = this.extractPlatformDeviceId(deviceId);
    const executedAt = new Date();

    logger.debug('Executing command', {
      platform: this.platform,
      deviceId: platformDeviceId,
      capability: command.capability,
      command: command.command,
    });

    try {
      const device = this.devices.get(platformDeviceId);

      if (!device) {
        // Return error instead of throwing
        const error = new DeviceNotFoundError(platformDeviceId, {
          platform: this.platform,
        });
        this.errorCount++;
        // Error is returned in result, don't emit event
        return {
          success: false,
          deviceId: createUniversalDeviceId(this.platform, platformDeviceId),
          command,
          executedAt,
          error,
        };
      }

      // Check if device is controllable - return error instead of throwing
      if (!isControllableDevice(device.type)) {
        const error = new CapabilityNotSupportedError(
          `Device type ${device.type} does not support control commands`,
          { capability: command.capability, platform: this.platform, deviceType: device.type }
        );
        this.errorCount++;
        // Error is returned in result, don't emit event
        return {
          success: false,
          deviceId: createUniversalDeviceId(this.platform, platformDeviceId),
          command,
          executedAt,
          error,
        };
      }

      // Execute command based on capability
      await this.executeDeviceCommand(platformDeviceId, device, command);

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      const result: CommandResult = {
        success: true,
        deviceId: createUniversalDeviceId(this.platform, platformDeviceId),
        command,
        executedAt,
      };

      // Optionally wait for state confirmation
      if (options?.waitForConfirmation !== false) {
        try {
          const newState = await this.getDeviceState(platformDeviceId);
          result.newState = newState;
        } catch (stateError) {
          // State fetch failure doesn't fail the command
          logger.warn('Failed to fetch state after command', {
            deviceId: platformDeviceId,
            error: stateError instanceof Error ? stateError.message : String(stateError),
          });
        }
      }

      logger.info('Command executed successfully', {
        platform: this.platform,
        deviceId: platformDeviceId,
        capability: command.capability,
        command: command.command,
      });

      return result;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'executeCommand', {
        deviceId: platformDeviceId,
        command: command.command,
        capability: command.capability,
      });
      this.errorCount++;
      // Error is returned in result, don't emit event

      return {
        success: false,
        deviceId: createUniversalDeviceId(this.platform, platformDeviceId),
        command,
        executedAt,
        error: wrappedError,
      };
    }
  }

  /**
   * Execute multiple commands in sequence or parallel.
   *
   * @param commands Array of device ID and command pairs
   * @param options Execution options
   * @returns Array of command results
   */
  async executeBatchCommands(
    commands: BatchCommandInput[],
    options?: BatchCommandOptions
  ): Promise<CommandResult[]> {
    this.ensureInitialized();

    logger.debug('Executing batch commands', {
      platform: this.platform,
      count: commands.length,
      parallel: options?.parallel ?? false,
    });

    const continueOnError = options?.continueOnError ?? true;
    const parallel = options?.parallel ?? false;

    if (parallel) {
      // Execute commands in parallel
      const results = await Promise.all(
        commands.map(async (cmd) => {
          try {
            return await this.executeCommand(cmd.deviceId, cmd.command, cmd.options);
          } catch (error) {
            if (!continueOnError) {
              throw error;
            }
            // Error already captured in CommandResult
            return {
              success: false,
              deviceId: createUniversalDeviceId(
                this.platform,
                this.extractPlatformDeviceId(cmd.deviceId)
              ),
              command: cmd.command,
              executedAt: new Date(),
              error: this.wrapError(error, 'executeBatchCommands'),
            };
          }
        })
      );

      logger.info('Batch commands executed (parallel)', {
        platform: this.platform,
        total: results.length,
        successful: results.filter((r) => r.success).length,
      });

      return results;
    } else {
      // Execute commands sequentially
      const results: CommandResult[] = [];

      for (const cmd of commands) {
        try {
          const result = await this.executeCommand(cmd.deviceId, cmd.command, cmd.options);
          results.push(result);

          if (!result.success && !continueOnError) {
            break;
          }
        } catch (error) {
          const result: CommandResult = {
            success: false,
            deviceId: createUniversalDeviceId(
              this.platform,
              this.extractPlatformDeviceId(cmd.deviceId)
            ),
            command: cmd.command,
            executedAt: new Date(),
            error: this.wrapError(error, 'executeBatchCommands'),
          };
          results.push(result);

          if (!continueOnError) {
            break;
          }
        }
      }

      logger.info('Batch commands executed (sequential)', {
        platform: this.platform,
        total: results.length,
        successful: results.filter((r) => r.success).length,
      });

      return results;
    }
  }

  //
  // Capability Mapping
  //

  /**
   * Map platform-specific capability to unified capability.
   *
   * Note: Lutron uses device types rather than individual capabilities.
   * This method is primarily for interface compliance.
   *
   * @param platformCapability Lutron device type
   * @returns Unified capability enum or null
   */
  mapPlatformCapability(platformCapability: string): DeviceCapability | null {
    // Lutron uses device types, not individual capabilities
    // Return null for unmapped types
    logger.debug('Platform capability mapping not applicable for Lutron (uses device types)', {
      platformCapability,
    });
    return null;
  }

  /**
   * Map unified capability to platform-specific capability.
   *
   * Note: Lutron uses device types rather than individual capabilities.
   * This method is primarily for interface compliance.
   *
   * @param unifiedCapability Unified capability enum
   * @returns Lutron device type or null
   */
  mapUnifiedCapability(unifiedCapability: DeviceCapability): string | null {
    // Lutron uses device types, not individual capabilities
    // Return null for unsupported capabilities
    logger.debug('Unified capability mapping not applicable for Lutron (uses device types)', {
      unifiedCapability,
    });
    return null;
  }

  //
  // Location and Room Management
  //

  /**
   * List all locations/homes accessible on this platform.
   *
   * Lutron has a single "location" (the Smart Bridge).
   *
   * @returns Array of location information
   */
  async listLocations(): Promise<LocationInfo[]> {
    this.ensureInitialized();

    logger.debug('Listing locations', { platform: this.platform });

    try {
      // Lutron Smart Bridge represents a single location
      const locationInfo: LocationInfo = {
        locationId: 'smart-bridge' as LocationId | string,
        name: `Lutron Smart Bridge (${this.config.smartBridgeHost})`,
        roomCount: this.areas.size,
        deviceCount: this.devices.size,
      };

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Locations listed successfully', {
        platform: this.platform,
        count: 1,
      });

      return [locationInfo];
    } catch (error) {
      const wrappedError = this.wrapError(error, 'listLocations');
      this.errorCount++;
      this.emitError(wrappedError, 'listLocations');
      throw wrappedError;
    }
  }

  /**
   * List all rooms within a location.
   *
   * Returns areas (rooms) from Smart Bridge.
   *
   * @param locationId Optional location filter (ignored for Lutron)
   * @returns Array of room information
   */
  async listRooms(locationId?: string): Promise<RoomInfo[]> {
    this.ensureInitialized();

    logger.debug('Listing rooms', { platform: this.platform, locationId: locationId || 'all' });

    try {
      // Count devices per area
      const deviceCountByArea = new Map<string, number>();

      for (const device of this.devices.values()) {
        if (device.area) {
          deviceCountByArea.set(device.area, (deviceCountByArea.get(device.area) ?? 0) + 1);
        }
      }

      const roomInfos: RoomInfo[] = Array.from(this.areas.values()).map((area) => ({
        roomId: area.id as RoomId | string,
        name: area.name,
        locationId: 'smart-bridge' as LocationId | string,
        deviceCount: deviceCountByArea.get(area.id) ?? 0,
      }));

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Rooms listed successfully', {
        platform: this.platform,
        count: roomInfos.length,
      });

      return roomInfos;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'listRooms', { locationId });
      this.errorCount++;
      this.emitError(wrappedError, 'listRooms');
      throw wrappedError;
    }
  }

  //
  // Scene Management
  //

  /**
   * Check if adapter supports scenes.
   *
   * Lutron supports virtual buttons (scenes) but they are typically
   * not exposed via LEAP integration API for third-party control.
   *
   * @returns False (scenes not fully supported in LEAP)
   */
  supportsScenes(): boolean {
    return false;
  }

  /**
   * List scenes/automations.
   *
   * @param locationId Optional location filter
   * @returns Array of scene information
   */
  async listScenes(locationId?: string): Promise<SceneInfo[]> {
    // Scenes not supported in Lutron LEAP integration
    logger.warn('Scene listing not supported for Lutron', { platform: this.platform });
    return [];
  }

  /**
   * Execute a scene.
   *
   * @param sceneId Scene identifier
   */
  async executeScene(sceneId: string): Promise<void> {
    this.ensureInitialized();

    logger.debug('Executing scene', { platform: this.platform, sceneId });

    try {
      await retryWithBackoff(async () => {
        await this.bridge!.executeScene(sceneId);
      });

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Scene executed successfully', {
        platform: this.platform,
        sceneId,
      });
    } catch (error) {
      const wrappedError = this.wrapError(error, 'executeScene', { sceneId });
      this.errorCount++;
      this.emitError(wrappedError, 'executeScene');
      throw wrappedError;
    }
  }

  //
  // Private Helper Methods
  //

  /**
   * Connect to Smart Bridge via LEAP protocol.
   */
  private async connectToBridge(): Promise<void> {
    logger.info('Connecting to Lutron Smart Bridge', {
      host: this.config.smartBridgeHost,
      port: this.config.port ?? 8081,
    });

    if (!this.certificates) {
      throw new ConfigurationError('Certificates not loaded', {
        platform: this.platform,
      });
    }

    try {
      // Note: Actual SmartBridge import will be from lutron-leap package
      // This is a placeholder for implementation
      const { SmartBridge } = await import('lutron-leap');

      const connectionOptions: LEAPConnectionOptions = {
        host: this.config.smartBridgeHost,
        port: this.config.port ?? 8081,
        ca: this.certificates.caCert,
        cert: this.certificates.clientCert,
        key: this.certificates.clientKey,
        timeout: 30000, // 30 second connection timeout
      };

      this.bridge = new SmartBridge(connectionOptions);

      await retryWithBackoff(async () => {
        await this.bridge!.connect();
      });

      logger.info('Connected to Smart Bridge successfully', {
        host: this.config.smartBridgeHost,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NetworkError(`Failed to connect to Smart Bridge: ${message}`, {
        platform: this.platform,
        host: this.config.smartBridgeHost,
      });
    }
  }

  /**
   * Load device tree from Smart Bridge.
   */
  private async loadDeviceTree(): Promise<void> {
    logger.debug('Loading device tree from Smart Bridge');

    try {
      // Load areas
      const areas = await retryWithBackoff(async () => {
        return await this.bridge!.getAreas();
      });

      this.areas.clear();
      for (const area of areas) {
        this.areas.set(area.id, {
          id: area.id,
          name: area.name,
          parent: area.parent,
          href: area.href,
        });
      }

      // Load devices
      const devices = await retryWithBackoff(async () => {
        return await this.bridge!.getDevices();
      });

      this.devices.clear();
      this.zones.clear();

      for (const device of devices) {
        // Map device structure
        const lutronDevice: LutronDevice = {
          id: device.id,
          name: device.name,
          type: device.type,
          area: device.area,
          href: device.href,
          serialNumber: device.serialNumber,
          modelNumber: device.modelNumber,
        };

        // Extract zone information if available
        if (device.zone) {
          const zone: LutronZone = {
            id: device.zone.id || device.id,
            name: device.zone.name || device.name,
            area: device.area,
            type: device.type,
            level: device.zone.level,
            href: device.zone.href,
          };
          this.zones.set(zone.id, zone);
          lutronDevice.zone = zone;
        }

        this.devices.set(device.id, lutronDevice);
      }

      logger.info('Device tree loaded successfully', {
        devices: this.devices.size,
        zones: this.zones.size,
        areas: this.areas.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DeviceError(
        `Failed to load device tree: ${message}`,
        'DEVICE_TREE_LOAD_FAILED',
        { platform: this.platform }
      );
    }
  }

  /**
   * Set up event listeners for Smart Bridge events.
   */
  private setupEventListeners(): void {
    if (!this.bridge) {
      return;
    }

    logger.debug('Setting up Smart Bridge event listeners');

    // Zone status updates
    this.bridge.on('zoneStatus', (zoneId: string, level: number) => {
      this.handleZoneStatusChange(zoneId, level);
    });

    // Button press events
    this.bridge.on('buttonPress', (deviceId: string, button: number, action: string) => {
      this.handleButtonPress(deviceId, button, action as LutronButtonAction);
    });

    // Occupancy sensor updates
    this.bridge.on('occupancy', (sensorId: string, occupied: boolean) => {
      this.handleOccupancyUpdate(sensorId, occupied);
    });

    // Bridge errors
    this.bridge.on('error', (error: Error) => {
      logger.error('Smart Bridge error', {
        error: error.message,
        platform: this.platform,
      });
      this.handleBridgeError(error);
    });

    // Bridge disconnection
    this.bridge.on('close', () => {
      logger.warn('Smart Bridge connection closed', {
        platform: this.platform,
      });
      this.handleBridgeDisconnect();
    });

    logger.info('Event listeners configured');
  }

  /**
   * Handle zone status change events.
   */
  private handleZoneStatusChange(zoneId: string, level: number): void {
    logger.debug('Zone status changed', { zoneId, level });

    // Update zone cache
    const zone = this.zones.get(zoneId);
    if (zone) {
      const oldLevel = zone.level;
      zone.level = normalizeLevel(level);

      // Emit state change event
      const device = Array.from(this.devices.values()).find(
        (d) => d.zone && d.zone.id === zoneId
      );

      if (device) {
        this.emitStateChangeEvent(device, { oldLevel, newLevel: zone.level });
      }
    }
  }

  /**
   * Handle button press events.
   */
  private handleButtonPress(deviceId: string, button: number, action: LutronButtonAction): void {
    logger.debug('Button pressed', { deviceId, button, action });

    const buttonEvent: LutronButtonEvent = {
      deviceId,
      buttonNumber: button,
      action,
      timestamp: new Date(),
    };

    // Emit button event (for future button device support)
    this.emit('buttonPress', buttonEvent);
  }

  /**
   * Handle occupancy sensor updates.
   */
  private handleOccupancyUpdate(sensorId: string, occupied: boolean): void {
    logger.debug('Occupancy updated', { sensorId, occupied });

    const device = this.devices.get(sensorId);
    if (device && device.occupancySensor) {
      const oldOccupied = device.occupancySensor.occupied;
      device.occupancySensor.occupied = occupied;

      // Emit state change event
      this.emitStateChangeEvent(device, { oldOccupied, newOccupied: occupied });
    }
  }

  /**
   * Handle Smart Bridge errors.
   */
  private handleBridgeError(error: Error): void {
    this.errorCount++;
    this.emitError(this.wrapError(error, 'bridge'), 'Smart Bridge error');
  }

  /**
   * Handle Smart Bridge disconnection.
   */
  private handleBridgeDisconnect(): void {
    this.initialized = false;

    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      logger.info('Attempting to reconnect to Smart Bridge', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        delay,
      });

      setTimeout(async () => {
        try {
          await this.initialize();
        } catch (error) {
          logger.error('Reconnection failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, delay);
    } else {
      logger.error('Max reconnection attempts reached', {
        attempts: this.reconnectAttempts,
      });
    }
  }

  /**
   * Execute device command based on capability.
   */
  private async executeDeviceCommand(
    deviceId: string,
    device: LutronDevice,
    command: DeviceCommand
  ): Promise<void> {
    await retryWithBackoff(async () => {
      switch (command.capability) {
        case DeviceCapability.SWITCH:
          await this.executeSwitchCommand(deviceId, device, command);
          break;

        case DeviceCapability.DIMMER:
          await this.executeDimmerCommand(deviceId, device, command);
          break;

        case DeviceCapability.SHADE:
          await this.executeShadeCommand(deviceId, device, command);
          break;

        case DeviceCapability.FAN:
          await this.executeFanCommand(deviceId, device, command);
          break;

        default:
          throw new CapabilityNotSupportedError(
            `Capability ${command.capability} not supported on Lutron`,
            { capability: command.capability, platform: this.platform }
          );
      }
    });
  }

  /**
   * Execute switch command.
   */
  private async executeSwitchCommand(
    deviceId: string,
    device: LutronDevice,
    command: DeviceCommand
  ): Promise<void> {
    const level = command.command === 'on' ? 100 : 0;
    await this.bridge!.setDimmerLevel(deviceId, level);
  }

  /**
   * Execute dimmer command.
   */
  private async executeDimmerCommand(
    deviceId: string,
    device: LutronDevice,
    command: DeviceCommand
  ): Promise<void> {
    if (command.command === 'setLevel' && command.parameters?.level !== undefined) {
      const level = denormalizeLevel(command.parameters.level as number);
      await this.bridge!.setDimmerLevel(deviceId, level);
    } else {
      throw new CommandExecutionError(`Invalid dimmer command: ${command.command}`, {
        platform: this.platform,
        deviceId,
        command: command.command,
      });
    }
  }

  /**
   * Execute shade command.
   */
  private async executeShadeCommand(
    deviceId: string,
    device: LutronDevice,
    command: DeviceCommand
  ): Promise<void> {
    if (command.parameters?.position !== undefined) {
      const position = denormalizeLevel(command.parameters.position as number);
      await this.bridge!.setShadePosition(deviceId, position);
    } else {
      throw new CommandExecutionError(`Invalid shade command: ${command.command}`, {
        platform: this.platform,
        deviceId,
        command: command.command,
      });
    }
  }

  /**
   * Execute fan command.
   */
  private async executeFanCommand(
    deviceId: string,
    device: LutronDevice,
    command: DeviceCommand
  ): Promise<void> {
    if (command.parameters?.speed !== undefined) {
      const speed = mapFanSpeed(command.parameters.speed as number);
      await this.bridge!.setFanSpeed(deviceId, speed);
    } else {
      throw new CommandExecutionError(`Invalid fan command: ${command.command}`, {
        platform: this.platform,
        deviceId,
        command: command.command,
      });
    }
  }

  /**
   * Get device state internal implementation.
   */
  private async getDeviceStateInternal(device: LutronDevice): Promise<DeviceState> {
    const attributes: Record<string, unknown> = {};

    // Query zone status for controllable devices
    if (isControllableDevice(device.type) && device.zone) {
      const level = await retryWithBackoff(async () => {
        return await this.bridge!.getZoneStatus(device.zone!.id);
      });

      const normalizedLevel = normalizeLevel(level);

      // Update zone cache
      device.zone.level = normalizedLevel;

      // Add switch attribute
      attributes['switch.switch'] = normalizedLevel > 0 ? 'on' : 'off';

      // Add dimmer attribute if dimmer device
      if (isDimmerDevice(device.type)) {
        attributes['dimmer.level'] = normalizedLevel;
      }

      // Add shade attribute if shade device
      if (isShadeDevice(device.type)) {
        attributes['shade.position'] = normalizedLevel;
      }

      // Add fan attribute if fan device
      if (isFanDevice(device.type)) {
        attributes['fan.speed'] = normalizedLevel;
      }
    }

    // Add occupancy sensor attribute
    if (device.occupancySensor) {
      attributes['occupancy.occupied'] = device.occupancySensor.occupied ?? false;
    }

    return {
      deviceId: createUniversalDeviceId(this.platform, device.id),
      timestamp: new Date(),
      attributes,
      platformSpecific: {
        zone: device.zone,
        type: device.type,
      },
    };
  }

  /**
   * Map Lutron device to unified device model.
   */
  private mapDeviceToUnified(device: LutronDevice): UnifiedDevice {
    const capabilities = extractDeviceCapabilities(device);

    // Get area name
    const areaName = device.area ? this.areas.get(device.area)?.name : undefined;

    return {
      id: createUniversalDeviceId(this.platform, device.id),
      platform: this.platform,
      platformDeviceId: device.id,
      name: device.name,
      label: device.name,
      manufacturer: 'Lutron',
      model: device.modelNumber,
      room: areaName,
      location: 'smart-bridge',
      capabilities,
      online: true, // LEAP devices always online when bridge connected
      platformSpecific: {
        type: device.type,
        serialNumber: device.serialNumber,
        area: device.area,
        zone: device.zone,
        buttonGroup: device.buttonGroup,
        occupancySensor: device.occupancySensor,
      },
    };
  }

  /**
   * Apply filters to device list.
   */
  private applyFilters(devices: UnifiedDevice[], filters: DeviceFilters): UnifiedDevice[] {
    return devices.filter((device) => {
      // Room filter
      if (filters.roomId && device.platformSpecific?.area !== filters.roomId) {
        return false;
      }

      // Location filter
      if (filters.locationId && device.location !== filters.locationId) {
        return false;
      }

      // Capability filter
      if (filters.capability && !device.capabilities.includes(filters.capability)) {
        return false;
      }

      // Online filter
      if (filters.online !== undefined && device.online !== filters.online) {
        return false;
      }

      // Manufacturer filter
      if (
        filters.manufacturer &&
        device.manufacturer?.toLowerCase() !== filters.manufacturer.toLowerCase()
      ) {
        return false;
      }

      // Name pattern filter
      if (filters.namePattern && !filters.namePattern.test(device.name)) {
        return false;
      }

      // Device type filter
      if (filters.deviceType && device.platformSpecific?.type !== filters.deviceType) {
        return false;
      }

      return true;
    });
  }

  /**
   * Emit state change event.
   */
  private emitStateChangeEvent(device: LutronDevice, changes: Record<string, unknown>): void {
    // Create state change event
    const stateChangeEvent: Partial<StateChangeEvent> = {
      device: this.mapDeviceToUnified(device),
      timestamp: new Date(),
      // Note: Full StateChangeEvent requires old/new state - implement if needed
    };

    this.emit('stateChange', stateChangeEvent);
  }

  /**
   * Ensure adapter is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new ConfigurationError('Lutron adapter not initialized', {
        platform: this.platform,
      });
    }
  }

  /**
   * Extract platform-specific device ID from universal ID or raw ID.
   */
  private extractPlatformDeviceId(deviceId: string): string {
    if (deviceId.includes(':')) {
      const parsed = parseUniversalDeviceId(deviceId as UniversalDeviceId);
      if (parsed.platform !== this.platform) {
        throw new DeviceNotFoundError(deviceId, {
          reason: `Device belongs to ${parsed.platform}, not ${this.platform}`,
        });
      }
      return parsed.platformDeviceId;
    }
    return deviceId;
  }

  /**
   * Wrap platform errors in standardized DeviceError types.
   */
  private wrapError(
    error: unknown,
    context: string,
    additionalContext?: Record<string, unknown>
  ): DeviceError {
    if (error instanceof DeviceError) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorContext = {
      platform: this.platform,
      operation: context,
      ...additionalContext,
    };

    // Check for authentication errors (certificate issues)
    if (
      errorMessage.includes('certificate') ||
      errorMessage.includes('TLS') ||
      errorMessage.includes('authentication')
    ) {
      return new AuthenticationError('Lutron authentication failed', errorContext);
    }

    // Check for device not found
    if (errorMessage.includes('not found') || errorMessage.includes('unknown device')) {
      return new DeviceNotFoundError(
        (additionalContext?.['deviceId'] as string) ?? 'unknown',
        errorContext
      );
    }

    // Check for network errors
    if (
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('network') ||
      errorMessage.includes('connection')
    ) {
      return new NetworkError(`Lutron network error: ${errorMessage}`, errorContext);
    }

    // Check for timeout
    if (errorMessage.includes('timeout')) {
      return new TimeoutError(`Lutron operation timed out: ${errorMessage}`, errorContext);
    }

    // Default to command execution error
    return new CommandExecutionError(`Lutron operation failed: ${errorMessage}`, errorContext);
  }

  /**
   * Emit adapter error event.
   */
  private emitError(error: DeviceError, context: string): void {
    const errorEvent: AdapterErrorEvent = {
      error,
      context,
      timestamp: new Date(),
    };

    this.emit('error', errorEvent);
  }
}
