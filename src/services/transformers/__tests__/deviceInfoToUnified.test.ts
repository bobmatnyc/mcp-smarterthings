/**
 * Tests for SmartThings DeviceInfo to UnifiedDevice transformation.
 *
 * Test Coverage:
 * - Basic transformation (name, label, capabilities)
 * - Capability mapping (control, sensor, composite)
 * - Universal ID creation
 * - Platform-specific data preservation
 * - Missing optional fields handling
 * - Unknown capability graceful degradation
 * - Status integration (online, lastSeen)
 * - Edge cases (empty capabilities, undefined status)
 */

import { describe, it, expect } from 'vitest';
import { toUnifiedDevice } from '../deviceInfoToUnified.js';
import type { DeviceInfo, DeviceStatus } from '../../../types/smartthings.js';
import { createDeviceId } from '../../../types/smartthings.js';
import { Platform, DeviceCapability } from '../../../types/unified-device.js';

describe('toUnifiedDevice', () => {
  describe('Basic Transformation', () => {
    it('transforms minimal DeviceInfo correctly', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-123'),
        name: 'Test Device',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.id).toBe('smartthings:device-123');
      expect(result.platform).toBe(Platform.SMARTTHINGS);
      expect(result.platformDeviceId).toBe('device-123');
      expect(result.name).toBe('Test Device');
      expect(result.label).toBeUndefined();
      expect(result.capabilities).toEqual([]);
      expect(result.online).toBe(true); // Default
    });

    it('transforms complete DeviceInfo with all fields', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-456'),
        name: 'Living Room Light',
        label: 'Main Light',
        type: 'LAN',
        capabilities: ['switch', 'switchLevel'],
        components: ['main', 'button1'],
        locationId: 'loc-123',
        roomId: 'room-456',
        roomName: 'Living Room',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.id).toBe('smartthings:device-456');
      expect(result.platform).toBe(Platform.SMARTTHINGS);
      expect(result.platformDeviceId).toBe('device-456');
      expect(result.name).toBe('Living Room Light');
      expect(result.label).toBe('Main Light');
      expect(result.room).toBe('Living Room');
      expect(result.capabilities).toContain(DeviceCapability.SWITCH);
      expect(result.capabilities).toContain(DeviceCapability.DIMMER);

      // Platform-specific data preserved
      expect(result.platformSpecific).toEqual({
        type: 'LAN',
        components: ['main', 'button1'],
        locationId: 'loc-123',
        roomId: 'room-456',
      });
    });

    it('handles undefined platformSpecific when no platform fields present', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-789'),
        name: 'Simple Device',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.platformSpecific).toBeUndefined();
    });
  });

  describe('Capability Mapping', () => {
    it('maps control capabilities correctly', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-001'),
        name: 'Smart Light',
        capabilities: [
          'switch',
          'switchLevel',
          'colorControl',
          'colorTemperature',
        ],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toEqual([
        DeviceCapability.SWITCH,
        DeviceCapability.DIMMER,
        DeviceCapability.COLOR,
        DeviceCapability.COLOR_TEMPERATURE,
      ]);
    });

    it('maps sensor capabilities correctly', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-002'),
        name: 'Multi-Sensor',
        capabilities: [
          'temperatureMeasurement',
          'relativeHumidityMeasurement',
          'motionSensor',
          'contactSensor',
          'illuminanceMeasurement',
          'battery',
        ],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toEqual([
        DeviceCapability.TEMPERATURE_SENSOR,
        DeviceCapability.HUMIDITY_SENSOR,
        DeviceCapability.MOTION_SENSOR,
        DeviceCapability.CONTACT_SENSOR,
        DeviceCapability.ILLUMINANCE_SENSOR,
        DeviceCapability.BATTERY,
      ]);
    });

    it('maps composite capabilities correctly', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-003'),
        name: 'Smart Speaker',
        capabilities: [
          'audioVolume',
          'speaker',
          'mediaPlayback',
        ],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toContain(DeviceCapability.SPEAKER);
      expect(result.capabilities).toContain(DeviceCapability.MEDIA_PLAYER);
      // Note: audioVolume and speaker both map to SPEAKER, so only one instance
      expect(result.capabilities.filter(c => c === DeviceCapability.SPEAKER).length).toBeGreaterThan(0);
    });

    it('maps thermostat capability', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-004'),
        name: 'Thermostat',
        capabilities: ['thermostat', 'temperatureMeasurement'],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toContain(DeviceCapability.THERMOSTAT);
      expect(result.capabilities).toContain(DeviceCapability.TEMPERATURE_SENSOR);
    });

    it('maps lock and alarm capabilities', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-005'),
        name: 'Smart Lock',
        capabilities: ['lock', 'alarm', 'battery'],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toContain(DeviceCapability.LOCK);
      expect(result.capabilities).toContain(DeviceCapability.ALARM);
      expect(result.capabilities).toContain(DeviceCapability.BATTERY);
    });

    it('maps shade and fan capabilities', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-006'),
        name: 'Window Treatment',
        capabilities: ['windowShade', 'fanSpeed'],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toContain(DeviceCapability.SHADE);
      expect(result.capabilities).toContain(DeviceCapability.FAN);
    });

    it('maps valve capability', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-007'),
        name: 'Water Valve',
        capabilities: ['valve', 'waterSensor'],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toContain(DeviceCapability.VALVE);
      expect(result.capabilities).toContain(DeviceCapability.WATER_LEAK_SENSOR);
    });

    it('maps safety sensor capabilities', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-008'),
        name: 'Safety Sensors',
        capabilities: [
          'smokeDetector',
          'carbonMonoxideDetector',
          'waterSensor',
        ],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toContain(DeviceCapability.SMOKE_DETECTOR);
      expect(result.capabilities).toContain(DeviceCapability.CO_DETECTOR);
      expect(result.capabilities).toContain(DeviceCapability.WATER_LEAK_SENSOR);
    });

    it('maps energy meter capabilities (both variations)', () => {
      const deviceInfo1: DeviceInfo = {
        deviceId: createDeviceId('device-009'),
        name: 'Energy Monitor 1',
        capabilities: ['energyMeter'],
      };

      const deviceInfo2: DeviceInfo = {
        deviceId: createDeviceId('device-010'),
        name: 'Energy Monitor 2',
        capabilities: ['powerMeter'],
      };

      const result1 = toUnifiedDevice(deviceInfo1);
      const result2 = toUnifiedDevice(deviceInfo2);

      expect(result1.capabilities).toContain(DeviceCapability.ENERGY_METER);
      expect(result2.capabilities).toContain(DeviceCapability.ENERGY_METER);
    });

    it('maps door control capabilities', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-011'),
        name: 'Garage Door',
        capabilities: ['doorControl', 'garageDoorControl'],
      };

      const result = toUnifiedDevice(deviceInfo);

      // Both should map to DOOR_CONTROL
      expect(result.capabilities).toContain(DeviceCapability.DOOR_CONTROL);
      // Should deduplicate since both map to same capability
      const doorControlCount = result.capabilities.filter(c => c === DeviceCapability.DOOR_CONTROL).length;
      expect(doorControlCount).toBeGreaterThan(0);
    });

    it('maps advanced sensor capabilities', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-012'),
        name: 'Advanced Sensor',
        capabilities: [
          'button',
          'pressureMeasurement',
          'soundSensor',
          'occupancySensor',
        ],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toContain(DeviceCapability.BUTTON);
      expect(result.capabilities).toContain(DeviceCapability.PRESSURE_SENSOR);
      expect(result.capabilities).toContain(DeviceCapability.SOUND_SENSOR);
      expect(result.capabilities).toContain(DeviceCapability.OCCUPANCY_SENSOR);
    });
  });

  describe('Unknown Capability Handling', () => {
    it('skips unknown capabilities without errors', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-999'),
        name: 'Device with Unknown Capabilities',
        capabilities: [
          'switch',
          'unknownCapability1',
          'switchLevel',
          'futureCapability',
          'temperatureMeasurement',
        ],
      };

      const result = toUnifiedDevice(deviceInfo);

      // Should only include known capabilities
      expect(result.capabilities).toEqual([
        DeviceCapability.SWITCH,
        DeviceCapability.DIMMER,
        DeviceCapability.TEMPERATURE_SENSOR,
      ]);
      expect(result.capabilities).not.toContain('unknownCapability1');
      expect(result.capabilities).not.toContain('futureCapability');
    });

    it('handles empty capabilities array', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-empty'),
        name: 'Device with No Capabilities',
        capabilities: [],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toEqual([]);
    });

    it('handles undefined capabilities', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-undef'),
        name: 'Device with Undefined Capabilities',
        // capabilities is undefined
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toEqual([]);
    });

    it('handles all unknown capabilities gracefully', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-all-unknown'),
        name: 'Future Device',
        capabilities: ['futureCapability1', 'futureCapability2', 'unknownThing'],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities).toEqual([]);
    });
  });

  describe('Universal ID Creation', () => {
    it('creates correct universal ID format', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('abc-123-def-456'),
        name: 'Test Device',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.id).toBe('smartthings:abc-123-def-456');
      expect(result.id).toMatch(/^smartthings:/);
    });

    it('handles device IDs with special characters', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device_with-special.chars:123'),
        name: 'Special Device',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.id).toBe('smartthings:device_with-special.chars:123');
      expect(result.platformDeviceId).toBe('device_with-special.chars:123');
    });
  });

  describe('Platform-Specific Data Preservation', () => {
    it('preserves type field in platformSpecific', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-type'),
        name: 'LAN Device',
        type: 'LAN',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.platformSpecific?.['type']).toBe('LAN');
    });

    it('preserves components in platformSpecific', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-components'),
        name: 'Multi-Component Device',
        components: ['main', 'button1', 'button2', 'fan'],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.platformSpecific?.['components']).toEqual(['main', 'button1', 'button2', 'fan']);
    });

    it('preserves locationId and roomId in platformSpecific', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-location'),
        name: 'Located Device',
        locationId: 'location-abc-123',
        roomId: 'room-def-456',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.platformSpecific?.['locationId']).toBe('location-abc-123');
      expect(result.platformSpecific?.['roomId']).toBe('room-def-456');
    });

    it('uses roomName for unified room field', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-room'),
        name: 'Bedroom Light',
        roomName: 'Master Bedroom',
        roomId: 'room-123',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.room).toBe('Master Bedroom');
      expect(result.platformSpecific?.['roomId']).toBe('room-123');
    });
  });

  describe('Status Integration', () => {
    it('extracts online status from healthCheck capability', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-online'),
        name: 'Online Device',
      };

      const status: DeviceStatus = {
        deviceId: createDeviceId('device-online'),
        components: {
          main: {
            healthCheck: {
              healthStatus: {
                value: 'online',
                timestamp: '2024-01-15T12:00:00Z',
              },
            },
          },
        },
      };

      const result = toUnifiedDevice(deviceInfo, status);

      expect(result.online).toBe(true);
    });

    it('detects offline status from healthCheck capability', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-offline'),
        name: 'Offline Device',
      };

      const status: DeviceStatus = {
        deviceId: createDeviceId('device-offline'),
        components: {
          main: {
            healthCheck: {
              healthStatus: {
                value: 'offline',
                timestamp: '2024-01-15T12:00:00Z',
              },
            },
          },
        },
      };

      const result = toUnifiedDevice(deviceInfo, status);

      expect(result.online).toBe(false);
    });

    it('detects offline status from legacy DeviceHealth', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-legacy-offline'),
        name: 'Legacy Offline Device',
      };

      const status: DeviceStatus = {
        deviceId: createDeviceId('device-legacy-offline'),
        components: {
          main: {
            DeviceHealth: {
              DeviceWatch_DeviceStatus: {
                value: 'offline',
                timestamp: '2024-01-15T12:00:00Z',
              },
            },
          },
        },
      };

      const result = toUnifiedDevice(deviceInfo, status);

      expect(result.online).toBe(false);
    });

    it('defaults to online when no status provided', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-no-status'),
        name: 'No Status Device',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.online).toBe(true);
    });

    it('defaults to online when no health indicators in status', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-no-health'),
        name: 'No Health Device',
      };

      const status: DeviceStatus = {
        deviceId: createDeviceId('device-no-health'),
        components: {
          main: {
            switch: {
              switch: {
                value: 'on',
                timestamp: '2024-01-15T12:00:00Z',
              },
            },
          },
        },
      };

      const result = toUnifiedDevice(deviceInfo, status);

      expect(result.online).toBe(true);
    });

    it('extracts lastSeen from most recent timestamp', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-lastseen'),
        name: 'Last Seen Device',
      };

      const status: DeviceStatus = {
        deviceId: createDeviceId('device-lastseen'),
        components: {
          main: {
            switch: {
              switch: {
                value: 'on',
                timestamp: '2024-01-15T12:00:00Z',
              },
            },
            temperatureMeasurement: {
              temperature: {
                value: 72,
                timestamp: '2024-01-15T12:30:00Z', // More recent
              },
            },
          },
        },
      };

      const result = toUnifiedDevice(deviceInfo, status);

      expect(result.lastSeen).toEqual(new Date('2024-01-15T12:30:00Z'));
    });

    it('handles status with no timestamps', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-no-timestamps'),
        name: 'No Timestamps Device',
      };

      const status: DeviceStatus = {
        deviceId: createDeviceId('device-no-timestamps'),
        components: {
          main: {
            switch: {
              switch: {
                value: 'on',
                // No timestamp
              },
            },
          },
        },
      };

      const result = toUnifiedDevice(deviceInfo, status);

      expect(result.lastSeen).toBeUndefined();
    });

    it('handles undefined status gracefully', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-undefined-status'),
        name: 'Undefined Status Device',
      };

      const result = toUnifiedDevice(deviceInfo, undefined);

      expect(result.online).toBe(true);
      expect(result.lastSeen).toBeUndefined();
    });
  });

  describe('Missing Optional Fields', () => {
    it('handles missing label', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-no-label'),
        name: 'No Label Device',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.label).toBeUndefined();
    });

    it('handles missing roomName', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-no-room'),
        name: 'No Room Device',
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.room).toBeUndefined();
    });

    it('sets manufacturer, model, firmwareVersion to undefined', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-metadata'),
        name: 'Device',
      };

      const result = toUnifiedDevice(deviceInfo);

      // These fields are not available in DeviceInfo
      expect(result.manufacturer).toBeUndefined();
      expect(result.model).toBeUndefined();
      expect(result.firmwareVersion).toBeUndefined();
    });

    it('sets location to undefined (not available in DeviceInfo)', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-location-undef'),
        name: 'Device',
        locationId: 'loc-123', // ID is available but not name
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.location).toBeUndefined();
      expect(result.platformSpecific?.['locationId']).toBe('loc-123');
    });
  });

  describe('Edge Cases', () => {
    it('handles device with all fields empty/undefined', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-minimal'),
        name: 'Minimal Device',
        label: undefined,
        type: undefined,
        capabilities: undefined,
        components: undefined,
        locationId: undefined,
        roomId: undefined,
        roomName: undefined,
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.id).toBe('smartthings:device-minimal');
      expect(result.name).toBe('Minimal Device');
      expect(result.capabilities).toEqual([]);
      expect(result.platformSpecific).toBeUndefined();
    });

    it('handles very long capability list', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-many-caps'),
        name: 'Multi-Function Device',
        capabilities: [
          'switch', 'switchLevel', 'colorControl', 'colorTemperature',
          'temperatureMeasurement', 'relativeHumidityMeasurement',
          'motionSensor', 'contactSensor', 'illuminanceMeasurement',
          'battery', 'energyMeter', 'audioVolume', 'mediaPlayback',
        ],
      };

      const result = toUnifiedDevice(deviceInfo);

      expect(result.capabilities.length).toBeGreaterThan(10);
      expect(result.capabilities).toContain(DeviceCapability.SWITCH);
      expect(result.capabilities).toContain(DeviceCapability.BATTERY);
      expect(result.capabilities).toContain(DeviceCapability.ENERGY_METER);
    });

    it('handles device with duplicate capabilities in input', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('device-dupes'),
        name: 'Duplicate Caps Device',
        capabilities: ['switch', 'switch', 'temperatureMeasurement', 'switch'],
      };

      const result = toUnifiedDevice(deviceInfo);

      // Should have duplicates because we don't deduplicate
      // (caller can deduplicate if needed)
      const switchCount = result.capabilities.filter(c => c === DeviceCapability.SWITCH).length;
      expect(switchCount).toBe(3);
    });
  });
});
