# MCP Testing Approaches and Gateway/Client Patterns Research

**Research Date**: November 25, 2025
**Ticket**: 4bfcd979-73bb-4098-8d09-2e2e1b9fc69c (MCP Smartthings - Medium Priority)
**Researcher**: Claude Code Research Agent
**Status**: Complete

---

## Executive Summary

This research investigates MCP (Model Context Protocol) testing methodologies and test gateway/client patterns for the SmartThings MCP server. Based on comprehensive analysis of official tools, community frameworks, and testing best practices, I recommend a **multi-layered testing approach** combining:

1. **MCP Inspector** (official tool) for interactive GUI-based testing
2. **Command-line stdio testing** with JSON-RPC for scripting and automation
3. **TypeScript Client SDK** for integration testing
4. **Unit tests** using Vitest for tool validation

The recommended **quick-start approach** for SmartThings MCP testing is to use MCP Inspector for immediate interactive testing while building out automated integration tests using the TypeScript SDK's `StdioClientTransport`.

---

## 1. Official MCP Client Libraries and Tools

### 1.1 MCP Inspector (Official Testing Tool)

**Repository**: https://github.com/modelcontextprotocol/inspector
**Documentation**: https://modelcontextprotocol.io/docs/tools/inspector
**NPM Package**: `@modelcontextprotocol/inspector`

#### Overview
MCP Inspector is the **primary official testing tool** for MCP servers, consisting of:
- **MCP Inspector Client (MCPI)**: React-based web UI for interactive testing
- **MCP Proxy (MCPP)**: Node.js protocol bridge supporting stdio, SSE, and streamable-http transports

#### Key Features
- **Zero Installation**: Runs directly via `npx` without permanent setup
- **Interactive Testing**: Visual interface for testing tools, resources, and prompts
- **Protocol Validation**: Validates schemas, response formats, and MCP compliance
- **Multiple Transports**: Supports stdio, HTTP with SSE, and streamable-http
- **Security**: Authentication via random session token
- **Configuration Storage**: Saves settings for different MCP servers

#### Installation & Usage

**Basic Usage (Stdio Transport)**:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

**For SmartThings MCP Server**:
```bash
# Build the server first
npm run build

# Launch inspector
npx @modelcontextprotocol/inspector node dist/index.js

# Access UI at http://localhost:6274
```

**CLI Mode (Programmatic Testing)**:
```bash
# List tools
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list

# Call a tool
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call \
  --tool-name list_devices \
  --tool-arg deviceId=some-id
```

#### Architecture
- **Web UI**: Port 6274 (localhost only)
- **Proxy Server**: Port 6277 (localhost only)
- **Authentication**: Random session token printed to console on startup

#### Recommended Use Cases for SmartThings MCP
- **Initial Testing**: Verify server starts and tools are discoverable
- **Interactive Debugging**: Test tool execution with real SmartThings devices
- **Schema Validation**: Ensure tool inputs/outputs match expected formats
- **Quick Iteration**: Rapid testing during development

---

### 1.2 Official TypeScript SDK (@modelcontextprotocol/sdk)

**Repository**: https://github.com/modelcontextprotocol/typescript-sdk
**NPM Package**: `@modelcontextprotocol/sdk` (v1.22.0 in current project)
**Documentation**: https://modelcontextprotocol.io/quickstart/client

#### Client API Overview

The SDK provides comprehensive client functionality for connecting to MCP servers:

**Basic Client Setup (Stdio Transport)**:
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Create transport
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js']
});

// Create client
const client = new Client({
  name: 'smartthings-test-client',
  version: '1.0.0'
});

// Connect to server
await client.connect(transport);
```

**Client Operations**:
```typescript
// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool({
  name: 'list_devices',
  arguments: {}
});

// List resources
const resources = await client.listResources();

// Read a resource
const resource = await client.readResource({
  uri: 'smartthings://devices'
});

// List prompts
const prompts = await client.listPrompts();

