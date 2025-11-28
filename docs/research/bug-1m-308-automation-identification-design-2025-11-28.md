# BUG-1M-308: Automation Identification System Design

**Research Date:** November 28, 2025
**Ticket ID:** BUG-1M-308
**Title:** Automatic Identification of Controlling Automations for Devices
**Priority:** P1 - High (BLOCKS automated diagnostics)
**Estimate:** 3-5 days
**Researcher:** Research Agent
**Status:** Design Complete - Ready for Implementation

---

## Executive Summary

**CAPABILITY GAP:** The diagnostic framework can detect automation patterns with 95% confidence (BUG-1M-307), but cannot identify which specific automation/routine is controlling the device. This forces users to manually search the SmartThings app, defeating the purpose of automated diagnostics.

**REAL-WORLD SCENARIO (Alcove Bar Light):**
- ✅ **Current:** "High confidence automation detected - search SmartThings app manually"
- 🎯 **Target:** "Automation 'Evening Routine' (ID: rule-abc123) is turning off this light every 3 seconds"

**SOLUTION OVERVIEW:**

The SmartThings Rules API provides direct access to automation definitions, including which devices each rule controls. We can implement a three-tier identification strategy:

1. **Direct Query:** Query all rules for a location, filter by device ID
2. **Pattern Matching:** Match event timing patterns with rule execution history
3. **Metadata Analysis:** Parse rule actions to identify device references

**KEY FINDINGS:**

- ✅ SmartThings SDK v8.0.0 includes full Rules API support (`client.rules`)
- ✅ Rules API exposes device arrays in CommandAction structures
- ✅ Can filter rules by location (required parameter)
- ✅ Rule execution history available via separate endpoint (if enabled)
- ⚠️ Limitation: App-created routines may not appear in Rules API
- ⚠️ Limitation: No direct "which rules control device X" endpoint (requires filtering)

**IMPLEMENTATION COMPLEXITY:** Medium (3-5 days)
- API integration: 1 day
- Identification logic: 1-2 days
- Caching layer: 0.5 day
- Testing + fallbacks: 1-1.5 days

---

## Table of Contents

