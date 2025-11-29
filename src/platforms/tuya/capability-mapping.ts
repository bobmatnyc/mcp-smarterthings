/**
 * Tuya capability mapping module.
 *
 * Maps between Tuya DP codes and unified DeviceCapability enums.
 * Handles bidirectional translation for device discovery and command execution.
 *
 * Design Decision: Separate mapping module
 * Rationale: Keeps capability logic isolated from adapter implementation,
 * enabling easy updates when new device types are added.
 *
 * @module platforms/tuya/capability-mapping
 */

import { DeviceCapability } from '../../types/unified-device.js';
import { TuyaDPCodes, type TuyaDPCode, type TuyaDevice } from './types.js';

/**
 * Map Tuya DP code to unified device capability.
 *
 * Handles the translation from Tuya's DP-based model to our
 * unified capability model.
 *
 * @param dpCode Tuya DP code (e.g., 'switch_1', 'bright_value')
 * @returns Unified capability or null if unmapped
 *
 * @example
 * ```typescript
 * mapDPToCapability('switch_1') // DeviceCapability.SWITCH
 * mapDPToCapability('bright_value') // DeviceCapability.DIMMER
 * mapDPToCapability('colour_data') // DeviceCapability.COLOR
 * ```
 */
export function mapDPToCapability(dpCode: TuyaDPCode): DeviceCapability | null {
  const mapping: Record<string, DeviceCapability> = {
    // Switch capabilities
    [TuyaDPCodes.SWITCH_LED]: DeviceCapability.SWITCH,
    [TuyaDPCodes.SWITCH_1]: DeviceCapability.SWITCH,
    [TuyaDPCodes.SWITCH_2]: DeviceCapability.SWITCH,
    [TuyaDPCodes.SWITCH_3]: DeviceCapability.SWITCH,
    [TuyaDPCodes.SWITCH_4]: DeviceCapability.SWITCH,

    // Dimmer capabilities
    [TuyaDPCodes.BRIGHT_VALUE]: DeviceCapability.DIMMER,
    [TuyaDPCodes.BRIGHT_VALUE_1]: DeviceCapability.DIMMER,
    [TuyaDPCodes.BRIGHT_VALUE_2]: DeviceCapability.DIMMER,

    // Color capabilities
    [TuyaDPCodes.COLOUR_DATA]: DeviceCapability.COLOR,
    [TuyaDPCodes.COLOUR_DATA_V2]: DeviceCapability.COLOR,

    // Color temperature capabilities
    [TuyaDPCodes.TEMP_VALUE]: DeviceCapability.COLOR_TEMPERATURE,
    [TuyaDPCodes.TEMP_VALUE_V2]: DeviceCapability.COLOR_TEMPERATURE,

    // Sensor capabilities
    [TuyaDPCodes.PIR]: DeviceCapability.MOTION_SENSOR,
    [TuyaDPCodes.DOORCONTACT_STATE]: DeviceCapability.CONTACT_SENSOR,
    [TuyaDPCodes.TEMP_CURRENT]: DeviceCapability.TEMPERATURE_SENSOR,
    [TuyaDPCodes.HUMIDITY_VALUE]: DeviceCapability.HUMIDITY_SENSOR,
    [TuyaDPCodes.BATTERY_PERCENTAGE]: DeviceCapability.BATTERY,
    [TuyaDPCodes.SMOKE_SENSOR_STATUS]: DeviceCapability.SMOKE_DETECTOR,
    [TuyaDPCodes.WATERSENSOR_STATE]: DeviceCapability.WATER_LEAK_SENSOR,

    // Energy monitoring
    [TuyaDPCodes.CUR_POWER]: DeviceCapability.ENERGY_METER,

    // Curtain/shade
    [TuyaDPCodes.PERCENT_CONTROL]: DeviceCapability.SHADE,
    [TuyaDPCodes.PERCENT_STATE]: DeviceCapability.SHADE,

    // Lock
    [TuyaDPCodes.UNLOCK_FINGERPRINT]: DeviceCapability.LOCK,
    [TuyaDPCodes.UNLOCK_PASSWORD]: DeviceCapability.LOCK,
    [TuyaDPCodes.LOCK_STATE]: DeviceCapability.LOCK,

    // Thermostat
    [TuyaDPCodes.TEMP_SET]: DeviceCapability.THERMOSTAT,

    // Fan
    [TuyaDPCodes.FAN_SPEED]: DeviceCapability.FAN,

    // Air quality
    [TuyaDPCodes.PM25]: DeviceCapability.AIR_QUALITY_SENSOR,
    [TuyaDPCodes.VOC]: DeviceCapability.AIR_QUALITY_SENSOR,
    [TuyaDPCodes.CO2]: DeviceCapability.AIR_QUALITY_SENSOR,

    // Camera
    [TuyaDPCodes.MOTION_SWITCH]: DeviceCapability.CAMERA,
    [TuyaDPCodes.RECORD_SWITCH]: DeviceCapability.CAMERA,
  };

  return mapping[dpCode] ?? null;
}

