# Integration Test Requirements Research - Ticket 1M-311

**Ticket:** 1M-311 - Add Integration Tests for End-to-End Diagnostic Workflow
**Priority:** High
**Status:** Open
**Assignee:** bob@matsuoka.com
**Research Date:** 2025-11-29
**Estimated Effort:** 2 days (per ticket)

---

## Executive Summary

Ticket 1M-311 requires implementing comprehensive integration tests for the diagnostic workflow using **nock** for API mocking. The project currently has:
- ✅ Comprehensive unit tests with mocks
- ✅ 2 integration tests (chatbot flow, MCP client)
- ✅ 1 diagnostic workflow integration test (real API calls)
- ❌ **MISSING:** Integration tests with realistic API fixtures and nock-based mocking

**Key Gap:** No integration tests validating against actual SmartThings API response structures using fixtures.

**Recommendation:** Implement the proposed test scenarios in ticket 1M-311 with priority on Alcove device fixtures and rate limit handling.

---

## 1. Ticket Details from Linear

### Problem Statement
Current tests use mocks extensively but don't validate against actual API response structures. Missing integration tests with real device event data.

### Test Coverage Gaps Identified
1. ❌ No test with real Alcove device event data
2. ❌ No validation of SmartThings API response parsing
3. ❌ No end-to-end workflow test with complete event sequences
4. ❌ No rate limit handling tests

### Proposed Test Scenarios

#### TC-1: Alcove Light Integration Test
**Purpose:** Diagnose automation trigger from real event data
**Fixture Required:** Alcove device events (from real API response)
**API Mocking:** `nock` to return fixture data
**Expected Validations:**
- Device resolution contains "Alcove"
- Recent events > 10 items
- Pattern detection with confidence > 0.8
- Recommendations mention automation/routine

#### TC-2: Rate Limit Handling
**Purpose:** Test retry logic on 429 errors
**API Mocking:** First response 429, second response 200
**Expected Behavior:**
- Service retries automatically
- Eventually returns successful response
- No errors thrown to user

### Acceptance Criteria
- [ ] Create integration test suite with nock for API mocking
- [ ] Add Alcove device event fixtures
- [ ] Test end-to-end workflow with realistic event data
- [ ] Add rate limit handling tests
- [ ] Add timeout handling tests
- [ ] Test error scenarios (device not found, API errors)
- [ ] Document test setup and execution
- [ ] Add CI/CD pipeline integration

### Files to Create/Modify
1. `src/services/__tests__/DiagnosticWorkflow.integration.test.ts` (enhance existing)
2. `tests/fixtures/alcove-events.json` (new)
3. `tests/fixtures/device-list.json` (new)
4. `tests/helpers/api-mocks.ts` (new)

---

## 2. Current Test Infrastructure Analysis

### Test Configuration

**Vitest Config:** `/Users/masa/Projects/mcp-smartthings/vitest.config.ts`
```typescript
{
  globals: true,
  environment: 'node',
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    thresholds: {
      lines: 50,
      functions: 50,
      branches: 50,
      statements: 50
    }
  },
  setupFiles: ['./tests/setup.ts']
}
```

**Key Features:**
- ✅ Global test utilities enabled
- ✅ Node environment
- ✅ V8 coverage provider
- ✅ Setup file loads environment variables
- ✅ Coverage thresholds at 50%

