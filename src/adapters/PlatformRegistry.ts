/**
 * Platform Registry - Central adapter orchestrator.
 *
 * The PlatformRegistry manages multiple platform adapters and provides
 * a unified interface for device operations across all platforms.
 *
 * Key Responsibilities:
 * 1. Adapter lifecycle: Register, initialize, dispose
 * 2. Request routing: Determine which adapter handles each device
 * 3. Unified operations: List devices, execute commands across platforms
 * 4. Error handling: Graceful degradation when adapters fail
 * 5. Event propagation: Forward adapter events to listeners
 * 6. Health monitoring: Track adapter health and status
 *
 * Design Patterns:
 * - Registry Pattern: Central registration point for adapters
 * - Router Pattern: Routes operations to appropriate adapter
 * - Event Aggregator: Collects and propagates events from all adapters
 * - Graceful Degradation: Continues operating if some adapters fail
 *
 * Thread Safety:
 * - JavaScript is single-threaded, but async operations need coordination
 * - Write operations (register/unregister) are serialized
 * - Read operations are lock-free and concurrent
 * - Device routing cache is updated atomically
 *
 * @module adapters/PlatformRegistry
 */

import { EventEmitter } from 'events';
import type {
  IDeviceAdapter,
  AdapterHealthStatus,
  DeviceFilters,
  StateChangeEvent as AdapterStateChangeEvent,
  DeviceAddedEvent as AdapterDeviceAddedEvent,
  DeviceRemovedEvent as AdapterDeviceRemovedEvent,
} from './base/IDeviceAdapter.js';
import type {
  Platform,
  UniversalDeviceId,
  UnifiedDevice,
} from '../types/unified-device.js';
import {
  parseUniversalDeviceId,
  isUniversalDeviceId,
} from '../types/unified-device.js';
import type { DeviceCommand, CommandResult, CommandExecutionOptions } from '../types/commands.js';
import type { DeviceState } from '../types/device-state.js';
import type {
  DeviceFilter,
  RegistryHealthStatus,
  RegistryConfig,
  AdapterRegisteredEvent,
  AdapterUnregisteredEvent,
  RegistryErrorEvent,
} from '../types/registry.js';
import {
  DeviceNotFoundError,
  ConfigurationError,
} from '../types/errors.js';

/**
 * Platform Registry implementation.
 *
 * Manages multiple platform adapters and provides unified device access.
 *
 * @example
 * ```typescript
 * // Create registry
 * const registry = new PlatformRegistry();
 *
 * // Register adapters
 * await registry.registerAdapter(Platform.SMARTTHINGS, smartThingsAdapter);
 * await registry.registerAdapter(Platform.TUYA, tuyaAdapter);
 *
 * // List all devices across platforms
 * const devices = await registry.listAllDevices();
 *
 * // Execute command (routes to correct adapter)
 * const result = await registry.executeCommand(
 *   'smartthings:abc-123' as UniversalDeviceId,
 *   { capability: DeviceCapability.SWITCH, command: 'on' }
 * );
 *
 * // Listen for state changes from all platforms
 * registry.on('stateChange', (event) => {
 *   console.log('Device state changed:', event.device.id);
 * });
 *
 * // Cleanup
 * await registry.disposeAll();
 * ```
 */
export class PlatformRegistry extends EventEmitter {
  /**
   * Registered adapters keyed by platform.
   *
   * Thread Safety: Map is safe for concurrent reads.
   * Writes are serialized via registerAdapter/unregisterAdapter.
   */
  private readonly adapters: Map<Platform, IDeviceAdapter> = new Map();

  /**
   * Device-to-platform routing cache.
   *
   * Caches platform lookups for faster routing.
   * Updated on device add/remove events.
   *
   * Thread Safety: Map is safe for concurrent reads.
   * Writes are atomic (single Map.set/delete operations).
   */
  private readonly devicePlatformCache: Map<UniversalDeviceId, Platform> = new Map();

  /**
   * Registry configuration.
   */
  private readonly config: Required<RegistryConfig>;

  /**
   * Registration lock for serializing adapter registration.
   *
   * JavaScript is single-threaded but async operations can interleave.
   * This ensures only one registration/unregistration at a time.
   */
  private registrationInProgress = false;

