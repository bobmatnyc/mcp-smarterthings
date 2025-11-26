# Capability Quick Reference Card

**Quick lookup guide for the unified capability system**

---

## 📊 Capability Coverage by Platform

| Platform | Coverage | Supported Capabilities |
|----------|----------|------------------------|
| **SmartThings** | **100%** (31/31) | All capabilities |
| **Tuya** | **96%** (30/31) | All except OCCUPANCY_SENSOR |
| **Lutron** | **19%** (6/31) | SWITCH, DIMMER, SHADE, FAN, OCCUPANCY_SENSOR |

---

## 🎯 All 31 Capabilities at a Glance

### Control (11)

| Capability | SmartThings | Tuya | Lutron | Notes |
|------------|-------------|------|--------|-------|
| `SWITCH` | ✅ switch | ✅ switch_led | ✅ OUTPUT | Binary on/off |
| `DIMMER` | ✅ switchLevel | ✅ bright_value⚡ | ✅ OUTPUT⚡ | 0-100% level |
| `COLOR` | ✅ colorControl⚡ | ✅ colour_data⚡ | ❌ | RGB/HSV color |
| `COLOR_TEMPERATURE` | ✅ colorTemperature | ✅ temp_value⚡ | ❌ | White spectrum (K) |
| `THERMOSTAT` | ✅ thermostat | ✅ temp_set | ❌ | Temp control |
| `LOCK` | ✅ lock | ✅ lock_motor_state⚡ | ❌ | Lock/unlock |
| `SHADE` | ✅ windowShade | ✅ position | ✅ POSITION/TILT | Window covering |
| `FAN` | ✅ fanSpeed | ✅ fan_speed | ✅ FAN_SPEED | Fan control |
| `VALVE` | ✅ valve | ✅ switch_1 | ❌ | Water/gas valve |
| `ALARM` | ✅ alarm | ✅ alarm_switch | ❌ | Security alarm |
| `DOOR_CONTROL` | ✅ doorControl | ✅ (various) | ❌ | Garage door |

**⚡ = Conversion required**

### Sensors (15)

| Capability | SmartThings | Tuya | Lutron | Notes |
|------------|-------------|------|--------|-------|
| `TEMPERATURE_SENSOR` | ✅ temperatureMeasurement | ✅ temp_current⚡ | ❌ | Temperature |
| `HUMIDITY_SENSOR` | ✅ relativeHumidityMeasurement | ✅ humidity_value | ❌ | Humidity % |
| `MOTION_SENSOR` | ✅ motionSensor | ✅ pir⚡ | ❌ | Motion detect |
| `CONTACT_SENSOR` | ✅ contactSensor | ✅ doorcontact_state⚡ | ❌ | Open/closed |
| `OCCUPANCY_SENSOR` | ✅ (use motion) | ❌ **NOT SUPPORTED** | ✅ OCCUPANCY⚡ | Room occupancy |
| `ILLUMINANCE_SENSOR` | ✅ illuminanceMeasurement | ✅ bright_value | ❌ | Light level (lux) |
| `BATTERY` | ✅ battery | ✅ battery_percentage | ❌ | Battery % |
| `AIR_QUALITY_SENSOR` | ✅ airQualitySensor | ✅ pm25_value | ❌ | Air quality |
| `WATER_LEAK_SENSOR` | ✅ waterSensor | ✅ watersensor_state⚡ | ❌ | Water leak |
| `SMOKE_DETECTOR` | ✅ smokeDetector | ✅ smoke_sensor_status⚡ | ❌ | Smoke detect |
| `BUTTON` | ✅ button | ✅ switch_mode⚡ | ❌ | **Event-based** |
| `PRESSURE_SENSOR` | ✅ pressureMeasurement | ✅ pressure_value | ❌ | Barometric |
| `CO_DETECTOR` | ✅ carbonMonoxideDetector | ✅ co_status⚡ | ❌ | CO detect |
| `SOUND_SENSOR` | ✅ soundPressureLevel | ✅ decibel_value | ❌ | Sound level |

### Composite (5)

| Capability | SmartThings | Tuya | Lutron | Notes |
|------------|-------------|------|--------|-------|
| `ENERGY_METER` | ✅ powerMeter | ✅ cur_power | ❌ | Power monitoring |
| `SPEAKER` | ✅ audioVolume | ✅ volume | ❌ | Audio playback |
| `MEDIA_PLAYER` | ✅ mediaPlayback | ✅ work_state⚡ | ❌ | Media control |
| `CAMERA` | ✅ videoStream | ✅ basic_device_status⚡ | ❌ | Video stream |
| `ROBOT_VACUUM` | ✅ robotCleanerMovement | ✅ switch+mode⚡ | ❌ | Vacuum control |
| `IR_BLASTER` | ✅ infraredLevel | ✅ send_ir | ❌ | IR remote |

