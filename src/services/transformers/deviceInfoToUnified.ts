/**
 * Device transformation from SmartThings DeviceInfo to UnifiedDevice.
 *
 * This module bridges the gap between SmartThings-specific DeviceInfo format
 * and the platform-agnostic UnifiedDevice model used by DeviceRegistry and SemanticIndex.
 *
 * Design Decisions:
 * - Capability Mapping: SmartThings capability strings → DeviceCapability enum
 * - Graceful Degradation: Unknown capabilities are skipped without errors
 * - Online Status: Default to true if no status provided (optimistic approach)
 * - Platform-Specific Preservation: Original metadata stored in platformSpecific field
 *
 * Trade-offs:
 * - Optimistic Online Status: Assumes devices are online by default
 *   - Pro: Better UX for devices that don't report status frequently
 *   - Con: May show offline devices as online briefly
 *   - Mitigation: Status polling should update this quickly
 *
 * Performance:
 * - Time Complexity: O(n) where n = number of capabilities
 * - Space Complexity: O(n) for capability array transformation
 * - Expected: <1ms for typical devices (10-20 capabilities)
 *
 * @module services/transformers/deviceInfoToUnified
 */

import type { DeviceInfo, DeviceStatus } from '../../types/smartthings.js';
import {
  Platform,
  DeviceCapability,
  createUniversalDeviceId,
  type UnifiedDevice,
} from '../../types/unified-device.js';

/**
 * Capability mapping from SmartThings capability strings to DeviceCapability enum.
 *
 * Design Rationale:
 * - Comprehensive Coverage: Maps 25+ common SmartThings capabilities
 * - Semantic Mapping: Names preserved where possible (switch→SWITCH)
 * - Multi-Source Handling: Some capabilities map from multiple ST sources
 *   (energyMeter OR powerMeter → ENERGY_METER)
 *
 * Maintenance Notes:
 * - Add new mappings when supporting new device types
 * - Keep in sync with DeviceCapability enum additions
 * - Document any non-obvious mappings
 */
const CAPABILITY_MAP: Record<string, DeviceCapability> = {
  // Control Capabilities
  switch: DeviceCapability.SWITCH,
  switchLevel: DeviceCapability.DIMMER,
  colorControl: DeviceCapability.COLOR,
  colorTemperature: DeviceCapability.COLOR_TEMPERATURE,
  thermostat: DeviceCapability.THERMOSTAT,
  lock: DeviceCapability.LOCK,
  windowShade: DeviceCapability.SHADE,
  fanSpeed: DeviceCapability.FAN,
  valve: DeviceCapability.VALVE,
  alarm: DeviceCapability.ALARM,
  doorControl: DeviceCapability.DOOR_CONTROL,
  garageDoorControl: DeviceCapability.DOOR_CONTROL, // Alias for garage doors

  // Sensor Capabilities
  temperatureMeasurement: DeviceCapability.TEMPERATURE_SENSOR,
  relativeHumidityMeasurement: DeviceCapability.HUMIDITY_SENSOR,
  motionSensor: DeviceCapability.MOTION_SENSOR,
  contactSensor: DeviceCapability.CONTACT_SENSOR,
  occupancySensor: DeviceCapability.OCCUPANCY_SENSOR,
  illuminanceMeasurement: DeviceCapability.ILLUMINANCE_SENSOR,
  battery: DeviceCapability.BATTERY,
  airQualitySensor: DeviceCapability.AIR_QUALITY_SENSOR,
  waterSensor: DeviceCapability.WATER_LEAK_SENSOR,
  smokeDetector: DeviceCapability.SMOKE_DETECTOR,
  button: DeviceCapability.BUTTON,
  pressureMeasurement: DeviceCapability.PRESSURE_SENSOR,
  carbonMonoxideDetector: DeviceCapability.CO_DETECTOR,
  soundSensor: DeviceCapability.SOUND_SENSOR,

  // Composite Capabilities
  energyMeter: DeviceCapability.ENERGY_METER,
  powerMeter: DeviceCapability.ENERGY_METER, // Both map to same capability
  audioVolume: DeviceCapability.SPEAKER,
  speaker: DeviceCapability.SPEAKER,
  mediaPlayback: DeviceCapability.MEDIA_PLAYER,
  videoCamera: DeviceCapability.CAMERA,
  robotCleanerCleaningMode: DeviceCapability.ROBOT_VACUUM, // SmartThings robot vacuum
  infraredLevel: DeviceCapability.IR_BLASTER,
};

/**
 * Map SmartThings capability string to unified DeviceCapability enum.
 *
 * @param stCapability SmartThings capability string (e.g., "switch", "switchLevel")
 * @returns DeviceCapability enum value, or undefined if not mapped
 *
 * @example
 * ```typescript
 * mapCapability("switch")          // DeviceCapability.SWITCH
 * mapCapability("switchLevel")     // DeviceCapability.DIMMER
 * mapCapability("unknownCapability") // undefined
 * ```
 */
function mapCapability(stCapability: string): DeviceCapability | undefined {
  return CAPABILITY_MAP[stCapability];
}

