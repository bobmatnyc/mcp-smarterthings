# Capability Mapping Guide

## Table of Contents

- [Overview](#overview)
- [DeviceCapability Enum Reference](#devicecapability-enum-reference)
- [Platform Mapping Tables](#platform-mapping-tables)
- [Value Conversion Guide](#value-conversion-guide)
- [Event-Based Capabilities](#event-based-capabilities)
- [Extending the System](#extending-the-system)
- [Runtime Utilities](#runtime-utilities)
- [Best Practices](#best-practices)

---

## Overview

### Purpose

The unified capability system provides a **platform-agnostic abstraction layer** for smart home device capabilities across SmartThings, Tuya, Lutron, and future platforms. Instead of working directly with platform-specific capability names and value formats, you work with a **unified DeviceCapability enum** and **normalized value ranges**.

### Benefits

- **🔄 Platform Independence**: Write code once, works across all platforms
- **📊 Type Safety**: Strong TypeScript typing prevents runtime errors
- **🔢 Normalized Values**: Consistent value ranges (0-100%, standard units)
- **🔌 Extensibility**: Easy to add new platforms without modifying existing code
- **🧩 Bidirectional Mapping**: Seamless translation between platform and unified formats

### How It Works

```typescript
// 1. Platform adapter detects device capability (e.g., SmartThings 'switchLevel')
const platformCapability = 'switchLevel';

// 2. Registry maps to unified capability
const unified = CapabilityRegistry.getUnifiedCapability(
  Platform.SMARTTHINGS,
  platformCapability
);
// Returns: DeviceCapability.DIMMER

// 3. Value conversion normalizes platform values
const platformValue = 75; // SmartThings: 0-100
const unifiedValue = ValueConversionRegistry.fromPlatform(
  Platform.SMARTTHINGS,
  DeviceCapability.DIMMER,
  'level',
  platformValue
);
// Returns: 75 (already normalized)

// 4. For Tuya, conversion is needed
const tuyaValue = 750; // Tuya: 0-1000
const normalizedValue = ValueConversionRegistry.fromPlatform(
  Platform.TUYA,
  DeviceCapability.DIMMER,
  'level',
  tuyaValue
);
// Returns: 75 (converted from Tuya scale)
```

### Registry System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Platform Adapters                       │
│  (SmartThings, Tuya, Lutron - platform-specific APIs)      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              CapabilityRegistry                             │
│  • Bidirectional mapping (platform ↔ unified)              │
│  • 67 total mappings (31 ST, 30 Tuya, 6 Lutron)           │
│  • Platform support detection                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         ValueConversionRegistry                             │
│  • 5 value converters (brightness, color, etc.)            │
│  • Bidirectional conversion (toPlatform/fromPlatform)      │
│  • Handles scale, format, and unit differences             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         UnifiedDevice & DeviceCapability                    │
│  • 31 capabilities (11 control, 15 sensor, 5 composite)    │
│  • Platform-agnostic device model                          │
│  • Type-safe capability detection                          │
└─────────────────────────────────────────────────────────────┘
```

---

## DeviceCapability Enum Reference

### All 31 Capabilities

The `DeviceCapability` enum defines **31 platform-agnostic capabilities** organized into three categories:

#### Control Capabilities (11 Actuators)

| Capability | Description | Common Use Cases |
|------------|-------------|------------------|
| `SWITCH` | Binary on/off control | Lights, outlets, appliances |
| `DIMMER` | Level control (0-100%) | Dimmable lights, fan speeds |
| `COLOR` | RGB/HSV color control | Color bulbs, LED strips |
| `COLOR_TEMPERATURE` | White spectrum control (Kelvin) | Tunable white lights |
| `THERMOSTAT` | Temperature control with heating/cooling modes | HVAC systems, thermostats |
| `LOCK` | Lock/unlock control | Smart locks, door locks |
| `SHADE` | Window covering position/tilt control | Blinds, shades, curtains |
| `FAN` | Fan speed control | Ceiling fans, ventilation |
| `VALVE` | Water/gas valve control | Irrigation, gas shutoff |
| `ALARM` | Security alarm control | Sirens, alarms |
| `DOOR_CONTROL` | Garage door/gate momentary control | Garage doors, gates |

#### Sensor Capabilities (15 Read-Only)

| Capability | Description | Common Use Cases |
|------------|-------------|------------------|
| `TEMPERATURE_SENSOR` | Temperature reading | Thermostats, weather stations |
| `HUMIDITY_SENSOR` | Humidity reading (0-100%) | Environmental sensors |
| `MOTION_SENSOR` | Motion detection | Security, automation triggers |
| `CONTACT_SENSOR` | Open/closed detection | Doors, windows |
| `OCCUPANCY_SENSOR` | Room occupancy detection | Presence detection, automation |
| `ILLUMINANCE_SENSOR` | Light level measurement (lux) | Daylight sensors |
| `BATTERY` | Battery level (0-100%) | Battery-powered devices |
| `AIR_QUALITY_SENSOR` | Air quality measurement | Air purifiers, monitors |
| `WATER_LEAK_SENSOR` | Water leak detection | Leak detectors |
| `SMOKE_DETECTOR` | Smoke detection | Fire safety |
| `BUTTON` | Button press events (event-based) | Scene switches, remotes |
| `PRESSURE_SENSOR` | Barometric pressure measurement | Weather stations |
| `CO_DETECTOR` | Carbon monoxide detection | Safety sensors |
| `SOUND_SENSOR` | Sound pressure level measurement | Noise monitors |

#### Composite Capabilities (5 Complex)

| Capability | Description | Common Use Cases |
|------------|-------------|------------------|
| `ENERGY_METER` | Power consumption monitoring | Smart plugs, energy monitors |
| `SPEAKER` | Audio playback control | Smart speakers |
| `MEDIA_PLAYER` | Media player control | TVs, streaming devices |
| `CAMERA` | Camera with video stream | Security cameras |
| `ROBOT_VACUUM` | Robot vacuum control | Robotic vacuums |
| `IR_BLASTER` | Infrared remote control | Universal remotes |

### Usage Examples

#### Basic Capability Detection

```typescript
import { DeviceCapability, hasCapability } from '../types/unified-device.js';

// Check if device is dimmable
if (hasCapability(device, DeviceCapability.DIMMER)) {
  console.log('Device supports dimming');
}

// Check for multiple capabilities (dimmable color light)
if (hasAllCapabilities(device, [
  DeviceCapability.SWITCH,
  DeviceCapability.DIMMER,
  DeviceCapability.COLOR
])) {
  console.log('Device is a dimmable color light');
}
```

#### Sensor vs. Controller Detection

```typescript
// Check if device is any kind of sensor
if (isSensorDevice(device)) {
  console.log('Device has sensor capabilities');
}

// Check if device is a controller
if (isControllerDevice(device)) {
  console.log('Device can control something');
}
```

#### Capability Grouping (Complex Devices)

```typescript
// Smart thermostat with multiple components
const thermostat: UnifiedDevice = {
  // ... basic device info
  capabilities: [
    DeviceCapability.THERMOSTAT,
    DeviceCapability.TEMPERATURE_SENSOR,
    DeviceCapability.HUMIDITY_SENSOR,
    DeviceCapability.FAN
  ],
  capabilityGroups: [
    {
      id: 'main',
      name: 'Main Thermostat',
      capabilities: [DeviceCapability.THERMOSTAT, DeviceCapability.TEMPERATURE_SENSOR]
    },
    {
      id: 'humidity',
      name: 'Humidity Sensor',
      capabilities: [DeviceCapability.HUMIDITY_SENSOR],
      componentId: 'humidity' // SmartThings component reference
    },
    {
      id: 'fan',
      name: 'Fan Control',
      capabilities: [DeviceCapability.FAN]
    }
  ]
};

// Query capability groups
const groups = getCapabilityGroups(thermostat);
const mainGroup = findCapabilityGroup(thermostat, 'main');
const mainCaps = getGroupCapabilities(thermostat, 'main');
```

---

## Platform Mapping Tables

### SmartThings (100% Coverage - 31/31)

All 31 unified capabilities are supported on SmartThings.

| Unified Capability | SmartThings Capability | Conversion Required | Notes |
|-------------------|------------------------|---------------------|-------|
| **Control** | | | |
| `SWITCH` | `switch` | ❌ No | Direct mapping |
| `DIMMER` | `switchLevel` | ❌ No | 0-100 on both |
| `COLOR` | `colorControl` | ✅ Yes | Hue: 0-100% → 0-360° |
| `COLOR_TEMPERATURE` | `colorTemperature` | ❌ No | Kelvin passthrough |
| `THERMOSTAT` | `thermostat` | ❌ No | Composite of 8 ST capabilities |
| `LOCK` | `lock` | ❌ No | Direct mapping |
| `SHADE` | `windowShade` | ❌ No | Direct mapping |
| `FAN` | `fanSpeed` | ❌ No | Direct mapping |
| `VALVE` | `valve` | ❌ No | Direct mapping |
| `ALARM` | `alarm` | ❌ No | Direct mapping |
| `DOOR_CONTROL` | `doorControl` or `garageDoorControl` | ❌ No | Two aliases |
| **Sensors** | | | |
| `TEMPERATURE_SENSOR` | `temperatureMeasurement` | ❌ No | Direct mapping |
| `HUMIDITY_SENSOR` | `relativeHumidityMeasurement` | ❌ No | Direct mapping |
| `MOTION_SENSOR` | `motionSensor` | ❌ No | Direct mapping |
| `CONTACT_SENSOR` | `contactSensor` | ❌ No | Direct mapping |
| `OCCUPANCY_SENSOR` | *Not directly mapped* | ❌ No | Use motion sensor |
| `ILLUMINANCE_SENSOR` | `illuminanceMeasurement` | ❌ No | Direct mapping |
| `BATTERY` | `battery` | ❌ No | Direct mapping |
| `AIR_QUALITY_SENSOR` | `airQualitySensor` | ❌ No | Direct mapping |
| `WATER_LEAK_SENSOR` | `waterSensor` | ❌ No | Direct mapping |
| `SMOKE_DETECTOR` | `smokeDetector` | ❌ No | Direct mapping |
| `BUTTON` | `button` | ❌ No | Event-based |
| `PRESSURE_SENSOR` | `pressureMeasurement` | ❌ No | Direct mapping |
| `CO_DETECTOR` | `carbonMonoxideDetector` | ❌ No | Direct mapping |
| `SOUND_SENSOR` | `soundPressureLevel` | ❌ No | Direct mapping |
| **Composite** | | | |
| `ENERGY_METER` | `powerMeter` | ❌ No | Composite with energyMeter |
| `SPEAKER` | `audioVolume` | ❌ No | Direct mapping |
| `MEDIA_PLAYER` | `mediaPlayback` | ❌ No | Direct mapping |
| `CAMERA` | `videoStream` | ❌ No | Direct mapping |
| `ROBOT_VACUUM` | `robotCleanerMovement` | ❌ No | Direct mapping |
| `IR_BLASTER` | `infraredLevel` | ❌ No | Direct mapping |

**Deprecated Capabilities**:
- `momentary` → Use `button` instead (deprecated)

### Tuya (96% Coverage - 30/31)

Missing: `OCCUPANCY_SENSOR` (not supported by Tuya)

| Unified Capability | Tuya Function Code | Conversion Required | Notes |
|-------------------|-------------------|---------------------|-------|
| **Control** | | | |
| `SWITCH` | `switch_led` | ❌ No | Direct mapping |
| `DIMMER` | `bright_value` | ✅ Yes | **0-1000 → 0-100** |
| `COLOR` | `colour_data` | ✅ Yes | **HSV JSON → object** |
| `COLOR_TEMPERATURE` | `temp_value` | ✅ Yes | Device-specific → Kelvin |
| `THERMOSTAT` | `temp_set` | ❌ No | Basic temp control |
| `LOCK` | `lock_motor_state` | ✅ Yes | Map lock states |
| `SHADE` | `position` | ❌ No | Direct mapping |
| `FAN` | `fan_speed` | ❌ No | Direct mapping |
| `VALVE` | `switch_1` | ❌ No | Generic switch |
| `ALARM` | `alarm_switch` | ❌ No | Direct mapping |
| `DOOR_CONTROL` | *Multiple* | ✅ Yes | Various door codes |
| **Sensors** | | | |
| `TEMPERATURE_SENSOR` | `temp_current` | ✅ Yes | C/F conversion |
| `HUMIDITY_SENSOR` | `humidity_value` | ❌ No | Direct mapping |
| `MOTION_SENSOR` | `pir` | ✅ Yes | pir/none → active/inactive |
| `CONTACT_SENSOR` | `doorcontact_state` | ✅ Yes | Boolean → open/closed |
| `OCCUPANCY_SENSOR` | ❌ **NOT SUPPORTED** | N/A | Use motion sensor |
| `ILLUMINANCE_SENSOR` | `bright_value` | ❌ No | Lux reading |
| `BATTERY` | `battery_percentage` | ❌ No | Direct mapping |
| `AIR_QUALITY_SENSOR` | `pm25_value` | ❌ No | PM2.5 reading |
| `WATER_LEAK_SENSOR` | `watersensor_state` | ✅ Yes | Map states |
| `SMOKE_DETECTOR` | `smoke_sensor_status` | ✅ Yes | Map states |
| `BUTTON` | `switch_mode` | ✅ Yes | Map button events |
| `PRESSURE_SENSOR` | `pressure_value` | ❌ No | Direct mapping |
| `CO_DETECTOR` | `co_status` | ✅ Yes | Map states |
| `SOUND_SENSOR` | `decibel_value` | ❌ No | Direct mapping |
| **Composite** | | | |
| `ENERGY_METER` | `cur_power` | ❌ No | Current power |
| `SPEAKER` | `volume` | ❌ No | Direct mapping |
| `MEDIA_PLAYER` | `work_state` | ✅ Yes | Map work states |
| `CAMERA` | `basic_device_status` | ✅ Yes | Complex mapping |
| `ROBOT_VACUUM` | `switch` + `mode` | ✅ Yes | Multiple codes |
| `IR_BLASTER` | `send_ir` | ❌ No | IR control |

### Lutron (19% Coverage - 6/31)

Lutron is a **lighting and shading specialist** with limited capability coverage.

| Unified Capability | Lutron Capability | Conversion Required | Notes |
|-------------------|-------------------|---------------------|-------|
| `SWITCH` | `OUTPUT` | ✅ Yes | Binary 0% or 100% only |
| `DIMMER` | `OUTPUT` | ✅ Yes | **Round 0.00-100.00 → 0-100** |
| `SHADE` | `POSITION` | ❌ No | Direct mapping |
| `SHADE` (tilt) | `TILT` | ❌ No | Tilt control |
| `OCCUPANCY_SENSOR` | `OCCUPANCY` | ✅ Yes | Map occupied/unoccupied |
| `FAN` | `FAN_SPEED` | ❌ No | RadioRA3 only |

**Not Supported by Lutron** (25 capabilities):
- Color control (COLOR, COLOR_TEMPERATURE)
- Most sensors (temperature, humidity, motion, etc.)
- Security (locks, alarms, detectors)
- Composite devices (thermostats, cameras, etc.)

---

## Value Conversion Guide

### Overview

Value conversions normalize platform-specific value formats to **unified ranges and formats**:

- **Brightness**: 0-100% (all platforms)
- **Color Hue**: 0-360° (all platforms)
- **Color Saturation**: 0-100% (all platforms)
- **Temperature**: Celsius or Fahrenheit (configurable)
- **Percentages**: 0-100 (all sensors)

### All 5 Conversion Rules

#### 1. Tuya Brightness (0-1000 → 0-100)

**Problem**: Tuya uses 0-1000 scale, unified model uses 0-100

**Solution**: Scale conversion with rounding

```typescript
// Tuya → Unified
ValueConversionRegistry.register({
  platform: Platform.TUYA,
  capability: DeviceCapability.DIMMER,
  attribute: 'level',
  fromPlatform: (value: number) => Math.round(value / 10),
  toPlatform: (value: number) => Math.round(value * 10),
  description: 'Tuya brightness scale: 0-1000 ↔ 0-100'
});

// Usage
const tuyaValue = 750; // Tuya scale
const unified = ValueConversionRegistry.fromPlatform(
  Platform.TUYA,
  DeviceCapability.DIMMER,
  'level',
  tuyaValue
);
console.log(unified); // 75 (unified scale)

// Reverse
const unifiedValue = 50;
const tuya = ValueConversionRegistry.toPlatform(
  Platform.TUYA,
  DeviceCapability.DIMMER,
  'level',
  unifiedValue
);
console.log(tuya); // 500 (Tuya scale)
```

#### 2. SmartThings Color Hue (0-100% → 0-360°)

**Problem**: SmartThings uses percentage (0-100), unified uses degrees (0-360)

**Solution**: Multiply/divide by 3.6

```typescript
// SmartThings → Unified
ValueConversionRegistry.register({
  platform: Platform.SMARTTHINGS,
  capability: DeviceCapability.COLOR,
  attribute: 'hue',
  fromPlatform: (value: number) => Math.round(value * 3.6),
  toPlatform: (value: number) => Math.round(value / 3.6),
  description: 'SmartThings hue: 0-100% ↔ 0-360 degrees'
});

// Usage
const stHue = 50; // 50% (SmartThings)
const unifiedHue = ValueConversionRegistry.fromPlatform(
  Platform.SMARTTHINGS,
  DeviceCapability.COLOR,
  'hue',
  stHue
);
console.log(unifiedHue); // 180 degrees (cyan)

// Reverse
const degrees = 270; // 270° (magenta)
const stPercent = ValueConversionRegistry.toPlatform(
  Platform.SMARTTHINGS,
  DeviceCapability.COLOR,
  'hue',
  degrees
);
console.log(stPercent); // 75 (75%)
```

#### 3. Color Saturation (Passthrough)

**No conversion needed** - All platforms use 0-100%

```typescript
// SmartThings, Tuya, all use 0-100 saturation
// No ValueConversionRegistry entry needed
// Values pass through unchanged
```

#### 4. Tuya Color Format (HSV JSON ↔ Object)

**Problem**: Tuya uses JSON string `{"h":180,"s":100,"v":255}`, unified uses object

**Solution**: JSON parse/stringify with brightness conversion

```typescript
// Tuya → Unified
ValueConversionRegistry.register({
  platform: Platform.TUYA,
  capability: DeviceCapability.COLOR,
  attribute: 'color',
  fromPlatform: (value: string) => {
    const parsed = JSON.parse(value);
    return {
      h: parsed.h,
      s: parsed.s,
      v: Math.round(parsed.v / 2.55) // 0-255 → 0-100
    };
  },
  toPlatform: (value: { h: number; s: number; v: number }) => {
    return JSON.stringify({
      h: Math.round(value.h),
      s: Math.round(value.s),
      v: Math.round(value.v * 2.55) // 0-100 → 0-255
    });
  },
  description: 'Tuya color: HSV JSON string ↔ HSV object'
});

// Usage
const tuyaColor = '{"h":180,"s":100,"v":255}';
const unified = ValueConversionRegistry.fromPlatform(
  Platform.TUYA,
  DeviceCapability.COLOR,
  'color',
  tuyaColor
);
console.log(unified); // { h: 180, s: 100, v: 100 }

// Reverse
const color = { h: 120, s: 50, v: 75 };
const tuyaJson = ValueConversionRegistry.toPlatform(
  Platform.TUYA,
  DeviceCapability.COLOR,
  'color',
  color
);
console.log(tuyaJson); // '{"h":120,"s":50,"v":191}'
```

#### 5. Lutron Output Level (Precision Rounding)

**Problem**: Lutron uses high-precision decimals (0.00-100.00), unified uses integers (0-100)

**Solution**: Round on conversion from Lutron, preserve precision to Lutron

```typescript
// Lutron → Unified
ValueConversionRegistry.register({
  platform: Platform.LUTRON,
  capability: DeviceCapability.DIMMER,
  attribute: 'level',
  fromPlatform: (value: number) => Math.round(value),
  toPlatform: (value: number) => Number(value.toFixed(2)),
  description: 'Lutron output: Round 0.00-100.00 to 0-100'
});

// Usage
const lutronLevel = 73.45; // Lutron precision
const unified = ValueConversionRegistry.fromPlatform(
  Platform.LUTRON,
  DeviceCapability.DIMMER,
  'level',
  lutronLevel
);
console.log(unified); // 73 (rounded)

// Reverse
const unifiedLevel = 50;
const lutron = ValueConversionRegistry.toPlatform(
  Platform.LUTRON,
  DeviceCapability.DIMMER,
  'level',
  unifiedLevel
);
console.log(lutron); // 50.00 (fixed precision)
```

### Conversion Lookup

```typescript
// Check if conversion exists
const hasConversion = ValueConversionRegistry.hasConversion(
  Platform.TUYA,
  DeviceCapability.DIMMER,
  'level'
);
console.log(hasConversion); // true

// Get conversion details
const conversion = ValueConversionRegistry.getConversion(
  Platform.TUYA,
  DeviceCapability.DIMMER,
  'level'
);
console.log(conversion?.description);
// "Tuya brightness scale: 0-1000 ↔ 0-100"
```

---

## Event-Based Capabilities

### Overview

Some capabilities represent **transient events** rather than persistent state:

- **BUTTON**: Button presses (pressed, double_pressed, long_pressed)
- **MOTION_SENSOR**: Motion detected events (with timeout)
- **CONTACT_SENSOR**: Open/closed events

These capabilities use an **event subscription pattern** instead of attribute polling.

### BUTTON Capability Pattern

#### Event Types

| Event Type | Description | Trigger |
|------------|-------------|---------|
| `pressed` | Single button press | One tap |
| `double_pressed` | Double-tap | Two quick taps |
| `long_pressed` | Press and hold | Hold for 1+ seconds |
| `released` | Button released | Release after hold |

#### Interface Definition

```typescript
export interface IButtonCapability extends ICapability {
  readonly type: DeviceCapability.BUTTON;

  // Event subscription (not commands)
  events: {
    buttonEvent: IEventSubscription<ButtonEventData>;
  };

  attributes: {
    /** Last button event type */
    lastEvent?: 'pressed' | 'double_pressed' | 'long_pressed' | 'released';
    /** Timestamp of last event */
    lastEventTime?: Date;
  };
}

interface ButtonEventData {
  eventType: 'pressed' | 'double_pressed' | 'long_pressed' | 'released';
  timestamp: Date;
}
```

#### Subscription Example

```typescript
import { DeviceCapability } from '../types/unified-device.js';

// Get button capability from device
const buttonCap = device.capabilities.find(
  cap => cap.type === DeviceCapability.BUTTON
) as IButtonCapability;

// Subscribe to button events
buttonCap.events.buttonEvent.subscribe((event) => {
  console.log(`Button ${event.data.eventType} at ${event.timestamp}`);

  switch (event.data.eventType) {
    case 'pressed':
      console.log('Single press - toggle light');
      break;
    case 'double_pressed':
      console.log('Double press - activate scene');
      break;
    case 'long_pressed':
      console.log('Long press - start dimming');
      break;
    case 'released':
      console.log('Released - stop dimming');
      break;
  }
});

// Unsubscribe when done
buttonCap.events.buttonEvent.unsubscribe(handler);
```

#### Platform Mapping

**SmartThings**:
```typescript
// SmartThings button events
{
  capability: 'button',
  attribute: 'button',
  values: ['pushed', 'held', 'double', 'pushed_2x', 'held_release']
}

// Maps to unified events:
// 'pushed' → 'pressed'
// 'double' or 'pushed_2x' → 'double_pressed'
// 'held' → 'long_pressed'
// 'held_release' → 'released'
```

**Tuya**:
```typescript
// Tuya switch_mode function
{
  code: 'switch_mode',
  values: ['single', 'double', 'long']
}

// Maps to unified events:
// 'single' → 'pressed'
// 'double' → 'double_pressed'
// 'long' → 'long_pressed'
```

### Event Deduplication

Events include timestamps to prevent duplicate processing:

```typescript
let lastEventTime: Date | null = null;

buttonCap.events.buttonEvent.subscribe((event) => {
  // Deduplicate events within 100ms
  if (lastEventTime &&
      event.timestamp.getTime() - lastEventTime.getTime() < 100) {
    console.log('Duplicate event, ignoring');
    return;
  }

  lastEventTime = event.timestamp;
  handleButtonPress(event.data.eventType);
});
```

---

## Extending the System

### Adding a New Capability

#### Step 1: Add to DeviceCapability Enum

```typescript
// src/types/unified-device.ts
export enum DeviceCapability {
  // ... existing capabilities

  /** New capability description */
  NEW_CAPABILITY = 'newCapability',
}
```

#### Step 2: Define Capability Interface

```typescript
// src/types/capabilities.ts

/**
 * New capability - Description of what it does.
 *
 * Platform Mappings:
 * - SmartThings: 'platformCapabilityName'
 * - Tuya: 'platform_code'
 * - Lutron: ❌ Not supported
 *
 * Commands: command1, command2
 * Attributes: attr1, attr2
 */
export interface INewCapability extends ICapability {
  readonly type: DeviceCapability.NEW_CAPABILITY;

  commands: {
    /** Command description */
    command1: (param: string) => Promise<void>;
  };

  attributes: {
    /** Attribute description */
    attr1: string;
  };
}
```

#### Step 3: Register Platform Mappings

```typescript
// src/types/capability-registry.ts

export function initializeCapabilityMappings(): void {
  // ... existing mappings

  // SmartThings mapping
  CapabilityRegistry.register({
    platform: Platform.SMARTTHINGS,
    platformCapability: 'smartthingsCapabilityName',
    unifiedCapability: DeviceCapability.NEW_CAPABILITY,
    conversionRequired: false,
    notes: 'Optional mapping notes'
  });

  // Tuya mapping
  CapabilityRegistry.register({
    platform: Platform.TUYA,
    platformCapability: 'tuya_code',
    unifiedCapability: DeviceCapability.NEW_CAPABILITY,
    conversionRequired: true,
    notes: 'Requires value conversion'
  });
}
```

#### Step 4: Add Value Conversions (If Needed)

```typescript
// src/types/capability-registry.ts

export function initializeValueConversions(): void {
  // ... existing conversions

  ValueConversionRegistry.register({
    platform: Platform.TUYA,
    capability: DeviceCapability.NEW_CAPABILITY,
    attribute: 'attributeName',
    fromPlatform: (value: PlatformType) => {
      // Convert platform value to unified format
      return convertedValue;
    },
    toPlatform: (value: UnifiedType) => {
      // Convert unified value to platform format
      return platformValue;
    },
    description: 'Description of conversion logic'
  });
}
```

### Adding a New Platform

#### Step 1: Add to Platform Enum

```typescript
// src/types/unified-device.ts
export enum Platform {
  SMARTTHINGS = 'smartthings',
  TUYA = 'tuya',
  LUTRON = 'lutron',
  NEW_PLATFORM = 'newPlatform', // Add here
}
```

#### Step 2: Register All Capability Mappings

```typescript
// src/types/capability-registry.ts

export function initializeCapabilityMappings(): void {
  // ... existing mappings

  //
  // New Platform Capability Mappings
  //

  CapabilityRegistry.register({
    platform: Platform.NEW_PLATFORM,
    platformCapability: 'platform-switch-name',
    unifiedCapability: DeviceCapability.SWITCH,
    conversionRequired: false
  });

  // Add all supported capabilities...
}
```

#### Step 3: Add Platform-Specific Conversions

```typescript
export function initializeValueConversions(): void {
  // ... existing conversions

  // Add conversions for platform-specific value formats
}
```

#### Step 4: Create Platform Adapter

```typescript
// src/adapters/new-platform-adapter.ts

export class NewPlatformAdapter {
  async getDevices(): Promise<UnifiedDevice[]> {
    const platformDevices = await this.fetchFromPlatform();

    return platformDevices.map(device => ({
      id: createUniversalDeviceId(Platform.NEW_PLATFORM, device.id),
      platform: Platform.NEW_PLATFORM,
      platformDeviceId: device.id,
      name: device.name,

      // Map platform capabilities to unified capabilities
      capabilities: device.capabilities.map(cap => {
        const unified = CapabilityRegistry.getUnifiedCapability(
          Platform.NEW_PLATFORM,
          cap
        );
        return unified;
      }).filter(Boolean),

      // ... other unified fields
    }));
  }
}
```

---

## Runtime Utilities

### All 9 Utility Functions

The unified device module provides **9 runtime utility functions** for capability detection and device querying.

#### 1. `hasCapability(device, capability)`

Check if device has a specific capability.

```typescript
import { hasCapability, DeviceCapability } from '../types/unified-device.js';

if (hasCapability(device, DeviceCapability.DIMMER)) {
  console.log('Device supports dimming');
}
```

#### 2. `getActiveCapabilities(device)`

Get all capabilities for a device.

```typescript
const caps = getActiveCapabilities(device);
console.log(`Device has ${caps.length} capabilities`);
console.log(caps); // [DeviceCapability.SWITCH, DeviceCapability.DIMMER, ...]
```

#### 3. `hasAllCapabilities(device, capabilities)`

Check if device has ALL specified capabilities.

```typescript
// Check for dimmable color light
if (hasAllCapabilities(device, [
  DeviceCapability.SWITCH,
  DeviceCapability.DIMMER,
  DeviceCapability.COLOR
])) {
  console.log('Full color dimmable light');
}
```

#### 4. `hasAnyCapability(device, capabilities)`

Check if device has AT LEAST ONE of the specified capabilities.

```typescript
// Check for any sensor
if (hasAnyCapability(device, [
  DeviceCapability.MOTION_SENSOR,
  DeviceCapability.CONTACT_SENSOR,
  DeviceCapability.OCCUPANCY_SENSOR
])) {
  console.log('Device has some kind of presence detection');
}
```

#### 5. `getCapabilityGroups(device)`

Get capability groups for composite devices.

```typescript
const groups = getCapabilityGroups(device);
for (const group of groups) {
  console.log(`${group.name}: ${group.capabilities.join(', ')}`);
}

// Output:
// Main Controls: thermostat, temperatureSensor
// Humidity Sensor: humiditySensor
// Fan Control: fan
```

#### 6. `findCapabilityGroup(device, groupId)`

Find a specific capability group by ID.

```typescript
const mainGroup = findCapabilityGroup(device, 'main');
if (mainGroup) {
  console.log(`Main group: ${mainGroup.name}`);
  console.log(`Capabilities: ${mainGroup.capabilities.join(', ')}`);
}
```

#### 7. `getGroupCapabilities(device, groupId)`

Get capabilities from a specific group.

```typescript
const mainCaps = getGroupCapabilities(device, 'main');
console.log(`Main component has ${mainCaps.length} capabilities`);
```

#### 8. `isSensorDevice(device)`

Check if device has any sensor capability.

```typescript
if (isSensorDevice(device)) {
  console.log('Device is a sensor');
}

// Checks for these capabilities:
// TEMPERATURE_SENSOR, HUMIDITY_SENSOR, MOTION_SENSOR, CONTACT_SENSOR,
// OCCUPANCY_SENSOR, ILLUMINANCE_SENSOR, AIR_QUALITY_SENSOR,
// WATER_LEAK_SENSOR, SMOKE_DETECTOR, PRESSURE_SENSOR, CO_DETECTOR, SOUND_SENSOR
```

#### 9. `isControllerDevice(device)`

Check if device has any control capability.

```typescript
if (isControllerDevice(device)) {
  console.log('Device can control something');
}

// Checks for these capabilities:
// SWITCH, DIMMER, COLOR, COLOR_TEMPERATURE, THERMOSTAT, LOCK,
// SHADE, FAN, VALVE, ALARM, DOOR_CONTROL
```

### Capability Registry Methods

#### Platform Support Detection

```typescript
import { CapabilityRegistry, Platform, DeviceCapability } from '../types/capability-registry.js';

// Check if platform supports capability
const supported = CapabilityRegistry.isPlatformSupported(
  Platform.LUTRON,
  DeviceCapability.COLOR
);
console.log(supported); // false

// Get all supported capabilities for platform
const lutronCaps = CapabilityRegistry.getSupportedCapabilities(Platform.LUTRON);
console.log(lutronCaps);
// [DeviceCapability.SWITCH, DeviceCapability.DIMMER, DeviceCapability.SHADE, ...]
```

#### Capability Translation

```typescript
// Get unified capability from platform capability
const unified = CapabilityRegistry.getUnifiedCapability(
  Platform.SMARTTHINGS,
  'switchLevel'
);
console.log(unified); // DeviceCapability.DIMMER

// Get platform capability from unified capability
const platform = CapabilityRegistry.getPlatformCapability(
  Platform.TUYA,
  DeviceCapability.DIMMER
);
console.log(platform); // 'bright_value'
```

#### Mapping Details

```typescript
// Get full mapping information
const mapping = CapabilityRegistry.getMapping(
  Platform.TUYA,
  'bright_value'
);
console.log(mapping);
// {
//   platform: 'tuya',
//   platformCapability: 'bright_value',
//   unifiedCapability: 'dimmer',
//   conversionRequired: true,
//   notes: '0-1000 → 0-100'
// }
```

---

## Best Practices

### When to Use Which Capability

#### Use SWITCH for Simple On/Off
```typescript
// ✅ Good - Simple binary control
if (hasCapability(device, DeviceCapability.SWITCH)) {
  await device.capabilities.switch.commands.toggle();
}

// ❌ Avoid - Don't use DIMMER for binary devices
```

#### Use DIMMER for Gradual Control
```typescript
// ✅ Good - Smooth dimming
if (hasCapability(device, DeviceCapability.DIMMER)) {
  await device.capabilities.dimmer.commands.setLevel(50, 2); // 2 second transition
}

// ❌ Avoid - Don't use SWITCH for dimmable lights
```

#### Combine Capabilities for Full Control
```typescript
// ✅ Good - Check all needed capabilities
if (hasAllCapabilities(device, [
  DeviceCapability.SWITCH,
  DeviceCapability.DIMMER,
  DeviceCapability.COLOR
])) {
  // Full color control available
  await device.capabilities.color.commands.setColor(180, 100, 75);
}
```

### Handling Missing Capabilities

#### Graceful Fallback

```typescript
// ✅ Good - Fallback to simpler capability
if (hasCapability(device, DeviceCapability.COLOR)) {
  await device.capabilities.color.commands.setColor(hue, sat, brightness);
} else if (hasCapability(device, DeviceCapability.DIMMER)) {
  await device.capabilities.dimmer.commands.setLevel(brightness);
} else if (hasCapability(device, DeviceCapability.SWITCH)) {
  await device.capabilities.switch.commands[brightness > 0 ? 'on' : 'off']();
}
```

#### Platform-Specific Checks

```typescript
// ✅ Good - Check platform support before using capability
const platform = parseUniversalDeviceId(device.id).platform;

if (CapabilityRegistry.isPlatformSupported(platform, DeviceCapability.OCCUPANCY_SENSOR)) {
  // Use occupancy sensor
} else {
  // Fallback to motion sensor
  if (hasCapability(device, DeviceCapability.MOTION_SENSOR)) {
    // Use motion detection instead
  }
}
```

### Error Handling Patterns

#### Capability Check Before Command

```typescript
// ✅ Good - Check capability first
if (hasCapability(device, DeviceCapability.LOCK)) {
  try {
    await device.capabilities.lock.commands.lock();
  } catch (error) {
    console.error('Lock command failed:', error);
  }
} else {
  console.warn('Device does not support locking');
}

// ❌ Avoid - Assuming capability exists
try {
  await device.capabilities.lock.commands.lock(); // May throw if not supported
} catch (error) {
  // Too late to handle gracefully
}
```

#### Value Conversion Error Handling

```typescript
// ✅ Good - Handle conversion errors
try {
  const platformValue = ValueConversionRegistry.toPlatform(
    platform,
    capability,
    attribute,
    unifiedValue
  );
  await sendToPlatform(platformValue);
} catch (error) {
  console.error('Value conversion failed:', error);
  // Fallback or user notification
}
```

### Performance Considerations

#### Cache Capability Checks

```typescript
// ✅ Good - Cache capability check results
class DeviceController {
  private capabilities: Set<DeviceCapability>;

  constructor(device: UnifiedDevice) {
    this.capabilities = new Set(device.capabilities);
  }

  hasCapability(cap: DeviceCapability): boolean {
    return this.capabilities.has(cap); // O(1) lookup
  }
}

// ❌ Avoid - Repeated array searches
for (let i = 0; i < 1000; i++) {
  if (hasCapability(device, DeviceCapability.DIMMER)) { // O(n) each time
    // ...
  }
}
```

#### Batch Value Conversions

```typescript
// ✅ Good - Convert multiple values together
const attributes = {
  level: ValueConversionRegistry.toPlatform(platform, cap, 'level', 50),
  hue: ValueConversionRegistry.toPlatform(platform, cap, 'hue', 180),
  saturation: ValueConversionRegistry.toPlatform(platform, cap, 'saturation', 100)
};
await sendBatchUpdate(attributes);

// ❌ Avoid - Individual conversions with separate API calls
```

#### Use Compact Device Queries

```typescript
// ✅ Good - Only request needed capabilities
const devices = await adapter.getDevices({
  capabilities: [DeviceCapability.SWITCH, DeviceCapability.DIMMER]
});

// ❌ Avoid - Fetching all devices and filtering client-side
const allDevices = await adapter.getDevices();
const filtered = allDevices.filter(d => hasCapability(d, DeviceCapability.DIMMER));
```

### Type Safety Tips

#### Use Type Guards

```typescript
// ✅ Good - Type-safe capability checking
function isDimmableLight(device: UnifiedDevice): boolean {
  return hasAllCapabilities(device, [
    DeviceCapability.SWITCH,
    DeviceCapability.DIMMER
  ]);
}

if (isDimmableLight(device)) {
  // TypeScript knows device has switch and dimmer
}
```

#### Leverage Discriminated Unions

```typescript
// ✅ Good - Use type field for narrowing
function handleCapability(cap: ICapability) {
  switch (cap.type) {
    case DeviceCapability.SWITCH:
      // TypeScript knows cap is ISwitchCapability
      await cap.commands.toggle();
      break;
    case DeviceCapability.DIMMER:
      // TypeScript knows cap is IDimmerCapability
      await cap.commands.setLevel(50);
      break;
  }
}
```

### Documentation Standards

#### Always Document Platform Mappings

```typescript
/**
 * New capability - Description.
 *
 * Platform Mappings:
 * - SmartThings: 'capabilityName'
 * - Tuya: 'function_code'
 * - Lutron: ❌ Not supported
 *
 * Commands: command1, command2
 * Attributes: attr1, attr2
 */
```

#### Document Conversion Requirements

```typescript
CapabilityRegistry.register({
  platform: Platform.TUYA,
  platformCapability: 'bright_value',
  unifiedCapability: DeviceCapability.DIMMER,
  conversionRequired: true,
  notes: '0-1000 → 0-100' // Clear conversion note
});
```

---

## Summary

### Key Takeaways

1. **31 Unified Capabilities** covering control, sensor, and composite devices
2. **3 Platforms Supported**: SmartThings (100%), Tuya (96%), Lutron (19%)
3. **5 Value Conversions**: Brightness, color hue/format, Lutron precision
4. **9 Runtime Utilities**: Capability detection, grouping, type checking
5. **Event-Based Pattern**: For transient actions (buttons, events)

### Quick Reference

| Need | Use |
|------|-----|
| Check device capability | `hasCapability(device, DeviceCapability.X)` |
| Check multiple capabilities | `hasAllCapabilities(device, [cap1, cap2])` |
| Check any of several | `hasAnyCapability(device, [cap1, cap2])` |
| List all capabilities | `getActiveCapabilities(device)` |
| Check if sensor | `isSensorDevice(device)` |
| Check if controller | `isControllerDevice(device)` |
| Translate platform → unified | `CapabilityRegistry.getUnifiedCapability(platform, cap)` |
| Translate unified → platform | `CapabilityRegistry.getPlatformCapability(platform, cap)` |
| Convert value to platform | `ValueConversionRegistry.toPlatform(platform, cap, attr, value)` |
| Convert value from platform | `ValueConversionRegistry.fromPlatform(platform, cap, attr, value)` |

### Next Steps

- Review [Quick Reference Card](./capability-quick-reference.md) for cheat sheet
- Explore [capability-registry.ts](../src/types/capability-registry.ts) for implementation details
- See [unified-device.test.ts](../src/types/__tests__/unified-device.test.ts) for usage examples
- Check [Platform Adapters](../src/adapters/) for platform-specific implementations

---

**Document Version**: 1.0
**Last Updated**: 2025-11-26
**Related Ticket**: 1M-241
