/**
 * SemanticIndex adapter for SmartThings DeviceInfo integration.
 *
 * This adapter bridges DeviceService's DeviceInfo output to SemanticIndex's
 * UnifiedDevice input using the type transformation layer.
 *
 * Design Decision: Adapter Pattern (mirrors DeviceRegistryAdapter)
 * - Rationale: Consistent transformation approach across services
 * - Benefit: SemanticIndex remains platform-agnostic
 * - Trade-off: Extra layer adds minimal overhead (<1ms per device)
 *
 * Integration Strategy:
 * - Single transformation point at the boundary
 * - Batch processing support for efficient indexing
 * - No changes to SemanticIndex internals
 * - Preserves semantic search performance (<100ms)
 *
 * Performance:
 * - Single device: <1ms transformation overhead
 * - Batch (200 devices): <5 seconds total (indexing + transformation)
 * - Search latency: <100ms maintained (no overhead)
 *
 * @module services/adapters/SemanticIndexAdapter
 */

import type { SemanticIndex, DeviceMetadataDocument } from '../SemanticIndex.js';
import type { DeviceInfo, DeviceStatus } from '../../types/smartthings.js';
import { createDeviceMetadataDocument } from '../SemanticIndex.js';
import { toUnifiedDevice } from '../transformers/index.js';
import logger from '../../utils/logger.js';

/**
 * SemanticIndex adapter for SmartThings integration.
 *
 * Provides convenience methods to index DeviceInfo directly in SemanticIndex
 * by transforming to UnifiedDevice format automatically.
 *
 * Error Handling:
 * - Transformation failures: Logged and skipped (non-fatal for batch)
 * - Indexing errors: Propagated to caller
 * - Invalid devices: Logged with device ID for debugging
 *
 * @example
 * ```typescript
 * const semanticIndex = new SemanticIndex();
 * await semanticIndex.initialize();
 * const adapter = new SemanticIndexAdapter(semanticIndex);
 *
 * // Index single device from DeviceService
 * const deviceInfo = await deviceService.getDevice(deviceId);
 * await adapter.indexDeviceInfo(deviceInfo);
 *
 * // Batch index devices from DeviceService.listDevices()
 * const devices = await deviceService.listDevices();
 * const result = await adapter.indexDeviceInfoBatch(devices);
 * console.log(`Indexed ${result.indexed} devices in ${result.durationMs}ms`);
 * ```
 */
export class SemanticIndexAdapter {
  constructor(private readonly semanticIndex: SemanticIndex) {}

