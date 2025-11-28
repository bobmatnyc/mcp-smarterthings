# Diagnostic System Speculation Analysis (1M-345)

**Research Date:** 2025-11-28
**Ticket:** 1M-345 - Diagnostic System Must Only Report Observable Evidence (No Speculation)
**Priority:** CRITICAL
**Researcher:** Claude Code (Research Agent)

---

## Executive Summary

The diagnostic system in `DiagnosticWorkflow.ts` contains **multiple instances of speculation** where recommendations are generated without corresponding evidence. Critical issues identified:

1. **Motion sensor recommendations** (line 654-660) suggest checking motion sensors based solely on "similar devices having motion sensors" - NOT on actual motion sensor evidence for the target device
2. **Scene review recommendations** (line 663) suggest checking "scheduled routines" without any scene or routine evidence
3. **Generic fallback recommendations** (line 640-645) provide vague guidance when automation identification fails
4. **No manufacturer app prioritization** - manufacturer information is collected (line 457-462) but NEVER used to recommend checking manufacturer-specific apps FIRST

**Validation Case:** Sengled Master Alcove Bar
- ✅ 95% automation confidence (valid evidence from rapid re-triggers)
- ❌ Suggested checking motion sensors (NO motion sensor evidence)
- ❌ Suggested reviewing scenes (NO scene access via SmartThings API)
- ❌ Did NOT recommend checking Sengled app first

---

## 1. Speculation Sources (Line-by-Line Analysis)

### 1.1 Motion Sensor Speculation (CRITICAL ISSUE)

**Location:** `DiagnosticWorkflow.ts:654-660`

```typescript
// Motion sensor check (if similar devices include sensors)
const hasSensorNearby = context.similarDevices?.some((d) =>
  Array.from(d.device.metadata.capabilities).includes('motionSensor')
);
if (hasSensorNearby) {
  recommendations.push('Review motion sensor automations that may be triggering this device');
}
```

**Evidence Gap:**
- ✅ **Evidence collected:** Similar devices with motion sensors exist in the same location
- ❌ **Evidence NOT collected:** Whether ANY motion sensor triggered within the timeframe
- ❌ **Evidence NOT collected:** Whether automation rules link motion sensors to this device
- ❌ **Evidence NOT collected:** Recent motion sensor activity logs

**Speculation Keywords:**
- "may be triggering" (speculation without evidence)

**Fix Approach:**
```typescript
// EVIDENCE-BASED VERSION
if (context.identifiedAutomations?.some(auto =>
  auto.evidence.includes('motion sensor trigger') ||
  auto.deviceRoles.includes('Motion Sensor')
)) {
  const motionSensors = context.identifiedAutomations
    .filter(auto => auto.deviceRoles.includes('Motion Sensor'))
    .map(auto => auto.ruleName);

  recommendations.push(
    `Evidence: Automation "${motionSensors[0]}" uses motion sensor as trigger. ` +
    `Action: Check motion sensor activity logs in SmartThings app.`
  );
}
// No motion sensor evidence? Don't recommend checking motion sensors.
```

---

### 1.2 Scene/Routine Speculation (CRITICAL ISSUE)

**Location:** `DiagnosticWorkflow.ts:663`

```typescript
// Time-based patterns
recommendations.push('Check for scheduled routines executing around the time of the issue');
```

**Evidence Gap:**
- ❌ **No scene API access:** SmartThings API does NOT provide scene/routine inspection
- ❌ **No schedule evidence:** No data collected about scheduled automations
- ❌ **No time-correlation:** Recommendation applies to ALL automation patterns, not just time-based

**Speculation Keywords:**
- "Check for" (directive without evidence)
- Implicit assumption: User can access scene internals (they cannot via API)

**Fix Approach:**
```typescript
// EVIDENCE-BASED VERSION
if (context.identifiedAutomations?.some(auto => auto.evidence.includes('scheduled trigger'))) {
  recommendations.push(
    `Evidence: Automation has scheduled trigger. ` +
    `Action: Open SmartThings app → Automations → Check schedule for "${auto.ruleName}".`
  );
} else {
  // DO NOT recommend checking schedules without schedule evidence
}
```

