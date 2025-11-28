# Tickets to Create - Diagnostic Framework Gap Analysis

**Generated From:** Diagnostic Framework Test (Master Alcove Bar Light Issue)
**Date:** November 28, 2025
**Total Tickets:** 6 (2 bugs, 4 enhancements)

---

## Critical Bugs (Blocking Production)

### BUG-1M-305: Pattern Detection Not Implemented

**Priority:** P0 (Critical)
**Severity:** Blocks root cause analysis
**Affects:** All ISSUE_DIAGNOSIS workflows

**Description:**
The `DiagnosticWorkflow.detectPatterns()` method returns an empty array instead of analyzing event patterns. This prevents the framework from identifying automation triggers, rapid state changes, or connectivity issues.

**Reproduction:**
```typescript
const workflow = new DiagnosticWorkflow(semanticIndex, deviceService, deviceRegistry);
const classification = {
  intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
  entities: { deviceName: "Master Alcove Bar" }
};
const report = await workflow.executeDiagnosticWorkflow(classification, "query");

console.log(report.diagnosticContext.relatedIssues);
// Output: [] (ALWAYS EMPTY)
```

**Expected Behavior:**
Detect patterns such as:
- Rapid state changes (<10 second gaps)
- Automation triggers (<5 second gaps)
- Connectivity issues (large event gaps)

**Current Code:**
```typescript
// File: src/services/DiagnosticWorkflow.ts:757-763
private async detectPatterns(_deviceId: DeviceId): Promise<{ type: string; value: IssuePattern[] }> {
  // Placeholder: Pattern detection not yet implemented
  return {
    type: 'patterns',
    value: [],  // ← PROBLEM: Always empty
  };
}
```

**Proposed Fix:**
```typescript
private async detectPatterns(deviceId: DeviceId): Promise<{ type: string; value: IssuePattern[] }> {
  const result = await this.getRecentEvents(deviceId, 100);
  const events = result.value;
  const patterns: IssuePattern[] = [];

  // Detect rapid state changes
  const rapidChanges = this.detectRapidChanges(events);
  if (rapidChanges.length > 0) {
    patterns.push({
      type: 'rapid_changes',
      description: `Detected ${rapidChanges.length} rapid state changes`,
      occurrences: rapidChanges.length,
      confidence: 0.9,
    });
  }

  // Detect event gaps (connectivity issues)
  const gaps = this.detectEventGaps(events);
  if (gaps.length > 0) {
    patterns.push({
      type: 'connectivity_gap',
      description: `Found ${gaps.length} event gaps suggesting connectivity issues`,
      occurrences: gaps.length,
      confidence: 0.8,
    });
  }

  return { type: 'patterns', value: patterns };
}

private detectRapidChanges(events: DeviceEvent[]): Array<{gap: number; from: string; to: string}> {
  const changes = [];
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];

    if (current && next && current.value !== next.value) {
      const gap = Math.abs(current.epoch - next.epoch);
      if (gap < 10000) { // 10 seconds
        changes.push({ gap, from: next.value, to: current.value });
      }
    }
  }
  return changes;
}

private detectEventGaps(events: DeviceEvent[]): number[] {
  const gaps = [];
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    const gap = Math.abs(current.epoch - next.epoch);
    if (gap > 3600000) { // 1 hour
      gaps.push(gap);
    }
  }
  return gaps;
}
```

**Test Cases:**
1. Test rapid change detection with <10s gaps
2. Test automation detection with <5s gaps
3. Test connectivity gap detection with >1h gaps
4. Test with Alcove light real events

**Impact:**
- Framework cannot identify automation triggers
- Manual investigation required (15 min vs <500ms)
- Users don't get root cause analysis

**Estimate:** 2-3 days

**Files to Modify:**
- `src/services/DiagnosticWorkflow.ts`
- `src/services/__tests__/DiagnosticWorkflow.test.ts` (add pattern tests)

---

### BUG-1M-306: Automation Recommendations Not Generated

**Priority:** P1 (High)
**Severity:** Recommendations incomplete
**Affects:** User experience, troubleshooting guidance

**Description:**
The framework has a recommendation for "automation loops" but it only triggers if patterns are detected. Since `detectPatterns()` returns empty (BUG-1M-305), the automation recommendation never appears. Users with automation issues get generic "check network" advice instead of actionable steps.

**Reproduction:**
```typescript
const context = {
  relatedIssues: [], // Empty because detectPatterns() not implemented
};
const recommendations = generateRecommendations(context);

console.log(recommendations);
// Missing: "Check SmartThings app → Automations"
```

**Expected Behavior:**
When rapid state changes are detected, recommend:
1. "Check SmartThings app → Automations for rules affecting this device"
2. "Review motion sensor automations that may be triggering this device"
3. "Check for scheduled routines executing around the time of the issue"