**Test Scripts:** (from package.json)
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration"
}
```

### Test Setup File

**File:** `/Users/masa/Projects/mcp-smartthings/tests/setup.ts`

**Configuration:**
```typescript
- Loads .env file for integration tests
- Sets NODE_ENV='test'
- Sets SMARTTHINGS_PAT (uses real PAT if available, otherwise 'test-token-12345')
- Sets LOG_LEVEL='error' to reduce noise
```

**Critical for Integration Tests:**
- Environment variables loaded BEFORE module imports
- Supports both real API testing (with real PAT) and mocked testing
- Reduces log noise during test execution

---

## 3. Existing Test Files Analysis

### Unit Tests (15 files)

**Location:** `/Users/masa/Projects/mcp-smartthings/tests/unit/`

**Test Files:**
1. `error-handler.test.ts`
2. `mcp-client.test.ts`
3. `llm-service.test.ts`
4. `chatbot-service.test.ts`
5. `chat-orchestrator.test.ts`
6. `scenes-tools.test.ts`
7. `device-query-tools.test.ts`
8. `llm-web-search.test.ts`
9. `chat-orchestrator-troubleshooting.test.ts`
10. `platforms/smartthings/SmartThingsAdapter.test.ts`
11. `platforms/tuya/TuyaAdapter.test.ts`
12. `platforms/lutron/LutronAdapter.test.ts`

**Unit Test Pattern Analysis** (from SmartThingsAdapter.test.ts):
```typescript
- Comprehensive mocking using vi.mock()
- Shared mock client pattern (createMockClient())
- Test fixtures for mock data (mockDevice, mockDeviceStatus, mockLocation, mockRoom, mockScene)
- Lifecycle tests (initialize, dispose, healthCheck)
- Command execution tests (executeCommand, executeBatchCommands)
- Error handling tests (ConfigurationError, AuthenticationError, DeviceNotFoundError)
- Coverage of all 18 interface methods
```

**Key Testing Patterns:**
1. **Mock Factory Pattern:**
   ```typescript
   const createMockClient = () => ({
     devices: { list: vi.fn(), get: vi.fn(), getStatus: vi.fn(), executeCommand: vi.fn() },
     locations: { list: vi.fn() },
     rooms: { list: vi.fn(), get: vi.fn() },
     scenes: { list: vi.fn(), execute: vi.fn() }
   });
   ```

2. **Fixture Data:**
   ```typescript
   const mockDevice: Device = {
     deviceId: 'device-123',
     name: 'Test Light',
     label: 'Living Room Light',
     components: [{ id: 'main', capabilities: [...] }]
   };
   ```

3. **Error Testing:**
   ```typescript
   expect(() => new SmartThingsAdapter({})).toThrow(ConfigurationError);
   expect(adapter.getDevice('invalid')).rejects.toThrow(DeviceNotFoundError);
   ```

### Integration Tests (2 files + 1 QA file)

**Location:** `/Users/masa/Projects/mcp-smartthings/tests/integration/`

**Files:**
1. `chatbot-flow.test.ts` - Complete chatbot interaction flow
2. `mcp-client.test.ts` - MCP protocol compliance tests

**QA Tests:**
- `/Users/masa/Projects/mcp-smartthings/tests/qa/diagnostic-tools.test.ts`

#### Integration Test 1: Chatbot Flow

**File:** `/Users/masa/Projects/mcp-smartthings/tests/integration/chatbot-flow.test.ts`

**Architecture:**
```
ChatbotService (REPL) → ChatOrchestrator → Mock LLM Service → Mock MCP Client
```

**Test Patterns:**
1. **Mock MCP Client** (IntegrationMockMcpClient):
   - Implements full IMcpClient interface
   - Returns realistic tool definitions (list_devices, turn_on_device, get_device_status)
   - Simulates tool execution with fixture data

2. **Mock LLM Service** (IntegrationMockLlmService):
   - Implements ILlmService interface
   - Pattern matching for test scenarios (turn on, status queries)
   - Multi-step tool call sequences
   - Call count tracking for stateful responses

3. **Test Scenarios:**
   - ✅ Simple query without tool calls
   - ✅ Device control with tool calls
   - ✅ Device status query
   - ✅ Conversation history maintenance
   - ✅ Tool execution error handling
   - ✅ Conversation reset

**Key Insights:**
- Integration tests use **custom mock implementations** (not nock)
- Validates data flow between components
- No external API calls
- Fast execution (<100ms per test)

#### Integration Test 2: MCP Client

**File:** `/Users/masa/Projects/mcp-smartthings/tests/integration/mcp-client.test.ts`

**Architecture:**
```
MCP SDK Client → stdio transport → Real MCP Server Process → SmartThings API
```

**Test Type:** TRUE INTEGRATION TEST (real server, real or test PAT)

**Test Coverage:**
1. **Server Capabilities:**
   - ✅ Server connection
   - ✅ List available tools (expects 22 tools)
   - ✅ Tool metadata validation
   - ✅ Input schema validation

2. **Device Query Tools:**
   - ✅ list_devices success
   - ✅ Text content validation
   - ✅ Error handling for invalid deviceId

3. **Device Control Tools:**
   - ✅ Validation for invalid device IDs
   - ✅ Optional real device testing (TEST_DEVICE_ID env var)

4. **Error Handling:**
   - ✅ Missing required parameters
   - ✅ Invalid tool names
   - ✅ Structured error responses
   - ✅ JSON schema validation

5. **MCP Protocol Compliance:**
   - ✅ Content array in responses
   - ✅ Text content type
   - ✅ isError flag handling

6. **Performance:**
   - ✅ Concurrent tool execution
   - ✅ Response time <5 seconds
   - ✅ Rapid sequential calls (10 calls, avg <2s per call)

**Configuration:**
```typescript
const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
  env: {
    SMARTTHINGS_PAT: process.env.SMARTTHINGS_PAT || 'test-token-for-integration-tests',
    LOG_LEVEL: 'error',
    NODE_ENV: 'test'
  }
});
```

**Test Timeout:** 30 seconds (allows for server startup)

**Key Insights:**
- Tests real server startup via stdio transport
- Can run with test token OR real PAT
- Validates MCP protocol compliance
- Tests concurrent and sequential execution
- Comprehensive error handling validation

### Service-Level Integration Test

**File:** `/Users/masa/Projects/mcp-smartthings/src/services/__tests__/DiagnosticWorkflow.integration.test.ts`

**Architecture:**
```
DiagnosticWorkflow → DeviceService → SmartThingsService → REAL SmartThings API
                   → IntentClassifier → LlmService → REAL OpenRouter API
                   → SemanticIndex (ChromaDB)
                   → DeviceRegistry
