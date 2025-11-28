# Semantic Indexing and Enhanced Troubleshooting Research

**Research Date:** 2025-11-27
**Context:** Expand troubleshooting mode with semantic indexing, prompt-based access, diagnostics, and discovery
**Researcher:** Claude Code (Research Agent)
**Status:** Research Complete - Ready for Design Phase

---

## Executive Summary

This research evaluates semantic indexing capabilities and enhanced troubleshooting features for the SmartThings MCP server. The goal is to expand beyond the current keyword-based troubleshooting mode with semantic device understanding, natural language diagnostic access, and intelligent discovery features.

**Key Findings:**

1. **Existing Foundation is Strong**: DeviceRegistry (1M-225) already provides multi-dimensional indexing (O(1) lookups by ID, room, platform, capability). Vector search infrastructure (mcp-vector-search) is active with 3,766 chunks indexed.

2. **Semantic Layer Complements Registry**: Vector search should augment (not replace) DeviceRegistry. Use vector search for semantic queries ("find motion sensors that might trigger lights") and DeviceRegistry for exact/structural queries ("get all switches in living room").

3. **Prompt-Based Access Already Works**: Current auto-detection (12 keywords) successfully triggers troubleshooting mode. Enhancement needed: expand beyond mode-switching to direct diagnostic invocation.

4. **Diagnostics Exist but are Isolated**: Diagnostic tools (test_connection, get_device_health, export_diagnostics) exist but aren't integrated with troubleshooting workflow.

5. **Discovery Requires New Infrastructure**: Finding similar devices, related issues, and pattern detection requires semantic indexing of device metadata + event history.

**Recommendations:**

