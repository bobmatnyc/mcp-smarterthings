# MCP SmartThings Server - Architecture Research

**Research Date:** 2025-11-25
**Ticket:** 4bfcd979-73bb-4098-8d09-2e2e1b9fc69c (MCP Smartthings)
**Status:** Epic - Open
**Priority:** Medium

---

## Executive Summary

This research provides comprehensive technical requirements and architectural recommendations for building an MCP (Model Context Protocol) server that integrates with SmartThings home automation systems using TypeScript. The analysis covers MCP specification compliance, SmartThings API integration patterns, project structure recommendations, and production-ready implementation strategies.

### Key Findings

1. **MCP Architecture**: MCP is an open protocol (introduced Nov 2024, adopted by OpenAI March 2025) using JSON-RPC 2.0 for LLM-to-tool communication
2. **Official TypeScript SDK**: `@modelcontextprotocol/sdk` v1.22.0 provides production-ready server implementation
3. **SmartThings SDK**: `@smartthings/core-sdk` offers TypeScript/Node.js API wrapper with OAuth2 and PAT authentication
4. **Testing Framework**: Vitest recommended over Jest for native ESM/TypeScript support
5. **Critical Update**: SmartThings PATs now expire after 24 hours (changed Dec 30, 2024)

---

## 1. MCP Server Architecture

### 1.1 Protocol Overview

**Official Specification:** https://modelcontextprotocol.io/specification/2025-06-18

**Architecture Model:**
- **Hosts**: LLM applications (Claude Desktop, ChatGPT, etc.)
- **Clients**: Connectors within the host application
- **Servers**: Services providing context and capabilities (our SmartThings integration)

**Protocol Foundation:**
- Based on JSON-RPC 2.0 messaging
- Stateful connections with capability negotiation
- Inspired by Language Server Protocol (LSP) architecture
- RFC 2119 standards for requirement keywords

### 1.2 Core Primitives