/**
 * Map unified capability to primary Tuya DP code.
 *
 * Returns the primary DP code used to control a given capability.
 * Note: Some capabilities may have multiple DP codes (e.g., multi-gang switches).
 *
 * @param capability Unified capability enum
 * @returns Primary Tuya DP code or null if unmapped
 *
 * @example
 * ```typescript
 * mapCapabilityToDP(DeviceCapability.SWITCH) // 'switch_1'
 * mapCapabilityToDP(DeviceCapability.DIMMER) // 'bright_value'
 * mapCapabilityToDP(DeviceCapability.COLOR) // 'colour_data'
 * ```
 */
export function mapCapabilityToDP(capability: DeviceCapability): TuyaDPCode | null {
  const mapping: Record<DeviceCapability, TuyaDPCode> = {
    // Control capabilities
    [DeviceCapability.SWITCH]: TuyaDPCodes.SWITCH_1,
    [DeviceCapability.DIMMER]: TuyaDPCodes.BRIGHT_VALUE,
    [DeviceCapability.COLOR]: TuyaDPCodes.COLOUR_DATA,
    [DeviceCapability.COLOR_TEMPERATURE]: TuyaDPCodes.TEMP_VALUE,
    [DeviceCapability.THERMOSTAT]: TuyaDPCodes.TEMP_SET,
    [DeviceCapability.LOCK]: TuyaDPCodes.LOCK_STATE,
    [DeviceCapability.SHADE]: TuyaDPCodes.PERCENT_CONTROL,
    [DeviceCapability.FAN]: TuyaDPCodes.FAN_SPEED,
    [DeviceCapability.VALVE]: TuyaDPCodes.SWITCH_1, // Treat as switch
    [DeviceCapability.ALARM]: TuyaDPCodes.SWITCH_1, // Treat as switch
    [DeviceCapability.DOOR_CONTROL]: TuyaDPCodes.SWITCH_1, // Treat as switch

    // Sensor capabilities (read-only, no command mapping)
    [DeviceCapability.TEMPERATURE_SENSOR]: TuyaDPCodes.TEMP_CURRENT,
    [DeviceCapability.HUMIDITY_SENSOR]: TuyaDPCodes.HUMIDITY_VALUE,
    [DeviceCapability.MOTION_SENSOR]: TuyaDPCodes.PIR,
    [DeviceCapability.CONTACT_SENSOR]: TuyaDPCodes.DOORCONTACT_STATE,
    [DeviceCapability.OCCUPANCY_SENSOR]: TuyaDPCodes.PIR, // Use PIR for occupancy
    [DeviceCapability.ILLUMINANCE_SENSOR]: '', // Not commonly available on Tuya
    [DeviceCapability.BATTERY]: TuyaDPCodes.BATTERY_PERCENTAGE,
    [DeviceCapability.AIR_QUALITY_SENSOR]: TuyaDPCodes.PM25,
    [DeviceCapability.WATER_LEAK_SENSOR]: TuyaDPCodes.WATERSENSOR_STATE,
    [DeviceCapability.SMOKE_DETECTOR]: TuyaDPCodes.SMOKE_SENSOR_STATUS,
    [DeviceCapability.BUTTON]: '', // Not applicable
    [DeviceCapability.PRESSURE_SENSOR]: '', // Not commonly available
    [DeviceCapability.CO_DETECTOR]: TuyaDPCodes.CO2,
    [DeviceCapability.SOUND_SENSOR]: '', // Not commonly available

    // Composite capabilities
    [DeviceCapability.ENERGY_METER]: TuyaDPCodes.CUR_POWER,
    [DeviceCapability.SPEAKER]: '', // Not commonly available
    [DeviceCapability.MEDIA_PLAYER]: '', // Not commonly available
    [DeviceCapability.CAMERA]: TuyaDPCodes.MOTION_SWITCH,
    [DeviceCapability.ROBOT_VACUUM]: '', // Complex, multiple DPs
    [DeviceCapability.IR_BLASTER]: '', // Not applicable to cloud API
  };

  const dpCode = mapping[capability];
  return dpCode && dpCode.length > 0 ? dpCode : null;
}