/**
 * Extract online status from DeviceStatus.
 *
 * Design Decision: Default to True
 * - SmartThings doesn't always provide explicit online/offline status
 * - Most devices are online when they have recent status updates
 * - False positives (showing offline device as online) are rare and temporary
 * - False negatives (showing online device as offline) would be worse UX
 *
 * Status Extraction Logic:
 * 1. Check for explicit "healthCheck" capability with "online" attribute
 * 2. Check for "DeviceHealth" component (older SmartThings pattern)
 * 3. Default to true if no status provided or no health indicators
 *
 * @param status Optional DeviceStatus from SmartThings API
 * @returns Online status (true if online or unknown)
 */
function extractOnlineStatus(status?: DeviceStatus): boolean {
  if (!status?.components) {
    return true; // Optimistic default
  }

  // Check main component for health status
  const mainComponent = status.components['main'];
  if (mainComponent) {
    // Modern health check capability
    if (mainComponent['healthCheck']?.['healthStatus']?.value === 'offline') {
      return false;
    }

    // Legacy device health
    if (mainComponent['DeviceHealth']?.['DeviceWatch_DeviceStatus']?.value === 'offline') {
      return false;
    }
  }

  // No offline indicators found → assume online
  return true;
}

/**
 * Extract last seen timestamp from DeviceStatus.
 *
 * Looks for most recent timestamp across all component capabilities.
 * Used to determine when device last communicated with platform.
 *
 * @param status Optional DeviceStatus from SmartThings API
 * @returns Most recent timestamp as Date, or undefined if no timestamps
 */
function extractLastSeen(status?: DeviceStatus): Date | undefined {
  if (!status?.components) {
    return undefined;
  }

  let mostRecent: Date | undefined;

  for (const component of Object.values(status.components)) {
    for (const capability of Object.values(component)) {
      for (const attribute of Object.values(capability)) {
        if (attribute.timestamp) {
          const timestamp = new Date(attribute.timestamp);
          if (!mostRecent || timestamp > mostRecent) {
            mostRecent = timestamp;
          }
        }
      }
    }
  }

  return mostRecent;
}

/**
 * Transform SmartThings DeviceInfo to UnifiedDevice format.
 *
 * This is the primary transformation function that bridges SmartThings-specific
 * device representation to the platform-agnostic UnifiedDevice model.
 *
 * Transformation Strategy:
 * 1. Identity: Create universal ID with "smartthings:" prefix
 * 2. Capabilities: Map ST capability strings to DeviceCapability enum
 * 3. Status: Extract online/lastSeen from optional DeviceStatus
 * 4. Metadata: Preserve room, location, and ST-specific fields
 *
 * Error Handling:
 * - Unknown capabilities: Silently skipped (no errors thrown)
 * - Missing status: Defaults to online=true, lastSeen=undefined
 * - Missing optional fields: Handled gracefully with undefined
 *
 * Data Consistency:
 * - Universal ID format guaranteed: "smartthings:{deviceId}"
 * - Platform always set to Platform.SMARTTHINGS
 * - Capabilities array never includes undefined values
 *
 * @param deviceInfo SmartThings device information
 * @param status Optional device status for online/lastSeen data
 * @returns UnifiedDevice with normalized platform-agnostic structure
 *
 * @example
 * ```typescript
 * const deviceInfo: DeviceInfo = {
 *   deviceId: 'abc-123' as DeviceId,
 *   name: 'Living Room Light',
 *   label: 'Main Light',
 *   capabilities: ['switch', 'switchLevel', 'colorControl'],
 *   roomName: 'Living Room',
 * };
 *
 * const unified = toUnifiedDevice(deviceInfo);
 * // {
 * //   id: 'smartthings:abc-123',
 * //   platform: Platform.SMARTTHINGS,
 * //   name: 'Living Room Light',
 * //   capabilities: [SWITCH, DIMMER, COLOR],
 * //   online: true,
 * //   ...
 * // }
 * ```
 */
export function toUnifiedDevice(deviceInfo: DeviceInfo, status?: DeviceStatus): UnifiedDevice {
  // Map capabilities, filtering out unknown ones
  const capabilities: DeviceCapability[] = (deviceInfo.capabilities || [])
    .map(mapCapability)
    .filter((cap): cap is DeviceCapability => cap !== undefined);

  // Extract status information
  const online = extractOnlineStatus(status);
  const lastSeen = extractLastSeen(status);

  // Build platform-specific metadata
  const platformSpecific: Record<string, unknown> = {};
  if (deviceInfo.type) platformSpecific['type'] = deviceInfo.type;
  if (deviceInfo.components) platformSpecific['components'] = deviceInfo.components;
  if (deviceInfo.locationId) platformSpecific['locationId'] = deviceInfo.locationId;
  if (deviceInfo.roomId) platformSpecific['roomId'] = deviceInfo.roomId;

  return {
    // Identity
    id: createUniversalDeviceId(Platform.SMARTTHINGS, deviceInfo.deviceId),
    platform: Platform.SMARTTHINGS,
    platformDeviceId: deviceInfo.deviceId,

    // Metadata
    name: deviceInfo.name,
    label: deviceInfo.label,
    manufacturer: undefined, // Not available in DeviceInfo
    model: undefined, // Not available in DeviceInfo
    firmwareVersion: undefined, // Not available in DeviceInfo

    // Organization
    room: deviceInfo.roomName,
    location: undefined, // Location name not available in DeviceInfo

    // Capabilities
    capabilities,

    // State
    online,
    lastSeen,

    // Platform-specific
    platformSpecific: Object.keys(platformSpecific).length > 0 ? platformSpecific : undefined,
  };
}
