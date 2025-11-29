/**
 * Tuya platform adapter implementing IDeviceAdapter interface.
 *
 * This adapter provides unified device control for Tuya Cloud API using official
 * @tuya/tuya-connector-nodejs SDK, implementing the Layer 2 abstraction interface
 * for device discovery, command execution, and state management.
 *
 * Design Decision: Cloud API First
 * Rationale: Official TypeScript SDK with reliable authentication and token management.
 * Cloud API provides better reliability than local API, with acceptable latency
 * (300-500ms) for most use cases. Local API can be added in Phase 2 for latency-
 * sensitive operations.
 *
 * Performance:
 * - Token lifecycle managed automatically by SDK (2-hour validity, auto-refresh)
 * - Retry logic with exponential backoff for transient failures
 * - Rate limit handling (free tier: 1K req/day, 10 QPS; paid: 500 QPS)
 *
 * Error Handling:
 * - Wraps Tuya API errors in standardized DeviceError types
 * - Emits non-fatal errors via 'error' event
 * - Retries transient failures (network, rate limits)
 * - No retry on permanent failures (device not found, invalid command)
 *
 * @module platforms/tuya/TuyaAdapter
 */

import { EventEmitter } from 'events';
import { TuyaContext } from '@tuya/tuya-connector-nodejs';
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
} from '../../adapters/base/IDeviceAdapter.js';
import {
  DeviceError,
  AuthenticationError,
  DeviceNotFoundError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  CommandExecutionError,
  ConfigurationError,
  CapabilityNotSupportedError,
} from '../../types/errors.js';
import { retryWithBackoff } from '../../utils/retry.js';
import logger from '../../utils/logger.js';
import type {
  TuyaAdapterConfig,
  TuyaDevice,
  TuyaAPIResponse,
  TuyaDataPoint,
  TuyaHome,
  TuyaRoom,
  TuyaScene,
} from './types.js';
import {
  mapDPToCapability,
  mapCapabilityToDP,
  extractDeviceCapabilities,
  denormalizeBrightness,
  normalizeBrightness,
} from './capability-mapping.js';

/**
 * Tuya platform adapter.
 *
 * Implements IDeviceAdapter interface for Tuya Cloud API device control.
 * Extends EventEmitter to provide real-time event notifications.
 */
export class TuyaAdapter extends EventEmitter implements IDeviceAdapter {
  // Adapter Metadata
  public readonly platform = 'tuya' as Platform;
  public readonly platformName = 'Tuya';
  public readonly version = '1.0.0';

  // Private state
  private client: TuyaContext | null = null;
  private initialized = false;
  private config: TuyaAdapterConfig;
  private userId: string = '';
  private lastHealthCheck: Date | null = null;
  private errorCount = 0;

  constructor(config: TuyaAdapterConfig) {
    super();
    this.config = config;

    // Validate configuration
    if (!config.accessKey || config.accessKey.trim().length === 0) {
      throw new ConfigurationError('Tuya accessKey is required', {
        platform: this.platform,
      });
    }

    if (!config.secretKey || config.secretKey.trim().length === 0) {
      throw new ConfigurationError('Tuya secretKey is required', {
        platform: this.platform,
      });
    }

    if (!config.baseUrl || config.baseUrl.trim().length === 0) {
      throw new ConfigurationError('Tuya baseUrl is required', {
        platform: this.platform,
      });
    }

    // Store userId if provided
    if (config.userId) {
      this.userId = config.userId;
    }
  }

  //
  // Lifecycle Management
  //

