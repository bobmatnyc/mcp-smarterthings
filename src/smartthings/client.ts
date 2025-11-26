import { SmartThingsClient, BearerTokenAuthenticator } from '@smartthings/core-sdk';
import { environment } from '../config/environment.js';
import logger from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';
import type {
  DeviceId,
  DeviceInfo,
  DeviceStatus,
  RoomInfo,
  RoomId,
  LocationInfo,
  LocationId,
  SceneInfo,
  SceneId,
} from '../types/smartthings.js';
import type { ISmartThingsService } from '../services/interfaces.js';

/**
 * SmartThings API client wrapper with retry logic and error handling.
 *
 * Design Decision: Wrapper pattern for API client
 * Rationale: Provides centralized error handling, retry logic, and logging
 * for all SmartThings API interactions. Simplifies testing via dependency injection.
 *
 * Performance: Retry logic adds latency only on failures (exponential backoff)
 *
 * Error Handling:
 * - Network errors: Automatic retry with exponential backoff
 * - Authentication errors: Immediate failure (no retry)
 * - API errors: Logged and propagated with context
 *
 * Architecture: Implements ISmartThingsService interface
 * Current: Single class implements all service interfaces (IDeviceService, ILocationService, ISceneService)
 * Future: Split into separate DeviceService, LocationService, SceneService classes
 *
 * TODO Migration Path:
 * 1. ✅ Define service interfaces (interfaces.ts)
 * 2. ✅ Implement interfaces in SmartThingsService (current step)
 * 3. TODO: Extract DeviceService from SmartThingsService
 * 4. TODO: Extract LocationService from SmartThingsService
 * 5. TODO: Extract SceneService from SmartThingsService
 * 6. TODO: Create ServiceFactory/Container for DI
 */
export class SmartThingsService implements ISmartThingsService {
  private client: SmartThingsClient;

  constructor() {
    logger.info('Initializing SmartThings client');

    this.client = new SmartThingsClient(new BearerTokenAuthenticator(environment.SMARTTHINGS_PAT));
  }

  /**
   * List all devices accessible with the current token.
   *
   * @param roomId Optional room ID to filter devices by room
   * @returns Array of device information
   * @throws Error if API request fails after retries
   */
  async listDevices(roomId?: RoomId): Promise<DeviceInfo[]> {
    logger.debug('Fetching device list', { roomId });

    const devices = await retryWithBackoff(async () => {
      return await this.client.devices.list();
    });

    // Filter by room if specified
    const filteredDevices = roomId ? devices.filter((device) => device.roomId === roomId) : devices;

    // Fetch room names for all devices with roomId
    const roomMap = new Map<string, string>();
    const roomIds = [...new Set(filteredDevices.map((d) => d.roomId).filter(Boolean))];

    for (const rid of roomIds) {
      try {
        const room = await retryWithBackoff(async () => {
          return await this.client.rooms.get(rid as string);
        });
        if (room.roomId) {
          roomMap.set(room.roomId, room.name ?? 'Unknown Room');
        }
      } catch (error) {
        logger.warn('Failed to fetch room name', { roomId: rid, error });
      }
    }

    const deviceInfos: DeviceInfo[] = filteredDevices.map((device) => ({
      deviceId: device.deviceId as DeviceId,
      name: device.name ?? 'Unknown Device',
      label: device.label,
      type: device.type,
      capabilities: (device.components?.[0]?.capabilities?.map((cap) => cap.id) ??
        []) as unknown as string[],
      components: device.components?.map((comp) => comp.id),
      locationId: device.locationId,
      roomId: device.roomId,
      roomName: device.roomId ? roomMap.get(device.roomId) : undefined,
    }));

    logger.info('Devices retrieved', { count: deviceInfos.length, roomFilter: !!roomId });
    return deviceInfos;
  }

  /**
   * Get detailed status of a specific device.
   *
   * @param deviceId Device UUID
   * @returns Device status with capability states
   * @throws Error if device not found or API request fails
   */
  async getDeviceStatus(deviceId: DeviceId): Promise<DeviceStatus> {
    logger.debug('Fetching device status', { deviceId });

    const status = await retryWithBackoff(async () => {
      return await this.client.devices.getStatus(deviceId);
    });

    logger.info('Device status retrieved', { deviceId });
    return status as DeviceStatus;
  }