1. [SmartThings API Analysis](#1-smartthings-api-analysis)
2. [Automation Identification Strategies](#2-automation-identification-strategies)
3. [Data Structures and Types](#3-data-structures-and-types)
4. [Implementation Architecture](#4-implementation-architecture)
5. [Caching Strategy](#5-caching-strategy)
6. [Integration with Diagnostic Workflow](#6-integration-with-diagnostic-workflow)
7. [API Limitations and Fallback Strategies](#7-api-limitations-and-fallback-strategies)
8. [Performance Considerations](#8-performance-considerations)
9. [Error Handling](#9-error-handling)
10. [Testing Strategy](#10-testing-strategy)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Code Examples](#12-code-examples)

---

## 1. SmartThings API Analysis

### 1.1 Rules API Endpoints

**Base URL:** `https://api.smartthings.com/rules`

**Available Operations (via `@smartthings/core-sdk`):**

```typescript
// From node_modules/@smartthings/core-sdk/dist/endpoint/rules.d.ts
export declare class RulesEndpoint extends Endpoint {
  /**
   * List rules for a location
   * @param locationId UUID of location (required)
   */
  list(locationId?: string): Promise<Rule[]>;

  /**
   * Get specific rule details
   * @param id Rule UUID
   * @param locationId Location UUID
   */
  get(id: string, locationId?: string): Promise<Rule>;

  /**
   * Delete a rule
   */
  delete(id: string, locationId?: string): Promise<Rule>;

  /**
   * Create a rule
   */
  create(data: RuleRequest, locationId?: string): Promise<Rule>;

  /**
   * Update a rule
   */
  update(id: string, data: RuleRequest, locationId?: string): Promise<Rule>;

  /**
   * Execute a rule manually
   */
  execute(id: string, locationId?: string): Promise<RuleExecutionResponse>;
}
```

### 1.2 Rule Structure

**Rule Definition:**

```typescript
export interface Rule extends RuleRequest {
  id: string;                      // Rule UUID
  createdAt: string;               // ISO-8601 timestamp
  updatedBy: string;               // User/app ID
  updatedAt: string;               // ISO-8601 timestamp
  status: RuleStatus;              // 'Active' | 'Inactive' | 'Deleted'
  executeSource?: ExecutionSource; // 'Device' | 'Manual'
  creator?: RuleCreatorType;       // 'User' | 'SmartApp'
}

export interface RuleRequest {
  name: string;                    // Human-readable name
  actions: RuleAction[];           // Actions to execute
  timeZoneId?: string;             // Java timezone ID
}
```

**Device Control in Rules (CommandAction):**

```typescript
export interface CommandAction {
  devices: string[];               // Array of device IDs ← KEY FOR IDENTIFICATION
  commands: DeviceCommand[];       // Commands to execute
  sequence?: CommandSequence;      // Execution order
}

export interface DeviceCommand {
  component: string;               // Device component (e.g., "main")
  capability: string;              // Capability name (e.g., "switch")
  command: string;                 // Command name (e.g., "off")
  arguments?: RuleOperand[];       // Command arguments
}
```

**Device References in Conditions (DeviceOperand):**

```typescript
export interface DeviceOperand {
  devices: string[];               // Device IDs in condition ← ALSO IMPORTANT
  component: string;               // Component to monitor
  capability: string;              // Capability to check
  attribute: string;               // Attribute to evaluate
  trigger?: TriggerMode;           // 'Auto' | 'Always' | 'Never'
}
```

### 1.3 API Constraints

**Authentication:**
- Requires Personal Access Token (PAT) with Rules scopes:
  - "Rules > Read all rules"
  - "Rules > Write all rules" (only for create/update/delete)
  - "Rules > Execute all rules" (for manual execution)

**Rate Limits:**
- Standard SmartThings API rate limits apply
- No specific documentation on rules endpoint limits
- Recommend: Cache results, implement exponential backoff

**Data Retention:**
- Rules persist indefinitely (not limited like device events)
- Rule execution history: Unknown retention (not documented)

**Location Scoping:**
- Rules are scoped to locations
- `locationId` parameter required for `list()` operation
- Cannot query rules across all locations in single call

### 1.4 API Limitations

**CRITICAL LIMITATION:**
> "When a user installs a Rule, only the account owner can modify it"

**Implications:**
- Rules created via API by different principals are isolated
- Rules created in SmartThings mobile app may not appear in API responses
- Need fallback strategy for app-created automations

**App vs API Routines:**
- **Automatic Routines (SmartThings App):** Represented as Rules in API ✅
- **Manual Routines (SmartThings App):** Not exposed via Rules API ❌
- **Scenes:** Separate API endpoint (already implemented in codebase) ✅

**No Direct Filtering:**
- No endpoint like `GET /rules?deviceId=xyz`
- Must fetch all rules for location, then filter client-side
- Performance consideration: O(n) filtering where n = total rules

---

## 2. Automation Identification Strategies

### 2.1 Strategy 1: Direct Device Reference Lookup (Primary)

**Approach:** Query all rules for device's location, filter by device ID in actions/conditions.

**Algorithm:**

```typescript
async function findRulesForDevice(deviceId: DeviceId, locationId: LocationId): Promise<RuleMatch[]> {
  // Step 1: Fetch all rules for location
  const allRules = await client.rules.list(locationId);

  // Step 2: Filter rules that reference this device
  const matchingRules: RuleMatch[] = [];

  for (const rule of allRules) {
    const deviceReferences = extractDeviceReferences(rule);

    if (deviceReferences.includes(deviceId)) {
      matchingRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matchType: 'direct',
        confidence: 1.0,
        deviceRoles: categorizeDeviceRole(rule, deviceId)
      });
    }
  }

  return matchingRules;
}

function extractDeviceReferences(rule: Rule): Set<string> {
  const deviceIds = new Set<string>();

  // Extract from actions
  for (const action of rule.actions) {
    if ('command' in action && action.command) {
      action.command.devices?.forEach(id => deviceIds.add(id));
    }
    // Handle nested if/else actions
    if ('if' in action) {
      extractFromConditions(action.if, deviceIds);
      extractFromActions(action.then, deviceIds);
      extractFromActions(action.else, deviceIds);
    }
  }

  return deviceIds;
}

function categorizeDeviceRole(rule: Rule, deviceId: string): DeviceRole[] {
  const roles: DeviceRole[] = [];

  // Check if device is in conditions (trigger)
  if (isDeviceInConditions(rule, deviceId)) {
    roles.push('trigger');
  }

  // Check if device is in actions (controlled)
  if (isDeviceInActions(rule, deviceId)) {
    roles.push('controlled');
  }

  return roles;
}
```

**Pros:**
- ✅ High accuracy (100% for API-created rules)
- ✅ Low latency with caching (<10ms)
- ✅ Identifies both trigger and controlled devices
- ✅ Works for complex multi-device rules

**Cons:**
- ❌ Misses app-created routines (API limitation)
- ❌ Requires location ID (may need lookup)
- ❌ O(n*m) complexity where n=rules, m=actions per rule

**Confidence Score:** 1.0 (direct match)

---

### 2.2 Strategy 2: Pattern-Based Temporal Correlation (Secondary)

**Approach:** Match event timing patterns with known automation characteristics.

**Use Case:** Identify automations even when Rules API doesn't expose them (app-created routines).

**Algorithm:**

```typescript
async function detectAutomationByPattern(
  deviceEvents: DeviceEvent[],
  timeWindow: number = 5000  // 5 seconds
): Promise<AutomationSignature[]> {

  const signatures: AutomationSignature[] = [];

  // Pattern 1: Rapid state changes (automation fight)
  const rapidChanges = detectRapidChanges(deviceEvents, timeWindow);
  if (rapidChanges.length > 0) {
    signatures.push({
      type: 'automation_fight',
      description: 'Multiple automations controlling same device',
      confidence: 0.85,
      evidence: rapidChanges,
      recommendation: 'Check for conflicting automations'
    });
  }

  // Pattern 2: Scheduled execution (time-based automation)
  const scheduledPattern = detectScheduledPattern(deviceEvents);
  if (scheduledPattern) {
    signatures.push({
      type: 'scheduled_automation',
      description: `Automation runs at ${scheduledPattern.schedule}`,
      confidence: 0.75,
      evidence: scheduledPattern.occurrences,
      recommendation: 'Check scheduled automations and modes'
    });
  }

  // Pattern 3: Triggered execution (event-based automation)
  const triggeredPattern = detectTriggeredPattern(deviceEvents);
  if (triggeredPattern) {
    signatures.push({
      type: 'triggered_automation',
      description: 'Device changes triggered by another device event',
      confidence: 0.70,
      evidence: triggeredPattern.correlations,
      recommendation: 'Check automations triggered by other devices'
    });
  }

  return signatures;
}

function detectRapidChanges(events: DeviceEvent[], windowMs: number): RapidChange[] {
  const changes: RapidChange[] = [];

  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];

    const timeDelta = next.epoch - current.epoch;

    // Rapid toggle: off→on or on→off within window
    if (timeDelta < windowMs &&
        current.attribute === next.attribute &&
        current.value !== next.value) {

      changes.push({
        fromValue: current.value,
        toValue: next.value,
        timeDeltaMs: timeDelta,
        timestamp: current.time
      });
    }
  }

  return changes;
}
```

**Pros:**
- ✅ Works for app-created automations (invisible to API)
- ✅ Identifies automation behaviors without API access
- ✅ Can detect automation conflicts (fights)

**Cons:**
- ❌ Lower confidence (70-85%)
- ❌ Cannot provide automation name/ID
- ❌ May produce false positives
- ❌ Requires event history (limited to 7 days)

**Confidence Score:** 0.70-0.85 (pattern-based inference)

---

### 2.3 Strategy 3: Hybrid Approach (Recommended)

**Approach:** Combine direct lookup with pattern detection for comprehensive coverage.

**Decision Tree:**

```
Start: Identify automations for device
    |
    v
Check: Device has location?
    |
    +-- NO --> Use pattern-based detection only
    |          (Confidence: 0.70-0.85)
    |
    +-- YES --> Fetch rules via API
                |
                v
             Check: Rules found for device?
                |
                +-- YES --> Direct match found
                |           (Confidence: 1.0)
                |           |
                |           v
                |        Check: Pattern detection enabled?
                |           |
                |           +-- YES --> Run pattern detection
                |           |           Merge results (detect automation fights)
                |           |
                |           +-- NO --> Return direct matches only
                |
                +-- NO --> Check: App-created routine suspected?
                           |
                           +-- YES --> Run pattern detection
                           |           (Confidence: 0.70-0.85)
                           |           Add recommendation:
                           |           "May be app-created routine (not visible in API)"
                           |
                           +-- NO --> Return empty
                                      (No automation detected)
```

**Implementation:**

```typescript
async function identifyAutomations(
  deviceId: DeviceId,
  locationId?: LocationId,
  events?: DeviceEvent[]
): Promise<AutomationIdentificationResult> {

  const result: AutomationIdentificationResult = {
    directMatches: [],
    patternSignatures: [],
    overallConfidence: 0,
    recommendations: []
  };

  // Strategy 1: Direct API lookup
  if (locationId) {
    try {
      result.directMatches = await findRulesForDevice(deviceId, locationId);
    } catch (error) {
      logger.warn('Rules API query failed', { error, deviceId });
      // Continue to pattern detection
    }
  }

  // Strategy 2: Pattern detection
  if (events && events.length > 0) {
    result.patternSignatures = await detectAutomationByPattern(events);
  }

  // Calculate overall confidence
  result.overallConfidence = calculateCombinedConfidence(
    result.directMatches,
    result.patternSignatures
  );

  // Generate recommendations
  result.recommendations = generateRecommendations(result);

  return result;
}
```

**Benefits:**
- ✅ Comprehensive coverage (API + patterns)
- ✅ Graceful degradation if API fails
- ✅ Can detect automation conflicts
- ✅ Provides actionable recommendations

---

## 3. Data Structures and Types

### 3.1 Type Definitions

```typescript
/**
 * Device role in automation rule.
 */
export type DeviceRole = 'trigger' | 'controlled' | 'both';

/**
 * Match type for automation identification.
 */
export type MatchType = 'direct' | 'pattern' | 'inferred';

/**
 * Rule match result with confidence score.
 */
export interface RuleMatch {
  /** Rule UUID */
  ruleId: string;

  /** Human-readable rule name */
  ruleName: string;

  /** Match methodology */
  matchType: MatchType;

  /** Confidence score (0-1) */
  confidence: number;

  /** Device roles in this rule */
  deviceRoles: DeviceRole[];

  /** Rule status */
  status?: 'Active' | 'Inactive' | 'Deleted';

  /** Optional: Commands sent to device */
  commands?: DeviceCommand[];

  /** Optional: Rule execution timestamp */
  lastExecuted?: string;
}

/**
 * Automation signature detected via pattern analysis.
 */
export interface AutomationSignature {
  /** Signature type */
  type: 'automation_fight' | 'scheduled_automation' | 'triggered_automation';

  /** Human-readable description */
  description: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Supporting evidence */
  evidence: unknown[];

  /** Actionable recommendation */
  recommendation: string;
}

/**
 * Combined automation identification result.
 */
export interface AutomationIdentificationResult {
  /** Direct rule matches from API */
  directMatches: RuleMatch[];

  /** Pattern-based signatures */
  patternSignatures: AutomationSignature[];

  /** Overall confidence (combined) */
  overallConfidence: number;

  /** Actionable recommendations */
  recommendations: string[];

  /** Metadata */
  metadata?: {
    /** Number of rules analyzed */
    rulesAnalyzed?: number;

    /** Number of events analyzed */
    eventsAnalyzed?: number;

    /** API query duration (ms) */
    apiDurationMs?: number;

    /** Pattern detection duration (ms) */
    patternDurationMs?: number;
  };
}

/**
 * Rapid change detection result.
 */
export interface RapidChange {
  /** Previous value */
  fromValue: unknown;

  /** New value */
  toValue: unknown;

  /** Time between changes (ms) */
  timeDeltaMs: number;

  /** ISO-8601 timestamp */
  timestamp: string;
}
```

### 3.2 Cache Data Structure

```typescript
/**
 * Cached rules for a location.
 */
export interface CachedLocationRules {
  /** Location ID */
  locationId: LocationId;

  /** All rules for location */
  rules: Rule[];

  /** Indexed by device ID for fast lookup */
  deviceIndex: Map<DeviceId, RuleMatch[]>;

  /** Cache timestamp */
  cachedAt: number;

  /** Cache TTL (ms) */
  ttl: number;
}
```

---

## 4. Implementation Architecture

### 4.1 Service Layer Structure

**New Service:** `AutomationService`

```
src/services/
├── AutomationService.ts          # New service for automation operations
├── interfaces.ts                 # Add IAutomationService interface
├── ServiceFactory.ts             # Add createAutomationService()
└── ServiceContainer.ts           # Add getAutomationService()
```

**Interface Definition:**

```typescript
/**
 * Automation service interface for rule/automation operations.
 */
export interface IAutomationService {
  /**
   * List all rules for a location.
   */
  listRules(locationId: LocationId): Promise<Rule[]>;

  /**
   * Get specific rule details.
   */
  getRule(ruleId: string, locationId: LocationId): Promise<Rule>;

  /**
   * Find rules that control a specific device.
   */
  findRulesForDevice(deviceId: DeviceId, locationId: LocationId): Promise<RuleMatch[]>;

  /**
   * Identify automations controlling a device (hybrid approach).
   */
  identifyAutomations(
    deviceId: DeviceId,
    locationId?: LocationId,
    events?: DeviceEvent[]
  ): Promise<AutomationIdentificationResult>;

  /**
   * Detect automation patterns in event history.
   */
  detectAutomationPatterns(events: DeviceEvent[]): Promise<AutomationSignature[]>;
}
```

### 4.2 Integration with SmartThings Client

**Extend SmartThingsAdapter:**

```typescript
// src/platforms/smartthings/SmartThingsAdapter.ts

export class SmartThingsAdapter extends EventEmitter implements IDeviceAdapter {
  private client: SmartThingsClient | null = null;

  // Add rules endpoint access
  async listRules(locationId: string): Promise<Rule[]> {
    this.ensureInitialized();

    try {
      return await retryWithBackoff(async () => {
        return await this.client!.rules.list(locationId);
      });
    } catch (error) {
      throw this.handleError(error, 'listRules', { locationId });
    }
  }

  async getRule(ruleId: string, locationId: string): Promise<Rule> {
    this.ensureInitialized();

    try {
      return await retryWithBackoff(async () => {
        return await this.client!.rules.get(ruleId, locationId);
      });
    } catch (error) {
      throw this.handleError(error, 'getRule', { ruleId, locationId });
    }
  }
}
```

### 4.3 AutomationService Implementation

**File:** `src/services/AutomationService.ts`

```typescript
import type { IAutomationService } from './interfaces.js';
import type { SmartThingsAdapter } from '../platforms/smartthings/SmartThingsAdapter.js';
import type { DeviceId, LocationId } from '../types/smartthings.js';
import type { DeviceEvent } from '../types/device-events.js';
import type { Rule } from '@smartthings/core-sdk';
import logger from '../utils/logger.js';

export class AutomationService implements IAutomationService {
  private cache: Map<LocationId, CachedLocationRules> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private adapter: SmartThingsAdapter) {}

  async listRules(locationId: LocationId): Promise<Rule[]> {
    // Check cache first
    const cached = this.cache.get(locationId);
    if (cached && Date.now() - cached.cachedAt < cached.ttl) {
      logger.debug('Returning cached rules', { locationId, age: Date.now() - cached.cachedAt });
      return cached.rules;
    }

    // Fetch from API
    logger.debug('Fetching rules from API', { locationId });
    const rules = await this.adapter.listRules(locationId as string);

    // Update cache
    this.updateCache(locationId, rules);

    return rules;
  }

  async findRulesForDevice(deviceId: DeviceId, locationId: LocationId): Promise<RuleMatch[]> {
    // Check cache first
    const cached = this.cache.get(locationId);
    if (cached && Date.now() - cached.cachedAt < cached.ttl) {
      const matches = cached.deviceIndex.get(deviceId);
      if (matches) {
        logger.debug('Returning cached rule matches', { deviceId, count: matches.length });
        return matches;
      }
    }

    // Fetch and filter
    const rules = await this.listRules(locationId);
    const matches = this.filterRulesByDevice(rules, deviceId);

    return matches;
  }

  async identifyAutomations(
    deviceId: DeviceId,
    locationId?: LocationId,
    events?: DeviceEvent[]
  ): Promise<AutomationIdentificationResult> {
    const startTime = Date.now();

    const result: AutomationIdentificationResult = {
      directMatches: [],
      patternSignatures: [],
      overallConfidence: 0,
      recommendations: [],
      metadata: {
        rulesAnalyzed: 0,
        eventsAnalyzed: events?.length ?? 0,
      }
    };

    // Strategy 1: Direct lookup
    if (locationId) {
      try {
        const apiStart = Date.now();
        result.directMatches = await this.findRulesForDevice(deviceId, locationId);
        result.metadata!.apiDurationMs = Date.now() - apiStart;
        result.metadata!.rulesAnalyzed = result.directMatches.length;
      } catch (error) {
        logger.warn('Rules API query failed', { error, deviceId });
      }
    }

    // Strategy 2: Pattern detection
    if (events && events.length > 0) {
      const patternStart = Date.now();
      result.patternSignatures = await this.detectAutomationPatterns(events);
      result.metadata!.patternDurationMs = Date.now() - patternStart;
    }

    // Calculate confidence and recommendations
    result.overallConfidence = this.calculateCombinedConfidence(result);
    result.recommendations = this.generateRecommendations(result);

    logger.info('Automation identification complete', {
      deviceId,
      directMatches: result.directMatches.length,
      patterns: result.patternSignatures.length,
      confidence: result.overallConfidence,
      durationMs: Date.now() - startTime
    });

    return result;
  }

  // ... (implementation of other methods)
}
```

---

## 5. Caching Strategy

### 5.1 Why Caching is Critical

**Problem:** Rules don't change frequently, but diagnostics may query repeatedly.

**Without Caching:**
- Every diagnostic query = full Rules API call
- Location with 50 rules = 50+ rule parsing operations
- 10 device diagnostics = 500+ unnecessary operations
- API rate limits quickly exhausted

**With Caching:**
- First query: API call + cache population
- Subsequent queries: Cache lookup (< 10ms)
- Cache invalidation: 5 minutes (configurable)
- 99% reduction in API calls

### 5.2 Cache Structure

**Two-Level Index:**

```typescript
class AutomationCache {
  // Level 1: Location-based cache
  private locationCache: Map<LocationId, CachedLocationRules> = new Map();

  // Level 2: Device-based index (within each location cache)
  // CachedLocationRules.deviceIndex: Map<DeviceId, RuleMatch[]>

  /**
   * Get rules for device (fast path).
   */
  getRulesForDevice(deviceId: DeviceId, locationId: LocationId): RuleMatch[] | null {
    const cached = this.locationCache.get(locationId);

    if (!cached || this.isExpired(cached)) {
      return null;  // Cache miss
    }

    return cached.deviceIndex.get(deviceId) ?? [];
  }

  /**
   * Update cache after API query.
   */
  updateCache(locationId: LocationId, rules: Rule[]): void {
    const deviceIndex = this.buildDeviceIndex(rules);

    this.locationCache.set(locationId, {
      locationId,
      rules,
      deviceIndex,
      cachedAt: Date.now(),
      ttl: this.CACHE_TTL_MS
    });
  }

  /**
   * Build device→rules index for fast lookup.
   */
  private buildDeviceIndex(rules: Rule[]): Map<DeviceId, RuleMatch[]> {
    const index = new Map<DeviceId, RuleMatch[]>();

    for (const rule of rules) {
      const deviceIds = this.extractDeviceReferences(rule);

      for (const deviceId of deviceIds) {
        if (!index.has(deviceId as DeviceId)) {
          index.set(deviceId as DeviceId, []);
        }

        index.get(deviceId as DeviceId)!.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matchType: 'direct',
          confidence: 1.0,
          deviceRoles: this.categorizeDeviceRole(rule, deviceId),
          status: rule.status
        });
      }
    }

    return index;
  }
}
```

### 5.3 Cache Invalidation Strategy

**Time-Based (Primary):**
- TTL: 5 minutes (default)
- Configurable via environment variable: `AUTOMATION_CACHE_TTL_MS`
- Rationale: Rules change infrequently (typically manual updates)

**Event-Based (Future Enhancement):**
- Invalidate on rule create/update/delete operations
- Requires webhook subscription to SmartThings events
- Out of scope for initial implementation

**Manual Invalidation:**
- Expose `clearCache(locationId?: LocationId)` method
- Allow users to force refresh if automation changes detected

### 5.4 Memory Management

**Memory Bounds:**
- Typical location: 10-50 rules
- Typical rule: ~2KB JSON
- Cache size per location: ~100KB
- Max locations: 10 (typical user)
- **Total memory: ~1MB** (negligible)

**Cleanup:**
- Periodic cleanup of expired entries (every 10 minutes)
- LRU eviction if memory threshold exceeded (future)

---

## 6. Integration with Diagnostic Workflow

### 6.1 Enhanced `diagnoseDevice()` Flow

**Current Flow (BUG-1M-307 implementation):**

```
diagnoseDevice(deviceId)
    |
    v
buildDataGatheringPlan()
    |
    +-- getDeviceHistory() --> events
    +-- detectPatterns()   --> IssuePattern[] (rapid_changes, etc.)
    |
    v
buildDiagnosticContext()
    |
    v
formatRichContext() --> LLM prompt
```

**Enhanced Flow (with automation identification):**

```
diagnoseDevice(deviceId)
    |
    v
buildDataGatheringPlan()
    |
    +-- getDeviceHistory()      --> events
    +-- detectPatterns()        --> IssuePattern[] (rapid_changes, etc.)
    +-- identifyAutomations()   --> AutomationIdentificationResult ← NEW
    |
    v
buildDiagnosticContext()
    |   context.automationInfo = identifyAutomations() ← NEW FIELD
    |   context.relatedIssues += patterns + automation signatures
    v
formatRichContext() --> LLM prompt
    |   "Automations controlling this device:"
    |   "- Rule: 'Evening Routine' (ID: abc123)"
    |   "- Commands: turn off every 3 seconds"
```

### 6.2 Code Changes Required

**File:** `src/services/DiagnosticWorkflow.ts`

**Change 1: Add AutomationService Dependency**

```typescript
import type { IAutomationService } from './interfaces.js';

export class DiagnosticWorkflow {
  constructor(
    private smartThingsService: SmartThingsService,
    private deviceService: IDeviceService,
    private automationService: IAutomationService,  // ← NEW
    private llmService: ILLMService
  ) {}
}
```

**Change 2: Enhance DiagnosticContext Type**

```typescript
// Line ~40
export interface DiagnosticContext {
  deviceInfo: DeviceInfo;
  deviceHistory: DeviceEvent[];
  deviceGaps: EventGap[];
  relatedIssues: IssuePattern[];
  automationInfo?: AutomationIdentificationResult;  // ← NEW
  reasoningSteps?: string[];
}
```

**Change 3: Add Automation Identification to Data Gathering**

```typescript
// In buildDataGatheringPlan() - around line 322

private async buildDataGatheringPlan(deviceId: DeviceId, intent: DiagnosticIntent) {
  const plan: DataGatheringOperation[] = [];

  // Existing operations...
  plan.push({
    type: 'device_history',
    operation: () => this.deviceService.getDeviceHistory(deviceId, '24h')
  });

  plan.push({
    type: 'patterns',
    operation: () => this.detectPatterns(deviceId)
  });

  // NEW: Add automation identification
  plan.push({
    type: 'automation_identification',
    operation: async () => {
      const deviceInfo = await this.deviceService.getDevice(deviceId);
      const events = await this.deviceService.getDeviceHistory(deviceId, '24h');

      return this.automationService.identifyAutomations(
        deviceId,
        deviceInfo.locationId as LocationId,
        events
      );
    }
  });

  return plan;
}
```

**Change 4: Populate Context with Automation Info**

```typescript
// In buildDiagnosticContext() - around line 365

private async buildDiagnosticContext(
  deviceId: DeviceId,
  gatheredData: Record<string, unknown>
): Promise<DiagnosticContext> {

  return {
    deviceInfo: gatheredData.device_info as DeviceInfo,
    deviceHistory: gatheredData.device_history as DeviceEvent[],
    deviceGaps: gatheredData.event_gaps?.value as EventGap[] ?? [],
    relatedIssues: gatheredData.patterns?.value as IssuePattern[] ?? [],
    automationInfo: gatheredData.automation_identification as AutomationIdentificationResult,  // ← NEW
    reasoningSteps: []
  };
}
```

**Change 5: Format Automation Info in Rich Context**

```typescript
// In formatRichContext() - around line 491

private formatRichContext(context: DiagnosticContext): string {
  let richContext = `# Device Diagnostic Context\n\n`;

  // ... existing sections ...

  // NEW: Automation Information Section
  if (context.automationInfo) {
    richContext += `\n## Controlling Automations\n\n`;

    const { directMatches, patternSignatures, overallConfidence, recommendations } = context.automationInfo;

    if (directMatches.length > 0) {
      richContext += `### Identified Rules (API):\n`;
      for (const match of directMatches) {
        richContext += `- **${match.ruleName}** (ID: ${match.ruleId})\n`;
        richContext += `  - Status: ${match.status}\n`;
        richContext += `  - Role: ${match.deviceRoles.join(', ')}\n`;
        richContext += `  - Confidence: ${(match.confidence * 100).toFixed(0)}%\n`;

        if (match.commands && match.commands.length > 0) {
          richContext += `  - Commands: ${match.commands.map(c => c.command).join(', ')}\n`;
        }
        richContext += `\n`;
      }
    }

    if (patternSignatures.length > 0) {
      richContext += `\n### Detected Automation Patterns:\n`;
      for (const sig of patternSignatures) {
        richContext += `- **${sig.type}**: ${sig.description}\n`;
        richContext += `  - Confidence: ${(sig.confidence * 100).toFixed(0)}%\n`;
        richContext += `  - Recommendation: ${sig.recommendation}\n\n`;
      }
    }

    if (recommendations.length > 0) {
      richContext += `\n### Automation Recommendations:\n`;
      for (const rec of recommendations) {
        richContext += `- ${rec}\n`;
      }
      richContext += `\n`;
    }

    richContext += `**Overall Automation Confidence:** ${(overallConfidence * 100).toFixed(0)}%\n\n`;
  }

  // ... rest of context ...

  return richContext;
}
```

### 6.3 Example Enhanced Output

**Before (BUG-1M-308):**

```
## Related Issues:
- rapid_changes: Device toggled 15 times in 45 seconds (95% confidence)
- Recommendation: Check for automation conflicts

ACTION REQUIRED: Search SmartThings app for automations controlling this device
```

**After (with automation identification):**

```
## Controlling Automations

### Identified Rules (API):
- **Evening Wind Down** (ID: 550e8400-e29b-41d4-a716-446655440000)
  - Status: Active
  - Role: controlled
  - Confidence: 100%
  - Commands: off

- **Security Mode Active** (ID: 660e9511-f39c-52e5-b827-557766551111)
  - Status: Active
  - Role: controlled
  - Confidence: 100%
  - Commands: off

### Detected Automation Patterns:
- **automation_fight**: Multiple automations controlling same device
  - Confidence: 85%
  - Recommendation: Disable one automation to prevent conflict

### Automation Recommendations:
- Two active rules are sending 'off' commands to this device
- Consider consolidating into single automation
- Check SmartThings app for additional app-created routines

**Overall Automation Confidence:** 100%

## Related Issues:
- rapid_changes: Device toggled 15 times in 45 seconds (95% confidence)

ROOT CAUSE IDENTIFIED: Automation conflict between "Evening Wind Down" and "Security Mode Active"
SOLUTION: Disable one automation or adjust timing to prevent overlap
```

---

## 7. API Limitations and Fallback Strategies

### 7.1 Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|-----------|
| **App-created routines not in API** | Cannot identify routines created in SmartThings mobile app | Use pattern-based detection + user notification |
| **No direct device filter** | Must fetch all rules, filter client-side | Implement caching to amortize cost |
| **Location ID required** | Cannot query rules without knowing location | Fetch device info first to get location |
| **No execution history** | Cannot correlate events with rule executions | Use temporal pattern matching |
| **Rate limits** | Excessive queries may hit rate limits | Cache aggressively, implement backoff |

### 7.2 Fallback Strategy Matrix

**Scenario 1: Rules API Unavailable**

```typescript
try {
  directMatches = await findRulesForDevice(deviceId, locationId);
} catch (error) {
  if (isRateLimitError(error)) {
    logger.warn('Rate limit exceeded, using cached data');
    directMatches = getCachedMatches(deviceId, locationId) ?? [];
  } else if (isAuthError(error)) {
    logger.error('Rules API authentication failed');
    return {
      error: 'Rules API access denied - check token scopes',
      fallbackUsed: 'pattern_detection_only'
    };
  } else {
    logger.warn('Rules API query failed', { error });
    // Continue with pattern detection only
  }
}
```

**Scenario 2: Location ID Unknown**

```typescript
async function identifyAutomations(deviceId: DeviceId, locationId?: LocationId) {
  if (!locationId) {
    // Attempt to fetch device info to get location
    try {
      const deviceInfo = await this.deviceService.getDevice(deviceId);
      locationId = deviceInfo.locationId as LocationId;
    } catch (error) {
      logger.warn('Cannot determine location, pattern detection only', { deviceId });
      // Fall back to pattern-based detection
      return {
        directMatches: [],
        patternSignatures: await detectAutomationPatterns(events),
        fallbackUsed: 'no_location_id'
      };
    }
  }

  // Continue with normal flow...
}
```

**Scenario 3: App-Created Routines Detected**

```typescript
if (directMatches.length === 0 && patternSignatures.some(s => s.type === 'automation_fight')) {
  recommendations.push(
    'No API-visible automations found, but automation patterns detected',
    'This may indicate app-created routines (not visible via API)',
    'Check SmartThings mobile app > Automations > Routines',
    'Look for routines that control this device'
  );
}
```

### 7.3 Graceful Degradation Tiers

**Tier 1: Full Functionality** (Ideal)
- ✅ Rules API available
- ✅ Location ID known
- ✅ Event history available
- **Result:** Direct matches + pattern detection

**Tier 2: API Only** (Good)
- ✅ Rules API available
- ✅ Location ID known
- ❌ No event history
- **Result:** Direct matches only (no pattern detection)

**Tier 3: Pattern Only** (Acceptable)
- ❌ Rules API unavailable/failed
- ✅ Event history available
- **Result:** Pattern detection only (70-85% confidence)

**Tier 4: No Data** (Minimal)
- ❌ Rules API unavailable
- ❌ No event history
- **Result:** Generic recommendation to check SmartThings app

---

## 8. Performance Considerations

### 8.1 Latency Targets

| Operation | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| **Cache hit** (device lookup) | < 10ms | < 50ms | > 100ms |
| **Cache miss** (full API query) | < 500ms | < 1000ms | > 2000ms |
| **Pattern detection** | < 100ms | < 300ms | > 500ms |
| **Combined identification** | < 1000ms | < 2000ms | > 3000ms |

### 8.2 Complexity Analysis

**Direct Lookup (findRulesForDevice):**

```
Time Complexity: O(R × A)
  where R = number of rules for location
        A = average actions per rule

Space Complexity: O(R × D)
  where D = average devices per rule

Typical Case:
  R = 20 rules
  A = 5 actions per rule
  D = 3 devices per rule

  Operations: 20 × 5 = 100 device reference checks
  Duration: ~50-100ms (uncached)
```

**Pattern Detection (detectAutomationPatterns):**

```
Time Complexity: O(E²) worst case
  where E = number of events

Optimized: O(E) with sliding window approach

Typical Case:
  E = 100 events (24h history)
  Operations: 100 comparisons
  Duration: ~20-50ms
```

**Cache Lookup (getRulesForDevice):**

```
Time Complexity: O(1) hash map lookup
Space Complexity: O(R × D) for index

Typical Case:
  Operations: 1-2 hash lookups
  Duration: <10ms
```

### 8.3 Optimization Strategies

**1. Lazy Loading:**
```typescript
// Only fetch rules when actually needed
if (intent === 'ISSUE_DIAGNOSIS' && hasAutomationPatterns) {
  automationInfo = await identifyAutomations(...);
}
```

**2. Parallel Execution:**
```typescript
// Run API query and pattern detection in parallel
const [directMatches, patterns] = await Promise.all([
  findRulesForDevice(deviceId, locationId),
  detectAutomationPatterns(events)
]);
```

**3. Early Exit:**
```typescript
// If direct match found with 100% confidence, skip pattern detection
if (directMatches.length > 0 && !detectConflicts) {
  return { directMatches, patternSignatures: [] };
}
```

**4. Incremental Indexing:**
```typescript
// Build device index incrementally during cache population
for (const rule of rules) {
  // Index as we go, don't re-traverse later
  indexDeviceReferences(rule, deviceIndex);
}
```

### 8.4 Memory Optimization

**Problem:** Storing full Rule objects in cache consumes memory.

**Solution:** Store only relevant fields:

```typescript
interface CompactRuleCache {
  ruleId: string;
  ruleName: string;
  status: RuleStatus;
  deviceIds: Set<string>;  // Extracted device references only

  // Omit full actions array, conditions, etc.
}
```

**Savings:**
- Full Rule: ~2KB
- Compact: ~200 bytes
- **90% memory reduction**

---

## 9. Error Handling

### 9.1 Error Categories

**API Errors:**
- `401 Unauthorized`: Invalid/expired token, missing Rules scope
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Location/rule not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Server Error`: SmartThings API outage

**Application Errors:**
- `CacheError`: Cache corruption/invalidation failure
- `ParsingError`: Rule structure doesn't match expected schema
- `TimeoutError`: API request exceeded timeout

### 9.2 Error Handling Strategy

```typescript
async function findRulesForDevice(deviceId: DeviceId, locationId: LocationId): Promise<RuleMatch[]> {
  try {
    const rules = await this.listRules(locationId);
    return this.filterRulesByDevice(rules, deviceId);

  } catch (error) {
    // Categorize error
    if (isAuthError(error)) {
      logger.error('Rules API authentication failed', { error });
      throw new ServiceError(
        'AUTHENTICATION_ERROR',
        'AutomationService',
        'findRulesForDevice',
        'Rules API access denied - check PAT token has Rules > Read scope',
        error
      );
    }

    if (isRateLimitError(error)) {
      logger.warn('Rate limit exceeded, using cached data', { deviceId });

      // Attempt cache fallback
      const cached = this.getCachedMatches(deviceId, locationId);
      if (cached) {
        return cached;
      }

      throw new ServiceError(
        'RATE_LIMIT_ERROR',
        'AutomationService',
        'findRulesForDevice',
        'SmartThings API rate limit exceeded and no cached data available',
        error
      );
    }

    if (isNetworkError(error)) {
      logger.warn('Network error querying Rules API', { error });

      // Attempt cache fallback
      const cached = this.getCachedMatches(deviceId, locationId);
      if (cached) {
        logger.info('Using cached rule matches due to network error');
        return cached;
      }

      throw new NetworkError(
        'Rules API unreachable',
        { deviceId, locationId },
        error
      );
    }

    // Unknown error - log and rethrow
    logger.error('Unexpected error in findRulesForDevice', { error, deviceId, locationId });
    throw error;
  }
}
```

### 9.3 User-Facing Error Messages

**Authentication Error:**
```
❌ Unable to identify automations: API access denied

Your Personal Access Token (PAT) may not have the required permissions.

ACTION REQUIRED:
1. Visit: https://account.smartthings.com/tokens
2. Check token scopes include "Rules > Read all rules"
3. Update MCP_SMARTTHINGS_TOKEN environment variable
4. Restart MCP server

Falling back to pattern-based detection (reduced accuracy).
```

**Rate Limit Error:**
```
⚠️ SmartThings API rate limit exceeded

Using cached automation data (may be stale).

If automations changed recently, wait 1 minute and retry diagnostic.
```

**Network Error:**
```
⚠️ Unable to reach SmartThings API

Check internet connection and SmartThings service status.

Falling back to pattern-based detection using local event history.
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

**File:** `src/services/__tests__/AutomationService.test.ts`

**Test Cases:**

```typescript
describe('AutomationService', () => {
  describe('findRulesForDevice', () => {
    it('should find rules that control device in actions', async () => {
      const mockRules: Rule[] = [
        {
          id: 'rule-1',
          name: 'Turn off at night',
          actions: [
            {
              command: {
                devices: ['device-abc-123'],
                commands: [{ component: 'main', capability: 'switch', command: 'off' }]
              }
            }
          ]
        }
      ];

      const matches = await service.findRulesForDevice('device-abc-123' as DeviceId, 'loc-1' as LocationId);

      expect(matches).toHaveLength(1);
      expect(matches[0].ruleId).toBe('rule-1');
      expect(matches[0].deviceRoles).toContain('controlled');
    });

    it('should find rules that use device as trigger', async () => {
      // Test case for device in conditions
    });

    it('should return empty array when no rules found', async () => {
      // Test case for no matches
    });

    it('should handle nested if/else actions', async () => {
      // Test case for complex rule structures
    });
  });

  describe('detectAutomationPatterns', () => {
    it('should detect automation fight pattern', async () => {
      const events: DeviceEvent[] = [
        { attribute: 'switch', value: 'off', epoch: 1000, ... },
        { attribute: 'switch', value: 'on', epoch: 1500, ... },
        { attribute: 'switch', value: 'off', epoch: 2000, ... },
      ];

      const signatures = await service.detectAutomationPatterns(events);

      expect(signatures).toHaveLength(1);
      expect(signatures[0].type).toBe('automation_fight');
      expect(signatures[0].confidence).toBeGreaterThan(0.8);
    });

    it('should detect scheduled automation pattern', async () => {
      // Test case for time-based patterns
    });
  });

  describe('cache behavior', () => {
    it('should return cached results within TTL', async () => {
      // First call
      await service.findRulesForDevice('device-1' as DeviceId, 'loc-1' as LocationId);

      // Second call (should use cache)
      const spy = jest.spyOn(adapter, 'listRules');
      await service.findRulesForDevice('device-1' as DeviceId, 'loc-1' as LocationId);

      expect(spy).not.toHaveBeenCalled();
    });

    it('should refetch after cache expiration', async () => {
      // Test TTL expiration
    });
  });
});
```

### 10.2 Integration Tests

**File:** `src/services/__tests__/AutomationService.integration.test.ts`

**Test Cases:**

```typescript
describe('AutomationService Integration', () => {
  it('should fetch real rules from SmartThings API', async () => {
    // Requires real PAT token and location
    // Skip in CI, run manually
  });

  it('should handle API errors gracefully', async () => {
    // Test with invalid token, rate limits, etc.
  });
});
```

### 10.3 DiagnosticWorkflow Integration Tests

**File:** `src/services/__tests__/DiagnosticWorkflow.automation.test.ts`

**Test Cases:**

```typescript
describe('DiagnosticWorkflow - Automation Integration', () => {
  it('should include automation info in diagnostic context', async () => {
    const context = await workflow.buildDiagnosticContext(deviceId, gatheredData);

    expect(context.automationInfo).toBeDefined();
    expect(context.automationInfo.directMatches.length).toBeGreaterThan(0);
  });

  it('should format automation info in rich context', async () => {
    const richContext = workflow.formatRichContext(context);

    expect(richContext).toContain('Controlling Automations');
    expect(richContext).toContain('Identified Rules');
  });

  it('should handle missing automation data gracefully', async () => {
    // Test when automation service is unavailable
  });
});
```

### 10.4 End-to-End Test (Manual)

**Test Scenario: Alcove Bar Light (BUG-1M-308)**

```bash
# Prerequisites:
# 1. SmartThings account with Alcove Bar light device
# 2. Active automation controlling the light
# 3. PAT token with Rules scope

# Run diagnostic
npm run test:e2e -- --grep "Alcove Bar automation identification"

# Expected output:
## Controlling Automations

### Identified Rules (API):
- **Evening Routine** (ID: ...)
  - Status: Active
  - Role: controlled
  - Confidence: 100%
  - Commands: off

### Detected Automation Patterns:
- **automation_fight**: Rapid off→on toggles detected
  - Confidence: 95%
  - Recommendation: Check for conflicting automations

ROOT CAUSE: Automation "Evening Routine" turning off light every 3 seconds
SOLUTION: Disable or modify automation timing
```

---

## 11. Implementation Roadmap

### Phase 1: Core Infrastructure (Day 1)

**Goals:**
- Set up AutomationService skeleton
- Integrate Rules API with SmartThingsAdapter
- Implement basic caching

**Tasks:**
1. ✅ Define IAutomationService interface
2. ✅ Create AutomationService class
3. ✅ Add Rules API methods to SmartThingsAdapter
4. ✅ Implement cache data structures
5. ✅ Write unit tests for cache behavior

**Deliverables:**
- `src/services/AutomationService.ts`
- `src/services/interfaces.ts` (updated)
- `src/platforms/smartthings/SmartThingsAdapter.ts` (updated)
- Unit tests passing

**Risk:** LOW - Infrastructure changes only, no breaking changes

---

### Phase 2: Direct Lookup Implementation (Day 2)

**Goals:**
- Implement findRulesForDevice()
- Add device reference extraction logic
- Build device index

**Tasks:**
1. ✅ Implement extractDeviceReferences()
2. ✅ Implement categorizeDeviceRole()
3. ✅ Implement filterRulesByDevice()
4. ✅ Add device indexing to cache
5. ✅ Write unit tests for device matching

**Deliverables:**
- Direct lookup fully functional
- Cache indexing working
- Unit tests passing (90%+ coverage)

**Risk:** LOW - Well-defined algorithm, SDK types available

---

### Phase 3: Pattern Detection (Day 3)

**Goals:**
- Implement automation pattern detection
- Add temporal correlation logic
- Integrate with existing pattern detection

**Tasks:**
1. ✅ Implement detectRapidChanges()
2. ✅ Implement detectScheduledPattern()
3. ✅ Implement detectTriggeredPattern()
4. ✅ Add AutomationSignature type
5. ✅ Write unit tests for pattern detection

**Deliverables:**
- Pattern detection functional
- AutomationSignature generation
- Unit tests passing

**Risk:** MEDIUM - Pattern detection is heuristic-based

---

### Phase 4: DiagnosticWorkflow Integration (Day 4)

**Goals:**
- Integrate AutomationService into DiagnosticWorkflow
- Enhance diagnostic context
- Format automation info in LLM prompts

**Tasks:**
1. ✅ Add automationService to DiagnosticWorkflow constructor
2. ✅ Update DiagnosticContext interface
3. ✅ Add automation identification to data gathering plan
4. ✅ Implement formatAutomationInfo()
5. ✅ Update formatRichContext()
6. ✅ Write integration tests

**Deliverables:**
- DiagnosticWorkflow enhanced
- Automation info in LLM prompts
- Integration tests passing

**Risk:** MEDIUM - Changes to critical diagnostic path

---

### Phase 5: Error Handling & Fallbacks (Day 5)

**Goals:**
- Implement robust error handling
- Add fallback strategies
- Test degradation scenarios

**Tasks:**
1. ✅ Add error categorization logic
2. ✅ Implement cache fallback for API failures
3. ✅ Add user-facing error messages
4. ✅ Test rate limit scenarios
5. ✅ Test network failure scenarios
6. ✅ Document API limitations

**Deliverables:**
- Graceful degradation working
- Error messages user-friendly
- Fallback tests passing

**Risk:** LOW - Non-breaking enhancements

---

### Timeline Summary

| Phase | Duration | Completion |
|-------|----------|------------|
| Phase 1: Core Infrastructure | Day 1 | 20% |
| Phase 2: Direct Lookup | Day 2 | 50% |
| Phase 3: Pattern Detection | Day 3 | 70% |
| Phase 4: Integration | Day 4 | 90% |
| Phase 5: Error Handling | Day 5 | 100% |

**Total Estimate:** 5 days (3-5 day range depending on testing complexity)

**Blockers:** None identified
**Dependencies:** BUG-1M-307 (pattern detection) should be completed first

---

## 12. Code Examples

### 12.1 Usage Example (Application Code)

```typescript
// Example: Diagnose device with automation identification

const workflow = new DiagnosticWorkflow(
  smartThingsService,
  deviceService,
  automationService,  // NEW
  llmService
);

const result = await workflow.diagnoseDevice('device-abc-123' as DeviceId);

console.log(result.summary);
// "ROOT CAUSE: Automation 'Evening Routine' (ID: rule-xyz) is turning off this device every 3 seconds"

console.log(result.recommendations);
// [
//   "Disable or modify 'Evening Routine' automation",
//   "Check SmartThings app for conflicting automations",
//   "Consider time-based delays to prevent rapid toggling"
// ]
```

### 12.2 Direct API Usage

```typescript
// Example: Query automations directly

const automationService = ServiceFactory.createAutomationService(smartThingsAdapter);

const result = await automationService.identifyAutomations(
  'device-abc-123' as DeviceId,
  'location-xyz' as LocationId,
  events
);

console.log('Direct matches:', result.directMatches.length);
console.log('Pattern signatures:', result.patternSignatures.length);
console.log('Overall confidence:', result.overallConfidence);

for (const match of result.directMatches) {
  console.log(`Rule: ${match.ruleName} (${match.ruleId})`);
  console.log(`  Role: ${match.deviceRoles.join(', ')}`);
  console.log(`  Confidence: ${match.confidence * 100}%`);
}
```

### 12.3 Cache Management

```typescript
// Clear cache for location
automationService.clearCache('location-xyz' as LocationId);

// Clear all caches
automationService.clearCache();

// Configure cache TTL (via environment variable)
process.env.AUTOMATION_CACHE_TTL_MS = '600000'; // 10 minutes
```

---

## 13. Validation Against Real-World Data

### 13.1 Test Case: Alcove Bar Light (BUG-1M-308)

**Scenario:**
- Device: Alcove Bar light
- Issue: Turns off 3 seconds after being turned on
- Root cause: Automation "Evening Routine" triggering

**Manual Investigation (Current):**
1. User reports issue
2. Diagnostic detects rapid_changes pattern (95% confidence)
3. System recommends: "Check SmartThings app for automations"
4. User manually searches app → finds "Evening Routine"
5. Time to resolution: 5-10 minutes

**With Automation Identification (Proposed):**
1. User reports issue
2. Diagnostic detects rapid_changes pattern (95% confidence)
3. **System queries Rules API → finds "Evening Routine"**
4. **System presents: "Rule 'Evening Routine' (ID: xyz) is turning off device"**
5. Time to resolution: < 1 minute

**Expected API Response:**

```json
{
  "directMatches": [
    {
      "ruleId": "550e8400-e29b-41d4-a716-446655440000",
      "ruleName": "Evening Routine",
      "matchType": "direct",
      "confidence": 1.0,
      "deviceRoles": ["controlled"],
      "status": "Active",
      "commands": [
        {
          "component": "main",
          "capability": "switch",
          "command": "off"
        }
      ]
    }
  ],
  "patternSignatures": [
    {
      "type": "automation_fight",
      "description": "Device toggled 15 times in 45 seconds",
      "confidence": 0.95,
      "recommendation": "Disable conflicting automation"
    }
  ],
  "overallConfidence": 1.0,
  "recommendations": [
    "Automation 'Evening Routine' is sending 'off' command to this device",
    "Disable or modify automation to prevent rapid toggling",
    "Consider adding delay or condition to automation"
  ]
}
```

---

## 14. Recommendations

### 14.1 Immediate Actions (Day 1)

1. ✅ **Verify PAT Token Scopes**
   - Ensure token has "Rules > Read all rules" scope
   - Update `.env` if necessary
   - Test token with `client.rules.list(locationId)`

2. ✅ **Implement Core Infrastructure**
   - Create AutomationService class
   - Add Rules API methods to SmartThingsAdapter
   - Set up caching layer

3. ✅ **Write Unit Tests First (TDD)**
   - Define test cases before implementation
   - Start with cache behavior tests
   - Add device matching tests

### 14.2 Implementation Priorities

**P0 (Must Have):**
- ✅ Direct device lookup via Rules API
- ✅ Basic caching (5-minute TTL)
- ✅ Integration with DiagnosticWorkflow
- ✅ Error handling for API failures

**P1 (Should Have):**
- ✅ Pattern-based detection (automation fight)
- ✅ Fallback strategies (cache, degradation)
- ✅ User-facing error messages

**P2 (Nice to Have):**
- ⏸️ Scheduled pattern detection
- ⏸️ Triggered pattern detection
- ⏸️ Manual cache invalidation API

**P3 (Future):**
- 📅 Real-time rule execution monitoring
- 📅 Webhook-based cache invalidation
- 📅 Cross-location rule queries

### 14.3 Long-Term Enhancements

1. **Rule Execution History** (Future API)
   - If SmartThings adds execution history endpoint
   - Direct correlation: event timestamp → rule execution

2. **Scene Integration**
   - Scenes can trigger rules
   - Extend identification to include scene→rule chains

3. **Multi-Location Support**
   - Query rules across all user locations
   - Aggregate automation insights

4. **Automation Recommendations**
   - AI-powered automation suggestions
   - Conflict detection and resolution

---

## 15. Conclusion

### Summary

This design document provides a comprehensive solution for **BUG-1M-308: Automatic Identification of Controlling Automations**. The proposed three-tier identification strategy (Direct Lookup + Pattern Detection + Hybrid) addresses the core limitation where the diagnostic system can detect automation patterns but cannot identify the specific automations responsible.

### Key Achievements

1. ✅ **API Research Complete:** SmartThings Rules API fully documented with endpoints, data structures, and limitations identified.

2. ✅ **Implementation Strategy Defined:** Three identification strategies with algorithms, complexity analysis, and confidence scoring.

3. ✅ **Architecture Designed:** New AutomationService with caching, error handling, and graceful degradation.

4. ✅ **Integration Path Clear:** Detailed changes to DiagnosticWorkflow with code examples and line numbers.

5. ✅ **Testing Strategy Documented:** Unit, integration, and E2E test cases specified.

6. ✅ **Roadmap Established:** 5-day phased implementation plan with risk assessment.

### Impact

**Before (Current State):**
```
Diagnostic: "Automation detected - search SmartThings app manually"
User Action: 5-10 minutes manual investigation
Resolution: User must identify automation themselves
```

**After (With This Solution):**
```
Diagnostic: "Automation 'Evening Routine' (ID: abc123) is turning off device every 3 seconds"
User Action: Click to disable automation
Resolution: < 1 minute automated root cause identification
```

### Next Steps

1. **Day 1:** Implement Phase 1 (Core Infrastructure)
2. **Day 2:** Implement Phase 2 (Direct Lookup)
3. **Day 3:** Implement Phase 3 (Pattern Detection)
4. **Day 4:** Implement Phase 4 (DiagnosticWorkflow Integration)
5. **Day 5:** Implement Phase 5 (Error Handling & Testing)

### Success Criteria

- ✅ DiagnosticWorkflow identifies automations with 100% accuracy (for API-visible rules)
- ✅ Fallback to pattern detection when API unavailable (70-85% accuracy)
- ✅ Cache provides <10ms lookups for repeated queries
- ✅ Graceful degradation for all error scenarios
- ✅ User-facing error messages are actionable
- ✅ All tests passing (90%+ coverage)

**READY FOR IMPLEMENTATION** 🚀

---

## Appendix A: SmartThings Rules API Reference

### API Endpoints

- **List Rules:** `GET /rules?locationId={id}`
- **Get Rule:** `GET /rules/{ruleId}?locationId={id}`
- **Create Rule:** `POST /rules?locationId={id}`
- **Update Rule:** `PUT /rules/{ruleId}?locationId={id}`
- **Delete Rule:** `DELETE /rules/{ruleId}?locationId={id}`
- **Execute Rule:** `POST /rules/execute/{ruleId}?locationId={id}`

### Authentication

```http
Authorization: Bearer {personal_access_token}
```

**Required Scopes:**
- `r:rules:{locationId}` - Read rules
- `w:rules:{locationId}` - Write rules
- `x:rules:{locationId}` - Execute rules

### Rate Limits

- Standard SmartThings API limits apply
- No specific documentation available
- Recommend: Aggressive caching + exponential backoff

---

## Appendix B: Type Definitions (Full)

See [Section 3: Data Structures and Types](#3-data-structures-and-types) for complete type definitions.

---

## Appendix C: References

1. **SmartThings Rules API Documentation**
   - https://developer.smartthings.com/docs/automations/rules

2. **SmartThings Rules API Reference**
   - https://developer.smartthings.com/docs/api/public#tag/Rules

3. **Sample Rules API GitHub Repository**
   - https://github.com/SmartThingsDevelopers/Sample-RulesAPI

4. **SmartThings Community - Rules API FAQ**
   - https://community.smartthings.com/t/faq-getting-started-with-the-new-rules-api/184078

5. **@smartthings/core-sdk Documentation**
   - https://www.npmjs.com/package/@smartthings/core-sdk

---

**Document Version:** 1.0
**Last Updated:** November 28, 2025
**Next Review:** After Phase 1 Implementation