// Get a prompt
const prompt = await client.getPrompt({
  name: 'device_control',
  arguments: { deviceId: 'abc-123' }
});
```

#### Recommended Use Cases
- **Integration Testing**: Automated tests verifying MCP protocol compliance
- **Client Application Development**: Building applications that consume the MCP server
- **Custom Test Runners**: Script-based testing workflows
- **CI/CD Pipeline**: Automated testing in continuous integration

---

### 1.3 Official Python SDK (Alternative for Cross-Language Testing)

**Repository**: https://github.com/modelcontextprotocol/python-sdk
**PyPI Package**: `mcp`
**Documentation**: https://modelcontextprotocol.io/docs/develop/build-client

While the SmartThings MCP server is TypeScript-based, the Python SDK can be useful for:
- Cross-language validation testing
- Python-based automation scripts
- Learning MCP protocol patterns

**Basic Python Client Example**:
```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Create server parameters
server_params = StdioServerParameters(
    command="node",
    args=["dist/index.js"]
)

# Connect and test
async with stdio_client(server_params) as (read, write):
    async with ClientSession(read, write) as session:
        # Initialize connection
        await session.initialize()

        # List tools
        tools = await session.list_tools()
        print(f"Available tools: {tools}")

        # Call a tool
        result = await session.call_tool("list_devices", {})
        print(f"Result: {result}")
```

---

## 2. Testing Methods and Approaches

### 2.1 Interactive Testing with MCP Inspector

**Best For**: Manual testing, debugging, and exploratory testing

**Setup**:
```bash
# Terminal 1: Ensure server is built
npm run build

# Terminal 2: Launch inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

**Testing Workflow**:
1. **Connection Phase**:
   - Inspector spawns the server as a subprocess
   - Establishes stdio transport connection
   - Performs MCP initialization handshake

2. **Discovery Phase**:
   - Lists available tools via `tools/list`
   - Lists available resources via `resources/list`
   - Lists available prompts via `prompts/list`

3. **Execution Phase**:
   - Select tool from UI (e.g., `list_devices`)
   - Provide arguments (JSON format)
   - Execute and view results
   - Inspect request/response JSON-RPC messages

4. **Validation Phase**:
   - Verify tool execution succeeds
   - Check response format matches expected schema
   - Test error handling with invalid inputs

**SmartThings MCP Testing Scenarios**:
1. **Device Discovery**:
   - Call `list_devices` with no arguments
   - Verify device list returns valid JSON
   - Check device IDs and capabilities are present

2. **Device Control**:
   - Call `turn_on_device` with valid deviceId
   - Verify success message
   - Call `get_device_status` to confirm state change

3. **Error Handling**:
   - Call `turn_on_device` with invalid deviceId
   - Verify error response format
   - Check error codes match expected values

---

### 2.2 Command-Line Testing with JSON-RPC

**Best For**: Scripting, automation, quick validation

**Documentation**: https://blog.fka.dev/blog/2025-03-25-inspecting-mcp-servers-using-cli/

#### Basic Testing Commands

**List Tools**:
```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
  node dist/index.js | jq
```

**Call a Tool**:
```bash
echo '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"list_devices",
    "arguments":{}
  },
  "id":2
}' | node dist/index.js | jq
```

**Turn On Device**:
```bash
echo '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"turn_on_device",
    "arguments":{
      "deviceId":"YOUR_DEVICE_ID_HERE"
    }
  },
  "id":3
}' | node dist/index.js | jq
```

**Get Device Status**:
```bash
echo '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"get_device_status",
    "arguments":{
      "deviceId":"YOUR_DEVICE_ID_HERE"
    }
  },
  "id":4
}' | node dist/index.js | jq
```

#### Shell Helper Functions

Create a file `~/.mcp-helpers.sh`:

