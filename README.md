# MCP SmartThings Server

A Model Context Protocol (MCP) server that provides LLM-driven control and automation for SmartThings home automation systems. Built with TypeScript and the official SmartThings SDK.

## Features

- **Device Control**: Turn devices on/off, get status
- **Device Discovery**: List all devices and their capabilities
- **Scene Management**: List and execute SmartThings scenes
- **Room Organization**: Filter devices and scenes by room
- **Type-Safe**: Built with TypeScript 5.6+ strict mode and branded types
- **Resilient**: Automatic retry with exponential backoff for API failures
- **MCP Protocol**: Full compliance with MCP SDK 1.22.0
- **Multiple Transports**: Stdio (CLI) and HTTP/SSE (web)
- **Structured Logging**: Winston with JSON format for production monitoring

## Prerequisites

- **Node.js**: 18.0.0 or higher
- **pnpm**: 9.0.0 or higher (recommended package manager)
- **SmartThings Account**: With at least one device configured
- **SmartThings Personal Access Token (PAT)**: Required for API authentication

## Getting Started

### 1. Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install
```

### 2. SmartThings Personal Access Token (PAT)

To control your SmartThings devices, you need a Personal Access Token:

1. Go to [SmartThings Personal Access Tokens](https://account.smartthings.com/tokens)
2. Click "Generate new token"
3. Enter a token name (e.g., "MCP Server")
4. Select the following scopes:
   - `r:devices:*` (Read devices)
   - `x:devices:*` (Execute commands on devices)
   - `r:scenes:*` (Read scenes)
   - `x:scenes:*` (Execute scenes)
   - `r:locations:*` (Read locations/rooms)
5. Click "Generate token"
6. **Copy the token immediately** (you won't be able to see it again)

### 3. Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your SmartThings PAT:

```env
SMARTTHINGS_PAT=your_personal_access_token_here
MCP_SERVER_NAME=smartthings-mcp
MCP_SERVER_VERSION=1.0.0
MCP_SERVER_PORT=3000
NODE_ENV=development
LOG_LEVEL=info
TRANSPORT_MODE=stdio
```

### 4. Build

```bash
pnpm build
```

### 5. Run the Server

**Development mode with auto-reload:**
```bash
pnpm dev
```

**Production mode:**
```bash
npm start
```

The server will start with the configured transport mode (stdio or http).

## Available MCP Tools

### Device Control

#### `turn_on_device`
Turn on a SmartThings device (requires switch capability).

**Input:**
```json
{
  "deviceId": "device-uuid-here"
}
```

**Output:**
```
Device {deviceId} turned on successfully
```

#### `turn_off_device`
Turn off a SmartThings device (requires switch capability).

**Input:**
```json
{
  "deviceId": "device-uuid-here"
}
```

**Output:**
```
Device {deviceId} turned off successfully
```

#### `get_device_status`
Get current status and state of a SmartThings device.

**Input:**
```json
{
  "deviceId": "device-uuid-here"
}
```

**Output:**
```
Device: Living Room Light
Label: Main Light
Switch State: on
Type: LIGHT
```

### Device Discovery

#### `list_devices`
List all SmartThings devices accessible with the configured token. Optionally filter by room name.

**Input:**
```json
{
  "roomName": "Living Room"  // Optional
}
```

**Output:**
```
Found 5 device(s):

- Living Room Light (abc-123-...)
  Type: LIGHT
  Room: Living Room
  Capabilities: switch, switchLevel

- Kitchen Switch (def-456-...)
  Type: SWITCH
  Room: Kitchen
  Capabilities: switch
```

**Features:**
- List all devices across all rooms (no parameters)
- Filter devices by room name (shows only devices in that room)
- Supports case-insensitive, partial room name matching

#### `list_devices_by_room`
List all SmartThings devices in a specific room. More explicit than `list_devices` with optional `roomName` parameter - use this when room filtering is required.

**Input:**
```json
{
  "roomName": "Living Room"  // Required
}
```

**Output:**
```
Found 2 device(s) in room "Living Room":

- Living Room Light (abc-123-...)
  Type: LIGHT
  Room: Living Room
  Capabilities: switch, switchLevel

- Living Room Thermostat (def-456-...)
  Type: THERMOSTAT
  Room: Living Room
  Capabilities: temperatureMeasurement, thermostatMode