---

## ⚡ Value Conversions Cheat Sheet

### 1. Tuya Brightness
```typescript
// Tuya: 0-1000 ↔ Unified: 0-100
fromPlatform: (value) => Math.round(value / 10)
toPlatform: (value) => Math.round(value * 10)
```

### 2. SmartThings Hue
```typescript
// SmartThings: 0-100% ↔ Unified: 0-360°
fromPlatform: (value) => Math.round(value * 3.6)
toPlatform: (value) => Math.round(value / 3.6)
```

### 3. Tuya Color Format
```typescript
// Tuya: JSON string ↔ Unified: object
fromPlatform: (json) => {
  const p = JSON.parse(json);
  return { h: p.h, s: p.s, v: Math.round(p.v / 2.55) };
}
toPlatform: (obj) => JSON.stringify({
  h: Math.round(obj.h),
  s: Math.round(obj.s),
  v: Math.round(obj.v * 2.55)
})
```

### 4. Saturation (NO CONVERSION)
```typescript
// All platforms: 0-100% (passthrough)
```

### 5. Lutron Output
```typescript
// Lutron: 0.00-100.00 ↔ Unified: 0-100
fromPlatform: (value) => Math.round(value)
toPlatform: (value) => Number(value.toFixed(2))
```

---

## 🔧 Runtime Utility Functions

### Capability Detection

```typescript
// Check single capability
hasCapability(device, DeviceCapability.DIMMER)

// Check all required
hasAllCapabilities(device, [SWITCH, DIMMER, COLOR])

// Check any of several
hasAnyCapability(device, [MOTION_SENSOR, CONTACT_SENSOR])

// Get all capabilities
getActiveCapabilities(device) // Returns: DeviceCapability[]

// Type checks
isSensorDevice(device)      // Has any sensor capability
isControllerDevice(device)  // Has any control capability
```

### Capability Groups (Complex Devices)

```typescript
// Get all groups
getCapabilityGroups(device)

// Find specific group
findCapabilityGroup(device, 'main')

// Get capabilities in group
getGroupCapabilities(device, 'main')
```

### Registry Queries

```typescript
// Platform support
CapabilityRegistry.isPlatformSupported(
  Platform.LUTRON,
  DeviceCapability.COLOR
) // false

// Get all supported capabilities
CapabilityRegistry.getSupportedCapabilities(Platform.TUYA)

// Translate capabilities
CapabilityRegistry.getUnifiedCapability(
  Platform.SMARTTHINGS,
  'switchLevel'
) // DeviceCapability.DIMMER

CapabilityRegistry.getPlatformCapability(
  Platform.TUYA,
  DeviceCapability.DIMMER
) // 'bright_value'
```

### Value Conversion

```typescript
// Convert to platform format
ValueConversionRegistry.toPlatform(
  Platform.TUYA,
  DeviceCapability.DIMMER,
  'level',
  50  // Unified value
) // 500 (Tuya value)

// Convert from platform format
ValueConversionRegistry.fromPlatform(
  Platform.TUYA,
  DeviceCapability.DIMMER,
  'level',
  750 // Tuya value
) // 75 (Unified value)

// Check if conversion exists
ValueConversionRegistry.hasConversion(
  Platform.TUYA,
  DeviceCapability.DIMMER,
  'level'
) // true
```

---

## 🎛️ Common Code Patterns

### Graceful Fallback

```typescript
// Try color, fall back to dimmer, fall back to switch
if (hasCapability(device, DeviceCapability.COLOR)) {
  await device.capabilities.color.setColor(hue, sat, brightness);
} else if (hasCapability(device, DeviceCapability.DIMMER)) {
  await device.capabilities.dimmer.setLevel(brightness);
} else if (hasCapability(device, DeviceCapability.SWITCH)) {
  await device.capabilities.switch[brightness > 0 ? 'on' : 'off']();
}
```

### Platform-Specific Handling

```typescript
const { platform } = parseUniversalDeviceId(device.id);

if (platform === Platform.TUYA) {
  // Tuya-specific logic
} else if (platform === Platform.SMARTTHINGS) {
  // SmartThings-specific logic
}
```

### Event Subscription (BUTTON)

```typescript
const buttonCap = device.capabilities.find(
  cap => cap.type === DeviceCapability.BUTTON
);

buttonCap.events.buttonEvent.subscribe((event) => {
  switch (event.data.eventType) {
    case 'pressed': // Single press
    case 'double_pressed': // Double tap
    case 'long_pressed': // Hold
    case 'released': // Release
  }
});
```

