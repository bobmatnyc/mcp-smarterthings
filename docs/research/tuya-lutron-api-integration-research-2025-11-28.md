# Tuya Cloud API & Lutron Caseta API Integration Research

**Research Date:** 2025-11-28
**Researcher:** Research Agent
**Tickets:** 1M-341 (Tuya), 1M-340 (Lutron)
**Parent Epic:** MCP Smarterthings (89098cb0dd3c)
**Priority:** High

## Executive Summary

This research provides comprehensive analysis of Tuya Cloud API and Lutron Caseta API integration options for the MCP Smarterthings project. Both platforms have mature Node.js/TypeScript SDKs available, with clear paths to implementation following the existing `IDeviceAdapter` interface pattern established by `SmartThingsAdapter`.

**Key Findings:**
- **Tuya**: Official TypeScript SDK (`@tuya/tuya-connector-nodejs`) with cloud API support; local API available via `tuyapi` library
- **Lutron**: TypeScript library (`lutron-leap`) implementing local LEAP protocol for Smart Bridge control
- **Capability Mapping**: Both platforms align well with existing 31 unified capabilities
- **Implementation Complexity**: Medium for both platforms (similar to SmartThings implementation)
- **Recommended Approach**: Start with cloud APIs for both platforms, add local control as enhancement

---

## 1. Tuya Cloud API Research (Ticket 1M-341)

### 1.1 SDK Options

#### Recommended: @tuya/tuya-connector-nodejs (Official)
- **Package:** `@tuya/tuya-connector-nodejs`
- **NPM:** https://www.npmjs.com/package/@tuya/tuya-connector-nodejs
- **GitHub:** https://github.com/tuya/tuya-connector-nodejs
- **TypeScript Support:** ✅ Native TypeScript (100% TypeScript codebase)
- **Latest Version:** Active maintenance (official Tuya SDK)
- **Documentation:** https://developer.tuya.com/en/docs/iot/device-control-best-practice-nodejs

**Installation:**
```bash
npm install @tuya/tuya-connector-nodejs
```

**Key Features:**
- Official SDK from Tuya Platform
- Token lifecycle management with pluggable storage
- Sign algorithm support (HMAC-SHA256)
- Memory-based storage by default (Redis adapter available)
- Built-in token refresh mechanism
- Generic request API for all Tuya Cloud endpoints

#### Alternative: tuyapi (Local API - Community)
- **Package:** `tuyapi`
- **NPM:** https://www.npmjs.com/package/tuyapi
- **GitHub:** https://github.com/codetheweb/tuyapi
- **Use Case:** Local device control without cloud dependency
- **Requirement:** Device ID, local key, IP address, protocol version
- **Limitation:** Only one TCP connection per device at a time

**Trade-off Analysis:**
| Feature | Cloud API (@tuya/tuya-connector) | Local API (tuyapi) |
|---------|----------------------------------|---------------------|
| Reliability | ✅ High (cloud infrastructure) | ⚠️ Network-dependent |
| Latency | ~300-500ms | ~50-100ms |
| Internet Required | ✅ Yes | ❌ No (LAN only) |
| Setup Complexity | Medium (OAuth, credentials) | High (local key extraction) |
| Rate Limits | Yes (500 req/sec) | None |
| Official Support | ✅ Yes | ❌ Community |

**Recommendation:** Start with **cloud API** (@tuya/tuya-connector-nodejs) for initial implementation due to official support, simpler authentication, and better reliability. Local API can be added as Phase 2 enhancement for latency-sensitive operations.

### 1.2 Authentication

Tuya Cloud API uses **OAuth2-style authentication** with client credentials flow:

**Required Credentials:**
- **Access ID / Client ID**: Generated when cloud project is created
- **Access Secret / Client Secret**: Secret key for signing requests
- **Base URL**: Region-specific API endpoint
  - China: `https://openapi.tuyacn.com`
  - Americas: `https://openapi.tuyaus.com`
  - Europe: `https://openapi.tuyaeu.com`
  - India: `https://openapi.tuyain.com`

**Authentication Flow:**

1. **Initial Setup:**
   - Create cloud project on Tuya IoT Platform
   - Obtain Access ID and Access Secret from project overview
   - Link user devices to cloud project

2. **Token Acquisition:**
   ```typescript
   import { TuyaContext } from '@tuya/tuya-connector-nodejs';

   const tuya = new TuyaContext({
     baseUrl: 'https://openapi.tuyaus.com',
     accessKey: 'your-access-id',
     secretKey: 'your-secret-key',
   });
   // SDK handles token acquisition automatically
   ```

3. **Request Signing:**
   - Before token: `sign = HMAC-SHA256(client_id + t, secret).toUpperCase()`
   - After token: `sign = HMAC-SHA256(client_id + access_token + t, secret).toUpperCase()`
   - SDK handles signing automatically

4. **Token Lifecycle:**
   - Tokens valid for 2 hours
   - Automatic refresh via `refresh_token` API
   - SDK handles refresh automatically with pluggable storage

**Implementation Pattern for Adapter:**
```typescript
export interface TuyaAdapterConfig {
  accessKey: string;    // Access ID / Client ID
  secretKey: string;    // Access Secret / Client Secret
  baseUrl: string;      // Region-specific endpoint
}

export class TuyaAdapter extends EventEmitter implements IDeviceAdapter {
  private client: TuyaContext | null = null;

  async initialize(): Promise<void> {
    this.client = new TuyaContext({
      baseUrl: this.config.baseUrl,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
    });
    // Validate connection
    await this.healthCheck();
  }
}
```

### 1.3 Device Discovery

**Tuya Cloud API Device Listing:**

```typescript
// Get device details
const device = await tuya.device.detail({
  device_id: 'device_id_here'
});

// Get user devices (requires user ID)
const devices = await tuya.request({
  method: 'GET',
  path: '/v1.0/users/{uid}/devices',
  body: {},
});
```

**Device Structure:**
- Device ID (unique identifier)
- Device Name
- Product ID (device type/category)
- Category (light, switch, sensor, etc.)
- Sub (whether device online)
- IP (local IP address - for local API)
- Local Key (for local API communication)
- Status (current device state/DPs)

**Discovery Implementation Pattern:**
```typescript
async listDevices(filters?: DeviceFilters): Promise<UnifiedDevice[]> {
  // 1. Fetch devices from Tuya Cloud API
  const tuyaDevices = await this.client!.request({
    method: 'GET',
    path: '/v1.0/users/{uid}/devices',
  });

  // 2. Map to unified device model
  return tuyaDevices.map(device => this.mapDeviceToUnified(device));
}
```

### 1.4 Command Execution

Tuya uses **Data Points (DPs)** for device control. Each DP represents a device function.

**Common DP Codes:**

| DP Code | Function | Values | Capability Mapping |
|---------|----------|--------|-------------------|
| `switch_1` | Switch control | `true`/`false` | `DeviceCapability.SWITCH` |
| `bright_value` | Brightness | `0-1000` (scale varies) | `DeviceCapability.DIMMER` |
| `colour_data` | RGB color | HSV object | `DeviceCapability.COLOR` |
| `temp_value` | Color temp | `0-1000` (Kelvin scale) | `DeviceCapability.COLOR_TEMPERATURE` |
| `work_mode` | Work mode | `white`, `colour`, `scene` | N/A (mode selector) |

