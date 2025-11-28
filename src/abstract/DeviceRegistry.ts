/**
 * Device Registry with multi-dimensional indexing.
 *
 * Provides fast device lookups with fuzzy name matching, alias support,
 * and multi-dimensional querying (room, type, capability).
 *
 * Design Principles:
 * - Fast lookups: O(1) for ID, O(log n) for name/alias
 * - Index consistency: All indices update atomically
 * - Fuzzy matching: Levenshtein distance for typo tolerance
 * - Type safety: Uses branded types from unified device model
 *
 * Performance Goals:
 * - <10ms lookup time for 200+ devices
 * - <1ms for exact ID lookups
 * - <5ms for fuzzy name resolution
 *
 * @module abstract/DeviceRegistry
 */

import { promises as fs } from 'fs';
import type {
  UnifiedDevice,
  UniversalDeviceId,
  DeviceCapability,
  Platform,
} from '../types/unified-device.js';
import type { DeviceFilter } from '../types/registry.js';
import { findAllMatches } from './levenshtein.js';
import logger from '../utils/logger.js';

/**
 * Device resolution result with match quality.
 */
export interface DeviceResolutionResult {
  /** Resolved device */
  device: UnifiedDevice;

  /** Match type (exact, alias, fuzzy) */
  matchType: 'exact' | 'alias' | 'fuzzy';

  /** Similarity score for fuzzy matches (0.0-1.0) */
  confidence?: number;
}

/**
 * Registry statistics for monitoring.
 */
export interface RegistryStats {
  /** Total devices in registry */
  deviceCount: number;

  /** Number of unique rooms */
  roomCount: number;

  /** Number of unique platforms */
  platformCount: number;

  /** Devices per room */
  devicesPerRoom: Map<string, number>;

  /** Devices per platform */
  devicesPerPlatform: Map<Platform, number>;

  /** Devices per capability */
  devicesPerCapability: Map<DeviceCapability, number>;
}

/**
 * Device Registry implementation with multi-dimensional indexing.
 *
 * Maintains the following indices for fast lookups:
 * - Primary: deviceId → device (O(1))
 * - Name: name → deviceId (O(1))
 * - Alias: alias → deviceId (O(1))
 * - Room: room → Set<deviceId> (O(1) + O(n) for iteration)
 * - Platform: platform → Set<deviceId> (O(1) + O(n) for iteration)
 * - Capability: capability → Set<deviceId> (O(1) + O(n) for iteration)
 *
 * All indices update atomically when devices are added/removed/updated.
 */
export class DeviceRegistry {
  /** Primary device store (deviceId → device) */
  private readonly devices: Map<UniversalDeviceId, UnifiedDevice> = new Map();

  /** Name index (normalized name → deviceId) */
  private readonly nameIndex: Map<string, UniversalDeviceId> = new Map();

  /** Alias index (normalized alias → deviceId) */
  private readonly aliasIndex: Map<string, UniversalDeviceId> = new Map();

  /** Room index (room → Set<deviceId>) */
  private readonly roomIndex: Map<string, Set<UniversalDeviceId>> = new Map();

  /** Platform index (platform → Set<deviceId>) */
  private readonly platformIndex: Map<Platform, Set<UniversalDeviceId>> = new Map();

  /** Capability index (capability → Set<deviceId>) */
  private readonly capabilityIndex: Map<DeviceCapability, Set<UniversalDeviceId>> = new Map();

  /** Fuzzy matching threshold for name resolution */
  private readonly fuzzyThreshold: number;

  /**
   * Create a new DeviceRegistry.
   *
   * @param options Configuration options
   * @param options.fuzzyThreshold Minimum similarity score for fuzzy matches (default: 0.6)
   */
  constructor(options?: { fuzzyThreshold?: number }) {
    this.fuzzyThreshold = options?.fuzzyThreshold ?? 0.6;
    logger.info('DeviceRegistry initialized', {
      fuzzyThreshold: this.fuzzyThreshold,
    });
  }