```

**Test Type:** TRUE END-TO-END INTEGRATION (requires real PAT and API key)

**Prerequisites:**
```typescript
SMARTTHINGS_PAT=<real-token>
OPENROUTER_API_KEY=<real-key>
```

**Test Scenarios:**

1. **TC-1: Device Health Check**
   - Query: "check my master alcove motion sensor"
   - Intent: DEVICE_HEALTH
   - Validates: device resolution, health data, recent events, recommendations
   - Performance target: <5000ms (relaxed from <500ms for real APIs)

2. **TC-2: Issue Diagnosis (Real-World)**
   - Query: "my master bedroom alcove light just came on (i turned off) see if it can figure out why"
   - Intent: ISSUE_DIAGNOSIS
   - Validates: device contains "Alcove", recent events >0, related issues, recommendations
   - Performance target: <5000ms

3. **TC-3: System Status**
   - Query: "show me system status"
   - Intent: SYSTEM_STATUS
   - Validates: totalDevices >0, health breakdown, recommendations
   - Performance target: <5000ms

4. **TC-4: Performance Breakdown**
   - Measures: intent classification, device resolution, workflow execution
   - Target breakdown:
     - Intent classification: <200ms
     - Device resolution: <100ms
     - Workflow execution: <400ms
     - Total: <500ms (relaxed to <5000ms for real APIs)

5. **TC-5: Error Handling**
   - Query: "check nonexistent device xyz123"
   - Validates: graceful degradation, report still generated

**Test Setup:**
```typescript
beforeAll(async () => {
  // Load devices from SmartThings
  const devices = await deviceService.listDevices();

  // Populate registry and semantic index
  for (const device of devices) {
    deviceRegistry.addDevice(toUnifiedDevice(device));
    await semanticIndex.indexDevice(createDeviceMetadataDocument(device));
  }

  // Initialize workflow
  workflow = new DiagnosticWorkflow(semanticIndex, deviceService, deviceRegistry);
}, 30000);
```

**Key Insights:**
- **REAL API CALLS** (not mocked)
- Tests complete diagnostic workflow end-to-end
- Requires real credentials
- Performance targets relaxed 10x for real API latency
- Tests real device resolution via semantic search
- Validates error handling with nonexistent devices

---

## 4. Gap Analysis: What Integration Tests Are Missing

### Current State Summary

| Test Type | Coverage | Approach | Gaps |
|-----------|----------|----------|------|
| Unit Tests | ✅ Comprehensive (15 files) | vi.mock(), fixtures | N/A |
| Chatbot Integration | ✅ Complete flow | Custom mocks | No API validation |
| MCP Client Integration | ✅ Protocol compliance | Real server, test/real PAT | Limited error scenarios |
| Diagnostic Workflow Integration | ✅ End-to-end | Real APIs (PAT + OpenRouter) | No fixture-based testing |

### Missing Integration Tests

#### 1. API Response Structure Validation ⚠️ CRITICAL GAP
**Problem:** Tests don't validate against actual SmartThings API response structures
**Impact:** API contract changes could break production without test failures
**Solution:** Fixture-based tests with nock

**Missing Tests:**
- ❌ Device list API response parsing
- ❌ Device status API response parsing
- ❌ Device events API response parsing
- ❌ Room/location API response parsing
- ❌ Scene API response parsing

**Example Gap:**
```typescript
// Current: Mock returns simplified data
mockClient.devices.list = vi.fn().mockResolvedValue([{ deviceId: '123', name: 'Light' }]);