**Server-Side Features (What we'll implement):**

1. **Resources**: Read-only context and data
   - Example: List of SmartThings devices, device status
   - Similar to REST GET operations
   - URI templating support for dynamic resources

2. **Tools**: Executable functions for LLM actions
   - Example: Turn on lights, set thermostat temperature
   - Similar to REST POST/PUT/DELETE operations
   - Input/output schema validation with Zod

3. **Prompts**: Templated messages and workflows
   - Example: "Control bedroom lights" prompt template
   - Optional but useful for common automation scenarios

**Client-Side Features (MCP host provides these):**
- **Sampling**: LLM agentic behaviors
- **Roots**: Filesystem/URI boundary queries
- **Elicitation**: User information requests

### 1.3 Recent Updates (June 2025)

**OAuth Resource Server Classification:**
- MCP servers now officially classified as OAuth Resource Servers
- Resource Indicators required to prevent malicious token access
- Enhanced security model for authorization flows

### 1.4 Transport Mechanisms

**Supported Transports:**

1. **Stdio** (Standard Input/Output)
   - Server runs as subprocess
   - Communication via stdin/stdout streams
   - Best for CLI integration and local development

2. **Streamable HTTP**
   - Request-response over HTTP endpoints
   - Each request uses new transport instance (prevents ID collision)
   - Best for remote server deployment

3. **SSE** (Server-Sent Events)
   - Persistent event streaming connections
   - Best for long-lived connections

**Recommendation for SmartThings:** Use Streamable HTTP for production deployment, Stdio for development/testing.

---

## 2. SmartThings Integration

### 2.1 SmartThings Core SDK

**Official Repository:** https://github.com/SmartThingsCommunity/smartthings-core-sdk
**NPM Package:** `@smartthings/core-sdk`
**Status:** Early development (breaking changes possible)

**Key Features:**
- TypeScript/JavaScript API wrapper
- Comprehensive device management
- Location and capability queries
- OAuth2 and PAT authentication
- Automatic token refresh

### 2.2 Authentication Methods

**1. Personal Access Token (PAT) - Recommended for Initial Development**

**PAT Generation:**
- URL: https://account.smartthings.com/tokens
- Sign in with Samsung account
- Click "Generate new token"
- Select required OAuth2 scopes/permissions

**CRITICAL CHANGE (Dec 30, 2024):**
- PATs now expire after 24 hours (previously up to 50 years)
- Old PATs (pre-Dec 30, 2024) may still have long expiration
- Must implement token refresh or rotation strategy

**Usage Example:**
```typescript
import { SmartThingsClient, BearerTokenAuthenticator } from '@smartthings/core-sdk';

const client = new SmartThingsClient(
  new BearerTokenAuthenticator(process.env.SMARTTHINGS_PAT)
);

// List locations
const locations = await client.locations.list();
console.log(`Found ${locations.length} locations`);
```

**2. OAuth2 Authorization Code Flow - Required for Production**

**When to Use OAuth2:**
- Developing integration for multiple users
- Building public/commercial application
- Requiring user consent for data access

**OAuth2 Setup:**
1. Create API App at SmartThings Developer Portal
2. Select "OAuth-In App" type
3. Obtain `clientId` and `clientSecret` (save securely - shown once)
4. Implement authorization redirect flow
5. Exchange authorization code for access token

**OAuth2 Implementation:**
```typescript
import { SmartThingsClient, RefreshTokenAuthenticator } from '@smartthings/core-sdk';

const client = new SmartThingsClient(
  new RefreshTokenAuthenticator(
    bearerToken,
    refreshTokenStore // Implements token storage/retrieval
  )
);
```

**Alternative: SequentialRefreshTokenAuthenticator**
- Sequential approach for token refresh
- Prevents race conditions in high-concurrency scenarios

### 2.3 SmartThings Device Capabilities

**Capability Model:**
- Applications interact with devices via capabilities
- Capabilities decompose into Commands and Attributes
- Commands: Control/actuate device
- Attributes: Device state/properties

**Common Capabilities for MCP Implementation:**

| Capability | Commands | Attributes | Use Case |
|------------|----------|------------|----------|
| **Switch** | `on()`, `off()` | `switch` (on/off) | Basic on/off control |
| **Light** | `on()`, `off()`, `setLevel(level)` | `switch`, `level` | Dimmable lights |
| **Thermostat** | `setHeatingSetpoint(temp)`, `setCoolingSetpoint(temp)` | `temperature`, `heatingSetpoint`, `coolingSetpoint` | Climate control |
| **Temperature Measurement** | None | `temperature` | Temperature sensors |
| **Motion Sensor** | None | `motion` (active/inactive) | Motion detection |
| **Contact Sensor** | None | `contact` (open/closed) | Door/window sensors |
| **Lock** | `lock()`, `unlock()` | `lock` (locked/unlocked) | Smart locks |

**Official Capabilities Reference:**
- Production: https://developer.smartthings.com/docs/devices/capabilities/capabilities-reference
- Classic Docs: https://docs.smartthings.com/en/latest/capabilities-reference.html

**Device Control Pattern:**
```typescript
// Get devices
const devices = await client.devices.list();

// Execute command
await client.devices.executeCommand(
  deviceId,
  {
    capability: 'switch',
    command: 'on',
    arguments: []
  }
);

// Read attribute
const status = await client.devices.getStatus(deviceId);
const switchState = status.components.main.switch.switch.value;
```

### 2.4 SmartThings API Endpoints

**Key API Operations for MCP Server:**

1. **Device Discovery:**
   - `client.devices.list()` - Get all devices
   - `client.devices.get(deviceId)` - Get specific device
   - `client.devices.getStatus(deviceId)` - Get device status

2. **Device Control:**
   - `client.devices.executeCommand(deviceId, command)` - Execute capability command
   - `client.devices.executeCommands(deviceId, commands)` - Batch commands

3. **Location Management:**
   - `client.locations.list()` - Get locations
   - `client.locations.get(locationId)` - Get location details

4. **Capabilities:**
   - Query device capabilities
   - Validate commands against capability schema

---

## 3. TypeScript MCP Server Implementation

### 3.1 Official TypeScript SDK

**Repository:** https://github.com/modelcontextprotocol/typescript-sdk
**NPM Package:** `@modelcontextprotocol/sdk` (latest: v1.22.0)
**Peer Dependency:** `zod` v3.25+ (imports from `zod/v4`)

**Installation:**
```bash
npm install @modelcontextprotocol/sdk zod
```

### 3.2 Quick Start Example

```typescript
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import * as z from 'zod/v4';

// Create MCP server
const server = new McpServer({
  name: 'smartthings-mcp',
  version: '1.0.0'
});

// Register a tool
server.registerTool('turn_on_device', {
  title: 'Turn On Device',
  description: 'Turn on a SmartThings device',
  inputSchema: {
    deviceId: z.string().describe('Device ID to control')
  },
  outputSchema: {
    success: z.boolean(),
    message: z.string()
  }
}, async ({ deviceId }) => {
  // SmartThings API call here
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ success: true, message: 'Device turned on' })
    }],
    structuredContent: { success: true, message: 'Device turned on' }
  };
});

// HTTP transport
const app = express();
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000);
```

### 3.3 Core SDK Classes

**McpServer**
- Central protocol interface
- Manages connections and protocol compliance
- Routes messages between client and handlers
- Methods: `registerTool()`, `registerResource()`, `registerPrompt()`, `connect(transport)`

**ResourceTemplate**
- Dynamic resource patterns with URI templating
- Parameter completion support
- Example: `smartthings://devices/{deviceId}/status`

**Transport Classes**
- `StreamableHTTPServerTransport` - HTTP endpoints
- `StdioServerTransport` - stdio communication
- SSE transport (via separate package)

### 3.4 Zod Schema Validation

**Input/Output Validation:**
```typescript
// Tool input schema
const deviceControlSchema = {
  deviceId: z.string().uuid(),
  capability: z.enum(['switch', 'light', 'thermostat']),
  command: z.string(),
  arguments: z.array(z.any()).optional()
};

// Tool output schema
const deviceResponseSchema = {
  success: z.boolean(),
  deviceId: z.string(),
  status: z.object({
    capability: z.string(),
    attribute: z.string(),
    value: z.any()
  }).optional(),
  error: z.string().optional()
};
```

---

## 4. Recommended Project Structure

### 4.1 Directory Layout

```
mcp-smartthings/
├── src/
│   ├── index.ts                    # Server entry point
│   ├── server.ts                   # MCP server configuration
│   ├── config/
│   │   ├── environment.ts          # Environment variables
│   │   └── constants.ts            # App constants
│   ├── smartthings/
│   │   ├── client.ts               # SmartThings API client
│   │   ├── auth.ts                 # Authentication handlers
│   │   └── capabilities/
│   │       ├── switch.ts           # Switch capability
│   │       ├── light.ts            # Light capability
│   │       ├── thermostat.ts       # Thermostat capability
│   │       └── sensor.ts           # Sensor capabilities
│   ├── mcp/
│   │   ├── tools/                  # MCP tool implementations
│   │   │   ├── device-control.ts   # Device control tools
│   │   │   ├── device-query.ts     # Device query tools
│   │   │   └── automation.ts       # Automation tools
│   │   ├── resources/              # MCP resource handlers
│   │   │   ├── devices.ts          # Device resources
│   │   │   └── locations.ts        # Location resources
│   │   └── prompts/                # MCP prompt templates
│   │       └── common.ts           # Common prompts
│   ├── types/
│   │   ├── smartthings.ts          # SmartThings type definitions
│   │   └── mcp.ts                  # MCP type definitions
│   ├── utils/
│   │   ├── logger.ts               # Logging utility
│   │   ├── retry.ts                # Retry logic with backoff
│   │   ├── validation.ts           # Input validation
│   │   └── error-handler.ts        # Error handling
│   └── transport/
│       ├── http.ts                 # HTTP transport setup
│       └── stdio.ts                # Stdio transport setup
├── tests/
│   ├── unit/
│   │   ├── tools/                  # Tool tests
│   │   ├── resources/              # Resource tests
│   │   └── smartthings/            # SmartThings client tests
│   ├── integration/
│   │   ├── mcp-server.test.ts      # MCP server integration
│   │   └── smartthings-api.test.ts # SmartThings API integration
│   └── e2e/
│       └── end-to-end.test.ts      # End-to-end tests
├── docs/
│   ├── api/                        # API documentation
│   ├── guides/                     # User guides
│   └── research/                   # Research documents
├── .env.example                    # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 4.2 Configuration Files

**package.json**
```json
{
  "name": "mcp-smartthings",
  "version": "1.0.0",
  "type": "module",
  "description": "MCP server for SmartThings home automation",
  "main": "dist/index.js",
  "bin": {
    "mcp-smartthings": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && chmod +x dist/index.js",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:unit": "vitest run --dir tests/unit",
    "test:integration": "vitest run --dir tests/integration",
    "test:e2e": "vitest run --dir tests/e2e",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src tests --ext .ts",
    "lint:fix": "eslint src tests --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\"",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.22.0",
    "@smartthings/core-sdk": "^8.0.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "zod": "^3.25.0",
    "winston": "^3.15.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "smartthings",
    "home-automation",
    "llm",
    "ai"
  ],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**tsconfig.json**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**vitest.config.ts**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.config.{ts,js}',
        '**/types/*.ts'
      ]
    },
    setupFiles: ['./tests/setup.ts']
  }
});
```

**.env.example**
```bash
# SmartThings Configuration
SMARTTHINGS_PAT=your_personal_access_token_here
SMARTTHINGS_CLIENT_ID=your_oauth_client_id
SMARTTHINGS_CLIENT_SECRET=your_oauth_client_secret

