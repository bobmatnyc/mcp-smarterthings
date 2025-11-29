# Test Fixtures for Integration Tests (1M-311)

This directory contains realistic SmartThings API response fixtures for testing the Alcove diagnostic workflow.

## Files

### 1. `alcove-events.json`
**Purpose**: Device event history for Alcove bedroom light  
**Structure**: Array of DeviceEvent objects  
**Count**: 18 events over 6 days  
**Time Range**: Nov 22-28, 2025

**Diagnostic Patterns Included**:

1. **Automation Pattern** (Daily 10pm trigger):
   - Nov 28 @ 22:00 - ON
   - Nov 27 @ 22:00 - ON
   - Nov 26 @ 22:00 - ON
   - Nov 24 @ 22:00 - ON
   - Nov 23 @ 22:00 - ON
   - **Pattern**: Consistent activation at 10pm (likely automation/routine)

2. **Rapid State Changes** (Nov 25, 2:30-2:41pm):
   - 14:30:00 - ON
   - 14:32:00 - OFF (2 min later)
   - 14:35:00 - ON (3 min later)
   - 14:37:00 - OFF (2 min later)
   - 14:40:00 - ON (3 min later)
   - 14:41:30 - OFF (1.5 min later)
   - **Pattern**: 6 state changes in 11 minutes (suggests troubleshooting/testing)

3. **Normal Usage** (Random daytime events):
   - Nov 22 @ 15:00 - ON/OFF (afternoon usage)

**Event Structure** (matches `src/types/device-events.ts`):
```typescript
{
  deviceId: string;           // "alcove-bedroom-light-001"
  deviceName: string;         // "Alcove Bedroom Light"
  locationId: string;         // "location-home-001"
  locationName: string;       // "Home"
  time: string;              // ISO-8601 UTC timestamp
  epoch: number;             // Unix timestamp (ms)
  component: string;         // "main"
  componentLabel: string;    // "Main"
  capability: string;        // "switch"
  attribute: string;         // "switch"
  value: string;            // "on" | "off"
  text: string;             // "Switch turned on"
  hash: string;             // Unique event ID
}
```

### 2. `device-list.json`
**Purpose**: SmartThings `/v1/devices` API response  
**Structure**: `{items: Device[]}`  
**Count**: 6 devices

**Devices Included**:
1. **Alcove Bedroom Light** (`alcove-bedroom-light-001`)
   - Capabilities: switch, healthCheck, refresh
   - Type: DTH (Device Type Handler)
   - Network: Z-Wave
   - Room: Bedroom

2. **Living Room Thermostat** (`thermostat-living-room-001`)
   - Capabilities: thermostat, temperature, humidity, modes
   - Manufacturer: Ecobee
   - Type: VIPER

3. **Front Door Lock** (`front-door-lock-001`)
   - Capabilities: lock, battery, tamperAlert, lockCodes
   - Manufacturer: Schlage
   - Type: DTH (Z-Wave)

4. **Hallway Motion Sensor** (`motion-sensor-hallway-001`)
   - Capabilities: motionSensor, temperature, battery
   - Manufacturer: Samsung
   - Type: VIPER

5. **Bedroom Window Sensor** (`contact-sensor-window-001`)
   - Capabilities: contactSensor, temperature, battery, threeAxis
   - Type: Multipurpose Sensor

6. **Kitchen Dimmer** (`dimmer-kitchen-001`)
   - Capabilities: switch, switchLevel, refresh
   - Manufacturer: Leviton
   - Type: DTH (Z-Wave)

**Device Structure** (matches SmartThings SDK `Device` type):
```typescript
{
  deviceId: string;
  name: string;
  label: string;
  deviceManufacturerCode: string;
  locationId: string;
  roomId: string;
  deviceTypeName: string;
  components: Array<{
    id: string;
    label: string;
    capabilities: Array<{id: string; version: number}>;
    categories: Array<{name: string; categoryType: string}>;
  }>;
  type: "DTH" | "VIPER" | "LAN" | ...;
  executingLocally: boolean;
}
```

### 3. `alcove-device.json`
**Purpose**: SmartThings `/v1/devices/{id}` API response (single device)  
**Structure**: Single Device object with full metadata