// Missing: Validate against real API response structure
// Real SmartThings API returns: { items: [ { deviceId, name, label, type, components, ... } ] }
```

#### 2. Alcove Device Event Data ⚠️ CRITICAL GAP (from ticket)
**Problem:** No test with real Alcove device event sequence
**Impact:** Cannot validate diagnostic workflow against production data patterns
**Solution:** Create fixture from real Alcove device events

**Missing Tests:**
- ❌ Alcove light event sequence (on/off/automation trigger)
- ❌ Event pattern detection (rapid changes, automation triggers)
- ❌ Event-driven diagnosis workflow

**Required Fixture Structure:**
```json
{
  "deviceId": "alcove-light-123",
  "events": [
    { "time": "2024-11-28T20:00:00Z", "capability": "switch", "attribute": "switch", "value": "on" },
    { "time": "2024-11-28T20:00:05Z", "capability": "switch", "attribute": "switch", "value": "off" },
    { "time": "2024-11-28T20:00:10Z", "capability": "switch", "attribute": "switch", "value": "on" }
  ]
}
```

#### 3. Rate Limit Handling ⚠️ HIGH PRIORITY (from ticket)
**Problem:** No tests for 429 rate limit responses
**Impact:** Unclear if retry logic works correctly
**Solution:** nock-based test with 429 → 200 sequence

**Missing Tests:**
- ❌ Single retry on 429
- ❌ Multiple retries with backoff
- ❌ Max retries exceeded
- ❌ Rate limit headers handling

**Test Pattern:**
```typescript
nock('https://api.smartthings.com')
  .get('/v1/devices')
  .reply(429, { error: 'Too Many Requests' }, { 'Retry-After': '1' })
  .get('/v1/devices')
  .reply(200, deviceListResponse);