---

### 1.3 Generic Fallback Speculation (MODERATE ISSUE)

**Location:** `DiagnosticWorkflow.ts:640-645`

```typescript
// FALLBACK: Generic recommendations if automation identification failed
recommendations.push(
  `Automation pattern detected (${((issue?.confidence || 0) * 100).toFixed(0)}% confidence) but unable to identify specific automation.`
);
recommendations.push('Check SmartThings app → Automations for rules affecting this device');
```

**Evidence Gap:**
- ✅ **Evidence collected:** Rapid re-trigger pattern detected (95% confidence)
- ❌ **No specific automation identified:** API call failed or returned no matches
- ⚠️ **Vague recommendation:** "Check SmartThings app" doesn't explain HOW or WHAT to look for

**Speculation Keywords:**
- "Check" (vague directive)

**Fix Approach:**
```typescript
// EVIDENCE-BASED VERSION
recommendations.push(
  `Evidence: ${issue.description} detected in event history.`
);
recommendations.push(
  `Observable pattern: Device turned OFF at ${offTime}, then ON at ${onTime} (${gapSeconds}s gap).`
);
recommendations.push(
  `Action: Open SmartThings app → Automations → Search for rules with this device as ACTION target.`
);
recommendations.push(
  `Look for: "When [trigger], turn ${deviceName} on" logic that might conflict with manual control.`
);
```

---

### 1.4 Missing Manufacturer App Prioritization (NEW FEATURE NEEDED)

**Location:** `DiagnosticWorkflow.ts:457-462` (evidence collection only)

```typescript
// Device Information (context formatting)
if (context.device.manufacturer) {
  sections.push(`- **Manufacturer**: ${context.device.manufacturer}`);
}
if (context.device.model) {
  sections.push(`- **Model**: ${context.device.model}`);
}
```

**Evidence Gap:**
- ✅ **Evidence collected:** Manufacturer name (e.g., "Sengled")
- ❌ **Evidence NOT used:** No recommendation to check manufacturer app
- ❌ **Assumption:** Users should check SmartThings first (often wrong for Sengled, Philips Hue, LIFX, etc.)

**Fix Approach:**
```typescript
// ADD TO generateRecommendations() - HIGHEST PRIORITY
private generateRecommendations(context: DiagnosticContext): string[] {
  const recommendations: string[] = [];

  // PRIORITY 1: Manufacturer App Check (if known manufacturer)
  if (context.device?.manufacturer && hasAutomationPattern) {
    const manufacturer = context.device.manufacturer;

    // Known manufacturers with proprietary automation systems
    const proprietaryManufacturers = ['Sengled', 'Philips', 'LIFX', 'Wyze', 'TP-Link'];

    if (proprietaryManufacturers.some(m => manufacturer.includes(m))) {
      recommendations.push(
        `⚠️ PRIORITY: ${manufacturer} devices often have manufacturer-specific automation features.`
      );
      recommendations.push(
        `Action: Open ${manufacturer} app FIRST → Check for automations, schedules, or scenes controlling "${context.device.label}".`
      );
      recommendations.push(
        `Evidence: SmartThings detected rapid re-triggers (${issue.confidence * 100}% confidence) but manufacturer app automations are NOT visible via SmartThings API.`
      );
    }
  }

  // PRIORITY 2: SmartThings automations (existing logic)
  // ...rest of existing recommendations...
}
```

---

## 2. Evidence Collection Gaps

### 2.1 Currently Collected Evidence

| Evidence Type | Source | Available? | Used in Recommendations? |
|---------------|--------|------------|-------------------------|
| Device health | `getDeviceHealth()` | ✅ Yes | ✅ Yes (offline, low battery) |
| Recent events | `getRecentEvents()` | ✅ Yes | ✅ Yes (rapid changes, gaps) |
| Automation identification | `identifyControllingAutomations()` | ✅ Yes | ✅ Yes (specific automations) |
| Similar devices | `findSimilarDevices()` | ✅ Yes | ❌ **MISUSED** (motion sensor speculation) |
| Manufacturer/model | Device metadata | ✅ Yes | ❌ **NOT USED** |