# MCP Server Configuration
MCP_SERVER_NAME=smartthings-mcp
MCP_SERVER_VERSION=1.0.0
MCP_SERVER_PORT=3000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Environment
NODE_ENV=development
```

**.gitignore**
```
# Dependencies
node_modules/
package-lock.json
yarn.lock
pnpm-lock.yaml

# Build outputs
dist/
build/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Testing
coverage/
.nyc_output/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Temporary
tmp/
temp/
```

---

## 5. Testing Strategy

### 5.1 Testing Framework: Vitest

**Why Vitest over Jest:**
- Native ESM and TypeScript support (no transpilation needed)
- Faster execution with esbuild
- Vite-compatible (better for modern tooling)
- Built-in TypeScript support via esbuild
- Better watch mode and hot reload

**Installation:**
```bash
npm install -D vitest @vitest/coverage-v8
```

### 5.2 Testing Patterns

**Unit Testing (MCP Tools):**
```typescript
// tests/unit/tools/device-control.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('Device Control Tool', () => {
  it('should turn on device successfully', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });

    server.registerTool('turn_on_device', {
      title: 'Turn On Device',
      inputSchema: { deviceId: z.string() },
      outputSchema: { success: z.boolean() }
    }, async ({ deviceId }) => {
      // Mock SmartThings API call
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
        structuredContent: { success: true }
      };
    });

    // Test tool execution
    const result = await server.callTool('turn_on_device', { deviceId: 'test-123' });
    expect(result.structuredContent.success).toBe(true);
  });
});
```

**Integration Testing (SmartThings API):**
```typescript
// tests/integration/smartthings-api.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SmartThingsClient, BearerTokenAuthenticator } from '@smartthings/core-sdk';