```

#### 4. Timeout Handling ⚠️ MEDIUM PRIORITY
**Problem:** No tests for API timeout scenarios
**Impact:** Unclear if timeout handling works correctly
**Solution:** nock-based test with delayed responses

**Missing Tests:**
- ❌ Request timeout (>30s)
- ❌ Timeout with retry
- ❌ Partial response timeout

#### 5. Error Scenario Coverage ⚠️ MEDIUM PRIORITY
**Problem:** Limited error scenario testing
**Impact:** Production errors may not be handled gracefully
**Solution:** Comprehensive error fixtures

**Missing Tests:**
- ❌ Device not found (404)
- ❌ Unauthorized (401)
- ❌ Forbidden (403)
- ❌ Server error (500)
- ❌ Malformed JSON response
- ❌ Network connection failure

#### 6. Multi-Adapter Scenarios ⚠️ LOW PRIORITY
**Problem:** No tests exercising multiple platform adapters
**Impact:** Cross-platform compatibility unknown
**Solution:** Multi-adapter integration tests

**Missing Tests:**
- ❌ SmartThings + Tuya device control
- ❌ SmartThings + Lutron scene execution
- ❌ Cross-platform device resolution
- ❌ Unified device representation consistency

#### 7. End-to-End MCP Server Tests ⚠️ LOW PRIORITY
**Problem:** MCP client tests validate protocol, not complete workflows
**Impact:** Integration issues may not be caught
**Solution:** Workflow-level MCP tests

**Missing Tests:**
- ❌ Complete diagnostic workflow via MCP tools
- ❌ Multi-step tool execution sequences
- ❌ Tool result chaining
- ❌ Error propagation through MCP layer

---

## 5. Recommended Test Scenarios to Implement

### Priority 1: Ticket 1M-311 Requirements (2 days)

#### Scenario 1: Alcove Light Diagnostic Workflow with Fixtures
**File:** `src/services/__tests__/DiagnosticWorkflow.nock.test.ts` (new)
**Dependencies:** nock (needs installation)
**Fixtures Required:**
1. `tests/fixtures/alcove-events.json` - Real Alcove device event sequence
2. `tests/fixtures/device-list.json` - SmartThings device list response
3. `tests/fixtures/alcove-device.json` - Alcove device details

**Test Structure:**
```typescript
describe('Alcove Light Diagnostic Workflow (nock-based)', () => {
  beforeEach(() => {
    // Mock SmartThings API with nock
    nock('https://api.smartthings.com')
      .get('/v1/devices')
      .reply(200, deviceListFixture);

    nock('https://api.smartthings.com')
      .get('/v1/devices/alcove-device-id/events')
      .reply(200, alcoveEventsFixture);
  });

  it('should diagnose automation trigger from real Alcove events', async () => {
    const query = 'Why is Master Alcove Bar turning on at night?';
    const report = await executeDiagnosticWorkflow(query);

    // Validate device resolution
    expect(report.diagnosticContext.device?.name).toContain('Alcove');

    // Validate event retrieval
    expect(report.diagnosticContext.recentEvents?.length).toBeGreaterThan(10);

    // Validate pattern detection
    expect(report.diagnosticContext.relatedIssues).toContainEqual({
      type: 'rapid_changes',
      confidence: expect.toBeGreaterThan(0.8),
    });

    // Validate recommendations
    expect(report.recommendations).toContainEqual(
      expect.stringMatching(/automation|routine/i)
    );
  });
});
```

**Estimated Effort:** 1 day
- 2 hours: Create fixtures from real API responses
- 3 hours: Implement test with nock
- 2 hours: Validate and debug
- 1 hour: Documentation

#### Scenario 2: Rate Limit Handling
**File:** `src/services/__tests__/RateLimitHandling.test.ts` (new)
**Dependencies:** nock

**Test Structure:**
```typescript
describe('Rate Limit Handling', () => {
  it('should retry on 429 errors', async () => {
    nock('https://api.smartthings.com')
      .get('/v1/devices')
      .reply(429, { error: 'Too Many Requests' })
      .get('/v1/devices')
      .reply(200, deviceListResponse);

    const devices = await smartthingsService.listDevices();

    expect(devices).toBeDefined();
    expect(devices.length).toBeGreaterThan(0);
  });

  it('should respect Retry-After header', async () => {
    const retryAfter = 2; // seconds
    nock('https://api.smartthings.com')
      .get('/v1/devices')
      .reply(429, { error: 'Too Many Requests' }, { 'Retry-After': retryAfter.toString() })
      .get('/v1/devices')
      .delay(retryAfter * 1000)
      .reply(200, deviceListResponse);

    const startTime = Date.now();
    const devices = await smartthingsService.listDevices();
    const elapsed = Date.now() - startTime;

    expect(devices).toBeDefined();
    expect(elapsed).toBeGreaterThanOrEqual(retryAfter * 1000);
  });

  it('should fail after max retries exceeded', async () => {
    nock('https://api.smartthings.com')
      .get('/v1/devices')
      .times(4) // Max retries + 1
      .reply(429, { error: 'Too Many Requests' });

    await expect(smartthingsService.listDevices()).rejects.toThrow(/rate limit/i);
  });
});
```

**Estimated Effort:** 0.5 days
- 2 hours: Implement tests
- 2 hours: Validate retry logic in SmartThingsService

#### Scenario 3: API Response Structure Validation
**File:** `tests/helpers/api-mocks.ts` (new)
**Purpose:** Centralized nock setup with real API fixtures

**Test Structure:**
```typescript
export const setupSmartThingsApiMocks = () => {
  nock('https://api.smartthings.com')
    .get('/v1/devices')
    .reply(200, require('../fixtures/device-list.json'));

  nock('https://api.smartthings.com')
    .get(/\/v1\/devices\/[^/]+$/)
    .reply((uri) => {
      const deviceId = uri.split('/').pop();
      return [200, require(`../fixtures/devices/${deviceId}.json`)];
    });
};