### 2.2 Evidence NOT Collected (but recommended)

| Evidence Type | Gap Description | Fix Feasibility |
|---------------|-----------------|-----------------|
| Motion sensor activity | No API call to check motion sensor events | **HIGH** - Add `getMotionSensorActivity()` |
| Scene/routine details | SmartThings API doesn't expose scene internals | **IMPOSSIBLE** - API limitation |
| Schedule triggers | Automation API doesn't include schedule details | **LOW** - May require parsing automation JSON |
| Manufacturer app automations | No API access to Sengled, Philips, etc. apps | **IMPOSSIBLE** - Requires user to check manually |

---

## 3. API Limitations Analysis

### 3.1 Confirmed API Limitations

**SmartThings API Gaps:**

1. **Scene Internals:** SmartThings API does NOT provide:
   - Scene configuration details
   - Scene execution history
   - Scene-to-device mappings

2. **Manufacturer App Automations:** Cannot access:
   - Sengled app automations
   - Philips Hue scenes/routines
   - LIFX schedules
   - Any third-party automation platforms

3. **Automation Schedule Details:** Limited access to:
   - Cron expression interpretation
   - "Sunrise/sunset" trigger details
   - Conditional logic breakdown

**Recommendation for API Limitations:**
```typescript
// Template for API limitation reporting
if (hasAutomationPattern && !context.identifiedAutomations?.length) {
  recommendations.push(
    `⚠️ API Limitation: SmartThings API cannot access scene details or manufacturer app automations.`
  );
  recommendations.push(
    `Manual Investigation Required: ` +
    `1. Open SmartThings app → Scenes → Check for scenes using "${deviceName}". ` +
    `2. Open manufacturer app (${manufacturer}) → Check for device-specific automations.`
  );
}
```

---

## 4. Test Case Validation: Sengled Master Alcove Bar

### 4.1 Expected vs. Actual Behavior

**User Query:** "Why did Master Alcove Bar turn on at 12:34 AM?"

**Observable Evidence:**
- ✅ Device turned OFF at 00:34:44 (manual user action)
- ✅ Device turned ON at 00:34:47 (3-second gap = 95% automation confidence)
- ✅ Manufacturer: Sengled
- ❌ NO motion sensors in room
- ❌ NO motion sensor events in timeframe

**Current Recommendations (WRONG):**
```
❌ "Review motion sensor automations that may be triggering this device"
   → NO EVIDENCE of motion sensors affecting this device

❌ "Check for scheduled routines executing around the time of the issue"
   → NO EVIDENCE of scheduled automations (12:34 AM is NOT a typical schedule)

❌ "Check SmartThings app → Automations"
   → SHOULD PRIORITIZE Sengled app (manufacturer-specific automations)
```

**Expected Recommendations (EVIDENCE-BASED):**
```
✅ "Evidence: Device turned OFF at 00:34:44, then ON at 00:34:47 (3s gap)."

✅ "95% confidence automation trigger detected (re-trigger pattern)."

✅ "⚠️ PRIORITY: Sengled devices often have manufacturer-specific automation features."

✅ "Action: Open Sengled Home app FIRST → Check for automations or schedules controlling 'Master Alcove Bar'."

✅ "Evidence: SmartThings detected rapid re-trigger but Sengled app automations are NOT visible via SmartThings API."

✅ "If no Sengled app automations found, then check SmartThings app → Automations → Search for rules with 'Master Alcove Bar' as action target."
```

---

## 5. Speculation Keywords Found

**Complete list of speculation terms in `DiagnosticWorkflow.ts`:**