**Command Execution API:**
```typescript
// Send command to device
await tuya.request({
  method: 'POST',
  path: `/v1.0/devices/{device_id}/commands`,
  body: {
    commands: [
      {
        code: 'switch_1',    // DP code
        value: true          // DP value
      }
    ]
  }
});
```

**Implementation Pattern:**
```typescript
async executeCommand(
  deviceId: string,
  command: DeviceCommand,
  options?: CommandExecutionOptions
): Promise<CommandResult> {
  // 1. Map unified capability/command to Tuya DP codes
  const dpCommands = this.mapCommandToDPs(command);

  // 2. Execute command
  await this.client!.request({
    method: 'POST',
    path: `/v1.0/devices/${deviceId}/commands`,
    body: { commands: dpCommands }
  });

  // 3. Return result with confirmation
  return {
    success: true,
    deviceId: createUniversalDeviceId('tuya', deviceId),
    command,
    executedAt: new Date(),
  };
}
```

### 1.5 State Management

**Real-time State Query:**
```typescript
// Get current device status
const status = await tuya.request({
  method: 'GET',
  path: `/v1.0/devices/{device_id}/status`,
  body: {}
});

// Status response contains array of DPs
// [
//   { code: 'switch_1', value: true },
//   { code: 'bright_value', value: 500 },
//   { code: 'colour_data', value: {...} }
// ]
```

**State Change Events:**
Tuya supports push notifications via Pulsar messaging:
- Subscribe to device status change events
- Receive real-time updates when device state changes
- Requires additional Pulsar SDK setup

**Implementation Pattern:**
```typescript
async getDeviceState(deviceId: string): Promise<DeviceState> {
  const status = await this.client!.request({
    method: 'GET',
    path: `/v1.0/devices/${deviceId}/status`,
  });

  // Map DP array to unified attributes
  return this.mapStatusToState(deviceId, status);
}

private mapStatusToState(deviceId: string, dpArray: any[]): DeviceState {
  const attributes: Record<string, unknown> = {};

  for (const dp of dpArray) {
    const capability = this.mapDPToCapability(dp.code);
    if (capability) {
      attributes[`${capability}.${dp.code}`] = dp.value;
    }
  }

  return {
    deviceId: createUniversalDeviceId('tuya', deviceId),
    timestamp: new Date(),
    attributes,
  };
}
```

### 1.6 Rate Limits

**Tuya Cloud API Rate Limits:**

| Tier | Daily Requests | QPS (Queries/Sec) | Cost |
|------|---------------|-------------------|------|
| Free | 1,000 | 10 burst | Free |
| Cloud-Cloud | Unlimited | 500 | Paid |
| Per-API Limit | Varies | Varies by endpoint | - |

**Example Per-API Limits:**
- `POST:/v2.0/cloud/space/creation`: 10 req/sec
- Device command APIs: Generally 100-500 req/sec

**Rate Limit Handling:**
- SDK doesn't include automatic rate limiting
- Implement retry with exponential backoff (similar to SmartThings)
- Use batch command APIs where available
- Cache device state to reduce API calls

**Implementation Recommendations:**
```typescript
// Use existing retry utility
import { retryWithBackoff } from '../../utils/retry.js';

async executeCommand(...) {
  await retryWithBackoff(async () => {
    await this.client!.request({...});
  });
}
```

### 1.7 Device Types and Categories

**Tuya Device Categories:**

| Category | Tuya Category Code | Common DP Codes | Capability Mapping |
|----------|-------------------|-----------------|-------------------|
| **Lights** | `dj`, `dd`, `xdd`, `fwd` | `switch_led`, `bright_value`, `colour_data`, `temp_value`, `work_mode` | `SWITCH`, `DIMMER`, `COLOR`, `COLOR_TEMPERATURE` |
| **Switches** | `kg`, `tdq`, `pc` | `switch_1`, `switch_2`, `cur_power`, `cur_voltage` | `SWITCH`, `ENERGY_METER` |
| **Sensors** | `pir`, `mcs`, `wsdcg`, `ywbj` | `pir`, `doorcontact_state`, `temp_current`, `humidity_value`, `smoke_sensor_status` | `MOTION_SENSOR`, `CONTACT_SENSOR`, `TEMPERATURE_SENSOR`, `HUMIDITY_SENSOR`, `SMOKE_DETECTOR` |
| **Curtains/Blinds** | `cl` | `control`, `percent_control`, `percent_state` | `SHADE` |
| **Locks** | `ms` | `unlock_fingerprint`, `unlock_password`, `battery_state` | `LOCK`, `BATTERY` |
| **Thermostats** | `wk` | `temp_set`, `temp_current`, `mode`, `switch` | `THERMOSTAT`, `TEMPERATURE_SENSOR` |
| **Cameras** | `sp` | `basic_flip`, `motion_switch`, `record_switch` | `CAMERA`, `MOTION_SENSOR` |
| **Fans** | `fs` | `switch`, `fan_speed`, `fan_direction` | `SWITCH`, `FAN` |

**Common Work Modes:**
- **Lights:** `white` (white only), `colour` (RGB), `scene` (effects), `music` (music sync)
- **Switches:** Always on/off binary
- **Dimmers:** 1-1000 scale (convert to 0-100%)

### 1.8 Local vs Cloud API Trade-offs

**Cloud API (Recommended for Phase 1):**
✅ **Advantages:**
- Official SDK with TypeScript support
- Reliable authentication and token management
- No complex local key extraction
- Works from anywhere (internet-connected)
- Rate limit management

❌ **Disadvantages:**
- Latency: 300-500ms
- Requires internet connection
- Rate limits apply
- Dependent on Tuya cloud availability

**Local API (Consider for Phase 2):**
✅ **Advantages:**
- Low latency: 50-100ms
- No internet required (LAN-only)
- No rate limits
- Direct device communication

❌ **Disadvantages:**
- Community library (not official)
- Complex setup (local key extraction from cloud)
- Only one connection per device
- Local key changes when device re-paired
- Protocol version compatibility issues

**Implementation Strategy:**
1. **Phase 1:** Implement cloud API using `@tuya/tuya-connector-nodejs`
2. **Phase 2:** Add local API fallback using `tuyapi` for faster response times
3. **Hybrid Mode:** Use local for commands, cloud for state sync and discovery

---

## 2. Lutron Caseta API Research (Ticket 1M-340)

### 2.1 SDK Options

#### Recommended: lutron-leap (TypeScript)
- **Package:** `lutron-leap`
- **NPM:** https://www.npmjs.com/package/lutron-leap
- **GitHub:** https://github.com/thenewwazoo/lutron-leap-js
- **TypeScript Support:** ✅ Native TypeScript (98.2% TypeScript codebase)
- **Protocol:** LEAP (Lutron Extensible Application Protocol)
- **Target:** Smart Bridge 2 (Pro and Non-Pro), RA3 (tested)

**Installation:**
```bash
npm install lutron-leap
```

