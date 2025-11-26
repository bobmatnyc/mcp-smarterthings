# Testing Quick Start Guide

Quick reference for testing the SmartThings MCP server.

## Prerequisites

```bash
# 1. Build the server
npm run build

# 2. Ensure SMARTTHINGS_PAT is set in .env
echo "SMARTTHINGS_PAT=your-token-here" >> .env
```

## Testing Methods

### 🚀 Interactive Test Gateway (Recommended for Manual Testing)

```bash
npm run test-gateway
```

**Quick Commands**:
```
connect          # Connect to server
devices          # List all devices
on <deviceId>    # Turn device on
off <deviceId>   # Turn device off
status <id>      # Get device status
help             # Show all commands
exit             # Exit gateway
```

**Example Session**:
```bash
mcp> connect
mcp> devices
mcp> on abc-123-device-id
mcp> status abc-123-device-id
mcp> exit
```

---

### 📝 Shell Helpers (Best for Scripting)

```bash
source tools/test-helpers.sh
```

**Quick Commands**:
```bash
st_list_devices              # List all devices
st_turn_on "device-id"       # Turn device on
st_turn_off "device-id"      # Turn device off
st_status "device-id"        # Get device status
mcp_test_all                 # Run all basic tests
st_test_device "device-id"   # Test device cycle
```

**Example Script**:
```bash
#!/bin/bash
source tools/test-helpers.sh

# Get all devices
st_list_devices

# Control a device
DEVICE_ID="your-device-id"
st_turn_on "$DEVICE_ID"
sleep 2
st_turn_off "$DEVICE_ID"
```

---

### 🧪 Integration Tests (Automated)

```bash
npm run test:integration
```

**Expected Output**:
```
✓ tests/integration/mcp-client.test.ts (25 tests | 2 skipped)
  Test Files  1 passed (1)
  Tests       23 passed | 2 skipped (25)
```

**With Real Device Testing**:
```bash
TEST_DEVICE_ID="your-device-id" npm run test:integration
```

---

### 🔍 MCP Inspector (Official GUI)

```bash
npm run test:inspector
```

Opens browser at `http://localhost:6274`
- Visual interface for testing tools
- View JSON-RPC messages
- Test with real devices

---

### ⚡ Direct JSON-RPC (Advanced)

```bash
# List tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
  node dist/index.js | jq

# List devices
echo '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{"name":"list_devices","arguments":{}},
  "id":2
}' | node dist/index.js | jq
```

---

## Common Testing Workflows

### 1. Quick Smoke Test
```bash
npm run build
npm run test-gateway
# mcp> connect
# mcp> devices
# mcp> exit
```

### 2. Full Automated Test
```bash
npm run build
npm run test:integration
```

### 3. Device Control Test
```bash
source tools/test-helpers.sh
st_test_device "your-device-id"
```

### 4. Development Workflow
```bash
# Terminal 1: Watch mode
npm run dev

# Terminal 2: Test gateway
npm run test-gateway
```

---

## Troubleshooting

### "Not connected" Error
```bash
# In test gateway:
mcp> connect
```

### "Server not built" Warning
```bash
npm run build
```

### "401 Unauthorized" Error
```bash
# Check your .env file
cat .env | grep SMARTTHINGS_PAT

# Verify token is valid at:
# https://account.smartthings.com/tokens
```

### "jq not found" (Shell Helpers)
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

---

## Testing Best Practices

1. **Always build first**: `npm run build`
2. **Use test devices**: Avoid production devices
3. **Check logs**: Set `LOG_LEVEL=debug` for debugging
4. **Verify auth**: Ensure SMARTTHINGS_PAT is valid
5. **Run integration tests**: Before committing changes

---

## Quick Command Reference

| Task | Command |
|------|---------|
| Build server | `npm run build` |
| Interactive testing | `npm run test-gateway` |
| Integration tests | `npm run test:integration` |
| Unit tests | `npm run test:unit` |
| All tests | `npm test` |
| MCP Inspector | `npm run test:inspector` |
| Shell helpers | `source tools/test-helpers.sh` |

---

## Next Steps

1. **First time?** → Start with `npm run test-gateway`
2. **Need scripting?** → Use `source tools/test-helpers.sh`
3. **Automated testing?** → Run `npm run test:integration`
4. **GUI preference?** → Try `npm run test:inspector`

For detailed documentation, see [README.md](./README.md#testing-guide)
