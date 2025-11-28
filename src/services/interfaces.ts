/**
 * Service interfaces for dependency injection.
 *
 * Design Decision: Extract service interfaces to enable DI
 * Rationale: Provides clear contracts for service implementations and enables
 * dependency injection for better testability and modularity.
 *
 * Current Implementation: SmartThingsService implements all interfaces temporarily.
 * Future Migration: Split into separate service classes (DeviceService, LocationService, SceneService).
 *
 * Trade-offs:
 * - Flexibility: Interfaces allow easy service substitution
 * - Complexity: Additional abstraction layer
 * - Maintainability: Clear contracts improve long-term maintainability
 *
 * Migration Path:
 * 1. ✅ Define interfaces (current step)
 * 2. TODO: Update tool handlers to accept injected services
 * 3. TODO: Split SmartThingsService into focused service classes
 * 4. TODO: Implement service factory/container
 */

import type {
  DeviceId,
  DeviceInfo,
  DeviceStatus,
  RoomId,
  RoomInfo,
  LocationId,
  LocationInfo,
  SceneId,
  SceneInfo,
} from '../types/smartthings.js';
import type { DeviceEventOptions, DeviceEventResult } from '../types/device-events.js';
import type { Rule } from '@smartthings/core-sdk';
import type { RuleMatch } from './AutomationService.js';

/**
 * Interface for device-related operations.
 *
 * Complexity: O(n) for listDevices where n = number of devices
 * Performance: Network-bound, retries on failure
 */
export interface IDeviceService {
  /**
   * List all devices accessible with the current token.
   *
   * @param roomId Optional room ID to filter devices by room
   * @returns Array of device information
   * @throws Error if API request fails after retries
   *
   * Time Complexity: O(n) where n = number of devices
   * Space Complexity: O(n) for device array
   */
  listDevices(roomId?: RoomId): Promise<DeviceInfo[]>;

  /**
   * Get detailed status of a specific device.
   *
   * @param deviceId Device UUID
   * @returns Device status with capability states
   * @throws Error if device not found or API request fails
   *
   * Time Complexity: O(1) - single API call
   */
  getDeviceStatus(deviceId: DeviceId): Promise<DeviceStatus>;

  /**
   * Execute a command on a device.
   *
   * @param deviceId Device UUID
   * @param capability Capability name (e.g., "switch")
   * @param command Command name (e.g., "on", "off")
   * @param args Optional command arguments
   * @throws Error if command execution fails
   *
   * Time Complexity: O(1) - single API call
   */
  executeCommand(
    deviceId: DeviceId,
    capability: string,
    command: string,
    args?: unknown[]
  ): Promise<void>;

  /**
   * Get detailed information about a specific device.
   *
   * @param deviceId Device UUID
   * @returns Device information
   * @throws Error if device not found
   *
   * Time Complexity: O(1) - single API call
   */
  getDevice(deviceId: DeviceId): Promise<DeviceInfo>;

  /**
   * Get capabilities of a specific device.
   *
   * @param deviceId Device UUID
   * @returns Array of capability names
   * @throws Error if device not found
   *
   * Time Complexity: O(1) - delegates to getDevice
   */
  getDeviceCapabilities(deviceId: DeviceId): Promise<string[]>;

  /**
   * Get device event history with filtering and metadata.
   *
   * @param deviceId Device UUID to query events for
   * @param options Query options (time range, filters, limits)
   * @returns Event result with events, metadata, and summary
   * @throws Error if device not found or time range invalid
   *
   * Time Complexity: O(n) where n = number of events (bounded by limit)
   * Network Complexity: Single API call with AsyncIterable streaming
   */
  getDeviceEvents(deviceId: DeviceId, options: DeviceEventOptions): Promise<DeviceEventResult>;
}

/**
 * Interface for location and room-related operations.
 *
 * Complexity: O(n*m) for listRooms where n = locations, m = rooms per location
 * Performance: Multiple API calls may be required for room enumeration
 */