| Line | Keyword | Context | Severity |
|------|---------|---------|----------|
| 659 | "may be triggering" | Motion sensor recommendation | 🔴 CRITICAL |
| 663 | "Check for" | Scheduled routines | 🔴 CRITICAL |
| 644 | "Check" | Generic SmartThings app | 🟡 MODERATE |
| 650 | "Look for" | Automation logic pattern | 🟡 MODERATE |

**Recommendation:** Replace ALL speculation keywords with evidence-based language:
- "may be" → "Evidence shows" / "Observable pattern"
- "Check for" → "Action: Verify [specific evidence-based claim]"
- "Look for" → "Expected pattern based on evidence: [pattern]"

---

## 6. Recommended Fix Approach

### 6.1 Evidence-Based Recommendation Structure

**Template:**
```typescript
interface EvidenceBasedRecommendation {
  evidence: string;          // Observable fact from collected data
  observation: string;       // Interpretation of evidence
  action: string;            // Specific user action with context
  apiLimitation?: string;    // Note if API cannot provide needed evidence
}
```

**Example:**
```typescript
{
  evidence: "Device turned OFF at 00:34:44, then ON at 00:34:47 (3s gap).",
  observation: "95% confidence automation trigger (typical automation re-trigger pattern).",
  action: "Open Sengled Home app → Automations → Check for rules affecting 'Master Alcove Bar'.",
  apiLimitation: "Sengled app automations are not visible via SmartThings API."
}
```

### 6.2 Recommendation Priority System

**Priority 1:** Manufacturer-specific guidance (if manufacturer detected + automation pattern)
```typescript
if (manufacturer && isProprietaryManufacturer(manufacturer) && hasAutomationPattern) {
  recommendations.push(`⚠️ PRIORITY: Check ${manufacturer} app FIRST`);
}
```

**Priority 2:** SmartThings identified automations (specific automation IDs)
```typescript
if (identifiedAutomations.length > 0) {
  recommendations.push(`Specific automation found: "${auto.ruleName}" (ID: ${auto.ruleId})`);
}
```

**Priority 3:** SmartThings generic guidance (fallback when identification fails)
```typescript
if (hasAutomationPattern && !identifiedAutomations.length) {
  recommendations.push(`Manual search required: SmartThings app → Automations`);
}
```

**Priority 4:** Evidence-based pattern warnings
```typescript
if (rapidChanges > 5) {
  recommendations.push(`ALERT: ${rapidChanges} rapid changes suggest automation loop`);
}
```

### 6.3 Manufacturer Detection Enhancement

**Add manufacturer-to-app mapping:**
```typescript
const MANUFACTURER_APPS: Record<string, string> = {
  'Sengled': 'Sengled Home',
  'Philips': 'Philips Hue',
  'LIFX': 'LIFX',
  'Wyze': 'Wyze',
  'TP-Link': 'Kasa Smart',
  'Meross': 'Meross',
  'GE': 'C by GE',
};

function getManufacturerApp(manufacturer?: string): string | undefined {
  if (!manufacturer) return undefined;

  for (const [key, app] of Object.entries(MANUFACTURER_APPS)) {
    if (manufacturer.includes(key)) return app;
  }
  return undefined;
}
```

---

## 7. Implementation Checklist

### Phase 1: Remove Speculation (CRITICAL - Ticket 1M-345)

- [ ] **Remove motion sensor speculation** (line 654-660)
  - Only recommend if motion sensor evidence exists in `identifiedAutomations`

- [ ] **Remove scene/routine speculation** (line 663)
  - Only recommend if schedule evidence exists in automation details

- [ ] **Enhance fallback recommendations** (line 640-645)
  - Add specific observable evidence
  - Add step-by-step search guidance

- [ ] **Add manufacturer app prioritization** (NEW)
  - Detect proprietary manufacturers
  - Recommend manufacturer app FIRST
  - Explain API limitations

### Phase 2: Evidence Collection Enhancement (FUTURE)

- [ ] Add motion sensor activity check (if motion sensor recommendation needed)
- [ ] Add automation schedule parsing (if feasible via API)
- [ ] Add evidence validation before recommendation generation