describe('API Response Parsing', () => {
  beforeEach(() => setupSmartThingsApiMocks());

  it('should parse device list response correctly', async () => {
    const devices = await smartthingsService.listDevices();

    expect(devices).toBeInstanceOf(Array);
    expect(devices[0]).toHaveProperty('deviceId');
    expect(devices[0]).toHaveProperty('name');
    expect(devices[0]).toHaveProperty('components');
  });
});
```

**Estimated Effort:** 0.5 days
- 2 hours: Create fixtures
- 2 hours: Implement helper utilities

### Priority 2: Error Scenario Coverage (1 day)

#### Scenario 4: Comprehensive Error Handling
**File:** `src/services/__tests__/ErrorScenarios.test.ts` (new)

**Test Coverage:**
- Device not found (404)
- Unauthorized (401)
- Forbidden (403)
- Server error (500)
- Malformed JSON
- Network failure

**Estimated Effort:** 1 day

### Priority 3: Multi-Adapter Integration (2 days)

**Defer to future tickets** - Lower priority than 1M-311

---

## 6. Estimated Complexity and Effort

### Overall Effort Estimate

| Task | Complexity | Estimated Hours | Dependencies |
|------|-----------|-----------------|--------------|
| Install and configure nock | Low | 1h | Package installation |
| Create Alcove event fixtures | Medium | 2h | Access to real device data |
| Create other API fixtures | Medium | 2h | SmartThings API docs |
| Implement TC-1 (Alcove workflow) | High | 6h | Fixtures, nock setup |
| Implement TC-2 (Rate limits) | Medium | 4h | Retry logic understanding |
| Implement API validation tests | Medium | 4h | Response structure docs |
| Error scenario tests | Medium | 6h | Error response examples |
| Test helper utilities | Low | 2h | nock expertise |
| Documentation | Low | 2h | Test execution guide |
| CI/CD integration | Medium | 3h | GitHub Actions config |
| **TOTAL** | | **32 hours** | **~2 days** |

### Complexity Breakdown

**Low Complexity:**
- Setting up nock
- Creating basic fixtures
- Writing helper utilities
- Documentation

**Medium Complexity:**
- Creating realistic event fixtures (requires real data)
- Rate limit handling tests (requires retry logic understanding)
- API response validation (requires API contract knowledge)
- Error scenario coverage (requires error case enumeration)

**High Complexity:**
- Alcove diagnostic workflow test (complex integration, multiple data sources)
- CI/CD pipeline integration (may require infrastructure changes)

### Risk Factors

1. **Fixture Creation:** ⚠️ MEDIUM RISK
   - Requires access to real Alcove device
   - May need to trigger events manually
   - **Mitigation:** Use existing diagnostic workflow integration test to capture real responses

2. **Nock Learning Curve:** ⚠️ LOW RISK
   - Team may be unfamiliar with nock
   - **Mitigation:** Start with simple examples, use existing documentation

3. **Retry Logic Changes:** ⚠️ LOW RISK
   - May discover retry logic doesn't exist or is incomplete
   - **Mitigation:** Implement retry logic if missing (separate ticket)

4. **CI/CD Integration:** ⚠️ MEDIUM RISK
   - May require changes to build pipeline
   - **Mitigation:** Run locally first, then integrate into CI

---

## 7. Testing Patterns to Follow

### Pattern 1: Fixture-Based Integration Testing
```typescript
// tests/fixtures/alcove-events.json
{
  "deviceId": "abc123",
  "events": [ /* real event data */ ]
}

// Test file
import alcoveEvents from '../fixtures/alcove-events.json';