**Additional Details**:
- Complete device profile with all metadata
- Health check status
- Z-Wave security level (S2 Authenticated)
- Hub association
- Network type indicators

**Full Device Fields**:
- All fields from device list PLUS:
  - `profile`: Device profile reference
  - `dth.completedSetup`: Setup completion status
  - `dth.networkSecurityLevel`: Security configuration
  - `dth.hubId`: Associated hub
  - `zwave.eui64`: Z-Wave device address
  - `childDevices`: Empty array (no children)
  - Protocol-specific fields (zigbee, matter, ble, etc.)

## Usage with Integration Tests

### Example: Mocking SmartThings API with nock

```typescript
import nock from 'nock';
import alcoveEvents from './fixtures/alcove-events.json';
import deviceList from './fixtures/device-list.json';
import alcoveDevice from './fixtures/alcove-device.json';

describe('Alcove Diagnostic Workflow', () => {
  beforeEach(() => {
    // Mock device list endpoint
    nock('https://api.smartthings.com')
      .get('/v1/devices')
      .reply(200, deviceList);

    // Mock specific device endpoint
    nock('https://api.smartthings.com')
      .get('/v1/devices/alcove-bedroom-light-001')
      .reply(200, alcoveDevice);

    // Mock device events endpoint
    nock('https://api.smartthings.com')
      .get('/v1/devices/alcove-bedroom-light-001/events')
      .query(true)  // Accept any query params
      .reply(200, alcoveEvents);
  });

  it('should detect automation pattern', async () => {
    // Test code using mocked endpoints
  });

  it('should detect rapid state changes', async () => {
    // Test code using mocked endpoints
  });
});
```

### Test Scenarios Enabled

✅ **Device Discovery**:
- Filter devices by capability (switch, thermostat, lock, etc.)
- Find "Alcove" devices by name pattern
- Verify device has required capabilities

✅ **Event Analysis**:
- Identify automation patterns (consistent timing)
- Detect rapid state changes (<5 min apart)
- Calculate event frequency and gaps
- Filter events by date range

✅ **Diagnostic Workflow**:
- Check if device has automation controlling it
- Recommend disabling automation for testing
- Detect troubleshooting behavior (rapid changes)

## Data Patterns Summary

| Pattern | Description | Events | Time Range |
|---------|-------------|--------|------------|
| **Automation** | Daily 10pm activation | 5 events | Nov 23-28 |
| **Rapid Changes** | 6 toggles in 11 minutes | 6 events | Nov 25 14:30-14:41 |
| **Normal Usage** | Random daytime use | 2 events | Nov 22, Nov 25 |
| **Off Period** | Consistent off around 11pm | 5 events | Follows automation |

## Timestamps and Time Calculations

All timestamps are in UTC. Events span approximately 6 days:
- **Oldest**: 2025-11-22 15:00:00 UTC (epoch: 1732284000000)
- **Newest**: 2025-11-28 23:15:00 UTC (epoch: 1732839300000)
- **Range**: 5.3 days

**Quick Time Conversions**:
```javascript
// Create Date from epoch
new Date(1732834800000)  // 2025-11-28T22:00:00.000Z

// Get epoch from ISO string
new Date("2025-11-28T22:00:00.000Z").getTime()  // 1732834800000

// Calculate time between events
const gap = event2.epoch - event1.epoch;  // milliseconds
const gapMinutes = gap / 1000 / 60;
```

## Validation

All fixtures have been validated:
- ✅ Valid JSON syntax
- ✅ Matches SmartThings API structure
- ✅ Contains diagnostic-worthy patterns
- ✅ Ready for nock mocking

Run validation:
```bash
npm run test:fixtures  # If test script exists
# or
node -e "JSON.parse(require('fs').readFileSync('tests/fixtures/alcove-events.json'))"
```

## References

- **SmartThings API**: https://developer.smartthings.com/docs/api/public
- **DeviceEvent Type**: `src/types/device-events.ts`
- **SmartThings Types**: `src/types/smartthings.ts`
- **SmartThings Adapter**: `src/platforms/smartthings/SmartThingsAdapter.ts`