### Phase 3: API Limitation Reporting (FUTURE)

- [ ] Document SmartThings API gaps in recommendations
- [ ] Add "Manual Investigation Required" section for API-blocked evidence
- [ ] Provide specific user guidance for manual checks

---

## 8. Code Examples

### 8.1 Evidence-Based Motion Sensor Recommendation

**BEFORE (Speculation):**
```typescript
// Motion sensor check (if similar devices include sensors)
const hasSensorNearby = context.similarDevices?.some((d) =>
  Array.from(d.device.metadata.capabilities).includes('motionSensor')
);
if (hasSensorNearby) {
  recommendations.push('Review motion sensor automations that may be triggering this device');
}
```

**AFTER (Evidence-Based):**
```typescript
// Motion sensor check (ONLY if evidence exists)
const motionSensorAutomations = context.identifiedAutomations?.filter(auto =>
  auto.deviceRoles.includes('Motion Sensor') ||
  auto.evidence.some(e => e.includes('motion'))
);

if (motionSensorAutomations && motionSensorAutomations.length > 0) {
  recommendations.push(
    `Evidence: Automation "${motionSensorAutomations[0].ruleName}" uses motion sensor as trigger.`
  );
  recommendations.push(
    `Action: Check motion sensor activity in SmartThings app → Devices → [Motion Sensor] → History.`
  );
  recommendations.push(
    `Expected pattern: Motion sensor event should occur within ${rapidIssue.occurrences} seconds before device state change.`
  );
}
// NO motion sensor evidence? NO motion sensor recommendation.
```

### 8.2 Manufacturer App Prioritization

**NEW CODE:**
```typescript
// PRIORITY 1: Manufacturer App Check (add at START of generateRecommendations)
if (context.device?.manufacturer && hasAutomationPattern) {
  const manufacturer = context.device.manufacturer;
  const manufacturerApp = getManufacturerApp(manufacturer);

  if (manufacturerApp) {
    recommendations.push(
      `⚠️ PRIORITY: ${manufacturer} devices often have manufacturer-specific automation features.`
    );
    recommendations.push(
      `Action: Open ${manufacturerApp} app FIRST → Check for automations, schedules, or scenes controlling "${context.device.label}".`
    );
    recommendations.push(
      `Evidence: SmartThings detected ${issue.description} but manufacturer app automations are NOT visible via SmartThings API.`
    );

    if (issue.confidence >= 0.95) {
      recommendations.push(
        `High confidence (${(issue.confidence * 100).toFixed(0)}%): Manufacturer app automation is LIKELY cause.`
      );
    }
  }
}
```

### 8.3 API Limitation Reporting

**NEW CODE:**
```typescript
// Report API limitations explicitly
if (hasAutomationPattern && !context.identifiedAutomations?.length) {
  recommendations.push(
    `⚠️ API Limitation: SmartThings API cannot identify specific automation.`
  );
  recommendations.push(
    `Observable Evidence: ${issue.description}`
  );
  recommendations.push(
    `Manual Investigation Required:`
  );
  recommendations.push(
    `  1. SmartThings app → Automations → Search for "${context.device.label}"`
  );
  recommendations.push(
    `  2. Look for: Device as ACTION target (not trigger)`
  );
  recommendations.push(
    `  3. Check: "When [condition], turn ${context.device.label} ON" logic`
  );

  if (context.device?.manufacturer) {
    recommendations.push(
      `  4. ${getManufacturerApp(manufacturer)} app → Check manufacturer-specific automations`
    );
  }
}
```

---

## 9. Success Metrics

**How to validate fix:**

1. **Re-test Sengled Alcove Bar case:**
   - ✅ Manufacturer app recommendation appears FIRST
   - ✅ NO motion sensor recommendation (no motion sensor evidence)
   - ✅ NO scene recommendation (no scene evidence)
   - ✅ ALL recommendations include observable evidence