describe('Alcove Event Processing', () => {
  beforeEach(() => {
    nock('https://api.smartthings.com')
      .get('/v1/devices/abc123/events')
      .reply(200, alcoveEvents);
  });

  it('should process events correctly', async () => {
    const events = await deviceService.getDeviceEvents('abc123');
    expect(events).toMatchSnapshot(); // Optional: snapshot testing
  });
});
```

### Pattern 2: Error Response Testing
```typescript
describe('Error Handling', () => {
  it('should handle 404 device not found', async () => {
    nock('https://api.smartthings.com')
      .get('/v1/devices/invalid-id')
      .reply(404, { error: 'Device not found' });

    await expect(deviceService.getDevice('invalid-id'))
      .rejects.toThrow(DeviceNotFoundError);
  });
});
```

### Pattern 3: Retry Testing
```typescript
describe('Retry Logic', () => {
  it('should retry on transient errors', async () => {
    const scope = nock('https://api.smartthings.com')
      .get('/v1/devices')
      .reply(500, 'Internal Server Error')
      .get('/v1/devices')
      .reply(200, deviceList);

    const devices = await deviceService.listDevices();

    expect(devices).toBeDefined();
    expect(scope.isDone()).toBe(true); // All nock mocks were called
  });
});
```

### Pattern 4: Concurrent Request Testing
```typescript
describe('Concurrent Requests', () => {
  it('should handle parallel device queries', async () => {
    // Mock multiple device endpoints
    ['device1', 'device2', 'device3'].forEach(id => {
      nock('https://api.smartthings.com')
        .get(`/v1/devices/${id}`)
        .reply(200, { deviceId: id, name: `Device ${id}` });
    });

    const promises = ['device1', 'device2', 'device3']
      .map(id => deviceService.getDevice(id));

    const devices = await Promise.all(promises);
    expect(devices).toHaveLength(3);
  });
});
```

---

## 8. Dependencies and Prerequisites

### Package Dependencies

**Required Installation:**
```bash
pnpm add -D nock @types/nock
```

**Current Test Dependencies:** (from package.json)
```json
{
  "@vitest/coverage-v8": "^3.0.0",
  "vitest": "^3.0.0"
}
```

**Status:** ❌ nock NOT currently installed

### Environment Setup

**Required Environment Variables:**
```bash
# For real API integration tests (optional)
SMARTTHINGS_PAT=<real-token>
OPENROUTER_API_KEY=<real-key>