```

**Features:**
- Dedicated room-specific tool with required parameter
- Clearer API intent than optional parameter
- Returns error if room not found or name is ambiguous
- Supports case-insensitive, partial room name matching

**Design Decision:**
This tool provides better API design for room-specific queries by making the room parameter required. Use `list_devices_by_room` when you specifically want to filter by room, and `list_devices` when you want flexibility of optional filtering or listing all devices.

#### `get_device_capabilities`
Get the capabilities supported by a specific SmartThings device.

**Input:**
```json
{
  "deviceId": "device-uuid-here"
}
```

**Output:**
```
Device: Living Room Light
Capabilities (3):
- switch
- switchLevel
- colorControl
```

#### `list_rooms`
List all SmartThings rooms/locations with device counts.

**Input:**
```json
{}
```

**Output:**
```
Found 3 room(s):

- Living Room (room-uuid-1)
  Location: location-uuid
  Devices: 5

- Bedroom (room-uuid-2)
  Location: location-uuid
  Devices: 3
```

### Scene Management

#### `list_scenes`
List all SmartThings scenes accessible with the configured token. Optionally filter by room name to show scenes in that location.

**Input:**
```json
{
  "roomName": "Living Room"  // Optional
}
```

**Output:**
```
Found 2 scene(s) in location for room "Living Room":

- Movie Night 🎬 (scene-uuid-1)
  Last Executed: 11/24/2025, 8:30:00 PM

- Good Morning ☀️ (scene-uuid-2)
  Last Executed: 11/25/2025, 7:00:00 AM
```

**Features:**
- List all scenes across all locations (no parameters)
- Filter scenes by room name (shows scenes in that room's location)
- Shows scene icons, names, and last execution time
- Supports case-insensitive, partial room name matching

**Note:** SmartThings API scenes are filtered by location, not room. When you provide a room name, the tool finds the room and returns all scenes in that room's location.

#### `list_scenes_by_room`
List all SmartThings scenes for a specific room. More explicit than `list_scenes` with optional `roomName` parameter - use this when room filtering is required.

**Input:**
```json
{
  "roomName": "Living Room"  // Required
}
```

**Output:**
```
Found 2 scene(s) in location for room "Living Room":

- Movie Night 🎬 (scene-uuid-1)
  Last Executed: 11/24/2025, 8:30:00 PM

- Bright Lights 💡 (scene-uuid-2)
  Last Executed: 11/24/2025, 6:00:00 PM
```

**Features:**
- Dedicated room-specific tool with required parameter
- Clearer API intent than optional parameter
- Returns error if room not found or name is ambiguous
- Supports case-insensitive, partial room name matching
- Shows all scenes in the location for the specified room

**Design Decision:**
This tool provides better API design for room-specific queries by making the room parameter required. Use `list_scenes_by_room` when you specifically want to filter by room, and `list_scenes` when you want flexibility of optional filtering or listing all scenes.

**Technical Note:** SmartThings API scenes are organized by location, not room. This tool resolves the room to its location, then returns all scenes in that location.

#### `execute_scene`
Execute a SmartThings scene by ID or name.

**Input:**
```json
{
  "sceneId": "scene-uuid-here"  // Option 1: Use UUID
}
```

Or:

```json
{
  "sceneName": "Movie Night"  // Option 2: Use name (case-insensitive)
}
```

**Output:**
```
Scene "Movie Night" executed successfully.
Scene ID: scene-uuid-here
```

**Features:**
- Execute by UUID (faster, direct execution)
- Execute by name (convenient, supports partial matching)
- Case-insensitive name matching
- Returns execution confirmation with scene details

## Usage with Interactive Chatbot

The MCP SmartThings server includes a built-in chatbot that provides a natural language interface for controlling your devices. The chatbot connects to the MCP server via the MCP protocol, validating that the server works correctly while providing an intuitive user experience.

### Quick Start

```bash
# Build the project
pnpm build

# Start chatbot (ensure .env.local is configured)
pnpm chat
```

### Configuration

The chatbot requires two environment variables in `.env.local`:

```env
# SmartThings Personal Access Token (required)
SMARTTHINGS_PAT=your_smartthings_token_here

# OpenRouter API Key (required for LLM access)
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key_here
```

**Getting an OpenRouter API Key:**

1. Visit [OpenRouter](https://openrouter.ai/)
2. Sign up for a free account
3. Navigate to API Keys section
4. Generate a new API key
5. Add to `.env.local`

**Free Tier Models:**
- `deepseek/deepseek-chat` (default) - Free, fast, good for home automation
- Other free models available at [OpenRouter Models](https://openrouter.ai/models)

### Using the Chatbot

Once started, you can control your devices using natural language:

```
You: Turn on the living room lights
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Development

### Type Checking