  /**
   * Add a device to the registry.
   *
   * Updates all indices atomically. If device already exists, this is a no-op.
   *
   * Time Complexity: O(k) where k = number of capabilities
   * Space Complexity: O(k) for capability index entries
   *
   * @param device Device to add
   * @throws Error if device has invalid structure
   */
  addDevice(device: UnifiedDevice): void {
    // Validate device
    if (!device.id) {
      throw new Error('Device must have an ID');
    }
    if (!device.name) {
      throw new Error('Device must have a name');
    }

    // Check if already exists
    if (this.devices.has(device.id)) {
      logger.debug('Device already exists in registry', { deviceId: device.id });
      return;
    }

    // Add to primary store
    this.devices.set(device.id, device);

    // Update name index
    const normalizedName = this.normalizeName(device.name);
    this.nameIndex.set(normalizedName, device.id);

    // Update alias index (label as alias)
    if (device.label) {
      const normalizedLabel = this.normalizeName(device.label);
      this.aliasIndex.set(normalizedLabel, device.id);
    }

    // Update room index
    if (device.room) {
      if (!this.roomIndex.has(device.room)) {
        this.roomIndex.set(device.room, new Set());
      }
      this.roomIndex.get(device.room)!.add(device.id);
    }

    // Update platform index
    if (!this.platformIndex.has(device.platform)) {
      this.platformIndex.set(device.platform, new Set());
    }
    this.platformIndex.get(device.platform)!.add(device.id);

    // Update capability indices
    for (const capability of device.capabilities) {
      if (!this.capabilityIndex.has(capability)) {
        this.capabilityIndex.set(capability, new Set());
      }
      this.capabilityIndex.get(capability)!.add(device.id);
    }

    logger.debug('Device added to registry', {
      deviceId: device.id,
      name: device.name,
      room: device.room,
      platform: device.platform,
      capabilities: device.capabilities.length,
    });
  }

