# MCP SmartThings Server

> **Unified Smart Home Control Platform**
> A dual-mode server providing both Model Context Protocol (MCP) integration for AI assistants and Alexa Custom Skill support, with a powerful unified capability system for cross-platform device management.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6%2B-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)

---

## 🎯 What is mcp-smartthings?

**mcp-smartthings** is a comprehensive smart home integration server that bridges AI assistants and voice assistants with your home automation devices. It provides:

- 🤖 **MCP Server** for Claude AI and other LLM-based assistants
- 🗣️ **Alexa Custom Skill** for natural language voice control
- 🔄 **Unified Capability System** normalizing SmartThings, Tuya, and Lutron devices
- 🛡️ **Type-Safe Architecture** with TypeScript strict mode and branded types
- ⚡ **Production-Ready** with automatic retries, structured logging, and comprehensive testing

**Use Cases:**
- Control your smart home through Claude Desktop using natural language
- Build custom automation workflows with AI assistance
- Voice control via Alexa with conversational AI (LLM-powered responses)
- Manage devices across multiple platforms (SmartThings, Tuya, Lutron) with a single interface
- Develop smart home applications with a type-safe, well-documented API

---

## ✨ Features

### 🤖 MCP Server Capabilities
- **Device Discovery & Control** - List, query, and control all SmartThings devices
- **Scene Management** - Execute and manage SmartThings scenes
- **Room Organization** - Filter devices and scenes by room/location
- **Real-Time Status** - Get current device states and sensor readings
- **Multiple Transports** - Supports stdio (CLI) and HTTP/SSE (web)
- **MCP Protocol 1.22.0** - Full compliance with latest MCP specification

### 🗣️ Alexa Integration
- **Custom Skill Support** - Natural language voice control powered by LLM
- **Conversational AI** - Context-aware responses via ChatOrchestrator
- **MCP Tool Execution** - Alexa requests execute MCP tools under the hood
- **Easy Setup** - Quick deployment with ngrok for development/testing

### 🔄 Unified Capability System

The heart of mcp-smartthings is a **platform-agnostic capability abstraction** that normalizes device control across multiple smart home platforms:

**Key Features:**
- **31 Unified Capabilities** - 11 Control + 15 Sensor + 5 Composite capabilities
- **3 Platform Support** - SmartThings (100%), Tuya (96%), Lutron (19%)
- **Automatic Value Conversion** - Brightness, color, and format normalization
- **Runtime Detection** - Type-safe capability queries and feature detection
- **Bidirectional Mapping** - Seamless platform ↔ unified format translation
- **Event-Based Architecture** - Support for real-time device events

**Platform Coverage:**

| Platform | Capabilities | Coverage | Notable Features |
|----------|-------------|----------|------------------|
| **SmartThings** | 31/31 | 100% | Full smart home automation ecosystem |
| **Tuya** | 30/31 | 96% | Wide device availability (missing OCCUPANCY_SENSOR) |
| **Lutron** | 6/31 | 19% | Premium lighting and shading specialist |

**Example Usage:**
```typescript
import { DeviceCapability, hasCapability } from './types/unified-device.js';

// Check if device supports dimming (works across all platforms)
if (hasCapability(device, DeviceCapability.DIMMER)) {
  // Set brightness to 50% - automatically converts to platform format
  // Tuya: 500 (0-1000 scale)
  // SmartThings: 50 (0-100 scale)
  // Lutron: 50.00 (precision format)
  await device.capabilities.dimmer.commands.setLevel(50);
}
```

### 🛡️ Developer Experience
- **TypeScript 5.6+** - Strict mode with branded types for domain safety
- **Comprehensive Testing** - Unit, integration, and E2E test suites
- **Rich Documentation** - Extensive guides, API references, and examples
- **Developer Tools** - Interactive REPL, MCP Inspector, shell helpers
- **Structured Logging** - Winston with JSON format for production monitoring
- **Error Handling** - Resilient with automatic retry and exponential backoff

---

## 🏗️ Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Claude AI    │  │ Alexa Skill  │  │ Custom Apps  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          │ MCP Protocol     │ Custom Skill     │ HTTP/SSE
          │                  │ API              │