  /**
   * Create a new PlatformRegistry.
   *
   * @param config Optional configuration overrides
   */
  constructor(config?: RegistryConfig) {
    super();

    // Apply defaults to configuration
    this.config = {
      enableCaching: config?.enableCaching ?? true,
      propagateEvents: config?.propagateEvents ?? true,
      gracefulDegradation: config?.gracefulDegradation ?? true,
      maxConcurrency: config?.maxConcurrency ?? 10,
    };
  }

  //
  // Adapter Registration
  //

  /**
   * Register a platform adapter.
   *
   * Validates adapter, initializes it, and registers for events.
   *
   * Thread Safety: Serialized via registrationInProgress flag.
   * Only one registration can occur at a time.
   *
   * @param platform Platform identifier
   * @param adapter Adapter instance implementing IDeviceAdapter
   * @throws {ConfigurationError} If adapter already registered
   * @throws {ConfigurationError} If adapter invalid
   * @throws {DeviceError} If adapter initialization fails
   */
  async registerAdapter(platform: Platform, adapter: IDeviceAdapter): Promise<void> {
    // Serialize registration
    if (this.registrationInProgress) {
      throw new ConfigurationError(
        'Another adapter registration is in progress. Please wait.',
        { platform }
      );
    }

    this.registrationInProgress = true;

    try {
      // Validate not already registered
      if (this.adapters.has(platform)) {
        throw new ConfigurationError(
          `Adapter for platform ${platform} is already registered`,
          { platform }
        );
      }

      // Validate adapter implements required interface
      if (!this.isValidAdapter(adapter)) {
        throw new ConfigurationError(
          `Invalid adapter: must implement IDeviceAdapter interface`,
          { platform, adapterType: typeof adapter }
        );
      }

      // Validate adapter platform matches
      if (adapter.platform !== platform) {
        throw new ConfigurationError(
          `Adapter platform mismatch: expected ${platform}, got ${adapter.platform}`,
          { expectedPlatform: platform, actualPlatform: adapter.platform }
        );
      }

      // Initialize adapter
      await adapter.initialize();

      // Register adapter
      this.adapters.set(platform, adapter);

      // Attach event listeners
      if (this.config.propagateEvents) {
        this.attachAdapterEvents(platform, adapter);
      }

      // Emit registration event
      this.emit('adapterRegistered', {
        platform,
        timestamp: new Date(),
        metadata: {
          platformName: adapter.platformName,
          version: adapter.version,
        },
      } as AdapterRegisteredEvent);
    } finally {
      this.registrationInProgress = false;
    }
  }

  /**
   * Unregister a platform adapter.
   *
   * Disposes adapter and removes from registry.
   *
   * Thread Safety: Serialized via registrationInProgress flag.
   *
   * @param platform Platform to unregister
   * @param reason Optional reason for unregistration
   * @throws {DeviceNotFoundError} If platform not registered
   */
  async unregisterAdapter(platform: Platform, reason?: string): Promise<void> {
    // Serialize unregistration
    if (this.registrationInProgress) {
      throw new ConfigurationError(
        'Another adapter operation is in progress. Please wait.',
        { platform }
      );
    }

    this.registrationInProgress = true;

    try {
      const adapter = this.adapters.get(platform);
      if (!adapter) {
        throw new DeviceNotFoundError(`Platform ${platform} not registered`, {
          platform,
        });
      }

      // Remove event listeners
      if (this.config.propagateEvents) {
        this.detachAdapterEvents(adapter);
      }

      // Dispose adapter
      await adapter.dispose();

      // Remove from registry
      this.adapters.delete(platform);

      // Clear cached devices for this platform
      this.clearPlatformCache(platform);

      // Emit unregistration event
      this.emit('adapterUnregistered', {
        platform,
        timestamp: new Date(),
        reason,
      } as AdapterUnregisteredEvent);
    } finally {
      this.registrationInProgress = false;
    }
  }

  //
  // Adapter Access
  //