**Key Features:**
- Native TypeScript implementation
- mDNS-based Smart Bridge discovery (`BridgeFinder`)
- Certificate-based TLS authentication
- LEAP device tree traversal
- Event-driven architecture (unsolicited message support)
- Tested with: Pico remotes, occupancy sensors, wood blinds, dimmers, switches, motion sensors

**Alternative: Integration Protocol (Legacy)**
- **Protocol:** Telnet-based LIP (Lutron Integration Protocol)
- **Status:** ⚠️ Deprecated (replaced by LEAP on RA3+)
- **Support:** Pro Bridge only
- **Recommendation:** ❌ Not recommended for new implementations

**Trade-off Analysis:**
| Feature | LEAP Protocol (lutron-leap) | Integration Protocol (Telnet) |
|---------|----------------------------|------------------------------|
| Security | ✅ TLS + Certificates | ⚠️ Username/Password |
| Compatibility | Smart Bridge 2, RA3 | Pro Bridge only |
| Modern Systems | ✅ Yes | ❌ Deprecated on RA3 |
| TypeScript Support | ✅ Native | ⚠️ Manual implementation |
| Official Status | ✅ Supported by Lutron | ⚠️ Legacy |

**Recommendation:** Use **lutron-leap** library implementing LEAP protocol. This is the modern, secure approach supported by Lutron for current and future systems.

### 2.2 Authentication

Lutron LEAP uses **certificate-based TLS authentication** with physical pairing verification:

**Pairing Process:**

1. **Discover Smart Bridge:**
   ```typescript
   import { BridgeFinder } from 'lutron-leap';

   const finder = new BridgeFinder();
   const bridges = await finder.find();
   // Returns: [{ host: '192.168.1.100', port: 8081 }]
   ```

2. **Initiate Pairing:**
   ```bash
   # Using pylutron-caseta (Python tool for pairing)
   lap-pair <BRIDGE_HOST>
   ```
   - Tool initiates pairing request
   - User must **physically press button** on back of Smart Bridge
   - Generates three certificate files:
     - `caseta.crt` (client certificate)
     - `caseta.key` (client private key)
     - `caseta-bridge.crt` (bridge CA certificate)

3. **Connect with Certificates:**
   ```typescript
   import { SmartBridge } from 'lutron-leap';
   import * as fs from 'fs';

   const bridge = new SmartBridge({
     host: '192.168.1.100',
     ca: fs.readFileSync('caseta-bridge.crt'),
     cert: fs.readFileSync('caseta.crt'),
     key: fs.readFileSync('caseta.key'),
   });

   await bridge.connect();
   ```

**Security Features:**
- TLS 1.2+ encrypted communication
- Mutual TLS authentication (client + server certificates)
- Physical access verification (button press required)
- Certificate-based access control (no username/password)

**Implementation Pattern:**
```typescript
export interface LutronAdapterConfig {
  smartBridgeHost: string;        // IP address or hostname
  certificatePath: string;        // Path to caseta.crt
  privateKeyPath: string;         // Path to caseta.key
  caCertificatePath: string;      // Path to caseta-bridge.crt
}

export class LutronAdapter extends EventEmitter implements IDeviceAdapter {
  private bridge: SmartBridge | null = null;

  async initialize(): Promise<void> {
    // Load certificates
    const ca = fs.readFileSync(this.config.caCertificatePath);
    const cert = fs.readFileSync(this.config.certificatePath);
    const key = fs.readFileSync(this.config.privateKeyPath);

    // Connect to Smart Bridge
    this.bridge = new SmartBridge({
      host: this.config.smartBridgeHost,
      ca, cert, key,
    });

    await this.bridge.connect();
  }
}
```

**Pairing Workflow for Users:**
1. Install adapter package
2. Run pairing utility: `npx lap-pair <bridge-ip>`
3. Press button on Smart Bridge when prompted
4. Save generated certificate files to secure location
5. Configure adapter with certificate paths

### 2.3 Device Discovery

**LEAP Device Tree Traversal:**

The Smart Bridge exposes a hierarchical device tree:
- Areas (rooms/zones)
- Devices (dimmers, switches, shades, sensors)
- Button groups (Pico remotes, keypads)
- Occupancy groups (occupancy sensors)

```typescript
// After connecting to bridge
await bridge.connect();

// Get all devices
const devices = await bridge.getDevices();

// Device structure:
// {
//   id: '5',                        // Device ID
//   name: 'Living Room Dimmer',    // User-assigned name
//   type: 'WallDimmer',            // Device type
//   area: '2',                     // Area/room ID
//   buttons: [...],                // Button groups (for remotes)
//   occupancySensors: [...]        // Occupancy sensors
// }
```

**Device Types in LEAP:**
- `WallDimmer` → Caseta dimmer switch
- `WallSwitch` → Caseta on/off switch
- `SerenaHoneycombShade` → Motorized shades
- `PicoKeypad` → Pico remote
- `OccupancySensor` → Motion/occupancy sensor

**Implementation Pattern:**
```typescript
async listDevices(filters?: DeviceFilters): Promise<UnifiedDevice[]> {
  const leapDevices = await this.bridge!.getDevices();

  // Map LEAP devices to unified model
  return leapDevices
    .map(device => this.mapDeviceToUnified(device))
    .filter(device => this.applyFilters(device, filters));
}

private mapDeviceToUnified(leapDevice: any): UnifiedDevice {
  return {
    id: createUniversalDeviceId('lutron', leapDevice.id),
    platform: 'lutron',
    platformDeviceId: leapDevice.id,
    name: leapDevice.name,
    room: leapDevice.area,
    capabilities: this.extractCapabilities(leapDevice.type),
    online: true, // LEAP devices always online when bridge connected
    platformSpecific: {
      type: leapDevice.type,
      buttons: leapDevice.buttons,
      occupancySensors: leapDevice.occupancySensors,
    },
  };
}
```

### 2.4 Command Execution

**LEAP Command Structure:**

Lutron LEAP uses zone-based control with normalized levels (0-100):

```typescript
// Set dimmer level (0-100)
await bridge.setDimmerLevel(deviceId, level);

// Example: 50% brightness
await bridge.setDimmerLevel('5', 50);

// Switch on/off
await bridge.setDimmerLevel('5', 100);  // On (100%)
await bridge.setDimmerLevel('5', 0);    // Off (0%)
```

**Shade Control:**
```typescript
// Set shade position (0=open, 100=closed)
await bridge.setShadePosition(deviceId, position);

// Set shade tilt
await bridge.setBlindsTilt(deviceId, tilt);
```

**Button Presses (Pico Remotes):**
- Pico remotes generate button events (read-only)
- Cannot send commands to Pico (battery-powered, receive-only)