┌─────────▼──────────────────▼──────────────────▼─────────────┐
│                    MCP SmartThings Server                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              MCP Tools & Endpoints                     │ │
│  │  • Device Control  • Scene Management  • Status Query │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │            Layer 2: Unified Capabilities               │ │
│  │  • Type-Safe Interfaces  • Value Conversion           │ │
│  │  • Runtime Detection     • Event Handling             │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │            Layer 1: Platform Adapters                  │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │  │ SmartThings  │ │     Tuya     │ │    Lutron    │  │ │
│  │  │   Adapter    │ │   Adapter    │ │   Adapter    │  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Smart Home Platforms                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ SmartThings  │ │  Tuya Cloud  │ │Lutron Caséta │        │
│  │     API      │ │     API      │ │     API      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Layer 2 Abstraction: Unified Capabilities

The **Layer 2 abstraction** provides a platform-agnostic interface for device control:

**Core Components:**
- **Capability Definitions** - 31 standardized capabilities (Switch, Dimmer, Thermostat, etc.)
- **Value Converters** - Automatic normalization of brightness, temperature, color formats
- **Type System** - TypeScript interfaces with branded types for compile-time safety
- **Runtime Detection** - `hasCapability()` function for safe feature queries

**Value Conversion Examples:**
```typescript
// Brightness (Dimmer capability)
SmartThings: 0-100    →  Unified: 0-100  →  Tuya: 0-1000
SmartThings: 75       →  Unified: 75     →  Tuya: 750

// Color Temperature (Color Temperature capability)
SmartThings: 2700K    →  Unified: 2700K  →  Tuya: 370 mireds
Tuya: 370 mireds      →  Unified: 2700K  →  SmartThings: 2700K

// Temperature (Temperature Measurement capability)
SmartThings: 72°F     →  Unified: 22.2°C →  Tuya: 22.2°C
```

**Platform Registry:**
The `PlatformRegistry` manages multiple platform adapters and routes requests to the appropriate platform based on device context.

---

## 📋 Prerequisites

- **Node.js** 18.0.0 or higher
- **pnpm** 9.0.0 or higher (recommended package manager)
- **SmartThings Account** with at least one device configured
- **SmartThings Personal Access Token (PAT)** - Required for API authentication
- **OpenRouter API Key** (optional) - For chatbot interface
- **ngrok Account** (optional) - For Alexa Custom Skill development

---

## 🚀 Getting Started

### 1. Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install
```

### 2. Get SmartThings Personal Access Token (PAT)

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

---

## 🎮 Usage Modes

### Mode 1: MCP Server for Claude Desktop

Configure Claude Desktop to use mcp-smartthings as an MCP server:

**Add to your Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "smartthings": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-smartthings/dist/index.js"],
      "env": {
        "SMARTTHINGS_PAT": "your_smartthings_token_here"
      }
    }
  }
}
```

**Example Conversation with Claude:**
```
You: Turn on the living room lights
Claude: I'll turn on the living room lights for you.
        [Uses turn_on_device tool]
        ✓ Living room lights are now on.

You: What devices are in my bedroom?
Claude: Let me check your bedroom devices.
        [Uses list_devices_by_room tool]
        Found 3 devices in your bedroom:
        - Bedroom Light (dimmable)
        - Ceiling Fan
        - Temperature Sensor
```

### Mode 2: Alexa Custom Skill

Run the Alexa server to enable voice control:

```bash
# Start Alexa server
pnpm alexa-server

# In another terminal, expose via ngrok
ngrok http 3000
```

**Configure Alexa Developer Console:**
1. Create a new Custom Skill
2. Set endpoint URL to your ngrok URL + `/alexa`
3. Use provided intent schema
4. Test with Alexa app or device

**Example Voice Commands:**
```
"Alexa, ask SmartThings to turn on the living room lights"
"Alexa, ask SmartThings what's the temperature in the bedroom"
"Alexa, ask SmartThings to dim the kitchen lights to 30 percent"
```

See [Alexa Quick Start Guide](docs/setup/ALEXA_CUSTOM_SKILL_QUICK_START.md) for detailed setup.

### Mode 3: Interactive Chatbot (Development)

Run the built-in chatbot for testing:

```bash
# Start chatbot (requires OPENROUTER_API_KEY in .env.local)
pnpm chat
```

**Configuration** (`.env.local`):
```env
SMARTTHINGS_PAT=your_smartthings_token_here
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key_here
```

**Example Session:**
```
You: Turn on the living room lights
Bot: I'll turn on the living room lights for you.
     ✓ Device turned on successfully.

You: What's the temperature in the bedroom?
Bot: The bedroom temperature sensor reads 72°F (22°C).
```

---

## 🔧 Available MCP Tools

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

#### `list_devices_by_room`
List all SmartThings devices in a specific room.