/**
 * Extract all capabilities from a Tuya device.
 *
 * Analyzes device status DPs and category to determine supported capabilities.
 *
 * @param device Tuya device object from API
 * @returns Array of unified capabilities
 *
 * @example
 * ```typescript
 * const device = await tuyaClient.getDevice('device123');
 * const capabilities = extractDeviceCapabilities(device);
 * // [DeviceCapability.SWITCH, DeviceCapability.DIMMER, DeviceCapability.COLOR]
 * ```
 */
export function extractDeviceCapabilities(device: TuyaDevice): DeviceCapability[] {
  const capabilities = new Set<DeviceCapability>();

  // Extract capabilities from status DPs
  if (device.status && Array.isArray(device.status)) {
    for (const dp of device.status) {
      const capability = mapDPToCapability(dp.code);
      if (capability) {
        capabilities.add(capability);
      }
    }
  }

  // Add category-based capabilities (if DPs not available)
  const categoryCapabilities = getCategoryCapabilities(device.category);
  for (const cap of categoryCapabilities) {
    capabilities.add(cap);
  }

  return Array.from(capabilities);
}

/**
 * Get expected capabilities for a device category.
 *
 * Provides fallback capabilities when device status is unavailable.
 *
 * @param category Tuya device category code
 * @returns Array of expected capabilities for category
 */