  /**
   * Remove a device from the registry.
   *
   * Removes device from all indices atomically. If device doesn't exist, this is a no-op.
   *
   * Time Complexity: O(k) where k = number of capabilities
   *
   * @param deviceId Device ID to remove
   * @returns true if device was removed, false if not found
   */
  removeDevice(deviceId: UniversalDeviceId): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      logger.debug('Device not found in registry', { deviceId });
      return false;
    }

    // Remove from primary store
    this.devices.delete(deviceId);

    // Remove from name index
    const normalizedName = this.normalizeName(device.name);
    this.nameIndex.delete(normalizedName);

    // Remove from alias index
    if (device.label) {
      const normalizedLabel = this.normalizeName(device.label);
      this.aliasIndex.delete(normalizedLabel);
    }

    // Remove from room index
    if (device.room) {
      const roomDevices = this.roomIndex.get(device.room);
      if (roomDevices) {
        roomDevices.delete(deviceId);
        if (roomDevices.size === 0) {
          this.roomIndex.delete(device.room);
        }
      }
    }

    // Remove from platform index
    const platformDevices = this.platformIndex.get(device.platform);
    if (platformDevices) {
      platformDevices.delete(deviceId);
      if (platformDevices.size === 0) {
        this.platformIndex.delete(device.platform);
      }
    }

    // Remove from capability indices
    for (const capability of device.capabilities) {
      const capabilityDevices = this.capabilityIndex.get(capability);
      if (capabilityDevices) {
        capabilityDevices.delete(deviceId);
        if (capabilityDevices.size === 0) {
          this.capabilityIndex.delete(capability);
        }
      }
    }

    logger.debug('Device removed from registry', {
      deviceId,
      name: device.name,
    });

    return true;
  }

  /**
   * Update device in registry.
   *
   * Efficiently updates only changed fields and their corresponding indices.
   *
   * Time Complexity: O(k) worst case (all capabilities changed)
   *
   * @param deviceId Device ID to update
   * @param updates Partial device updates
   * @returns true if device was updated, false if not found
   * @throws Error if updates would create invalid state
   */
  updateDevice(deviceId: UniversalDeviceId, updates: Partial<UnifiedDevice>): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      logger.warn('Cannot update device: not found', { deviceId });
      return false;
    }

    // Validate updates
    if (updates.id && updates.id !== deviceId) {
      throw new Error('Cannot change device ID');
    }
    if (updates.name === '') {
      throw new Error('Device name cannot be empty');
    }

    // Handle name change (update name index)
    if (updates.name && updates.name !== device.name) {
      const oldNormalizedName = this.normalizeName(device.name);
      const newNormalizedName = this.normalizeName(updates.name);
      this.nameIndex.delete(oldNormalizedName);
      this.nameIndex.set(newNormalizedName, deviceId);
    }

    // Handle label change (update alias index)
    if (updates.label !== undefined) {
      if (device.label) {
        const oldNormalizedLabel = this.normalizeName(device.label);
        this.aliasIndex.delete(oldNormalizedLabel);
      }
      if (updates.label) {
        const newNormalizedLabel = this.normalizeName(updates.label);
        this.aliasIndex.set(newNormalizedLabel, deviceId);
      }
    }

    // Handle room change (update room index)
    if (updates.room !== undefined && updates.room !== device.room) {
      // Remove from old room
      if (device.room) {
        const oldRoomDevices = this.roomIndex.get(device.room);
        if (oldRoomDevices) {
          oldRoomDevices.delete(deviceId);
          if (oldRoomDevices.size === 0) {
            this.roomIndex.delete(device.room);
          }
        }
      }

      // Add to new room
      if (updates.room) {
        if (!this.roomIndex.has(updates.room)) {
          this.roomIndex.set(updates.room, new Set());
        }
        this.roomIndex.get(updates.room)!.add(deviceId);
      }
    }

    // Handle capability changes (update capability indices)
    if (updates.capabilities) {
      const oldCapabilities = new Set(device.capabilities);
      const newCapabilities = new Set(updates.capabilities);

      // Remove from old capability indices
      for (const capability of oldCapabilities) {
        if (!newCapabilities.has(capability)) {
          const capabilityDevices = this.capabilityIndex.get(capability);
          if (capabilityDevices) {
            capabilityDevices.delete(deviceId);
            if (capabilityDevices.size === 0) {
              this.capabilityIndex.delete(capability);
            }
          }
        }
      }

      // Add to new capability indices
      for (const capability of newCapabilities) {
        if (!oldCapabilities.has(capability)) {
          if (!this.capabilityIndex.has(capability)) {
            this.capabilityIndex.set(capability, new Set());
          }
          this.capabilityIndex.get(capability)!.add(deviceId);
        }
      }
    }

    // Update device in primary store
    Object.assign(device, updates);

    logger.debug('Device updated in registry', {
      deviceId,
      updates: Object.keys(updates),
    });

    return true;
  }

  /**
   * Get device by exact ID.
   *
   * Time Complexity: O(1)
   *
   * @param deviceId Device ID
   * @returns Device or undefined if not found
   */
  getDevice(deviceId: UniversalDeviceId): UnifiedDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Resolve device by query (ID, name, or alias).
   *
   * Resolution order:
   * 1. Exact ID match
   * 2. Exact name match
   * 3. Exact alias match
   * 4. Fuzzy name match (if above threshold)
   *
   * Time Complexity: O(1) for exact matches, O(n) for fuzzy matching
   *
   * @param query Device ID, name, or alias
   * @returns Resolution result or undefined if no match
   */
  resolveDevice(query: string): DeviceResolutionResult | undefined {
    // Try exact ID match
    const deviceById = this.devices.get(query as UniversalDeviceId);
    if (deviceById) {
      return {
        device: deviceById,
        matchType: 'exact',
      };
    }

    // Try exact name match
    const normalizedQuery = this.normalizeName(query);
    const deviceIdByName = this.nameIndex.get(normalizedQuery);
    if (deviceIdByName) {
      const device = this.devices.get(deviceIdByName);
      if (device) {
        return {
          device,
          matchType: 'exact',
        };
      }
    }

    // Try exact alias match
    const deviceIdByAlias = this.aliasIndex.get(normalizedQuery);
    if (deviceIdByAlias) {
      const device = this.devices.get(deviceIdByAlias);
      if (device) {
        return {
          device,
          matchType: 'alias',
        };
      }
    }

    // Try fuzzy name match
    const allNames = Array.from(this.nameIndex.keys());
    const matches = findAllMatches(normalizedQuery, allNames, this.fuzzyThreshold, 1);

    if (matches.length > 0) {
      const bestMatch = matches[0];
      if (bestMatch) {
        const deviceId = this.nameIndex.get(bestMatch.match);
        if (deviceId) {
          const device = this.devices.get(deviceId);
          if (device) {
            return {
              device,
              matchType: 'fuzzy',
              confidence: bestMatch.score,
            };
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Find devices matching filter criteria.
   *
   * All filters use AND logic (all must match).
   *
   * Time Complexity:
   * - Single filter: O(k) where k = devices in filtered set
   * - Multiple filters: O(k) where k = devices in smallest filtered set
   *
   * @param filter Filter criteria
   * @returns Array of matching devices
   */
  findDevices(filter: DeviceFilter): UnifiedDevice[] {
    // Start with all devices
    let candidateIds: Set<UniversalDeviceId> | undefined;

    // Apply room filter (most selective, apply first)
    if (filter.roomId || filter.namePattern?.source.includes('room')) {
      const room = filter.roomId?.toString();
      if (room && this.roomIndex.has(room)) {
        candidateIds = new Set(this.roomIndex.get(room));
      } else {
        return []; // Room doesn't exist
      }
    }

    // Apply platform filter
    if (filter.platform) {
      const platformDevices = this.platformIndex.get(filter.platform);
      if (!platformDevices || platformDevices.size === 0) {
        return []; // Platform doesn't exist
      }

      if (candidateIds) {
        // Intersect with existing candidates
        candidateIds = new Set([...candidateIds].filter((id) => platformDevices.has(id)));
      } else {
        candidateIds = new Set(platformDevices);
      }
    }

    // Apply capability filter
    if (filter.capability) {
      const capabilityDevices = this.capabilityIndex.get(filter.capability);
      if (!capabilityDevices || capabilityDevices.size === 0) {
        return []; // No devices with this capability
      }

      if (candidateIds) {
        // Intersect with existing candidates
        candidateIds = new Set([...candidateIds].filter((id) => capabilityDevices.has(id)));
      } else {
        candidateIds = new Set(capabilityDevices);
      }
    }

    // If no filters applied yet, use all devices
    if (!candidateIds) {
      candidateIds = new Set(this.devices.keys());
    }

    // Apply remaining filters on candidate set
    const results: UnifiedDevice[] = [];

    for (const deviceId of candidateIds) {
      const device = this.devices.get(deviceId);
      if (!device) continue;

      // Apply online filter
      if (filter.online !== undefined && device.online !== filter.online) {
        continue;
      }

      // Apply name pattern filter
      if (filter.namePattern && !filter.namePattern.test(device.name)) {
        continue;
      }

      results.push(device);
    }

    return results;
  }

  /**
   * Get all unique rooms with device counts.
   *
   * Time Complexity: O(1) - just returns index keys
   *
   * @returns Array of room names
   */
  getAllRooms(): string[] {
    return Array.from(this.roomIndex.keys());
  }

  /**
   * Get all devices in a specific room.
   *
   * Time Complexity: O(k) where k = devices in room
   *
   * @param room Room name
   * @returns Array of devices in room
   */
  getDevicesInRoom(room: string): UnifiedDevice[] {
    const deviceIds = this.roomIndex.get(room);
    if (!deviceIds) {
      return [];
    }

    const devices: UnifiedDevice[] = [];
    for (const deviceId of deviceIds) {
      const device = this.devices.get(deviceId);
      if (device) {
        devices.push(device);
      }
    }

    return devices;
  }

  /**
   * Get all devices (unfiltered).
   *
   * Time Complexity: O(n)
   *
   * @returns Array of all devices
   */
  getAllDevices(): UnifiedDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get registry statistics.
   *
   * Time Complexity: O(1) - all data from indices
   *
   * @returns Registry statistics
   */
  getStats(): RegistryStats {
    const devicesPerRoom = new Map<string, number>();
    for (const [room, deviceIds] of this.roomIndex) {
      devicesPerRoom.set(room, deviceIds.size);
    }

    const devicesPerPlatform = new Map<Platform, number>();
    for (const [platform, deviceIds] of this.platformIndex) {
      devicesPerPlatform.set(platform, deviceIds.size);
    }

    const devicesPerCapability = new Map<DeviceCapability, number>();
    for (const [capability, deviceIds] of this.capabilityIndex) {
      devicesPerCapability.set(capability, deviceIds.size);
    }

    return {
      deviceCount: this.devices.size,
      roomCount: this.roomIndex.size,
      platformCount: this.platformIndex.size,
      devicesPerRoom,
      devicesPerPlatform,
      devicesPerCapability,
    };
  }

  /**
   * Clear all devices from registry.
   *
   * Removes all devices and clears all indices.
   *
   * Time Complexity: O(1) - just clears Maps/Sets
   */
  clear(): void {
    this.devices.clear();
    this.nameIndex.clear();
    this.aliasIndex.clear();
    this.roomIndex.clear();
    this.platformIndex.clear();
    this.capabilityIndex.clear();
    logger.info('Registry cleared');
  }

  /**
   * Save registry to JSON file.
   *
   * Serializes all devices to JSON for persistence.
   *
   * Time Complexity: O(n) where n = number of devices
   *
   * @param filePath Path to save JSON file
   * @throws Error if file cannot be written
   */
  async save(filePath: string): Promise<void> {
    const devices = this.getAllDevices();
    const json = JSON.stringify(devices, null, 2);

    try {
      await fs.writeFile(filePath, json, 'utf-8');
      logger.info('Registry saved', {
        filePath,
        deviceCount: devices.length,
      });
    } catch (error) {
      logger.error('Failed to save registry', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load registry from JSON file.
   *
   * Clears existing registry and loads devices from JSON.
   *
   * Time Complexity: O(n * k) where n = devices, k = avg capabilities per device
   *
   * @param filePath Path to JSON file
   * @throws Error if file cannot be read or JSON is invalid
   */
  async load(filePath: string): Promise<void> {
    try {
      const json = await fs.readFile(filePath, 'utf-8');
      const devices = JSON.parse(json) as UnifiedDevice[];

      // Clear existing registry
      this.clear();

      // Add all devices
      for (const device of devices) {
        this.addDevice(device);
      }

      logger.info('Registry loaded', {
        filePath,
        deviceCount: devices.length,
      });
    } catch (error) {
      logger.error('Failed to load registry', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Normalize name for indexing.
   *
   * Converts to lowercase and trims whitespace for consistent matching.
   *
   * @param name Device name or alias
   * @returns Normalized name
   */
  private normalizeName(name: string): string {
    return name.toLowerCase().trim();
  }
}