**Input:**
```json
{
  "roomName": "Living Room"  // Required
}
```

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
List all SmartThings scenes accessible with the configured token. Optionally filter by room name.

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

#### `list_scenes_by_room`
List all SmartThings scenes for a specific room.

**Input:**
```json
{
  "roomName": "Living Room"  // Required
}
```

#### `execute_scene`
Execute a SmartThings scene by ID or name.

**Input (by UUID):**
```json
{
  "sceneId": "scene-uuid-here"
}
```

**Input (by name):**
```json
{
  "sceneName": "Movie Night"  // Case-insensitive
}
```

**Output:**
```
Scene "Movie Night" executed successfully.
Scene ID: scene-uuid-here
```

---

## 🧪 Testing

The project provides comprehensive testing tools:

### 1. MCP Inspector (Recommended)

Visual GUI for testing MCP tools:

```bash
pnpm build
pnpm test:inspector
```

Opens at `http://localhost:6274` with:
- Visual interface for testing tools
- JSON-RPC request/response viewer
- Real device testing
- Schema validation

### 2. Interactive Test Gateway (CLI REPL)

Command-line REPL for testing:

```bash
pnpm test-gateway
```

**Available Commands:**
```
mcp> connect              # Connect to MCP server
mcp> devices              # List all devices
mcp> status <deviceId>    # Get device status
mcp> on <deviceId>        # Turn device on
mcp> off <deviceId>       # Turn device off
mcp> help                 # Show commands
mcp> exit                 # Exit gateway
```

### 3. Unit & Integration Tests

Automated test suites:

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests (requires built server)
pnpm build
pnpm test:integration

# Run tests with coverage
pnpm test:coverage
```

### 4. Shell Helper Functions

Quick one-liners for scripting:

```bash
source tools/test-helpers.sh

# List devices
st_list_devices

# Control a device
st_turn_on "abc-123-device-id"
st_turn_off "abc-123-device-id"

# Run full test suite
mcp_test_all
```

See [Testing Quick Start](docs/testing/TESTING_QUICK_START.md) for comprehensive testing guide.

---

## 📚 Documentation

Comprehensive documentation is available in the [docs/](docs/) directory:

### Capability System
- **[Capability Mapping Guide](docs/capability-mapping-guide.md)** - Complete reference for all 31 capabilities, platform mappings, and value conversions
- **[Quick Reference Card](docs/capability-quick-reference.md)** - Cheat sheet for common operations and platform support

### Setup & Configuration
- **[Alexa Quick Start](docs/setup/ALEXA_CUSTOM_SKILL_QUICK_START.md)** - Set up Alexa Custom Skill integration
- **[Diagnostic Tools Setup](docs/setup/DIAGNOSTIC_TOOLS_GUIDE.md)** - Configure diagnostic and debugging tools
- **[ngrok Configuration](docs/setup/NGROK_QUICKSTART.md)** - Set up ngrok for local development

### Implementation Guides
- **[Alexa Custom Skill](docs/implementation/ALEXA_CUSTOM_SKILL_IMPLEMENTATION.md)** - Detailed Alexa integration guide
- **[Chatbot Interface](docs/implementation/CHATBOT_IMPLEMENTATION.md)** - Build chatbot interfaces
- **[Diagnostic Tools](docs/implementation/DIAGNOSTIC_TOOLS_IMPLEMENTATION.md)** - Diagnostic tool development

### Testing & Quality
- **[Testing Quick Start](docs/testing/TESTING_QUICK_START.md)** - Quick start testing guide
- **[Verification Checklist](docs/testing/VERIFICATION_CHECKLIST.md)** - Pre-release verification steps
- **[QA Reports](docs/qa/)** - Quality assurance documentation

### Research & Architecture
- **[Research](docs/research/)** - Technical research and analysis documents

For a complete index, see [docs/README.md](docs/README.md).

---

## 🎯 Key Differentiators

### What Makes mcp-smartthings Unique?

1. **Dual-Mode Operation**
   - Same codebase serves both MCP protocol and Alexa Custom Skill
   - Unified capability system works across both modes
   - Consistent device control regardless of interface

2. **Type-Safe Capability System**
   - Compile-time safety with TypeScript strict mode
   - Branded types prevent domain errors (mixing device IDs, capability names)
   - Runtime capability detection with `hasCapability()`
   - Automatic value conversion between platform formats

3. **Cross-Platform Abstraction**
   - Single API for SmartThings, Tuya, and Lutron devices
   - Platform-agnostic capability definitions
   - Seamless bidirectional value mapping
   - Future-proof design for adding new platforms

4. **Production-Ready Architecture**
   - Automatic retry with exponential backoff
   - Structured logging with Winston (JSON format)
   - Comprehensive error handling
   - Extensive test coverage (unit + integration)

5. **Developer-Friendly**
   - Rich documentation with examples
   - Interactive testing tools (REPL, Inspector, shell helpers)
   - Type definitions for all APIs
   - Clear contribution guidelines

---

## 🔐 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMARTTHINGS_PAT` | Yes | - | SmartThings Personal Access Token |
| `MCP_SERVER_NAME` | No | `smartthings-mcp` | MCP server name |
| `MCP_SERVER_VERSION` | No | `1.0.0` | MCP server version |
| `MCP_SERVER_PORT` | No | `3000` | HTTP server port (http mode only) |
| `NODE_ENV` | No | `development` | Node environment |
| `LOG_LEVEL` | No | `info` | Logging level (error, warn, info, debug) |
| `TRANSPORT_MODE` | No | `stdio` | Transport mode (stdio or http) |
| `OPENROUTER_API_KEY` | No | - | OpenRouter API key for chatbot (optional) |