  /**
   * Initialize the adapter and establish platform connection.
   *
   * Responsibilities:
   * - Authenticate with Tuya Cloud API
   * - Validate credentials via token acquisition
   * - Initialize SDK client with automatic token management
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Tuya adapter already initialized');
      return;
    }

    logger.info('Initializing Tuya adapter', { platform: this.platform });

    try {
      // Initialize Tuya client with credentials
      this.client = new TuyaContext({
        baseUrl: this.config.baseUrl,
        accessKey: this.config.accessKey,
        secretKey: this.config.secretKey,
      });

      // Validate connection with a test API call
      await retryWithBackoff(async () => {
        // Token acquisition happens automatically on first request
        const response = await this.client!.request<{ uid: string }>({
          method: 'GET',
          path: '/v1.0/token',
          body: {},
        });

        // Extract user ID if not provided in config
        if (!this.userId && response.success && response.result?.uid) {
          this.userId = response.result.uid;
          logger.debug('Retrieved user ID from token', { userId: this.userId });
        }
      });

      this.initialized = true;
      this.errorCount = 0;
      this.lastHealthCheck = new Date();

      logger.info('Tuya adapter initialized successfully', {
        platform: this.platform,
        version: this.version,
        baseUrl: this.config.baseUrl,
      });
    } catch (error) {
      const wrappedError = this.wrapError(error, 'initialize');
      logger.error('Failed to initialize Tuya adapter', {
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
  // eslint-disable-next-line @typescript-eslint/require-await
  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Disposing Tuya adapter', { platform: this.platform });

    try {
      // Remove all event listeners
      this.removeAllListeners();

      // Mark as uninitialized
      this.client = null;
      this.initialized = false;

      logger.info('Tuya adapter disposed', { platform: this.platform });
    } catch (error) {
      logger.error('Error during adapter disposal', {
        error: error instanceof Error ? error.message : String(error),
        platform: this.platform,
      });
    }
  }

  /**
   * Check if adapter is initialized and ready.
   */
  isInitialized(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Perform health check on platform connection.
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
      // Test API connectivity with lightweight call
      await retryWithBackoff(async () => {
        await this.client!.request({
          method: 'GET',
          path: '/v1.0/token',
          body: {},
        });
      });

      status.healthy = true;
      status.apiReachable = true;
      status.authenticated = true;
      status.message = 'All systems operational';
      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Health check passed', { platform: this.platform });
    } catch (error) {
      const wrappedError = this.wrapError(error, 'healthCheck');
      status.message = `Health check failed: ${wrappedError.message}`;
      this.errorCount++;

      if (wrappedError instanceof AuthenticationError) {
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
      // Fetch devices from Tuya Cloud API
      const response = await retryWithBackoff(async () => {
        if (!this.userId) {
          throw new ConfigurationError('User ID not available for device listing', {
            platform: this.platform,
          });
        }

        return await this.client!.request<TuyaDevice[]>({
          method: 'GET',
          path: `/v1.0/users/${this.userId}/devices`,
          body: {},
        });
      });

      if (!response.success || !response.result) {
        throw new DeviceError(
          'Failed to list devices: API returned unsuccessful response',
          'DEVICE_LIST_FAILED',
          { platform: this.platform, response }
        );
      }

      const tuyaDevices = response.result;

      // Convert to unified device model
      let unifiedDevices = tuyaDevices.map((device) => this.mapDeviceToUnified(device));

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
      const response = await retryWithBackoff(async () => {
        return await this.client!.request<TuyaDevice>({
          method: 'GET',
          path: `/v1.0/devices/${platformDeviceId}`,
          body: {},
        });
      });

      if (!response.success || !response.result) {
        throw new DeviceNotFoundError(platformDeviceId, {
          platform: this.platform,
          response,
        });
      }

      const unifiedDevice = this.mapDeviceToUnified(response.result);

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
      this.emitError(wrappedError, 'getDevice');
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
      const response = await retryWithBackoff(async () => {
        return await this.client!.request<TuyaDataPoint[]>({
          method: 'GET',
          path: `/v1.0/devices/${platformDeviceId}/status`,
          body: {},
        });
      });

      if (!response.success || !response.result) {
        throw new DeviceError(
          'Failed to get device state: API returned unsuccessful response',
          'DEVICE_STATE_FAILED',
          { platform: this.platform, deviceId: platformDeviceId, response }
        );
      }

      const deviceState = this.mapStatusToState(platformDeviceId, response.result);

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
      this.emitError(wrappedError, 'getDeviceState');
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
    // Tuya Cloud API always provides fresh state, so this is identical to getDeviceState
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
      const device = await this.getDevice(platformDeviceId);
      const capabilities = device.capabilities;

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
      // Map unified capability/command to Tuya DP codes
      let dpCommands: Array<{ code: string; value: unknown }>;
      try {
        dpCommands = this.mapCommandToDPs(command);
      } catch (error) {
        // Capability mapping errors should be caught and returned as failed result
        if (error instanceof CapabilityNotSupportedError) {
          return {
            success: false,
            deviceId: createUniversalDeviceId(this.platform, platformDeviceId),
            command,
            executedAt,
            error,
          };
        }
        throw error;
      }

      // Execute command with retry logic
      await retryWithBackoff(async () => {
        const response = await this.client!.request({
          method: 'POST',
          path: `/v1.0/devices/${platformDeviceId}/commands`,
          body: { commands: dpCommands },
        });

        if (!response.success) {
          throw new CommandExecutionError(
            `Command execution failed: ${response.msg || 'Unknown error'}`,
            {
              platform: this.platform,
              deviceId: platformDeviceId,
              command: command.command,
              response,
            }
          );
        }
      });

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
      this.emitError(wrappedError, 'executeCommand');

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
   * @param platformCapability Tuya DP code
   * @returns Unified capability enum or null
   */
  mapPlatformCapability(platformCapability: string): DeviceCapability | null {
    return mapDPToCapability(platformCapability);
  }

  /**
   * Map unified capability to platform-specific capability.
   *
   * @param unifiedCapability Unified capability enum
   * @returns Tuya DP code or null
   */
  mapUnifiedCapability(unifiedCapability: DeviceCapability): string | null {
    return mapCapabilityToDP(unifiedCapability);
  }

  //
  // Location and Room Management
  //

  /**
   * List all locations/homes accessible on this platform.
   *
   * @returns Array of location information
   */
  async listLocations(): Promise<LocationInfo[]> {
    this.ensureInitialized();

    logger.debug('Listing locations', { platform: this.platform });

    try {
      const response = await retryWithBackoff(async () => {
        if (!this.userId) {
          throw new ConfigurationError('User ID not available for location listing', {
            platform: this.platform,
          });
        }

        return await this.client!.request<TuyaHome[]>({
          method: 'GET',
          path: `/v1.0/users/${this.userId}/homes`,
          body: {},
        });
      });

      if (!response.success || !response.result) {
        throw new DeviceError(
          'Failed to list locations: API returned unsuccessful response',
          'LOCATION_LIST_FAILED',
          { platform: this.platform, response }
        );
      }

      const homes = response.result;
      const locationInfos: LocationInfo[] = homes.map((home) => ({
        locationId: home.home_id as LocationId | string,
        name: home.name ?? 'Unknown Home',
        roomCount: home.rooms,
      }));

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Locations listed successfully', {
        platform: this.platform,
        count: locationInfos.length,
      });

      return locationInfos;
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
   * @param locationId Optional location filter
   * @returns Array of room information
   */
  async listRooms(locationId?: string): Promise<RoomInfo[]> {
    this.ensureInitialized();

    logger.debug('Listing rooms', { platform: this.platform, locationId: locationId || 'all' });

    try {
      let allRooms: TuyaRoom[] = [];

      if (locationId) {
        // Fetch rooms for specific location (home)
        const response = await retryWithBackoff(async () => {
          return await this.client!.request<TuyaRoom[]>({
            method: 'GET',
            path: `/v1.0/homes/${locationId}/rooms`,
            body: {},
          });
        });

        if (!response.success || !response.result) {
          throw new DeviceError(
            'Failed to list rooms: API returned unsuccessful response',
            'ROOM_LIST_FAILED',
            { platform: this.platform, locationId, response }
          );
        }

        allRooms = response.result;
      } else {
        // Fetch all homes and their rooms
        const locations = await this.listLocations();
        for (const location of locations) {
          const response = await retryWithBackoff(async () => {
            return await this.client!.request<TuyaRoom[]>({
              method: 'GET',
              path: `/v1.0/homes/${location.locationId}/rooms`,
              body: {},
            });
          });

          if (response.success && response.result) {
            allRooms.push(...response.result);
          }
        }
      }

      // Get device counts for each room
      const devices = await this.listDevices();
      const deviceCountByRoom = new Map<string, number>();

      for (const device of devices) {
        if (device.platformSpecific?.room_id) {
          const roomId = device.platformSpecific.room_id as string;
          deviceCountByRoom.set(roomId, (deviceCountByRoom.get(roomId) ?? 0) + 1);
        }
      }

      const roomInfos: RoomInfo[] = allRooms.map((room) => ({
        roomId: room.room_id as RoomId | string,
        name: room.name,
        locationId: room.home_id as LocationId | string,
        deviceCount: deviceCountByRoom.get(room.room_id) ?? 0,
      }));

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Rooms listed successfully', {
        platform: this.platform,
        count: roomInfos.length,
        locationFilter: !!locationId,
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
   * @returns True (Tuya supports scenes/automations)
   */
  supportsScenes(): boolean {
    return true;
  }

  /**
   * List scenes/automations.
   *
   * @param locationId Optional location filter
   * @returns Array of scene information
   */
  async listScenes(locationId?: string): Promise<SceneInfo[]> {
    this.ensureInitialized();

    logger.debug('Listing scenes', { platform: this.platform, locationId: locationId || 'all' });

    try {
      let allScenes: TuyaScene[] = [];

      if (locationId) {
        // Fetch scenes for specific home
        const response = await retryWithBackoff(async () => {
          return await this.client!.request<TuyaScene[]>({
            method: 'GET',
            path: `/v1.0/homes/${locationId}/scenes`,
            body: {},
          });
        });

        if (response.success && response.result) {
          allScenes = response.result;
        }
      } else {
        // Fetch all homes and their scenes
        const locations = await this.listLocations();
        for (const location of locations) {
          const response = await retryWithBackoff(async () => {
            return await this.client!.request<TuyaScene[]>({
              method: 'GET',
              path: `/v1.0/homes/${location.locationId}/scenes`,
              body: {},
            });
          });

          if (response.success && response.result) {
            allScenes.push(...response.result);
          }
        }
      }

      const sceneInfos: SceneInfo[] = allScenes.map((scene) => ({
        sceneId: scene.scene_id as SceneId | string,
        name: scene.name,
        description: undefined,
        locationId: scene.home_id as LocationId | string | undefined,
      }));

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Scenes listed successfully', {
        platform: this.platform,
        count: sceneInfos.length,
        locationFilter: !!locationId,
      });

      return sceneInfos;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'listScenes', { locationId });
      this.errorCount++;
      this.emitError(wrappedError, 'listScenes');
      throw wrappedError;
    }
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
        const response = await this.client!.request({
          method: 'POST',
          path: `/v1.0/homes/scene/${sceneId}/trigger`,
          body: {},
        });

        if (!response.success) {
          throw new CommandExecutionError(
            `Scene execution failed: ${response.msg || 'Unknown error'}`,
            {
              platform: this.platform,
              sceneId,
              response,
            }
          );
        }
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
   * Ensure adapter is initialized before operations.
   *
   * @throws {ConfigurationError} If adapter not initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new ConfigurationError('Tuya adapter not initialized', {
        platform: this.platform,
      });
    }
  }

