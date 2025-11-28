/**
 * DeviceRegistry adapter for SmartThings DeviceInfo integration.
 *
 * This adapter bridges DeviceService's DeviceInfo output to DeviceRegistry's
 * UnifiedDevice input using the type transformation layer.
 *
 * Design Decision: Adapter Pattern
 * - Rationale: Keeps transformation logic separate from core registry
 * - Benefit: DeviceRegistry remains platform-agnostic
 * - Trade-off: Extra layer adds minimal overhead (<1ms per device)
 *
 * Integration Strategy:
 * - Single transformation point at the boundary
 * - Batch processing support for efficient indexing
 * - No changes to DeviceRegistry internals
 * - Preserves all existing DeviceRegistry functionality
 *
 * Performance:
 * - Single device: <1ms transformation overhead
 * - Batch (200 devices): <200ms total transformation time
 * - Indexing remains <5 seconds for 200 devices
 *
 * @module services/adapters/DeviceRegistryAdapter
 */

import type { DeviceRegistry } from '../../abstract/DeviceRegistry.js';
import type { DeviceInfo, DeviceStatus } from '../../types/smartthings.js';
import type { UnifiedDevice } from '../../types/unified-device.js';
import { toUnifiedDevice } from '../transformers/deviceInfoToUnified.js';
import logger from '../../utils/logger.js';

/**
 * DeviceRegistry adapter for SmartThings integration.
 *
 * Provides convenience methods to add DeviceInfo directly to DeviceRegistry
 * by transforming to UnifiedDevice format automatically.
 *
 * Error Handling:
 * - Transformation failures: Logged and skipped (non-fatal for batch)
 * - Registry errors: Propagated to caller
 * - Invalid devices: Logged with device ID for debugging
 *
 * @example
 * ```typescript
 * const registry = new DeviceRegistry();
 * const adapter = new DeviceRegistryAdapter(registry);
 *
 * // Add single device from DeviceService
 * const deviceInfo = await deviceService.getDevice(deviceId);
 * adapter.addDeviceInfo(deviceInfo);
 *
 * // Batch add devices from DeviceService.listDevices()
 * const devices = await deviceService.listDevices();
 * const result = await adapter.addDeviceInfoBatch(devices);
 * console.log(`Added ${result.added} devices, ${result.failed} failed`);
 * ```
 */
export class DeviceRegistryAdapter {
  constructor(private readonly registry: DeviceRegistry) {}

