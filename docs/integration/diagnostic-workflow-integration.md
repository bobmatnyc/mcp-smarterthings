# Diagnostic Workflow Integration Guide

**Version:** 1.0.0
**Date:** 2025-11-28
**Ticket:** [BUG-1M-307](https://linear.app/1m-hyperdev/issue/1M-307)
**Status:** Production Ready

## Overview

This guide explains how to integrate the Diagnostic Workflow into chatbots, CLIs, and MCP tools to provide intelligent troubleshooting capabilities. The workflow orchestrates device discovery, event analysis, and pattern detection to generate actionable diagnostic reports.

## Quick Start

### Basic Integration

```typescript
import { DiagnosticWorkflow } from './services/DiagnosticWorkflow.js';
import { IntentClassifier } from './services/IntentClassifier.js';
import { SemanticIndex } from './services/SemanticIndex.js';
import { DeviceService } from './services/DeviceService.js';
import { DeviceRegistry } from './abstract/DeviceRegistry.js';

// Initialize dependencies
const semanticIndex = new SemanticIndex(chromaClient, deviceRegistry);
const deviceService = new DeviceService(smartthingsClient);
const intentClassifier = new IntentClassifier();

// Create workflow instance
const diagnosticWorkflow = new DiagnosticWorkflow(
  semanticIndex,
  deviceService,
  deviceRegistry
);

// Execute diagnostic workflow
const userQuery = "Why did my Alcove light turn on by itself?";
const classification = await intentClassifier.classifyIntent(userQuery);

const diagnosticReport = await diagnosticWorkflow.executeDiagnosticWorkflow(
  classification,
  userQuery
);

// Use diagnostic report
console.log(diagnosticReport.summary);
console.log(diagnosticReport.recommendations);
console.log(diagnosticReport.richContext); // For LLM injection
```

## Pattern Detection Integration

### Accessing Pattern Detection Results

```typescript
const diagnosticReport = await diagnosticWorkflow.executeDiagnosticWorkflow(
  classification,
  userQuery
);

// Access detected patterns
const patterns = diagnosticReport.diagnosticContext.relatedIssues || [];

patterns.forEach(pattern => {
  console.log(`Pattern Type: ${pattern.type}`);
  console.log(`Description: ${pattern.description}`);
  console.log(`Occurrences: ${pattern.occurrences}`);
  console.log(`Confidence: ${(pattern.confidence * 100).toFixed(0)}%`);
});
```

### Pattern-Based Recommendation Logic

```typescript
// High-confidence automation trigger detection
const automationTrigger = patterns.find(p =>
  p.type === 'rapid_changes' && p.confidence >= 0.95
);

if (automationTrigger) {
  console.log('🤖 Automation detected!');
  console.log('Action: Check SmartThings app → Automations');
  console.log(`Confidence: ${(automationTrigger.confidence * 100).toFixed(0)}%`);
}

// Connectivity issue detection
const connectivityIssue = patterns.find(p =>
  p.type === 'connectivity_gap'
);

if (connectivityIssue) {
  console.log('📡 Connectivity issue detected');
  console.log('Action: Check network and SmartThings hub');
}

// Normal operation
const normalPattern = patterns.find(p => p.type === 'normal');

if (normalPattern) {
  console.log('✅ Device operating normally');
}
```

### Using Confidence Scores for Recommendation Specificity

```typescript
const rapidIssue = patterns.find(p => p.type === 'rapid_changes');

if (rapidIssue) {
  if (rapidIssue.confidence >= 0.95) {
    // High confidence - specific recommendation
    console.log('Recommendation: Look for "when device turns off, turn back on" automation logic');
  } else if (rapidIssue.confidence >= 0.85) {
    // Medium confidence - general recommendation
    console.log('Recommendation: Check SmartThings automations affecting this device');
  } else {
    // Low confidence - manual investigation
    console.log('Recommendation: Review recent device activity in SmartThings app');
  }
}
```

## Chatbot Integration

### ChatOrchestrator Integration

**File**: `src/services/chat-orchestrator.ts`

```typescript
import { DiagnosticWorkflow } from './DiagnosticWorkflow.js';
import { IntentClassifier } from './IntentClassifier.js';

export class ChatOrchestrator {
  private diagnosticWorkflow: DiagnosticWorkflow;
  private intentClassifier: IntentClassifier;

  async processMessage(userMessage: string): Promise<string> {
    // Step 1: Classify intent
    const classification = await this.intentClassifier.classifyIntent(userMessage);

    // Step 2: Check if diagnostic workflow is needed
    if (this.needsDiagnostics(classification.intent)) {
      // Step 3: Execute diagnostic workflow
      const diagnosticReport = await this.diagnosticWorkflow.executeDiagnosticWorkflow(
        classification,
        userMessage
      );

      // Step 4: Inject diagnostic context into LLM system prompt
      const systemPrompt = this.buildSystemPrompt(diagnosticReport);

      // Step 5: Get LLM response with diagnostic context
      const response = await this.llmService.chat({
        systemPrompt,
        userMessage,
        conversationHistory: this.history
      });

      return response;
    }

    // Regular chat flow (no diagnostics needed)
    return await this.llmService.chat({
      userMessage,
      conversationHistory: this.history
    });
  }

  private needsDiagnostics(intent: DiagnosticIntent): boolean {
    return ['device_health', 'issue_diagnosis', 'system_status'].includes(intent);
  }

  private buildSystemPrompt(diagnosticReport: DiagnosticReport): string {
    let systemPrompt = BASE_SYSTEM_PROMPT;

    // Inject diagnostic context
    systemPrompt += '\n\n## DIAGNOSTIC CONTEXT\n\n';
    systemPrompt += diagnosticReport.richContext;

    // Add recommendations
    if (diagnosticReport.recommendations.length > 0) {
      systemPrompt += '\n\n## RECOMMENDED ACTIONS\n\n';
      diagnosticReport.recommendations.forEach((rec, idx) => {
        systemPrompt += `${idx + 1}. ${rec}\n`;
      });
    }

    return systemPrompt;
  }
}
```

### Example: Alcove Bar Automation Detection

**User Query**: "Why did my Alcove light turn on by itself at 12:34 AM?"

**Workflow Execution**:

```typescript
// 1. Intent classification
const classification = {
  intent: 'issue_diagnosis',
  entities: { deviceName: 'Alcove light' },
  confidence: 0.95
};

// 2. Diagnostic workflow
const diagnosticReport = await diagnosticWorkflow.executeDiagnosticWorkflow(
  classification,
  userQuery
);

// 3. Pattern detection result
diagnosticReport.diagnosticContext.relatedIssues = [
  {
    type: 'rapid_changes',
    description: 'Detected 1 rapid state changes (1 likely automation triggers)',
    occurrences: 1,
    confidence: 0.95
  }
];

// 4. Recommendations
diagnosticReport.recommendations = [
  'Check SmartThings app → Automations for rules affecting this device',
  'High confidence automation trigger detected. Look for "when device turns off, turn back on" logic',
  'Review motion sensor automations that may be triggering this device',
  'Check for scheduled routines executing around the time of the issue'
];

// 5. LLM system prompt injection
const systemPrompt = `
You are a SmartThings troubleshooting assistant.

## DIAGNOSTIC CONTEXT

### Device Information
- Name: Master Alcove Bar
- ID: abc123
- Room: Master Bedroom
- Capabilities: switch, powerMeter

### Recent Events
- 2025-11-28T00:34:44Z: switch.switch = off
- 2025-11-28T00:34:47Z: switch.switch = on (3s gap - AUTOMATION TRIGGER)

### Related Issues Detected
- rapid_changes: Detected 1 rapid state changes (1 likely automation triggers) (1 occurrences, 95% confidence)

## RECOMMENDED ACTIONS

1. Check SmartThings app → Automations for rules affecting this device
2. High confidence automation trigger detected. Look for "when device turns off, turn back on" logic
3. Review motion sensor automations that may be triggering this device
4. Check for scheduled routines executing around the time of the issue
`;

// 6. LLM generates contextual response
const llmResponse = await llmService.chat({ systemPrompt, userMessage });

// Example LLM response:
// "Based on the diagnostic analysis, your Alcove light turned on automatically due to a
// SmartThings automation. I detected a 3-second gap between the manual turn-off and automatic
// turn-on, which is a strong indicator of automation control (95% confidence).
//
// Here's what to do:
// 1. Open the SmartThings app and go to Automations
// 2. Look for any rules affecting 'Master Alcove Bar'
// 3. Check if there's a rule like 'When Alcove Bar turns off, turn it back on'
// 4. Also check if motion sensors (like Master Alcove Motion Sensor) are triggering this light
//
// Would you like me to help you review your automations?"
```

## CLI Integration

### Interactive Diagnostic CLI

**File**: `src/cli/diagnostics.ts`

```typescript
import inquirer from 'inquirer';
import { DiagnosticWorkflow } from '../services/DiagnosticWorkflow.js';
import { IntentClassifier } from '../services/IntentClassifier.js';

export async function runDiagnostics() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: 'Describe the issue:',
      default: 'Check my bedroom motion sensor'
    }
  ]);

  console.log('\nAnalyzing...\n');

  const classification = await intentClassifier.classifyIntent(answers.query);
  const diagnosticReport = await diagnosticWorkflow.executeDiagnosticWorkflow(
    classification,
    answers.query
  );

  // Display results
  console.log('=== DIAGNOSTIC REPORT ===\n');
  console.log(`Summary: ${diagnosticReport.summary}\n`);

  // Display patterns
  const patterns = diagnosticReport.diagnosticContext.relatedIssues || [];
  if (patterns.length > 0) {
    console.log('=== DETECTED PATTERNS ===\n');
    patterns.forEach(pattern => {
      const confidencePercent = (pattern.confidence * 100).toFixed(0);
      console.log(`🔍 ${pattern.type.toUpperCase()} (${confidencePercent}% confidence)`);
      console.log(`   ${pattern.description}`);
      console.log(`   Occurrences: ${pattern.occurrences}\n`);
    });
  }

  // Display recommendations
  if (diagnosticReport.recommendations.length > 0) {
    console.log('=== RECOMMENDATIONS ===\n');
    diagnosticReport.recommendations.forEach((rec, idx) => {
      console.log(`${idx + 1}. ${rec}`);
    });
  }

  console.log('\n=== FULL DIAGNOSTIC CONTEXT ===\n');
  console.log(diagnosticReport.richContext);
}
```

**Usage**:
```bash
npm run diagnostics

# Output:
# ? Describe the issue: Why did my Alcove light turn on?
#
# Analyzing...
#
# === DIAGNOSTIC REPORT ===
#
# Summary: Diagnostic data gathered for Master Alcove Bar (status: online)
#
# === DETECTED PATTERNS ===
#
# 🔍 RAPID_CHANGES (95% confidence)
#    Detected 1 rapid state changes (1 likely automation triggers)
#    Occurrences: 1
#
# === RECOMMENDATIONS ===
#
# 1. Check SmartThings app → Automations for rules affecting this device
# 2. High confidence automation trigger detected. Look for "when device turns off, turn back on" logic
# ...
```

## MCP Tool Integration

### Semantic Search Tool

**Tool Definition**: `src/mcp/tools/semantic-search.ts`

```typescript
{
  name: 'semantic-search',
  description: 'Search devices using natural language queries',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      limit: { type: 'number', description: 'Maximum results', default: 5 }
    },
    required: ['query']
  }
}
```

**Integration with DiagnosticWorkflow**:

```typescript
// Semantic search is used internally by DiagnosticWorkflow for device resolution
const device = await this.semanticIndex.searchDevices(
  entities.deviceName,
  { limit: 1, minSimilarity: 0.7 }
);
```

**Example**:
```json
{
  "name": "semantic-search",
  "arguments": {
    "query": "motion sensors in bedrooms",
    "limit": 5
  }
}
```

### Device Events Tool

**Tool Definition**: `src/mcp/tools/device-events.ts`

```typescript
{
  name: 'device-events',
  description: 'Retrieve device event history for troubleshooting',
  inputSchema: {
    type: 'object',
    properties: {
      deviceId: { type: 'string', description: 'Device ID' },
      limit: { type: 'number', description: 'Maximum events', default: 100 },
      timeRange: { type: 'string', description: 'Time range (e.g., "24h", "7d")' }
    },
    required: ['deviceId']
  }
}
```

**Integration with Pattern Detection**:

```typescript
// Device events are fetched and analyzed for patterns automatically
const result = await this.getRecentEvents(deviceId, 100);
const patterns = await this.detectPatterns(deviceId);
```

**Example**:
```json
{
  "name": "device-events",
  "arguments": {
    "deviceId": "abc123",
    "limit": 100,
    "timeRange": "24h"
  }
}
```

**Response includes pattern detection**:
```json
{
  "events": [...],
  "patterns": [
    {
      "type": "rapid_changes",
      "description": "Detected 1 rapid state changes (1 likely automation triggers)",
      "occurrences": 1,
      "confidence": 0.95
    }
  ],
  "recommendations": [
    "Check SmartThings app → Automations for rules affecting this device"
  ]
}
```

## Error Handling and Graceful Degradation

### Handling Partial Failures

```typescript
// DiagnosticWorkflow uses Promise.allSettled for graceful degradation
const dataGatheringTasks = this.buildDataGatheringPlan(classification.intent, device);
const results = await Promise.allSettled(dataGatheringTasks);

// Populate context with successful results only
this.populateContext(context, results);

// Example: If event retrieval fails, still use device health data
if (context.healthData && !context.recentEvents) {
  console.log('Events unavailable, using health data only');
}
```

### Pattern Detection Errors

```typescript
try {
  const patterns = await this.detectPatterns(deviceId);
  context.relatedIssues = patterns.value;
} catch (error) {
  logger.error('Pattern detection failed', { deviceId, error });
  // Graceful degradation: continue without patterns
  context.relatedIssues = [];
}
```

### Fallback Recommendations

```typescript
const recommendations: string[] = [];

// Pattern-based recommendations (preferred)
if (context.relatedIssues?.length > 0) {
  recommendations.push(...this.generatePatternRecommendations(context));
} else {
  // Fallback: generic health-based recommendations
  if (context.healthData?.online === false) {
    recommendations.push('Check device power supply and network connectivity');
  }
}
```

## Real-World Example: Alcove Bar Case

### Problem Statement

User manually turns off "Master Alcove Bar" light at 12:34:44 AM. Three seconds later (12:34:47 AM), the light turns on automatically. User asks: "Why did my Alcove light turn on by itself?"

### Diagnostic Workflow Execution

**Step 1: Intent Classification**
```typescript
const classification = await intentClassifier.classifyIntent(
  "Why did my Alcove light turn on by itself?"
);

// Result:
{
  intent: 'issue_diagnosis',
  entities: { deviceName: 'Alcove light' },
  confidence: 0.95
}
```

**Step 2: Device Resolution**
```typescript
// Semantic search finds "Master Alcove Bar" (96% similarity)
const device = await semanticIndex.searchDevices('Alcove light', { limit: 1 });

// Result:
{
  deviceId: 'abc123',
  name: 'Master Alcove Bar',
  room: 'Master Bedroom',
  capabilities: ['switch', 'powerMeter']
}
```

**Step 3: Event Retrieval**
```typescript
const events = await deviceService.getDeviceEvents(deviceId, { limit: 100 });

// Result (filtered to relevant events):
[
  {
    time: '2025-11-28T00:34:44Z',
    epoch: 1732752884000,
    attribute: 'switch',
    value: 'off'
  },
  {
    time: '2025-11-28T00:34:47Z',
    epoch: 1732752887000,
    attribute: 'switch',
    value: 'on'
  }
]
```

**Step 4: Pattern Detection**
```typescript
const patterns = await detectPatterns(deviceId);

// Result:
[
  {
    type: 'rapid_changes',
    description: 'Detected 1 rapid state changes (1 likely automation triggers)',
    occurrences: 1,
    confidence: 0.95  // <5s gap → high confidence
  }
]
```

**Step 5: Recommendation Generation**
```typescript
const recommendations = generateRecommendations(context);

// Result:
[
  'Check SmartThings app → Automations for rules affecting this device',
  'High confidence automation trigger detected. Look for "when device turns off, turn back on" logic',
  'Review motion sensor automations that may be triggering this device',
  'Check for scheduled routines executing around the time of the issue'
]
```

**Step 6: LLM Response**

With diagnostic context injected, the LLM generates:

> "I've analyzed your Alcove light and found strong evidence of automation control. The light turned on automatically just 3 seconds after you turned it off - this timing is characteristic of a SmartThings automation rule (95% confidence).
>
> Here's what I recommend:
>
> 1. **Check your automations**: Open the SmartThings app, go to Automations, and look for any rules that affect 'Master Alcove Bar'
>
> 2. **Look for re-trigger logic**: Search for automations with conditions like 'When Master Alcove Bar turns off, turn it back on' - this is a common pattern
>
> 3. **Review motion sensors**: I see you have a 'Master Alcove Motion Sensor' nearby. Check if motion detection is triggering the light
>
> 4. **Check scheduled routines**: The event occurred at 12:34 AM - see if any routines run around that time
>
> Would you like me to help you review your automations, or should I check if other devices have similar patterns?"

### Validation

- ✅ **Pattern Detection**: 95% confidence automation trigger (matches manual investigation)
- ✅ **Time Gap**: 3 seconds detected correctly
- ✅ **Recommendations**: Actionable and specific
- ✅ **Performance**: <500ms end-to-end workflow
- ✅ **User Experience**: Clear, contextual guidance

## Performance Optimization

### Parallel Data Gathering

```typescript
// Execute all data gathering tasks in parallel
const tasks = [
  this.getDeviceHealth(deviceId),
  this.getRecentEvents(deviceId, 100),
  this.detectPatterns(deviceId),
  this.findSimilarDevices(deviceId, 3)
];

const results = await Promise.allSettled(tasks);

// Total time ≈ max(task times), not sum(task times)
// Example: 300ms vs 1200ms if sequential
```

### Caching Device Data

```typescript
// Cache frequently accessed devices
const deviceCache = new Map<DeviceId, UnifiedDevice>();

private async getDevice(deviceId: DeviceId): Promise<UnifiedDevice> {
  if (this.deviceCache.has(deviceId)) {
    return this.deviceCache.get(deviceId)!;
  }

  const device = await this.deviceService.getDevice(deviceId);
  this.deviceCache.set(deviceId, device);
  return device;
}
```

### Limiting Event History

```typescript
// Intent-specific event limits
const eventLimits = {
  device_health: 50,      // Quick health check
  issue_diagnosis: 100,   // Detailed troubleshooting
  discovery: 0            // No events needed
};

const limit = eventLimits[intent] || 100;
const events = await this.getRecentEvents(deviceId, limit);
```

## Testing Integration

### Unit Tests

```typescript
// Test pattern detection in isolation
describe('Pattern Detection Integration', () => {
  it('should detect automation triggers', async () => {
    const mockEvents = [
      { time: '2025-11-28T00:34:44Z', attribute: 'switch', value: 'off' },
      { time: '2025-11-28T00:34:47Z', attribute: 'switch', value: 'on' }
    ];

    vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
      events: mockEvents,
      metadata: { totalCount: 2 },
      summary: ''
    });

    const report = await workflow.executeDiagnosticWorkflow(
      classification,
      'why did light turn on?'
    );

    expect(report.diagnosticContext.relatedIssues).toHaveLength(1);
    expect(report.diagnosticContext.relatedIssues[0]).toMatchObject({
      type: 'rapid_changes',
      confidence: 0.95
    });
  });
});
```

### Integration Tests

```typescript
// Test full workflow with real SmartThings API
describe('End-to-End Diagnostic Workflow', () => {
  it('should diagnose Alcove Bar automation trigger', async () => {
    const userQuery = "Why did my Alcove light turn on?";

    const classification = await intentClassifier.classifyIntent(userQuery);
    const report = await diagnosticWorkflow.executeDiagnosticWorkflow(
      classification,
      userQuery
    );

    // Validate pattern detection
    expect(report.diagnosticContext.relatedIssues).toBeDefined();
    const automationPattern = report.diagnosticContext.relatedIssues.find(
      p => p.type === 'rapid_changes' && p.confidence >= 0.95
    );
    expect(automationPattern).toBeDefined();

    // Validate recommendations
    expect(report.recommendations).toContain(
      expect.stringMatching(/automation/i)
    );
  });
});
```

## Troubleshooting Integration Issues

### Issue: Empty Pattern Detection

**Symptom**: `relatedIssues: []` in diagnostic report

**Debugging**:
```typescript
// Check event count
const events = await deviceService.getDeviceEvents(deviceId, { limit: 100 });
console.log(`Total events: ${events.events.length}`);

// Check for state-change events
const stateEvents = events.events.filter(e =>
  ['switch', 'lock', 'contact'].includes(e.attribute)
);
console.log(`State events: ${stateEvents.length}`);

// If < 2 state events, pattern detection will return empty
```

**Solution**:
- Ensure device has recent activity (check last 24 hours)
- Verify device supports state-change attributes (switch, lock, contact)
- Check SmartThings API for event history availability

### Issue: Low Confidence Scores

**Symptom**: Patterns detected with confidence <0.80

**Debugging**:
```typescript
// Examine time gaps manually
const sorted = events.sort((a, b) => a.epoch - b.epoch);
for (let i = 1; i < sorted.length; i++) {
  const gapMs = sorted[i].epoch - sorted[i-1].epoch;
  console.log(`Gap: ${gapMs}ms (${Math.round(gapMs/1000)}s)`);
}
```

**Solution**:
- Gaps 5-10s result in 85% confidence (expected)
- Mixed automation and manual control reduces confidence
- Review event history to confirm pattern ambiguity

### Issue: Workflow Timeout

**Symptom**: Diagnostic workflow exceeds 500ms target

**Debugging**:
```typescript
// Add timing logs
const start = Date.now();

const classification = await intentClassifier.classifyIntent(userQuery);
console.log(`Intent: ${Date.now() - start}ms`);

const report = await workflow.executeDiagnosticWorkflow(classification, userQuery);
console.log(`Workflow: ${Date.now() - start}ms`);
```

**Solution**:
- Enable caching for frequently accessed devices
- Reduce event fetch limit (100 → 50 for device_health intent)
- Check SmartThings API latency (may need retry logic)

## Related Documentation

- [Diagnostic Framework Overview](../diagnostic-framework-overview.md)
- [Pattern Detection API Reference](../api/pattern-detection-api.md)
- [Troubleshooting Patterns Guide](../troubleshooting-patterns-guide.md)
- [Transformation Layer Integration](./transformation-layer-integration.md)

## References

- **Ticket**: [BUG-1M-307](https://linear.app/1m-hyperdev/issue/1M-307)
- **Implementation**: `src/services/DiagnosticWorkflow.ts`
- **Chat Integration**: `src/services/chat-orchestrator.ts`
- **MCP Tools**: `src/mcp/tools/`
- **Tests**: `src/services/__tests__/DiagnosticWorkflow.integration.test.ts`

---

**Last Updated**: 2025-11-28
**Version**: 1.0.0
**Status**: Production Ready