  /**
   * Extract platform-specific device ID from universal ID or raw ID.
   *
   * @param deviceId Universal device ID or platform-specific ID
   * @returns Platform-specific device ID
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
   * Map Tuya Device to UnifiedDevice.
   *
   * @param device Tuya device object
   * @returns Unified device model
   */
  private mapDeviceToUnified(device: TuyaDevice): UnifiedDevice {
    const platformDeviceId = device.id;
    const capabilities = extractDeviceCapabilities(device);

    return {
      id: createUniversalDeviceId(this.platform, platformDeviceId),
      platform: this.platform,
      platformDeviceId,
      name: device.name ?? 'Unknown Device',
      label: device.name,
      manufacturer: undefined, // Tuya doesn't expose manufacturer in API
      model: device.product_name,
      room: undefined, // Will be resolved if room_id available
      location: device.home_id,
      capabilities,
      online: device.online ?? false,
      platformSpecific: {
        category: device.category,
        product_id: device.product_id,
        local_key: device.local_key,
        ip: device.ip,
        room_id: device.room_id,
      },
    };
  }

  /**
   * Map Tuya device status to unified device state.
   *
   * @param platformDeviceId Platform-specific device ID
   * @param dpArray Array of Tuya data points
   * @returns Unified device state
   */
  private mapStatusToState(platformDeviceId: string, dpArray: TuyaDataPoint[]): DeviceState {
    const attributes: Record<string, unknown> = {};

    for (const dp of dpArray) {
      const capability = mapDPToCapability(dp.code);
      if (capability) {
        // Normalize values for standard capabilities
        let value = dp.value;

        if (dp.code === 'bright_value' || dp.code.startsWith('bright_value_')) {
          // Normalize brightness to 0-100%
          value = normalizeBrightness(value as number);
        }

        attributes[`${capability}.${dp.code}`] = value;
      } else {
        // Store unmapped DPs with platform prefix
        attributes[`platform.${dp.code}`] = dp.value;
      }
    }

    return {
      deviceId: createUniversalDeviceId(this.platform, platformDeviceId),
      timestamp: new Date(),
      attributes,
      platformSpecific: {
        raw_status: dpArray,
      },
    };
  }

