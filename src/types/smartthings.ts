/**
 * SmartThings API type definitions.
 *
 * These types complement the @smartthings/core-sdk types
 * with additional branded types for domain safety.
 */

/**
 * Branded type for device IDs to prevent mixing with regular strings.
 */
export type DeviceId = string & { readonly __brand: 'DeviceId' };

/**
 * Branded type for location IDs.
 */
export type LocationId = string & { readonly __brand: 'LocationId' };

/**
 * Branded type for capability names.
 */
export type CapabilityName = string & { readonly __brand: 'CapabilityName' };

/**
 * Branded type for room IDs.
 */
export type RoomId = string & { readonly __brand: 'RoomId' };

/**
 * Branded type for scene IDs.
 */
export type SceneId = string & { readonly __brand: 'SceneId' };

/**
 * Device status response from SmartThings API.
 */
export interface DeviceStatus {
  deviceId: DeviceId;
  components: Record<string, ComponentStatus>;
}

/**
 * Component status with capability states.
 */
export interface ComponentStatus {
  [capability: string]: {
    [attribute: string]: {
      value: unknown;
      unit?: string;
      timestamp?: string;
    };
  };
}

/**
 * Device command execution request.
 */
export interface DeviceCommand {
  capability: CapabilityName;
  command: string;
  arguments?: unknown[];
  component?: string;
}

/**
 * Simplified device information for MCP responses.
 */
export interface DeviceInfo {
  deviceId: DeviceId;
  name: string;
  label?: string;
  type?: string;
  capabilities?: string[];
  components?: string[];
  locationId?: string;
  roomId?: string;
  roomName?: string;
}

/**
 * Device capability information.
 */
export interface CapabilityInfo {
  id: CapabilityName;
  version: number;
  commands?: string[];
  attributes?: string[];
}

/**
 * Creates a branded DeviceId from a string.
 *
 * @param id Raw device ID string
 * @returns Branded DeviceId
 */
export function createDeviceId(id: string): DeviceId {
  return id as DeviceId;
}

/**
 * Creates a branded LocationId from a string.
 *
 * @param id Raw location ID string
 * @returns Branded LocationId
 */
export function createLocationId(id: string): LocationId {
  return id as LocationId;
}

/**
 * Creates a branded CapabilityName from a string.
 *
 * @param name Raw capability name
 * @returns Branded CapabilityName
 */
export function createCapabilityName(name: string): CapabilityName {
  return name as CapabilityName;
}

/**
 * Creates a branded RoomId from a string.
 *
 * @param id Raw room ID string
 * @returns Branded RoomId
 */
export function createRoomId(id: string): RoomId {
  return id as RoomId;
}

/**
 * Creates a branded SceneId from a string.
 *
 * @param id Raw scene ID string
 * @returns Branded SceneId
 */
export function createSceneId(id: string): SceneId {
  return id as SceneId;
}

/**
 * Room information.
 */
export interface RoomInfo {
  roomId: RoomId;
  name: string;
  locationId: LocationId;
  deviceCount?: number;
}

/**
 * Location information.
 */
export interface LocationInfo {
  locationId: LocationId;
  name: string;
  roomCount?: number;
}

/**
 * Scene information from SmartThings API.
 */
export interface SceneInfo {
  sceneId: SceneId;
  sceneName: string;
  sceneIcon?: string;
  sceneColor?: string;
  locationId?: LocationId;
  createdBy?: string;
  createdDate?: Date;
  lastUpdatedDate?: Date;
  lastExecutedDate?: Date;
  editable?: boolean;
}
