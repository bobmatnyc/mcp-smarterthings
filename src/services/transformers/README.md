# Device Transformers

Transformation layer for converting between platform-specific device formats and the unified device model.

## Purpose

This module bridges the gap between SmartThings-specific `DeviceInfo` format and the platform-agnostic `UnifiedDevice` format used by:
- **DeviceRegistry**: Multi-dimensional device indexing
- **SemanticIndex**: Vector-based semantic search
- **Multi-platform abstractions**: Future Tuya, Lutron support

## Usage

### Basic Transformation

```typescript
import { toUnifiedDevice } from './services/transformers';
import type { DeviceInfo } from './types/smartthings';

// Get device from SmartThings API
const deviceInfo: DeviceInfo = {
  deviceId: createDeviceId('abc-123'),
  name: 'Living Room Light',
  label: 'Main Light',
  capabilities: ['switch', 'switchLevel', 'colorControl'],
  roomName: 'Living Room',
};

// Transform to unified format
const unified = toUnifiedDevice(deviceInfo);

// Result:
// {
//   id: 'smartthings:abc-123',
//   platform: Platform.SMARTTHINGS,
//   name: 'Living Room Light',
//   capabilities: [SWITCH, DIMMER, COLOR],
//   online: true,
//   ...
// }
```

### With Status Data

```typescript
import { toUnifiedDevice } from './services/transformers';

const deviceInfo: DeviceInfo = { /* ... */ };
const status: DeviceStatus = {
  deviceId: createDeviceId('abc-123'),
  components: {
    main: {
      healthCheck: {
        healthStatus: { value: 'online', timestamp: '...' }
      },
      switch: {
        switch: { value: 'on', timestamp: '2024-01-15T12:00:00Z' }
      }
    }
  }
};

const unified = toUnifiedDevice(deviceInfo, status);

// Extracts:
// - online: true (from healthCheck)
// - lastSeen: Date('2024-01-15T12:00:00Z') (most recent timestamp)
```

### Batch Transformation

```typescript
const devices = await deviceService.listDevices();
const unifiedDevices = devices.map(info => toUnifiedDevice(info));

// Index in DeviceRegistry
await deviceRegistry.bulkIndex(unifiedDevices);

// Or add to SemanticIndex
await semanticIndex.bulkAdd(unifiedDevices);
```

## Capability Mapping

SmartThings capabilities are mapped to the unified `DeviceCapability` enum:

| SmartThings Capability | UnifiedDevice Capability |
|------------------------|--------------------------|
| `switch` | `SWITCH` |
| `switchLevel` | `DIMMER` |
| `colorControl` | `COLOR` |
| `colorTemperature` | `COLOR_TEMPERATURE` |
| `thermostat` | `THERMOSTAT` |
| `lock` | `LOCK` |
| `windowShade` | `SHADE` |
| `fanSpeed` | `FAN` |
| `valve` | `VALVE` |
| `alarm` | `ALARM` |
| `doorControl`, `garageDoorControl` | `DOOR_CONTROL` |
| `temperatureMeasurement` | `TEMPERATURE_SENSOR` |
| `relativeHumidityMeasurement` | `HUMIDITY_SENSOR` |
| `motionSensor` | `MOTION_SENSOR` |
| `contactSensor` | `CONTACT_SENSOR` |
| `occupancySensor` | `OCCUPANCY_SENSOR` |
| `illuminanceMeasurement` | `ILLUMINANCE_SENSOR` |
| `battery` | `BATTERY` |
| `airQualitySensor` | `AIR_QUALITY_SENSOR` |
| `waterSensor` | `WATER_LEAK_SENSOR` |
| `smokeDetector` | `SMOKE_DETECTOR` |
| `button` | `BUTTON` |
| `pressureMeasurement` | `PRESSURE_SENSOR` |
| `carbonMonoxideDetector` | `CO_DETECTOR` |
| `soundSensor` | `SOUND_SENSOR` |
| `energyMeter`, `powerMeter` | `ENERGY_METER` |
| `audioVolume`, `speaker` | `SPEAKER` |
| `mediaPlayback` | `MEDIA_PLAYER` |
| `videoCamera` | `CAMERA` |
| `robotCleanerCleaningMode` | `ROBOT_VACUUM` |
| `infraredLevel` | `IR_BLASTER` |

