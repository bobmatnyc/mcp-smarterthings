# Transformer Usage Examples

## Quick Start

```typescript
import { toUnifiedDevice } from '@/services/transformers';
import { DeviceService } from '@/services/DeviceService';

// Get devices from SmartThings
const deviceService = new DeviceService(smartThingsClient);
const devices = await deviceService.listDevices();

// Transform to unified format
const unifiedDevices = devices.map(device => toUnifiedDevice(device));

// Now compatible with DeviceRegistry and SemanticIndex
await deviceRegistry.bulkIndex(unifiedDevices);
await semanticIndex.bulkAdd(unifiedDevices);
```

## Real-World Example: Smart Light

```typescript
import { toUnifiedDevice } from '@/services/transformers';
import { createDeviceId } from '@/types/smartthings';
import { DeviceCapability, Platform } from '@/types/unified-device';

// SmartThings API response
const smartThingsDevice: DeviceInfo = {
  deviceId: createDeviceId('living-room-light-001'),
  name: 'Living Room Light',
  label: 'Main Ceiling Light',
  type: 'ZWAVE',
  capabilities: [
    'switch',           // On/Off control
    'switchLevel',      // Brightness control
    'colorControl',     // RGB color
    'colorTemperature', // White spectrum
  ],
  components: ['main'],
  locationId: 'home-location-123',
  roomId: 'living-room-456',
  roomName: 'Living Room',
};

// Transform to unified format
const unifiedDevice = toUnifiedDevice(smartThingsDevice);

console.log(unifiedDevice);
// {
//   id: 'smartthings:living-room-light-001',
//   platform: Platform.SMARTTHINGS,
//   platformDeviceId: 'living-room-light-001',
//   name: 'Living Room Light',
//   label: 'Main Ceiling Light',
//   room: 'Living Room',
//   capabilities: [
//     DeviceCapability.SWITCH,
//     DeviceCapability.DIMMER,
//     DeviceCapability.COLOR,
//     DeviceCapability.COLOR_TEMPERATURE
//   ],
//   online: true,
//   platformSpecific: {
//     type: 'ZWAVE',
//     components: ['main'],
//     locationId: 'home-location-123',
//     roomId: 'living-room-456'
//   }
// }
```

## Example: Multi-Sensor Device

```typescript
// SmartThings multi-sensor
const multiSensor: DeviceInfo = {
  deviceId: createDeviceId('bedroom-sensor-002'),
  name: 'Bedroom Multi-Sensor',
  capabilities: [
    'temperatureMeasurement',      // Temperature
    'relativeHumidityMeasurement', // Humidity
    'motionSensor',                // Motion detection
    'illuminanceMeasurement',      // Light level
    'battery',                     // Battery status
  ],
  roomName: 'Master Bedroom',
};

const unified = toUnifiedDevice(multiSensor);

// Check capabilities programmatically
const hasSensor = (cap: DeviceCapability) =>
  unified.capabilities.includes(cap);

if (hasSensor(DeviceCapability.TEMPERATURE_SENSOR)) {
  console.log('Device can measure temperature');
}

if (hasSensor(DeviceCapability.MOTION_SENSOR)) {
  console.log('Device can detect motion');
}

// Capability-based filtering
const sensorCapabilities = unified.capabilities.filter(cap =>
  [
    DeviceCapability.TEMPERATURE_SENSOR,
    DeviceCapability.HUMIDITY_SENSOR,
    DeviceCapability.MOTION_SENSOR,
  ].includes(cap)
);

console.log(`Found ${sensorCapabilities.length} sensor capabilities`);
// Output: Found 3 sensor capabilities
```

## Example: With Status Data

```typescript
import type { DeviceStatus } from '@/types/smartthings';

const deviceInfo: DeviceInfo = {
  deviceId: createDeviceId('smart-lock-003'),
  name: 'Front Door Lock',
  capabilities: ['lock', 'battery'],
  roomName: 'Entryway',
};

// SmartThings status data
const deviceStatus: DeviceStatus = {
  deviceId: createDeviceId('smart-lock-003'),
  components: {
    main: {
      healthCheck: {
        healthStatus: {
          value: 'online',
          timestamp: '2024-01-15T14:30:00Z',
        },
      },
      lock: {
        lock: {
          value: 'locked',
          timestamp: '2024-01-15T14:25:00Z',
        },
      },
      battery: {
        battery: {
          value: 85,
          unit: '%',
          timestamp: '2024-01-15T14:00:00Z',
        },
      },
    },
  },
};

// Transform with status
const unified = toUnifiedDevice(deviceInfo, deviceStatus);

console.log(unified.online);
// true (from healthCheck)

console.log(unified.lastSeen);
// Date('2024-01-15T14:30:00Z') - most recent timestamp
```

## Example: Batch Processing

```typescript
// Process large device list efficiently
async function indexAllDevices() {
  const deviceService = new DeviceService(client);
  const deviceRegistry = new DeviceRegistry();

  // Get all devices
  const devices = await deviceService.listDevices();
  console.log(`Processing ${devices.length} devices...`);

  // Transform in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < devices.length; i += BATCH_SIZE) {
    const batch = devices.slice(i, i + BATCH_SIZE);
    const unified = batch.map(d => toUnifiedDevice(d));

    await deviceRegistry.bulkIndex(unified);
    console.log(`Indexed ${i + batch.length}/${devices.length}`);
  }

  console.log('Indexing complete!');
}
```

