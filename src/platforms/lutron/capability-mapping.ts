/**
 * Lutron capability mapping module.
 *
 * Maps Lutron LEAP device types and zones to unified DeviceCapability enums.
 * Handles bidirectional conversion between LEAP protocol and unified device model.
 *
 * Design Decision: Zone-Centric Model
 * Rationale: Lutron LEAP uses zones as primary abstraction (not devices).
 * Each zone represents a control point (light, shade, fan). Mapping treats
 * zones as devices with capabilities based on zone type.
 *
 * @module platforms/lutron/capability-mapping
 */

import { DeviceCapability } from '../../types/unified-device.js';
import { LutronDeviceType, LutronDevice, LutronZone } from './types.js';
import logger from '../../utils/logger.js';

/**
 * Map Lutron device type to unified capabilities.
 *
 * Each LEAP device type maps to one or more DeviceCapability enums.
 * Pico remotes and sensors have read-only capabilities (events only).
 *
 * @param deviceType LEAP device type identifier
 * @returns Array of unified capabilities
 */
export function mapDeviceTypeToCapabilities(deviceType: LutronDeviceType): DeviceCapability[] {
  const mapping: Record<LutronDeviceType, DeviceCapability[]> = {
    // Dimmers (switch + dimmer capabilities)
    [LutronDeviceType.WALL_DIMMER]: [DeviceCapability.SWITCH, DeviceCapability.DIMMER],
    [LutronDeviceType.PLUG_IN_DIMMER]: [DeviceCapability.SWITCH, DeviceCapability.DIMMER],

    // Switches (on/off only)
    [LutronDeviceType.WALL_SWITCH]: [DeviceCapability.SWITCH],

    // Shades and blinds
    [LutronDeviceType.SERENA_HONEYCOMB_SHADE]: [DeviceCapability.SHADE],
    [LutronDeviceType.SERENA_ROLLER_SHADE]: [DeviceCapability.SHADE],
    [LutronDeviceType.SERENA_WOOD_BLIND]: [DeviceCapability.SHADE],
    [LutronDeviceType.TRIATHLON_HONEYCOMB_SHADE]: [DeviceCapability.SHADE],

    // Fan control
    [LutronDeviceType.CASETA_FAN_SPEED_CONTROLLER]: [DeviceCapability.FAN],

    // Pico remotes and keypads (button events)
    [LutronDeviceType.PICO_KEYPAD]: [DeviceCapability.BUTTON],
    [LutronDeviceType.SEETOUCH_KEYPAD]: [DeviceCapability.BUTTON],

    // Sensors
    [LutronDeviceType.OCCUPANCY_SENSOR]: [DeviceCapability.OCCUPANCY_SENSOR],
    [LutronDeviceType.MOTION_SENSOR]: [DeviceCapability.MOTION_SENSOR],
  };

  const capabilities = mapping[deviceType];

  if (!capabilities) {
    logger.warn('Unmapped Lutron device type', { deviceType });
    return [];
  }

  return capabilities;
}

/**
 * Map unified capability to Lutron device type(s).
 *
 * Reverse mapping for capability → device type.
 * Some capabilities map to multiple device types.
 *
 * @param capability Unified capability enum
 * @returns Array of compatible LEAP device types
 */
