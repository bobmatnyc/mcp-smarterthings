/**
 * SmartThings platform adapter implementing IDeviceAdapter interface.
 *
 * This adapter provides unified device control for SmartThings platform,
 * implementing the Layer 2 abstraction interface for device discovery,
 * command execution, and state management.
 *
 * Design Decision: Adapter Pattern
 * Rationale: Isolates SmartThings-specific SDK logic from unified interface,
 * enabling clean separation between platform integration and business logic.
 *
 * Performance:
 * - Reuses SmartThings SDK client with connection pooling
 * - Retry logic with exponential backoff for transient failures
 * - Room name caching to reduce API calls
 *
 * Error Handling:
 * - Wraps SDK errors in standardized DeviceError types
 * - Emits non-fatal errors via 'error' event
 * - Retries transient failures (network, rate limits)
 * - No retry on permanent failures (device not found, invalid command)
 *
 * @module platforms/smartthings/SmartThingsAdapter
 */

import { EventEmitter } from 'events';
import {
  SmartThingsClient,
  BearerTokenAuthenticator,
  type Device,
  type DeviceStatus as STDeviceStatus,
  type Rule,
} from '@smartthings/core-sdk';
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

/**
 * SmartThings adapter configuration.
 */
export interface SmartThingsAdapterConfig {
  /** Personal Access Token for SmartThings API */
  token: string;
}

/**
 * SmartThings platform adapter.
 *
 * Implements IDeviceAdapter interface for SmartThings device control.
 * Extends EventEmitter to provide real-time event notifications.
 */
export class SmartThingsAdapter extends EventEmitter implements IDeviceAdapter {
  // Adapter Metadata
  public readonly platform = 'smartthings' as Platform;
  public readonly platformName = 'SmartThings';
  public readonly version = '1.0.0';

  // Private state
  private client: SmartThingsClient | null = null;
  private initialized = false;
  private config: SmartThingsAdapterConfig;
  private roomNameCache = new Map<string, string>();
  private lastHealthCheck: Date | null = null;
  private errorCount = 0;

  constructor(config: SmartThingsAdapterConfig) {
    super();
    this.config = config;

    if (!config.token || config.token.trim().length === 0) {
      throw new ConfigurationError('SmartThings token is required', {
        platform: this.platform,
      });
    }
  }

  //
  // Lifecycle Management
  //