**Unknown capabilities are silently skipped** without errors, enabling forward compatibility.

## Platform-Specific Data Preservation

SmartThings-specific metadata is preserved in the `platformSpecific` field:

```typescript
const unified = toUnifiedDevice(deviceInfo);

unified.platformSpecific = {
  type: 'ZWAVE',                    // Device type
  components: ['main', 'button1'],  // Component IDs
  locationId: 'loc-123',            // SmartThings location ID
  roomId: 'room-456',               // SmartThings room ID
};
```

This enables reverse lookups and platform-specific operations:

```typescript
// Extract platform ID for SmartThings API calls
const { platform, platformDeviceId } = parseUniversalDeviceId(device.id);

if (platform === Platform.SMARTTHINGS) {
  const components = device.platformSpecific?.['components'] as string[];
  // Use components for multi-component device control
}
```

## Status Extraction

### Online Status

Extracted from `DeviceStatus` with fallback logic:

1. Check `healthCheck.healthStatus.value` (modern)
2. Check `DeviceHealth.DeviceWatch_DeviceStatus.value` (legacy)
3. Default to `true` (optimistic)

```typescript
// Explicit offline
status.components.main.healthCheck.healthStatus.value === 'offline'
// → online: false

// No health data
status = undefined
// → online: true (default)
```

### Last Seen Timestamp

Extracted from the most recent timestamp across all component capabilities:

```typescript
const unified = toUnifiedDevice(deviceInfo, status);

// Finds most recent timestamp from all components
unified.lastSeen // Date | undefined
```

## Design Decisions

### Optimistic Online Status
- **Default**: `online: true` when status unavailable
- **Rationale**: Better UX for devices that don't report frequently
- **Trade-off**: Brief false positive for offline devices
- **Mitigation**: Status polling updates quickly

### Graceful Capability Handling
- **Unknown capabilities**: Skipped without errors
- **Rationale**: Forward compatibility with new SmartThings capabilities
- **Trade-off**: Silent omission vs. loud failure
- **Decision**: Silent omission preferred for robustness

### Platform-Specific Escape Hatch
- **Preservation**: Original SmartThings metadata stored
- **Rationale**: Enables platform-specific operations
- **Warning**: Using `platformSpecific` reduces portability
- **Best Practice**: Prefer unified fields when available

## Testing

45 comprehensive tests covering:

✅ Basic transformation (name, label, capabilities)
✅ Capability mapping (all 25+ mappings)
✅ Universal ID creation
✅ Platform-specific data preservation
✅ Missing optional fields
✅ Unknown capability handling
✅ Status integration (online, lastSeen)
✅ Batch transformation
✅ Integration with DeviceRegistry/SemanticIndex

Run tests:
```bash
npm test -- src/services/transformers/
```

## Performance

- **Time Complexity**: O(n) where n = number of capabilities
- **Space Complexity**: O(n) for capability array
- **Expected Performance**: <1ms per device (typical 10-20 capabilities)
- **Batch Processing**: Efficient for large device lists (1000+ devices)

## Future Extensions

### Multi-Platform Support
When adding Tuya, Lutron, etc., create parallel transformers:
- `src/services/transformers/tuyaToUnified.ts`
- `src/services/transformers/lutronToUnified.ts`

### Reverse Transformation
For platform-specific control operations:
- `src/services/transformers/unifiedToDeviceInfo.ts`

### Capability Group Support
Map SmartThings components to `CapabilityGroup[]`:
```typescript
// Future enhancement
toUnifiedDevice(deviceInfo, status, { includeCapabilityGroups: true })
```
