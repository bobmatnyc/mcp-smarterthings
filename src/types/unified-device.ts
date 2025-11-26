/**
 * Unified device type definitions for multi-platform device abstraction.
 *
 * This module defines the core types for representing devices across
 * SmartThings, Tuya, Lutron, and other platforms through a unified interface.
 *
 * Design Principles:
 * - Platform-agnostic: Types work across all supported platforms
 * - Type-safe: Branded types prevent ID mixing across platforms
 * - Extensible: Easy to add new platforms and capabilities
 * - Immutable: Readonly properties prevent accidental modifications
 *
 * @module types/unified-device
 */

import type { DeviceId, LocationId, RoomId, SceneId } from './smartthings.js';

/**
 * Platform identifiers for supported device ecosystems.
 *
 * Design Decision: Enum vs Union Types
 * - Enums provide better autocomplete and type safety
 * - Runtime introspection possible (Object.values(Platform))
 * - Can be extended without modifying existing code
 */
export enum Platform {
  SMARTTHINGS = 'smartthings',
  TUYA = 'tuya',
  LUTRON = 'lutron',
}

/**
 * Device capability types representing device functions.
 *
 * Capabilities are platform-agnostic and represent what a device can do,
 * not what platform it comes from.
 *
 * Coverage:
 * - 11 control capabilities (actuators)
 * - 15 sensor capabilities (read-only)
 * - 5 composite capabilities
 * Total: 31 capabilities
 *
 * Phase 1 additions (7 new capabilities):
 * - DOOR_CONTROL (garage doors, gates)
 * - BUTTON (scene switches, button events)
 * - PRESSURE_SENSOR (barometric pressure)
 * - CO_DETECTOR (carbon monoxide)
 * - SOUND_SENSOR (sound pressure level)
 * - ROBOT_VACUUM (vacuum cleaners)
 * - IR_BLASTER (infrared remote control)
 */
export enum DeviceCapability {
  // Control Capabilities (Actuators)
  /** Binary on/off control */
  SWITCH = 'switch',
  /** Level control (0-100%) */
  DIMMER = 'dimmer',
  /** RGB/HSV color control */
  COLOR = 'color',
  /** White spectrum control (Kelvin) */
  COLOR_TEMPERATURE = 'colorTemperature',
  /** Temperature control with heating/cooling modes */
  THERMOSTAT = 'thermostat',
  /** Lock/unlock control */
  LOCK = 'lock',
  /** Window covering position/tilt control */
  SHADE = 'shade',
  /** Fan speed control */
  FAN = 'fan',
  /** Water/gas valve control */
  VALVE = 'valve',
  /** Security alarm control */
  ALARM = 'alarm',
  /** Garage door/gate momentary control (HIGH priority) */
  DOOR_CONTROL = 'doorControl',

  // Sensor Capabilities (Read-only)
  /** Temperature reading */
  TEMPERATURE_SENSOR = 'temperatureSensor',
  /** Humidity reading (0-100%) */
  HUMIDITY_SENSOR = 'humiditySensor',
  /** Motion detection */
  MOTION_SENSOR = 'motionSensor',
  /** Open/closed detection */
  CONTACT_SENSOR = 'contactSensor',
  /** Room occupancy detection */
  OCCUPANCY_SENSOR = 'occupancySensor',
  /** Light level measurement (lux) */
  ILLUMINANCE_SENSOR = 'illuminanceSensor',
  /** Battery level (0-100%) */
  BATTERY = 'battery',
  /** Air quality measurement */
  AIR_QUALITY_SENSOR = 'airQualitySensor',
  /** Water leak detection */
  WATER_LEAK_SENSOR = 'waterLeakSensor',
  /** Smoke detection */
  SMOKE_DETECTOR = 'smokeDetector',
  /** Button press events (HIGH priority, event-based) */
  BUTTON = 'button',
  /** Barometric pressure measurement (MEDIUM priority) */
  PRESSURE_SENSOR = 'pressureSensor',
  /** Carbon monoxide detection (MEDIUM priority) */
  CO_DETECTOR = 'coDetector',
  /** Sound pressure level measurement (MEDIUM priority) */
  SOUND_SENSOR = 'soundSensor',

  // Composite Capabilities
  /** Power consumption monitoring */
  ENERGY_METER = 'energyMeter',
  /** Audio playback control */
  SPEAKER = 'speaker',
  /** Media player control */
  MEDIA_PLAYER = 'mediaPlayer',
  /** Camera with video stream */
  CAMERA = 'camera',
  /** Robot vacuum control (MEDIUM priority) */
  ROBOT_VACUUM = 'robotVacuum',
  /** Infrared remote control (LOW priority) */
  IR_BLASTER = 'irBlaster',
}