  /**
   * Execute a command on a device.
   *
   * @param deviceId Device UUID
   * @param capability Capability name (e.g., "switch")
   * @param command Command name (e.g., "on", "off")
   * @param args Optional command arguments
   * @throws Error if command execution fails
   */
  async executeCommand(
    deviceId: DeviceId,
    capability: string,
    command: string,
    args?: unknown[]
  ): Promise<void> {
    logger.debug('Executing device command', { deviceId, capability, command, args });

    const startTime = Date.now();
    let deviceName: string | undefined;

    try {
      // Get device name for better diagnostic tracking (non-blocking)
      try {
        const device = await this.getDevice(deviceId);
        deviceName = device.name;
      } catch {
        // Ignore errors getting device name - don't fail command execution
        deviceName = undefined;
      }

      // Execute command with retry logic
      await retryWithBackoff(async () => {
        await this.client.devices.executeCommand(deviceId, {
          capability,
          command,
          arguments: args as (string | number | object)[] | undefined,
        });
      });

      const duration = Date.now() - startTime;

      // Track successful command execution
      const { diagnosticTracker } = await import('../utils/diagnostic-tracker.js');
      diagnosticTracker.recordCommand({
        timestamp: new Date(),
        deviceId,
        deviceName,
        capability,
        command,
        success: true,
        duration,
      });

      logger.info('Device command executed successfully', {
        deviceId,
        capability,
        command,
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      // Track failed command execution
      const { diagnosticTracker } = await import('../utils/diagnostic-tracker.js');
      diagnosticTracker.recordCommand({
        timestamp: new Date(),
        deviceId,
        deviceName,
        capability,
        command,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      });

      logger.error('Device command failed', { deviceId, capability, command, error });
      throw error;
    }
  }

  /**
   * Get detailed information about a specific device.
   *
   * @param deviceId Device UUID
   * @returns Device information
   * @throws Error if device not found
   */
  async getDevice(deviceId: DeviceId): Promise<DeviceInfo> {
    logger.debug('Fetching device details', { deviceId });

    const device = await retryWithBackoff(async () => {
      return await this.client.devices.get(deviceId);
    });

    const deviceInfo: DeviceInfo = {
      deviceId: device.deviceId as DeviceId,
      name: device.name ?? 'Unknown Device',
      label: device.label,
      type: device.type,
      capabilities: (device.components?.[0]?.capabilities?.map((cap) => cap.id) ??
        []) as unknown as string[],
      components: device.components?.map((comp) => comp.id),
      locationId: device.locationId,
    };

    logger.info('Device details retrieved', { deviceId });
    return deviceInfo;
  }

  /**
   * Get capabilities of a specific device.
   *
   * @param deviceId Device UUID
   * @returns Array of capability names
   * @throws Error if device not found
   */
  async getDeviceCapabilities(deviceId: DeviceId): Promise<string[]> {
    logger.debug('Fetching device capabilities', { deviceId });

    const device = await this.getDevice(deviceId);
    const capabilities = device.capabilities ?? [];

    logger.info('Device capabilities retrieved', { deviceId, count: capabilities.length });
    return capabilities;
  }

  /**
   * List all locations accessible with the current token.
   *
   * @returns Array of location information
   * @throws Error if API request fails after retries
   */
  async listLocations(): Promise<LocationInfo[]> {
    logger.debug('Fetching location list');

    const locations = await retryWithBackoff(async () => {
      return await this.client.locations.list();
    });

    const locationInfos: LocationInfo[] = locations.map((location) => ({
      locationId: location.locationId as LocationId,
      name: location.name,
    }));

    logger.info('Locations retrieved', { count: locationInfos.length });
    return locationInfos;
  }

  /**
   * List all rooms in a location or all accessible rooms.
   *
   * @param locationId Optional location ID to filter rooms
   * @returns Array of room information with device counts
   * @throws Error if API request fails after retries
   */
  async listRooms(locationId?: LocationId): Promise<RoomInfo[]> {
    logger.debug('Fetching room list', { locationId });

    let rooms: Array<{ roomId?: string; name?: string; locationId?: string }> = [];

    if (locationId) {
      // Fetch rooms for specific location
      rooms = await retryWithBackoff(async () => {
        return await this.client.rooms.list(locationId);
      });
    } else {
      // Fetch all locations and their rooms
      const locations = await this.listLocations();
      for (const location of locations) {
        const locationRooms = await retryWithBackoff(async () => {
          return await this.client.rooms.list(location.locationId);
        });
        rooms.push(...locationRooms);
      }
    }

    // Get device counts for each room
    const devices = await this.listDevices();
    const deviceCountByRoom = new Map<string, number>();

    for (const device of devices) {
      if (device.roomId) {
        deviceCountByRoom.set(device.roomId, (deviceCountByRoom.get(device.roomId) ?? 0) + 1);
      }
    }

    const roomInfos: RoomInfo[] = rooms
      .filter((room) => room.roomId && room.name && room.locationId)
      .map((room) => ({
        roomId: room.roomId as RoomId,
        name: room.name as string,
        locationId: room.locationId as LocationId,
        deviceCount: deviceCountByRoom.get(room.roomId as string) ?? 0,
      }));

    logger.info('Rooms retrieved', { count: roomInfos.length, locationFilter: !!locationId });
    return roomInfos;
  }

  /**
   * Find a room by name (case-insensitive partial match).
   *
   * @param roomName Room name to search for
   * @returns Room information if found
   * @throws Error if room not found or multiple matches
   */
  async findRoomByName(roomName: string): Promise<RoomInfo> {
    logger.debug('Finding room by name', { roomName });

    const rooms = await this.listRooms();
    const normalizedSearch = roomName.toLowerCase().trim();

    // Try exact match first
    const exactMatch = rooms.find((room) => room.name.toLowerCase() === normalizedSearch);
    if (exactMatch) {
      logger.info('Room found (exact match)', { roomId: exactMatch.roomId, roomName });
      return exactMatch;
    }

    // Try partial match
    const partialMatches = rooms.filter((room) =>
      room.name.toLowerCase().includes(normalizedSearch)
    );

    if (partialMatches.length === 0) {
      throw new Error(`Room not found: "${roomName}"`);
    }

    if (partialMatches.length === 1) {
      const match = partialMatches[0]!; // Safe: length check ensures element exists
      logger.info('Room found (partial match)', {
        roomId: match.roomId,
        roomName,
        actualName: match.name,
      });
      return match;
    }

    // Multiple matches
    const matchNames = partialMatches.map((r) => r.name).join(', ');
    throw new Error(`Multiple rooms match "${roomName}": ${matchNames}. Please be more specific.`);
  }

  /**
   * List all scenes accessible with the current token.
   *
   * @param locationId Optional location ID to filter scenes
   * @returns Array of scene information
   * @throws Error if API request fails after retries
   */
  async listScenes(locationId?: LocationId): Promise<SceneInfo[]> {
    logger.debug('Fetching scene list', { locationId });

    const options = locationId ? { locationId: [locationId] } : undefined;

    const scenes = await retryWithBackoff(async () => {
      return await this.client.scenes.list(options);
    });

    const sceneInfos: SceneInfo[] = scenes.map((scene) => ({
      sceneId: scene.sceneId as SceneId,
      sceneName: scene.sceneName ?? 'Unnamed Scene',
      sceneIcon: scene.sceneIcon,
      sceneColor: scene.sceneColor,
      locationId: scene.locationId as LocationId | undefined,
      createdBy: scene.createdBy,
      createdDate: scene.createdDate,
      lastUpdatedDate: scene.lastUpdatedDate,
      lastExecutedDate: scene.lastExecutedDate,
      editable: scene.editable,
    }));

    logger.info('Scenes retrieved', { count: sceneInfos.length, locationFilter: !!locationId });
    return sceneInfos;
  }

  /**
   * Execute a scene by ID.
   *
   * @param sceneId Scene UUID
   * @throws Error if scene not found or execution fails
   */
  async executeScene(sceneId: SceneId): Promise<void> {
    logger.debug('Executing scene', { sceneId });

    await retryWithBackoff(async () => {
      await this.client.scenes.execute(sceneId);
    });

    logger.info('Scene executed successfully', { sceneId });
  }

  /**
   * Find a scene by name (case-insensitive partial match).
   *
   * @param sceneName Scene name to search for
   * @returns Scene information if found
   * @throws Error if scene not found or multiple matches
   */
  async findSceneByName(sceneName: string): Promise<SceneInfo> {
    logger.debug('Finding scene by name', { sceneName });

    const scenes = await this.listScenes();
    const normalizedSearch = sceneName.toLowerCase().trim();

    // Try exact match first
    const exactMatch = scenes.find((scene) => scene.sceneName.toLowerCase() === normalizedSearch);
    if (exactMatch) {
      logger.info('Scene found (exact match)', { sceneId: exactMatch.sceneId, sceneName });
      return exactMatch;
    }

    // Try partial match
    const partialMatches = scenes.filter((scene) =>
      scene.sceneName.toLowerCase().includes(normalizedSearch)
    );

    if (partialMatches.length === 0) {
      throw new Error(`Scene not found: "${sceneName}"`);
    }

    if (partialMatches.length === 1) {
      const match = partialMatches[0]!; // Safe: length check ensures element exists
      logger.info('Scene found (partial match)', {
        sceneId: match.sceneId,
        sceneName,
        actualName: match.sceneName,
      });
      return match;
    }

    // Multiple matches
    const matchNames = partialMatches.map((s) => s.sceneName).join(', ');
    throw new Error(
      `Multiple scenes match "${sceneName}": ${matchNames}. Please be more specific.`
    );
  }
}

/**
 * Singleton instance of SmartThings service.
 * Initialized once per application lifecycle.
 */
export const smartThingsService = new SmartThingsService();