2. **Test with motion sensor evidence:**
   - ✅ Motion sensor recommendation ONLY if `identifiedAutomations` includes motion sensor
   - ✅ Specific motion sensor device name included
   - ✅ Observable evidence: "Motion sensor [NAME] triggered at [TIME]"

3. **Test with NO automation identification:**
   - ✅ Generic SmartThings recommendation includes step-by-step search
   - ✅ API limitation explicitly noted
   - ✅ Manufacturer app check included (if manufacturer detected)

---

## 10. Related Tickets

**Dependencies:**
- None (self-contained fix)

**Follow-up Tickets:**
- Create ticket: "Add motion sensor activity evidence collection" (optional enhancement)
- Create ticket: "Parse automation schedule details from API" (optional enhancement)
- Create ticket: "Document SmartThings API limitations" (documentation)

---

## Appendix A: Full File Analysis

### DiagnosticWorkflow.ts Structure

**File:** `/Users/masa/Projects/mcp-smartthings/src/services/DiagnosticWorkflow.ts`
**Total Lines:** 1218
**Key Functions:**

| Function | Lines | Purpose | Speculation Risk |
|----------|-------|---------|------------------|
| `executeDiagnosticWorkflow()` | 257-301 | Main workflow orchestration | ⚪ None |
| `buildDataGatheringPlan()` | 315-358 | Determine evidence to collect | ⚪ None |
| `generateRecommendations()` | 596-674 | **Generate user recommendations** | 🔴 **HIGH** |
| `formatRichContext()` | 445-557 | Format evidence for LLM | ⚪ None |
| `detectRapidChanges()` | 935-980 | Evidence: Detect rapid state changes | ⚪ None |
| `detectAutomationTriggers()` | 995-1041 | Evidence: Detect automation patterns | ⚪ None |
| `detectConnectivityIssues()` | 1056-1080 | Evidence: Detect connectivity gaps | ⚪ None |

**Conclusion:** Speculation is ISOLATED to `generateRecommendations()` function (lines 596-674).

---

## Appendix B: Test Coverage Analysis

**Test Files:**
- `DiagnosticWorkflow.test.ts` (557 lines)
- `DiagnosticWorkflow.patterns.test.ts` (724 lines)
- `DiagnosticWorkflow.integration.test.ts` (exists, not analyzed)

**Test Coverage for Recommendations:**
- ✅ Offline device recommendations (test line 426-465)
- ✅ Low battery recommendations (test line 467-503)
- ✅ Rapid changes recommendations (test line 606-657)
- ❌ **NO TEST** for motion sensor speculation
- ❌ **NO TEST** for scene/routine speculation
- ❌ **NO TEST** for manufacturer app prioritization

**Recommended New Tests:**
```typescript
describe('Evidence-Based Recommendations', () => {
  it('should NOT recommend motion sensor check without motion sensor evidence', async () => {
    // Given: Similar devices have motion sensors
    // And: NO motion sensor in identifiedAutomations
    // Then: NO motion sensor recommendation
  });

  it('should recommend manufacturer app FIRST for proprietary manufacturers', async () => {
    // Given: Device manufacturer is "Sengled"
    // And: Automation pattern detected
    // Then: Sengled Home app recommendation appears FIRST
  });

  it('should include observable evidence in all recommendations', async () => {
    // Given: Automation pattern detected
    // Then: Every recommendation starts with "Evidence:" or "Observable:"
  });
});
```

---

## Conclusion

The diagnostic system speculation issue is **well-scoped and fixable**. All speculation originates from the `generateRecommendations()` function (lines 596-674) and can be eliminated through:

1. **Evidence validation:** Only recommend actions supported by collected evidence
2. **Manufacturer prioritization:** Check manufacturer apps FIRST for proprietary devices
3. **API limitation reporting:** Explicitly note when SmartThings API cannot provide evidence
4. **Template-based recommendations:** Use evidence → observation → action structure

**Estimated Fix Effort:** 4-6 hours (including tests)
**Risk Level:** LOW (isolated to single function)
**Impact:** HIGH (eliminates user confusion from speculative recommendations)