  /**
   * Map unified command to Tuya DP commands.
   *
   * @param command Unified device command
   * @returns Array of Tuya DP command objects
   */
  private mapCommandToDPs(
    command: DeviceCommand
  ): Array<{ code: string; value: unknown }> {
    const dpCommands: Array<{ code: string; value: unknown }> = [];

    // Get primary DP code for capability
    const primaryDP = mapCapabilityToDP(command.capability);
    if (!primaryDP) {
      throw new CapabilityNotSupportedError(
        `Capability ${command.capability} not supported on Tuya`,
        { capability: command.capability, platform: this.platform }
      );
    }

    // Map command to DP values
    switch (command.capability) {
      case DeviceCapability.SWITCH:
        // Switch on/off
        dpCommands.push({
          code: primaryDP,
          value: command.command === 'on',
        });
        break;

      case DeviceCapability.DIMMER:
        if (command.command === 'setLevel' && command.parameters?.level !== undefined) {
          // Set brightness level (denormalize from 0-100 to 0-1000)
          dpCommands.push({
            code: primaryDP,
            value: denormalizeBrightness(command.parameters.level as number),
          });
        }
        break;

      case DeviceCapability.COLOR:
        if (command.parameters?.color) {
          // Set color (HSV format expected)
          dpCommands.push({
            code: primaryDP,
            value: command.parameters.color,
          });
        }
        break;

      case DeviceCapability.COLOR_TEMPERATURE:
        if (command.parameters?.temperature !== undefined) {
          dpCommands.push({
            code: primaryDP,
            value: command.parameters.temperature,
          });
        }
        break;

      case DeviceCapability.SHADE:
        if (command.parameters?.position !== undefined) {
          // Set shade position (0-100%)
          dpCommands.push({
            code: primaryDP,
            value: command.parameters.position,
          });
        }
        break;

      case DeviceCapability.THERMOSTAT:
        if (command.parameters?.temperature !== undefined) {
          dpCommands.push({
            code: primaryDP,
            value: command.parameters.temperature,
          });
        }
        break;

      case DeviceCapability.FAN:
        if (command.parameters?.speed !== undefined) {
          dpCommands.push({
            code: primaryDP,
            value: command.parameters.speed,
          });
        }
        break;

      default:
        throw new CapabilityNotSupportedError(
          `Command ${command.command} not supported for capability ${command.capability}`,
          { capability: command.capability, command: command.command, platform: this.platform }
        );
    }

    return dpCommands;
  }