/**
 * Capability group for organizing related capabilities on composite devices.
 *
 * Phase 3 Addition: Capability Grouping
 * - Enables logical grouping of capabilities on multi-component devices
 * - Maps to platform-specific component structures (e.g., SmartThings components)
 * - Helps organize complex devices (thermostats, entertainment systems)
 *
 * Use Cases:
 * - SmartThings multi-component devices (main, humidity, fan components)
 * - Composite devices with multiple logical units
 * - UI organization for complex device controls
 *
 * @example
 * ```typescript
 * const smartThermostat: UnifiedDevice = {
 *   // ...
 *   capabilities: [THERMOSTAT, TEMPERATURE_SENSOR, HUMIDITY_SENSOR],
 *   capabilityGroups: [
 *     {
 *       id: 'main',
 *       name: 'Main Controls',
 *       capabilities: [THERMOSTAT, TEMPERATURE_SENSOR],
 *     },
 *     {
 *       id: 'humidity',
 *       name: 'Humidity Sensor',
 *       capabilities: [HUMIDITY_SENSOR],
 *       componentId: 'humidity', // Platform-specific component reference
 *     },
 *   ],
 * };
 * ```
 */
export interface CapabilityGroup {
  /** Unique identifier for this capability group */
  id: string;
  /** Human-readable name for the group */
  name: string;
  /** Capabilities included in this group */
  capabilities: ReadonlyArray<DeviceCapability>;
  /** Optional platform-specific component identifier (e.g., SmartThings component ID) */
  componentId?: string;
  /** Optional description of the group's purpose */
  description?: string;
}

/**
 * Branded type for universal device IDs.
 *
 * Format: "{platform}:{platformDeviceId}"
 * Examples:
 * - "smartthings:abc-123-def"
 * - "tuya:bf1234567890abcdef"
 * - "lutron:zone-1"
 *
 * Type Safety: Branded types prevent mixing with regular strings
 * or platform-specific IDs at compile time.
 */
export type UniversalDeviceId = string & { readonly __brand: 'UniversalDeviceId' };

/**
 * Create a universal device ID from platform and platform-specific ID.
 *
 * @param platform Platform identifier
 * @param platformDeviceId Platform-specific device ID
 * @returns Universal device ID with platform prefix
 *
 * @example
 * ```typescript
 * const id = createUniversalDeviceId(Platform.SMARTTHINGS, 'abc-123');
 * // Returns: "smartthings:abc-123" as UniversalDeviceId
 * ```
 */
export function createUniversalDeviceId(
  platform: Platform,
  platformDeviceId: string
): UniversalDeviceId {
  return `${platform}:${platformDeviceId}` as UniversalDeviceId;
}

/**
 * Type guard to check if a string is a valid universal device ID.
 *
 * Validates:
 * - Contains platform prefix
 * - Platform is a known Platform enum value
 * - Has colon separator
 *
 * @param id String to check
 * @returns True if valid UniversalDeviceId format
 *
 * @example
 * ```typescript
 * if (isUniversalDeviceId(id)) {
 *   const { platform, platformDeviceId } = parseUniversalDeviceId(id);
 * }
 * ```
 */
export function isUniversalDeviceId(id: string): id is UniversalDeviceId {
  if (!id.includes(':')) {
    return false;
  }

  const [platformStr] = id.split(':');
  return Object.values(Platform).includes(platformStr as Platform);
}

/**
 * Parse a universal device ID into platform and platform-specific ID.
 *
 * Critical Fix from Code Review:
 * - Added runtime validation of platform string
 * - Throws error for invalid platform instead of silent failure
 * - Handles colons in platform-specific IDs correctly
 *
 * @param universalId Universal device ID to parse
 * @returns Object with platform and platformDeviceId
 * @throws {Error} If universal ID format is invalid or platform unknown
 *
 * @example
 * ```typescript
 * const { platform, platformDeviceId } = parseUniversalDeviceId(
 *   'smartthings:abc-123' as UniversalDeviceId
 * );
 * // platform: Platform.SMARTTHINGS
 * // platformDeviceId: 'abc-123'
 * ```
 */