  /**
   * Initialize the adapter and establish platform connection.
   *
   * Responsibilities:
   * - Authenticate with SmartThings API
   * - Validate credentials via health check
   * - Initialize SDK client
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('SmartThings adapter already initialized');
      return;
    }

    logger.info('Initializing SmartThings adapter', { platform: this.platform });

    try {
      // Initialize SmartThings client with Bearer token authentication
      this.client = new SmartThingsClient(new BearerTokenAuthenticator(this.config.token));

      // Validate connection with a test API call
      await retryWithBackoff(async () => {
        await this.client!.locations.list();
      });

      this.initialized = true;
      this.errorCount = 0;
      this.lastHealthCheck = new Date();

      logger.info('SmartThings adapter initialized successfully', {
        platform: this.platform,
        version: this.version,
      });
    } catch (error) {
      const wrappedError = this.wrapError(error, 'initialize');
      logger.error('Failed to initialize SmartThings adapter', {
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
   *
   * Note: Method is async to satisfy IDeviceAdapter interface contract,
   * even though SmartThings SDK doesn't require async cleanup operations.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Disposing SmartThings adapter', { platform: this.platform });

    try {
      // Clear caches
      this.roomNameCache.clear();

      // Remove all event listeners
      this.removeAllListeners();

      // Mark as uninitialized
      this.client = null;
      this.initialized = false;

      logger.info('SmartThings adapter disposed', { platform: this.platform });
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
        await this.client!.locations.list();
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
      // Fetch all devices from SmartThings API
      const devices = await retryWithBackoff(async () => {
        return await this.client!.devices.list();
      });

      // Build room name cache
      await this.buildRoomNameCache(devices);

      // Convert to unified device model
      let unifiedDevices = devices.map((device) => this.mapDeviceToUnified(device));

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
      const device = await retryWithBackoff(async () => {
        return await this.client!.devices.get(platformDeviceId);
      });

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
      const status = await retryWithBackoff(async () => {
        return await this.client!.devices.getStatus(platformDeviceId);
      });

      const deviceState = this.mapStatusToState(platformDeviceId, status);

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
    // SmartThings always provides fresh state, so this is identical to getDeviceState
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
      const device = await retryWithBackoff(async () => {
        return await this.client!.devices.get(platformDeviceId);
      });

      const capabilities = this.extractDeviceCapabilities(device);

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
      // Map unified capability to SmartThings capability
      const stCapability = this.mapUnifiedCapability(command.capability);
      if (!stCapability) {
        throw new CapabilityNotSupportedError(
          `Capability ${command.capability} not supported on SmartThings`,
          { capability: command.capability, platform: this.platform }
        );
      }

      // Extract component from options (default to 'main')
      const component = options?.component ?? 'main';

      // Convert parameters to array format for SmartThings SDK
      const args = command.parameters ? Object.values(command.parameters) : undefined;

      // Execute command with retry logic
      await retryWithBackoff(async () => {
        await this.client!.devices.executeCommand(platformDeviceId, {
          capability: stCapability,
          command: command.command,
          arguments: args as (string | number | object)[] | undefined,
          component,
        });
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
   * @param platformCapability SmartThings capability identifier
   * @returns Unified capability enum or null
   */
  mapPlatformCapability(platformCapability: string): DeviceCapability | null {
    const mapping: Record<string, DeviceCapability> = {
      // Control capabilities
      switch: DeviceCapability.SWITCH,
      switchLevel: DeviceCapability.DIMMER,
      colorControl: DeviceCapability.COLOR,
      colorTemperature: DeviceCapability.COLOR_TEMPERATURE,
      thermostat: DeviceCapability.THERMOSTAT,
      lock: DeviceCapability.LOCK,
      windowShade: DeviceCapability.SHADE,
      fanSpeed: DeviceCapability.FAN,
      valve: DeviceCapability.VALVE,
      alarm: DeviceCapability.ALARM,
      garageDoorControl: DeviceCapability.DOOR_CONTROL,
      doorControl: DeviceCapability.DOOR_CONTROL,

      // Sensor capabilities
      temperatureMeasurement: DeviceCapability.TEMPERATURE_SENSOR,
      relativeHumidityMeasurement: DeviceCapability.HUMIDITY_SENSOR,
      motionSensor: DeviceCapability.MOTION_SENSOR,
      contactSensor: DeviceCapability.CONTACT_SENSOR,
      occupancySensor: DeviceCapability.OCCUPANCY_SENSOR,
      illuminanceMeasurement: DeviceCapability.ILLUMINANCE_SENSOR,
      battery: DeviceCapability.BATTERY,
      airQualitySensor: DeviceCapability.AIR_QUALITY_SENSOR,
      waterSensor: DeviceCapability.WATER_LEAK_SENSOR,
      smokeDetector: DeviceCapability.SMOKE_DETECTOR,
      button: DeviceCapability.BUTTON,
      pressureMeasurement: DeviceCapability.PRESSURE_SENSOR,
      carbonMonoxideDetector: DeviceCapability.CO_DETECTOR,
      soundSensor: DeviceCapability.SOUND_SENSOR,

      // Composite capabilities
      powerMeter: DeviceCapability.ENERGY_METER,
      energyMeter: DeviceCapability.ENERGY_METER,
      audioVolume: DeviceCapability.SPEAKER,
      mediaPlayback: DeviceCapability.MEDIA_PLAYER,
      videoCamera: DeviceCapability.CAMERA,
      robotCleanerMovement: DeviceCapability.ROBOT_VACUUM,
      infraredLevel: DeviceCapability.IR_BLASTER,
    };

    return mapping[platformCapability] ?? null;
  }