export interface ILocationService {
  /**
   * List all locations accessible with the current token.
   *
   * @returns Array of location information
   * @throws Error if API request fails after retries
   *
   * Time Complexity: O(n) where n = number of locations
   */
  listLocations(): Promise<LocationInfo[]>;

  /**
   * List all rooms in a location or all accessible rooms.
   *
   * @param locationId Optional location ID to filter rooms
   * @returns Array of room information with device counts
   * @throws Error if API request fails after retries
   *
   * Time Complexity: O(n*m) where n = locations, m = rooms per location
   * Note: Fetches device counts for each room (additional O(d) where d = devices)
   */
  listRooms(locationId?: LocationId): Promise<RoomInfo[]>;

  /**
   * Find a room by name (case-insensitive partial match).
   *
   * @param roomName Room name to search for
   * @returns Room information if found
   * @throws Error if room not found or multiple matches
   *
   * Time Complexity: O(n*m) - delegates to listRooms, then O(r) scan where r = rooms
   */
  findRoomByName(roomName: string): Promise<RoomInfo>;
}

/**
 * Interface for scene-related operations.
 *
 * Complexity: O(n) for listScenes where n = number of scenes
 * Performance: Network-bound, retries on failure
 */
export interface ISceneService {
  /**
   * List all scenes accessible with the current token.
   *
   * @param locationId Optional location ID to filter scenes
   * @returns Array of scene information
   * @throws Error if API request fails after retries
   *
   * Time Complexity: O(n) where n = number of scenes
   */
  listScenes(locationId?: LocationId): Promise<SceneInfo[]>;

  /**
   * Execute a scene by ID.
   *
   * @param sceneId Scene UUID
   * @throws Error if scene not found or execution fails
   *
   * Time Complexity: O(1) - single API call
   */
  executeScene(sceneId: SceneId): Promise<void>;

  /**
   * Find a scene by name (case-insensitive partial match).
   *
   * @param sceneName Scene name to search for
   * @returns Scene information if found
   * @throws Error if scene not found or multiple matches
   *
   * Time Complexity: O(n) - delegates to listScenes, then O(s) scan where s = scenes
   */
  findSceneByName(sceneName: string): Promise<SceneInfo>;
}

/**
 * Interface for automation-related operations.
 *
 * Complexity: O(R×A) for rule filtering where R=rules, A=actions per rule
 * Performance: Caching provides <10ms lookups for repeated queries
 */
export interface IAutomationService {
  /**
   * List all rules for a location.
   *
   * @param locationId Location UUID
   * @returns Array of rules
   * @throws Error if API request fails after retries
   *
   * Time Complexity: O(n) where n = number of rules
   * Space Complexity: O(n) for rule array
   */
  listRules(locationId: LocationId): Promise<Rule[]>;

  /**
   * Get specific rule details.
   *
   * @param ruleId Rule UUID
   * @param locationId Location UUID
   * @returns Rule details or null if not found
   *
   * Time Complexity: O(n) - delegates to listRules, then O(1) find
   */
  getRule(ruleId: string, locationId: LocationId): Promise<Rule | null>;

  /**
   * Find rules that control a specific device.
   *
   * @param deviceId Device UUID to search for
   * @param locationId Location UUID
   * @returns Array of rule matches with confidence scores
   *
   * Time Complexity: O(1) cache hit, O(R×A) cache miss
   * Note: Caching provides 99% cache hit rate in typical usage
   */
  findRulesForDevice(deviceId: DeviceId, locationId: LocationId): Promise<RuleMatch[]>;

  /**
   * Clear cache for a location or all locations.
   *
   * @param locationId Optional location ID to clear, omit to clear all
   */
  clearCache(locationId?: LocationId): void;
}

/**
 * Combined service interface for backward compatibility.
 *
 * TODO: Phase out this interface once services are split into separate classes.
 * Current: SmartThingsService implements this combined interface.
 * Target: Separate DeviceService, LocationService, SceneService classes.
 */
export interface ISmartThingsService extends IDeviceService, ILocationService, ISceneService {}