# For fixture-based integration tests (required)
NODE_ENV=test
LOG_LEVEL=error
```

**Current Setup:** ✅ Already configured in `tests/setup.ts`

### Fixture Creation Prerequisites

1. **Access to Real Device:**
   - Need Alcove device in SmartThings account
   - Must trigger events (on/off sequences)
   - Capture API responses using network inspector or logging

2. **API Response Documentation:**
   - SmartThings API reference: https://developer.smartthings.com/docs/api/public
   - Event structure documentation
   - Error response formats

3. **ChromaDB/Semantic Index:**
   - Already used in diagnostic workflow integration test
   - May need to mock or seed for fixture-based tests

---

## 9. Next Steps and Action Plan

### Immediate Actions (Week 1)

**Day 1:**
1. ✅ Research complete (this document)
2. ⬜ Install nock: `pnpm add -D nock @types/nock`
3. ⬜ Capture real Alcove device events (use existing integration test or network inspector)
4. ⬜ Create fixture files:
   - `tests/fixtures/alcove-events.json`
   - `tests/fixtures/device-list.json`
   - `tests/fixtures/alcove-device.json`

**Day 2:**
5. ⬜ Implement TC-1: Alcove Light Diagnostic Workflow
   - File: `src/services/__tests__/DiagnosticWorkflow.nock.test.ts`
   - Use nock to mock SmartThings API
   - Validate device resolution, event processing, pattern detection

6. ⬜ Implement TC-2: Rate Limit Handling
   - File: `src/services/__tests__/RateLimitHandling.test.ts`
   - Test retry logic with 429 responses
   - Validate Retry-After header handling

**Day 3:**
7. ⬜ Implement API response validation tests
   - File: `tests/helpers/api-mocks.ts` (helper utilities)
   - File: `src/services/__tests__/ApiResponseParsing.test.ts`
   - Validate response structure parsing

8. ⬜ Implement error scenario tests
   - File: `src/services/__tests__/ErrorScenarios.test.ts`
   - Test 404, 401, 403, 500, malformed JSON, network failure

9. ⬜ Update test documentation
   - Add test execution guide
   - Document fixture creation process

10. ⬜ CI/CD integration
    - Add integration test job to GitHub Actions
    - Configure test environment variables

### Validation Criteria

**Tests Must:**
- ✅ Pass with nock-mocked API responses
- ✅ Validate against actual API response structures
- ✅ Cover all acceptance criteria from ticket 1M-311
- ✅ Execute in <5 seconds (without real API calls)
- ✅ Provide clear error messages on failure
- ✅ Include documentation for test execution

**Success Metrics:**
- All acceptance criteria checked off
- Coverage increase for DeviceService, DiagnosticWorkflow
- Zero flaky tests (deterministic with fixtures)
- CI/CD pipeline passes

---

## 10. Related Tickets and Documentation

### Related Tickets
- **1M-311:** This ticket (Integration tests for diagnostic workflow)
- **Future Tickets:**
  - Multi-adapter integration tests
  - Performance benchmarking tests
  - Timeout handling improvements

### Documentation References
- SmartThings API Docs: https://developer.smartthings.com/docs/api/public
- Nock Documentation: https://github.com/nock/nock
- Vitest Documentation: https://vitest.dev/
- MCP Protocol Spec: https://modelcontextprotocol.io/

### Code References
**Services to Test:**
- `/Users/masa/Projects/mcp-smartthings/src/services/DiagnosticWorkflow.ts`
- `/Users/masa/Projects/mcp-smartthings/src/services/DeviceService.ts`
- `/Users/masa/Projects/mcp-smartthings/src/smartthings/client.ts`

**Existing Test Patterns:**
- `/Users/masa/Projects/mcp-smartthings/tests/integration/chatbot-flow.test.ts` (mock pattern)
- `/Users/masa/Projects/mcp-smartthings/tests/integration/mcp-client.test.ts` (real integration)
- `/Users/masa/Projects/mcp-smartthings/tests/unit/platforms/smartthings/SmartThingsAdapter.test.ts` (unit test pattern)

---

## Appendix A: Example Fixtures

### Example 1: alcove-events.json
```json
{
  "items": [
    {
      "deviceId": "alcove-device-123",
      "componentId": "main",
      "capability": "switch",
      "attribute": "switch",
      "value": "on",
      "unit": null,
      "data": {},
      "stateChange": true,
      "eventSource": "DEVICE",
      "time": "2024-11-28T20:00:00.000Z"
    },
    {
      "deviceId": "alcove-device-123",
      "componentId": "main",
      "capability": "switch",
      "attribute": "switch",
      "value": "off",
      "unit": null,
      "data": {},
      "stateChange": true,
      "eventSource": "APP",
      "time": "2024-11-28T20:00:05.000Z"
    },
    {
      "deviceId": "alcove-device-123",
      "componentId": "main",
      "capability": "switch",
      "attribute": "switch",
      "value": "on",
      "unit": null,
      "data": {},
      "stateChange": true,
      "eventSource": "RULE",
      "time": "2024-11-28T20:00:10.000Z"
    }
  ]
}
```

### Example 2: device-list.json
```json
{
  "items": [
    {
      "deviceId": "alcove-device-123",
      "name": "Master Alcove Bar",
      "label": "Master Alcove Bar",
      "deviceManufacturerCode": "Philips",
      "locationId": "location-456",
      "roomId": "room-789",
      "type": "Light",
      "components": [
        {
          "id": "main",
          "capabilities": [
            { "id": "switch", "version": 1 },
            { "id": "switchLevel", "version": 1 },
            { "id": "colorControl", "version": 1 }
          ]
        }
      ]
    }
  ]
}
```

---

## Appendix B: Test Execution Commands

### Run All Tests
```bash
pnpm test
```

### Run Integration Tests Only
```bash
pnpm test:integration
```

### Run Specific Test File
```bash
pnpm vitest run src/services/__tests__/DiagnosticWorkflow.nock.test.ts
```

### Run with Coverage
```bash
pnpm test:coverage
```

### Watch Mode (for development)
```bash
pnpm test:watch
```

---

## Appendix C: Ticket 1M-311 Acceptance Criteria Checklist

- [ ] Create integration test suite with nock for API mocking
- [ ] Add Alcove device event fixtures
- [ ] Test end-to-end workflow with realistic event data
- [ ] Add rate limit handling tests
- [ ] Add timeout handling tests
- [ ] Test error scenarios (device not found, API errors)
- [ ] Document test setup and execution
- [ ] Add CI/CD pipeline integration

**Progress:** 0/8 (0%)

---

## Memory Updates

```json
{
  "remember": [
    "Ticket 1M-311 requires nock-based integration tests with real API fixtures (Alcove events, device list)",
    "Project has comprehensive unit tests but missing API response structure validation",
    "Existing integration tests use custom mocks (chatbot-flow.test.ts) or real APIs (DiagnosticWorkflow.integration.test.ts)",
    "nock is NOT currently installed - needs: pnpm add -D nock @types/nock",
    "Estimated effort: 2 days (32 hours) for complete implementation",
    "Priority tests: TC-1 Alcove workflow, TC-2 Rate limit handling",
    "Fixtures needed: alcove-events.json, device-list.json, alcove-device.json",
    "Test helper file needed: tests/helpers/api-mocks.ts"
  ]
}
```