describe('SmartThings API Integration', () => {
  let client: SmartThingsClient;

  beforeAll(() => {
    client = new SmartThingsClient(
      new BearerTokenAuthenticator(process.env.SMARTTHINGS_PAT_TEST)
    );
  });

  it('should list devices', async () => {
    const devices = await client.devices.list();
    expect(Array.isArray(devices)).toBe(true);
  });
});
```

**E2E Testing (MCP Protocol):**
```typescript
// tests/e2e/end-to-end.test.ts
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('MCP Server E2E', () => {
  it('should handle complete workflow', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' }, {});
    await client.connect(clientTransport);

    // Test full MCP protocol flow
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
  });
});
```

### 5.3 Mocking SmartThings API

**Mock Strategy:**
```typescript
// tests/mocks/smartthings.ts
import { vi } from 'vitest';

export const mockSmartThingsClient = {
  devices: {
    list: vi.fn().mockResolvedValue([
      { deviceId: 'device-1', label: 'Living Room Light', capabilities: ['switch'] },
      { deviceId: 'device-2', label: 'Thermostat', capabilities: ['thermostat'] }
    ]),
    executeCommand: vi.fn().mockResolvedValue({ status: 'COMPLETED' })
  },
  locations: {
    list: vi.fn().mockResolvedValue([
      { locationId: 'loc-1', name: 'Home' }
    ])
  }
};
```

### 5.4 Test Coverage Goals

- **Unit Tests**: 80%+ code coverage
- **Integration Tests**: All SmartThings API endpoints
- **E2E Tests**: All MCP tools, resources, prompts
- **Mocking**: SmartThings API for unit/e2e tests (avoid rate limits)

---

## 6. Error Handling & Reliability

### 6.1 Retry Logic with Exponential Backoff

**Pattern for SmartThings API Calls:**
```typescript
// src/utils/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Usage
const devices = await retryWithBackoff(
  () => smartThingsClient.devices.list(),
  3,
  1000
);
```

### 6.2 Circuit Breaker Pattern

**Prevent Cascading Failures:**
```typescript
// src/utils/circuit-breaker.ts
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: number;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime! > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}
```

### 6.3 MCP Error Responses

**Structured Error Format:**
```typescript
// src/mcp/tools/device-control.ts
server.registerTool('turn_on_device', schema, async ({ deviceId }) => {
  try {
    await smartThingsClient.devices.executeCommand(deviceId, {
      capability: 'switch',
      command: 'on'
    });

    return {
      content: [{ type: 'text', text: 'Device turned on successfully' }],
      structuredContent: { success: true, deviceId }
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      structuredContent: {
        success: false,
        deviceId,
        error: error.message
      },
      isError: true  // Critical: Helps LLM understand failure
    };
  }
});
```

### 6.4 Error Types

**Home Automation-Specific Errors:**

1. **Network Errors**: API unreachable, timeout
2. **Authentication Errors**: Expired PAT, invalid OAuth token
3. **Device Errors**: Device offline, command not supported
4. **Rate Limiting**: Too many API requests
5. **Invalid State**: Device in unexpected state

**Error Handling Strategy:**
- Network errors: Retry with exponential backoff
- Auth errors: Trigger token refresh or user notification
- Device errors: Return clear error to LLM with suggestions
- Rate limiting: Implement circuit breaker, queue requests
- Invalid state: Validate before command execution

---

## 7. Configuration & Environment Management

### 7.1 dotenv Configuration

**Setup:**
```bash
npm install dotenv
```

**Load Environment Variables:**
```typescript
// src/config/environment.ts
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  SMARTTHINGS_PAT: z.string().min(1),
  SMARTTHINGS_CLIENT_ID: z.string().optional(),
  SMARTTHINGS_CLIENT_SECRET: z.string().optional(),
  MCP_SERVER_NAME: z.string().default('smartthings-mcp'),
  MCP_SERVER_VERSION: z.string().default('1.0.0'),
  MCP_SERVER_PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
});