```bash
pnpm typecheck
```

### Linting

```bash
pnpm lint
pnpm lint:fix
```

### Code Formatting

```bash
pnpm format
pnpm format:check
```

### Testing

The project provides multiple testing approaches:

#### Unit Tests
```bash
# Run all tests
pnpm test

# Run unit tests only
ppnpm test:unit

# Run tests in watch mode
ppnpm test:watch

# Run tests with coverage
ppnpm test:coverage
```

#### Integration Tests
```bash
# Run integration tests (requires built server)
pnpm build
ppnpm test:integration
```

#### Interactive Test Gateway
```bash
# Launch interactive REPL client
ppnpm test-gateway

# Interactive session:
# mcp> connect
# mcp> devices
# mcp> on abc-123-device-id
# mcp> status abc-123-device-id
# mcp> help
# mcp> exit
```

#### MCP Inspector (Official GUI Tool)
```bash
# Launch MCP Inspector GUI
ppnpm test:inspector

# Opens browser at http://localhost:6274
# - Visual interface for testing tools
# - View request/response JSON-RPC messages
# - Test tool execution with real devices
```

#### Shell Helper Functions
```bash
# Source helper functions
source tools/test-helpers.sh

# Use helper commands
mcp_list_tools              # List all MCP tools
st_list_devices             # List SmartThings devices
st_turn_on "device-id"      # Turn device on
st_turn_off "device-id"     # Turn device off
st_status "device-id"       # Get device status
mcp_test_all                # Run all basic tests
```