### Type-Safe Capability Handling

```typescript
function handleCapability(cap: ICapability) {
  switch (cap.type) {
    case DeviceCapability.SWITCH:
      await cap.commands.toggle();
      break;
    case DeviceCapability.DIMMER:
      await cap.commands.setLevel(50);
      break;
    // TypeScript enforces type safety
  }
}
```

---

## 📐 Value Ranges Reference

| Capability | Attribute | Range | Unit | Notes |
|------------|-----------|-------|------|-------|
| DIMMER | level | 0-100 | % | 0=off, 100=max |
| COLOR | hue | 0-360 | degrees | Red=0, Green=120, Blue=240 |
| COLOR | saturation | 0-100 | % | 0=white, 100=pure color |
| COLOR | brightness | 0-100 | % | 0=black, 100=max |
| COLOR_TEMPERATURE | temperature | 2000-6500 | Kelvin | Warm to cool white |
| BATTERY | level | 0-100 | % | Battery percentage |
| HUMIDITY_SENSOR | humidity | 0-100 | % | Relative humidity |
| TEMPERATURE_SENSOR | temperature | -273.15+ | °C or °F | Configurable unit |
| ILLUMINANCE_SENSOR | illuminance | 0+ | lux | Light level |
| FAN | speed | 0-100 | % | 0=off, 100=max |

---

## 🚦 Platform Decision Matrix

### When to Use Each Platform

| Use Case | Recommended Platform | Reason |
|----------|---------------------|--------|
| Full smart home automation | **SmartThings** | 100% capability coverage |
| Budget-friendly devices | **Tuya** | Wide device availability |
| Premium lighting control | **Lutron** | Best-in-class lighting |
| Color lighting | SmartThings or Tuya | Lutron doesn't support color |
| Sensors/security | SmartThings | Best sensor coverage |
| Occupancy detection | Lutron or SmartThings | Tuya lacks occupancy sensor |

### Platform Capability Gaps

| Missing Capability | Platform | Workaround |
|-------------------|----------|------------|
| OCCUPANCY_SENSOR | Tuya | Use MOTION_SENSOR instead |
| COLOR | Lutron | Use COLOR_TEMPERATURE for tunab le white |
| Most sensors | Lutron | Integrate with SmartThings or Tuya |
| DOOR_CONTROL | Lutron | Not applicable (lighting specialist) |

---

## 🏷️ Common Device Type Examples

### Dimmable Color Light
```typescript
capabilities: [
  DeviceCapability.SWITCH,
  DeviceCapability.DIMMER,
  DeviceCapability.COLOR,
  DeviceCapability.COLOR_TEMPERATURE
]
```

### Smart Thermostat
```typescript
capabilities: [
  DeviceCapability.THERMOSTAT,
  DeviceCapability.TEMPERATURE_SENSOR,
  DeviceCapability.HUMIDITY_SENSOR,
  DeviceCapability.FAN
]
```

### Multi-Sensor
```typescript
capabilities: [
  DeviceCapability.MOTION_SENSOR,
  DeviceCapability.TEMPERATURE_SENSOR,
  DeviceCapability.HUMIDITY_SENSOR,
  DeviceCapability.ILLUMINANCE_SENSOR,
  DeviceCapability.BATTERY
]
```

### Smart Lock
```typescript
capabilities: [
  DeviceCapability.LOCK,
  DeviceCapability.BATTERY
]
```

### Motorized Shade
```typescript
capabilities: [
  DeviceCapability.SHADE,
  DeviceCapability.BATTERY // If battery-powered
]
```

---

## 📚 Related Documentation

- **[Capability Mapping Guide](./capability-mapping-guide.md)** - Full comprehensive guide
- **[unified-device.ts](../src/types/unified-device.ts)** - DeviceCapability enum source
- **[capability-registry.ts](../src/types/capability-registry.ts)** - Registry implementation
- **[capabilities.ts](../src/types/capabilities.ts)** - Capability interfaces

---

## ⚠️ Important Notes

1. **Conversion Required (⚡)**: These capabilities need value conversion between platform and unified formats
2. **Event-Based**: BUTTON capability uses event subscription, not polling
3. **Tuya Limitation**: Missing OCCUPANCY_SENSOR - use MOTION_SENSOR instead
4. **Lutron Focus**: Only 6/31 capabilities (lighting and shading specialist)
5. **SmartThings Aliases**: `doorControl` and `garageDoorControl` both map to DOOR_CONTROL

---

**Document Version**: 1.0
**Last Updated**: 2025-11-26
**Related Ticket**: 1M-241
