/**
 * Integration tests demonstrating transformer usage in DeviceService context.
 *
 * These tests show how the transformer integrates with the broader system,
 * converting DeviceService responses to UnifiedDevice format for use by
 * SemanticIndex and DeviceRegistry.
 */

import { describe, it, expect } from 'vitest';
import { toUnifiedDevice } from '../deviceInfoToUnified.js';
import { createDeviceId } from '../../../types/smartthings.js';
import {
  Platform,
  DeviceCapability,
  isUniversalDeviceId,
  parseUniversalDeviceId,
} from '../../../types/unified-device.js';
import type { DeviceInfo } from '../../../types/smartthings.js';

describe('Transformer Integration', () => {
  it('converts DeviceService response for SemanticIndex indexing', () => {
    // Simulate DeviceService.listDevices() response
    const deviceInfo: DeviceInfo = {
      deviceId: createDeviceId('living-room-light-123'),
      name: 'Living Room Light',
      label: 'Main Ceiling Light',
      capabilities: ['switch', 'switchLevel', 'colorControl'],
      roomName: 'Living Room',
      type: 'ZWAVE',
      components: ['main'],
      locationId: 'home-location',
      roomId: 'living-room',
    };

    // Transform to UnifiedDevice for indexing
    const unified = toUnifiedDevice(deviceInfo);

    // Verify format suitable for SemanticIndex
    expect(unified.id).toBe('smartthings:living-room-light-123');
    expect(unified.name).toBe('Living Room Light');
    expect(unified.room).toBe('Living Room');
    expect(unified.capabilities).toContain(DeviceCapability.SWITCH);
    expect(unified.capabilities).toContain(DeviceCapability.DIMMER);
    expect(unified.capabilities).toContain(DeviceCapability.COLOR);

    // Verify ID parsing works for lookups
    expect(isUniversalDeviceId(unified.id)).toBe(true);
    const parsed = parseUniversalDeviceId(unified.id);
    expect(parsed.platform).toBe(Platform.SMARTTHINGS);
    expect(parsed.platformDeviceId).toBe('living-room-light-123');
  });

  it('converts multi-sensor device for capability-based search', () => {
    // Multi-sensor with various capabilities
    const deviceInfo: DeviceInfo = {
      deviceId: createDeviceId('multi-sensor-456'),
      name: 'Bedroom Multi-Sensor',
      capabilities: [
        'temperatureMeasurement',
        'relativeHumidityMeasurement',
        'motionSensor',
        'illuminanceMeasurement',
        'battery',
      ],
      roomName: 'Master Bedroom',
    };

    const unified = toUnifiedDevice(deviceInfo);

    // Verify capability-based filtering works
    const hasSensorCapability = (cap: DeviceCapability) => unified.capabilities.includes(cap);

    expect(hasSensorCapability(DeviceCapability.TEMPERATURE_SENSOR)).toBe(true);
    expect(hasSensorCapability(DeviceCapability.HUMIDITY_SENSOR)).toBe(true);
    expect(hasSensorCapability(DeviceCapability.MOTION_SENSOR)).toBe(true);
    expect(hasSensorCapability(DeviceCapability.ILLUMINANCE_SENSOR)).toBe(true);
    expect(hasSensorCapability(DeviceCapability.BATTERY)).toBe(true);

    // Verify device type detection
    const isSensor = unified.capabilities.some((cap) =>
      [
        DeviceCapability.TEMPERATURE_SENSOR,
        DeviceCapability.HUMIDITY_SENSOR,
        DeviceCapability.MOTION_SENSOR,
      ].includes(cap)
    );
    expect(isSensor).toBe(true);
  });

  it('preserves platform-specific data for SmartThings API calls', () => {
    // Device with platform-specific metadata
    const deviceInfo: DeviceInfo = {
      deviceId: createDeviceId('thermostat-789'),
      name: 'Thermostat',
      type: 'ZWAVE',
      capabilities: ['thermostat', 'temperatureMeasurement'],
      components: ['main', 'temperature', 'cooling'],
      locationId: 'location-abc',
      roomId: 'room-def',
      roomName: 'Living Room',
    };

    const unified = toUnifiedDevice(deviceInfo);

    // Verify platform-specific data preserved for reverse lookups
    expect(unified.platformSpecific?.['type']).toBe('ZWAVE');
    expect(unified.platformSpecific?.['components']).toEqual(['main', 'temperature', 'cooling']);
    expect(unified.platformSpecific?.['locationId']).toBe('location-abc');
    expect(unified.platformSpecific?.['roomId']).toBe('room-def');

    // This data enables DeviceService to make platform-specific API calls
    // when operating on devices from DeviceRegistry
  });

  it('handles batch transformation for device list caching', () => {
    // Simulate batch processing from DeviceService.listDevices()
    const deviceInfos: DeviceInfo[] = [
      {
        deviceId: createDeviceId('device-1'),
        name: 'Light 1',
        capabilities: ['switch'],
      },
      {
        deviceId: createDeviceId('device-2'),
        name: 'Light 2',
        capabilities: ['switch', 'switchLevel'],
      },
      {
        deviceId: createDeviceId('device-3'),
        name: 'Sensor 1',
        capabilities: ['temperatureMeasurement', 'battery'],
      },
    ];

    // Transform all devices
    const unified = deviceInfos.map((info) => toUnifiedDevice(info));

    // Verify batch transformation
    expect(unified).toHaveLength(3);
    expect(unified[0].capabilities).toContain(DeviceCapability.SWITCH);
    expect(unified[1].capabilities).toContain(DeviceCapability.DIMMER);
    expect(unified[2].capabilities).toContain(DeviceCapability.TEMPERATURE_SENSOR);

    // All have valid universal IDs
    unified.forEach((device) => {
      expect(isUniversalDeviceId(device.id)).toBe(true);
      expect(device.platform).toBe(Platform.SMARTTHINGS);
    });
  });

  it('handles devices with no capabilities gracefully', () => {
    // Edge case: device with no capabilities (placeholder or hub)
    const deviceInfo: DeviceInfo = {
      deviceId: createDeviceId('hub-001'),
      name: 'SmartThings Hub',
      capabilities: [],
    };

    const unified = toUnifiedDevice(deviceInfo);

    expect(unified.id).toBe('smartthings:hub-001');
    expect(unified.capabilities).toEqual([]);
    expect(unified.online).toBe(true); // Default optimistic
  });

  it('filters unknown future capabilities without breaking', () => {
    // Future-proofing: handle capabilities not yet mapped
    const deviceInfo: DeviceInfo = {
      deviceId: createDeviceId('future-device'),
      name: 'Future Device',
      capabilities: [
        'switch',
        'futureCapability2025',
        'switchLevel',
        'experimentalFeature',
      ],
    };

    const unified = toUnifiedDevice(deviceInfo);

    // Only known capabilities mapped
    expect(unified.capabilities).toEqual([DeviceCapability.SWITCH, DeviceCapability.DIMMER]);
    expect(unified.capabilities).not.toContain('futureCapability2025');
  });
});