  /**
   * Apply filters to device list.
   *
   * @param devices Array of unified devices
   * @param filters Device filters to apply
   * @returns Filtered device array
   */
  private applyFilters(devices: UnifiedDevice[], filters: DeviceFilters): UnifiedDevice[] {
    return devices.filter((device) => {
      // Room filter
      if (filters.roomId && device.platformSpecific?.room_id !== filters.roomId) {
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

      // Name pattern filter
      if (filters.namePattern && !filters.namePattern.test(device.name)) {
        return false;
      }

      // Device type filter (category)
      if (
        filters.deviceType &&
        device.platformSpecific?.category !== filters.deviceType
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Wrap platform errors in standardized DeviceError types.
   *
   * @param error Original error
   * @param context Operation context
   * @param additionalContext Additional error context
   * @returns Wrapped DeviceError
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

    // Check for authentication errors
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('token')
    ) {
      return new AuthenticationError('Tuya authentication failed', errorContext);
    }

    // Check for device not found
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return new DeviceNotFoundError(
        (additionalContext?.['deviceId'] as string) ?? 'unknown',
        errorContext
      );
    }

    // Check for rate limiting
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return new RateLimitError('Tuya rate limit exceeded', undefined, errorContext);
    }

    // Check for network errors
    if (
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('network')
    ) {
      return new NetworkError(`Tuya network error: ${errorMessage}`, errorContext);
    }

    // Check for timeout
    if (errorMessage.includes('timeout')) {
      return new TimeoutError(`Tuya operation timed out: ${errorMessage}`, errorContext);
    }

    // Default to command execution error
    return new CommandExecutionError(`Tuya operation failed: ${errorMessage}`, errorContext);
  }

  /**
   * Emit adapter error event.
   *
   * @param error Error that occurred
   * @param context Error context
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