export function parseUniversalDeviceId(universalId: UniversalDeviceId): {
  platform: Platform;
  platformDeviceId: string;
} {
  // Validate format
  if (!isUniversalDeviceId(universalId)) {
    throw new Error(`Invalid universal device ID format: ${String(universalId)}`);
  }

  const [platformStr, ...rest] = universalId.split(':');

  // ✅ Runtime validation (CRITICAL FIX from code review)
  if (!Object.values(Platform).includes(platformStr as Platform)) {
    throw new Error(`Unknown platform in device ID: ${platformStr}`);
  }

  return {
    platform: platformStr as Platform,
    platformDeviceId: rest.join(':'), // Handle colons in platform IDs
  };
}

/**
 * Unified device model representing any device across all platforms.
 *
 * This model normalizes device information from SmartThings, Tuya, Lutron,
 * and other platforms into a consistent structure.
 *
 * Design Rationale:
 * - Capability-based: Devices defined by what they can do, not their type
 * - Platform-agnostic: Common fields work across all platforms
 * - Escape hatch: platformSpecific field for platform-unique features
 * - Immutable: Readonly properties prevent accidental modifications
 */
export interface UnifiedDevice {
  // Identity
  /** Universal device identifier (platform:deviceId) */
  readonly id: UniversalDeviceId;
  /** Originating platform */
  readonly platform: Platform;
  /** Platform-specific device ID */
  readonly platformDeviceId: string;

  // Metadata
  /** User-friendly device name */
  name: string;
  /** Optional label or description */
  label?: string;
  /** Device manufacturer */
  manufacturer?: string;
  /** Device model number/identifier */
  model?: string;
  /** Firmware version */
  firmwareVersion?: string;

  // Organization
  /** Room name or identifier */
  room?: string;
  /** Location/home name or identifier */
  location?: string;

  // Capabilities
  /** List of supported device capabilities */
  readonly capabilities: ReadonlyArray<DeviceCapability>;

  /**
   * Optional capability groups for composite devices.
   *
   * Phase 3 Addition: Capability Grouping
   * - Organizes capabilities into logical groups for complex devices
   * - Maps to platform component structures (e.g., SmartThings components)
   * - Enables better UI organization and component-level control
   */
  capabilityGroups?: ReadonlyArray<CapabilityGroup>;

  // State
  /** Device reachability status */
  online: boolean;
  /** Last communication timestamp */
  lastSeen?: Date;

  // Platform-specific (Escape Hatch)
  /**
   * Platform-specific properties not covered by unified model.
   *
   * Use cases:
   * - SmartThings: component information, device type
   * - Tuya: category code, product information
   * - Lutron: zone number, integration ID
   *
   * Warning: Using platformSpecific reduces portability.
   * Prefer adding to unified model when feature is common across platforms.
   */
  platformSpecific?: Record<string, unknown>;
}

/**
 * Type guard for Platform enum.
 *
 * @param value Value to check
 * @returns True if value is a valid Platform
 */
export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && Object.values(Platform).includes(value as Platform);
}

/**
 * Type guard for DeviceCapability enum.
 *
 * @param value Value to check
 * @returns True if value is a valid DeviceCapability
 */
export function isDeviceCapability(value: unknown): value is DeviceCapability {
  return (
    typeof value === 'string' && Object.values(DeviceCapability).includes(value as DeviceCapability)
  );
}

/**
 * Re-export existing SmartThings branded types for compatibility.
 *
 * These types are used by platform adapters to maintain type safety
 * when working with platform-specific IDs.
 */
export type { DeviceId, LocationId, RoomId, SceneId };

//
// Phase 3: Runtime Capability Detection Utilities
//

/**
 * Check if device has a specific capability.
 *
 * @param device Unified device to check
 * @param capability Capability to look for
 * @returns True if device supports the capability
 *
 * @example
 * ```typescript
 * if (hasCapability(device, DeviceCapability.DIMMER)) {
 *   // Device supports dimming
 * }
 * ```
 */
export function hasCapability(device: UnifiedDevice, capability: DeviceCapability): boolean {
  return device.capabilities.includes(capability);
}

/**
 * Get all active capabilities for a device.
 *
 * @param device Unified device
 * @returns Array of device capabilities
 *
 * @example
 * ```typescript
 * const caps = getActiveCapabilities(device);
 * console.log(`Device has ${caps.length} capabilities`);
 * ```
 */
export function getActiveCapabilities(device: UnifiedDevice): ReadonlyArray<DeviceCapability> {
  return device.capabilities;
}

/**
 * Check if device has all specified capabilities.
 *
 * @param device Unified device to check
 * @param capabilities Capabilities to check for
 * @returns True if device has all specified capabilities
 *
 * @example
 * ```typescript
 * if (hasAllCapabilities(device, [DeviceCapability.SWITCH, DeviceCapability.DIMMER])) {
 *   // Device is a dimmable light
 * }
 * ```
 */