function getCategoryCapabilities(category: string): DeviceCapability[] {
  const categoryMapping: Record<string, DeviceCapability[]> = {
    // Lights
    dj: [DeviceCapability.SWITCH, DeviceCapability.DIMMER, DeviceCapability.COLOR],
    dd: [DeviceCapability.SWITCH, DeviceCapability.DIMMER, DeviceCapability.COLOR],
    xdd: [DeviceCapability.SWITCH, DeviceCapability.DIMMER],
    fwd: [DeviceCapability.SWITCH, DeviceCapability.COLOR],

    // Switches
    kg: [DeviceCapability.SWITCH],
    cz: [DeviceCapability.SWITCH, DeviceCapability.ENERGY_METER],
    tdq: [DeviceCapability.SWITCH, DeviceCapability.DIMMER],
    pc: [DeviceCapability.SWITCH, DeviceCapability.ENERGY_METER],

    // Sensors
    pir: [DeviceCapability.MOTION_SENSOR, DeviceCapability.BATTERY],
    mcs: [DeviceCapability.CONTACT_SENSOR, DeviceCapability.BATTERY],
    wsdcg: [
      DeviceCapability.TEMPERATURE_SENSOR,
      DeviceCapability.HUMIDITY_SENSOR,
      DeviceCapability.BATTERY,
    ],
    ywbj: [DeviceCapability.SMOKE_DETECTOR, DeviceCapability.BATTERY],
    sj: [DeviceCapability.WATER_LEAK_SENSOR, DeviceCapability.BATTERY],

    // Climate
    wk: [DeviceCapability.THERMOSTAT, DeviceCapability.TEMPERATURE_SENSOR],
    fs: [DeviceCapability.SWITCH, DeviceCapability.FAN],

    // Covers
    cl: [DeviceCapability.SHADE],

    // Security
    ms: [DeviceCapability.LOCK, DeviceCapability.BATTERY],
    sp: [DeviceCapability.CAMERA, DeviceCapability.MOTION_SENSOR],

    // Other
    kqjcy: [DeviceCapability.AIR_QUALITY_SENSOR, DeviceCapability.TEMPERATURE_SENSOR],
    sd: [DeviceCapability.ROBOT_VACUUM, DeviceCapability.BATTERY],
  };

  return categoryMapping[category] ?? [];
}

/**
 * Normalize brightness value from Tuya scale to 0-100%.
 *
 * Tuya devices use different brightness scales:
 * - 0-1000 (most common)
 * - 0-255 (some devices)
 * - 0-100 (standardized)
 *
 * This function normalizes to 0-100 range.
 *
 * @param value Tuya brightness value
 * @param scale Maximum value in Tuya scale (default: 1000)
 * @returns Normalized brightness (0-100)
 *
 * @example
 * ```typescript
 * normalizeBrightness(500, 1000) // 50
 * normalizeBrightness(128, 255) // 50
 * normalizeBrightness(50, 100) // 50
 * ```
 */
export function normalizeBrightness(value: number, scale: number = 1000): number {
  return Math.round((value / scale) * 100);
}

/**
 * Denormalize brightness value from 0-100% to Tuya scale.
 *
 * Converts unified brightness (0-100) back to Tuya device scale.
 *
 * @param percentage Unified brightness (0-100)
 * @param scale Maximum value in Tuya scale (default: 1000)
 * @returns Tuya brightness value
 *
 * @example
 * ```typescript
 * denormalizeBrightness(50, 1000) // 500
 * denormalizeBrightness(50, 255) // 128
 * denormalizeBrightness(50, 100) // 50
 * ```
 */
export function denormalizeBrightness(percentage: number, scale: number = 1000): number {
  return Math.round((percentage / 100) * scale);
}

/**
 * Normalize color temperature from Tuya scale to Kelvin.
 *
 * Tuya devices typically use 0-1000 scale for color temperature.
 * This converts to Kelvin (2700K-6500K typical range).
 *
 * @param value Tuya color temperature value
 * @param minKelvin Minimum Kelvin (default: 2700)
 * @param maxKelvin Maximum Kelvin (default: 6500)
 * @returns Color temperature in Kelvin
 */
export function normalizeColorTemperature(
  value: number,
  minKelvin: number = 2700,
  maxKelvin: number = 6500
): number {
  const range = maxKelvin - minKelvin;
  return Math.round(minKelvin + (value / 1000) * range);
}

/**
 * Denormalize color temperature from Kelvin to Tuya scale.
 *
 * @param kelvin Color temperature in Kelvin
 * @param minKelvin Minimum Kelvin (default: 2700)
 * @param maxKelvin Maximum Kelvin (default: 6500)
 * @returns Tuya color temperature value (0-1000)
 */
export function denormalizeColorTemperature(
  kelvin: number,
  minKelvin: number = 2700,
  maxKelvin: number = 6500
): number {
  const range = maxKelvin - minKelvin;
  const normalized = (kelvin - minKelvin) / range;
  return Math.round(normalized * 1000);
}