export const env = envSchema.parse(process.env);
```

### 7.2 MCP Server Environment Configuration

**MCP Host Configuration (Claude Desktop, etc.):**
```json
{
  "mcpServers": {
    "smartthings": {
      "command": "node",
      "args": ["/path/to/mcp-smartthings/dist/index.js"],
      "env": {
        "SMARTTHINGS_PAT": "your_token_here",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### 7.3 Logging Configuration

**Winston Logger Setup:**
```typescript
// src/utils/logger.ts
import winston from 'winston';
import { env } from '../config/environment.js';

const formats = {
  json: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  pretty: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  )
};

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: formats[env.LOG_FORMAT],
  transports: [
    new winston.transports.Console()
  ]
});
```

---

## 8. Development Workflow

### 8.1 Development Process

**1. Setup:**
```bash
# Clone repository
git clone <repo-url>
cd mcp-smartthings

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your SmartThings PAT
nano .env
```

**2. Development:**
```bash
# Start development server with hot reload
npm run dev

# Run type checking
npm run type-check

# Run linter
npm run lint

# Format code
npm run format
```

**3. Testing:**
```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

**4. Build:**
```bash
# Compile TypeScript
npm run build

# Test production build
npm start
```

### 8.2 MCP Inspector for Debugging

**MCP Inspector Tool:**
- Real-time UI for testing MCP servers
- View registered tools, resources, prompts
- Monitor JSON-RPC traffic
- Test tool calls with custom inputs
- Validate schemas

**Usage:**
```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Run your server with inspector
mcp-inspector node dist/index.js
```

### 8.3 Git Workflow

**Branch Strategy:**
- `main`: Production-ready code
- `develop`: Integration branch
- `feature/*`: Feature development
- `bugfix/*`: Bug fixes
- `release/*`: Release preparation

**Commit Convention:**
```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## 9. Acceptance Criteria for Scaffold Completion

### 9.1 Core Requirements

**Must Have:**
- [ ] TypeScript project configured with strict mode
- [ ] MCP SDK integrated (@modelcontextprotocol/sdk ^1.22.0)
- [ ] SmartThings SDK integrated (@smartthings/core-sdk)
- [ ] Environment variable management with dotenv and Zod validation
- [ ] Project structure following recommended layout
- [ ] Basic MCP tools for device control (on/off, status query)
- [ ] HTTP transport implementation
- [ ] Stdio transport for development/testing
- [ ] Error handling with structured responses
- [ ] Logging with Winston
- [ ] Vitest testing framework configured
- [ ] Unit tests for core tools (>80% coverage)
- [ ] README with setup and usage instructions

**Should Have:**
- [ ] SmartThings OAuth2 authentication support
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker for API reliability
- [ ] MCP resources for device discovery
- [ ] Integration tests with SmartThings API mocks
- [ ] E2E tests for MCP protocol
- [ ] ESLint and Prettier configured
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Docker container configuration
- [ ] API documentation

**Nice to Have:**
- [ ] MCP prompts for common automation scenarios
- [ ] Support for multiple SmartThings locations
- [ ] Device capability auto-discovery
- [ ] Real-time device status updates (webhooks)
- [ ] Rate limiting implementation
- [ ] Metrics and monitoring integration
- [ ] User authentication for multi-tenant support

### 9.2 Testing Requirements

**Test Coverage:**
- [ ] Unit tests: 80%+ coverage
- [ ] All MCP tools have tests
- [ ] SmartThings API mocks in place
- [ ] Error scenarios tested
- [ ] E2E workflow tests passing

**Test Documentation:**
- [ ] Test setup instructions in README
- [ ] Mock data documented
- [ ] Test environment configuration guide

### 9.3 Documentation Requirements

**README.md:**
- [ ] Project description and purpose
- [ ] Prerequisites (Node.js version, SmartThings account)
- [ ] Installation steps
- [ ] SmartThings PAT setup guide
- [ ] Environment configuration
- [ ] Development workflow
- [ ] Testing instructions
- [ ] Build and deployment
- [ ] Troubleshooting guide

**API Documentation:**
- [ ] MCP tools documented with examples
- [ ] MCP resources documented
- [ ] SmartThings capability mappings
- [ ] Error codes and handling
- [ ] Configuration options

**Code Documentation:**
- [ ] JSDoc comments for public APIs
- [ ] Type definitions for complex types
- [ ] Inline comments for complex logic

### 9.4 Quality Gates

**Code Quality:**
- [ ] TypeScript strict mode passing
- [ ] No ESLint errors
- [ ] Code formatted with Prettier
- [ ] No unused dependencies

**Build:**
- [ ] Clean build with no warnings
- [ ] Distribution files under 10MB
- [ ] Startup time < 2 seconds

**Performance:**
- [ ] API response time < 500ms (average)
- [ ] Memory usage < 100MB (idle)
- [ ] Handle 10+ concurrent requests

---

## 10. Key Technical Decisions

### 10.1 Architecture Decisions

**Decision: Use Streamable HTTP Transport for Production**
- **Rationale**: Better for remote deployment, scalability, and monitoring
- **Trade-off**: Slightly more complex setup than stdio
- **Alternative**: Stdio for local CLI integration (development only)

**Decision: Vitest over Jest**
- **Rationale**: Native ESM/TypeScript support, faster, modern tooling
- **Trade-off**: Smaller ecosystem than Jest
- **Alternative**: Jest with ts-jest (more configuration needed)

**Decision: Winston for Logging**
- **Rationale**: Industry standard, flexible, structured logging support
- **Trade-off**: Larger dependency than pino
- **Alternative**: pino (faster but less flexible)

**Decision: PAT for Development, OAuth2 for Production**
- **Rationale**: PAT simplifies initial development, OAuth2 required for multi-user
- **Trade-off**: Need to implement both authentication methods
- **Critical Note**: PAT expires after 24 hours (must handle refresh)

### 10.2 Security Considerations

**Secrets Management:**
- Never commit .env files
- Use environment variables for all credentials
- Rotate SmartThings PATs every 24 hours
- Secure OAuth2 client secrets

**API Security:**
- Validate all inputs with Zod schemas
- Sanitize device IDs and commands
- Implement rate limiting
- Log security events

**MCP Security:**
- Follow OAuth Resource Server classification
- Implement Resource Indicators
- Validate tool permissions
- Audit tool execution

### 10.3 Performance Optimization

**SmartThings API:**
- Cache device list (invalidate on changes)
- Batch commands when possible
- Use parallel requests for independent operations
- Implement request queuing for rate limits

**MCP Server:**
- Lazy-load SmartThings client
- Use connection pooling for HTTP transport
- Minimize tool registration overhead
- Stream large resource responses

---

## 11. Dependencies Reference

### 11.1 Production Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.22.0",    // MCP TypeScript SDK
  "@smartthings/core-sdk": "^8.0.0",          // SmartThings API wrapper
  "dotenv": "^16.4.5",                        // Environment variables
  "express": "^4.19.2",                       // HTTP server (for Streamable HTTP)
  "zod": "^3.25.0",                           // Schema validation
  "winston": "^3.15.0"                        // Logging
}
```

### 11.2 Development Dependencies

```json
{
  "@types/express": "^4.17.21",               // Express types
  "@types/node": "^22.0.0",                   // Node.js types
  "@typescript-eslint/eslint-plugin": "^8.0.0", // TypeScript linting
  "@typescript-eslint/parser": "^8.0.0",      // TypeScript ESLint parser
  "@vitest/coverage-v8": "^3.0.0",            // Vitest coverage
  "eslint": "^9.0.0",                         // Linting
  "prettier": "^3.3.0",                       // Code formatting
  "tsx": "^4.19.0",                           // TypeScript execution
  "typescript": "^5.6.0",                     // TypeScript compiler
  "vitest": "^3.0.0"                          // Testing framework
}
```

### 11.3 Optional Dependencies

```json
{
  "@modelcontextprotocol/inspector": "latest", // MCP debugging tool
  "ioredis": "^5.4.0",                        // Redis for caching/state
  "prom-client": "^15.1.0"                    // Prometheus metrics
}
```

---

## 12. Next Steps & Recommendations

### 12.1 Immediate Actions

1. **Initialize Project:**
   - Create repository: `git init`
   - Set up package.json with recommended dependencies
   - Configure TypeScript with strict settings
   - Set up ESLint and Prettier

2. **SmartThings Setup:**
   - Create SmartThings developer account
   - Generate Personal Access Token (24-hour expiry)
   - Test API access with curl/Postman
   - Document required OAuth2 scopes

3. **MCP Server Skeleton:**
   - Install @modelcontextprotocol/sdk and zod
   - Create basic McpServer instance
   - Implement HTTP transport
   - Register first tool (device_list)

4. **Testing Foundation:**
   - Configure Vitest
   - Create test setup file
   - Write first unit test (device_list tool)
   - Set up SmartThings API mocks

### 12.2 Phase 1: Core Implementation (Week 1-2)

**Goals:**
- Basic MCP server with HTTP transport
- SmartThings client with PAT authentication
- Core device control tools (on/off, status)
- Device discovery resources
- Unit tests for all tools

**Tools to Implement:**
1. `list_devices` - List all SmartThings devices
2. `get_device_status` - Get device status
3. `turn_on_device` - Turn on switch/light
4. `turn_off_device` - Turn off switch/light
5. `set_light_level` - Control dimmable lights

**Resources to Implement:**
1. `smartthings://devices` - Device list
2. `smartthings://devices/{id}` - Device details
3. `smartthings://locations` - Location list

### 12.3 Phase 2: Enhanced Features (Week 3-4)

**Goals:**
- Additional device capabilities (thermostat, sensors, locks)
- OAuth2 authentication support
- Error handling and retry logic
- Integration tests
- Documentation

**New Tools:**
1. `set_thermostat_temperature` - Control thermostat
2. `lock_device` - Lock smart locks
3. `unlock_device` - Unlock smart locks
4. `get_sensor_readings` - Read sensor data

**Infrastructure:**
1. Retry with exponential backoff
2. Circuit breaker pattern
3. Request caching
4. Rate limiting

### 12.4 Phase 3: Production Readiness (Week 5-6)

**Goals:**
- E2E testing
- CI/CD pipeline
- Docker containerization
- Monitoring and metrics
- Production deployment guide

**Deliverables:**
1. Complete test suite (>80% coverage)
2. GitHub Actions CI/CD
3. Docker image
4. Production deployment docs
5. User guide and API reference

### 12.5 Future Enhancements

**Advanced Features:**
- Webhook support for real-time device updates
- Multi-location support
- Custom automation prompts
- Scene/routine execution
- Device grouping and batch operations
- SmartThings Rules API integration

**Performance:**
- Redis caching layer
- Webhook-based state updates
- GraphQL API for complex queries
- Optimistic UI updates

**Monitoring:**
- Prometheus metrics
- Error tracking (Sentry)
- Performance monitoring (APM)
- Usage analytics

---

## 13. Risk Mitigation

### 13.1 Known Risks

**1. SmartThings PAT Expiration (24 hours)**
- **Impact**: Service downtime every 24 hours
- **Mitigation**:
  - Implement automatic token refresh
  - Use OAuth2 for production
  - Monitor token expiration with alerts
  - Document manual refresh process

**2. SmartThings API Rate Limits**
- **Impact**: Request failures during high usage
- **Mitigation**:
  - Implement rate limiting client-side
  - Use circuit breaker pattern
  - Cache frequently accessed data
  - Queue requests during limits

**3. Device Connectivity Issues**
- **Impact**: Commands fail for offline devices
- **Mitigation**:
  - Check device status before commands
  - Provide clear error messages to LLM
  - Implement retry with backoff
  - Log device availability metrics

**4. MCP SDK Breaking Changes**
- **Impact**: Server stops working after SDK update
- **Mitigation**:
  - Pin SDK versions in package.json
  - Test SDK updates in staging
  - Monitor MCP SDK changelog
  - Maintain version compatibility matrix

**5. SmartThings SDK Early Development**
- **Impact**: Breaking changes possible
- **Mitigation**:
  - Pin to specific version
  - Extensive integration testing
  - Monitor SDK repository for changes
  - Contribute fixes upstream

### 13.2 Contingency Plans

**SmartThings API Downtime:**
- Return cached data with staleness indicator
- Queue commands for retry
- Provide degraded mode status to LLM

**Authentication Failures:**
- Clear error messages to user
- Automatic token refresh attempts
- Fallback to manual refresh guide

**Performance Degradation:**
- Enable circuit breaker
- Reduce request rate
- Use cached data
- Alert monitoring system

---

## 14. Reference Links

### 14.1 Official Documentation

**MCP (Model Context Protocol):**
- Specification: https://modelcontextprotocol.io/specification/2025-06-18
- GitHub Repo: https://github.com/modelcontextprotocol/modelcontextprotocol
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Anthropic Announcement: https://www.anthropic.com/news/model-context-protocol

**SmartThings:**
- Developer Portal: https://developer.smartthings.com
- Core SDK: https://github.com/SmartThingsCommunity/smartthings-core-sdk
- Capabilities Reference: https://developer.smartthings.com/docs/devices/capabilities/capabilities-reference
- Authorization Guide: https://developer.smartthings.com/docs/getting-started/authorization-and-permissions
- PAT Generator: https://account.smartthings.com/tokens
- API Quickstart: https://developer.smartthings.com/docs/getting-started/quickstart

### 14.2 Tutorials & Guides

**MCP Server Development:**
- Building MCP Servers (DEV): https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28
- FreeCodeCamp Guide: https://www.freecodecamp.org/news/how-to-build-a-custom-mcp-server-with-typescript-a-handbook-for-developers/
- MCPcat Guide: https://mcpcat.io/guides/building-mcp-server-typescript/
- Microsoft Azure Guide: https://learn.microsoft.com/en-us/azure/developer/ai/build-mcp-server-ts

**Testing & Error Handling:**
- Unit Testing MCP: https://mcpcat.io/guides/writing-unit-tests-mcp-servers/
- Error Handling: https://mcpcat.io/guides/error-handling-custom-mcp-servers/
- E2E Testing: https://creati.ai/mcp/mcp-server-e2e-testing-example/

**SmartThings Integration:**
- OAuth2 Guide: https://levelup.gitconnected.com/smartthings-api-taming-the-oauth-2-0-beast-5d735ecc6b24
- SDK Documentation: https://developer.smartthings.com/docs/sdks/core

### 14.3 Example Repositories

**MCP Servers:**
- Official Examples: https://github.com/modelcontextprotocol/servers
- TypeScript Template: GitHub search for "mcp-typescript-template"
- Production Example: https://github.com/locomotive-agency/linear-mcp

**SmartThings:**
- Core SDK Examples: https://github.com/SmartThingsCommunity/smartthings-core-sdk/tree/main/examples

### 14.4 Tools

**Development:**
- MCP Inspector: `npm install -g @modelcontextprotocol/inspector`
- TypeScript: https://www.typescriptlang.org
- Vitest: https://vitest.dev
- ESLint: https://eslint.org
- Prettier: https://prettier.io

**Debugging:**
- Postman (SmartThings API): https://www.postman.com
- curl (CLI testing)
- MCP Inspector (protocol debugging)

---

## 15. Glossary

**MCP Terms:**
- **MCP**: Model Context Protocol - open standard for LLM-tool integration
- **Host**: LLM application (Claude, ChatGPT) that uses MCP servers
- **Client**: MCP connector within the host application
- **Server**: Service providing tools, resources, and prompts
- **Tool**: Executable function the LLM can call
- **Resource**: Read-only data/context for the LLM
- **Prompt**: Templated message or workflow
- **Transport**: Communication mechanism (stdio, HTTP, SSE)

**SmartThings Terms:**
- **SmartThings**: Samsung's home automation platform and API
- **Device**: Physical or virtual smart home device
- **Capability**: Standardized device feature (switch, thermostat, etc.)
- **Command**: Action to control device (on, off, setLevel)
- **Attribute**: Device state property (switch: on/off, temperature: 72)
- **Location**: Physical location containing devices
- **PAT**: Personal Access Token (24-hour expiry)
- **OAuth2**: Industry-standard authorization protocol

**TypeScript/Node.js Terms:**
- **ESM**: ECMAScript Modules (modern import/export)
- **Zod**: TypeScript-first schema validation library
- **tsx**: TypeScript execution engine (no compilation needed)
- **Vitest**: Modern test framework with native TypeScript support
- **dotenv**: Environment variable loader

---

## Appendix A: SmartThings Capability Cheat Sheet

### Common Capabilities Quick Reference

| Capability | Commands | Attributes | Example Use |
|------------|----------|------------|-------------|
| `switch` | `on()`, `off()` | `switch`: "on"\|"off" | Basic on/off control |
| `switchLevel` | `setLevel(level)` | `level`: 0-100 | Dimmable lights |
| `colorControl` | `setColor(color)`, `setHue(hue)`, `setSaturation(sat)` | `color`, `hue`, `saturation` | Color lights |
| `thermostat` | `setHeatingSetpoint(temp)`, `setCoolingSetpoint(temp)`, `setThermostatMode(mode)` | `temperature`, `heatingSetpoint`, `coolingSetpoint`, `thermostatMode` | Climate control |
| `temperatureMeasurement` | - | `temperature` | Temperature sensors |
| `motionSensor` | - | `motion`: "active"\|"inactive" | Motion detection |
| `contactSensor` | - | `contact`: "open"\|"closed" | Door/window sensors |
| `lock` | `lock()`, `unlock()` | `lock`: "locked"\|"unlocked" | Smart locks |
| `energyMeter` | - | `energy` | Energy monitoring |
| `powerMeter` | - | `power` | Power monitoring |
| `presenceSensor` | - | `presence`: "present"\|"not present" | Presence detection |
| `valve` | `open()`, `close()` | `valve`: "open"\|"closed" | Water valves |
| `windowShade` | `open()`, `close()`, `setPosition(position)` | `windowShade`, `position` | Motorized shades |

---

## Appendix B: Example MCP Tool Implementations

### Tool: List Devices

```typescript
server.registerTool('list_devices', {
  title: 'List SmartThings Devices',
  description: 'Get all SmartThings devices in the user\'s account',
  inputSchema: {
    locationId: z.string().optional().describe('Filter by location ID')
  },
  outputSchema: {
    devices: z.array(z.object({
      deviceId: z.string(),
      label: z.string(),
      capabilities: z.array(z.string())
    }))
  }
}, async ({ locationId }) => {
  const devices = await smartThingsClient.devices.list();

  const filteredDevices = locationId
    ? devices.filter(d => d.locationId === locationId)
    : devices;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ devices: filteredDevices }, null, 2)
    }],
    structuredContent: { devices: filteredDevices }
  };
});
```

### Tool: Turn On Device

```typescript
server.registerTool('turn_on_device', {
  title: 'Turn On Device',
  description: 'Turn on a SmartThings device (switch, light, etc.)',
  inputSchema: {
    deviceId: z.string().describe('Device ID to control')
  },
  outputSchema: {
    success: z.boolean(),
    deviceId: z.string(),
    message: z.string()
  }
}, async ({ deviceId }) => {
  try {
    await smartThingsClient.devices.executeCommand(deviceId, {
      capability: 'switch',
      command: 'on',
      arguments: []
    });

    return {
      content: [{
        type: 'text',
        text: `Device ${deviceId} turned on successfully`
      }],
      structuredContent: {
        success: true,
        deviceId,
        message: 'Device turned on'
      }
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error turning on device: ${error.message}`
      }],
      structuredContent: {
        success: false,
        deviceId,
        message: error.message
      },
      isError: true
    };
  }
});
```

---

## Conclusion

This research provides a comprehensive foundation for building a production-ready MCP server for SmartThings home automation. The recommended architecture leverages official SDKs, follows MCP best practices, and incorporates robust error handling suitable for home automation scenarios.

**Key Success Factors:**
1. Follow MCP specification strictly for protocol compliance
2. Implement comprehensive error handling for reliability
3. Use Vitest for modern TypeScript testing
4. Handle SmartThings PAT 24-hour expiration
5. Plan for OAuth2 migration for production use
6. Implement retry and circuit breaker patterns
7. Maintain high test coverage (>80%)
8. Document thoroughly for maintainability

**Next Steps:**
1. Initialize project with recommended structure
2. Set up SmartThings PAT and test API access
3. Implement core MCP tools for device control
4. Write comprehensive tests
5. Build production deployment pipeline

**Timeline Estimate:**
- Week 1-2: Core implementation
- Week 3-4: Enhanced features and error handling
- Week 5-6: Production readiness and deployment

This architecture positions the project for successful LLM-driven home automation with SmartThings, following industry best practices and official specifications.

---

**Research Conducted By:** Claude Code Research Agent
**Ticket Integration:** Linear Project "MCP Smartthings" (4bfcd979-73bb-4098-8d09-2e2e1b9fc69c)
**Document Location:** `/Users/masa/Projects/mcp-smartthings/docs/research/mcp-smartthings-architecture-research-2025-11-25.md`
