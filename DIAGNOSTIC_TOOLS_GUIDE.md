# Diagnostic Tools Quick Reference Guide

Quick reference for the 6 diagnostic tools implemented in ticket 1M-214.

---

## Tool 1: test_connection

**Purpose:** Test SmartThings API connectivity and validate authentication token

**Usage:**
```json
{
  "tool": "test_connection",
  "arguments": {}
}
```

**Returns:**
- Connection status (success/failure)
- Response time
- Account summary (locations, devices, rooms)
- Token expiration status

**When to Use:**
- First step when troubleshooting connectivity issues
- Verify PAT is valid before operations
- Check API availability
- Measure baseline API performance

---

## Tool 2: get_system_info

**Purpose:** Get comprehensive system information and statistics

**Usage:**
```json
{
  "tool": "get_system_info",
  "arguments": {}
}
```

**Returns:**
- Server metadata (version, uptime, Node.js version)
- Location/room/device counts
- Device breakdown by type
- Command statistics (total, success rate)
- Rate limit status
- Token expiration info

**When to Use:**
- Get overview of SmartThings account
- Check server version and health
- Review device distribution
- Monitor rate limit usage

---

## Tool 3: list_failed_commands

**Purpose:** List recent command execution failures

**Usage:**
```json
{
  "tool": "list_failed_commands",
  "arguments": {
    "limit": 10,          // Optional: 1-100, default 10
    "deviceId": "uuid"    // Optional: filter by device
  }
}
```

**Returns:**
- List of failed commands with timestamps
- Error messages
- Device information
- Command duration

**When to Use:**
- Diagnose why device commands are failing
- Identify patterns in command failures
- Track retry failures
- Debug capability compatibility issues

---

## Tool 4: get_device_health

**Purpose:** Get device health status and diagnostics

**Usage:**
```json
{
  "tool": "get_device_health",
  "arguments": {
    "deviceId": "uuid"    // Required
  }
}
```

**Returns:**
- Health status (online/offline)
- Battery level (if applicable)
- Signal strength (RSSI, LQI)
- Last communication timestamp
- Power source

**When to Use:**
- Troubleshoot offline or unresponsive devices
- Check battery level before replacing
- Verify signal strength for connectivity issues
- Confirm last communication timestamp

---

## Tool 5: validate_device_capabilities

**Purpose:** Validate if device supports specific capability and commands

**Usage:**
```json
{
  "tool": "validate_device_capabilities",
  "arguments": {
    "deviceId": "uuid",       // Required
    "capability": "switch",   // Required: e.g., "switch", "switchLevel", "lock"
    "command": "on"           // Optional: specific command to validate
  }
}
```

**Returns:**
- Capability support status
- Available commands for capability
- Command validation result
- Alternative capabilities (if not supported)

**When to Use:**
- Check if device supports capability before sending command
- Validate command availability
- Get list of available capabilities for device
- Troubleshoot "capability not supported" errors

**Supported Capabilities:**
- switch (on, off)
- switchLevel (setLevel)
- colorControl (setColor, setHue, setSaturation)
- colorTemperature (setColorTemperature)
- lock (lock, unlock)
- thermostatMode (setThermostatMode, auto, cool, heat, off)
- windowShade (open, close, pause)
- alarm (off, both, siren, strobe)
- ... and more

---

## Tool 6: export_diagnostics

**Purpose:** Generate comprehensive diagnostic report

**Usage:**
```json
{
  "tool": "export_diagnostics",
  "arguments": {
    "format": "markdown",              // Optional: "json" or "markdown", default "markdown"
    "includeDeviceHealth": true,       // Optional: default true
    "includeFailedCommands": true,     // Optional: default true
    "maxDevices": 10                   // Optional: 1-50, default 10
  }
}
```

**Returns:**
- Complete diagnostic report in requested format
- System information
- Device health status (sampled)
- Command history and statistics
- Rate limit status
- Token expiration details

**When to Use:**
- Export diagnostics for support ticket
- Generate status report for monitoring
- Create documentation of system state
- Share configuration with team

**Performance Note:**
- Samples devices to avoid timeout (maxDevices parameter)
- May take longer with includeDeviceHealth=true
- Use smaller maxDevices for faster reports

---

## Common Troubleshooting Workflows

### Workflow 1: Connection Issues
```
1. test_connection          → Verify API connectivity
2. get_system_info          → Check overall system health
3. list_failed_commands     → Review recent failures
```

### Workflow 2: Device Not Responding
```
1. get_device_health        → Check if device is online
2. validate_device_capabilities → Verify capability support
3. list_failed_commands     → Check for recent command failures
```

### Workflow 3: Generate Support Report
```
1. export_diagnostics (markdown) → Full diagnostic report
2. list_failed_commands          → Recent failure details
3. get_system_info               → System configuration
```

---

## Error Handling

All diagnostic tools return graceful errors with:
- Human-readable error messages
- Error classification codes
- Suggestions for resolution
- Structured error data

**Example Error Response:**
```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Device not found: invalid-device-id"
    }
  ]
}
```

---

## Performance Tips

1. **Use appropriate limits:** Start with small limits (5-10) for list_failed_commands
2. **Sample devices:** For export_diagnostics, use maxDevices=5-10 for faster reports
3. **Disable health checks:** Set includeDeviceHealth=false in export_diagnostics for speed
4. **Check connection first:** Always run test_connection before other diagnostics

---

## Rate Limiting

SmartThings API has rate limits:
- Diagnostic tools track rate limit hits automatically
- View rate limit status via get_system_info
- export_diagnostics may timeout under heavy throttling (use smaller maxDevices)
- Retry logic is built-in for transient failures

---

## Integration with DiagnosticTracker

All command executions are automatically tracked:
```typescript
// Automatic tracking happens behind the scenes
diagnosticTracker.recordCommand({
  timestamp: Date.now(),
  deviceId,
  capability,
  command,
  success: true/false,
  error: 'error message',
  duration: 250
});
```

You don't need to manually track - just use the diagnostic tools!

---

## Examples

### Example 1: Quick Health Check
```json
{
  "tool": "test_connection",
  "arguments": {}
}
```
**Response:**
```
Connection test PASSED: Successfully connected to SmartThings API
- Response Time: 587ms
- Locations: 1
- Devices: 15
- Token expires in: 23h 45m
```

### Example 2: Device Troubleshooting
```json
{
  "tool": "get_device_health",
  "arguments": {
    "deviceId": "abc-123-def-456"
  }
}
```
**Response:**
```
✓ Device Health: Living Room Light
Status: online
Battery: 95%
Signal: RSSI -45dBm
Last Update: 2025-11-25T18:00:00Z
```

### Example 3: Comprehensive Report
```json
{
  "tool": "export_diagnostics",
  "arguments": {
    "format": "markdown",
    "maxDevices": 5
  }
}
```
**Response:**
```markdown
# SmartThings MCP Server Diagnostic Report

Generated: 2025-11-25T18:00:00Z

## Server Information
- Name: smartthings-mcp
- Version: 1.0.0
- Uptime: 120 minutes

... (full report)
```

---

## Support

For issues or questions about diagnostic tools:
1. Check QA_REPORT_1M-214.md for detailed test results
2. Review test suite at tests/qa/diagnostic-tools.test.ts
3. See implementation at src/mcp/tools/diagnostics.ts

---

**Last Updated:** 2025-11-25
**Ticket:** 1M-214