export function mapCapabilityToDeviceTypes(capability: DeviceCapability): LutronDeviceType[] {
  const mapping: Record<DeviceCapability, LutronDeviceType[]> = {
    [DeviceCapability.SWITCH]: [
      LutronDeviceType.WALL_SWITCH,
      LutronDeviceType.WALL_DIMMER,
      LutronDeviceType.PLUG_IN_DIMMER,
    ],
    [DeviceCapability.DIMMER]: [LutronDeviceType.WALL_DIMMER, LutronDeviceType.PLUG_IN_DIMMER],
    [DeviceCapability.SHADE]: [
      LutronDeviceType.SERENA_HONEYCOMB_SHADE,
      LutronDeviceType.SERENA_ROLLER_SHADE,
      LutronDeviceType.SERENA_WOOD_BLIND,
      LutronDeviceType.TRIATHLON_HONEYCOMB_SHADE,
    ],
    [DeviceCapability.FAN]: [LutronDeviceType.CASETA_FAN_SPEED_CONTROLLER],
    [DeviceCapability.BUTTON]: [LutronDeviceType.PICO_KEYPAD, LutronDeviceType.SEETOUCH_KEYPAD],
    [DeviceCapability.OCCUPANCY_SENSOR]: [LutronDeviceType.OCCUPANCY_SENSOR],
    [DeviceCapability.MOTION_SENSOR]: [LutronDeviceType.MOTION_SENSOR],

    // Capabilities not supported by Lutron
    [DeviceCapability.COLOR]: [],
    [DeviceCapability.COLOR_TEMPERATURE]: [],
    [DeviceCapability.THERMOSTAT]: [],
    [DeviceCapability.LOCK]: [],
    [DeviceCapability.VALVE]: [],
    [DeviceCapability.ALARM]: [],
    [DeviceCapability.DOOR_CONTROL]: [],
    [DeviceCapability.TEMPERATURE_SENSOR]: [],
    [DeviceCapability.HUMIDITY_SENSOR]: [],
    [DeviceCapability.CONTACT_SENSOR]: [],
    [DeviceCapability.ILLUMINANCE_SENSOR]: [],
    [DeviceCapability.BATTERY]: [],
    [DeviceCapability.AIR_QUALITY_SENSOR]: [],
    [DeviceCapability.WATER_LEAK_SENSOR]: [],
    [DeviceCapability.SMOKE_DETECTOR]: [],
    [DeviceCapability.PRESSURE_SENSOR]: [],
    [DeviceCapability.CO_DETECTOR]: [],
    [DeviceCapability.SOUND_SENSOR]: [],
    [DeviceCapability.ENERGY_METER]: [],
    [DeviceCapability.SPEAKER]: [],
    [DeviceCapability.MEDIA_PLAYER]: [],
    [DeviceCapability.CAMERA]: [],
    [DeviceCapability.ROBOT_VACUUM]: [],
    [DeviceCapability.IR_BLASTER]: [],
  };

  return mapping[capability] ?? [];
}

/**
 * Extract capabilities from Lutron device.
 *
 * Analyzes device structure and extracts all supported capabilities.
 *
 * @param device LEAP device object
 * @returns Array of unified capabilities
 */
export function extractDeviceCapabilities(device: LutronDevice): DeviceCapability[] {
  const capabilities = new Set<DeviceCapability>();

  // Add capabilities based on device type
  const typeCapabilities = mapDeviceTypeToCapabilities(device.type);
  typeCapabilities.forEach((cap) => capabilities.add(cap));

  // Pico remotes with occupancy sensors
  if (device.occupancySensor) {
    capabilities.add(DeviceCapability.OCCUPANCY_SENSOR);
  }

  return Array.from(capabilities);
}

/**
 * Check if device type supports control commands.
 *
 * Pico remotes and sensors are read-only (events only).
 *
 * @param deviceType LEAP device type
 * @returns True if device supports commands
 */
export function isControllableDevice(deviceType: LutronDeviceType): boolean {
  const controllableTypes = [
    LutronDeviceType.WALL_DIMMER,
    LutronDeviceType.WALL_SWITCH,
    LutronDeviceType.PLUG_IN_DIMMER,
    LutronDeviceType.SERENA_HONEYCOMB_SHADE,
    LutronDeviceType.SERENA_ROLLER_SHADE,
    LutronDeviceType.SERENA_WOOD_BLIND,
    LutronDeviceType.TRIATHLON_HONEYCOMB_SHADE,
    LutronDeviceType.CASETA_FAN_SPEED_CONTROLLER,
  ];

  return controllableTypes.includes(deviceType);
}

/**
 * Check if device type is a shade/blind.
 *
 * @param deviceType LEAP device type
 * @returns True if device is a shade
 */
