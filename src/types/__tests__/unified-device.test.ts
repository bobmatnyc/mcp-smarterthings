/**
 * Unit tests for unified device types.
 *
 * Tests:
 * - Type guard validation
 * - Branded type creation and parsing
 * - Universal device ID format validation
 * - Platform enum validation
 * - DeviceCapability enum validation
 */

import { describe, it, expect } from 'vitest';
import {
  Platform,
  DeviceCapability,
  createUniversalDeviceId,
  parseUniversalDeviceId,
  isUniversalDeviceId,
  isPlatform,
  isDeviceCapability,
  type UniversalDeviceId,
  type UnifiedDevice,
  // Phase 3: Runtime detection utilities
  hasCapability,
  getActiveCapabilities,
  hasAllCapabilities,
  hasAnyCapability,
  getCapabilityGroups,
  findCapabilityGroup,
  getGroupCapabilities,
  isSensorDevice,
  isControllerDevice,
} from '../unified-device.js';

describe('Unified Device Types', () => {
  describe('createUniversalDeviceId', () => {
    it('should create valid universal device ID', () => {
      const id = createUniversalDeviceId(Platform.SMARTTHINGS, 'abc-123');
      expect(id).toBe('smartthings:abc-123');
    });

    it('should handle platform-specific IDs with colons', () => {
      const id = createUniversalDeviceId(Platform.LUTRON, 'zone:1:outlet:2');
      expect(id).toBe('lutron:zone:1:outlet:2');
    });

    it('should work for all platforms', () => {
      const stId = createUniversalDeviceId(Platform.SMARTTHINGS, 'device1');
      const tuyaId = createUniversalDeviceId(Platform.TUYA, 'device2');
      const lutronId = createUniversalDeviceId(Platform.LUTRON, 'device3');

      expect(stId).toBe('smartthings:device1');
      expect(tuyaId).toBe('tuya:device2');
      expect(lutronId).toBe('lutron:device3');
    });
  });

  describe('isUniversalDeviceId', () => {
    it('should validate correct format', () => {
      expect(isUniversalDeviceId('smartthings:abc-123')).toBe(true);
      expect(isUniversalDeviceId('tuya:bf1234567890')).toBe(true);
      expect(isUniversalDeviceId('lutron:zone-1')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isUniversalDeviceId('invalid')).toBe(false);
      expect(isUniversalDeviceId('unknown:device')).toBe(false);
      expect(isUniversalDeviceId('')).toBe(false);
      expect(isUniversalDeviceId('smartthings')).toBe(false); // No colon
    });

    it('should handle edge cases', () => {
      expect(isUniversalDeviceId('smartthings:')).toBe(true); // Empty device ID
      expect(isUniversalDeviceId(':abc')).toBe(false); // Empty platform
    });
  });

  describe('parseUniversalDeviceId', () => {
    it('should parse valid IDs correctly', () => {
      const id = 'smartthings:abc-123' as UniversalDeviceId;
      const parsed = parseUniversalDeviceId(id);

      expect(parsed.platform).toBe(Platform.SMARTTHINGS);
      expect(parsed.platformDeviceId).toBe('abc-123');
    });

    it('should handle colons in platform device ID', () => {
      const id = 'lutron:zone:1:outlet:2' as UniversalDeviceId;
      const parsed = parseUniversalDeviceId(id);

      expect(parsed.platform).toBe(Platform.LUTRON);
      expect(parsed.platformDeviceId).toBe('zone:1:outlet:2');
    });

    it('should throw on invalid format', () => {
      // Type cast to bypass TypeScript check for testing
      const invalidId = 'invalid' as UniversalDeviceId;
      expect(() => parseUniversalDeviceId(invalidId)).toThrow('Invalid universal device ID format');
    });

    it('should throw on unknown platform', () => {
      const unknownId = 'unknown:device' as UniversalDeviceId;
      // Unknown platform fails isUniversalDeviceId() check first
      expect(() => parseUniversalDeviceId(unknownId)).toThrow('Invalid universal device ID format');
    });
  });

  describe('isPlatform', () => {
    it('should validate Platform enum values', () => {
      expect(isPlatform('smartthings')).toBe(true);
      expect(isPlatform('tuya')).toBe(true);
      expect(isPlatform('lutron')).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(isPlatform('invalid')).toBe(false);
      expect(isPlatform('')).toBe(false);
      expect(isPlatform(123)).toBe(false);
      expect(isPlatform(null)).toBe(false);
      expect(isPlatform(undefined)).toBe(false);
    });
  });

  describe('isDeviceCapability', () => {
    it('should validate DeviceCapability enum values', () => {
      expect(isDeviceCapability('switch')).toBe(true);
      expect(isDeviceCapability('dimmer')).toBe(true);
      expect(isDeviceCapability('color')).toBe(true);
      expect(isDeviceCapability('thermostat')).toBe(true);
      expect(isDeviceCapability('lock')).toBe(true);
    });

    it('should validate sensor capabilities', () => {
      expect(isDeviceCapability('temperatureSensor')).toBe(true);
      expect(isDeviceCapability('motionSensor')).toBe(true);
      expect(isDeviceCapability('contactSensor')).toBe(true);
    });

    it('should validate new capabilities from code review', () => {
      expect(isDeviceCapability('speaker')).toBe(true);
      expect(isDeviceCapability('mediaPlayer')).toBe(true);
      expect(isDeviceCapability('camera')).toBe(true);
      expect(isDeviceCapability('airQualitySensor')).toBe(true);
      expect(isDeviceCapability('waterLeakSensor')).toBe(true);
      expect(isDeviceCapability('smokeDetector')).toBe(true);
    });

    it('should reject invalid capabilities', () => {
      expect(isDeviceCapability('invalid')).toBe(false);
      expect(isDeviceCapability('')).toBe(false);
      expect(isDeviceCapability(123)).toBe(false);
    });
  });

  describe('Platform enum', () => {
    it('should have correct values', () => {
      expect(Platform.SMARTTHINGS).toBe('smartthings');
      expect(Platform.TUYA).toBe('tuya');
      expect(Platform.LUTRON).toBe('lutron');
    });

    it('should have all three platforms', () => {
      const platforms = Object.values(Platform);
      expect(platforms).toHaveLength(3);
      expect(platforms).toContain('smartthings');
      expect(platforms).toContain('tuya');
      expect(platforms).toContain('lutron');
    });
  });

  describe('DeviceCapability enum', () => {
    it('should have exactly 31 capabilities', () => {
      const capabilities = Object.values(DeviceCapability);
      expect(capabilities.length).toBe(31);
    });

    it('should include control capabilities', () => {
      const controls = [
        DeviceCapability.SWITCH,
        DeviceCapability.DIMMER,
        DeviceCapability.COLOR,
        DeviceCapability.THERMOSTAT,
        DeviceCapability.LOCK,
        DeviceCapability.SHADE,
        DeviceCapability.FAN,
        DeviceCapability.VALVE,
        DeviceCapability.ALARM,
      ];

      controls.forEach((cap) => {
        expect(Object.values(DeviceCapability)).toContain(cap);
      });
    });

    it('should include sensor capabilities', () => {
      const sensors = [
        DeviceCapability.TEMPERATURE_SENSOR,
        DeviceCapability.HUMIDITY_SENSOR,
        DeviceCapability.MOTION_SENSOR,
        DeviceCapability.CONTACT_SENSOR,
        DeviceCapability.BATTERY,
      ];

      sensors.forEach((cap) => {
        expect(Object.values(DeviceCapability)).toContain(cap);
      });
    });

    it('should include new capabilities from code review', () => {
      const newCaps = [
        DeviceCapability.SPEAKER,
        DeviceCapability.MEDIA_PLAYER,
        DeviceCapability.CAMERA,
        DeviceCapability.AIR_QUALITY_SENSOR,
        DeviceCapability.WATER_LEAK_SENSOR,
        DeviceCapability.SMOKE_DETECTOR,
      ];

      newCaps.forEach((cap) => {
        expect(Object.values(DeviceCapability)).toContain(cap);
      });
    });
  });

  describe('UnifiedDevice interface', () => {
    it('should create valid device object', () => {
      const device: UnifiedDevice = {
        id: createUniversalDeviceId(Platform.SMARTTHINGS, 'test-device'),
        platform: Platform.SMARTTHINGS,
        platformDeviceId: 'test-device',
        name: 'Test Light',
        label: 'Living Room Light',
        manufacturer: 'Philips',
        model: 'Hue A19',
        capabilities: [DeviceCapability.SWITCH, DeviceCapability.DIMMER],
        online: true,
      };

      expect(device.platform).toBe(Platform.SMARTTHINGS);
      expect(device.capabilities).toHaveLength(2);
      expect(device.online).toBe(true);
    });

    it('should support optional fields', () => {
      const device: UnifiedDevice = {
        id: createUniversalDeviceId(Platform.TUYA, 'device-1'),
        platform: Platform.TUYA,
        platformDeviceId: 'device-1',
        name: 'Smart Plug',
        capabilities: [DeviceCapability.SWITCH],
        online: true,
        // Optional fields
        room: 'Bedroom',
        location: 'Home',
        firmwareVersion: '1.2.3',
        lastSeen: new Date(),
        platformSpecific: {
          category: 'cz',
          productId: 'abc123',
        },
      };

      expect(device.room).toBe('Bedroom');
      expect(device.platformSpecific).toBeDefined();
    });

    it('should support capability groups', () => {
      const device: UnifiedDevice = {
        id: createUniversalDeviceId(Platform.SMARTTHINGS, 'thermostat-1'),
        platform: Platform.SMARTTHINGS,
        platformDeviceId: 'thermostat-1',
        name: 'Smart Thermostat',
        capabilities: [
          DeviceCapability.THERMOSTAT,
          DeviceCapability.TEMPERATURE_SENSOR,
          DeviceCapability.HUMIDITY_SENSOR,
        ],
        online: true,
        capabilityGroups: [
          {
            id: 'main',
            name: 'Main Controls',
            capabilities: [DeviceCapability.THERMOSTAT, DeviceCapability.TEMPERATURE_SENSOR],
          },
          {
            id: 'humidity',
            name: 'Humidity Sensor',
            capabilities: [DeviceCapability.HUMIDITY_SENSOR],
            componentId: 'humidity',
          },
        ],
      };

      expect(device.capabilityGroups).toHaveLength(2);
      expect(device.capabilityGroups?.[0]?.id).toBe('main');
      expect(device.capabilityGroups?.[1]?.componentId).toBe('humidity');
    });
  });

  describe('Runtime Capability Detection', () => {
    const mockDevice: UnifiedDevice = {
      id: createUniversalDeviceId(Platform.SMARTTHINGS, 'test-device'),
      platform: Platform.SMARTTHINGS,
      platformDeviceId: 'test-device',
      name: 'Test Light',
      capabilities: [DeviceCapability.SWITCH, DeviceCapability.DIMMER, DeviceCapability.BATTERY],
      online: true,
    };

    describe('hasCapability', () => {
      it('should return true for existing capability', () => {
        expect(hasCapability(mockDevice, DeviceCapability.SWITCH)).toBe(true);
        expect(hasCapability(mockDevice, DeviceCapability.DIMMER)).toBe(true);
        expect(hasCapability(mockDevice, DeviceCapability.BATTERY)).toBe(true);
      });

      it('should return false for missing capability', () => {
        expect(hasCapability(mockDevice, DeviceCapability.COLOR)).toBe(false);
        expect(hasCapability(mockDevice, DeviceCapability.THERMOSTAT)).toBe(false);
      });
    });

    describe('getActiveCapabilities', () => {
      it('should return all device capabilities', () => {
        const capabilities = getActiveCapabilities(mockDevice);
        expect(capabilities).toHaveLength(3);
        expect(capabilities).toContain(DeviceCapability.SWITCH);
        expect(capabilities).toContain(DeviceCapability.DIMMER);
        expect(capabilities).toContain(DeviceCapability.BATTERY);
      });
    });

    describe('hasAllCapabilities', () => {
      it('should return true when device has all specified capabilities', () => {
        expect(
          hasAllCapabilities(mockDevice, [DeviceCapability.SWITCH, DeviceCapability.DIMMER])
        ).toBe(true);
      });

      it('should return false when missing any capability', () => {
        expect(
          hasAllCapabilities(mockDevice, [
            DeviceCapability.SWITCH,
            DeviceCapability.DIMMER,
            DeviceCapability.COLOR,
          ])
        ).toBe(false);
      });

      it('should return true for empty array', () => {
        expect(hasAllCapabilities(mockDevice, [])).toBe(true);
      });
    });

    describe('hasAnyCapability', () => {
      it('should return true when device has at least one capability', () => {
        expect(
          hasAnyCapability(mockDevice, [DeviceCapability.SWITCH, DeviceCapability.COLOR])
        ).toBe(true);
        expect(
          hasAnyCapability(mockDevice, [DeviceCapability.BATTERY, DeviceCapability.LOCK])
        ).toBe(true);
      });

      it('should return false when device has none of the capabilities', () => {
        expect(
          hasAnyCapability(mockDevice, [DeviceCapability.COLOR, DeviceCapability.THERMOSTAT])
        ).toBe(false);
      });

      it('should return false for empty array', () => {
        expect(hasAnyCapability(mockDevice, [])).toBe(false);
      });
    });

    describe('Capability Groups', () => {
      const deviceWithGroups: UnifiedDevice = {
        id: createUniversalDeviceId(Platform.SMARTTHINGS, 'thermostat-1'),
        platform: Platform.SMARTTHINGS,
        platformDeviceId: 'thermostat-1',
        name: 'Smart Thermostat',
        capabilities: [
          DeviceCapability.THERMOSTAT,
          DeviceCapability.TEMPERATURE_SENSOR,
          DeviceCapability.HUMIDITY_SENSOR,
        ],
        online: true,
        capabilityGroups: [
          {
            id: 'main',
            name: 'Main Controls',
            capabilities: [DeviceCapability.THERMOSTAT, DeviceCapability.TEMPERATURE_SENSOR],
          },
          {
            id: 'humidity',
            name: 'Humidity Sensor',
            capabilities: [DeviceCapability.HUMIDITY_SENSOR],
            componentId: 'humidity',
          },
        ],
      };

      describe('getCapabilityGroups', () => {
        it('should return capability groups', () => {
          const groups = getCapabilityGroups(deviceWithGroups);
          expect(groups).toHaveLength(2);
          expect(groups[0]?.id).toBe('main');
          expect(groups[1]?.id).toBe('humidity');
        });

        it('should return empty array for device without groups', () => {
          const groups = getCapabilityGroups(mockDevice);
          expect(groups).toHaveLength(0);
        });
      });

      describe('findCapabilityGroup', () => {
        it('should find group by ID', () => {
          const group = findCapabilityGroup(deviceWithGroups, 'main');
          expect(group).toBeDefined();
          expect(group?.name).toBe('Main Controls');
          expect(group?.capabilities).toHaveLength(2);
        });

        it('should return undefined for unknown group ID', () => {
          const group = findCapabilityGroup(deviceWithGroups, 'unknown');
          expect(group).toBeUndefined();
        });

        it('should return undefined for device without groups', () => {
          const group = findCapabilityGroup(mockDevice, 'main');
          expect(group).toBeUndefined();
        });
      });

      describe('getGroupCapabilities', () => {
        it('should return capabilities for existing group', () => {
          const capabilities = getGroupCapabilities(deviceWithGroups, 'main');
          expect(capabilities).toHaveLength(2);
          expect(capabilities).toContain(DeviceCapability.THERMOSTAT);
          expect(capabilities).toContain(DeviceCapability.TEMPERATURE_SENSOR);
        });

        it('should return empty array for unknown group', () => {
          const capabilities = getGroupCapabilities(deviceWithGroups, 'unknown');
          expect(capabilities).toHaveLength(0);
        });

        it('should return empty array for device without groups', () => {
          const capabilities = getGroupCapabilities(mockDevice, 'main');
          expect(capabilities).toHaveLength(0);
        });
      });
    });

    describe('Device Type Detection', () => {
      describe('isSensorDevice', () => {
        it('should return true for sensor devices', () => {
          const sensor: UnifiedDevice = {
            id: createUniversalDeviceId(Platform.TUYA, 'sensor-1'),
            platform: Platform.TUYA,
            platformDeviceId: 'sensor-1',
            name: 'Temperature Sensor',
            capabilities: [DeviceCapability.TEMPERATURE_SENSOR, DeviceCapability.BATTERY],
            online: true,
          };

          expect(isSensorDevice(sensor)).toBe(true);
        });

        it('should return true for mixed devices with sensors', () => {
          const mixed: UnifiedDevice = {
            id: createUniversalDeviceId(Platform.SMARTTHINGS, 'mixed-1'),
            platform: Platform.SMARTTHINGS,
            platformDeviceId: 'mixed-1',
            name: 'Smart Plug with Power Meter',
            capabilities: [
              DeviceCapability.SWITCH,
              DeviceCapability.ENERGY_METER,
              DeviceCapability.TEMPERATURE_SENSOR,
            ],
            online: true,
          };

          expect(isSensorDevice(mixed)).toBe(true);
        });

        it('should return false for pure controller devices', () => {
          const controller: UnifiedDevice = {
            id: createUniversalDeviceId(Platform.SMARTTHINGS, 'switch-1'),
            platform: Platform.SMARTTHINGS,
            platformDeviceId: 'switch-1',
            name: 'Light Switch',
            capabilities: [DeviceCapability.SWITCH],
            online: true,
          };

          expect(isSensorDevice(controller)).toBe(false);
        });
      });

      describe('isControllerDevice', () => {
        it('should return true for controller devices', () => {
          const controller: UnifiedDevice = {
            id: createUniversalDeviceId(Platform.SMARTTHINGS, 'light-1'),
            platform: Platform.SMARTTHINGS,
            platformDeviceId: 'light-1',
            name: 'Smart Light',
            capabilities: [DeviceCapability.SWITCH, DeviceCapability.DIMMER],
            online: true,
          };

          expect(isControllerDevice(controller)).toBe(true);
        });

        it('should return true for mixed devices with controllers', () => {
          const mixed: UnifiedDevice = {
            id: createUniversalDeviceId(Platform.SMARTTHINGS, 'mixed-1'),
            platform: Platform.SMARTTHINGS,
            platformDeviceId: 'mixed-1',
            name: 'Thermostat',
            capabilities: [
              DeviceCapability.THERMOSTAT,
              DeviceCapability.TEMPERATURE_SENSOR,
              DeviceCapability.HUMIDITY_SENSOR,
            ],
            online: true,
          };

          expect(isControllerDevice(mixed)).toBe(true);
        });

        it('should return false for pure sensor devices', () => {
          const sensor: UnifiedDevice = {
            id: createUniversalDeviceId(Platform.TUYA, 'sensor-1'),
            platform: Platform.TUYA,
            platformDeviceId: 'sensor-1',
            name: 'Motion Sensor',
            capabilities: [DeviceCapability.MOTION_SENSOR, DeviceCapability.BATTERY],
            online: true,
          };

          expect(isControllerDevice(sensor)).toBe(false);
        });

        it('should detect new control capabilities', () => {
          const garageDoor: UnifiedDevice = {
            id: createUniversalDeviceId(Platform.SMARTTHINGS, 'garage-1'),
            platform: Platform.SMARTTHINGS,
            platformDeviceId: 'garage-1',
            name: 'Garage Door',
            capabilities: [DeviceCapability.DOOR_CONTROL],
            online: true,
          };

          expect(isControllerDevice(garageDoor)).toBe(true);
        });
      });
    });
  });
});