export function hasAllCapabilities(
  device: UnifiedDevice,
  capabilities: DeviceCapability[]
): boolean {
  return capabilities.every((cap) => device.capabilities.includes(cap));
}

/**
 * Check if device has any of the specified capabilities.
 *
 * @param device Unified device to check
 * @param capabilities Capabilities to check for
 * @returns True if device has at least one of the specified capabilities
 *
 * @example
 * ```typescript
 * if (hasAnyCapability(device, [DeviceCapability.MOTION_SENSOR, DeviceCapability.CONTACT_SENSOR])) {
 *   // Device has some kind of sensor
 * }
 * ```
 */
export function hasAnyCapability(device: UnifiedDevice, capabilities: DeviceCapability[]): boolean {
  return capabilities.some((cap) => device.capabilities.includes(cap));
}

/**
 * Get capability groups for a device.
 *
 * @param device Unified device
 * @returns Array of capability groups, or empty array if none defined
 *
 * @example
 * ```typescript
 * const groups = getCapabilityGroups(device);
 * for (const group of groups) {
 *   console.log(`${group.name}: ${group.capabilities.join(', ')}`);
 * }
 * ```
 */
export function getCapabilityGroups(device: UnifiedDevice): ReadonlyArray<CapabilityGroup> {
  return device.capabilityGroups ?? [];
}

/**
 * Find capability group by ID.
 *
 * @param device Unified device
 * @param groupId Capability group ID to find
 * @returns Capability group or undefined if not found
 *
 * @example
 * ```typescript
 * const mainGroup = findCapabilityGroup(device, 'main');
 * if (mainGroup) {
 *   console.log(`Main group has ${mainGroup.capabilities.length} capabilities`);
 * }
 * ```
 */
export function findCapabilityGroup(
  device: UnifiedDevice,
  groupId: string
): CapabilityGroup | undefined {
  return device.capabilityGroups?.find((group) => group.id === groupId);
}

/**
 * Get all capabilities from a specific group.
 *
 * @param device Unified device
 * @param groupId Capability group ID
 * @returns Array of capabilities in the group, or empty array if group not found
 *
 * @example
 * ```typescript
 * const mainCaps = getGroupCapabilities(device, 'main');
 * if (mainCaps.length > 0) {
 *   console.log(`Main component supports: ${mainCaps.join(', ')}`);
 * }
 * ```
 */
export function getGroupCapabilities(
  device: UnifiedDevice,
  groupId: string
): ReadonlyArray<DeviceCapability> {
  const group = findCapabilityGroup(device, groupId);
  return group?.capabilities ?? [];
}

/**
 * Check if device is a sensor (has any sensor capability).
 *
 * @param device Unified device to check
 * @returns True if device has any sensor capability
 */
export function isSensorDevice(device: UnifiedDevice): boolean {
  const sensorCapabilities = [
    DeviceCapability.TEMPERATURE_SENSOR,
    DeviceCapability.HUMIDITY_SENSOR,
    DeviceCapability.MOTION_SENSOR,
    DeviceCapability.CONTACT_SENSOR,
    DeviceCapability.OCCUPANCY_SENSOR,
    DeviceCapability.ILLUMINANCE_SENSOR,
    DeviceCapability.AIR_QUALITY_SENSOR,
    DeviceCapability.WATER_LEAK_SENSOR,
    DeviceCapability.SMOKE_DETECTOR,
    DeviceCapability.PRESSURE_SENSOR,
    DeviceCapability.CO_DETECTOR,
    DeviceCapability.SOUND_SENSOR,
  ];

  return hasAnyCapability(device, sensorCapabilities);
}

/**
 * Check if device is a controller (has any control capability).
 *
 * @param device Unified device to check
 * @returns True if device has any control capability
 */
export function isControllerDevice(device: UnifiedDevice): boolean {
  const controlCapabilities = [
    DeviceCapability.SWITCH,
    DeviceCapability.DIMMER,
    DeviceCapability.COLOR,
    DeviceCapability.COLOR_TEMPERATURE,
    DeviceCapability.THERMOSTAT,
    DeviceCapability.LOCK,
    DeviceCapability.SHADE,
    DeviceCapability.FAN,
    DeviceCapability.VALVE,
    DeviceCapability.ALARM,
    DeviceCapability.DOOR_CONTROL,
  ];

  return hasAnyCapability(device, controlCapabilities);
}