  /**
   * Get adapter for a specific platform.
   *
   * Thread Safety: Safe for concurrent reads.
   *
   * @param platform Platform identifier
   * @returns Adapter instance or undefined if not registered
   */
  getAdapter(platform: Platform): IDeviceAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * Check if adapter is registered for platform.
   *
   * @param platform Platform identifier
   * @returns True if adapter registered
   */
  hasAdapter(platform: Platform): boolean {
    return this.adapters.has(platform);
  }

  /**
   * List all registered platforms.
   *
   * @returns Array of registered platform identifiers
   */
  listAdapters(): Platform[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get adapter count.
   *
   * @returns Number of registered adapters
   */
  getAdapterCount(): number {
    return this.adapters.size;
  }

  //
  // Device Routing
  //

  /**
   * Get adapter for a specific device.
   *
   * Routes device operations to the correct platform adapter.
   *
   * Uses caching for performance:
   * 1. Check cache first (O(1))
   * 2. Parse device ID if cache miss
   * 3. Update cache for future lookups
   *
   * @param deviceId Universal device ID
   * @returns Adapter instance for device's platform
   * @throws {DeviceNotFoundError} If platform not registered
   * @throws {Error} If device ID invalid
   */
  getAdapterForDevice(deviceId: UniversalDeviceId): IDeviceAdapter {
    // Check cache first
    if (this.config.enableCaching) {
      const cachedPlatform = this.devicePlatformCache.get(deviceId);
      if (cachedPlatform) {
        const adapter = this.adapters.get(cachedPlatform);
        if (adapter) {
          return adapter;
        }
        // Cache stale, remove it
        this.devicePlatformCache.delete(deviceId);
      }
    }

    // Parse device ID to determine platform
    const { platform } = parseUniversalDeviceId(deviceId);

    // Get adapter for platform
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new DeviceNotFoundError(deviceId, {
        platform,
        reason: `No adapter registered for platform ${platform}`,
      });
    }

    // Cache for future lookups
    if (this.config.enableCaching) {
      this.devicePlatformCache.set(deviceId, platform);
    }

    return adapter;
  }

  //
  // Unified Device Operations
  //

  /**
   * List all devices across all registered platforms.
   *
   * Aggregates devices from all adapters, handling failures gracefully.
   *
   * Error Handling:
   * - gracefulDegradation: true → Continue with remaining adapters
   * - gracefulDegradation: false → Throw on first failure
   *
   * @param filter Optional device filters
   * @returns Array of devices from all platforms
   * @throws {DeviceError} If gracefulDegradation disabled and adapter fails
   */
  async listAllDevices(filter?: DeviceFilter): Promise<UnifiedDevice[]> {
    const allDevices: UnifiedDevice[] = [];
    const errors: Array<{ platform: Platform; error: Error }> = [];

    // Build adapter filters from registry filter
    const adapterFilters: DeviceFilters = {
      roomId: filter?.roomId,
      capability: filter?.capability,
      online: filter?.online,
      namePattern: filter?.namePattern,
    };

    // Filter adapters by platform if specified
    const adaptersToQuery = filter?.platform
      ? [[filter.platform, this.adapters.get(filter.platform)] as const]
      : Array.from(this.adapters.entries());

    // Fetch from all (or filtered) adapters
    const promises = adaptersToQuery
      .filter((entry): entry is readonly [Platform, IDeviceAdapter] => entry[1] !== undefined)
      .map(async ([platform, adapter]) => {
        try {
          const devices = await adapter.listDevices(adapterFilters);
          allDevices.push(...devices);
        } catch (error) {
          errors.push({ platform, error: error as Error });

          // Emit error event
          this.emitError(error as Error, 'listDevices', platform);

          // Rethrow if not graceful
          if (!this.config.gracefulDegradation) {
            throw error;
          }
        }
      });

    await Promise.all(promises);

    // Log warnings for failures (graceful mode)
    if (errors.length > 0 && this.config.gracefulDegradation) {
      console.warn(
        `Some adapters failed to list devices (${errors.length}/${adaptersToQuery.length}):`,
        errors.map((e) => `${e.platform}: ${e.error.message}`)
      );
    }

    return allDevices;
  }