**Implementation Pattern:**
```typescript
async executeCommand(
  deviceId: string,
  command: DeviceCommand,
  options?: CommandExecutionOptions
): Promise<CommandResult> {
  const platformDeviceId = this.extractPlatformDeviceId(deviceId);

  switch (command.capability) {
    case DeviceCapability.SWITCH:
      // Map on/off to level 100/0
      const level = command.command === 'on' ? 100 : 0;
      await this.bridge!.setDimmerLevel(platformDeviceId, level);
      break;

    case DeviceCapability.DIMMER:
      // Set brightness level
      await this.bridge!.setDimmerLevel(
        platformDeviceId,
        command.parameters?.level as number
      );
      break;

    case DeviceCapability.SHADE:
      // Set shade position
      await this.bridge!.setShadePosition(
        platformDeviceId,
        command.parameters?.position as number
      );
      break;

    default:
      throw new CapabilityNotSupportedError(
        `Capability ${command.capability} not supported on Lutron`
      );
  }

  return {
    success: true,
    deviceId: createUniversalDeviceId('lutron', platformDeviceId),
    command,
    executedAt: new Date(),
  };
}
```

### 2.5 State Management

**LEAP State Subscription:**

LEAP uses event-driven state updates via unsolicited messages:

```typescript
// Subscribe to zone status updates
bridge.on('zoneStatus', (zoneId, level) => {
  console.log(`Zone ${zoneId} level changed to ${level}`);
});

// Subscribe to button events
bridge.on('buttonPress', (deviceId, button, action) => {
  console.log(`Device ${deviceId}, Button ${button}: ${action}`);
});

// Subscribe to occupancy events
bridge.on('occupancy', (sensorId, occupied) => {
  console.log(`Sensor ${sensorId} occupancy: ${occupied}`);
});
```

**State Query:**
```typescript
// Get current zone status
const level = await bridge.getZoneStatus(zoneId);

// Get shade position
const position = await bridge.getShadePosition(deviceId);
```

**Implementation Pattern:**
```typescript
async getDeviceState(deviceId: string): Promise<DeviceState> {
  const platformDeviceId = this.extractPlatformDeviceId(deviceId);
  const device = await this.bridge!.getDevice(platformDeviceId);

  const attributes: Record<string, unknown> = {};

  if (device.type === 'WallDimmer' || device.type === 'WallSwitch') {
    const level = await this.bridge!.getZoneStatus(platformDeviceId);
    attributes['switch.switch'] = level > 0 ? 'on' : 'off';
    attributes['dimmer.level'] = level;
  } else if (device.type.includes('Shade')) {
    const position = await this.bridge!.getShadePosition(platformDeviceId);
    attributes['shade.position'] = position;
  }

  return {
    deviceId: createUniversalDeviceId('lutron', platformDeviceId),
    timestamp: new Date(),
    attributes,
  };
}

// Event handling
private setupEventListeners(): void {
  this.bridge!.on('zoneStatus', (zoneId, level) => {
    this.handleZoneStatusChange(zoneId, level);
  });

  this.bridge!.on('buttonPress', (deviceId, button, action) => {
    this.handleButtonPress(deviceId, button, action);
  });
}
```

### 2.6 Device Types

**Lutron Caseta Device Types:**

| Device Type | LEAP Type | Capabilities | Control Range |
|-------------|-----------|--------------|---------------|
| **Dimmer Switch** | `WallDimmer` | `SWITCH`, `DIMMER` | 0-100% |
| **On/Off Switch** | `WallSwitch` | `SWITCH` | 0% or 100% only |
| **Serena Shades** | `SerenaHoneycombShade`, `SerenaRollerShade` | `SHADE` | 0-100% (position) |
| **Wood Blinds** | `SerenaWoodBlind` | `SHADE` | Position + tilt |
| **Pico Remote** | `PicoKeypad` | `BUTTON` | Events only (read-only) |
| **Occupancy Sensor** | `OccupancySensor` | `OCCUPANCY_SENSOR` | Occupied/vacant |
| **Motion Sensor** | `MotionSensor` | `MOTION_SENSOR` | Motion detected |
| **Fan Control** | `CasetaFanSpeedController` | `FAN` | 0%, 25%, 50%, 75%, 100% |

**Pico Remote Types:**
- 2-button (on/off)
- 3-button (on/favorite/off)
- 4-button (scene control)
- 5-button Audio Pico (Sonos control)

**Button Event Values:**
- `pushed` - Single press
- `held` - Long press
- `released` - Button released after hold

### 2.7 Local vs Cloud

**Lutron Caseta Architecture:**

Lutron Caseta is **local-first** with optional cloud features:

**Local API (LEAP) - Recommended:**
✅ **Advantages:**
- Fast response: <50ms latency
- No internet required
- High reliability (LAN-only)
- No rate limits
- Privacy (data stays local)
- Certificate-based security

❌ **Disadvantages:**
- Requires Smart Bridge on same network
- Initial pairing requires physical access
- Certificate management
- No remote access without VPN

**Cloud API (Lutron App API):**
⚠️ **Not publicly available** - Lutron does not provide public cloud API for third-party integrations. The Lutron app communicates to Smart Bridge via cloud, but this API is not documented or supported for external use.

**Recommendation:**
Use **local LEAP API** exclusively. This is the only officially supported integration method for third-party systems. Remote access can be achieved via VPN if needed.

**Rate Limits:**
- **None** - LEAP is local protocol with no rate limiting
- Smart Bridge can handle hundreds of commands per second
- Practical limit: Network bandwidth and bridge processing capacity

---

## 3. Capability Mapping Analysis

### 3.1 Existing Unified Capabilities

**Current capabilities in unified model (31 total):**

**Control Capabilities (11):**
1. `SWITCH` - Binary on/off
2. `DIMMER` - Level 0-100%
3. `COLOR` - RGB/HSV color
4. `COLOR_TEMPERATURE` - White spectrum (Kelvin)
5. `THERMOSTAT` - HVAC control
6. `LOCK` - Lock/unlock
7. `SHADE` - Window covering
8. `FAN` - Fan speed
9. `VALVE` - Water/gas valve
10. `ALARM` - Security alarm
11. `DOOR_CONTROL` - Garage door/gate

**Sensor Capabilities (15):**
12. `TEMPERATURE_SENSOR`
13. `HUMIDITY_SENSOR`
14. `MOTION_SENSOR`
15. `CONTACT_SENSOR`
16. `OCCUPANCY_SENSOR`
17. `ILLUMINANCE_SENSOR`
18. `BATTERY`
19. `AIR_QUALITY_SENSOR`
20. `WATER_LEAK_SENSOR`
21. `SMOKE_DETECTOR`
22. `BUTTON`
23. `PRESSURE_SENSOR`
24. `CO_DETECTOR`
25. `SOUND_SENSOR`

**Composite Capabilities (5):**
26. `ENERGY_METER`
27. `SPEAKER`
28. `MEDIA_PLAYER`
29. `CAMERA`
30. `ROBOT_VACUUM`
31. `IR_BLASTER`

### 3.2 Tuya Device Capability Mapping

**Tuya → Unified Capability Mapping:**