See [Testing Guide](#testing-guide) for comprehensive testing documentation.

## Architecture

### Strict Type Safety

This project uses TypeScript strict mode with branded types for domain safety:

- **DeviceId**: Branded string type prevents mixing device IDs with regular strings
- **LocationId**: Branded type for SmartThings locations
- **CapabilityName**: Branded type for capability identifiers

### Error Handling

All MCP tools return structured error responses:

```typescript
{
  isError: true,
  code: "VALIDATION_ERROR" | "DEVICE_NOT_FOUND" | "SMARTTHINGS_API_ERROR" | ...,
  message: "Human-readable error message",
  details?: { /* Additional error context */ }
}
```

### Retry Logic

SmartThings API calls use exponential backoff retry:

- **Max Retries**: 3
- **Initial Delay**: 1 second
- **Backoff Multiplier**: 2x
- **Max Delay**: 30 seconds

Retries occur for:
- Network errors (ECONNRESET, ETIMEDOUT)
- HTTP 5xx server errors
- HTTP 429 rate limit errors

Non-retryable errors (fail immediately):
- HTTP 4xx client errors (except 429)
- Authentication failures
- Validation errors

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMARTTHINGS_PAT` | Yes | - | SmartThings Personal Access Token |
| `MCP_SERVER_NAME` | No | `smartthings-mcp` | MCP server name |
| `MCP_SERVER_VERSION` | No | `1.0.0` | MCP server version |
| `MCP_SERVER_PORT` | No | `3000` | HTTP server port (http mode only) |
| `NODE_ENV` | No | `development` | Node environment |
| `LOG_LEVEL` | No | `info` | Logging level (error, warn, info, debug) |
| `TRANSPORT_MODE` | No | `stdio` | Transport mode (stdio or http) |

## Troubleshooting

### "Environment validation failed: SMARTTHINGS_PAT is required"

- Ensure you've created a `.env` file with a valid `SMARTTHINGS_PAT`
- Verify the token is not empty or expired

### "Unauthorized" or "Forbidden" errors

- Check that your PAT has the required scopes: `r:devices:*` and `x:devices:*`
- Verify the token hasn't expired

### "Device not found"

- Ensure the device UUID is correct (use `list_devices` to verify)
- Check that the device is still registered in your SmartThings account

### No devices returned by `list_devices`

- Verify your SmartThings account has devices configured
- Check that your PAT has access to the correct location

## License

MIT

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass (`pnpm test`)
2. Code is properly formatted (`pnpm format`)
3. No linting errors (`pnpm lint`)
4. Type checking passes (`pnpm typecheck`)

## Testing Guide

This project provides multiple testing approaches to suit different workflows:

### 1. MCP Inspector (Recommended for Interactive Testing)

The official MCP Inspector provides a visual interface for testing:

```bash
pnpm build
ppnpm test:inspector
```

**Features:**
- Visual GUI for testing tools
- View JSON-RPC request/response messages
- Test with real SmartThings devices
- Schema validation and error inspection
- Opens at `http://localhost:6274`

**Use Cases:**
- Initial testing and debugging
- Interactive tool exploration
- Real device testing
- Protocol validation

### 2. Interactive Test Gateway (CLI REPL)

A command-line REPL for testing without a GUI:

```bash
ppnpm test-gateway
```

**Available Commands:**
```
Connection:
  connect              - Connect to MCP server
  disconnect           - Disconnect from server

MCP Protocol:
  tools                - List all available tools
  call <tool> <args>   - Call a tool with JSON arguments

SmartThings Shortcuts:
  devices              - List all devices
  status <deviceId>    - Get device status
  on <deviceId>        - Turn device on
  off <deviceId>       - Turn device off
  capabilities <id>    - Get device capabilities

Utility:
  help                 - Show commands
  clear                - Clear screen
  exit                 - Exit gateway
```

**Example Session:**
```bash
$ ppnpm test-gateway

mcp> connect
✓ Connected successfully!

mcp> devices
Found 3 device(s):
- Living Room Light (abc-123-...)
- Kitchen Switch (def-456-...)

mcp> on abc-123-...
✓ Device turned on successfully

mcp> exit
```

### 3. Shell Helper Functions

Quick one-liners for scripting and automation:

```bash
source tools/test-helpers.sh
```

**Core Functions:**
```bash
# MCP Protocol
mcp_initialize                      # Initialize MCP connection
mcp_list_tools                      # List all tools
mcp_call_tool <name> <args>         # Call any tool

# SmartThings
st_list_devices                     # List devices
st_turn_on <deviceId>               # Turn device on
st_turn_off <deviceId>              # Turn device off
st_status <deviceId>                # Get device status
st_capabilities <deviceId>          # Get capabilities

# Testing
mcp_test_all                        # Run all basic tests
st_test_device <deviceId>           # Test device control
mcp_test_errors                     # Test error handling
```

**Example Usage:**
```bash
# List devices
st_list_devices

# Control a device
st_turn_on "abc-123-device-id"
sleep 2
st_turn_off "abc-123-device-id"

# Run full test suite
mcp_test_all
```

### 4. Integration Tests (Automated)

Automated tests using Vitest and MCP SDK:

```bash
# Build server first
pnpm build

# Run integration tests
ppnpm test:integration
```

**Test Coverage:**
- MCP protocol compliance
- Tool listing and metadata
- Device query operations
- Device control operations
- Error handling and validation
- Concurrent execution
- Performance benchmarks

**Environment Variables:**
- `SMARTTHINGS_PAT`: Your SmartThings token (required)
- `TEST_DEVICE_ID`: Optional device ID for real device tests

### 5. Command-Line JSON-RPC Testing

Direct JSON-RPC testing via stdio:

```bash
# List tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
  node dist/index.js | jq

# List devices
echo '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"list_devices",
    "arguments":{}
  },
  "id":2
}' | node dist/index.js | jq

# Turn on device
echo '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"turn_on_device",
    "arguments":{"deviceId":"your-device-id"}
  },
  "id":3
}' | node dist/index.js | jq
```

### Testing Best Practices

**1. Use Test Environment**
- Create separate `.env.test` with test credentials
- Use different SmartThings PAT for testing
- Avoid testing on production devices

**2. Test Device Selection**
- Use non-critical devices for testing
- Document test device IDs in environment variables
- Consider using virtual devices or simulators

**3. CI/CD Integration**
```bash
# Example GitHub Actions workflow
pnpm build
pnpm typecheck
pnpm lint
ppnpm test:unit
ppnpm test:integration  # With test credentials
```

**4. Logging and Debugging**
```bash
# Enable debug logging
LOG_LEVEL=debug pnpm dev

# Capture logs separately
node dist/index.js 2>error.log | jq
```

### Test Project Structure

```
tests/
├── integration/
│   └── mcp-client.test.ts       # Integration tests with MCP SDK
├── unit/
│   └── error-handler.test.ts    # Unit tests
└── setup.ts                     # Test configuration

tools/
├── mcp-test-gateway.ts          # Interactive REPL client
└── test-helpers.sh              # Shell helper functions
```

## Support

For issues and questions:

1. Check the [SmartThings API Documentation](https://developer.smartthings.com/docs/api/public)
2. Review the [MCP SDK Documentation](https://modelcontextprotocol.io/)
3. Open an issue on GitHub

## Acknowledgments

- Built with [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- Powered by [@smartthings/core-sdk](https://www.npmjs.com/package/@smartthings/core-sdk)
- Inspired by the Model Context Protocol specification