export function isShadeDevice(deviceType: LutronDeviceType): boolean {
  const shadeTypes = [
    LutronDeviceType.SERENA_HONEYCOMB_SHADE,
    LutronDeviceType.SERENA_ROLLER_SHADE,
    LutronDeviceType.SERENA_WOOD_BLIND,
    LutronDeviceType.TRIATHLON_HONEYCOMB_SHADE,
  ];

  return shadeTypes.includes(deviceType);
}

/**
 * Check if device type is a dimmer (supports level control).
 *
 * @param deviceType LEAP device type
 * @returns True if device is a dimmer
 */
export function isDimmerDevice(deviceType: LutronDeviceType): boolean {
  const dimmerTypes = [LutronDeviceType.WALL_DIMMER, LutronDeviceType.PLUG_IN_DIMMER];

  return dimmerTypes.includes(deviceType);
}

/**
 * Check if device type is a fan controller.
 *
 * @param deviceType LEAP device type
 * @returns True if device is a fan controller
 */
export function isFanDevice(deviceType: LutronDeviceType): boolean {
  return deviceType === LutronDeviceType.CASETA_FAN_SPEED_CONTROLLER;
}

/**
 * Normalize Lutron level to standard 0-100 range.
 *
 * Lutron already uses 0-100 scale, so this is a pass-through
 * for consistency with other platforms.
 *
 * @param level Lutron level (0-100)
 * @returns Normalized level (0-100)
 */
export function normalizeLevel(level: number): number {
  return Math.max(0, Math.min(100, Math.round(level)));
}

/**
 * Denormalize standard level to Lutron level.
 *
 * Reverse of normalizeLevel (pass-through for Lutron).
 *
 * @param level Standard level (0-100)
 * @returns Lutron level (0-100)
 */
export function denormalizeLevel(level: number): number {
  return Math.max(0, Math.min(100, Math.round(level)));
}

/**
 * Map fan speed level to Lutron fan levels.
 *
 * Caseta Fan Speed Controller supports 5 levels: 0%, 25%, 50%, 75%, 100%.
 * Maps arbitrary 0-100 values to nearest supported level.
 *
 * @param level Fan speed level (0-100)
 * @returns Nearest Lutron fan level
 */
export function mapFanSpeed(level: number): number {
  const levels = [0, 25, 50, 75, 100];

  // Find nearest supported level
  return levels.reduce((prev, curr) =>
    Math.abs(curr - level) < Math.abs(prev - level) ? curr : prev
  );
}

/**
 * Get human-readable device type name.
 *
 * @param deviceType LEAP device type
 * @returns Human-readable device type name
 */
export function getDeviceTypeName(deviceType: LutronDeviceType): string {
  const names: Record<LutronDeviceType, string> = {
    [LutronDeviceType.WALL_DIMMER]: 'Wall Dimmer',
    [LutronDeviceType.WALL_SWITCH]: 'Wall Switch',
    [LutronDeviceType.PLUG_IN_DIMMER]: 'Plug-in Dimmer',
    [LutronDeviceType.SERENA_HONEYCOMB_SHADE]: 'Serena Honeycomb Shade',
    [LutronDeviceType.SERENA_ROLLER_SHADE]: 'Serena Roller Shade',
    [LutronDeviceType.SERENA_WOOD_BLIND]: 'Serena Wood Blind',
    [LutronDeviceType.TRIATHLON_HONEYCOMB_SHADE]: 'Triathlon Honeycomb Shade',
    [LutronDeviceType.CASETA_FAN_SPEED_CONTROLLER]: 'Caseta Fan Speed Controller',
    [LutronDeviceType.PICO_KEYPAD]: 'Pico Remote',
    [LutronDeviceType.SEETOUCH_KEYPAD]: 'seeTouch Keypad',
    [LutronDeviceType.OCCUPANCY_SENSOR]: 'Occupancy Sensor',
    [LutronDeviceType.MOTION_SENSOR]: 'Motion Sensor',
  };

  return names[deviceType] ?? deviceType;
}