| Tuya Category | Tuya Code | DP Codes | Unified Capabilities | Notes |
|---------------|-----------|----------|---------------------|-------|
| **Light (dj, dd, xdd)** | Light | `switch_led`, `bright_value`, `colour_data`, `temp_value` | `SWITCH`, `DIMMER`, `COLOR`, `COLOR_TEMPERATURE` | ✅ Full support |
| **Switch (kg)** | Switch | `switch_1`, `switch_2`, `cur_power` | `SWITCH`, `ENERGY_METER` | ✅ Full support |
| **Dimmer (tdq)** | Dimmer | `switch_1`, `bright_value_1` | `SWITCH`, `DIMMER` | ✅ Full support |
| **Socket (cz)** | Socket | `switch_1`, `cur_power`, `cur_voltage` | `SWITCH`, `ENERGY_METER` | ✅ Full support |
| **PIR Sensor (pir)** | PIR | `pir` | `MOTION_SENSOR` | ✅ Full support |
| **Door Sensor (mcs)** | Door Contact | `doorcontact_state` | `CONTACT_SENSOR` | ✅ Full support |
| **Temp/Humidity (wsdcg)** | Temp/Humidity | `temp_current`, `humidity_value`, `battery_percentage` | `TEMPERATURE_SENSOR`, `HUMIDITY_SENSOR`, `BATTERY` | ✅ Full support |
| **Smoke Detector (ywbj)** | Smoke | `smoke_sensor_status`, `battery_percentage` | `SMOKE_DETECTOR`, `BATTERY` | ✅ Full support |
| **Curtain (cl)** | Curtain | `control`, `percent_control`, `percent_state` | `SHADE` | ✅ Full support |
| **Lock (ms)** | Smart Lock | `unlock_fingerprint`, `unlock_password`, `battery_state` | `LOCK`, `BATTERY` | ✅ Full support |
| **Thermostat (wk)** | Thermostat | `temp_set`, `temp_current`, `mode`, `switch` | `THERMOSTAT`, `TEMPERATURE_SENSOR` | ✅ Full support |
| **Camera (sp)** | IP Camera | `basic_flip`, `motion_switch`, `record_switch` | `CAMERA`, `MOTION_SENSOR` | ✅ Full support |
| **Fan (fs)** | Fan | `switch`, `fan_speed`, `fan_direction` | `SWITCH`, `FAN` | ✅ Full support |
| **Air Quality (kqjcy)** | Air Quality | `pm25`, `voc`, `co2`, `temp`, `humidity` | `AIR_QUALITY_SENSOR`, `TEMPERATURE_SENSOR`, `HUMIDITY_SENSOR` | ✅ Full support |
| **Water Leak (sj)** | Water Sensor | `watersensor_state`, `battery_percentage` | `WATER_LEAK_SENSOR`, `BATTERY` | ✅ Full support |

**Coverage:** ✅ All common Tuya device types are covered by existing unified capabilities.

**DP → Capability Mapping Logic:**
```typescript
mapPlatformCapability(dpCode: string): DeviceCapability | null {
  const mapping: Record<string, DeviceCapability> = {
    // Switch capabilities
    'switch_led': DeviceCapability.SWITCH,
    'switch_1': DeviceCapability.SWITCH,
    'switch_2': DeviceCapability.SWITCH,

    // Dimmer capabilities
    'bright_value': DeviceCapability.DIMMER,
    'bright_value_1': DeviceCapability.DIMMER,

    // Color capabilities
    'colour_data': DeviceCapability.COLOR,
    'colour_data_v2': DeviceCapability.COLOR,

    // Color temperature
    'temp_value': DeviceCapability.COLOR_TEMPERATURE,

    // Sensors
    'pir': DeviceCapability.MOTION_SENSOR,
    'doorcontact_state': DeviceCapability.CONTACT_SENSOR,
    'temp_current': DeviceCapability.TEMPERATURE_SENSOR,
    'humidity_value': DeviceCapability.HUMIDITY_SENSOR,
    'smoke_sensor_status': DeviceCapability.SMOKE_DETECTOR,
    'watersensor_state': DeviceCapability.WATER_LEAK_SENSOR,
    'battery_percentage': DeviceCapability.BATTERY,

    // Energy monitoring
    'cur_power': DeviceCapability.ENERGY_METER,

    // Curtain/shade
    'percent_control': DeviceCapability.SHADE,

    // Lock
    'unlock_fingerprint': DeviceCapability.LOCK,

    // Fan
    'fan_speed': DeviceCapability.FAN,
  };

  return mapping[dpCode] ?? null;
}
```

### 3.3 Lutron Device Capability Mapping

**Lutron → Unified Capability Mapping:**

| Lutron Type | LEAP Type | Unified Capabilities | Notes |
|-------------|-----------|---------------------|-------|
| **Dimmer Switch** | `WallDimmer` | `SWITCH`, `DIMMER` | ✅ Full support |
| **On/Off Switch** | `WallSwitch` | `SWITCH` | ✅ Full support |
| **Serena Shade** | `SerenaHoneycombShade`, `SerenaRollerShade` | `SHADE` | ✅ Full support |
| **Wood Blinds** | `SerenaWoodBlind` | `SHADE` | ✅ Full support (position + tilt) |
| **Pico Remote** | `PicoKeypad` | `BUTTON` | ✅ Full support (event-based) |
| **Occupancy Sensor** | `OccupancySensor` | `OCCUPANCY_SENSOR` | ✅ Full support |
| **Motion Sensor** | `MotionSensor` | `MOTION_SENSOR` | ✅ Full support |
| **Fan Control** | `CasetaFanSpeedController` | `FAN` | ✅ Full support |

**Coverage:** ✅ All Lutron Caseta device types are covered by existing unified capabilities.

**Type → Capability Mapping Logic:**
```typescript
mapPlatformCapability(leapType: string): DeviceCapability | null {
  const mapping: Record<string, DeviceCapability[]> = {
    'WallDimmer': [DeviceCapability.SWITCH, DeviceCapability.DIMMER],
    'WallSwitch': [DeviceCapability.SWITCH],
    'SerenaHoneycombShade': [DeviceCapability.SHADE],
    'SerenaRollerShade': [DeviceCapability.SHADE],
    'SerenaWoodBlind': [DeviceCapability.SHADE],
    'PicoKeypad': [DeviceCapability.BUTTON],
    'OccupancySensor': [DeviceCapability.OCCUPANCY_SENSOR],
    'MotionSensor': [DeviceCapability.MOTION_SENSOR],
    'CasetaFanSpeedController': [DeviceCapability.FAN],
  };

  return mapping[leapType] ?? null;
}
```

### 3.4 Capability Gaps and Recommendations

**Analysis:** ✅ **No capability gaps identified**

Both Tuya and Lutron device types map cleanly to existing unified capabilities. No new capabilities need to be added.

**SmartThings vs Tuya vs Lutron Coverage:**