```bash
#!/bin/bash

# MCP Server Configuration
MCP_SERVER_CMD="node /Users/masa/Projects/mcp-smartthings/dist/index.js"

# List all MCP tools
mcp_list_tools() {
  echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
    $MCP_SERVER_CMD | jq '.result.tools[] | {name, description}'
}

# Call an MCP tool
mcp_call_tool() {
  local tool_name=$1
  local args=${2:-'{}'}

  echo "{
    \"jsonrpc\":\"2.0\",
    \"method\":\"tools/call\",
    \"params\":{
      \"name\":\"$tool_name\",
      \"arguments\":$args
    },
    \"id\":$(date +%s)
  }" | $MCP_SERVER_CMD | jq
}

# List SmartThings devices
st_list_devices() {
  mcp_call_tool "list_devices" "{}"
}

# Turn on a device
st_turn_on() {
  local device_id=$1
  mcp_call_tool "turn_on_device" "{\"deviceId\":\"$device_id\"}"
}

# Turn off a device
st_turn_off() {
  local device_id=$1
  mcp_call_tool "turn_off_device" "{\"deviceId\":\"$device_id\"}"
}

# Get device status
st_status() {
  local device_id=$1
  mcp_call_tool "get_device_status" "{\"deviceId\":\"$device_id\"}"
}
```

**Usage**:
```bash
# Source the helpers
source ~/.mcp-helpers.sh

# Use the functions
st_list_devices
st_turn_on "abc-123-device-id"
st_status "abc-123-device-id"
st_turn_off "abc-123-device-id"
```

#### Important Considerations

**CRITICAL: stdout Must Only Contain JSON-RPC Messages**

The stdio protocol expects:
- **One JSON object per line**
- **No embedded newlines within JSON**
- **No non-JSON output** (logging, debug prints, etc.)

**Logging Requirements**:
- All logging must go to **stderr**, not stdout
- Winston logger (already configured) correctly uses stderr
- Any console.log() statements will break stdio transport

**Example Debug Session**:
```bash
# Separate stdout (JSON-RPC) from stderr (logs)
node dist/index.js 2>error.log | jq

# Or view both separately
node dist/index.js 2>&1 | tee output.log | jq
```

---

### 2.3 Integration Testing with TypeScript SDK

**Best For**: Automated testing, CI/CD, regression testing

#### Test Structure

Create `/Users/masa/Projects/mcp-smartthings/tests/integration/mcp-client.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('MCP SmartThings Server Integration', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Create transport to server
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '../../dist/index.js')],
      env: {
        ...process.env,
        SMARTTHINGS_PAT: process.env.SMARTTHINGS_PAT || 'test-token',
        LOG_LEVEL: 'error', // Reduce log noise in tests
      }
    });

    // Create and connect client
    client = new Client({
      name: 'smartthings-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Server Capabilities', () => {
    it('should list available tools', async () => {
      const result = await client.listTools();

      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBeGreaterThan(0);

      // Verify expected tools exist
      const toolNames = result.tools.map(t => t.name);
      expect(toolNames).toContain('list_devices');
      expect(toolNames).toContain('turn_on_device');
      expect(toolNames).toContain('turn_off_device');
      expect(toolNames).toContain('get_device_status');
    });

    it('should list available resources', async () => {
      const result = await client.listResources();

      expect(result.resources).toBeDefined();
      // Add specific resource assertions based on implementation
    });

    it('should list available prompts', async () => {
      const result = await client.listPrompts();

      expect(result.prompts).toBeDefined();
      // Add specific prompt assertions based on implementation
    });
  });

  describe('Device Query Tools', () => {
    it('should list devices successfully', async () => {
      const result = await client.callTool({
        name: 'list_devices',
        arguments: {},
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);

      // Verify response format
      const content = result.content[0];
      expect(content.type).toBe('text');
      if (content.type === 'text') {
        expect(content.text).toContain('device');
      }
    });

    it('should get device status with valid deviceId', async () => {
      // First get a device to test with
      const listResult = await client.callTool({
        name: 'list_devices',
        arguments: {},
      });

      // Extract first device ID from response (implementation-specific)
      // This is a placeholder - adjust based on actual response format
      const deviceId = 'test-device-id'; // Replace with actual extraction logic

      const result = await client.callTool({
        name: 'get_device_status',
        arguments: { deviceId },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should return error for invalid deviceId', async () => {
      const result = await client.callTool({
        name: 'get_device_status',
        arguments: { deviceId: 'invalid-device-id-12345' },
      });

      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      // Verify error format matches expected structure
    });
  });

  describe('Device Control Tools', () => {
    // Note: These tests interact with real devices
    // Consider using test fixtures or mock devices for CI/CD

    it.skip('should turn on device successfully', async () => {
      const deviceId = process.env.TEST_DEVICE_ID;
      if (!deviceId) {
        console.warn('Skipping: TEST_DEVICE_ID not set');
        return;
      }

      const result = await client.callTool({
        name: 'turn_on_device',
        arguments: { deviceId },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.isError).toBeFalsy();
    });

    it.skip('should turn off device successfully', async () => {
      const deviceId = process.env.TEST_DEVICE_ID;
      if (!deviceId) {
        console.warn('Skipping: TEST_DEVICE_ID not set');
        return;
      }

      const result = await client.callTool({
        name: 'turn_off_device',
        arguments: { deviceId },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.isError).toBeFalsy();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required parameters', async () => {
      const result = await client.callTool({
        name: 'turn_on_device',
        arguments: {}, // Missing deviceId
      });

      expect(result.isError).toBe(true);
      // Verify error code and message
    });

    it('should handle invalid tool names', async () => {
      try {
        await client.callTool({
          name: 'non_existent_tool',
          arguments: {},
        });
        // Should throw or return error
        expect(true).toBe(false); // Fail if we reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
```