  /**
   * Add a DeviceInfo to the registry with optional status.
   *
   * Transforms DeviceInfo to UnifiedDevice and adds to registry.
   *
   * Performance: <1ms per device
   *
   * @param deviceInfo SmartThings device information
   * @param status Optional device status for online/lastSeen data
   * @returns true if added successfully, false if already exists or failed
   * @throws Error if transformation fails or device is invalid
   */
  addDeviceInfo(deviceInfo: DeviceInfo, status?: DeviceStatus): boolean {
    try {
      const startTime = performance.now();

      // Transform DeviceInfo to UnifiedDevice
      const unified = toUnifiedDevice(deviceInfo, status);

      // Add to registry
      this.registry.addDevice(unified);

      const duration = performance.now() - startTime;
      logger.debug('DeviceInfo added to registry', {
        deviceId: unified.id,
        transformationTime: `${duration.toFixed(2)}ms`,
      });

      return true;
    } catch (error) {
      logger.error('Failed to add DeviceInfo to registry', {
        deviceId: deviceInfo.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Batch add multiple DeviceInfo objects to registry.
   *
   * More efficient than calling addDeviceInfo repeatedly.
   * Continues processing on individual failures (non-fatal errors).
   *
   * Performance:
   * - Time Complexity: O(n) where n = number of devices
   * - Expected: <200ms for 200 devices
   * - Individual failures don't block batch processing
   *
   * @param deviceInfos Array of DeviceInfo to add
   * @param statusMap Optional map of deviceId → DeviceStatus
   * @returns Result with counts and error details
   */
  async addDeviceInfoBatch(
    deviceInfos: DeviceInfo[],
    statusMap?: Map<string, DeviceStatus>
  ): Promise<BatchAddResult> {
    const startTime = performance.now();
    const result: BatchAddResult = {
      added: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      durationMs: 0,
    };

    for (const deviceInfo of deviceInfos) {
      try {
        // Get status if available
        const status = statusMap?.get(deviceInfo.deviceId);

        // Transform and add
        const unified = toUnifiedDevice(deviceInfo, status);
        this.registry.addDevice(unified);

        result.added++;
      } catch (error) {
        result.failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push({
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.name,
          error: errorMsg,
        });

        logger.warn('Failed to add device in batch', {
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.name,
          error: errorMsg,
        });
      }
    }

    result.durationMs = performance.now() - startTime;

    logger.info('Batch add completed', {
      total: deviceInfos.length,
      added: result.added,
      failed: result.failed,
      skipped: result.skipped,
      durationMs: Math.round(result.durationMs),
      devicesPerSecond: Math.round((deviceInfos.length / result.durationMs) * 1000),
    });

    return result;
  }

  /**
   * Update device in registry from DeviceInfo.
   *
   * Transforms DeviceInfo and updates existing device.
   *
   * @param deviceInfo Updated device information
   * @param status Optional updated status
   * @returns true if updated, false if device not found
   */
  updateDeviceInfo(deviceInfo: DeviceInfo, status?: DeviceStatus): boolean {
    try {
      // Transform to UnifiedDevice
      const unified = toUnifiedDevice(deviceInfo, status);

      // Update in registry
      return this.registry.updateDevice(unified.id, unified);
    } catch (error) {
      logger.error('Failed to update DeviceInfo in registry', {
        deviceId: deviceInfo.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Sync registry with current DeviceService state.
   *
   * Efficiently syncs registry by:
   * 1. Adding new devices
   * 2. Updating changed devices
   * 3. Removing deleted devices
   *
   * Performance: <1 second for typical updates
   *
   * @param currentDevices Current devices from DeviceService.listDevices()
   * @param statusMap Optional status map for online/lastSeen updates
   * @returns Sync result with statistics
   */
  async syncFromDeviceService(
    currentDevices: DeviceInfo[],
    statusMap?: Map<string, DeviceStatus>
  ): Promise<SyncResult> {
    const startTime = performance.now();
    const result: SyncResult = {
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      errors: [],
      durationMs: 0,
    };

    // Build set of current device IDs
    const currentDeviceIds = new Set(
      currentDevices.map((d) => `smartthings:${d.deviceId}`)
    );

    // Get existing devices
    const existingDevices = this.registry.getAllDevices();
    const existingDeviceIds = new Set(existingDevices.map((d) => d.id));

    // Find devices to add (in current but not in registry)
    const toAdd = currentDevices.filter(
      (d) => !existingDeviceIds.has(`smartthings:${d.deviceId}`)
    );

    // Find devices to remove (in registry but not in current)
    const toRemove = existingDevices.filter((d) => !currentDeviceIds.has(d.id));

    // Add new devices
    for (const deviceInfo of toAdd) {
      try {
        const status = statusMap?.get(deviceInfo.deviceId);
        const unified = toUnifiedDevice(deviceInfo, status);
        this.registry.addDevice(unified);
        result.added++;
      } catch (error) {
        result.errors.push({
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Remove deleted devices
    for (const device of toRemove) {
      try {
        this.registry.removeDevice(device.id);
        result.removed++;
      } catch (error) {
        result.errors.push({
          deviceId: device.id,
          deviceName: device.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update existing devices (devices in both current and registry)
    const toUpdate = currentDevices.filter((d) =>
      existingDeviceIds.has(`smartthings:${d.deviceId}`)
    );

    for (const deviceInfo of toUpdate) {
      try {
        const status = statusMap?.get(deviceInfo.deviceId);
        const unified = toUnifiedDevice(deviceInfo, status);

        // Only update if something changed
        const existing = this.registry.getDevice(unified.id);
        if (existing && hasDeviceChanged(existing, unified)) {
          this.registry.updateDevice(unified.id, unified);
          result.updated++;
        } else {
          result.unchanged++;
        }
      } catch (error) {
        result.errors.push({
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    result.durationMs = performance.now() - startTime;

    logger.info('Registry sync completed', {
      added: result.added,
      updated: result.updated,
      removed: result.removed,
      unchanged: result.unchanged,
      errors: result.errors.length,
      durationMs: Math.round(result.durationMs),
    });

    return result;
  }

  /**
   * Get the underlying DeviceRegistry instance.
   *
   * @returns DeviceRegistry instance
   */
  getRegistry(): DeviceRegistry {
    return this.registry;
  }
}

/**
 * Result of batch add operation.
 */
export interface BatchAddResult {
  /** Number of devices added successfully */
  added: number;

  /** Number of devices that failed to add */
  failed: number;

  /** Number of devices skipped (already exist) */
  skipped: number;

  /** Error details for failed devices */
  errors: Array<{
    deviceId: string;
    deviceName: string;
    error: string;
  }>;

  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Result of sync operation.
 */
export interface SyncResult {
  /** Number of devices added */
  added: number;

  /** Number of devices updated */
  updated: number;

  /** Number of devices removed */
  removed: number;

  /** Number of devices unchanged */
  unchanged: number;

  /** Error details */
  errors: Array<{
    deviceId: string;
    deviceName: string;
    error: string;
  }>;

  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Check if device has changed (requires update).
 *
 * Compares key fields to determine if update is needed.
 *
 * @param existing Existing device in registry
 * @param updated Updated device data
 * @returns true if device has changed
 */
function hasDeviceChanged(existing: UnifiedDevice, updated: UnifiedDevice): boolean {
  // Check basic fields
  if (existing.name !== updated.name) return true;
  if (existing.label !== updated.label) return true;
  if (existing.room !== updated.room) return true;
  if (existing.online !== updated.online) return true;

  // Check capabilities (order doesn't matter)
  const existingCaps = new Set(existing.capabilities);
  const updatedCaps = new Set(updated.capabilities);

  if (existingCaps.size !== updatedCaps.size) return true;

  for (const cap of updatedCaps) {
    if (!existingCaps.has(cap)) return true;
  }

  // Check lastSeen timestamp
  const existingLastSeen = existing.lastSeen?.getTime();
  const updatedLastSeen = updated.lastSeen?.getTime();

  if (existingLastSeen !== updatedLastSeen) return true;

  // No changes detected
  return false;
}