---

## 🛠️ Development

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

### Project Structure

```
mcp-smartthings/
├── src/
│   ├── index.ts                    # Main MCP server entry point
│   ├── cli/
│   │   ├── chat.ts                 # Interactive chatbot
│   │   └── alexa-server.ts         # Alexa Custom Skill server
│   ├── mcp/
│   │   ├── server.ts               # MCP server implementation
│   │   └── tools/                  # MCP tool definitions
│   ├── lib/
│   │   ├── layer2/                 # Unified capability system
│   │   │   ├── registry.ts         # Platform registry
│   │   │   ├── converters/         # Value converters
│   │   │   └── capabilities/       # Capability definitions
│   │   ├── adapters/               # Platform adapters
│   │   │   ├── smartthings/        # SmartThings adapter
│   │   │   ├── tuya/               # Tuya adapter
│   │   │   └── lutron/             # Lutron adapter
│   │   └── smartthings-client.ts   # SmartThings API client
│   └── types/
│       ├── unified-device.ts       # Unified type definitions
│       └── branded.ts              # Branded type utilities
├── docs/                           # Documentation
├── tests/                          # Test suites
│   ├── unit/                       # Unit tests
│   └── integration/                # Integration tests
├── tools/                          # Development tools
│   ├── mcp-test-gateway.ts         # Interactive REPL
│   └── test-helpers.sh             # Shell helper functions
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🐛 Troubleshooting

### "Environment validation failed: SMARTTHINGS_PAT is required"

- Ensure you've created a `.env` file with a valid `SMARTTHINGS_PAT`
- Verify the token is not empty or expired

### "Unauthorized" or "Forbidden" errors

- Check that your PAT has the required scopes:
  - `r:devices:*` and `x:devices:*`
  - `r:scenes:*` and `x:scenes:*`
  - `r:locations:*`
- Verify the token hasn't expired

### "Device not found"

- Ensure the device UUID is correct (use `list_devices` to verify)
- Check that the device is still registered in your SmartThings account

### No devices returned by `list_devices`

- Verify your SmartThings account has devices configured
- Check that your PAT has access to the correct location

---

## 🤝 Contributing

Contributions are welcome! Please ensure:

1. All tests pass (`pnpm test`)
2. Code is properly formatted (`pnpm format`)
3. No linting errors (`pnpm lint`)
4. Type checking passes (`pnpm typecheck`)

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

MIT - See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built with:
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - MCP protocol implementation
- [@smartthings/core-sdk](https://www.npmjs.com/package/@smartthings/core-sdk) - SmartThings API client
- [Fastify](https://www.fastify.io/) - HTTP server for Alexa integration
- [Winston](https://github.com/winstonjs/winston) - Logging framework

Inspired by:
- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP specification
- [SmartThings API](https://developer.smartthings.com/docs/api/public) - SmartThings Developer Documentation

---

## 📞 Support

For issues and questions:

1. Check the [SmartThings API Documentation](https://developer.smartthings.com/docs/api/public)
2. Review the [MCP SDK Documentation](https://modelcontextprotocol.io/)
3. Search existing [GitHub Issues](https://github.com/bobmatnyc/mcp-smartthings/issues)
4. Open a new issue with detailed description and logs

---

**Made with ❤️ for the smart home and AI communities**