- **Phase 1**: Semantic device metadata indexing (device descriptions, capabilities, configurations)
- **Phase 2**: Enhanced prompt patterns with intent classification (beyond mode-switching)
- **Phase 3**: Integrated diagnostics workflow (automatic health checks during troubleshooting)
- **Phase 4**: Discovery features (similar devices, related issues, pattern detection)

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Semantic Indexing Design](#2-semantic-indexing-design)
3. [Enhanced Troubleshooting Features](#3-enhanced-troubleshooting-features)
4. [Integration Architecture](#4-integration-architecture)
5. [Implementation Plan](#5-implementation-plan)
6. [Technical Recommendations](#6-technical-recommendations)
7. [Appendices](#7-appendices)

---

## 1. Current State Assessment

### 1.1 DeviceRegistry Capabilities (1M-225)

**Architecture:**
```
DeviceRegistry (src/abstract/DeviceRegistry.ts)
├── Multi-dimensional indexing
│   ├── Primary: deviceId → device (O(1))
│   ├── Name: name → deviceId (O(1))
│   ├── Alias: label → deviceId (O(1))
│   ├── Room: room → Set<deviceId> (O(1) + iteration)
│   ├── Platform: platform → Set<deviceId> (O(1) + iteration)
│   └── Capability: capability → Set<deviceId> (O(1) + iteration)
├── Fuzzy name matching (Levenshtein distance)
├── Atomic index updates
└── Save/load persistence
```

**Performance:**
- <10ms lookup time for 200+ devices
- <1ms for exact ID lookups
- <5ms for fuzzy name resolution
- Fuzzy threshold: 0.6 (configurable)

**What DeviceRegistry Already Provides:**
- ✅ Fast exact lookups by ID, name, alias
- ✅ Fuzzy name matching for typo tolerance
- ✅ Multi-dimensional filtering (room + capability + platform)
- ✅ Efficient set operations for complex queries
- ✅ Atomic consistency across all indices

**What DeviceRegistry CANNOT Do:**
- ❌ Semantic queries ("find sensors that detect occupancy")
- ❌ Similarity matching ("devices like this one")
- ❌ Natural language understanding ("lights that turn on at night")
- ❌ Pattern recognition ("devices with connectivity issues")

### 1.2 Vector Search Infrastructure

**Current Configuration:**
```json
{
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "max_chunk_size": 512,
  "similarity_threshold": 0.5,
  "cache_embeddings": true,
  "languages": ["markdown"]
}
```

**Index Status:**
- **Indexed**: 3,766 chunks across 181 files
- **Index Size**: 3.77 MB (lightweight)
- **Storage**: ChromaDB (chroma.sqlite3 - 33.8 MB)
- **Model**: sentence-transformers/all-MiniLM-L6-v2 (384-dim embeddings)

**What Vector Search Currently Indexes:**
- ✅ Markdown documentation (docs/)
- ✅ Source code (.ts, .js files)
- ✅ Configuration files (.json)
- ❌ **NOT** device metadata (runtime data)
- ❌ **NOT** event history (temporal data)
- ❌ **NOT** automation rules (SmartThings data)

**Performance Characteristics:**
- **Query latency**: ~50-200ms (ChromaDB + embedding)
- **Memory footprint**: ~100-200 MB (model + index in memory)
- **Disk usage**: ~40 MB total (model + embeddings + metadata)
- **Embedding generation**: ~10-30ms per query (cached when possible)

### 1.3 Troubleshooting Mode Implementation

**Current Features (1M-274 Phase 2):**

**Mode Detection:**
```typescript
// 12 auto-detection keywords (case-insensitive)
const keywords = [
  'troubleshoot', 'diagnose', 'debug', 'fix',
  'not working', 'randomly', 'why is',
  'help me figure out', 'issue with', 'problem with',
  'won\'t', 'keeps'
];

// Manual commands
'/troubleshoot' → enter mode
'/normal' → exit mode
```

**System Prompt Injection:**
- **Core Troubleshooting Persona** (696 lines)
- **8-Step Methodology**: Gather → Collect → Analyze → Research → Diagnose → Propose → Implement → Verify
- **Tool Usage Guidelines**: get_device_events, web search, device control
- **Common Issue Patterns**: 5 pre-identified patterns (random activation, connectivity, automation failures, delays, integration issues)
- **Response Format**: Structured output for clarity
- **Safety Guidelines**: Approval requirements, privacy, escalation

**Web Search Integration:**
```typescript
const webSearchConfig = {
  maxResults: 3,
  searchPrompt: 'Focus on SmartThings smart home device issues...',
  engine: 'native',
  contextSize: 'medium'
};
```

**Capabilities:**
- ✅ Automatic mode switching based on keywords
- ✅ Manual mode control via commands
- ✅ Web search for external knowledge
- ✅ Event history analysis (get_device_events)
- ✅ Structured diagnostic methodology

**Limitations:**
- ❌ Mode-switching only (no direct diagnostic invocation)
- ❌ No intent classification (all troubleshooting treated same)
- ❌ No automatic health checks
- ❌ No similarity-based discovery
- ❌ No pattern detection across devices

### 1.4 Diagnostic Tools

**Existing Tools (src/mcp/tools/diagnostics.ts):**

1. **test_connection**: Verify SmartThings API connectivity
2. **get_device_health**: Check individual device health status
3. **list_failed_commands**: Historical command failures
4. **get_system_info**: Server and SmartThings statistics
5. **validate_device_capabilities**: Verify device capabilities
6. **export_diagnostics**: Comprehensive diagnostic report

**Data Available:**
```typescript
interface DeviceHealthEntry {
  deviceId: string;
  name: string;
  healthStatus: string;
  battery?: number | null;
  lastUpdate?: string | null;
  isOnline?: boolean;
}

interface CommandStats {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  successRate: string;
}
```

**Integration Status:**
- ✅ Tools implemented and tested
- ✅ Available via MCP tool interface
- ❌ **NOT** integrated with troubleshooting mode
- ❌ **NOT** automatically invoked during diagnostics
- ❌ **NOT** used for pattern detection

### 1.5 Device Event History (1M-274 Phase 1)

**MCP Tool: get_device_events**

**Features:**
- Relative time ranges ("24h", "7d")
- Absolute time ranges (ISO-8601, epoch milliseconds)
- Automatic gap detection (connectivity diagnostics)
- Capability/attribute filtering
- Human-readable formatting
- Rich troubleshooting metadata

**Event Data Structure:**
```typescript
interface DeviceEvent {
  deviceId: string;
  time: string; // ISO-8601
  component: string;
  capability: string;
  attribute: string;
  value: any;
  unit?: string;
  text?: string; // Human-readable description
}

interface DeviceEventMetadata {
  totalCount: number;
  hasMore: boolean;
  reachedRetentionLimit: boolean;
  gapDetected: boolean;
  largestGapMs?: number;
  appliedFilters: {
    capabilities?: string[];
    attributes?: string[];
  };
}
```

**Gap Detection:**
```typescript
// Connectivity issue detection
interface EventGap {
  gapStart: number; // Epoch ms
  gapEnd: number;
  durationMs: number;
  durationText: string; // "2 hours 15 minutes"
  likelyConnectivityIssue: boolean; // >1 hour gap
  previousEvent?: DeviceEvent;
  nextEvent?: DeviceEvent;
}
```

**Capabilities:**
- ✅ 7-day event retention (SmartThings API limit)
- ✅ Pagination support (up to 500 events)
- ✅ Automatic gap detection
- ✅ LLM-optimized formatting

**Limitations:**
- ❌ No cross-device correlation
- ❌ No pattern recognition
- ❌ No similarity search ("find events like this")
- ❌ No automated analysis triggers

### 1.6 Gaps Analysis

**What Exists:**
| Feature | Status | Location | Integration |
|---------|--------|----------|-------------|
| DeviceRegistry | ✅ Implemented | src/abstract/DeviceRegistry.ts | Core |
| Vector Search | ✅ Active | mcp-vector-search | Code/docs only |
| Troubleshooting Mode | ✅ Implemented | src/services/chat-orchestrator.ts | ChatOrchestrator |
| Diagnostic Tools | ✅ Implemented | src/mcp/tools/diagnostics.ts | MCP tools |
| Event History | ✅ Implemented | src/mcp/tools/device-events.ts | MCP tools |
| Web Search | ✅ Integrated | src/services/llm.ts | Troubleshooting mode |

**What's Missing:**
| Feature | Gap | Impact |
|---------|-----|--------|
| Semantic device search | No device metadata in vector index | Cannot do "find motion sensors" |
| Intent classification | Only mode-switching detection | Cannot classify diagnostic intent |
| Integrated diagnostics | Tools exist but isolated | No automatic health checks |
| Device discovery | No similarity infrastructure | Cannot find related devices |
| Pattern detection | No cross-device analysis | Cannot identify systemic issues |
| Event pattern matching | No semantic event search | Cannot find "events like this" |

---

## 2. Semantic Indexing Design

### 2.1 Semantic Layer Architecture

**Design Principle: Augment, Don't Replace**

DeviceRegistry handles **structural queries** (fast, exact, well-defined):
- "Get device by ID"
- "List all switches in living room"
- "Find devices with capability X in room Y"

Vector Search handles **semantic queries** (fuzzy, contextual, exploratory):
- "Find motion sensors that might trigger lights"
- "Devices similar to this thermostat"
- "What devices might cause this issue?"

**Integration Pattern:**
```
User Query
    ↓
Intent Classifier
    ↓
    ├─→ Structural Query → DeviceRegistry (fast path)
    │                      ↓
    │                   Exact Results
    │
    └─→ Semantic Query → Vector Search
                         ↓
                     Candidate IDs
                         ↓
                    DeviceRegistry.getDevice() (hydrate details)
                         ↓
                    Ranked Results
```

### 2.2 What to Index

**Device Metadata Documents:**

```typescript
interface DeviceDocument {
  // Primary identifiers (for retrieval)
  id: string;
  platform: string;

  // Semantic content (for embedding)
  semanticText: string; // Composite description for embedding

  // Structured metadata (for filtering post-search)
  metadata: {
    name: string;
    label?: string;
    room?: string;
    type?: string;
    capabilities: string[];
    manufacturer?: string;
    model?: string;

    // Configuration summary
    configSummary?: string; // "Dimmer set to 75%, color temp 3000K"

    // Usage patterns
    usagePatterns?: string; // "Triggers 'goodnight' routine, controlled by motion sensor"

    // Health indicators
    lastSeen?: string;
    batteryLevel?: number;
    connectivityIssues?: number; // Gap detection count
  };
}
```

**Semantic Text Composition:**

Combine multiple fields into rich semantic representation:

```typescript
function buildSemanticText(device: UnifiedDevice): string {
  const parts = [
    // Name and location
    `${device.name} (${device.room || 'no room'})`,

    // Device type and capabilities
    `Type: ${device.type || 'unknown'}`,
    `Capabilities: ${device.capabilities.join(', ')}`,

    // Descriptive label
    device.label ? `Also known as: ${device.label}` : '',

    // Manufacturer/model (if available)
    device.manufacturer ? `Made by ${device.manufacturer}` : '',
    device.model ? `Model: ${device.model}` : '',

    // Configuration state (example for switch + dimmer)
    device.currentState?.level
      ? `Configured at ${device.currentState.level}% brightness`
      : '',

    // Usage context (if tracked)
    device.usageContext
      ? `Used for: ${device.usageContext}`
      : '',
  ];

  return parts.filter(p => p).join('. ');
}
```

**Example Documents:**

```
Document 1:
"Living Room Motion Sensor (Living Room). Type: motion sensor.
Capabilities: motionSensor, battery, temperatureSensor.
Made by Samsung SmartThings. Model: IM6001-MPP. Battery at 85%.
Used for: Triggers living room lights automation, part of security system."

Document 2:
"Kitchen Overhead Lights (Kitchen). Type: dimmer switch.
Capabilities: switch, dimmer, energyMeter. Made by Lutron.
Configured at 75% brightness. Used for: Controlled by kitchen motion sensor,
included in 'goodnight' routine."

Document 3:
"Front Door Lock (Entryway). Type: smart lock.
Capabilities: lock, battery. Made by Yale. Model: YRD256.
Battery at 45% (LOW). Used for: Automation unlocks when family arrives,
locks at 11 PM nightly."
```

**Why This Works:**

1. **Rich Context**: LLM can understand device purpose, relationships, and state
2. **Natural Language**: Matches how users describe devices
3. **Discoverable Patterns**: "motion sensor" + "triggers" + "lights" forms semantic cluster
4. **Troubleshooting Clues**: Battery level, connectivity issues embedded in text

### 2.3 Event Pattern Documents

**Design Decision: Index Event Patterns, Not Individual Events**

Individual events are too granular (thousands per day). Instead, index **aggregated patterns**:

```typescript
interface EventPatternDocument {
  id: string; // Pattern ID
  deviceId: string;
  deviceName: string;

  semanticText: string;

  metadata: {
    patternType: 'recurring' | 'anomaly' | 'gap' | 'burst';
    timeframe: string; // "last 7 days"
    frequency?: string; // "3 times per day"

    // Pattern specifics
    attribute?: string; // "switch"
    value?: string; // "on"
    timeOfDay?: string; // "2-3 AM"

    // Anomaly indicators
    isUnexpected?: boolean;
    deviationLevel?: 'low' | 'medium' | 'high';
  };
}
```

**Example Event Pattern Documents:**

```
Document 1:
"Living Room Light unexpected activation pattern. Device turns ON
3 times per day during 2-3 AM timeframe. No associated motion events.
Pattern started 2 weeks ago. Likely automation issue."

Document 2:
"Front Door Motion Sensor connectivity gap pattern. Device goes
offline for 2-4 hour periods, 2 times per week. Battery at 35%.
Mesh network signal weak. Likely battery or placement issue."

Document 3:
"Kitchen Temperature Sensor reading anomaly. Temperature jumps
from 68°F to 95°F in <1 minute, then returns to normal. Occurs
1-2 times per day near kitchen appliances. Likely interference
from oven heat."
```

**Pattern Detection Logic:**

```typescript
async function detectEventPatterns(
  deviceId: DeviceId,
  events: DeviceEvent[]
): Promise<EventPattern[]> {
  const patterns: EventPattern[] = [];

  // 1. Detect recurring patterns (time-of-day clustering)
  const timeOfDayPatterns = clusterByTimeOfDay(events);

  // 2. Detect gaps (connectivity issues)
  const gaps = detectEventGaps(events);

  // 3. Detect anomalies (statistical outliers)
  const anomalies = detectStatisticalAnomalies(events);

  // 4. Detect bursts (rapid state changes)
  const bursts = detectEventBursts(events);

  return patterns;
}
```

**When to Re-Index Patterns:**

- **Periodic**: Daily at 3 AM (low traffic time)
- **On-Demand**: When user requests troubleshooting for device
- **Threshold-Based**: When device accumulates >100 new events
- **Issue-Triggered**: When gap detected or anomaly flagged

### 2.4 Configuration and Automation Documents

**Automation Rules:**

```typescript
interface AutomationDocument {
  id: string;
  name: string;

  semanticText: string;

  metadata: {
    type: 'routine' | 'automation' | 'scene';
    triggers: string[]; // Device IDs involved
    actions: string[]; // Device IDs affected
    conditions?: string[];

    // Health indicators
    lastExecuted?: string;
    failureRate?: number; // % of failed executions
    isEnabled: boolean;
  };
}
```

**Example:**

```
"Goodnight Routine automation. Triggers: Daily at 11 PM OR when
'goodnight' scene activated. Actions: Lock front door, turn off
all lights except bedroom lamp (set to 20%), set thermostat to
68°F, arm security system. Last executed: 2025-11-26 23:00.
Success rate: 95% (occasional lock timeout)."
```

**Use Cases:**

1. **Automation Debugging**: "Why didn't my lights turn off?"
   - Search: "lights turn off automation"
   - Find: "Goodnight Routine" mentions "turn off all lights"
   - Diagnose: Check routine execution history

2. **Impact Analysis**: "What automations will break if I remove this device?"
   - Search: Device name in automation documents
   - Find: All automations referencing device
   - Report: Impact assessment

3. **Conflict Detection**: "Why do my lights turn back on?"
   - Search: "lights turn on automation"
   - Find: Multiple automations controlling same device
   - Diagnose: Conflicting rules

### 2.5 Embedding Model Selection

**Current Model: sentence-transformers/all-MiniLM-L6-v2**

**Characteristics:**
- **Embedding Dimensions**: 384 (compact)
- **Model Size**: ~90 MB
- **Inference Speed**: ~10-30ms per query (CPU)
- **Quality**: Good for general semantic similarity
- **Training Domain**: General English text (Wikipedia, books, web)

**Is This Suitable for Smart Home Domain?**

**Pros:**
- ✅ Lightweight and fast
- ✅ Already deployed and working
- ✅ Good general-purpose semantic understanding
- ✅ Works well with descriptive device text

**Cons:**
- ❌ Not specifically trained on smart home terminology
- ❌ May struggle with technical capability names
- ❌ Limited understanding of automation logic

**Testing Recommendation:**

Before switching models, **test current model** with smart home queries:

```typescript
const testQueries = [
  "motion sensors that trigger lights",
  "devices with low battery",
  "temperature sensors in bedrooms",
  "automation that controls front door lock",
  "switches that turn on at night",
];

// Embed documents and queries, measure relevance
const results = await testSemanticSearch(testQueries, deviceDocuments);
```

**If Results are Good (>80% relevance):**
- ✅ Keep all-MiniLM-L6-v2 (avoid complexity)

**If Results are Poor (<60% relevance):**
- Consider domain-specific alternatives:
  - **sentence-transformers/all-mpnet-base-v2**: Higher quality, 768 dims, ~420 MB
  - **BAAI/bge-small-en-v1.5**: Optimized for retrieval, 384 dims, ~130 MB
  - **Fine-tuned model**: Train on smart home corpus (high effort)

**Recommendation:** Start with all-MiniLM-L6-v2 (current), evaluate with real queries, upgrade only if needed.

### 2.6 Storage and Performance

**Storage Requirements:**

**Per-Device Document:**
- Semantic text: ~200-500 characters
- Embedding: 384 float32 = 1.5 KB
- Metadata: ~500 bytes (JSON)
- **Total per device**: ~2-3 KB

**For 200 Devices:**
- Device documents: 200 × 2.5 KB = 500 KB
- Event patterns (50 patterns): 50 × 3 KB = 150 KB
- Automations (20 rules): 20 × 2 KB = 40 KB
- **Total index size**: ~700 KB (negligible)

**Query Performance:**

ChromaDB query latency (with 200 device documents):
- **Embedding generation**: 10-30ms (cached when possible)
- **Vector search**: 5-20ms (exact k-NN with 200 documents)
- **Metadata filtering**: 1-5ms
- **Total query time**: **15-55ms** (acceptable for interactive use)

**Memory Footprint:**

- Embedding model: ~100 MB (loaded once)
- Index (200 devices): ~2 MB (in-memory structures)
- Query cache: ~10-20 MB (configurable)
- **Total RAM**: ~120-150 MB (marginal increase)

**Scalability:**

| Devices | Index Size | Query Time | RAM Usage |
|---------|------------|------------|-----------|
| 100 | 350 KB | 10-40ms | 110 MB |
| 200 | 700 KB | 15-55ms | 120 MB |
| 500 | 1.7 MB | 30-90ms | 150 MB |
| 1000 | 3.5 MB | 50-150ms | 200 MB |

**Optimization Strategies:**

1. **Lazy Loading**: Don't index all devices at startup, index on-demand
2. **TTL Caching**: Cache embeddings with 1-hour expiration
3. **Batch Updates**: Re-index in batches (50 devices at a time)
4. **Metadata Filtering**: Filter by platform/room before vector search

### 2.7 Synchronization Strategy

**Challenge**: Device state changes frequently, index can become stale.

**Design Decision: Eventual Consistency with Smart Triggers**

**Update Triggers:**

1. **Critical Changes (immediate re-index)**:
   - Device added/removed
   - Device capabilities changed
   - Device name/room changed
   - Major configuration change (e.g., thermostat mode)

2. **State Changes (deferred re-index)**:
   - Device state change (switch on/off, temperature reading)
   - Battery level change
   - Connectivity status change
   - **Action**: Update metadata, re-index document within 5 minutes

3. **Event Patterns (batch re-index)**:
   - Daily at 3 AM: Re-analyze event patterns for all devices
   - On-demand: When user requests troubleshooting

**Implementation:**

```typescript
class DeviceSemanticIndex {
  private updateQueue: Set<DeviceId> = new Set();
  private updateTimer?: NodeJS.Timeout;

  async scheduleUpdate(deviceId: DeviceId, priority: 'immediate' | 'deferred') {
    if (priority === 'immediate') {
      await this.indexDevice(deviceId);
    } else {
      // Deferred: batch updates every 5 minutes
      this.updateQueue.add(deviceId);

      if (!this.updateTimer) {
        this.updateTimer = setTimeout(() => {
          this.processBatchUpdates();
        }, 5 * 60 * 1000); // 5 minutes
      }
    }
  }

  private async processBatchUpdates() {
    const devices = Array.from(this.updateQueue);
    await this.indexDevices(devices);
    this.updateQueue.clear();
    this.updateTimer = undefined;
  }
}
```

**Trade-offs:**

- **Pros**: Efficient batching, reduces indexing overhead
- **Cons**: Index can be up to 5 minutes stale for state changes
- **Acceptable**: State staleness doesn't impact troubleshooting significantly

---

## 3. Enhanced Troubleshooting Features

### 3.1 Prompt-Based Access Design

**Current Limitation:**

Troubleshooting mode is **binary** (on/off). User intent beyond mode-switching isn't classified.

**Enhancement: Intent Classification**

**Intent Categories:**

1. **Mode Management**:
   - "enter troubleshooting mode"
   - "help me troubleshoot"
   - "switch to diagnostic mode"
   - **Action**: Toggle troubleshooting mode

2. **Device Health Query**:
   - "check my motion sensor health"
   - "is my lock working properly?"
   - "diagnose kitchen lights"
   - **Action**: Invoke `get_device_health` automatically

3. **Issue Diagnosis**:
   - "why is my light turning on randomly?"
   - "my thermostat won't respond"
   - "motion sensor keeps going offline"
   - **Action**: Trigger full diagnostic workflow

4. **Discovery Query**:
   - "find devices similar to this one"
   - "what devices might cause this issue?"
   - "show me all motion sensors"
   - **Action**: Semantic search + DeviceRegistry lookup

5. **System Status**:
   - "how is my system doing?"
   - "any devices with issues?"
   - "show me failing devices"
   - **Action**: System-wide health scan

**Implementation Approach:**

**Option 1: LLM-Based Intent Classification (Recommended)**

Let the LLM classify intent using system prompts:

```typescript
const intentClassificationPrompt = `
Analyze the user's message and classify their intent:

Categories:
- mode_switch: User wants to enter/exit troubleshooting mode
- device_health: User asking about specific device health
- issue_diagnosis: User reporting a device problem
- discovery: User looking for devices or patterns
- system_status: User asking about overall system health
- general: Normal conversation

User message: "${userMessage}"

Respond with JSON: { "intent": "<category>", "confidence": 0.0-1.0, "entities": { "device": "...", "issue": "..." } }
`;
```

**Option 2: Keyword-Based Classification (Faster, Less Flexible)**

```typescript
const intentPatterns = {
  device_health: /\b(check|diagnose|status of|health of)\b.*\b(device|sensor|light|lock|switch)\b/i,
  issue_diagnosis: /\b(why|problem|issue|won't|not working|randomly|keeps)\b/i,
  discovery: /\b(find|show|list|what|which)\b.*\b(devices|sensors|similar)\b/i,
  system_status: /\b(system|overall|all devices|any issues)\b/i,
};

function classifyIntent(message: string): Intent {
  for (const [intent, pattern] of Object.entries(intentPatterns)) {
    if (pattern.test(message)) {
      return { category: intent, confidence: 0.8 };
    }
  }
  return { category: 'general', confidence: 0.5 };
}
```

**Option 3: Hybrid (Best of Both)**

1. Try keyword classification first (fast path)
2. If confidence <0.7, use LLM classification
3. Cache classification results for similar queries

**Recommendation**: Start with **Option 1 (LLM-based)** since we already have LLM in the loop. Add caching to mitigate latency.

### 3.2 Diagnostics Integration

**Current State**: Diagnostic tools exist but aren't automatically invoked.

**Enhancement: Automatic Diagnostic Workflow**

**Trigger Conditions:**

When user reports an issue with a device, automatically:

1. **Gather Device Context**:
   ```typescript
   const device = await deviceRegistry.resolveDevice(userQuery);
   const health = await diagnostics.getDeviceHealth(device.id);
   const events = await deviceService.getDeviceEvents(device.id, { startTime: '24h' });
   ```

2. **Analyze Health Indicators**:
   ```typescript
   const healthIssues = [];

   if (health.battery && health.battery < 20) {
     healthIssues.push('Low battery (${health.battery}%)');
   }

   if (!health.isOnline) {
     healthIssues.push('Device offline');
   }

   if (events.metadata.gapDetected) {
     healthIssues.push('Connectivity gaps detected');
   }
   ```

3. **Perform Related Checks**:
   ```typescript
   // Check if other devices in same room have issues
   const roomDevices = deviceRegistry.getDevicesInRoom(device.room);
   const roomHealth = await Promise.all(
     roomDevices.map(d => diagnostics.getDeviceHealth(d.id))
   );

   const roomIssues = roomHealth.filter(h => !h.isOnline || h.battery < 20);

   if (roomIssues.length > 1) {
     healthIssues.push('Multiple devices in ${device.room} have issues (possible hub problem)');
   }
   ```

4. **Search for Similar Issues**:
   ```typescript
   // Semantic search for similar issue reports
   const similarIssues = await semanticSearch(
     `${device.name} ${userIssueDescription}`,
     { type: 'event_pattern', limit: 5 }
   );
   ```

5. **Compile Diagnostic Report**:
   ```typescript
   const report = {
     device: {
       id: device.id,
       name: device.name,
       health: health,
     },
     healthIssues: healthIssues,
     eventAnalysis: {
       totalEvents: events.metadata.totalCount,
       gaps: events.metadata.gapDetected,
       patterns: detectedPatterns,
     },
     relatedIssues: similarIssues,
     recommendations: generateRecommendations(healthIssues, events),
   };
   ```

**Workflow Integration:**

```typescript
async function handleDiagnosticRequest(userMessage: string) {
  const intent = await classifyIntent(userMessage);

  if (intent.category === 'issue_diagnosis') {
    // Extract device from message
    const device = await extractDeviceFromMessage(userMessage);

    if (!device) {
      return "Which device are you having issues with?";
    }

    // Run automatic diagnostics
    const report = await runDiagnostics(device.id, userMessage);

    // Inject report into LLM context
    const enhancedPrompt = `
    User reported issue: "${userMessage}"

    Diagnostic Report:
    ${formatDiagnosticReport(report)}

    Based on this diagnostic data, provide troubleshooting guidance.
    `;

    return await llm.chat(enhancedPrompt);
  }
}
```

### 3.3 Discovery Features

**Goal**: Enable users to find related devices, similar issues, and patterns.

**Discovery Types:**

#### 3.3.1 Similar Devices

**Query**: "Find devices similar to my living room motion sensor"

**Approach**:

1. **Get Device Document**:
   ```typescript
   const device = await deviceRegistry.resolveDevice("living room motion sensor");
   const deviceDoc = await semanticIndex.getDocument(device.id);
   ```

2. **Semantic Search**:
   ```typescript
   const similarDevices = await semanticIndex.search(
     deviceDoc.semanticText,
     { type: 'device', limit: 10, excludeIds: [device.id] }
   );
   ```

3. **Re-rank by Structural Similarity**:
   ```typescript
   // Boost devices with same capabilities
   const reranked = similarDevices.map(result => {
     const capabilityOverlap = intersection(
       device.capabilities,
       result.device.capabilities
     ).length;

     return {
       ...result,
       score: result.score + (capabilityOverlap * 0.1)
     };
   }).sort((a, b) => b.score - a.score);
   ```

**Use Cases**:
- "Find all motion sensors like this one" (replacement candidates)
- "What devices are similar to this thermostat?" (feature comparison)
- "Show me devices with similar issues" (pattern detection)

#### 3.3.2 Related Issues

**Query**: "Has this issue happened before?"

**Approach**:

1. **Semantic Search Event Patterns**:
   ```typescript
   const issueDescription = extractIssueDescription(userMessage);

   const relatedPatterns = await semanticIndex.search(
     `${device.name} ${issueDescription}`,
     { type: 'event_pattern', limit: 5 }
   );
   ```

2. **Temporal Analysis**:
   ```typescript
   // Check if issue is recurring (same device, same pattern)
   const recurringIssues = relatedPatterns.filter(
     p => p.deviceId === device.id && p.metadata.patternType === 'anomaly'
   );

   if (recurringIssues.length > 0) {
     return {
       status: 'recurring',
       frequency: recurringIssues.length,
       firstSeen: recurringIssues[0].metadata.timeframe,
     };
   }
   ```

3. **Cross-Device Correlation**:
   ```typescript
   // Check if other devices have similar issues
   const affectedDevices = relatedPatterns
     .filter(p => p.deviceId !== device.id)
     .map(p => p.deviceId);

   if (affectedDevices.length > 0) {
     return {
       status: 'systemic',
       affectedDevices: affectedDevices,
       recommendation: 'Check hub or network infrastructure',
     };
   }
   ```

**Use Cases**:
- "Has my motion sensor done this before?" (recurring issue detection)
- "Are other devices having the same problem?" (systemic issue detection)
- "What fixed this last time?" (solution retrieval)

#### 3.3.3 Automation Discovery

**Query**: "What automations control this device?"

**Approach**:

1. **Semantic Search Automations**:
   ```typescript
   const automations = await semanticIndex.search(
     device.name,
     { type: 'automation', limit: 10 }
   );
   ```

2. **Structural Filtering**:
   ```typescript
   // Filter to automations that actually reference device
   const relevantAutomations = automations.filter(auto =>
     auto.metadata.triggers.includes(device.id) ||
     auto.metadata.actions.includes(device.id)
   );
   ```

3. **Role Classification**:
   ```typescript
   const automationRoles = relevantAutomations.map(auto => ({
     automation: auto,
     role: auto.metadata.triggers.includes(device.id) ? 'trigger' : 'action',
   }));
   ```

**Use Cases**:
- "What turns on my living room lights?" (trigger discovery)
- "What happens when this motion sensor triggers?" (action discovery)
- "Why did this device just activate?" (automation identification)

#### 3.3.4 Network Topology Discovery

**Query**: "How are my devices connected?"

**Approach**:

1. **Build Automation Graph**:
   ```typescript
   interface DeviceGraph {
     nodes: Device[];
     edges: {
       from: DeviceId;
       to: DeviceId;
       type: 'triggers' | 'controls';
       automation: AutomationId;
     }[];
   }

   async function buildDeviceGraph(): Promise<DeviceGraph> {
     const automations = await getAllAutomations();
     const edges = [];

     for (const auto of automations) {
       for (const trigger of auto.triggers) {
         for (const action of auto.actions) {
           edges.push({
             from: trigger,
             to: action,
             type: 'triggers',
             automation: auto.id,
           });
         }
       }
     }

     return { nodes: allDevices, edges };
   }
   ```

2. **Find Connected Devices**:
   ```typescript
   function findConnectedDevices(deviceId: DeviceId, graph: DeviceGraph): Device[] {
     const connected = new Set<DeviceId>();

     // Find all devices this device triggers
     const outgoing = graph.edges
       .filter(e => e.from === deviceId)
       .map(e => e.to);

     // Find all devices that trigger this device
     const incoming = graph.edges
       .filter(e => e.to === deviceId)
       .map(e => e.from);

     return [...new Set([...outgoing, ...incoming])];
   }
   ```

**Use Cases**:
- "What devices does this motion sensor affect?" (impact analysis)
- "What triggers this light?" (dependency tracing)
- "Show me devices connected to this one" (relationship mapping)

### 3.4 Pattern Detection

**Goal**: Automatically identify systemic issues and trends.

**Pattern Types:**

#### 3.4.1 Connectivity Patterns

```typescript
async function detectConnectivityPatterns(): Promise<ConnectivityPattern[]> {
  const devices = deviceRegistry.getAllDevices();
  const patterns = [];

  for (const device of devices) {
    const events = await deviceService.getDeviceEvents(device.id, {
      startTime: '7d',
      includeMetadata: true,
    });

    if (events.metadata.gapDetected) {
      const gaps = detectEventGaps(events.events);

      // Classify gap severity
      const severeGaps = gaps.filter(g => g.durationMs > 4 * 60 * 60 * 1000); // >4 hours

      if (severeGaps.length > 2) {
        patterns.push({
          type: 'connectivity',
          device: device,
          severity: 'high',
          description: `${device.name} has ${severeGaps.length} severe connectivity gaps in last 7 days`,
          recommendation: 'Check battery or move closer to hub',
        });
      }
    }
  }

  return patterns;
}
```

#### 3.4.2 Automation Conflict Patterns

```typescript
async function detectAutomationConflicts(): Promise<ConflictPattern[]> {
  const automations = await getAllAutomations();
  const conflicts = [];

  // Group automations by affected devices
  const deviceToAutomations = new Map<DeviceId, Automation[]>();

  for (const auto of automations) {
    for (const actionDevice of auto.actions) {
      if (!deviceToAutomations.has(actionDevice)) {
        deviceToAutomations.set(actionDevice, []);
      }
      deviceToAutomations.get(actionDevice)!.push(auto);
    }
  }

  // Check for conflicting actions
  for (const [deviceId, autos] of deviceToAutomations) {
    if (autos.length > 1) {
      // Check if automations set conflicting states
      const conflictingPairs = findConflictingActions(autos);

      if (conflictingPairs.length > 0) {
        conflicts.push({
          type: 'automation_conflict',
          device: deviceId,
          automations: conflictingPairs,
          description: `${autos.length} automations control this device with potentially conflicting actions`,
          recommendation: 'Review automation priorities and conditions',
        });
      }
    }
  }

  return conflicts;
}
```

#### 3.4.3 Battery Degradation Patterns

```typescript
async function detectBatteryDegradation(): Promise<BatteryPattern[]> {
  const batteryDevices = deviceRegistry.findDevices({
    capability: DeviceCapability.BATTERY,
  });

  const patterns = [];

  for (const device of batteryDevices) {
    const events = await deviceService.getDeviceEvents(device.id, {
      startTime: '30d',
      capabilities: ['battery'],
    });

    // Calculate battery drain rate
    const drainRate = calculateBatteryDrainRate(events.events);

    if (drainRate > 5) { // >5% per day
      const daysRemaining = device.currentState.battery / drainRate;

      patterns.push({
        type: 'battery_degradation',
        device: device,
        drainRate: drainRate,
        daysRemaining: Math.floor(daysRemaining),
        severity: daysRemaining < 7 ? 'high' : 'medium',
        recommendation: `Battery draining ${drainRate.toFixed(1)}% per day. Replace within ${Math.floor(daysRemaining)} days`,
      });
    }
  }

  return patterns;
}
```

---

## 4. Integration Architecture

### 4.1 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Request                             │
│  "Why is my motion sensor randomly turning on the lights?"   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  ChatOrchestrator                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Intent Classifier (LLM-based)                       │   │
│  │  - Mode management                                   │   │
│  │  - Device health query                               │   │
│  │  - Issue diagnosis ✓                                 │   │
│  │  - Discovery query                                   │   │
│  │  - System status                                     │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     │                                        │
│                     ▼                                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Diagnostic Workflow Orchestrator                    │   │
│  │  1. Resolve device: "motion sensor"                  │   │
│  │  2. Gather context (health, events, patterns)        │   │
│  │  3. Run automated diagnostics                        │   │
│  │  4. Semantic discovery (similar issues)              │   │
│  │  5. Compile diagnostic report                        │   │
│  └────┬─────────┬──────────┬──────────┬─────────────────┘   │
└───────┼─────────┼──────────┼──────────┼──────────────────────┘
        │         │          │          │
        ▼         ▼          ▼          ▼
┌───────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐
│ Device    │ │ Device   │ │ Semantic     │ │ Diagnostic   │
│ Registry  │ │ Service  │ │ Index        │ │ Tools        │
│           │ │          │ │              │ │              │
│ - Resolve │ │ - Events │ │ - Similar    │ │ - Health     │
│ - Lookup  │ │ - Status │ │   devices    │ │ - Commands   │
│ - Filter  │ │ - Control│ │ - Patterns   │ │ - System     │
└───────────┘ └──────────┘ │ - Issues     │ └──────────────┘
                           └──────────────┘
                                 │
                                 ▼
                         ┌──────────────┐
                         │ ChromaDB     │
                         │ Vector Index │
                         │              │
                         │ - Devices    │
                         │ - Patterns   │
                         │ - Automations│
                         └──────────────┘
```

### 4.2 Component Interactions

**1. Intent Classification Flow:**

```typescript
// ChatOrchestrator.ts
async processMessage(message: string): Promise<Response> {
  // Step 1: Classify user intent
  const intent = await this.classifyIntent(message);

  if (intent.category === 'issue_diagnosis') {
    // Step 2: Trigger diagnostic workflow
    const report = await this.diagnosticWorkflow.run(message, intent);

    // Step 3: Inject into LLM context
    return await this.llm.chat(message, {
      context: report,
      mode: 'troubleshooting',
    });
  }

  // ... other intent handlers
}
```

**2. Diagnostic Workflow:**

```typescript
// DiagnosticWorkflow.ts
class DiagnosticWorkflow {
  async run(userMessage: string, intent: Intent): Promise<DiagnosticReport> {
    // Step 1: Extract device from message
    const device = await this.extractDevice(userMessage);

    // Step 2: Parallel data gathering
    const [health, events, patterns, similarIssues] = await Promise.all([
      this.diagnostics.getDeviceHealth(device.id),
      this.deviceService.getDeviceEvents(device.id, { startTime: '7d' }),
      this.semanticIndex.searchPatterns(device.id),
      this.semanticIndex.searchSimilarIssues(userMessage, device),
    ]);

    // Step 3: Analyze and compile
    const analysis = this.analyzeData(health, events, patterns);

    return {
      device,
      health,
      eventAnalysis: analysis,
      similarIssues,
      recommendations: this.generateRecommendations(analysis),
    };
  }
}
```

**3. Semantic Index Integration:**

```typescript
// SemanticIndex.ts
class SemanticIndex {
  private chromaClient: ChromaClient;
  private collection: Collection;

  async searchDevices(query: string, filters?: Filters): Promise<Device[]> {
    // Step 1: Generate embedding for query
    const embedding = await this.embedder.embed(query);

    // Step 2: Vector search with metadata filtering
    const results = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults: filters?.limit ?? 10,
      where: filters?.metadata,
    });

    // Step 3: Hydrate device details from DeviceRegistry
    const deviceIds = results.ids[0];
    const devices = await Promise.all(
      deviceIds.map(id => this.deviceRegistry.getDevice(id as DeviceId))
    );

    return devices.filter(d => d !== undefined);
  }

  async indexDevice(device: UnifiedDevice): Promise<void> {
    const document = {
      id: device.id,
      semanticText: this.buildSemanticText(device),
      metadata: {
        name: device.name,
        room: device.room,
        capabilities: device.capabilities,
        platform: device.platform,
      },
    };

    await this.collection.add({
      ids: [device.id],
      documents: [document.semanticText],
      metadatas: [document.metadata],
    });
  }
}
```

### 4.3 Data Flow Diagram

**Troubleshooting Query Flow:**

```
User: "My motion sensor keeps triggering lights randomly"
  ↓
ChatOrchestrator
  ↓ classifyIntent()
  → Intent: { category: 'issue_diagnosis', device: 'motion sensor', issue: 'random triggers' }
  ↓
DiagnosticWorkflow.run()
  ↓
  ├─→ DeviceRegistry.resolveDevice("motion sensor")
  │   → Device { id: "abc-123", name: "Living Room Motion Sensor" }
  │
  ├─→ DiagnosticTools.getDeviceHealth("abc-123")
  │   → Health { online: true, battery: 85%, lastUpdate: "2025-11-27T10:30:00Z" }
  │
  ├─→ DeviceService.getDeviceEvents("abc-123", { startTime: "7d" })
  │   → Events { count: 847, gaps: [], patterns: [...] }
  │
  ├─→ SemanticIndex.searchPatterns("motion sensor random triggers")
  │   → Patterns [
  │       { id: "pattern-1", type: "recurring", description: "Motion events without person detection" },
  │       { id: "pattern-2", type: "anomaly", description: "Triggers during nighttime hours" }
  │     ]
  │
  └─→ SemanticIndex.searchAutomations("motion sensor")
      → Automations [
          { id: "auto-1", name: "Living Room Lights", triggers: ["abc-123"], actions: ["light-123"] }
        ]
  ↓
DiagnosticReport {
  device: { ... },
  health: { ... },
  eventAnalysis: {
    totalEvents: 847,
    patterns: [
      "Motion events cluster around 2-3 AM (possible automation issue)",
      "No person detection events correlate with triggers (pet or environmental movement?)"
    ]
  },
  relatedAutomations: [
    { name: "Living Room Lights", role: "trigger", condition: "motion active" }
  ],
  recommendations: [
    "Check automation conditions (might need 'person detected' instead of 'motion')",
    "Review motion sensor sensitivity settings",
    "Consider adding 'only during daytime' condition to automation"
  ]
}
  ↓
LLM.chat(message, { context: report, mode: 'troubleshooting' })
  ↓
Response: "I've analyzed your motion sensor. The issue appears to be that the automation
          'Living Room Lights' triggers on any motion, including pets or environmental
          movement. The sensor is detecting activity around 2-3 AM (847 events in 7 days).

          Recommendations:
          1. Update automation to use 'person detected' capability instead of 'motion'
          2. Add time restriction: 'only between 6 AM and 11 PM'
          3. Adjust sensor sensitivity in SmartThings app

          Would you like me to help modify the automation?"
```

### 4.4 Performance Considerations

**Query Latency Breakdown:**

```
Total Query Time: ~300-500ms
├─ Intent Classification: 100-200ms (LLM call, can be cached)
├─ Device Resolution: 5-10ms (DeviceRegistry O(1) lookup)
├─ Parallel Data Gathering: 150-250ms
│  ├─ Device Health: 50-100ms (SmartThings API call)
│  ├─ Event History: 100-200ms (SmartThings API + processing)
│  ├─ Semantic Pattern Search: 20-50ms (vector search)
│  └─ Automation Search: 20-50ms (vector search)
└─ Report Compilation: 10-30ms (data aggregation)
```

**Optimization Strategies:**

1. **Intent Caching**: Cache intent classifications for similar queries (5-minute TTL)
2. **Parallel Execution**: All data gathering happens in parallel (Promise.all)
3. **Progressive Disclosure**: Return health data immediately, stream additional insights
4. **Smart Indexing**: Only index devices when first queried (lazy loading)

**Memory Optimization:**

```typescript
class SemanticIndexManager {
  private indexCache = new LRUCache<DeviceId, Document>({
    max: 500, // Cache 500 most-accessed devices
    ttl: 30 * 60 * 1000, // 30-minute expiration
  });

  async getDeviceDocument(deviceId: DeviceId): Promise<Document> {
    // Check cache first
    const cached = this.indexCache.get(deviceId);
    if (cached) return cached;

    // Not cached: build and index
    const device = await this.deviceRegistry.getDevice(deviceId);
    const document = await this.indexDevice(device);

    this.indexCache.set(deviceId, document);
    return document;
  }
}
```

---

## 5. Implementation Plan

### Phase 1: Semantic Device Indexing (Week 1-2)

**Goal**: Index device metadata for semantic search.

**Tasks:**

1. **Create SemanticIndex Service** (3 days)
   - Design document schema
   - Implement buildSemanticText()
   - Integrate with ChromaDB
   - Write unit tests

2. **Integrate with DeviceRegistry** (2 days)
   - Add indexing triggers on device add/update/remove
   - Implement batch indexing for existing devices
   - Add synchronization strategy

3. **Implement Device Search** (2 days)
   - searchDevices(query, filters)
   - Metadata filtering post-search
   - Result hydration from DeviceRegistry

4. **Testing and Optimization** (2 days)
   - Test with 200+ devices
   - Measure query latency
   - Optimize embedding caching

**Deliverables:**
- `src/services/SemanticIndex.ts`
- `src/services/__tests__/SemanticIndex.test.ts`
- Integration with DeviceRegistry
- MCP tool: `semantic_search_devices`

**Success Criteria:**
- ✅ All devices indexed with <5-minute staleness
- ✅ Query latency <100ms for 200 devices
- ✅ Search relevance >80% for test queries

### Phase 2: Enhanced Prompt Patterns (Week 3)

**Goal**: Expand beyond mode-switching to intent classification.

**Tasks:**

1. **Implement Intent Classifier** (2 days)
   - Design intent categories
   - Create classification prompts
   - Implement caching layer

2. **Create Diagnostic Workflow Orchestrator** (3 days)
   - Extract device from message
   - Parallel data gathering (health, events, patterns)
   - Compile diagnostic report

3. **Integrate with ChatOrchestrator** (2 days)
   - Hook intent classifier into message processing
   - Trigger diagnostic workflow for issue_diagnosis intent
   - Inject report into LLM context

**Deliverables:**
- `src/services/IntentClassifier.ts`
- `src/services/DiagnosticWorkflow.ts`
- Enhanced ChatOrchestrator
- Updated troubleshooting prompts

**Success Criteria:**
- ✅ Intent classification accuracy >85%
- ✅ Automatic diagnostic workflow triggers correctly
- ✅ LLM receives rich context for troubleshooting

### Phase 3: Integrated Diagnostics (Week 4)

**Goal**: Automatically invoke diagnostic tools during troubleshooting.

**Tasks:**

1. **Enhance DiagnosticWorkflow** (3 days)
   - Add automatic health checks
   - Integrate with existing diagnostic tools
   - Add cross-device correlation

2. **Pattern Detection** (2 days)
   - Implement connectivity pattern detection
   - Implement automation conflict detection
   - Implement battery degradation detection

3. **System Status Dashboard** (2 days)
   - Aggregate system-wide health
   - Identify devices needing attention
   - Generate proactive recommendations

**Deliverables:**
- Enhanced `DiagnosticWorkflow.ts`
- Pattern detection utilities
- MCP tool: `get_system_status`

**Success Criteria:**
- ✅ Health checks run automatically during troubleshooting
- ✅ Pattern detection identifies >80% of connectivity issues
- ✅ System status provides actionable insights

### Phase 4: Discovery Features (Week 5-6)

**Goal**: Enable semantic discovery of devices, patterns, and issues.

**Tasks:**

1. **Similar Devices** (2 days)
   - Implement semantic device similarity
   - Re-ranking by structural similarity
   - MCP tool: `find_similar_devices`

2. **Related Issues** (2 days)
   - Index event patterns
   - Semantic search for similar issues
   - Temporal and cross-device correlation

3. **Automation Discovery** (2 days)
   - Index automation rules
   - Semantic search for automations
   - Role classification (trigger vs action)

4. **Network Topology** (2 days)
   - Build automation graph
   - Find connected devices
   - Impact analysis

5. **Testing and Refinement** (2 days)
   - End-to-end testing
   - Performance optimization
   - User experience refinement

**Deliverables:**
- Event pattern indexing
- Automation indexing
- MCP tools: `find_similar_devices`, `find_related_issues`, `discover_automations`
- Network topology analysis

**Success Criteria:**
- ✅ Similar device search finds relevant candidates
- ✅ Issue correlation identifies recurring problems
- ✅ Automation discovery reveals device relationships

### Phase 5: Polish and Documentation (Week 7)

**Goal**: Finalize implementation and create comprehensive documentation.

**Tasks:**

1. **Performance Optimization** (2 days)
   - Profile query latency
   - Optimize indexing strategy
   - Add caching layers

2. **Error Handling** (1 day)
   - Graceful degradation if vector search fails
   - Fallback to DeviceRegistry-only mode

3. **Documentation** (2 days)
   - User guide for semantic search
   - API reference for new MCP tools
   - Architecture diagrams

4. **Testing and QA** (2 days)
   - Integration testing
   - Load testing with 500+ devices
   - User acceptance testing

**Deliverables:**
- Performance optimizations
- Comprehensive documentation
- Test coverage >85%

**Success Criteria:**
- ✅ All features working end-to-end
- ✅ Documentation complete and clear
- ✅ Performance targets met

---

## 6. Technical Recommendations

### 6.1 Technology Stack

**Vector Database: ChromaDB** (Current)
- ✅ Already deployed and working
- ✅ Lightweight and embeddable
- ✅ Good Python/Node.js support
- ✅ Sufficient for <1000 devices
- ⚠️ Consider alternatives if scaling >5000 devices (Qdrant, Weaviate)

**Embedding Model: all-MiniLM-L6-v2** (Current)
- ✅ Fast and lightweight
- ✅ Good general-purpose performance
- ⚠️ Test with smart home queries before committing
- 🔄 Upgrade to all-mpnet-base-v2 if quality insufficient

**Intent Classification: LLM-based** (Recommended)
- ✅ Flexible and accurate
- ✅ Leverages existing LLM infrastructure
- ✅ Can evolve with prompt engineering
- ⚠️ Add caching to mitigate latency

**Synchronization: Eventual Consistency** (Recommended)
- ✅ Efficient batching reduces overhead
- ✅ Acceptable staleness for troubleshooting
- ⚠️ 5-minute delay for state changes is acceptable

### 6.2 API Design

**New MCP Tools:**

1. **semantic_search_devices**
   ```json
   {
     "name": "semantic_search_devices",
     "description": "Search for devices using natural language queries",
     "inputSchema": {
       "type": "object",
       "properties": {
         "query": { "type": "string", "description": "Natural language query (e.g., 'motion sensors in bedrooms')" },
         "limit": { "type": "number", "default": 10 },
         "filters": {
           "type": "object",
           "properties": {
             "room": { "type": "string" },
             "capabilities": { "type": "array", "items": { "type": "string" } },
             "platform": { "type": "string", "enum": ["smartthings", "tuya", "lutron"] }
           }
         }
       },
       "required": ["query"]
     }
   }
   ```

2. **find_similar_devices**
   ```json
   {
     "name": "find_similar_devices",
     "description": "Find devices similar to a given device",
     "inputSchema": {
       "type": "object",
       "properties": {
         "deviceId": { "type": "string", "description": "Device ID to find similar devices for" },
         "limit": { "type": "number", "default": 10 }
       },
       "required": ["deviceId"]
     }
   }
   ```

3. **find_related_issues**
   ```json
   {
     "name": "find_related_issues",
     "description": "Find similar issues or patterns for a device",
     "inputSchema": {
       "type": "object",
       "properties": {
         "deviceId": { "type": "string" },
         "issueDescription": { "type": "string" },
         "timeframe": { "type": "string", "default": "7d" }
       },
       "required": ["deviceId", "issueDescription"]
     }
   }
   ```

4. **discover_automations**
   ```json
   {
     "name": "discover_automations",
     "description": "Discover automations that control or are triggered by a device",
     "inputSchema": {
       "type": "object",
       "properties": {
         "deviceId": { "type": "string" },
         "role": { "type": "string", "enum": ["trigger", "action", "any"], "default": "any" }
       },
       "required": ["deviceId"]
     }
   }
   ```

5. **get_system_status**
   ```json
   {
     "name": "get_system_status",
     "description": "Get comprehensive system health status and recommendations",
     "inputSchema": {
       "type": "object",
       "properties": {
         "includePatterns": { "type": "boolean", "default": true },
         "includeRecommendations": { "type": "boolean", "default": true }
       }
     }
   }
   ```

### 6.3 Performance Targets

**Query Latency:**
- Intent classification: <200ms (with caching)
- Device semantic search: <100ms
- Diagnostic workflow: <500ms total
- Full troubleshooting response: <2 seconds

**Memory Footprint:**
- Semantic index: <200 MB (200 devices)
- Query cache: <50 MB
- Total increase: <250 MB

**Indexing Performance:**
- Device indexing: <50ms per device
- Batch indexing (50 devices): <2 seconds
- Full re-index (200 devices): <10 seconds

**Accuracy Targets:**
- Intent classification: >85% accuracy
- Device search relevance: >80% for test queries
- Pattern detection: >80% for connectivity issues

### 6.4 Testing Strategy

**Unit Tests:**
- `SemanticIndex.test.ts`: Document building, search, indexing
- `IntentClassifier.test.ts`: Intent classification accuracy
- `DiagnosticWorkflow.test.ts`: Workflow orchestration

**Integration Tests:**
- End-to-end troubleshooting workflow
- DeviceRegistry + SemanticIndex integration
- Pattern detection accuracy

**Performance Tests:**
- Query latency with 200, 500, 1000 devices
- Memory usage during indexing
- Batch update performance

**User Acceptance Tests:**
- Test queries: "motion sensors in bedrooms"
- Troubleshooting scenarios: "why is my light turning on randomly?"
- Discovery queries: "what devices are like this one?"

**Test Data:**
- Create mock device dataset (200 devices)
- Generate synthetic event history
- Create sample automation rules

---

## 7. Appendices

### Appendix A: Test Queries for Semantic Search

**Device Search Queries:**

| Query | Expected Results | Test Criteria |
|-------|------------------|---------------|
| "motion sensors in bedrooms" | All motion sensors in bedroom rooms | >80% precision |
| "lights that can dim" | All devices with dimmer capability | 100% recall |
| "devices with low battery" | All devices <20% battery | 100% precision |
| "temperature sensors" | All devices with temperature capability | >90% recall |
| "smart locks" | All lock devices | 100% precision |
| "devices similar to living room motion sensor" | Motion sensors, occupancy sensors | >70% relevance |

**Troubleshooting Queries:**

| Query | Expected Intent | Expected Actions |
|-------|-----------------|------------------|
| "why is my light turning on randomly?" | issue_diagnosis | Health check + event analysis + automation discovery |
| "check my motion sensor" | device_health | Health check only |
| "what devices are having issues?" | system_status | System-wide health scan |
| "find devices like this one" | discovery | Similar device search |
| "is my system healthy?" | system_status | System status report |

**Discovery Queries:**

| Query | Expected Results | Test Criteria |
|-------|------------------|---------------|
| "what triggers my living room lights?" | Automations with lights as action | 100% recall |
| "what happens when motion sensor triggers?" | Automations with sensor as trigger | 100% recall |
| "show me devices connected to this one" | Graph-connected devices | >80% recall |

### Appendix B: Memory and Storage Estimates

**Device Index Size Calculation:**

```
Single Device Document:
- Semantic text: 300 chars × 1 byte = 300 bytes
- Embedding: 384 dims × 4 bytes (float32) = 1,536 bytes
- Metadata JSON: 500 bytes
- ChromaDB overhead: 200 bytes
Total per device: ~2.5 KB

For 200 devices: 200 × 2.5 KB = 500 KB
For 500 devices: 500 × 2.5 KB = 1.25 MB
For 1000 devices: 1000 × 2.5 KB = 2.5 MB
```

**Event Pattern Index Size:**

```
Single Pattern Document:
- Semantic text: 400 chars = 400 bytes
- Embedding: 1,536 bytes
- Metadata: 600 bytes
Total per pattern: ~2.5 KB

Estimated patterns per device: 0.25 (1 pattern per 4 devices)
For 200 devices: 50 patterns × 2.5 KB = 125 KB
```

**Automation Index Size:**

```
Single Automation Document:
- Semantic text: 300 chars = 300 bytes
- Embedding: 1,536 bytes
- Metadata: 400 bytes
Total per automation: ~2.2 KB

Estimated automations: 20-50 for typical user
For 30 automations: 30 × 2.2 KB = 66 KB
```

**Total Index Size:**
- Devices: 500 KB
- Patterns: 125 KB
- Automations: 66 KB
- **Total**: ~700 KB (negligible compared to ChromaDB overhead of ~34 MB)

### Appendix C: Alternative Embedding Models

| Model | Dims | Size | Speed | Quality | Use Case |
|-------|------|------|-------|---------|----------|
| all-MiniLM-L6-v2 (current) | 384 | 90 MB | Fast | Good | General-purpose, current choice |
| all-mpnet-base-v2 | 768 | 420 MB | Medium | Better | Higher quality if needed |
| bge-small-en-v1.5 | 384 | 130 MB | Fast | Good | Optimized for retrieval |
| bge-base-en-v1.5 | 768 | 420 MB | Medium | Better | Higher quality retrieval |
| e5-small-v2 | 384 | 130 MB | Fast | Good | Alternative general-purpose |

**Recommendation**: Start with **all-MiniLM-L6-v2**, test with real queries. If search relevance <70%, upgrade to **all-mpnet-base-v2**.

### Appendix D: Risk Analysis

**Technical Risks:**

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Vector search quality insufficient | Medium | High | Test early with real queries, have fallback to DeviceRegistry |
| Memory usage too high | Low | Medium | Implement lazy loading and caching |
| Query latency too slow | Low | High | Optimize with caching, parallel execution |
| Indexing overhead impacts runtime | Medium | Medium | Use batch updates, off-peak indexing |
| Intent classification inaccurate | Medium | High | Test extensively, iterate on prompts |

**Operational Risks:**

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Index desynchronization | Medium | Medium | Implement robust sync strategy with monitoring |
| Storage growth exceeds expectations | Low | Low | Monitor index size, implement cleanup |
| ChromaDB crashes or corrupts | Low | High | Regular backups, graceful degradation |

**User Experience Risks:**

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Users don't understand semantic queries | Medium | Medium | Provide examples in documentation |
| Too many false positives in search | Medium | High | Tune similarity threshold, add filtering |
| Discovery features confusing | Low | Medium | Clear UX design, tooltips, examples |

---

## Conclusion

This research provides a comprehensive roadmap for semantic indexing and enhanced troubleshooting capabilities. The key insights are:

1. **Strong Foundation**: DeviceRegistry and vector search infrastructure are already in place. Build on these rather than replacing them.

2. **Complementary Approach**: Use DeviceRegistry for structural queries (fast, exact) and vector search for semantic queries (fuzzy, exploratory).

3. **Phased Implementation**: Start with device indexing (Phase 1), then intent classification (Phase 2), diagnostics integration (Phase 3), and discovery features (Phase 4).

4. **Performance Focus**: With proper caching and optimization, semantic features can add <250 MB memory and <100ms query latency.

5. **User Value**: Enhanced troubleshooting with automatic diagnostics, pattern detection, and discovery features significantly improves user experience.

**Next Steps:**

1. Review this research document with team
2. Prioritize phases based on user needs
3. Begin Phase 1 implementation (semantic device indexing)
4. Test embedding model with real smart home queries
5. Iterate based on user feedback

**Estimated Total Effort:** 7 weeks (1 developer, full-time)

**Estimated ROI:** High - significantly improves troubleshooting accuracy and user experience with moderate development effort.

---

**Research Complete**
**Date:** 2025-11-27
**Researcher:** Claude Code (Research Agent)
**Status:** Ready for Design Review and Implementation Planning