  /**
   * Map unified capability to platform-specific capability.
   *
   * @param unifiedCapability Unified capability enum
   * @returns SmartThings capability identifier or null
   */
  mapUnifiedCapability(unifiedCapability: DeviceCapability): string | null {
    const mapping: Record<DeviceCapability, string> = {
      // Control capabilities
      [DeviceCapability.SWITCH]: 'switch',
      [DeviceCapability.DIMMER]: 'switchLevel',
      [DeviceCapability.COLOR]: 'colorControl',
      [DeviceCapability.COLOR_TEMPERATURE]: 'colorTemperature',
      [DeviceCapability.THERMOSTAT]: 'thermostat',
      [DeviceCapability.LOCK]: 'lock',
      [DeviceCapability.SHADE]: 'windowShade',
      [DeviceCapability.FAN]: 'fanSpeed',
      [DeviceCapability.VALVE]: 'valve',
      [DeviceCapability.ALARM]: 'alarm',
      [DeviceCapability.DOOR_CONTROL]: 'garageDoorControl',

      // Sensor capabilities
      [DeviceCapability.TEMPERATURE_SENSOR]: 'temperatureMeasurement',
      [DeviceCapability.HUMIDITY_SENSOR]: 'relativeHumidityMeasurement',
      [DeviceCapability.MOTION_SENSOR]: 'motionSensor',
      [DeviceCapability.CONTACT_SENSOR]: 'contactSensor',
      [DeviceCapability.OCCUPANCY_SENSOR]: 'occupancySensor',
      [DeviceCapability.ILLUMINANCE_SENSOR]: 'illuminanceMeasurement',
      [DeviceCapability.BATTERY]: 'battery',
      [DeviceCapability.AIR_QUALITY_SENSOR]: 'airQualitySensor',
      [DeviceCapability.WATER_LEAK_SENSOR]: 'waterSensor',
      [DeviceCapability.SMOKE_DETECTOR]: 'smokeDetector',
      [DeviceCapability.BUTTON]: 'button',
      [DeviceCapability.PRESSURE_SENSOR]: 'pressureMeasurement',
      [DeviceCapability.CO_DETECTOR]: 'carbonMonoxideDetector',
      [DeviceCapability.SOUND_SENSOR]: 'soundSensor',

      // Composite capabilities
      [DeviceCapability.ENERGY_METER]: 'powerMeter',
      [DeviceCapability.SPEAKER]: 'audioVolume',
      [DeviceCapability.MEDIA_PLAYER]: 'mediaPlayback',
      [DeviceCapability.CAMERA]: 'videoCamera',
      [DeviceCapability.ROBOT_VACUUM]: 'robotCleanerMovement',
      [DeviceCapability.IR_BLASTER]: 'infraredLevel',
    };

    return mapping[unifiedCapability] ?? null;
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
      const locations = await retryWithBackoff(async () => {
        return await this.client!.locations.list();
      });

      const locationInfos: LocationInfo[] = locations.map((location) => ({
        locationId: location.locationId as LocationId | string,
        name: location.name ?? 'Unknown Location',
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
      let rooms: Array<{ roomId?: string; name?: string; locationId?: string }> = [];

      if (locationId) {
        // Fetch rooms for specific location
        rooms = await retryWithBackoff(async () => {
          return await this.client!.rooms.list(locationId);
        });
      } else {
        // Fetch all locations and their rooms
        const locations = await this.listLocations();
        for (const location of locations) {
          const locationRooms = await retryWithBackoff(async () => {
            return await this.client!.rooms.list(location.locationId as string);
          });
          rooms.push(...locationRooms);
        }
      }

      // Get device counts for each room
      const devices = await this.listDevices();
      const deviceCountByRoom = new Map<string, number>();

      for (const device of devices) {
        if (device.room) {
          deviceCountByRoom.set(device.room, (deviceCountByRoom.get(device.room) ?? 0) + 1);
        }
      }

      const roomInfos: RoomInfo[] = rooms
        .filter((room) => room.roomId && room.name && room.locationId)
        .map((room) => ({
          roomId: room.roomId as RoomId | string,
          name: room.name as string,
          locationId: room.locationId as LocationId | string,
          deviceCount: deviceCountByRoom.get(room.roomId as string) ?? 0,
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
   * @returns True (SmartThings supports scenes)
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
      const options = locationId ? { locationId: [locationId] } : undefined;

      const scenes = await retryWithBackoff(async () => {
        return await this.client!.scenes.list(options);
      });

      const sceneInfos: SceneInfo[] = scenes.map((scene) => ({
        sceneId: scene.sceneId as SceneId | string,
        name: scene.sceneName ?? 'Unnamed Scene',
        description: undefined,
        locationId: scene.locationId as LocationId | string | undefined,
        createdAt: scene.createdDate ? new Date(scene.createdDate) : undefined,
        lastExecutedAt: scene.lastExecutedDate ? new Date(scene.lastExecutedDate) : undefined,
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
        await this.client!.scenes.execute(sceneId);
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
  // Rules API (Automation Operations)
  //

  /**
   * List all rules for a location.
   *
   * Rules represent automations created via SmartThings API or app.
   * Required for automation identification in diagnostic workflows.
   *
   * @param locationId Location UUID (required by SmartThings Rules API)
   * @returns Array of rules for the location
   */
  async listRules(locationId: string): Promise<Rule[]> {
    this.ensureInitialized();

    logger.debug('Listing rules', { platform: this.platform, locationId });

    try {
      const rules = await retryWithBackoff(async () => {
        return await this.client!.rules.list(locationId);
      });

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      // Handle undefined/null response from API (defensive)
      const ruleArray = rules || [];

      logger.info('Rules listed successfully', {
        platform: this.platform,
        count: ruleArray.length,
        locationId,
      });

      return ruleArray;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'listRules', { locationId });
      this.errorCount++;
      this.emitError(wrappedError, 'listRules');
      throw wrappedError;
    }
  }

  /**
   * Get specific rule details.
   *
   * @param ruleId Rule UUID
   * @param locationId Location UUID (required by SmartThings Rules API)
   * @returns Rule details
   */
  async getRule(ruleId: string, locationId: string): Promise<Rule> {
    this.ensureInitialized();

    logger.debug('Getting rule', { platform: this.platform, ruleId, locationId });

    try {
      const rule = await retryWithBackoff(async () => {
        return await this.client!.rules.get(ruleId, locationId);
      });

      this.lastHealthCheck = new Date();
      this.errorCount = 0;

      logger.info('Rule retrieved successfully', {
        platform: this.platform,
        ruleId,
        locationId,
      });

      return rule;
    } catch (error) {
      const wrappedError = this.wrapError(error, 'getRule', { ruleId, locationId });
      this.errorCount++;
      this.emitError(wrappedError, 'getRule');
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
      throw new ConfigurationError('SmartThings adapter not initialized', {
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
   * Map SmartThings Device to UnifiedDevice.
   *
   * @param device SmartThings device object
   * @returns Unified device model
   */
  private mapDeviceToUnified(device: Device): UnifiedDevice {
    const platformDeviceId = device.deviceId;
    const capabilities = this.extractDeviceCapabilities(device);

    // Get room name from cache
    const roomName = device.roomId ? this.roomNameCache.get(device.roomId) : undefined;

    return {
      id: createUniversalDeviceId(this.platform, platformDeviceId),
      platform: this.platform,
      platformDeviceId,
      name: device.label ?? device.name ?? 'Unknown Device',
      label: device.label,
      manufacturer: device.deviceManufacturerCode,
      model: device.type,
      room: roomName,
      location: device.locationId,
      capabilities,
      online: true, // SmartThings doesn't provide explicit online status in list
      platformSpecific: {
        type: device.type,
        components: device.components?.map((c) => c.id),
      },
    };
  }

  /**
   * Extract unified capabilities from SmartThings device.
   *
   * @param device SmartThings device object
   * @returns Array of unified capabilities
   */
  private extractDeviceCapabilities(device: Device): DeviceCapability[] {
    const capabilities = new Set<DeviceCapability>();

    // Extract capabilities from all components
    for (const component of device.components || []) {
      for (const cap of component.capabilities || []) {
        const unifiedCap = this.mapPlatformCapability(cap.id);
        if (unifiedCap) {
          capabilities.add(unifiedCap);
        } else {
          logger.debug('Unmapped SmartThings capability', {
            capability: cap.id,
            deviceId: device.deviceId,
          });
        }
      }
    }

    return Array.from(capabilities);
  }

  /**
   * Map SmartThings device status to unified device state.
   *
   * @param platformDeviceId Platform-specific device ID
   * @param status SmartThings device status
   * @returns Unified device state
   */
  private mapStatusToState(platformDeviceId: string, status: STDeviceStatus): DeviceState {
    const attributes: Record<string, unknown> = {};

    // Extract attributes from all components
    for (const [, component] of Object.entries(status.components || {})) {
      for (const [capabilityId, capability] of Object.entries(component)) {
        // Map to unified capability
        const unifiedCap = this.mapPlatformCapability(capabilityId);
        if (!unifiedCap) {
          continue;
        }

        // Extract all attributes for this capability
        for (const [attrName, attrValue] of Object.entries(capability)) {
          const key = `${unifiedCap}.${attrName}`;
          attributes[key] = (attrValue as { value: unknown }).value;
        }
      }
    }

    return {
      deviceId: createUniversalDeviceId(this.platform, platformDeviceId),
      timestamp: new Date(),
      attributes,
      platformSpecific: {
        components: status.components,
      },
    };
  }

  /**
   * Build room name cache from devices.
   *
   * @param devices Array of SmartThings devices
   */
  private async buildRoomNameCache(devices: Device[]): Promise<void> {
    const roomIds = Array.from(new Set(devices.map((d) => d.roomId).filter(Boolean)));

    for (const roomId of roomIds) {
      if (!this.roomNameCache.has(roomId as string)) {
        try {
          const room = await retryWithBackoff(async () => {
            return await this.client!.rooms.get(roomId as string);
          });
          if (room.roomId) {
            this.roomNameCache.set(room.roomId, room.name ?? 'Unknown Room');
          }
        } catch (error) {
          logger.warn('Failed to fetch room name', {
            roomId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
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
      if (filters.roomId && device.room !== filters.roomId) {
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
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
      return new AuthenticationError('SmartThings authentication failed', errorContext);
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
      return new RateLimitError('SmartThings rate limit exceeded', undefined, errorContext);
    }

    // Check for network errors
    if (
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('network')
    ) {
      return new NetworkError(`SmartThings network error: ${errorMessage}`, errorContext);
    }

    // Check for timeout
    if (errorMessage.includes('timeout')) {
      return new TimeoutError(`SmartThings operation timed out: ${errorMessage}`, errorContext);
    }

    // Default to command execution error
    return new CommandExecutionError(`SmartThings operation failed: ${errorMessage}`, errorContext);
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