  /**
   * Index a DeviceInfo in the semantic index with optional status.
   *
   * Transforms DeviceInfo → UnifiedDevice → DeviceMetadataDocument
   * then indexes in SemanticIndex.
   *
   * Performance: <2ms per device (transformation + indexing setup)
   *
   * @param deviceInfo SmartThings device information
   * @param status Optional device status for online/lastSeen data
   * @throws Error if transformation or indexing fails
   */
  async indexDeviceInfo(deviceInfo: DeviceInfo, status?: DeviceStatus): Promise<void> {
    try {
      const startTime = performance.now();

      // Transform DeviceInfo → UnifiedDevice
      const unified = toUnifiedDevice(deviceInfo, status);

      // Create metadata document for indexing
      const metadataDoc = createDeviceMetadataDocument(unified);

      // Index in SemanticIndex
      await this.semanticIndex.indexDevice(metadataDoc);

      const duration = performance.now() - startTime;
      logger.debug('DeviceInfo indexed in semantic index', {
        deviceId: unified.id,
        transformationTime: `${duration.toFixed(2)}ms`,
      });
    } catch (error) {
      logger.error('Failed to index DeviceInfo', {
        deviceId: deviceInfo.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Batch index multiple DeviceInfo objects.
   *
   * More efficient than calling indexDeviceInfo repeatedly.
   * Continues processing on individual failures (non-fatal errors).
   *
   * Performance:
   * - Time Complexity: O(n) where n = number of devices
   * - Expected: <5 seconds for 200 devices (includes ChromaDB indexing)
   * - Individual failures don't block batch processing
   *
   * @param deviceInfos Array of DeviceInfo to index
   * @param statusMap Optional map of deviceId → DeviceStatus
   * @returns Result with counts and error details
   */
  async indexDeviceInfoBatch(
    deviceInfos: DeviceInfo[],
    statusMap?: Map<string, DeviceStatus>
  ): Promise<BatchIndexResult> {
    const startTime = performance.now();
    const result: BatchIndexResult = {
      indexed: 0,
      failed: 0,
      errors: [],
      durationMs: 0,
    };

    // Transform all devices to metadata documents
    const metadataDocs: DeviceMetadataDocument[] = [];

    for (const deviceInfo of deviceInfos) {
      try {
        // Get status if available
        const status = statusMap?.get(deviceInfo.deviceId);

        // Transform DeviceInfo → UnifiedDevice → DeviceMetadataDocument
        const unified = toUnifiedDevice(deviceInfo, status);
        const metadataDoc = createDeviceMetadataDocument(unified);

        metadataDocs.push(metadataDoc);
      } catch (error) {
        result.failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push({
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.name,
          error: errorMsg,
        });

        logger.warn('Failed to transform device in batch', {
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.name,
          error: errorMsg,
        });
      }
    }

    // Batch index all successfully transformed documents
    if (metadataDocs.length > 0) {
      try {
        await this.semanticIndex.indexDevices(metadataDocs);
        result.indexed = metadataDocs.length;
      } catch (error) {
        // Batch indexing failed - all documents failed
        result.failed += metadataDocs.length;
        result.indexed = 0;

        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push({
          deviceId: 'BATCH',
          deviceName: 'Batch Operation',
          error: `Batch indexing failed: ${errorMsg}`,
        });

        logger.error('Batch indexing failed', {
          count: metadataDocs.length,
          error: errorMsg,
        });
      }
    }

    result.durationMs = performance.now() - startTime;

    logger.info('Batch index completed', {
      total: deviceInfos.length,
      indexed: result.indexed,
      failed: result.failed,
      durationMs: Math.round(result.durationMs),
      devicesPerSecond: Math.round((deviceInfos.length / result.durationMs) * 1000),
    });

    return result;
  }

  /**
   * Update device in semantic index from DeviceInfo.
   *
   * Transforms DeviceInfo and updates existing document.
   *
   * @param deviceInfo Updated device information
   * @param status Optional updated status
   */
  async updateDeviceInfo(deviceInfo: DeviceInfo, status?: DeviceStatus): Promise<void> {
    try {
      // Transform to UnifiedDevice
      const unified = toUnifiedDevice(deviceInfo, status);

      // Create metadata document
      const metadataDoc = createDeviceMetadataDocument(unified);

      // Update in semantic index
      await this.semanticIndex.updateDevice(unified.id, metadataDoc);

      logger.debug('DeviceInfo updated in semantic index', {
        deviceId: unified.id,
      });
    } catch (error) {
      logger.error('Failed to update DeviceInfo in semantic index', {
        deviceId: deviceInfo.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove device from semantic index.
   *
   * @param deviceInfo Device to remove
   */
  async removeDeviceInfo(deviceInfo: DeviceInfo): Promise<void> {
    try {
      // Build universal ID
      const universalId = `smartthings:${deviceInfo.deviceId}`;

      // Remove from semantic index
      await this.semanticIndex.removeDevice(universalId);

      logger.debug('DeviceInfo removed from semantic index', {
        deviceId: universalId,
      });
    } catch (error) {
      logger.error('Failed to remove DeviceInfo from semantic index', {
        deviceId: deviceInfo.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Sync semantic index with DeviceRegistry.
   *
   * Uses SemanticIndex's built-in registry sync functionality.
   * DeviceRegistry should already have transformed DeviceInfo → UnifiedDevice.
   *
   * Performance: <1 second for typical updates
   *
   * @param registry DeviceRegistry to sync from
   * @returns Sync result from SemanticIndex
   */
  async syncFromRegistry(registry: any): Promise<any> {
    try {
      const result = await this.semanticIndex.syncWithRegistry(registry);

      logger.info('Semantic index synced from registry', {
        added: result.added,
        updated: result.updated,
        removed: result.removed,
        durationMs: Math.round(result.durationMs),
      });

      return result;
    } catch (error) {
      logger.error('Failed to sync semantic index from registry', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the underlying SemanticIndex instance.
   *
   * @returns SemanticIndex instance
   */
  getIndex(): SemanticIndex {
    return this.semanticIndex;
  }
}

/**
 * Result of batch index operation.
 */
export interface BatchIndexResult {
  /** Number of devices indexed successfully */
  indexed: number;

  /** Number of devices that failed to index */
  failed: number;

  /** Error details for failed devices */
  errors: Array<{
    deviceId: string;
    deviceName: string;
    error: string;
  }>;

  /** Total duration in milliseconds */
  durationMs: number;
}