**Current Code:**
```typescript
// File: src/services/DiagnosticWorkflow.ts:572-579
// Rapid changes recommendations
if (context.relatedIssues?.some((issue) => issue.type === 'rapid_changes')) {
  recommendations.push('Detected rapid state changes. Check for automation loops or faulty sensors.');
}
// ↑ This never executes because relatedIssues is always empty
```

**Proposed Fix:**
```typescript
// Enhanced recommendations
if (context.relatedIssues?.some((issue) => issue.type === 'rapid_changes')) {
  recommendations.push('Check SmartThings app → Automations for rules affecting this device');
  recommendations.push('Review motion sensor automations that may be triggering this device');

  // Calculate fastest gap for more specific guidance
  const rapidIssue = context.relatedIssues.find(i => i.type === 'rapid_changes');
  if (rapidIssue && rapidIssue.occurrences > 0) {
    if (rapidIssue.confidence > 0.9) {
      recommendations.push('High confidence automation trigger detected. Check for "when device turns off, turn back on" logic');
    }
  }
}

// Add motion sensor recommendation if similar devices include motion sensors
if (context.similarDevices?.some(d => d.device.metadata.capabilities.includes('motionSensor'))) {
  recommendations.push('Motion sensor detected in same room. Check if motion triggers this device');
}
```

**Test Cases:**
1. Test automation recommendation appears when rapid changes detected
2. Test motion sensor recommendation when similar device is motion sensor
3. Test confidence-based recommendation specificity

**Dependencies:**
- Requires BUG-1M-305 to be fixed first (pattern detection)

**Impact:**
- Users don't get actionable troubleshooting steps
- Manual review of automations required
- Reduced framework usefulness

**Estimate:** 1 day

**Files to Modify:**
- `src/services/DiagnosticWorkflow.ts` (generateRecommendations method)
- `src/services/__tests__/DiagnosticWorkflow.test.ts` (add recommendation tests)

---

## High Priority Enhancements

### ENHANCEMENT-1M-307: Add Time Gap Analysis Helper

**Priority:** P1 (High)
**Type:** Feature - Utility Function
**Component:** DiagnosticWorkflow

**Description:**
Add utility function to calculate time gaps between consecutive events. This is foundational for automation detection and pattern analysis.

**Use Cases:**
1. Detect automation triggers (<5s gaps indicate automation)
2. Identify connectivity issues (>1h gaps indicate offline periods)
3. Analyze event frequency patterns

**Proposed Implementation:**
```typescript
/**
 * Calculate time gaps between consecutive events.
 *
 * @param events Array of device events (should be sorted by time)
 * @returns Array of time gaps in milliseconds
 */
function calculateEventGaps(events: DeviceEvent[]): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    if (current && next) {
      gaps.push(Math.abs(current.epoch - next.epoch));
    }
  }
  return gaps;
}

/**
 * Find events with rapid state changes.
 *
 * @param events Array of device events
 * @param threshold Max time gap in ms (default: 10000ms = 10s)
 * @returns Events with rapid changes and their gaps
 */
function findRapidChanges(
  events: DeviceEvent[],
  threshold = 10000
): Array<{
  gap: number;
  fromValue: string;
  toValue: string;
  timestamp: string;
}> {
  const rapidChanges = [];
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];

    if (current && next && current.value !== next.value) {
      const gap = Math.abs(current.epoch - next.epoch);
      if (gap < threshold) {
        rapidChanges.push({
          gap,
          fromValue: next.value,
          toValue: current.value,
          timestamp: current.time,
        });
      }
    }
  }
  return rapidChanges;
}
```

**Test Cases:**
```typescript
describe('Time Gap Analysis', () => {
  it('should calculate gaps between events', () => {
    const events = [
      { epoch: 1000 },
      { epoch: 4000 },
      { epoch: 7000 },
    ];
    expect(calculateEventGaps(events)).toEqual([3000, 3000]);
  });

  it('should find rapid changes', () => {
    const events = [
      { epoch: 1000, value: 'off' },
      { epoch: 4000, value: 'on' },  // 3s gap
    ];
    const changes = findRapidChanges(events);
    expect(changes[0].gap).toBe(3000);
  });
});
```

**Estimate:** 1 day

**Files to Create/Modify:**
- `src/utils/event-analysis.ts` (new file)
- `src/utils/__tests__/event-analysis.test.ts` (new file)
- `src/services/DiagnosticWorkflow.ts` (import and use)

---

### ENHANCEMENT-1M-308: Add Rapid Change Detection

**Priority:** P1 (High)
**Type:** Feature - Pattern Detection
**Component:** DiagnosticWorkflow

**Description:**
Implement rapid state change detection algorithm to identify potential automation triggers. This is the core of automation detection.