  /**
   * Get device by universal ID.
   *
   * Routes to appropriate adapter based on device ID.
   *
   * @param deviceId Universal device ID
   * @returns Device information
   * @throws {DeviceNotFoundError} If device not found or platform not registered
   * @throws {DeviceError} If retrieval fails
   */
  async getDevice(deviceId: UniversalDeviceId): Promise<UnifiedDevice> {
    const adapter = this.getAdapterForDevice(deviceId);
    return adapter.getDevice(deviceId);
  }

  /**
   * Execute command on device.
   *
   * Routes to appropriate adapter based on device ID.
   *
   * @param deviceId Universal device ID
   * @param command Command to execute
   * @param options Execution options
   * @returns Command execution result
   * @throws {DeviceNotFoundError} If device not found or platform not registered
   * @throws {DeviceError} If command execution fails
   */
  async executeCommand(
    deviceId: UniversalDeviceId,
    command: DeviceCommand,
    options?: CommandExecutionOptions
  ): Promise<CommandResult> {
    const adapter = this.getAdapterForDevice(deviceId);
    return adapter.executeCommand(deviceId, command, options);
  }

  /**
   * Get device state.
   *
   * Routes to appropriate adapter based on device ID.
   *
   * @param deviceId Universal device ID
   * @returns Current device state
   * @throws {DeviceNotFoundError} If device not found or platform not registered
   * @throws {DeviceError} If state retrieval fails
   */
  async getDeviceState(deviceId: UniversalDeviceId): Promise<DeviceState> {
    const adapter = this.getAdapterForDevice(deviceId);
    return adapter.getDeviceState(deviceId);
  }

  //
  // Lifecycle Management
  //

  /**
   * Initialize all registered adapters.
   *
   * Useful for batch initialization after registration.
   * Note: Individual adapters are initialized during registration,
   * so this is primarily for re-initialization scenarios.
   *
   * @throws {DeviceError} If any adapter initialization fails
   */
  async initializeAll(): Promise<void> {
    const errors: Array<{ platform: Platform; error: Error }> = [];

    const promises = Array.from(this.adapters.entries()).map(
      async ([platform, adapter]) => {
        try {
          if (!adapter.isInitialized()) {
            await adapter.initialize();
          }
        } catch (error) {
          errors.push({ platform, error: error as Error });
          this.emitError(error as Error, 'initialize', platform);

          if (!this.config.gracefulDegradation) {
            throw error;
          }
        }
      }
    );

    await Promise.all(promises);

    if (errors.length > 0) {
      console.warn(
        `Some adapters failed to initialize (${errors.length}/${this.adapters.size}):`,
        errors.map((e) => `${e.platform}: ${e.error.message}`)
      );
    }
  }

  /**
   * Dispose all registered adapters.
   *
   * Cleans up resources and closes connections.
   * Should be called during shutdown.
   */
  async disposeAll(): Promise<void> {
    const platforms = Array.from(this.adapters.keys());

    // Dispose in reverse order of registration
    for (const platform of platforms.reverse()) {
      try {
        await this.unregisterAdapter(platform, 'Registry disposal');
      } catch (error) {
        // Log but continue disposing others
        console.error(`Failed to dispose adapter ${platform}:`, error);
      }
    }

    // Clear cache
    this.devicePlatformCache.clear();

    // Remove all listeners
    this.removeAllListeners();
  }

  //
  // Health Monitoring
  //