| Capability | SmartThings | Tuya | Lutron |
|------------|-------------|------|--------|
| `SWITCH` | ✅ | ✅ | ✅ |
| `DIMMER` | ✅ | ✅ | ✅ |
| `COLOR` | ✅ | ✅ | ❌ (Caseta doesn't support color) |
| `COLOR_TEMPERATURE` | ✅ | ✅ | ❌ |
| `THERMOSTAT` | ✅ | ✅ | ❌ |
| `LOCK` | ✅ | ✅ | ❌ |
| `SHADE` | ✅ | ✅ | ✅ |
| `FAN` | ✅ | ✅ | ✅ |
| `MOTION_SENSOR` | ✅ | ✅ | ✅ |
| `CONTACT_SENSOR` | ✅ | ✅ | ❌ |
| `TEMPERATURE_SENSOR` | ✅ | ✅ | ❌ |
| `HUMIDITY_SENSOR` | ✅ | ✅ | ❌ |
| `OCCUPANCY_SENSOR` | ✅ | ✅ | ✅ |
| `BUTTON` | ✅ | ✅ | ✅ (Pico) |
| `ENERGY_METER` | ✅ | ✅ | ❌ |
| `CAMERA` | ✅ | ✅ | ❌ |

**Observation:** Lutron Caseta is focused on **lighting and shade control** with limited sensor capabilities. Tuya provides the **broadest device coverage** across all categories.

---

## 4. Implementation Recommendations

### 4.1 Tuya Adapter Implementation

**Recommended SDK:** `@tuya/tuya-connector-nodejs` (official TypeScript SDK)

**Dependencies:**
```json
{
  "dependencies": {
    "@tuya/tuya-connector-nodejs": "^2.0.0"
  }
}
```

**Configuration Interface:**
```typescript
export interface TuyaAdapterConfig {
  /** Tuya Access ID (Client ID) */
  accessKey: string;

  /** Tuya Access Secret (Client Secret) */
  secretKey: string;

  /** Tuya API Base URL (region-specific) */
  baseUrl: string;

  /** User ID for device listing */
  userId?: string;
}
```

**Authentication Strategy:**
- Store Access ID and Secret in secure environment variables
- SDK handles token lifecycle automatically
- Implement health check using location/device list API
- Token valid for 2 hours with automatic refresh

**Key Implementation Challenges:**

1. **DP Code Mapping:** Need to map hundreds of DP codes to capabilities
   - Solution: Create comprehensive DP → capability mapping table
   - Reference: SmartThings capability mapping as template

2. **Multi-DP Commands:** Some devices require multiple DP updates
   - Example: Switching light to color mode requires `work_mode` + `colour_data`
   - Solution: Implement command preprocessing to group related DPs

3. **DP Value Scaling:** Different devices use different scales
   - Brightness: 0-1000 vs 0-255 vs 0-100
   - Solution: Normalize to 0-100% in unified model, scale on command

4. **Rate Limiting:** Free tier limited to 1000 req/day
   - Solution: Implement request caching and batch operations
   - Use existing retry utility with backoff

**Implementation Complexity:** ⭐⭐⭐ Medium (similar to SmartThings)

### 4.2 Lutron Adapter Implementation

**Recommended SDK:** `lutron-leap` (TypeScript LEAP implementation)

**Dependencies:**
```json
{
  "dependencies": {
    "lutron-leap": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

**Configuration Interface:**
```typescript
export interface LutronAdapterConfig {
  /** Smart Bridge IP address or hostname */
  smartBridgeHost: string;

  /** Path to client certificate file (caseta.crt) */
  certificatePath: string;

  /** Path to client private key file (caseta.key) */
  privateKeyPath: string;

  /** Path to bridge CA certificate file (caseta-bridge.crt) */
  caCertificatePath: string;

  /** Optional: Auto-discover bridge via mDNS */
  autoDiscover?: boolean;
}
```

**Authentication Strategy:**
- One-time pairing process generates certificates
- Certificates stored securely on filesystem
- Load certificates on adapter initialization
- Mutual TLS authentication on every connection

**Key Implementation Challenges:**

1. **Certificate Management:** Users need to generate certificates
   - Solution: Provide pairing utility or clear documentation
   - Consider auto-discovery + guided pairing flow

2. **Device Type Detection:** LEAP types not standardized
   - Solution: Create type → capability mapping based on tested devices
   - Handle unknown types gracefully (log warning, skip)

3. **Event Handling:** LEAP is event-driven, requires listener setup
   - Solution: Set up event listeners in initialize()
   - Map LEAP events to unified state change events

4. **Button Devices:** Pico remotes are read-only (event-only)
   - Solution: Implement event subscription for button capability
   - No command execution for button-only devices

**Implementation Complexity:** ⭐⭐ Medium-Low (simpler than SmartThings due to limited device types)

### 4.3 Recommended Implementation Order

**Phase 1: Tuya Adapter (Priority: High)**
1. Set up Tuya developer account and cloud project
2. Implement `TuyaAdapter` class extending `IDeviceAdapter`
3. Implement authentication and token management
4. Implement device discovery and capability mapping
5. Implement command execution for lights and switches
6. Add state management and refresh
7. Write unit tests (pattern from SmartThings tests)
8. Integration testing with real Tuya devices

**Estimated Effort:** 16-24 hours

**Phase 2: Lutron Adapter (Priority: High)**
1. Set up Lutron Smart Bridge and complete pairing
2. Implement `LutronAdapter` class extending `IDeviceAdapter`
3. Implement certificate-based authentication
4. Implement device discovery via LEAP
5. Implement command execution for dimmers, switches, shades
6. Add event-driven state updates
7. Implement button event handling for Pico remotes
8. Write unit tests
9. Integration testing with real Lutron devices

**Estimated Effort:** 12-16 hours

**Phase 3: Local API Enhancement (Optional)**
1. Add `tuyapi` local API support for Tuya
2. Implement hybrid mode (local commands, cloud state sync)
3. Performance testing and optimization

**Estimated Effort:** 8-12 hours

### 4.4 Testing Strategy

**Unit Tests:**
- Mock SDK clients (TuyaContext, SmartBridge)
- Test capability mapping logic
- Test command translation
- Test error handling and retry logic

**Integration Tests:**
- Require real devices or platform sandboxes
- Test full workflow: discover → control → state sync
- Test error scenarios (offline devices, network issues)

**Test Coverage Target:** ≥80% (matching SmartThings adapter)

### 4.5 Documentation Requirements

**Developer Documentation:**
- Tuya developer account setup guide
- Lutron pairing process walkthrough
- Configuration examples
- Capability mapping reference tables

**User Documentation:**
- Platform-specific setup instructions
- Credential generation guides
- Troubleshooting common issues

---

## 5. Architecture Considerations

### 5.1 Adapter Pattern Consistency

Both adapters should follow the established pattern from `SmartThingsAdapter`:

**Shared Structure:**
```typescript
export class [Platform]Adapter extends EventEmitter implements IDeviceAdapter {
  // Metadata
  public readonly platform: Platform;
  public readonly platformName: string;
  public readonly version: string;

  // State
  private client: [PlatformClient] | null = null;
  private initialized = false;
  private config: [Platform]AdapterConfig;
  private errorCount = 0;
  private lastHealthCheck: Date | null = null;

  // Lifecycle
  async initialize(): Promise<void> { }
  async dispose(): Promise<void> { }
  isInitialized(): boolean { }
  async healthCheck(): Promise<AdapterHealthStatus> { }

  // Device operations
  async listDevices(filters?: DeviceFilters): Promise<UnifiedDevice[]> { }
  async getDevice(deviceId: string): Promise<UnifiedDevice> { }
  async getDeviceState(deviceId: string): Promise<DeviceState> { }
  async refreshDeviceState(deviceId: string): Promise<DeviceState> { }
  async getDeviceCapabilities(deviceId: string): Promise<DeviceCapability[]> { }

  // Command execution
  async executeCommand(...): Promise<CommandResult> { }
  async executeBatchCommands(...): Promise<CommandResult[]> { }

  // Capability mapping
  mapPlatformCapability(platformCap: string): DeviceCapability | null { }
  mapUnifiedCapability(unifiedCap: DeviceCapability): string | null { }

  // Location/Room/Scene
  async listLocations(): Promise<LocationInfo[]> { }
  async listRooms(locationId?: string): Promise<RoomInfo[]> { }
  supportsScenes(): boolean { }
  async listScenes(locationId?: string): Promise<SceneInfo[]> { }
  async executeScene(sceneId: string): Promise<void> { }

  // Private helpers
  private ensureInitialized(): void { }
  private extractPlatformDeviceId(deviceId: string): string { }
  private mapDeviceToUnified(platformDevice: any): UnifiedDevice { }
  private extractDeviceCapabilities(platformDevice: any): DeviceCapability[] { }
  private mapStatusToState(deviceId: string, status: any): DeviceState { }
  private wrapError(error: unknown, context: string): DeviceError { }
  private emitError(error: DeviceError, context: string): void { }
}
```

### 5.2 Error Handling

Use standardized error types from `src/types/errors.ts`:

- `AuthenticationError` - Invalid credentials
- `DeviceNotFoundError` - Device doesn't exist
- `NetworkError` - Connection issues
- `RateLimitError` - API rate limit exceeded
- `TimeoutError` - Operation timeout
- `CommandExecutionError` - Command failed
- `ConfigurationError` - Invalid configuration
- `CapabilityNotSupportedError` - Unsupported capability

### 5.3 Retry Strategy

Reuse existing retry utility:

```typescript
import { retryWithBackoff } from '../../utils/retry.js';

// Retry transient failures
await retryWithBackoff(async () => {
  return await this.client!.someApiCall();
});
```

### 5.4 Logging

Use structured logging:

```typescript
import logger from '../../utils/logger.js';

logger.info('Devices listed successfully', {
  platform: this.platform,
  count: devices.length,
});

logger.error('Failed to execute command', {
  error: error.message,
  platform: this.platform,
  deviceId,
});
```

---

## 6. Risk Analysis and Mitigation

### 6.1 Tuya Risks

**Risk 1: Rate Limiting on Free Tier**
- **Impact:** High (1000 req/day insufficient for active usage)
- **Mitigation:**
  - Implement aggressive caching
  - Use batch APIs where available
  - Consider paid tier for production use
  - Monitor request count in health check

**Risk 2: Local Key Extraction Complexity**
- **Impact:** Medium (for local API phase)
- **Mitigation:**
  - Start with cloud API only
  - Document local key extraction process clearly
  - Provide helper scripts/tools

**Risk 3: DP Code Variations**
- **Impact:** Medium (different manufacturers use different DP codes)
- **Mitigation:**
  - Implement comprehensive DP mapping
  - Log unknown DPs for future additions
  - Allow platform-specific configuration overrides

### 6.2 Lutron Risks

**Risk 1: Certificate Pairing Complexity**
- **Impact:** Medium (users may struggle with pairing)
- **Mitigation:**
  - Provide detailed step-by-step guide
  - Create pairing helper utility
  - Support both auto-discovery and manual configuration

**Risk 2: LEAP Protocol Changes**
- **Impact:** Low (protocol relatively stable)
- **Mitigation:**
  - Monitor lutron-leap library updates
  - Test with new Lutron firmware releases
  - Maintain version compatibility matrix

**Risk 3: Limited Device Type Support**
- **Impact:** Low (Caseta ecosystem is focused)
- **Mitigation:**
  - Clearly document supported device types
  - Gracefully handle unknown device types
  - Log warnings for unmapped types

---

## 7. Performance Expectations

### 7.1 Latency Comparison

| Operation | SmartThings | Tuya Cloud | Tuya Local | Lutron LEAP |
|-----------|-------------|------------|------------|-------------|
| Device List | 200-400ms | 300-500ms | N/A | 50-100ms |
| State Query | 150-300ms | 200-400ms | 50-100ms | 30-50ms |
| Command Execution | 200-500ms | 300-600ms | 50-150ms | 30-100ms |
| State Update Event | Real-time | Polling/Pulsar | Real-time | Real-time |

### 7.2 Throughput

| Platform | Max Commands/Sec | Max Queries/Sec | Rate Limit Type |
|----------|------------------|-----------------|-----------------|
| SmartThings | ~100 | ~200 | Soft (no hard limit) |
| Tuya Cloud | 500 (paid) / 10 (free) | 500 (paid) / 10 (free) | Hard (HTTP 429) |
| Tuya Local | ~50 per device | ~50 per device | None |
| Lutron LEAP | ~100 | ~100 | None (local) |

---

## 8. Code Examples

### 8.1 Tuya Adapter Skeleton

```typescript
/**
 * Tuya platform adapter implementing IDeviceAdapter interface.
 *
 * Provides unified device control for Tuya Cloud API using official
 * @tuya/tuya-connector-nodejs SDK.
 */
import { EventEmitter } from 'events';
import { TuyaContext } from '@tuya/tuya-connector-nodejs';
import type { IDeviceAdapter } from '../../adapters/base/IDeviceAdapter.js';
import {
  type UnifiedDevice,
  DeviceCapability,
  type Platform,
  createUniversalDeviceId,
  parseUniversalDeviceId,
} from '../../types/unified-device.js';
import type { DeviceState } from '../../types/device-state.js';
import type {
  DeviceCommand,
  CommandResult,
  CommandExecutionOptions,
  BatchCommandInput,
  BatchCommandOptions,
} from '../../types/commands.js';
import {
  type DeviceFilters,
  type AdapterHealthStatus,
  type LocationInfo,
  type RoomInfo,
  type SceneInfo,
} from '../../adapters/base/IDeviceAdapter.js';
import { retryWithBackoff } from '../../utils/retry.js';
import logger from '../../utils/logger.js';

export interface TuyaAdapterConfig {
  accessKey: string;
  secretKey: string;
  baseUrl: string;
  userId?: string;
}

export class TuyaAdapter extends EventEmitter implements IDeviceAdapter {
  public readonly platform = 'tuya' as Platform;
  public readonly platformName = 'Tuya';
  public readonly version = '1.0.0';

  private client: TuyaContext | null = null;
  private initialized = false;
  private config: TuyaAdapterConfig;
  private errorCount = 0;
  private lastHealthCheck: Date | null = null;

  constructor(config: TuyaAdapterConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.client = new TuyaContext({
      baseUrl: this.config.baseUrl,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
    });

    // Validate connection
    await retryWithBackoff(async () => {
      await this.client!.request({
        method: 'GET',
        path: '/v1.0/token',
        body: {},
      });
    });

    this.initialized = true;
    this.lastHealthCheck = new Date();
    logger.info('Tuya adapter initialized', { platform: this.platform });
  }

  // ... implement remaining IDeviceAdapter methods

  mapPlatformCapability(dpCode: string): DeviceCapability | null {
    const mapping: Record<string, DeviceCapability> = {
      'switch_led': DeviceCapability.SWITCH,
      'bright_value': DeviceCapability.DIMMER,
      'colour_data': DeviceCapability.COLOR,
      'temp_value': DeviceCapability.COLOR_TEMPERATURE,
      // ... complete mapping
    };
    return mapping[dpCode] ?? null;
  }
}
```

### 8.2 Lutron Adapter Skeleton

```typescript
/**
 * Lutron Caseta platform adapter implementing IDeviceAdapter interface.
 *
 * Provides unified device control for Lutron Smart Bridge using LEAP protocol
 * via lutron-leap library.
 */
import { EventEmitter } from 'events';
import { SmartBridge, BridgeFinder } from 'lutron-leap';
import * as fs from 'fs';
import type { IDeviceAdapter } from '../../adapters/base/IDeviceAdapter.js';
import {
  type UnifiedDevice,
  DeviceCapability,
  type Platform,
  createUniversalDeviceId,
} from '../../types/unified-device.js';
import logger from '../../utils/logger.js';

export interface LutronAdapterConfig {
  smartBridgeHost: string;
  certificatePath: string;
  privateKeyPath: string;
  caCertificatePath: string;
  autoDiscover?: boolean;
}

export class LutronAdapter extends EventEmitter implements IDeviceAdapter {
  public readonly platform = 'lutron' as Platform;
  public readonly platformName = 'Lutron Caseta';
  public readonly version = '1.0.0';

  private bridge: SmartBridge | null = null;
  private initialized = false;
  private config: LutronAdapterConfig;
  private errorCount = 0;
  private lastHealthCheck: Date | null = null;

  constructor(config: LutronAdapterConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Load certificates
    const ca = fs.readFileSync(this.config.caCertificatePath);
    const cert = fs.readFileSync(this.config.certificatePath);
    const key = fs.readFileSync(this.config.privateKeyPath);

    // Connect to bridge
    this.bridge = new SmartBridge({
      host: this.config.smartBridgeHost,
      ca, cert, key,
    });

    await this.bridge.connect();

    // Set up event listeners
    this.setupEventListeners();

    this.initialized = true;
    this.lastHealthCheck = new Date();
    logger.info('Lutron adapter initialized', { platform: this.platform });
  }

  private setupEventListeners(): void {
    this.bridge!.on('zoneStatus', (zoneId, level) => {
      logger.debug('Zone status update', { zoneId, level });
      // Emit state change event
    });

    this.bridge!.on('buttonPress', (deviceId, button, action) => {
      logger.debug('Button press', { deviceId, button, action });
      // Emit button event
    });
  }

  // ... implement remaining IDeviceAdapter methods

  mapPlatformCapability(leapType: string): DeviceCapability | null {
    const mapping: Record<string, DeviceCapability[]> = {
      'WallDimmer': [DeviceCapability.SWITCH, DeviceCapability.DIMMER],
      'WallSwitch': [DeviceCapability.SWITCH],
      'SerenaHoneycombShade': [DeviceCapability.SHADE],
      // ... complete mapping
    };
    return mapping[leapType]?.[0] ?? null;
  }
}
```

---

## 9. Next Steps and Action Items

### 9.1 Immediate Actions

1. **Create Tuya developer account**
   - Sign up at https://iot.tuya.com
   - Create cloud project
   - Obtain Access ID and Secret
   - Link test devices

2. **Set up Lutron Smart Bridge**
   - Connect Smart Bridge to network
   - Install pairing utility (pylutron-caseta)
   - Generate certificates via pairing process
   - Document bridge IP and certificate locations

3. **Install SDK dependencies**
   ```bash
   npm install @tuya/tuya-connector-nodejs
   npm install lutron-leap
   ```

4. **Create adapter stub files**
   - `src/platforms/tuya/TuyaAdapter.ts`
   - `src/platforms/lutron/LutronAdapter.ts`

### 9.2 Implementation Checklist

**Tuya Adapter (1M-341):**
- [ ] Implement `TuyaAdapter` class structure
- [ ] Implement authentication and initialization
- [ ] Implement device discovery
- [ ] Create DP → capability mapping table
- [ ] Implement command execution (lights, switches)
- [ ] Implement state management
- [ ] Add error handling and retry logic
- [ ] Write unit tests
- [ ] Integration testing with real devices
- [ ] Documentation

**Lutron Adapter (1M-340):**
- [ ] Implement `LutronAdapter` class structure
- [ ] Implement certificate-based authentication
- [ ] Implement device discovery via LEAP
- [ ] Create LEAP type → capability mapping
- [ ] Implement command execution (dimmers, switches, shades)
- [ ] Implement event-driven state updates
- [ ] Add button event handling
- [ ] Write unit tests
- [ ] Integration testing with real devices
- [ ] Documentation

### 9.3 Documentation Tasks

- [ ] Create Tuya setup guide (developer account, API credentials)
- [ ] Create Lutron pairing guide (certificate generation)
- [ ] Document capability mapping tables
- [ ] Create troubleshooting guide
- [ ] Update main README with new platform support

---

## 10. Conclusion

Both Tuya and Lutron Caseta are excellent candidates for integration with strong TypeScript SDK support and clear implementation paths:

**Tuya Strengths:**
- Official TypeScript SDK with comprehensive API coverage
- Broad device type support across all categories
- Active development and documentation
- Straightforward OAuth2-style authentication

**Lutron Strengths:**
- Native local control with excellent latency
- TypeScript LEAP implementation available
- Focused, high-quality device ecosystem
- Strong security via certificate authentication

**Implementation Feasibility:** ✅ High for both platforms

Both adapters can be implemented following the established `IDeviceAdapter` pattern with **medium complexity** comparable to the existing SmartThings adapter. No new unified capabilities are required - all device types map to existing capabilities.

**Recommended Timeline:**
- Tuya Adapter: 2-3 weeks (16-24 hours effort)
- Lutron Adapter: 1.5-2 weeks (12-16 hours effort)
- Total: 3.5-5 weeks for both adapters

**Success Metrics:**
- [ ] All acceptance criteria met for tickets 1M-341 and 1M-340
- [ ] Both adapters pass unit tests with ≥80% coverage
- [ ] Integration tests successful with real devices
- [ ] Documentation complete and user-tested
- [ ] Performance within expected latency ranges

---

## References

### Tuya Resources
- Official SDK: https://github.com/tuya/tuya-connector-nodejs
- Developer Platform: https://developer.tuya.com
- API Documentation: https://developer.tuya.com/en/docs/iot/api-reference
- Local API: https://github.com/codetheweb/tuyapi

### Lutron Resources
- LEAP Library: https://github.com/thenewwazoo/lutron-leap-js
- LEAP Protocol Docs: https://support.lutron.com/us/en/product/radiora3/article/networking/Lutron-s-LEAP-API-Integration-Protocol
- Homebridge Plugin: https://github.com/homebridge-plugins/homebridge-lutron-caseta-leap
- openHAB LEAP Notes: https://www.openhab.org/addons/bindings/lutron/doc/leapnotes.html

### Internal References
- Interface Definition: `src/adapters/base/IDeviceAdapter.ts`
- Reference Implementation: `src/platforms/smartthings/SmartThingsAdapter.ts`
- Unified Types: `src/types/unified-device.ts`
- Error Types: `src/types/errors.ts`

---

**End of Research Report**