**Detection Logic:**
1. Filter events to switch/state-changing capabilities
2. Find consecutive events with opposite values (on→off, off→on)
3. Calculate time gap between state changes
4. Classify based on gap duration:
   - <5s: Very likely automation
   - 5-10s: Likely automation or sensor trigger
   - >10s: Normal user behavior

**Proposed Implementation:**
```typescript
interface RapidChangePattern {
  gap: number;
  fromValue: string;
  toValue: string;
  timestamp: string;
  confidence: number;
  likelyAutomation: boolean;
}

/**
 * Detect rapid state changes indicating automation.
 *
 * @param events Device events to analyze
 * @param thresholds Optional thresholds for classification
 * @returns Detected rapid change patterns
 */
function detectRapidChanges(
  events: DeviceEvent[],
  thresholds = {
    veryLikely: 5000,    // 5 seconds
    likely: 10000,       // 10 seconds
  }
): RapidChangePattern[] {
  const patterns: RapidChangePattern[] = [];

  // Filter to switch/state events
  const stateEvents = events.filter(e =>
    e.capability === 'switch' && e.attribute === 'switch' ||
    e.capability === 'lock' && e.attribute === 'lock'
  );

  for (let i = 0; i < stateEvents.length - 1; i++) {
    const current = stateEvents[i];
    const next = stateEvents[i + 1];

    if (!current || !next || current.value === next.value) {
      continue;
    }

    const gap = Math.abs(current.epoch - next.epoch);

    let confidence = 0.5;
    let likelyAutomation = false;

    if (gap < thresholds.veryLikely) {
      confidence = 0.95;
      likelyAutomation = true;
    } else if (gap < thresholds.likely) {
      confidence = 0.80;
      likelyAutomation = true;
    }

    if (gap < thresholds.likely) {
      patterns.push({
        gap,
        fromValue: next.value,
        toValue: current.value,
        timestamp: current.time,
        confidence,
        likelyAutomation,
      });
    }
  }

  return patterns;
}
```

**Integration:**
```typescript
// In DiagnosticWorkflow.detectPatterns()
private async detectPatterns(deviceId: DeviceId): Promise<{ type: string; value: IssuePattern[] }> {
  const result = await this.getRecentEvents(deviceId, 100);
  const rapidPatterns = detectRapidChanges(result.value);

  if (rapidPatterns.length > 0) {
    const automationCount = rapidPatterns.filter(p => p.likelyAutomation).length;
    const avgConfidence = rapidPatterns.reduce((sum, p) => sum + p.confidence, 0) / rapidPatterns.length;

    patterns.push({
      type: 'rapid_changes',
      description: `Detected ${rapidPatterns.length} rapid state changes (${automationCount} likely automation)`,
      occurrences: rapidPatterns.length,
      confidence: avgConfidence,
    });
  }

  return { type: 'patterns', value: patterns };
}
```

**Test Cases:**
```typescript
describe('Rapid Change Detection', () => {
  it('should detect automation trigger (<5s gap)', () => {
    const events = [
      { epoch: 1000, value: 'off', capability: 'switch' },
      { epoch: 4000, value: 'on', capability: 'switch' },
    ];
    const patterns = detectRapidChanges(events);
    expect(patterns[0].likelyAutomation).toBe(true);
    expect(patterns[0].confidence).toBeGreaterThan(0.9);
  });

  it('should not detect normal behavior (>10s gap)', () => {
    const events = [
      { epoch: 1000, value: 'off' },
      { epoch: 15000, value: 'on' },
    ];
    const patterns = detectRapidChanges(events);
    expect(patterns).toHaveLength(0);
  });
});
```

**Estimate:** 2 days

**Files to Modify:**
- `src/utils/event-analysis.ts` (add function)
- `src/utils/__tests__/event-analysis.test.ts` (add tests)
- `src/services/DiagnosticWorkflow.ts` (integrate)

---

## Medium Priority Enhancements

### ENHANCEMENT-1M-309: Add Automation Service Integration

**Priority:** P2 (Medium)
**Type:** Feature - New Service
**Component:** Services Layer

**Description:**
Create AutomationService to retrieve automations from SmartThings API. This allows the framework to show which automations involve a device, not just detect automation behavior from events.

**Benefits:**
1. List specific automations affecting a device
2. Show automation details (triggers, actions, schedule)
3. Recommend disabling specific automations for testing
4. Provide direct links to edit automations in SmartThings app

**API Integration:**
SmartThings SDK provides automation endpoints:
```typescript
const automations = await client.rules.list(); // All automations
const rule = await client.rules.get(ruleId);   // Specific automation
```