  /**
   * Perform health check across all adapters.
   *
   * Aggregates health status from all registered adapters.
   *
   * @returns Registry health status with per-adapter details
   */
  async healthCheck(): Promise<RegistryHealthStatus> {
    const adapterHealth: Map<Platform, AdapterHealthStatus> = new Map();
    const errors: string[] = [];

    // Check each adapter
    for (const [platform, adapter] of this.adapters) {
      try {
        const health = await adapter.healthCheck();
        adapterHealth.set(platform, health);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${platform}: ${errorMsg}`);

        // Create unhealthy status for failed check
        adapterHealth.set(platform, {
          healthy: false,
          platform,
          apiReachable: false,
          authenticated: false,
          errorCount: 1,
          message: `Health check failed: ${errorMsg}`,
        });
      }
    }

    // Calculate aggregate health
    const healthyCount = Array.from(adapterHealth.values()).filter(
      (h) => h.healthy
    ).length;
    const totalCount = adapterHealth.size;

    return {
      healthy: healthyCount > 0, // Healthy if at least one adapter works
      adapterCount: totalCount,
      healthyAdapterCount: healthyCount,
      adapters: adapterHealth,
      lastCheck: new Date(),
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  //
  // Private Helper Methods
  //

  /**
   * Validate adapter implements IDeviceAdapter interface.
   *
   * Checks for presence of required methods.
   *
   * @param adapter Adapter to validate
   * @returns True if adapter is valid
   */
  private isValidAdapter(adapter: unknown): adapter is IDeviceAdapter {
    if (typeof adapter !== 'object' || adapter === null) {
      return false;
    }

    const required = [
      'initialize',
      'dispose',
      'isInitialized',
      'healthCheck',
      'listDevices',
      'getDevice',
      'getDeviceState',
      'refreshDeviceState',
      'getDeviceCapabilities',
      'executeCommand',
      'executeBatchCommands',
      'mapPlatformCapability',
      'mapUnifiedCapability',
      'listLocations',
      'listRooms',
      'supportsScenes',
      'on',
      'emit',
    ];

    return required.every(
      (method) =>
        method in adapter &&
        typeof (adapter as Record<string, unknown>)[method] === 'function'
    );
  }

  /**
   * Attach event listeners to adapter.
   *
   * Forwards adapter events to registry listeners.
   *
   * @param platform Platform identifier
   * @param adapter Adapter instance
   */
  private attachAdapterEvents(platform: Platform, adapter: IDeviceAdapter): void {
    // State change events
    adapter.on('stateChange', (event: AdapterStateChangeEvent) => {
      // Cache device platform
      if (this.config.enableCaching && isUniversalDeviceId(event.device.id)) {
        this.devicePlatformCache.set(event.device.id, platform);
      }

      // Propagate to registry listeners
      this.emit('stateChange', event);
    });

    // Device added events
    adapter.on('deviceAdded', (event: AdapterDeviceAddedEvent) => {
      // Cache device platform
      if (this.config.enableCaching && isUniversalDeviceId(event.device.id)) {
        this.devicePlatformCache.set(event.device.id, platform);
      }

      // Propagate to registry listeners
      this.emit('deviceAdded', event);
    });

    // Device removed events
    adapter.on('deviceRemoved', (event: AdapterDeviceRemovedEvent) => {
      // Clear from cache
      if (this.config.enableCaching && isUniversalDeviceId(event.deviceId)) {
        this.devicePlatformCache.delete(event.deviceId as UniversalDeviceId);
      }

      // Propagate to registry listeners
      this.emit('deviceRemoved', event);
    });

    // Adapter error events
    adapter.on('error', (...args: unknown[]) => {
      const error = args[0] as Error;
      this.emitError(error, 'adapter', platform);
    });
  }

  /**
   * Detach event listeners from adapter.
   *
   * @param adapter Adapter instance
   */
  private detachAdapterEvents(adapter: IDeviceAdapter): void {
    adapter.removeAllListeners('stateChange');
    adapter.removeAllListeners('deviceAdded');
    adapter.removeAllListeners('deviceRemoved');
    adapter.removeAllListeners('error');
  }

  /**
   * Clear cached devices for a platform.
   *
   * @param platform Platform to clear
   */
  private clearPlatformCache(platform: Platform): void {
    if (!this.config.enableCaching) {
      return;
    }

    // Remove all cached devices for this platform
    for (const [deviceId, cachedPlatform] of this.devicePlatformCache) {
      if (cachedPlatform === platform) {
        this.devicePlatformCache.delete(deviceId);
      }
    }
  }

  /**
   * Emit registry error event.
   *
   * @param error Error that occurred
   * @param context Context where error occurred
   * @param platform Optional platform where error occurred
   */
  private emitError(error: Error, context: string, platform?: Platform): void {
    this.emit('error', {
      error,
      context,
      platform,
      timestamp: new Date(),
    } as RegistryErrorEvent);
  }
}
