/**
 * Unit tests for capability registry and value conversion system.
 *
 * Tests:
 * - CapabilityRegistry bidirectional mapping
 * - Platform capability support detection
 * - ValueConversionRegistry value transformations
 * - Pre-registered platform mappings
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Platform, DeviceCapability } from '../unified-device.js';
import {
  CapabilityRegistry,
  ValueConversionRegistry,
  initializeCapabilityMappings,
  initializeValueConversions,
  type PlatformCapabilityMapping,
} from '../capability-registry.js';

describe('CapabilityRegistry', () => {
  afterEach(() => {
    // Clear and re-initialize to restore original state
    CapabilityRegistry.clear();
    initializeCapabilityMappings();
  });

  describe('register', () => {
    beforeEach(() => {
      CapabilityRegistry.clear();
    });

    it('should register platform capability mapping', () => {
      CapabilityRegistry.register({
        platform: Platform.SMARTTHINGS,
        platformCapability: 'test_capability',
        unifiedCapability: DeviceCapability.SWITCH,
        conversionRequired: false,
      });

      const unified = CapabilityRegistry.getUnifiedCapability(
        Platform.SMARTTHINGS,
        'test_capability'
      );
      expect(unified).toBe(DeviceCapability.SWITCH);
    });

    it('should create reverse mapping', () => {
      CapabilityRegistry.register({
        platform: Platform.TUYA,
        platformCapability: 'switch_led',
        unifiedCapability: DeviceCapability.SWITCH,
        conversionRequired: false,
      });

      const platformCap = CapabilityRegistry.getPlatformCapability(
        Platform.TUYA,
        DeviceCapability.SWITCH
      );
      expect(platformCap).toBe('switch_led');
    });
  });

  describe('getUnifiedCapability', () => {
    beforeEach(() => {
      CapabilityRegistry.clear();
      CapabilityRegistry.register({
        platform: Platform.SMARTTHINGS,
        platformCapability: 'switchLevel',
        unifiedCapability: DeviceCapability.DIMMER,
        conversionRequired: false,
      });
    });

    it('should return unified capability for valid mapping', () => {
      const unified = CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'switchLevel');
      expect(unified).toBe(DeviceCapability.DIMMER);
    });

    it('should return null for unknown platform capability', () => {
      const unified = CapabilityRegistry.getUnifiedCapability(
        Platform.SMARTTHINGS,
        'unknown_capability'
      );
      expect(unified).toBeNull();
    });

    it('should return null for wrong platform', () => {
      const unified = CapabilityRegistry.getUnifiedCapability(Platform.TUYA, 'switchLevel');
      expect(unified).toBeNull();
    });
  });

  describe('getPlatformCapability', () => {
    beforeEach(() => {
      CapabilityRegistry.clear();
      CapabilityRegistry.register({
        platform: Platform.TUYA,
        platformCapability: 'bright_value',
        unifiedCapability: DeviceCapability.DIMMER,
        conversionRequired: true,
      });
    });

    it('should return platform capability for valid mapping', () => {
      const platformCap = CapabilityRegistry.getPlatformCapability(
        Platform.TUYA,
        DeviceCapability.DIMMER
      );
      expect(platformCap).toBe('bright_value');
    });

    it('should return null for unsupported capability', () => {
      const platformCap = CapabilityRegistry.getPlatformCapability(
        Platform.TUYA,
        DeviceCapability.OCCUPANCY_SENSOR
      );
      expect(platformCap).toBeNull();
    });

    it('should return null for wrong platform', () => {
      const platformCap = CapabilityRegistry.getPlatformCapability(
        Platform.LUTRON,
        DeviceCapability.DIMMER
      );
      // Lutron has its own dimmer mapping, this should return it
      // But with fresh registry, it should be null
      expect(platformCap).toBeNull();
    });
  });

  describe('isPlatformSupported', () => {
    beforeEach(() => {
      CapabilityRegistry.clear();
      CapabilityRegistry.register({
        platform: Platform.LUTRON,
        platformCapability: 'POSITION',
        unifiedCapability: DeviceCapability.SHADE,
        conversionRequired: false,
      });
    });

    it('should return true for supported capability', () => {
      const supported = CapabilityRegistry.isPlatformSupported(
        Platform.LUTRON,
        DeviceCapability.SHADE
      );
      expect(supported).toBe(true);
    });

    it('should return false for unsupported capability', () => {
      const supported = CapabilityRegistry.isPlatformSupported(
        Platform.LUTRON,
        DeviceCapability.COLOR
      );
      expect(supported).toBe(false);
    });
  });

  describe('getSupportedCapabilities', () => {
    beforeEach(() => {
      CapabilityRegistry.clear();
      CapabilityRegistry.register({
        platform: Platform.SMARTTHINGS,
        platformCapability: 'switch',
        unifiedCapability: DeviceCapability.SWITCH,
        conversionRequired: false,
      });
      CapabilityRegistry.register({
        platform: Platform.SMARTTHINGS,
        platformCapability: 'switchLevel',
        unifiedCapability: DeviceCapability.DIMMER,
        conversionRequired: false,
      });
      CapabilityRegistry.register({
        platform: Platform.TUYA,
        platformCapability: 'switch_led',
        unifiedCapability: DeviceCapability.SWITCH,
        conversionRequired: false,
      });
    });

    it('should return all capabilities for a platform', () => {
      const capabilities = CapabilityRegistry.getSupportedCapabilities(Platform.SMARTTHINGS);
      expect(capabilities).toHaveLength(2);
      expect(capabilities).toContain(DeviceCapability.SWITCH);
      expect(capabilities).toContain(DeviceCapability.DIMMER);
    });

    it('should return empty array for platform with no mappings', () => {
      const capabilities = CapabilityRegistry.getSupportedCapabilities(Platform.LUTRON);
      expect(capabilities).toHaveLength(0);
    });
  });

  describe('getMapping', () => {
    beforeEach(() => {
      CapabilityRegistry.clear();
    });

    it('should return full mapping details', () => {
      const mapping: PlatformCapabilityMapping = {
        platform: Platform.TUYA,
        platformCapability: 'bright_value',
        unifiedCapability: DeviceCapability.DIMMER,
        conversionRequired: true,
        notes: '0-1000 → 0-100',
      };

      CapabilityRegistry.register(mapping);

      const retrieved = CapabilityRegistry.getMapping(Platform.TUYA, 'bright_value');
      expect(retrieved).toEqual(mapping);
    });

    it('should return null for unknown mapping', () => {
      const retrieved = CapabilityRegistry.getMapping(Platform.SMARTTHINGS, 'unknown');
      expect(retrieved).toBeNull();
    });
  });

  describe('Pre-registered mappings', () => {
    it('should have SmartThings switch mapping', () => {
      const unified = CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'switch');
      expect(unified).toBe(DeviceCapability.SWITCH);
    });

    it('should have Tuya dimmer mapping', () => {
      const unified = CapabilityRegistry.getUnifiedCapability(Platform.TUYA, 'bright_value');
      expect(unified).toBe(DeviceCapability.DIMMER);
    });

    it('should have Lutron shade mapping', () => {
      const unified = CapabilityRegistry.getUnifiedCapability(Platform.LUTRON, 'POSITION');
      expect(unified).toBe(DeviceCapability.SHADE);
    });

    it('should have all new capabilities mapped for SmartThings', () => {
      expect(CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'doorControl')).toBe(
        DeviceCapability.DOOR_CONTROL
      );
      expect(CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'button')).toBe(
        DeviceCapability.BUTTON
      );
      expect(
        CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'pressureMeasurement')
      ).toBe(DeviceCapability.PRESSURE_SENSOR);
      expect(
        CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'carbonMonoxideDetector')
      ).toBe(DeviceCapability.CO_DETECTOR);
      expect(
        CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'soundPressureLevel')
      ).toBe(DeviceCapability.SOUND_SENSOR);
      expect(
        CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'robotCleanerMovement')
      ).toBe(DeviceCapability.ROBOT_VACUUM);
      expect(CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'infraredLevel')).toBe(
        DeviceCapability.IR_BLASTER
      );
    });

    it('should have significant number of mappings registered', () => {
      const count = CapabilityRegistry.getMappingCount();
      expect(count).toBeGreaterThan(50); // Should have 60+ mappings
    });
  });
});

describe('ValueConversionRegistry', () => {
  afterEach(() => {
    ValueConversionRegistry.clear();
    initializeValueConversions();
  });

  describe('register', () => {
    beforeEach(() => {
      ValueConversionRegistry.clear();
    });

    it('should register value conversion', () => {
      ValueConversionRegistry.register<number, number>({
        platform: Platform.TUYA,
        capability: DeviceCapability.DIMMER,
        attribute: 'level',
        toPlatform: (value: number) => value * 10,
        fromPlatform: (value: number) => value / 10,
        description: 'Test conversion',
      });

      const hasConversion = ValueConversionRegistry.hasConversion(
        Platform.TUYA,
        DeviceCapability.DIMMER,
        'level'
      );
      expect(hasConversion).toBe(true);
    });
  });

  describe('toPlatform', () => {
    beforeEach(() => {
      ValueConversionRegistry.clear();
      ValueConversionRegistry.register<number, number>({
        platform: Platform.TUYA,
        capability: DeviceCapability.DIMMER,
        attribute: 'level',
        toPlatform: (value: number) => Math.round(value * 10),
        fromPlatform: (value: number) => Math.round(value / 10),
        description: 'Tuya brightness scale',
      });
    });

    it('should convert value to platform format', () => {
      const converted = ValueConversionRegistry.toPlatform(
        Platform.TUYA,
        DeviceCapability.DIMMER,
        'level',
        50
      );
      expect(converted).toBe(500);
    });

    it('should return value as-is if no conversion registered', () => {
      const converted = ValueConversionRegistry.toPlatform(
        Platform.SMARTTHINGS,
        DeviceCapability.DIMMER,
        'level',
        50
      );
      expect(converted).toBe(50);
    });
  });

  describe('fromPlatform', () => {
    beforeEach(() => {
      ValueConversionRegistry.clear();
      ValueConversionRegistry.register<number, number>({
        platform: Platform.TUYA,
        capability: DeviceCapability.DIMMER,
        attribute: 'level',
        toPlatform: (value: number) => Math.round(value * 10),
        fromPlatform: (value: number) => Math.round(value / 10),
        description: 'Tuya brightness scale',
      });
    });

    it('should convert value from platform format', () => {
      const converted = ValueConversionRegistry.fromPlatform(
        Platform.TUYA,
        DeviceCapability.DIMMER,
        'level',
        500
      );
      expect(converted).toBe(50);
    });

    it('should return value as-is if no conversion registered', () => {
      const converted = ValueConversionRegistry.fromPlatform(
        Platform.SMARTTHINGS,
        DeviceCapability.DIMMER,
        'level',
        50
      );
      expect(converted).toBe(50);
    });
  });

  describe('Pre-registered conversions', () => {
    it('should have Tuya brightness conversion', () => {
      const hasConversion = ValueConversionRegistry.hasConversion(
        Platform.TUYA,
        DeviceCapability.DIMMER,
        'level'
      );
      expect(hasConversion).toBe(true);

      // Test conversion
      const toPlatform = ValueConversionRegistry.toPlatform<number>(
        Platform.TUYA,
        DeviceCapability.DIMMER,
        'level',
        50
      );
      expect(toPlatform).toBe(500);

      const fromPlatform = ValueConversionRegistry.fromPlatform<number>(
        Platform.TUYA,
        DeviceCapability.DIMMER,
        'level',
        500
      );
      expect(fromPlatform).toBe(50);
    });

    it('should have SmartThings hue conversion', () => {
      const hasConversion = ValueConversionRegistry.hasConversion(
        Platform.SMARTTHINGS,
        DeviceCapability.COLOR,
        'hue'
      );
      expect(hasConversion).toBe(true);

      // Test conversion: 0-360 degrees ↔ 0-100 percentage
      const toPlatform = ValueConversionRegistry.toPlatform<number>(
        Platform.SMARTTHINGS,
        DeviceCapability.COLOR,
        'hue',
        180 // 50% hue
      );
      expect(toPlatform).toBe(50);

      const fromPlatform = ValueConversionRegistry.fromPlatform<number>(
        Platform.SMARTTHINGS,
        DeviceCapability.COLOR,
        'hue',
        50
      );
      expect(fromPlatform).toBe(180);
    });

    it('should have Tuya color format conversion', () => {
      const hasConversion = ValueConversionRegistry.hasConversion(
        Platform.TUYA,
        DeviceCapability.COLOR,
        'color'
      );
      expect(hasConversion).toBe(true);

      // Test conversion: HSV object ↔ JSON string
      const hsvObject = { h: 180, s: 100, v: 50 };
      const jsonString = ValueConversionRegistry.toPlatform<string>(
        Platform.TUYA,
        DeviceCapability.COLOR,
        'color',
        hsvObject
      );

      const parsed: { h: number; s: number; v: number } = JSON.parse(jsonString);
      expect(parsed.h).toBe(180);
      expect(parsed.s).toBe(100);
      // 50 * 2.55 = 127.5, Math.round gives 127 (banker's rounding) or 128
      expect([127, 128]).toContain(parsed.v);

      const backToObject = ValueConversionRegistry.fromPlatform<{
        h: number;
        s: number;
        v: number;
      }>(Platform.TUYA, DeviceCapability.COLOR, 'color', jsonString);
      expect(backToObject.h).toBe(180);
      expect(backToObject.s).toBe(100);
      expect(backToObject.v).toBeCloseTo(50, 0);
    });

    it('should have multiple conversions registered', () => {
      const count = ValueConversionRegistry.getConversionCount();
      expect(count).toBeGreaterThanOrEqual(4);
    });
  });

  describe('getConversion', () => {
    it('should return conversion mapping details', () => {
      const conversion = ValueConversionRegistry.getConversion(
        Platform.TUYA,
        DeviceCapability.DIMMER,
        'level'
      );

      expect(conversion).toBeDefined();
      expect(conversion?.platform).toBe(Platform.TUYA);
      expect(conversion?.capability).toBe(DeviceCapability.DIMMER);
      expect(conversion?.attribute).toBe('level');
      expect(conversion?.description).toContain('brightness');
    });

    it('should return null for unknown conversion', () => {
      const conversion = ValueConversionRegistry.getConversion(
        Platform.LUTRON,
        DeviceCapability.COLOR,
        'hue'
      );
      expect(conversion).toBeNull();
    });
  });
});

describe('Integration Tests', () => {
  it('should handle complete workflow: SmartThings dimmer', () => {
    // 1. Map platform capability to unified
    const unified = CapabilityRegistry.getUnifiedCapability(Platform.SMARTTHINGS, 'switchLevel');
    expect(unified).toBe(DeviceCapability.DIMMER);

    // 2. No conversion needed for SmartThings dimmer (both use 0-100)
    const hasConversion = ValueConversionRegistry.hasConversion(
      Platform.SMARTTHINGS,
      DeviceCapability.DIMMER,
      'level'
    );
    expect(hasConversion).toBe(false);

    // 3. Value passes through unchanged
    const value = ValueConversionRegistry.fromPlatform(
      Platform.SMARTTHINGS,
      DeviceCapability.DIMMER,
      'level',
      75
    );
    expect(value).toBe(75);
  });

  it('should handle complete workflow: Tuya dimmer with conversion', () => {
    // 1. Map platform capability to unified
    const unified = CapabilityRegistry.getUnifiedCapability(Platform.TUYA, 'bright_value');
    expect(unified).toBe(DeviceCapability.DIMMER);

    // 2. Conversion required for Tuya brightness
    const hasConversion = ValueConversionRegistry.hasConversion(
      Platform.TUYA,
      DeviceCapability.DIMMER,
      'level'
    );
    expect(hasConversion).toBe(true);

    // 3. Convert Tuya 0-1000 to unified 0-100
    const unifiedValue = ValueConversionRegistry.fromPlatform(
      Platform.TUYA,
      DeviceCapability.DIMMER,
      'level',
      750
    );
    expect(unifiedValue).toBe(75);

    // 4. Convert unified 0-100 back to Tuya 0-1000
    const tuyaValue = ValueConversionRegistry.toPlatform(
      Platform.TUYA,
      DeviceCapability.DIMMER,
      'level',
      75
    );
    expect(tuyaValue).toBe(750);
  });
});