**Proposed Interface:**
```typescript
interface AutomationService extends ISmartThingsService {
  /**
   * Get automations involving a device.
   */
  getDeviceAutomations(deviceId: DeviceId): Promise<Automation[]>;

  /**
   * Get automation details.
   */
  getAutomation(automationId: string): Promise<AutomationDetail>;

  /**
   * List all automations.
   */
  listAutomations(): Promise<Automation[]>;
}

interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  triggers: AutomationTrigger[];
  actions: AutomationAction[];
}

interface AutomationDetail extends Automation {
  description?: string;
  createdDate: string;
  lastExecutedDate?: string;
  devices: DeviceId[];
}
```

**Integration with DiagnosticWorkflow:**
```typescript
// In buildDataGatheringPlan()
case 'issue_diagnosis':
  if (device) {
    tasks.push(this.getDeviceAutomations(toDeviceId(device.id)));
  }
  break;

// In populateContext()
case 'automations':
  context.automations = data.value;
  break;

// In generateRecommendations()
if (context.automations && context.automations.length > 0) {
  const enabledAutomations = context.automations.filter(a => a.enabled);
  if (enabledAutomations.length > 0) {
    recommendations.push(`Found ${enabledAutomations.length} active automations for this device. Review their triggers and actions.`);
  }
}
```

**Estimate:** 5 days (new service implementation)

**Files to Create:**
- `src/services/AutomationService.ts`
- `src/services/__tests__/AutomationService.test.ts`
- Update `src/services/DiagnosticWorkflow.ts`

**Complexity:** Medium (requires SmartThings SDK integration)

---

### ENHANCEMENT-1M-310: Improve Integration Test Coverage

**Priority:** P1 (High)
**Type:** Testing - Integration Tests
**Component:** Test Suite

**Description:**
Add integration tests that validate the diagnostic workflow against real (or realistic mock) device events. Current tests use mocks extensively but don't validate against actual API response structures.

**Test Coverage Gaps:**
1. No test with real Alcove device event data
2. No validation of SmartThings API response parsing
3. No end-to-end workflow test with complete event sequences
4. No rate limit handling tests

**Proposed Tests:**

**TC-5: Alcove Light Integration Test**
```typescript
describe('Alcove Light Integration Test', () => {
  it('should diagnose automation trigger from real events', async () => {
    // Use real event data from Alcove device
    const alcoveEvents = loadAlcoveEventFixture();

    // Mock SmartThings API to return this data
    nock('https://api.smartthings.com')
      .get(`/v1/devices/${ALCOVE_DEVICE_ID}/events`)
      .reply(200, alcoveEvents);

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

**TC-6: Rate Limit Handling**
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
});
```

**Test Data Setup:**
```typescript
// fixtures/alcove-events.json
{
  "items": [
    {
      "deviceId": "ae92f481-1425-4436-b332-de44ff915565",
      "time": "2025-11-28T00:34:51Z",
      "capability": "switch",
      "attribute": "switch",
      "value": "off"
    },
    {
      "deviceId": "ae92f481-1425-4436-b332-de44ff915565",
      "time": "2025-11-28T00:34:47Z",
      "capability": "switch",
      "attribute": "switch",
      "value": "on"
    },
    // ... more events
  ]
}
```

**Estimate:** 2 days

**Files to Create:**
- `src/services/__tests__/DiagnosticWorkflow.integration.test.ts` (already exists, enhance)
- `tests/fixtures/alcove-events.json` (new)
- `tests/fixtures/device-list.json` (new)

---

## Summary

**Total Tickets:** 6

**By Priority:**
- P0 (Critical): 1 bug
- P1 (High): 4 (1 bug, 3 enhancements)
- P2 (Medium): 1 enhancement

**By Type:**
- Bugs: 2
- Enhancements: 4

**Estimated Total Effort:** 11-14 days

**Critical Path (Blocking Production):**
1. BUG-1M-305: Pattern Detection (2-3 days)
2. BUG-1M-306: Automation Recommendations (1 day)
3. ENHANCEMENT-1M-310: Integration Tests (2 days)

**Total Critical Path:** 5-6 days

---

## Ticket Creation Order

**Week 1:**
1. ✅ BUG-1M-305 (Pattern Detection) - Day 1-3
2. ✅ ENHANCEMENT-1M-307 (Time Gap Analysis) - Day 2 (parallel)
3. ✅ ENHANCEMENT-1M-308 (Rapid Change Detection) - Day 3-4 (parallel)

**Week 2:**
4. ✅ BUG-1M-306 (Automation Recommendations) - Day 5
5. ✅ ENHANCEMENT-1M-310 (Integration Tests) - Day 6-7
6. ENHANCEMENT-1M-309 (Automation Service) - Future sprint

**Production Ready:** End of Week 2

---

**Document Version:** 1.0
**Last Updated:** November 28, 2025
**Next Review:** After BUG-1M-305 completion
