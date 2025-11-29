# Lutron Caseta Smart Bridge Setup Guide

**Platform:** Lutron Caseta
**Adapter:** LutronAdapter
**Integration Type:** Local LEAP Protocol (Certificate-based TLS)
**Ticket Reference:** 1M-340

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Hardware Setup](#hardware-setup)
4. [Certificate Pairing](#certificate-pairing)
5. [Configuration](#configuration)
6. [Usage Examples](#usage-examples)
7. [Supported Devices](#supported-devices)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Configuration](#advanced-configuration)
10. [References](#references)

---

## Overview

### What is Lutron Caseta?

Lutron Caseta is a professional-grade wireless lighting control system featuring dimmers, switches, shades, and sensors. The Smart Bridge hub connects devices to your home network, enabling local control via the LEAP (Lutron Extensible Application Protocol) protocol.

### Integration Benefits

- **Local Control**: Fast response times (<50ms) without cloud dependency
- **High Reliability**: Direct communication with Smart Bridge over LAN
- **Professional Quality**: Lutron's reputation for reliability and performance
- **Security**: Certificate-based mutual TLS authentication
- **Privacy**: All communication stays on your local network
- **No Internet Required**: Works even during internet outages

### Supported Devices

LutronAdapter supports all Lutron Caseta compatible devices:
- Dimmer switches (Caseta Wireless Dimmer)
- On/off switches (Caseta Wireless Switch)
- Motorized shades (Serena Honeycomb, Roller, Wood Blinds)
- Fan speed controllers
- Pico remotes (button events)
- Occupancy/motion sensors

### Prerequisites

**Hardware Requirements:**
- **Lutron Smart Bridge 2** or **Smart Bridge Pro** (required)
  - Smart Bridge 2: Standard model with LEAP support
  - Smart Bridge Pro: Advanced model with additional features
  - Note: Original Smart Bridge (first generation) NOT supported
- Lutron Caseta compatible devices (dimmers, switches, shades, sensors)
- Local network with router providing DHCP
- Physical access to Smart Bridge for pairing

**Software Requirements:**
- Node.js 18+ with TypeScript support
- `lutron-leap` npm package (TypeScript LEAP implementation)
- Certificate pairing utility (`lap-pair` from `pylutron-caseta`)
- MCP Smarterthings project installed

**Network Requirements:**
- Smart Bridge connected to same LAN as server
- No firewall blocking port 8081 (LEAP protocol)
- Static IP or DHCP reservation for Smart Bridge (recommended)

**Time Investment:**
- Hardware setup: 10-15 minutes
- Certificate pairing: 5-10 minutes
- Configuration: 5 minutes
- Total: 20-30 minutes

---

## Hardware Setup

### Step 1: Unbox Smart Bridge

**Package Contents:**
- Lutron Smart Bridge 2 or Pro
- Power adapter (5V DC)
- Ethernet cable
- Quick start guide

**Smart Bridge Specifications:**
- Dimensions: 4.5" x 4.5" x 1.1"
- Power: 5V DC, 1A
- Connectivity: 10/100 Ethernet, 802.11b/g/n Wi-Fi (Pro only)
- Protocol: LEAP over port 8081
- Range: Up to 30 feet (RF frequency: 434 MHz)

### Step 2: Connect Smart Bridge to Network

**Ethernet Connection (Recommended):**

1. **Position Smart Bridge**
   - Place in central location for optimal RF coverage
   - Ensure within 30 feet of controlled devices
   - Avoid metal enclosures or RF interference sources

2. **Connect Ethernet**
   - Plug Ethernet cable into Smart Bridge
   - Connect other end to router LAN port
   - Verify Ethernet port LED activity (should blink)

3. **Connect Power**
   - Plug power adapter into Smart Bridge
   - Connect to AC outlet
   - Wait 60 seconds for boot and network connection

4. **Verify Connection**
   - Smart Bridge status LED should be solid (not blinking)
   - Check router DHCP client list for "Lutron" or "Smart Bridge"
   - Note assigned IP address for configuration

**Wi-Fi Connection (Smart Bridge Pro Only):**

1. Download Lutron app (iOS/Android)
2. Follow in-app setup wizard for Wi-Fi configuration
3. Connect Smart Bridge to Wi-Fi network
4. Note assigned IP address from app

### Step 3: Set Up Devices with Lutron App

**Install Lutron App:**
- iOS: Download "Lutron Caseta" from App Store
- Android: Download "Lutron Caseta" from Google Play

**Add Smart Bridge:**

1. Open Lutron app
2. Tap "+" → "Add Bridge"
3. App will auto-discover Smart Bridge on network
4. Follow prompts to complete setup

**Pair Devices:**

For each Lutron device (dimmer, switch, shade, remote):

1. **Install Device**
   - Follow manufacturer installation instructions
   - For switches/dimmers: Turn off circuit breaker before installation
   - For battery devices: Insert batteries

2. **Add to Smart Bridge**
   - In Lutron app, tap "+" → "Add Device"
   - Select device type (dimmer, switch, shade, remote, sensor)
   - Follow pairing instructions:
     - **Switches/Dimmers**: Press and hold programming button until LED flashes
     - **Shades**: Press and hold programming button on motor
     - **Pico Remotes**: Remove battery tab, press any button
     - **Sensors**: Press pairing button

3. **Assign to Room**
   - Name device (e.g., "Living Room Dimmer")
   - Assign to room/area
   - Save configuration

**Verify Device Pairing:**
- Control device from Lutron app
- Confirm device responds correctly
- Test all buttons on Pico remotes
- Verify sensor motion detection

### Step 4: Find Smart Bridge IP Address

**Method 1: Router DHCP List**

1. Log in to router admin interface
2. Navigate to DHCP client list / connected devices
3. Look for device named "Lutron" or "Smart Bridge"
4. Note IP address (e.g., `192.168.1.100`)

**Method 2: Lutron App**

1. Open Lutron app
2. Navigate to Settings → Advanced → Integration
3. IP address displayed in integration settings

**Method 3: Network Scanner**

```bash
# Use nmap to scan for port 8081 (LEAP protocol)
nmap -p 8081 192.168.1.0/24

# Look for open port 8081
# Output: 192.168.1.100:8081 open
```

**Recommendation:** Configure DHCP reservation or static IP for Smart Bridge to prevent IP changes.

---

## Certificate Pairing

### Understanding LEAP Authentication

Lutron LEAP protocol uses **mutual TLS authentication** with certificate-based security:

- **Client Certificate**: Identifies your application to Smart Bridge
- **Client Private Key**: Proves ownership of client certificate
- **Bridge CA Certificate**: Verifies Smart Bridge identity

**Security Features:**
- TLS 1.2+ encryption for all communication
- Physical button press required for pairing (prevents unauthorized access)
- Certificates unique per pairing
- No username/password (certificate-only authentication)

### Step 1: Install Pairing Utility

**Option A: Using npm (Recommended)**

```bash
# Install pylutron-caseta globally
npm install -g pylutron-caseta

# Verify installation
lap-pair --version
```

**Option B: Using pip (Python)**

```bash
# Install with Python pip
pip install pylutron-caseta

# Verify installation
lap-pair --version
```

**Requirements:**
- Python 3.7+ (for pip installation)
- Node.js 18+ (for npm installation)

### Step 2: Run Pairing Process

**Execute Pairing Command:**

```bash
# Replace <BRIDGE_IP> with your Smart Bridge IP address
lap-pair <BRIDGE_IP>

# Example:
lap-pair 192.168.1.100
```

**Expected Output:**

```
Lutron Caseta Certificate Pairing Utility
==========================================

Connecting to Smart Bridge at 192.168.1.100...
Connection established.

*** Press the button on the back of the Smart Bridge now! ***

Waiting for pairing confirmation...
```

**Physical Button Press:**

1. Locate button on **back** of Smart Bridge
   - Small recessed button near Ethernet port
   - May require paperclip or pen to press

2. Press and **hold** button for 3-5 seconds
   - LED on front will flash rapidly
   - Release when pairing confirms

3. Wait for pairing completion:
   ```
   Pairing successful!

   Certificate files saved:
   - caseta.crt (client certificate)
   - caseta.key (client private key)
   - caseta-bridge.crt (bridge CA certificate)

   These files are required for LEAP protocol authentication.
   Store them securely and do not commit to source control.
   ```

### Step 3: Secure Certificate Files

**Certificate Files Generated:**

| File | Description | Security Level |
|------|-------------|----------------|
| `caseta.crt` | Client certificate (public) | Medium |
| `caseta.key` | Client private key (sensitive) | **HIGH** |
| `caseta-bridge.crt` | Bridge CA certificate (public) | Low |

**Security Best Practices:**

```bash
# Create secure certificate directory
mkdir -p ~/.lutron-certs

# Move certificates to secure location
mv caseta.* ~/.lutron-certs/

# Set restrictive permissions (owner read-only)
chmod 600 ~/.lutron-certs/caseta.key
chmod 644 ~/.lutron-certs/caseta.crt
chmod 644 ~/.lutron-certs/caseta-bridge.crt

# Verify permissions
ls -la ~/.lutron-certs/
```

**Expected Permissions:**

```
-rw-r--r--  1 user  user  1234 Nov 28 10:00 caseta.crt
-rw-------  1 user  user  1678 Nov 28 10:00 caseta.key
-rw-r--r--  1 user  user  1234 Nov 28 10:00 caseta-bridge.crt
```

**Storage Recommendations:**

✅ **Do:**
- Store in secure directory with restricted permissions
- Backup to encrypted storage
- Use environment variables for paths
- Keep separate from source code

❌ **Don't:**
- Commit certificates to Git repository
- Share certificates publicly
- Store in world-readable directories
- Include in Docker images (use secrets/volumes)

### Step 4: Verify Certificate Files

**Check Certificate Contents:**

```bash
# Verify client certificate
openssl x509 -in ~/.lutron-certs/caseta.crt -text -noout | grep "Subject:"

# Verify private key
openssl rsa -in ~/.lutron-certs/caseta.key -check

# Verify CA certificate
openssl x509 -in ~/.lutron-certs/caseta-bridge.crt -text -noout | grep "Issuer:"
```

**Expected Output:**
- Client certificate: Should show subject with CN (Common Name)
- Private key: "RSA key ok" message
- CA certificate: Should show Lutron as issuer

---

## Configuration

### Environment Variables

Create or update `.env` file in project root:

```bash
# Lutron Caseta Smart Bridge Configuration
LUTRON_BRIDGE_IP="192.168.1.100"
LUTRON_CERT_PATH="/Users/yourname/.lutron-certs/caseta.crt"
LUTRON_KEY_PATH="/Users/yourname/.lutron-certs/caseta.key"
LUTRON_CA_CERT_PATH="/Users/yourname/.lutron-certs/caseta-bridge.crt"

# Optional: Custom port (default: 8081)
# LUTRON_BRIDGE_PORT="8081"
```

**Security Best Practices:**
- ✅ Use absolute paths for certificate files
- ✅ Never commit `.env` file to source control
- ✅ Add `.env` to `.gitignore`
- ✅ Use different certificates for dev/prod
- ✅ Verify file permissions before deployment

### TypeScript Configuration

**Basic Setup:**

```typescript
import { LutronAdapter } from './platforms/lutron/LutronAdapter.js';
import type { LutronAdapterConfig } from './platforms/lutron/types.js';

// Load configuration from environment
const config: LutronAdapterConfig = {
  smartBridgeHost: process.env.LUTRON_BRIDGE_IP!,
  certificatePath: process.env.LUTRON_CERT_PATH!,
  privateKeyPath: process.env.LUTRON_KEY_PATH!,
  caCertificatePath: process.env.LUTRON_CA_CERT_PATH!,
  port: 8081, // Optional, defaults to 8081
};

// Create adapter instance
const lutronAdapter = new LutronAdapter(config);

// Initialize connection
await lutronAdapter.initialize();
console.log('Lutron adapter initialized successfully');
```

**With Error Handling:**

```typescript
import { LutronAdapter } from './platforms/lutron/LutronAdapter.js';
import {
  AuthenticationError,
  ConfigurationError,
  NetworkError
} from './types/errors.js';

try {
  const lutronAdapter = new LutronAdapter({
    smartBridgeHost: process.env.LUTRON_BRIDGE_IP!,
    certificatePath: process.env.LUTRON_CERT_PATH!,
    privateKeyPath: process.env.LUTRON_KEY_PATH!,
    caCertificatePath: process.env.LUTRON_CA_CERT_PATH!,
  });

  await lutronAdapter.initialize();

  // Verify connection
  const health = await lutronAdapter.healthCheck();
  console.log('Adapter health:', health.status);

} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Certificate configuration error:', error.message);
    console.error('Verify certificate paths and permissions');
  } else if (error instanceof NetworkError) {
    console.error('Network connection failed:', error.message);
    console.error('Verify Smart Bridge IP and network connectivity');
  } else if (error instanceof AuthenticationError) {
    console.error('TLS authentication failed:', error.message);
    console.error('Verify certificates are valid and not expired');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Using Certificate Buffers (Alternative):**

```typescript
import * as fs from 'fs';
import { LutronAdapter } from './platforms/lutron/LutronAdapter.js';

// Load certificates from environment variables (base64 encoded)
const config = {
  smartBridgeHost: process.env.LUTRON_BRIDGE_IP!,
  certificatePath: '/tmp/caseta.crt',
  privateKeyPath: '/tmp/caseta.key',
  caCertificatePath: '/tmp/caseta-bridge.crt',
};

// Write certificates to temporary files
fs.writeFileSync(
  config.certificatePath,
  Buffer.from(process.env.LUTRON_CERT_BASE64!, 'base64')
);
fs.writeFileSync(
  config.privateKeyPath,
  Buffer.from(process.env.LUTRON_KEY_BASE64!, 'base64')
);
fs.writeFileSync(
  config.caCertificatePath,
  Buffer.from(process.env.LUTRON_CA_CERT_BASE64!, 'base64')
);

const lutronAdapter = new LutronAdapter(config);
await lutronAdapter.initialize();
```

### Configuration Validation

**Verify Connection:**

```typescript
// Check if adapter is initialized
if (lutronAdapter.isInitialized()) {
  console.log('Adapter ready');
}

// Run health check
const health = await lutronAdapter.healthCheck();
console.log('Health status:', health.status);
console.log('Smart Bridge reachable:', health.details?.bridgeReachable);
console.log('Device count:', health.details?.deviceCount);
```

**Expected Health Check Response:**

```json
{
  "platform": "lutron",
  "status": "healthy",
  "message": "Smart Bridge connected via LEAP protocol",
  "errorCount": 0,
  "lastCheck": "2025-11-28T10:00:00.000Z",
  "details": {
    "bridgeReachable": true,
    "tlsConnected": true,
    "deviceCount": 12,
    "firmwareVersion": "2.14.3"
  }
}
```

---

## Usage Examples

### List All Devices

```typescript
// List all devices
const devices = await lutronAdapter.listDevices();
console.log(`Found ${devices.length} Lutron devices`);

// Display device information
for (const device of devices) {
  console.log(`
    ID: ${device.id}
    Name: ${device.name}
    Type: ${device.platformSpecific?.type}
    Room: ${device.room}
    Capabilities: ${device.capabilities.join(', ')}
  `);
}
```

### Control Dimmer

```typescript
import { DeviceCapability, createDeviceCommand } from './types/unified-device.js';

// Turn dimmer on at 50% brightness
await lutronAdapter.executeCommand(
  'lutron:zone-5',
  createDeviceCommand(DeviceCapability.DIMMER, 'setLevel', {
    level: 50 // 0-100 percentage
  })
);

// Set to 100% (full brightness)
await lutronAdapter.executeCommand(
  'lutron:zone-5',
  createDeviceCommand(DeviceCapability.DIMMER, 'setLevel', {
    level: 100
  })
);

// Set to 0% (turn off)
await lutronAdapter.executeCommand(
  'lutron:zone-5',
  createDeviceCommand(DeviceCapability.DIMMER, 'setLevel', {
    level: 0
  })
);
```

### Control Switch

```typescript
// Turn switch on
await lutronAdapter.executeCommand(
  'lutron:zone-3',
  createDeviceCommand(DeviceCapability.SWITCH, 'on')
);

// Turn switch off
await lutronAdapter.executeCommand(
  'lutron:zone-3',
  createDeviceCommand(DeviceCapability.SWITCH, 'off')
);
```

### Control Shades

```typescript
// Open shade (0% position)
await lutronAdapter.executeCommand(
  'lutron:shade-7',
  createDeviceCommand(DeviceCapability.SHADE, 'open')
);

// Close shade (100% position)
await lutronAdapter.executeCommand(
  'lutron:shade-7',
  createDeviceCommand(DeviceCapability.SHADE, 'close')
);

// Set to 50% position
await lutronAdapter.executeCommand(
  'lutron:shade-7',
  createDeviceCommand(DeviceCapability.SHADE, 'setPosition', {
    position: 50 // 0=fully open, 100=fully closed
  })
);

// Set tilt (wood blinds only)
await lutronAdapter.executeCommand(
  'lutron:blind-8',
  createDeviceCommand(DeviceCapability.SHADE, 'setTilt', {
    tilt: 45 // Tilt angle
  })
);
```

### Control Fan

```typescript
// Fan speed control (0, 25, 50, 75, 100)
await lutronAdapter.executeCommand(
  'lutron:fan-9',
  createDeviceCommand(DeviceCapability.FAN, 'setSpeed', {
    speed: 75 // 0=off, 25=low, 50=medium, 75=medium-high, 100=high
  })
);

// Turn fan off
await lutronAdapter.executeCommand(
  'lutron:fan-9',
  createDeviceCommand(DeviceCapability.FAN, 'setSpeed', {
    speed: 0
  })
);
```

### Get Device State

```typescript
// Get current state
const state = await lutronAdapter.getDeviceState('lutron:zone-5');

console.log('Device state:');
console.log(`  Level: ${state.attributes['dimmer.level']}%`);
console.log(`  Switch: ${state.attributes['switch.switch']}`);
console.log(`  Online: ${state.online}`);
console.log(`  Last updated: ${state.timestamp}`);
```

### Handle Button Events (Pico Remotes)

```typescript
import type { LutronButtonEvent } from './platforms/lutron/types.js';

// Subscribe to button events
lutronAdapter.on('buttonPress', (event: LutronButtonEvent) => {
  console.log(`
    Device: ${event.deviceId}
    Button: ${event.buttonNumber}
    Action: ${event.action}
    Time: ${event.timestamp}
  `);

  // Example: Toggle light on button 2 press
  if (event.buttonNumber === 2 && event.action === 'pushed') {
    lutronAdapter.executeCommand(
      'lutron:zone-5',
      createDeviceCommand(DeviceCapability.SWITCH, 'toggle')
    );
  }
});
```

### Handle Occupancy Sensors

```typescript
import type { LEAPOccupancyUpdate } from './platforms/lutron/types.js';

// Subscribe to occupancy events
lutronAdapter.on('occupancyChange', (event: LEAPOccupancyUpdate) => {
  console.log(`
    Sensor: ${event.sensorId}
    Occupied: ${event.occupied}
    Time: ${event.timestamp}
  `);

  // Example: Turn on lights when occupied
  if (event.occupied) {
    lutronAdapter.executeCommand(
      'lutron:zone-5',
      createDeviceCommand(DeviceCapability.SWITCH, 'on')
    );
  }
});
```

### Execute Scene (Virtual Button)

```typescript
// List available scenes
const scenes = await lutronAdapter.listScenes();
console.log('Available scenes:', scenes.map(s => s.name));

// Execute scene by ID
await lutronAdapter.executeScene('scene-movie-time');
console.log('Scene executed successfully');
```

### Batch Commands

```typescript
import type { BatchCommandInput } from './types/commands.js';

// Execute multiple commands in parallel (fast)
const commands: BatchCommandInput[] = [
  {
    deviceId: 'lutron:zone-1',
    command: createDeviceCommand(DeviceCapability.DIMMER, 'setLevel', { level: 75 }),
  },
  {
    deviceId: 'lutron:zone-2',
    command: createDeviceCommand(DeviceCapability.DIMMER, 'setLevel', { level: 75 }),
  },
  {
    deviceId: 'lutron:shade-7',
    command: createDeviceCommand(DeviceCapability.SHADE, 'close'),
  },
];

const results = await lutronAdapter.executeBatchCommands(commands, {
  parallel: true, // Execute in parallel for speed
});

console.log(`Executed ${results.filter(r => r.success).length}/${results.length} commands`);
```

---

## Supported Devices

### Device Type Mapping

LutronAdapter maps LEAP device types to unified capabilities:

#### Control Devices

| Lutron Device | LEAP Type | Capabilities | Control Range | Notes |
|---------------|-----------|--------------|---------------|-------|
| **Caseta Dimmer** | `WallDimmer` | SWITCH, DIMMER | 0-100% | Smooth dimming |
| **Caseta Switch** | `WallSwitch` | SWITCH | 0% or 100% only | Binary on/off |
| **Plug-In Dimmer** | `PlugInDimmer` | SWITCH, DIMMER | 0-100% | Lamp dimmers |

#### Shade Devices

| Lutron Device | LEAP Type | Capabilities | Control Range | Notes |
|---------------|-----------|--------------|---------------|-------|
| **Serena Honeycomb Shade** | `SerenaHoneycombShade` | SHADE | Position: 0-100% | Cellular shades |
| **Serena Roller Shade** | `SerenaRollerShade` | SHADE | Position: 0-100% | Roller shades |
| **Serena Wood Blind** | `SerenaWoodBlind` | SHADE | Position: 0-100%, Tilt angle | Position + tilt |
| **Triathlon Shade** | `TriathlonHoneycombShade` | SHADE | Position: 0-100% | Battery-powered |

#### Fan Control

| Lutron Device | LEAP Type | Capabilities | Control Range | Notes |
|---------------|-----------|--------------|---------------|-------|
| **Fan Speed Controller** | `CasetaFanSpeedController` | FAN | 0, 25, 50, 75, 100% | 5 speed levels |

#### Remotes and Keypads

| Lutron Device | LEAP Type | Capabilities | Buttons | Notes |
|---------------|-----------|--------------|---------|-------|
| **Pico Remote (2-button)** | `PicoKeypad` | BUTTON | On, Off | Simple on/off |
| **Pico Remote (3-button)** | `PicoKeypad` | BUTTON | On, Favorite, Off | With favorite scene |
| **Pico Remote (3-button RLD)** | `PicoKeypad` | BUTTON | On, Raise, Lower, Off | Dimming control |
| **Audio Pico (5-button)** | `PicoKeypad` | BUTTON | On, Fav1, Fav2, Fav3, Off | Sonos control |
| **seeTouch Keypad** | `seeTouchKeypad` | BUTTON | Multiple (varies) | Wall-mounted keypad |

#### Sensors

| Lutron Device | LEAP Type | Capabilities | Detection | Notes |
|---------------|-----------|--------------|-----------|-------|
| **Occupancy Sensor** | `OccupancySensor` | OCCUPANCY_SENSOR | Occupied/vacant | Room occupancy |
| **Motion Sensor** | `MotionSensor` | MOTION_SENSOR | Motion detected | Motion events |

### Pico Remote Button Layouts

**2-Button Pico:**
```
Button 2: On
Button 4: Off
```

**3-Button Pico:**
```
Button 2: On
Button 3: Favorite
Button 4: Off
```

**3-Button Raise/Lower Pico:**
```
Button 2: On
Button 5: Raise (brightness up)
Button 6: Lower (brightness down)
Button 4: Off
```

**5-Button Audio Pico:**
```
Button 2: On
Button 3: Favorite 1
Button 4: Favorite 2
Button 5: Favorite 3
Button 6: Off
```

### Fan Speed Levels

| Speed | Level (%) | Description |
|-------|-----------|-------------|
| **Off** | 0 | Fan off |
| **Low** | 25 | Low speed |
| **Medium-Low** | 50 | Medium-low speed |
| **Medium-High** | 75 | Medium-high speed |
| **High** | 100 | Maximum speed |

---

## Troubleshooting

### Certificate Errors

**Problem:** `ConfigurationError: Client certificate file not found`

**Causes:**
- Certificate path incorrect
- Certificates not generated
- File permissions blocking read access

**Solutions:**

1. **Verify certificate paths:**
   ```bash
   # Check if files exist
   ls -la ~/.lutron-certs/

   # Verify paths match configuration
   echo $LUTRON_CERT_PATH
   echo $LUTRON_KEY_PATH
   echo $LUTRON_CA_CERT_PATH
   ```

2. **Re-run pairing if files missing:**
   ```bash
   lap-pair 192.168.1.100
   ```

3. **Fix file permissions:**
   ```bash
   chmod 600 ~/.lutron-certs/caseta.key
   chmod 644 ~/.lutron-certs/caseta.crt
   chmod 644 ~/.lutron-certs/caseta-bridge.crt
   ```

**Problem:** `AuthenticationError: TLS authentication failed`

**Causes:**
- Certificates expired or invalid
- Wrong certificates for this Smart Bridge
- Certificate/key mismatch

**Solutions:**

1. **Verify certificate validity:**
   ```bash
   openssl x509 -in ~/.lutron-certs/caseta.crt -text -noout | grep "Not After"
   ```

2. **Re-pair to generate new certificates:**
   ```bash
   # Backup old certificates
   mv ~/.lutron-certs ~/.lutron-certs.backup

   # Generate new certificates
   lap-pair 192.168.1.100
   ```

3. **Verify certificate/key match:**
   ```bash
   # Extract public key from certificate
   openssl x509 -in caseta.crt -pubkey -noout > cert-pubkey.pem

   # Extract public key from private key
   openssl rsa -in caseta.key -pubout > key-pubkey.pem

   # Compare (should be identical)
   diff cert-pubkey.pem key-pubkey.pem
   ```

### Connection Failures

**Problem:** `NetworkError: Connection refused`

**Causes:**
- Smart Bridge IP incorrect
- Smart Bridge offline
- Network connectivity issues
- Firewall blocking port 8081

**Solutions:**

1. **Verify Smart Bridge IP:**
   ```bash
   # Ping Smart Bridge
   ping 192.168.1.100

   # Check port 8081 accessibility
   nc -zv 192.168.1.100 8081
   # or
   telnet 192.168.1.100 8081
   ```

2. **Check Smart Bridge status:**
   - Front LED should be solid (not blinking)
   - Verify Ethernet connection
   - Power cycle if necessary (unplug 10 seconds, replug)

3. **Test with Lutron app:**
   - Open Lutron app
   - Try controlling devices
   - If app fails, Smart Bridge has issue

4. **Check firewall rules:**
   ```bash
   # macOS: Check application firewall
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

   # Linux: Check iptables
   sudo iptables -L -n | grep 8081
   ```

**Problem:** `TimeoutError: Connection timeout`

**Causes:**
- Smart Bridge on different subnet
- VPN interfering with local network
- Network congestion

**Solutions:**

1. **Verify same subnet:**
   ```bash
   # Check server IP
   ifconfig | grep "inet "

   # Check Smart Bridge IP
   # Both should be on same subnet (e.g., 192.168.1.x)
   ```

2. **Disable VPN temporarily:**
   - VPNs can route local traffic through tunnel
   - Disconnect VPN and retry

3. **Check network path:**
   ```bash
   # Trace route to Smart Bridge
   traceroute 192.168.1.100

   # Should show direct connection (1 hop)
   ```

### Device Not Found

**Problem:** `DeviceNotFoundError: Device not found`

**Causes:**
- Device not paired to Smart Bridge
- Device ID incorrect
- Device deleted from Smart Bridge

**Solutions:**

1. **List all devices to verify ID:**
   ```typescript
   const devices = await lutronAdapter.listDevices();
   console.log(devices.map(d => `${d.id}: ${d.name}`));
   ```

2. **Re-pair device in Lutron app:**
   - Open Lutron app
   - Navigate to device settings
   - Re-add device if missing

3. **Verify device format:**
   ```typescript
   // Correct format includes "lutron:" prefix
   const deviceId = 'lutron:zone-5';

   // Incorrect (missing prefix)
   const deviceId = 'zone-5'; // ❌ Wrong
   ```

### Command Execution Failures

**Problem:** Commands timeout or fail silently

**Causes:**
- Device offline
- Smart Bridge overloaded
- RF interference

**Solutions:**

1. **Check device online status:**
   ```typescript
   const device = await lutronAdapter.getDevice('lutron:zone-5');
   console.log('Device online:', device.online);
   ```

2. **Verify RF signal strength:**
   - Lutron devices have 30-foot range
   - Check for metal obstructions
   - Consider adding repeater (Caseta Lamp Dimmer acts as repeater)

3. **Reduce command rate:**
   ```typescript
   // Add delay between commands
   for (const command of commands) {
     await lutronAdapter.executeCommand(deviceId, command);
     await new Promise(resolve => setTimeout(resolve, 100));
   }
   ```

### Pairing Button Issues

**Problem:** Pairing utility doesn't detect button press

**Solutions:**

1. **Press button firmly:**
   - Use paperclip or pen tip
   - Press and hold 3-5 seconds
   - Watch for LED flash confirmation

2. **Timing:**
   - Start pairing command first
   - Wait for "Press button now" message
   - Then press button (don't press before prompt)

3. **Multiple attempts:**
   - Some bridges require 2-3 button presses
   - Try again if first attempt fails

### Pico Remote Events Not Received

**Problem:** Button events not triggering handlers

**Causes:**
- Event listener not registered
- Pico not paired to Smart Bridge
- Battery dead

**Solutions:**

1. **Verify event listener:**
   ```typescript
   lutronAdapter.on('buttonPress', (event) => {
     console.log('Button event:', event);
   });
   ```

2. **Test Pico in Lutron app:**
   - Press buttons
   - Verify app shows button presses
   - If app doesn't show, re-pair Pico

3. **Replace battery:**
   - Pico uses CR2032 battery
   - Low battery causes missed events

---

## Advanced Configuration

### Multiple Smart Bridges

**Supporting Multiple Locations:**

```typescript
// Living room Smart Bridge
const livingRoomAdapter = new LutronAdapter({
  smartBridgeHost: '192.168.1.100',
  certificatePath: '/path/to/living-room-caseta.crt',
  privateKeyPath: '/path/to/living-room-caseta.key',
  caCertificatePath: '/path/to/living-room-caseta-bridge.crt',
});

// Bedroom Smart Bridge
const bedroomAdapter = new LutronAdapter({
  smartBridgeHost: '192.168.1.101',
  certificatePath: '/path/to/bedroom-caseta.crt',
  privateKeyPath: '/path/to/bedroom-caseta.key',
  caCertificatePath: '/path/to/bedroom-caseta-bridge.crt',
});

await Promise.all([
  livingRoomAdapter.initialize(),
  bedroomAdapter.initialize(),
]);
```

**Note:** Each Smart Bridge requires separate certificate pairing.

### Custom Port Configuration

```typescript
const config: LutronAdapterConfig = {
  smartBridgeHost: '192.168.1.100',
  port: 8081, // Default LEAP port
  certificatePath: '/path/to/caseta.crt',
  privateKeyPath: '/path/to/caseta.key',
  caCertificatePath: '/path/to/caseta-bridge.crt',
};
```

### Error Handling Strategies

**Implement Reconnection Logic:**

```typescript
class ResilientLutronAdapter extends LutronAdapter {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async initialize(): Promise<void> {
    try {
      await super.initialize();
      this.reconnectAttempts = 0;
    } catch (error) {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);

        console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.initialize();
      }
      throw error;
    }
  }
}
```

### Event-Driven Automation

**Create Scene Automation:**

```typescript
// Trigger scene when Pico button pressed
lutronAdapter.on('buttonPress', async (event) => {
  if (event.deviceId === 'lutron:pico-1' && event.buttonNumber === 3) {
    // Favorite button pressed
    await lutronAdapter.executeScene('scene-movie-time');
  }
});

// Auto-off lights when room vacant
lutronAdapter.on('occupancyChange', async (event) => {
  if (!event.occupied) {
    // Room vacant for 5 minutes
    setTimeout(async () => {
      const currentOccupancy = await checkOccupancy(event.sensorId);
      if (!currentOccupancy) {
        await lutronAdapter.executeCommand(
          'lutron:zone-living-room',
          createDeviceCommand(DeviceCapability.SWITCH, 'off')
        );
      }
    }, 5 * 60 * 1000);
  }
});
```

### State Monitoring

**Monitor Zone Status Changes:**

```typescript
import type { LEAPZoneStatus } from './platforms/lutron/types.js';

lutronAdapter.on('zoneStatusChange', (update: LEAPZoneStatus) => {
  console.log(`
    Zone: ${update.zoneId}
    Level: ${update.level}%
    Time: ${update.timestamp}
  `);

  // Store to database, trigger automation, etc.
});
```

### Performance Optimization

**Batch Zone Updates:**

```typescript
// Instead of individual commands:
// ❌ Slow (sequential)
await lutronAdapter.executeCommand('lutron:zone-1', ...);
await lutronAdapter.executeCommand('lutron:zone-2', ...);
await lutronAdapter.executeCommand('lutron:zone-3', ...);

// ✅ Fast (parallel batch)
await lutronAdapter.executeBatchCommands([
  { deviceId: 'lutron:zone-1', command: ... },
  { deviceId: 'lutron:zone-2', command: ... },
  { deviceId: 'lutron:zone-3', command: ... },
], { parallel: true });
```

### Certificate Rotation

**Rotate Certificates Periodically:**

```bash
# 1. Generate new certificates
lap-pair 192.168.1.100

# 2. Save with new names
mv caseta.crt caseta-new.crt
mv caseta.key caseta-new.key
mv caseta-bridge.crt caseta-bridge-new.crt

# 3. Update configuration
export LUTRON_CERT_PATH="$HOME/.lutron-certs/caseta-new.crt"
export LUTRON_KEY_PATH="$HOME/.lutron-certs/caseta-new.key"
export LUTRON_CA_CERT_PATH="$HOME/.lutron-certs/caseta-bridge-new.crt"

# 4. Restart application
# 5. Delete old certificates after verifying new ones work
```

---

## References

### Official Documentation

- **Lutron Caseta**: https://www.lutron.com/en-US/Products/Pages/SingleRoomControls/CasetaWireless/Overview.aspx
- **LEAP Protocol Specification**: https://support.lutron.com/us/en/product/radiora3/article/networking/Lutron-s-LEAP-API-Integration-Protocol
- **Smart Bridge Support**: https://support.lutron.com

### SDK Resources

- **lutron-leap Library**: https://github.com/thenewwazoo/lutron-leap-js
- **NPM Package**: https://www.npmjs.com/package/lutron-leap
- **pylutron-caseta**: https://github.com/gurumitts/pylutron-caseta (for pairing utility)

### Community Resources

- **Homebridge Plugin**: https://github.com/homebridge-plugins/homebridge-lutron-caseta-leap
- **openHAB Binding**: https://www.openhab.org/addons/bindings/lutron/
- **LEAP Protocol Notes**: https://www.openhab.org/addons/bindings/lutron/doc/leapnotes.html

### Project Documentation

- **Research Document**: [tuya-lutron-api-integration-research-2025-11-28.md](/Users/masa/Projects/mcp-smartthings/docs/research/tuya-lutron-api-integration-research-2025-11-28.md)
- **IDeviceAdapter Interface**: `/src/adapters/base/IDeviceAdapter.ts`
- **LutronAdapter Source**: `/src/platforms/lutron/LutronAdapter.ts`
- **Certificate Manager**: `/src/platforms/lutron/certificate-manager.ts`

### Support Resources

- **GitHub Issues**: File issues in MCP Smarterthings repository
- **Ticket Reference**: Linear ticket 1M-340

---

**Last Updated:** 2025-11-28
**Version:** 1.0.0
**Status:** Production Ready