**Running Integration Tests**:
```bash
# Run all tests
npm test

# Run integration tests only
npm test -- tests/integration

# Run with coverage
npm run test:coverage
```

---

### 2.4 Unit Testing Tool Logic

**Best For**: Testing individual tool implementations, validation logic, error handling

The project already has a unit test example at `/tests/unit/error-handler.test.ts`. Follow similar patterns for tool-specific tests:

**Example Tool Unit Test** (`/tests/unit/tools/device-control.test.ts`):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

// Mock the SmartThings client
vi.mock('../../../src/smartthings/client.js', () => ({
  getSmartThingsClient: () => ({
    devices: {
      executeCommand: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
    }
  })
}));

describe('Device Control Tools', () => {
  describe('Input Validation', () => {
    it('should validate deviceId format', () => {
      const deviceIdSchema = z.string().min(1);

      expect(() => deviceIdSchema.parse('')).toThrow();
      expect(() => deviceIdSchema.parse('valid-id')).not.toThrow();
    });

    it('should reject invalid arguments', () => {
      // Test validation logic for tool arguments
    });
  });

  describe('Error Response Format', () => {
    it('should return structured error for API failures', () => {
      // Test error handling and formatting
    });

    it('should include proper error codes', () => {
      // Verify error codes match constants
    });
  });
});
```

---

## 3. Implementation Recommendations

### 3.1 Recommended Testing Strategy for SmartThings MCP

**Phase 1: Quick Start (Day 1)**
1. Use **MCP Inspector** for immediate interactive testing
2. Verify server starts and tools are discoverable
3. Test each tool manually with real SmartThings devices
4. Document any issues or unexpected behaviors

**Phase 2: Automation (Days 2-3)**
1. Create **shell helper functions** for common operations
2. Build **integration tests** using TypeScript SDK
3. Set up test fixtures or test devices
4. Add integration tests to CI/CD pipeline

**Phase 3: Comprehensive Coverage (Ongoing)**
1. Expand **unit tests** for edge cases
2. Add **error scenario testing**
3. Performance and load testing
4. Security and authentication testing

---

### 3.2 Custom Test Gateway/Client Implementation

For advanced use cases, you can build a custom test gateway:

**File**: `/tools/mcp-test-gateway.ts`

```typescript
#!/usr/bin/env node