## Example: Capability-Based Search

```typescript
import { hasCapability, hasAllCapabilities } from '@/types/unified-device';

// Find all lights that support color control
function findColorLights(devices: UnifiedDevice[]) {
  return devices.filter(device =>
    hasAllCapabilities(device, [
      DeviceCapability.SWITCH,
      DeviceCapability.COLOR,
    ])
  );
}

// Find all sensors with temperature
function findTemperatureSensors(devices: UnifiedDevice[]) {
  return devices.filter(device =>
    hasCapability(device, DeviceCapability.TEMPERATURE_SENSOR)
  );
}

// Find devices in specific room
function findDevicesInRoom(devices: UnifiedDevice[], room: string) {
  return devices.filter(device =>
    device.room?.toLowerCase() === room.toLowerCase()
  );
}

// Combine filters
const colorLightsInLivingRoom = devices
  .filter(device => hasCapability(device, DeviceCapability.COLOR))
  .filter(device => device.room === 'Living Room');
```

## Example: Platform-Specific Operations

```typescript
import { parseUniversalDeviceId } from '@/types/unified-device';

async function executeDeviceCommand(
  device: UnifiedDevice,
  command: string,
  args: unknown[]
) {
  // Extract platform information
  const { platform, platformDeviceId } = parseUniversalDeviceId(device.id);

  if (platform === Platform.SMARTTHINGS) {
    // Use SmartThings-specific metadata
    const components = device.platformSpecific?.['components'] as string[] || ['main'];

    // Make SmartThings API call
    await smartThingsClient.executeDeviceCommand(
      platformDeviceId,
      {
        capability: 'switch',
        command,
        arguments: args,
        component: components[0], // Use first component
      }
    );
  }
  // Future: Add Tuya, Lutron support
}

// Usage
await executeDeviceCommand(unifiedDevice, 'on', []);
```

## Example: Unknown Capability Handling

```typescript
// Future-proof: handles new capabilities gracefully
const futureDevice: DeviceInfo = {
  deviceId: createDeviceId('future-device-999'),
  name: 'Next-Gen Device',
  capabilities: [
    'switch',                    // Known - mapped
    'switchLevel',               // Known - mapped
    'holographicDisplay',        // Unknown - skipped
    'quantumSensor',             // Unknown - skipped
    'neuralInterface',           // Unknown - skipped
  ],
};

const unified = toUnifiedDevice(futureDevice);

// Only known capabilities included
console.log(unified.capabilities);
// [DeviceCapability.SWITCH, DeviceCapability.DIMMER]

// No errors thrown for unknown capabilities
// System continues to function with known subset
```

## Example: Integration with SemanticIndex

```typescript
import { SemanticIndex } from '@/services/SemanticIndex';
import { toUnifiedDevice } from '@/services/transformers';

async function buildSemanticIndex() {
  const semanticIndex = new SemanticIndex(chromaClient);
  const deviceService = new DeviceService(smartThingsClient);

  // Get devices
  const devices = await deviceService.listDevices();

  // Transform and index
  const unified = devices.map(d => toUnifiedDevice(d));
  await semanticIndex.bulkAdd(unified);

  // Now search semantically
  const results = await semanticIndex.search('bedroom lights', { limit: 5 });

  results.forEach(result => {
    console.log(`${result.device.name} (${result.score.toFixed(2)})`);
  });
}
```

## Example: Integration with DeviceRegistry

```typescript
import { DeviceRegistry } from '@/abstract/DeviceRegistry';
import { toUnifiedDevice } from '@/services/transformers';

async function buildDeviceRegistry() {
  const registry = new DeviceRegistry();
  const deviceService = new DeviceService(smartThingsClient);

  // Get and transform devices
  const devices = await deviceService.listDevices();
  const unified = devices.map(d => toUnifiedDevice(d));

  // Bulk index for efficiency
  await registry.bulkIndex(unified);

  // Query by capability
  const lights = registry.queryByCapability(DeviceCapability.SWITCH);
  console.log(`Found ${lights.length} devices with switch capability`);

  // Query by room
  const bedroomDevices = registry.queryByRoom('Master Bedroom');
  console.log(`Found ${bedroomDevices.length} devices in bedroom`);

  // Lookup by ID
  const device = registry.get('smartthings:living-room-light-001');
  if (device) {
    console.log(`Device: ${device.name}`);
  }
}
```

## Performance Tips

```typescript
// ✅ Good: Transform once, use many times
const unified = devices.map(d => toUnifiedDevice(d));
await Promise.all([
  deviceRegistry.bulkIndex(unified),
  semanticIndex.bulkAdd(unified),
  cache.setAll(unified),
]);

// ❌ Avoid: Multiple transformations
await deviceRegistry.bulkIndex(devices.map(d => toUnifiedDevice(d)));
await semanticIndex.bulkAdd(devices.map(d => toUnifiedDevice(d))); // Wasteful!
await cache.setAll(devices.map(d => toUnifiedDevice(d))); // Wasteful!

// ✅ Good: Batch processing for large lists
for (let i = 0; i < devices.length; i += 100) {
  const batch = devices.slice(i, i + 100).map(d => toUnifiedDevice(d));
  await registry.bulkIndex(batch);
}

// ✅ Good: Filter before transforming if possible
const lightsOnly = devices.filter(d => d.capabilities?.includes('switch'));
const unified = lightsOnly.map(d => toUnifiedDevice(d));
```
