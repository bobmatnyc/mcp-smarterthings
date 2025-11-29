# Tuya Cloud API Setup Guide

**Platform:** Tuya Smart Home
**Adapter:** TuyaAdapter
**Integration Type:** Cloud API (LEAP protocol via official SDK)
**Ticket Reference:** 1M-341

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Account Setup](#account-setup)
4. [Obtaining Credentials](#obtaining-credentials)
5. [Configuration](#configuration)
6. [Usage Examples](#usage-examples)
7. [Supported Devices](#supported-devices)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Configuration](#advanced-configuration)
10. [References](#references)

---

## Overview

### What is Tuya?

Tuya Smart is a global IoT development platform providing cloud services and device connectivity solutions. Tuya powers millions of smart home devices from hundreds of manufacturers worldwide, offering a unified platform for device control and automation.

### Integration Benefits

- **Wide Device Support**: Control lights, switches, sensors, thermostats, locks, cameras, and more
- **Cloud Reliability**: Official Tuya SDK with production-grade infrastructure
- **Automatic Updates**: Token lifecycle management handled by SDK
- **Global Reach**: Region-specific endpoints for optimal performance
- **Unified Control**: Single interface for devices from multiple manufacturers

### Supported Devices

TuyaAdapter supports all common Tuya device types:
- Lights (white, RGB, color temperature)
- Switches and outlets
- Dimmers
- Sensors (motion, contact, temperature, humidity, smoke, water leak)
- Climate control (thermostats, fans)
- Window coverings (curtains, blinds)
- Security (locks, cameras)
- Air quality monitors

### Prerequisites

**Hardware Requirements:**
- Tuya-compatible smart devices
- Devices connected to Tuya Smart or Smart Life app
- Internet connection for cloud API access

**Software Requirements:**
- Node.js 18+ with TypeScript support
- Active Tuya developer account
- MCP Smarterthings project installed

**Time Investment:**
- Initial setup: 15-20 minutes
- Device linking: 5-10 minutes per home

---

## Account Setup

### Step 1: Create Tuya Developer Account

1. **Navigate to Tuya IoT Platform**
   - Open browser and go to: https://iot.tuya.com
   - Click "Sign up" in top-right corner

2. **Register Account**
   - Enter email address
   - Create strong password
   - Complete email verification
   - Accept terms of service

3. **Complete Profile**
   - Enter company/personal information
   - Select your country/region
   - Choose development purpose (e.g., "Smart Home Automation")

### Step 2: Create Cloud Project

1. **Access Cloud Development**
   - Log in to Tuya IoT Platform
   - Navigate to "Cloud" → "Development" from top menu
   - Click "Create Cloud Project" button

2. **Configure Project**
   - **Project Name**: Enter descriptive name (e.g., "MCP Smarterthings Integration")
   - **Description**: Briefly describe your project
   - **Industry**: Select "Smart Home" or "Custom"
   - **Data Center**: Choose region closest to your location:
     - Americas: US East (Virginia)
     - Europe: EU Central (Frankfurt)
     - China: CN East (Hangzhou)
     - India: IN Central (Mumbai)
   - Click "Create" to finish

3. **Configure API Services**
   - In project overview, navigate to "API" tab
   - Enable required API services:
     - ✅ Smart Home Basic Service (required)
     - ✅ Device Management
     - ✅ Device Control
     - ✅ Scene Automation (optional, for scene support)
   - Click "Save" to apply changes

### Step 3: Link Devices to Project

**Method 1: Link Entire Home**

1. Open project overview page
2. Navigate to "Devices" tab
3. Click "Link Tuya App Account"
4. Scan QR code with Tuya Smart or Smart Life app
5. Authorize access to your devices
6. All devices from linked account will appear in project

**Method 2: Manual Device Linking**

1. Navigate to "Devices" → "Device List"
2. Click "Add Device"
3. Select device from available options
4. Follow pairing instructions for specific device type

**Verify Device Linking:**
- Return to project "Devices" tab
- Confirm all expected devices appear in list
- Note device IDs for reference

---

## Obtaining Credentials

### Required Credentials

TuyaAdapter requires four credentials for authentication:

| Credential | Description | Example Value |
|------------|-------------|---------------|
| **Access ID** | Client ID for OAuth authentication | `a1b2c3d4e5f6g7h8` |
| **Secret Key** | Client secret for request signing | `abc123xyz456...` (32 chars) |
| **Base URL** | Region-specific API endpoint | `https://openapi.tuyaus.com` |
| **User ID** | Your Tuya user identifier | `ay1234567890abcde` |

### Step 1: Locate Access ID and Secret Key

1. **Access Project Overview**
   - Log in to Tuya IoT Platform
   - Navigate to "Cloud" → "Development"
   - Click on your project name

2. **Find Credentials**
   - In project overview page, locate "Authorization Key" section
   - **Access ID/Client ID**: Displayed as alphanumeric string
   - **Secret Key/Client Secret**: Hidden by default, click "Show" to reveal
   - **Copy both values** to secure location (password manager recommended)

### Step 2: Identify Base URL

The base URL corresponds to your project's data center region:

| Region | Data Center | Base URL |
|--------|-------------|----------|
| **Americas** | US East (Virginia) | `https://openapi.tuyaus.com` |
| **Europe** | EU Central (Frankfurt) | `https://openapi.tuyaeu.com` |
| **China** | CN East (Hangzhou) | `https://openapi.tuyacn.com` |
| **India** | IN Central (Mumbai) | `https://openapi.tuyain.com` |

**To verify your region:**
1. Open project overview
2. Look for "Data Center" field
3. Use corresponding base URL from table above

### Step 3: Find User ID

**Method 1: API Explorer (Recommended)**

1. Navigate to "Cloud" → "API Explorer" in Tuya platform
2. Select "User Management" category
3. Choose "Get User Info by Email" endpoint
4. Enter your email address used for Tuya account
5. Click "Submit Request"
6. Copy `uid` value from response

**Method 2: Device Listing (Alternative)**

1. Use temporary configuration with access key/secret
2. TuyaAdapter will attempt to extract user ID from API token
3. Check adapter logs for auto-detected user ID
4. Update configuration with extracted user ID

---

## Configuration

### Environment Variables

Create or update `.env` file in project root:

```bash
# Tuya Cloud API Configuration
TUYA_ACCESS_KEY="your-access-id-here"
TUYA_SECRET_KEY="your-secret-key-here"
TUYA_BASE_URL="https://openapi.tuyaus.com"
TUYA_USER_ID="your-user-id-here"
```

**Security Best Practices:**
- ✅ Never commit `.env` file to source control
- ✅ Add `.env` to `.gitignore`
- ✅ Use different credentials for development/production
- ✅ Rotate credentials periodically
- ✅ Store backups in secure password manager

### TypeScript Configuration

**Basic Setup:**

```typescript
import { TuyaAdapter } from './platforms/tuya/TuyaAdapter.js';
import type { TuyaAdapterConfig } from './platforms/tuya/types.js';

// Load configuration from environment
const config: TuyaAdapterConfig = {
  accessKey: process.env.TUYA_ACCESS_KEY!,
  secretKey: process.env.TUYA_SECRET_KEY!,
  baseUrl: process.env.TUYA_BASE_URL!,
  userId: process.env.TUYA_USER_ID, // Optional, auto-detected if omitted
};

// Create adapter instance
const tuyaAdapter = new TuyaAdapter(config);

// Initialize connection
await tuyaAdapter.initialize();
console.log('Tuya adapter initialized successfully');
```

**With Error Handling:**

```typescript
import { TuyaAdapter } from './platforms/tuya/TuyaAdapter.js';
import { AuthenticationError, ConfigurationError } from './types/errors.js';

try {
  const tuyaAdapter = new TuyaAdapter({
    accessKey: process.env.TUYA_ACCESS_KEY!,
    secretKey: process.env.TUYA_SECRET_KEY!,
    baseUrl: process.env.TUYA_BASE_URL!,
    userId: process.env.TUYA_USER_ID,
  });

  await tuyaAdapter.initialize();

  // Verify connection
  const health = await tuyaAdapter.healthCheck();
  console.log('Adapter health:', health.status);

} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid Tuya credentials');
  } else if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Configuration Validation

**Verify Credentials:**

```typescript
// Check if adapter is initialized
if (tuyaAdapter.isInitialized()) {
  console.log('Adapter ready');
}

// Run health check
const health = await tuyaAdapter.healthCheck();
console.log('Health status:', health.status);
console.log('Error count:', health.errorCount);
console.log('Last check:', health.lastCheck);
```

**Expected Health Check Response:**

```json
{
  "platform": "tuya",
  "status": "healthy",
  "message": "Tuya Cloud API is operational",
  "errorCount": 0,
  "lastCheck": "2025-11-28T10:00:00.000Z",
  "details": {
    "apiReachable": true,
    "tokenValid": true,
    "deviceCount": 15
  }
}
```

---

## Usage Examples

### List All Devices

```typescript
// List all devices
const devices = await tuyaAdapter.listDevices();
console.log(`Found ${devices.length} Tuya devices`);

// Display device information
for (const device of devices) {
  console.log(`
    ID: ${device.id}
    Name: ${device.name}
    Type: ${device.platformSpecific?.category}
    Online: ${device.online}
    Capabilities: ${device.capabilities.join(', ')}
  `);
}
```

### Control Switch

```typescript
import { DeviceCapability, createDeviceCommand } from './types/unified-device.js';

// Turn switch on
await tuyaAdapter.executeCommand(
  'tuya:device123',
  createDeviceCommand(DeviceCapability.SWITCH, 'on')
);

// Turn switch off
await tuyaAdapter.executeCommand(
  'tuya:device123',
  createDeviceCommand(DeviceCapability.SWITCH, 'off')
);
```

### Control Dimmer (Brightness)

```typescript
// Set brightness to 50%
await tuyaAdapter.executeCommand(
  'tuya:light456',
  createDeviceCommand(DeviceCapability.DIMMER, 'setLevel', {
    level: 50 // 0-100 percentage
  })
);

// Turn on at specific brightness
await tuyaAdapter.executeCommand(
  'tuya:light456',
  createDeviceCommand(DeviceCapability.DIMMER, 'setLevel', {
    level: 75
  })
);
```

### Control RGB Color

```typescript
// Set color (HSV format)
await tuyaAdapter.executeCommand(
  'tuya:rgblight789',
  createDeviceCommand(DeviceCapability.COLOR, 'setColor', {
    hue: 120,        // 0-360 degrees (green)
    saturation: 100, // 0-100 percentage
    value: 100       // 0-100 percentage (brightness)
  })
);
```

### Control Color Temperature

```typescript
// Set warm white (2700K)
await tuyaAdapter.executeCommand(
  'tuya:whitelight101',
  createDeviceCommand(DeviceCapability.COLOR_TEMPERATURE, 'setColorTemperature', {
    temperature: 2700 // Kelvin
  })
);

// Set cool white (6500K)
await tuyaAdapter.executeCommand(
  'tuya:whitelight101',
  createDeviceCommand(DeviceCapability.COLOR_TEMPERATURE, 'setColorTemperature', {
    temperature: 6500
  })
);
```

### Control Thermostat

```typescript
// Set temperature
await tuyaAdapter.executeCommand(
  'tuya:thermostat202',
  createDeviceCommand(DeviceCapability.THERMOSTAT, 'setTemperature', {
    temperature: 22.5 // Celsius
  })
);

// Set mode
await tuyaAdapter.executeCommand(
  'tuya:thermostat202',
  createDeviceCommand(DeviceCapability.THERMOSTAT, 'setMode', {
    mode: 'heat' // heat, cool, auto
  })
);
```

### Control Curtain/Shade

```typescript
// Open curtain
await tuyaAdapter.executeCommand(
  'tuya:curtain303',
  createDeviceCommand(DeviceCapability.SHADE, 'open')
);

// Close curtain
await tuyaAdapter.executeCommand(
  'tuya:curtain303',
  createDeviceCommand(DeviceCapability.SHADE, 'close')
);

// Set to 50% position
await tuyaAdapter.executeCommand(
  'tuya:curtain303',
  createDeviceCommand(DeviceCapability.SHADE, 'setPosition', {
    position: 50 // 0=open, 100=closed
  })
);
```

### Get Device State

```typescript
// Get current state
const state = await tuyaAdapter.getDeviceState('tuya:device123');

console.log('Device state:');
console.log(`  Switch: ${state.attributes['switch.switch']}`);
console.log(`  Brightness: ${state.attributes['dimmer.level']}%`);
console.log(`  Online: ${state.online}`);
console.log(`  Last updated: ${state.timestamp}`);
```

### Execute Scene

```typescript
// List available scenes
const scenes = await tuyaAdapter.listScenes();
console.log('Available scenes:', scenes.map(s => s.name));

// Execute scene by ID
await tuyaAdapter.executeScene('scene_movie_time');
console.log('Scene executed successfully');
```

### Batch Commands

```typescript
import type { BatchCommandInput } from './types/commands.js';

// Execute multiple commands sequentially
const commands: BatchCommandInput[] = [
  {
    deviceId: 'tuya:light1',
    command: createDeviceCommand(DeviceCapability.SWITCH, 'on'),
  },
  {
    deviceId: 'tuya:light2',
    command: createDeviceCommand(DeviceCapability.SWITCH, 'on'),
  },
  {
    deviceId: 'tuya:curtain1',
    command: createDeviceCommand(DeviceCapability.SHADE, 'close'),
  },
];

const results = await tuyaAdapter.executeBatchCommands(commands, {
  parallel: false, // Execute sequentially
  stopOnError: false, // Continue even if one fails
});

console.log(`Executed ${results.filter(r => r.success).length}/${results.length} commands`);
```

---

## Supported Devices

### Device Capability Mapping

TuyaAdapter maps Tuya device categories and DP codes to unified capabilities:

#### Lighting Devices

| Tuya Category | Category Code | DP Codes | Unified Capabilities |
|---------------|---------------|----------|---------------------|
| **Light** | `dj` | `switch_led`, `bright_value`, `colour_data`, `temp_value` | SWITCH, DIMMER, COLOR, COLOR_TEMPERATURE |
| **Light Strip** | `dd` | `switch_led`, `bright_value`, `colour_data` | SWITCH, DIMMER, COLOR |
| **Ceiling Light** | `xdd` | `switch_led`, `bright_value`, `temp_value` | SWITCH, DIMMER, COLOR_TEMPERATURE |

#### Switch Devices

| Tuya Category | Category Code | DP Codes | Unified Capabilities |
|---------------|---------------|----------|---------------------|
| **Switch** | `kg` | `switch_1`, `switch_2`, `switch_3`, `cur_power` | SWITCH, ENERGY_METER |
| **Socket** | `cz` | `switch_1`, `cur_power`, `cur_voltage` | SWITCH, ENERGY_METER |
| **Dimmer** | `tdq` | `switch_1`, `bright_value_1` | SWITCH, DIMMER |

#### Sensor Devices

| Tuya Category | Category Code | DP Codes | Unified Capabilities |
|---------------|---------------|----------|---------------------|
| **Motion Sensor** | `pir` | `pir` | MOTION_SENSOR |
| **Door Sensor** | `mcs` | `doorcontact_state` | CONTACT_SENSOR |
| **Temp/Humidity** | `wsdcg` | `temp_current`, `humidity_value`, `battery_percentage` | TEMPERATURE_SENSOR, HUMIDITY_SENSOR, BATTERY |
| **Smoke Detector** | `ywbj` | `smoke_sensor_status`, `battery_percentage` | SMOKE_DETECTOR, BATTERY |
| **Water Sensor** | `sj` | `watersensor_state`, `battery_percentage` | WATER_LEAK_SENSOR, BATTERY |

#### Climate Control

| Tuya Category | Category Code | DP Codes | Unified Capabilities |
|---------------|---------------|----------|---------------------|
| **Thermostat** | `wk` | `temp_set`, `temp_current`, `mode`, `switch` | THERMOSTAT, TEMPERATURE_SENSOR |
| **Fan** | `fs` | `switch`, `fan_speed`, `fan_direction` | SWITCH, FAN |

#### Window Coverings

| Tuya Category | Category Code | DP Codes | Unified Capabilities |
|---------------|---------------|----------|---------------------|
| **Curtain** | `cl` | `control`, `percent_control`, `percent_state` | SHADE |

#### Security Devices

| Tuya Category | Category Code | DP Codes | Unified Capabilities |
|---------------|---------------|----------|---------------------|
| **Smart Lock** | `ms` | `unlock_fingerprint`, `unlock_password`, `battery_state` | LOCK, BATTERY |
| **IP Camera** | `sp` | `basic_flip`, `motion_switch`, `record_switch` | CAMERA, MOTION_SENSOR |

#### Other Devices

| Tuya Category | Category Code | DP Codes | Unified Capabilities |
|---------------|---------------|----------|---------------------|
| **Air Quality** | `kqjcy` | `pm25`, `voc`, `co2`, `temp`, `humidity` | AIR_QUALITY_SENSOR, TEMPERATURE_SENSOR, HUMIDITY_SENSOR |

### DP Code Reference

Common Tuya Data Point (DP) codes used across devices:

**Control:**
- `switch_led`, `switch_1`, `switch_2`, `switch_3`: On/off control
- `bright_value`, `bright_value_1`: Brightness (0-1000 scale, normalized to 0-100%)
- `colour_data`, `colour_data_v2`: RGB/HSV color data
- `temp_value`, `temp_value_v2`: Color temperature (Kelvin)
- `work_mode`: Light mode (white/colour/scene/music)

**Sensors:**
- `pir`: Motion detected (boolean)
- `doorcontact_state`: Door/window open (boolean)
- `temp_current`: Temperature (Celsius)
- `humidity_value`: Humidity (percentage)
- `battery_percentage`: Battery level (0-100%)
- `smoke_sensor_status`: Smoke detected (boolean)
- `watersensor_state`: Water leak detected (boolean)

**Energy Monitoring:**
- `cur_power`: Current power consumption (watts)
- `cur_voltage`: Current voltage (volts)
- `cur_current`: Current amperage (amps)

**Curtain/Shade:**
- `control`: Command (open/close/stop)
- `percent_control`: Set position (0-100%)
- `percent_state`: Current position (0-100%)

**Thermostat:**
- `temp_set`: Target temperature (Celsius)
- `temp_current`: Current temperature (Celsius)
- `mode`: Operating mode (heat/cool/auto)

**Lock:**
- `unlock_fingerprint`: Unlock via fingerprint
- `unlock_password`: Unlock via password
- `lock`: Lock state (locked/unlocked)

---

## Troubleshooting

### Authentication Errors

**Problem:** `AuthenticationError: Tuya authentication failed`

**Causes:**
- Invalid Access ID or Secret Key
- Credentials from wrong project
- Expired or revoked credentials

**Solutions:**
1. Verify Access ID and Secret Key from project overview
2. Check if credentials match selected project
3. Regenerate credentials if expired:
   - Navigate to project overview
   - Click "Reset Secret" button
   - Update configuration with new secret

### Connection Failures

**Problem:** `NetworkError: Tuya network error: ECONNRESET`

**Causes:**
- Incorrect base URL for region
- Firewall blocking outbound HTTPS
- Temporary Tuya API outage

**Solutions:**
1. Verify base URL matches project data center:
   ```typescript
   // Check current configuration
   console.log('Base URL:', config.baseUrl);
   // Expected format: https://openapi.tuya{region}.com
   ```
2. Test network connectivity:
   ```bash
   curl https://openapi.tuyaus.com
   ```
3. Check Tuya platform status: https://status.tuya.com

### Device Not Found

**Problem:** `DeviceNotFoundError: Device not found`

**Causes:**
- Device not linked to cloud project
- Incorrect device ID
- Device deleted from Tuya app

**Solutions:**
1. Verify device appears in project device list
2. Check device ID format (should not include `tuya:` prefix when using Tuya API)
3. Re-link device to cloud project if missing

### Rate Limiting

**Problem:** `RateLimitError: Tuya rate limit exceeded`

**Causes:**
- Exceeded free tier limit (1,000 requests/day)
- Too many requests in short period (10 QPS burst)

**Solutions:**
1. Implement request caching to reduce API calls
2. Upgrade to paid tier for higher limits (500 QPS):
   - Navigate to project settings
   - Select "Upgrade Plan"
   - Choose appropriate tier
3. Add delay between batch operations:
   ```typescript
   // Add delay to respect rate limits
   for (const device of devices) {
     await tuyaAdapter.executeCommand(device.id, command);
     await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
   }
   ```

### Invalid DP Codes

**Problem:** Command fails with unknown DP code error

**Causes:**
- Device uses non-standard DP codes
- DP mapping incomplete for device category
- Device firmware outdated

**Solutions:**
1. Check device status to see available DPs:
   ```typescript
   const state = await tuyaAdapter.getDeviceState(deviceId);
   console.log('Available DPs:', state.attributes);
   ```
2. Use platform-specific attributes for unmapped DPs:
   ```typescript
   // Access raw DP values
   const customDP = state.attributes['platform.custom_dp_123'];
   ```
3. Report unknown DPs to adapter maintainers for future mapping

### Empty Device List

**Problem:** `listDevices()` returns empty array

**Causes:**
- User ID not configured or invalid
- No devices linked to cloud project
- API permissions not granted

**Solutions:**
1. Verify user ID configuration:
   ```typescript
   console.log('User ID:', config.userId);
   ```
2. Link devices to project:
   - Navigate to project "Devices" tab
   - Click "Link Tuya App Account"
   - Scan QR code with Tuya Smart app
3. Enable required API services:
   - Project overview → "API" tab
   - Enable "Smart Home Basic Service"
   - Enable "Device Management"

### State Query Timeout

**Problem:** `TimeoutError: Operation timeout`

**Causes:**
- Slow network connection
- Tuya API performance degradation
- Large device response (many DPs)

**Solutions:**
1. Increase timeout in retry utility configuration
2. Check network latency:
   ```bash
   ping openapi.tuyaus.com
   ```
3. Use device filtering to reduce response size:
   ```typescript
   const devices = await tuyaAdapter.listDevices({
     capabilities: [DeviceCapability.SWITCH], // Filter by capability
   });
   ```

### Certificate/TLS Errors

**Problem:** SSL/TLS handshake failures

**Note:** Tuya Cloud API uses standard HTTPS. Certificate errors are rare.

**Solutions:**
1. Update Node.js to latest LTS version
2. Verify system CA certificates are up to date
3. Check corporate proxy/firewall SSL inspection

---

## Advanced Configuration

### Local API Setup (Future Enhancement)

**Note:** Current implementation uses cloud API only. Local API support planned for future release.

The local Tuya API offers lower latency (50-100ms vs 300-500ms) but requires additional setup:

**Prerequisites:**
- Devices support local control
- Local network access to devices
- Local keys extracted from cloud API

**Setup Steps:**
1. Install `tuyapi` library
2. Extract local keys from device information
3. Configure hybrid mode (local commands, cloud state sync)

**Local API Limitations:**
- Only one TCP connection per device
- Local key changes when device re-paired
- Protocol version compatibility issues
- No cloud features (scenes, automation)

### Multiple User/Home Support

**Managing Multiple Homes:**

```typescript
// List all homes (locations)
const homes = await tuyaAdapter.listLocations();

// Get devices for specific home
const homeDevices = await tuyaAdapter.listDevices({
  location: 'home_123',
});

// Get rooms within home
const rooms = await tuyaAdapter.listRooms('home_123');
```

**Managing Multiple Users:**

For multi-tenant scenarios, create separate adapter instances:

```typescript
// User 1 configuration
const user1Adapter = new TuyaAdapter({
  accessKey: process.env.TUYA_USER1_ACCESS_KEY!,
  secretKey: process.env.TUYA_USER1_SECRET_KEY!,
  baseUrl: process.env.TUYA_BASE_URL!,
  userId: 'user1_id',
});

// User 2 configuration
const user2Adapter = new TuyaAdapter({
  accessKey: process.env.TUYA_USER2_ACCESS_KEY!,
  secretKey: process.env.TUYA_USER2_SECRET_KEY!,
  baseUrl: process.env.TUYA_BASE_URL!,
  userId: 'user2_id',
});
```

### Custom Timeout Settings

Configure retry behavior for specific network conditions:

```typescript
import { retryWithBackoff } from './utils/retry.js';

// Custom retry configuration
const customRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  return retryWithBackoff(operation, {
    maxRetries: 5,        // Increase retries for flaky networks
    initialDelay: 200,    // Longer initial delay
    maxDelay: 10000,      // Higher max delay
    backoffFactor: 2,     // Exponential backoff
  });
};
```

### Error Handling Strategies

**Implement Circuit Breaker Pattern:**

```typescript
class TuyaCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private readonly threshold = 5;
  private readonly resetTimeout = 60000; // 1 minute

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    if (this.failureCount < this.threshold) {
      return false;
    }

    const now = new Date();
    const timeSinceLastFailure =
      now.getTime() - (this.lastFailureTime?.getTime() || 0);

    if (timeSinceLastFailure > this.resetTimeout) {
      this.reset();
      return false;
    }

    return true;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
  }

  private reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
  }
}
```

### State Caching

Implement caching to reduce API calls and respect rate limits:

```typescript
import { LRUCache } from 'lru-cache';

class CachedTuyaAdapter extends TuyaAdapter {
  private stateCache: LRUCache<string, DeviceState>;

  constructor(config: TuyaAdapterConfig) {
    super(config);

    this.stateCache = new LRUCache({
      max: 500,           // Maximum 500 cached states
      ttl: 30000,         // 30 second TTL
      updateAgeOnGet: true, // Refresh TTL on access
    });
  }

  async getDeviceState(deviceId: string): Promise<DeviceState> {
    // Check cache first
    const cached = this.stateCache.get(deviceId);
    if (cached) {
      return cached;
    }

    // Fetch from API
    const state = await super.getDeviceState(deviceId);

    // Cache result
    this.stateCache.set(deviceId, state);

    return state;
  }
}
```

### Event-Driven State Updates

Set up Pulsar messaging for real-time state updates (advanced):

**Note:** Requires additional Tuya Pulsar SDK setup. Refer to Tuya documentation for Pulsar configuration.

```typescript
// Placeholder for future Pulsar integration
// import { PulsarClient } from '@tuya/tuya-pulsar-sdk';

// Subscribe to device state changes
// const pulsar = new PulsarClient(config);
// pulsar.on('deviceStatusChange', (deviceId, status) => {
//   console.log(`Device ${deviceId} status changed:`, status);
// });
```

---

## References

### Official Documentation

- **Tuya IoT Platform**: https://iot.tuya.com
- **Tuya Developer Portal**: https://developer.tuya.com
- **API Documentation**: https://developer.tuya.com/en/docs/iot/api-reference
- **Device Control Best Practices**: https://developer.tuya.com/en/docs/iot/device-control-best-practice-nodejs

### SDK Resources

- **Official Node.js SDK**: https://github.com/tuya/tuya-connector-nodejs
- **NPM Package**: https://www.npmjs.com/package/@tuya/tuya-connector-nodejs
- **Community Forum**: https://www.tuyaos.com

### Project Documentation

- **Research Document**: [tuya-lutron-api-integration-research-2025-11-28.md](/Users/masa/Projects/mcp-smartthings/docs/research/tuya-lutron-api-integration-research-2025-11-28.md)
- **Implementation Summary**: [tuya-adapter-implementation.md](/Users/masa/Projects/mcp-smartthings/docs/tuya-adapter-implementation.md)
- **IDeviceAdapter Interface**: `/src/adapters/base/IDeviceAdapter.ts`
- **TuyaAdapter Source**: `/src/platforms/tuya/TuyaAdapter.ts`

### Support Resources

- **Tuya Platform Status**: https://status.tuya.com
- **GitHub Issues**: File issues in MCP Smarterthings repository
- **Ticket Reference**: Linear ticket 1M-341

---

**Last Updated:** 2025-11-28
**Version:** 1.0.0
**Status:** Production Ready