/**
 * Interactive MCP Test Gateway
 *
 * A REPL-style test client for SmartThings MCP server.
 * Provides interactive commands for testing tools without GUI.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Command {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void>;
}

class MCPTestGateway {
  private client?: Client;
  private transport?: StdioClientTransport;
  private rl: readline.Interface;
  private commands: Map<string, Command>;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'mcp> ',
    });

    this.commands = new Map();
    this.registerCommands();
  }

  private registerCommands() {
    this.commands.set('connect', {
      name: 'connect',
      description: 'Connect to MCP server',
      handler: this.connect.bind(this),
    });

    this.commands.set('disconnect', {
      name: 'disconnect',
      description: 'Disconnect from MCP server',
      handler: this.disconnect.bind(this),
    });

    this.commands.set('list-tools', {
      name: 'list-tools',
      description: 'List available tools',
      handler: this.listTools.bind(this),
    });

    this.commands.set('call', {
      name: 'call',
      description: 'Call a tool: call <tool-name> <json-args>',
      handler: this.callTool.bind(this),
    });

    this.commands.set('help', {
      name: 'help',
      description: 'Show available commands',
      handler: this.showHelp.bind(this),
    });

    this.commands.set('exit', {
      name: 'exit',
      description: 'Exit the gateway',
      handler: this.exit.bind(this),
    });
  }

  private async connect(args: string[]): Promise<void> {
    if (this.client) {
      console.log('Already connected. Disconnect first.');
      return;
    }

    console.log('Connecting to SmartThings MCP server...');

    this.transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '../dist/index.js')],
      env: {
        ...process.env,
        LOG_LEVEL: 'error',
      }
    });

    this.client = new Client({
      name: 'mcp-test-gateway',
      version: '1.0.0',
    });

    try {
      await this.client.connect(this.transport);
      console.log('Connected successfully!');
    } catch (error) {
      console.error('Connection failed:', error);
      this.client = undefined;
      this.transport = undefined;
    }
  }

  private async disconnect(args: string[]): Promise<void> {
    if (!this.client) {
      console.log('Not connected.');
      return;
    }

    await this.client.close();
    this.client = undefined;
    this.transport = undefined;
    console.log('Disconnected.');
  }

  private async listTools(args: string[]): Promise<void> {
    if (!this.client) {
      console.log('Not connected. Use "connect" first.');
      return;
    }

    const result = await this.client.listTools();
    console.log('\nAvailable Tools:');
    result.tools.forEach(tool => {
      console.log(`\n- ${tool.name}`);
      console.log(`  Description: ${tool.description}`);
      console.log(`  Input Schema:`, JSON.stringify(tool.inputSchema, null, 2));
    });
  }

  private async callTool(args: string[]): Promise<void> {
    if (!this.client) {
      console.log('Not connected. Use "connect" first.');
      return;
    }

    if (args.length < 1) {
      console.log('Usage: call <tool-name> [<json-args>]');
      return;
    }

    const toolName = args[0];
    const toolArgs = args.length > 1 ? JSON.parse(args.slice(1).join(' ')) : {};

    console.log(`\nCalling tool: ${toolName}`);
    console.log('Arguments:', JSON.stringify(toolArgs, null, 2));

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: toolArgs,
      });

      console.log('\nResult:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error calling tool:', error);
    }
  }

  private async showHelp(args: string[]): Promise<void> {
    console.log('\nAvailable Commands:');
    this.commands.forEach(cmd => {
      console.log(`  ${cmd.name.padEnd(15)} - ${cmd.description}`);
    });
    console.log();
  }

  private async exit(args: string[]): Promise<void> {
    if (this.client) {
      await this.disconnect([]);
    }
    console.log('Goodbye!');
    process.exit(0);
  }

  async start() {
    console.log('MCP Test Gateway for SmartThings');
    console.log('Type "help" for available commands\n');

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const parts = line.trim().split(/\s+/);
      const cmdName = parts[0];
      const args = parts.slice(1);

      if (!cmdName) {
        this.rl.prompt();
        return;
      }

      const command = this.commands.get(cmdName);
      if (command) {
        try {
          await command.handler(args);
        } catch (error) {
          console.error('Command error:', error);
        }
      } else {
        console.log(`Unknown command: ${cmdName}`);
        console.log('Type "help" for available commands');
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.exit([]);
    });
  }
}

// Start the gateway
const gateway = new MCPTestGateway();
gateway.start();
```

**Usage**:
```bash
# Make executable
chmod +x tools/mcp-test-gateway.ts

# Run with tsx
npx tsx tools/mcp-test-gateway.ts

# Interactive session:
# mcp> connect
# mcp> list-tools
# mcp> call list_devices {}
# mcp> call turn_on_device {"deviceId":"abc-123"}
# mcp> disconnect
# mcp> exit
```

---

### 3.3 Testing Both Stdio and HTTP Transports

The SmartThings MCP server supports both stdio and HTTP/SSE transports.

**Testing Stdio Transport**:
```bash
# Already covered above - default mode
TRANSPORT_MODE=stdio npm run dev
```

**Testing HTTP Transport**:
```bash
# Set environment variable
TRANSPORT_MODE=http npm run dev

# Test with curl
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/list",
    "id":1
  }'
```

**TypeScript HTTP Client** (for testing HTTP transport):
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(
  new URL('http://localhost:3000/mcp')
);

const client = new Client({
  name: 'http-test-client',
  version: '1.0.0',
});

await client.connect(transport);
```

---

## 4. Alternative Testing Tools and Frameworks

### 4.1 mcp-use CLI

**Repository**: https://github.com/mcp-use/mcp-use-cli
**Description**: CLI tool for interacting with MCP servers using natural language

**Features**:
- Multiple LLM provider support (OpenAI, Anthropic, Google, Groq, Mistral)
- API key management
- Server management (add, connect, disconnect)
- Natural language interaction with tools

**Installation**:
```bash
npm install -g mcp-use-cli
```

**Usage**:
```bash
# Add MCP server
mcp-use server add smartthings node dist/index.js

# Connect to server
mcp-use server connect smartthings

# Use natural language to interact
mcp-use "list all my SmartThings devices"
mcp-use "turn on the living room light"
```

---

### 4.2 FastMCP Testing Patterns (Python)

**Repository**: https://github.com/jlowin/fastmcp
**Documentation**: https://gofastmcp.com/patterns/testing

While the SmartThings MCP server is TypeScript-based, FastMCP provides excellent testing patterns that can be adapted:

**In-Memory Testing** (Python example):
```python
import pytest
from fastmcp import FastMCP, Client

async def test_tool_execution():
    server = FastMCP("TestServer")

    @server.tool
    def calculate(x: int, y: int) -> int:
        return x + y

    async with Client(server) as client:
        result = await client.call_tool("calculate", {"x": 5, "y": 3})
        assert result[0].text == "8"
```

**Key Lessons for TypeScript Implementation**:
- In-memory transport for fast testing
- Fixture-based test organization
- Direct server-client binding without subprocess overhead

---

### 4.3 MCP Testing Framework

**Repository**: https://github.com/haakco/mcp-testing-framework

**Features**:
- Automated test generation
- Integration testing
- Cross-server compatibility validation
- Advanced mocking
- Coverage analysis
- Performance benchmarking

---

## 5. Quick-Start Testing Approach

### Step 1: Build the Server (1 minute)

```bash
cd /Users/masa/Projects/mcp-smartthings
npm run build
```

### Step 2: Interactive Testing with Inspector (5 minutes)

```bash
# Launch inspector
npx @modelcontextprotocol/inspector node dist/index.js

# Open browser to http://localhost:6274
# 1. Verify tools are listed
# 2. Test list_devices
# 3. Test turn_on_device with a real device
# 4. Verify error handling with invalid deviceId
```

### Step 3: Shell Script Testing (10 minutes)

```bash
# Create test script
cat > test-mcp.sh << 'EOF'
#!/bin/bash

SERVER="node /Users/masa/Projects/mcp-smartthings/dist/index.js"

echo "Testing list_devices..."
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_devices","arguments":{}},"id":1}' | \
  $SERVER | jq

echo -e "\nTesting invalid deviceId..."
echo '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"get_device_status",
    "arguments":{"deviceId":"invalid-id"}
  },
  "id":2
}' | $SERVER | jq
EOF

chmod +x test-mcp.sh
./test-mcp.sh
```

### Step 4: Add Integration Tests (30 minutes)

```bash
# Create integration test directory
mkdir -p tests/integration

# Create test file (use TypeScript example from Section 2.3)
# Add to package.json scripts:
# "test:integration": "vitest run tests/integration"

# Run tests
npm run test:integration
```

---

## 6. Best Practices and Recommendations

### 6.1 Testing Best Practices

1. **Separate Test Environments**:
   - Use different SmartThings PAT for testing
   - Consider test-only devices or sandbox accounts
   - Avoid testing on production devices

2. **Logging Discipline**:
   - All logs MUST go to stderr (already configured with Winston)
   - Never use console.log() in production code
   - Verify logs don't pollute stdio JSON-RPC stream

3. **Error Testing**:
   - Test all error codes (see `/src/config/constants.ts`)
   - Verify error response format matches MCP spec
   - Test network failures and timeouts

4. **CI/CD Integration**:
   - Run unit tests on every commit
   - Run integration tests on pull requests
   - Consider skipping device control tests in CI (use mocks)

5. **Test Data Management**:
   - Store test device IDs in environment variables
   - Use `.env.test` for test configuration
   - Document test prerequisites in README

### 6.2 Debugging Tips

**Enable Debug Logging**:
```bash
LOG_LEVEL=debug node dist/index.js
```

**Capture Request/Response Logs**:
```bash
# Use inspector to see JSON-RPC messages
npx @modelcontextprotocol/inspector node dist/index.js
# Check "Network" tab in browser DevTools
```

**Test Specific JSON-RPC Messages**:
```bash
# Create a test message file
cat > test-message.json << 'EOF'
{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"list_devices",
    "arguments":{}
  },
  "id":1
}
EOF

# Pipe to server
cat test-message.json | node dist/index.js | jq
```

---

## 7. Implementation Guidance

### 7.1 Project Integration

Add the following to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run tests/integration",
    "test:unit": "vitest run tests/unit",
    "test:inspector": "npx @modelcontextprotocol/inspector node dist/index.js"
  },
  "devDependencies": {
    "@modelcontextprotocol/sdk": "^1.22.0",
    "@vitest/coverage-v8": "^3.0.0",
    "vitest": "^3.0.0"
  }
}
```

### 7.2 Directory Structure

```
mcp-smartthings/
├── tests/
│   ├── integration/
│   │   ├── mcp-client.test.ts           # SDK-based tests
│   │   └── stdio-transport.test.ts       # Transport-specific tests
│   ├── unit/
│   │   ├── error-handler.test.ts         # Existing
│   │   ├── tools/
│   │   │   ├── device-control.test.ts    # Tool logic tests
│   │   │   └── device-query.test.ts
│   │   └── validation.test.ts
│   ├── fixtures/
│   │   ├── mock-devices.json             # Test data
│   │   └── test-responses.json
│   └── setup.ts                          # Existing
├── tools/
│   ├── mcp-test-gateway.ts               # Custom REPL client
│   └── test-helpers.sh                   # Shell helper functions
└── docs/
    └── testing/
        ├── TESTING.md                    # Testing guide
        └── test-scenarios.md             # Test case documentation
```

### 7.3 Environment Configuration

Create `.env.test`:

```bash
# SmartThings Test Configuration
SMARTTHINGS_PAT=your_test_pat_here
TEST_DEVICE_ID=test-device-uuid-here

# MCP Server Configuration
MCP_SERVER_NAME=smartthings-mcp-test
MCP_SERVER_VERSION=1.0.0
MCP_SERVER_PORT=3001
NODE_ENV=test
LOG_LEVEL=error
TRANSPORT_MODE=stdio
```

---

## 8. Key Takeaways

### Recommended Testing Approach

1. **Primary Tool**: **MCP Inspector** for interactive testing and debugging
2. **Automation**: **TypeScript SDK** with Vitest for integration tests
3. **Quick Tests**: **Command-line JSON-RPC** with shell helpers
4. **Advanced**: **Custom test gateway** for specialized workflows

### Critical Success Factors

1. **Logging to stderr only** - Already configured with Winston
2. **Test device isolation** - Use separate PAT and devices for testing
3. **Comprehensive error testing** - Test all error codes and edge cases
4. **CI/CD integration** - Automate testing in deployment pipeline

### Quick Start Commands

```bash
# Interactive testing (recommended for Day 1)
npx @modelcontextprotocol/inspector node dist/index.js

# Shell-based testing
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js | jq

# Integration testing
npm run test:integration
```

---

## 9. References and Resources

### Official Documentation
- **MCP Specification**: https://modelcontextprotocol.io/specification/2025-03-26/basic
- **MCP Inspector**: https://modelcontextprotocol.io/docs/tools/inspector
- **TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **Python SDK**: https://github.com/modelcontextprotocol/python-sdk

### Testing Guides
- **CLI Testing with jq**: https://blog.fka.dev/blog/2025-03-25-inspecting-mcp-servers-using-cli/
- **FastMCP Testing**: https://gofastmcp.com/patterns/testing
- **Unit Testing Guide**: https://mcpcat.io/guides/writing-unit-tests-mcp-servers/
- **Integration Testing**: https://mcpcat.io/guides/integration-tests-mcp-flows/

### Tools and Libraries
- **MCP Inspector**: https://github.com/modelcontextprotocol/inspector
- **mcp-use CLI**: https://github.com/mcp-use/mcp-use-cli
- **MCP Testing Framework**: https://github.com/haakco/mcp-testing-framework
- **FastMCP**: https://github.com/jlowin/fastmcp

### Community Resources
- **Real Python MCP Client Tutorial**: https://realpython.com/python-mcp-client/
- **Testing Best Practices**: https://www.merge.dev/blog/mcp-server-testing
- **MCP Server Testing Guide**: https://www.stainless.com/mcp/how-to-test-mcp-servers

---

## 10. Next Steps

### Immediate Actions (Day 1)

1. **Run MCP Inspector**:
   ```bash
   npx @modelcontextprotocol/inspector node dist/index.js
   ```

2. **Create shell helpers** in `tools/test-helpers.sh`

3. **Test all tools manually** with real devices

### Short-Term (Week 1)

1. **Create integration test suite** using TypeScript SDK
2. **Set up CI/CD pipeline** with automated tests
3. **Document test scenarios** and expected behaviors
4. **Build custom test gateway** for team use

### Long-Term (Ongoing)

1. **Expand test coverage** to edge cases and error scenarios
2. **Performance testing** with multiple concurrent requests
3. **Security testing** for authentication and authorization
4. **Load testing** for production readiness

---

## Appendix A: JSON-RPC Message Examples

### Initialize Connection
```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "test-client",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

### List Tools
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 2
}
```

### Call Tool
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_devices",
    "arguments": {}
  },
  "id": 3
}
```

### Expected Response Format
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 5 device(s):\n\n- Living Room Light (abc-123-...)"
      }
    ]
  },
  "id": 3
}
```

### Error Response Format
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "isError": true,
      "code": "VALIDATION_ERROR",
      "details": {}
    }
  },
  "id": 3
}
```

---

**Research Complete**: November 25, 2025
**Document Version**: 1.0
**Next Review**: Upon implementation feedback
