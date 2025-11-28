# Tickets to Create

## 1M-308 Test Results - API Limitation Discovered

### Issue: SmartThings API Cannot Identify Automation Internals

**Status**: BLOCKED by SmartThings API limitations

**Test Results** (2025-11-28):
- ✅ Pattern detection: Working (95% confidence automation trigger detected)
- ✅ AutomationService implementation: Complete and working
- ❌ Automation identification: BLOCKED by API limitations

**API Limitations Discovered**:

1. **Rules API** (`client.rules.list()`):
   - Returns 0 automations for this location
   - Only exposes automations created via new SmartThings Rules API
   - Classic app automations NOT included

2. **Scenes API** (`client.scenes.list()` + `client.scenes.get()`):
   - Returns 19 scenes
   - **Does NOT expose which devices each scene controls**
   - Only returns metadata (name, ID, location, last executed)
   - Actions are "black box" - can execute but not inspect

**Root Cause**: SmartThings proprietary automation system (used by mobile app) is NOT exposed via public API

**Real-World Test**:
- Device: Alcove Bar (ID: ae92f481-1425-4436-b332-de44ff915565)
- Pattern detected: 95% confidence automation trigger
- Specific automation: **CANNOT BE IDENTIFIED VIA API**

**Recommendations**:

### Option 1: Accept Limitation - Provide Generic Guidance (CURRENT APPROACH)
```
Recommendation: "Automation pattern detected (95% confidence) but unable to
identify specific automation. Check SmartThings app → Automations for rules
affecting this device. Look for 'when device turns off, turn back on' logic."
```

**Pros**: Works now, requires no API changes
**Cons**: User still has to search manually (defeats purpose of BUG-1M-308)

### Option 2: Request SmartThings API Enhancement
**File feature request** with SmartThings to expose automation device mappings

**Request**: Add device IDs to Rules/Scenes API responses

**Timeline**: 6-12 months (if accepted)

### Option 3: Reverse Engineer SmartThings Mobile App API
**RISK**: Violates ToS, unstable, could break at any time

**NOT RECOMMENDED**

### Option 4: Hybrid Approach - LLM-Assisted Search
**Use diagnostic chatbot to**:
1. Detect automation pattern (95% confidence)
2. Fetch all scenes via API (scene names only)
3. Use LLM to suggest likely scenes based on:
   - Scene name keywords ("Evening", "Night", "Lamps", "Lights")
   - Device name ("Alcove Bar")
   - Time of occurrence (evening hours)
   - User history (which scenes executed recently)

**Example**:
```
System: "Automation pattern detected for Alcove Bar. Based on scene names
and timing, likely culprits:
1. 'Evening Lamps On' (executed at 7:45 PM - matches issue timing)
2. 'Lights on' (generic, executed recently)
3. 'Welcome Home Lights' (motion-triggered, executed frequently)

Recommendation: Check these scenes first in SmartThings app."
```

**Pros**: Narrows search from 19 scenes to 2-3 likely candidates
**Cons**: Still requires manual verification in app

---

## Recommended Next Actions

1. **Accept current limitation** - Document in 1M-308
2. **Implement Option 4** - LLM-assisted narrowing (add to 1M-308 scope)
3. **File SmartThings feature request** - Background task, low priority
4. **Update documentation** - Explain API limitations in troubleshooting guide

---

## Technical Details for 1M-308

**Code implemented**:
- ✅ AutomationService (443 lines) - Working
- ✅ DiagnosticWorkflow integration (200 lines) - Working
- ✅ Pattern detection - Working (95% confidence)

**API calls tested**:
- ✅ `client.rules.list()` - Returns 0 (new API not used)
- ✅ `client.scenes.list()` - Returns 19 scenes
- ✅ `client.scenes.get()` - Returns metadata only (no device mappings)

**Conclusion**: Implementation is complete and working. API limitation prevents
full automation identification. Recommend hybrid approach (Option 4) as best
available solution.

---

## NEW TICKET: Evidence-Only Reporting Requirement

**Title**: Diagnostic System Must Only Report Observable Evidence (No Speculation)

**Priority**: CRITICAL

**Problem**: System currently generates speculation-based recommendations without evidence

**Example Violations**:
```
❌ "Check for motion sensor triggers" - System has NO evidence of motion sensor
❌ "Review scenes with 'restore state' logic" - System cannot see scene internals
❌ "Look for time-based routines at sunset" - Pure speculation
```

**Required Behavior**:
```
✅ "Observed: Light turned ON at 12:34:10 AM (no prior SmartThings command detected)"
✅ "Pattern: 2 rapid re-triggers within 8 seconds (95% confidence automation)"
✅ "Limitation: SmartThings API does not expose which automation controls this device"
✅ "Next step: Check Sengled device firmware/app (device manufacturer: Sengled)"
```

**Implementation Requirements**:

1. **Remove all speculation-based recommendations**
   - File: `src/services/DiagnosticWorkflow.ts`
   - Method: `generateRecommendations()`
   - Delete: Lines suggesting motion sensors, scenes, time-based routines WITHOUT evidence

2. **Add device manufacturer detection**
   - Report device manufacturer (e.g., "Sengled")
   - Suggest checking manufacturer's app/firmware BEFORE SmartThings automations

3. **Strengthen evidence requirements**
   - Only recommend checking motion sensors IF motion sensor found in location
   - Only suggest specific scenes IF scene names match timing/device
   - Only mention time-based routines IF activation times match pattern

4. **Add explicit limitation reporting**
   ```
   "API Limitation: Cannot identify which automation controls this device.
    SmartThings API does not expose automation device mappings."
   ```

5. **Update PM instructions**
   - Add to PM_INSTRUCTIONS.md: "NEVER generate recommendations without evidence"
   - Add validation: "If recommending X, must cite evidence for X"

**Test Case** (Alcove Bar):
- Device: Sengled Master Alcove Bar
- Events: ON at 12:34 AM, 4:58 AM, 6:37 AM
- Evidence: Rapid re-triggers (95% automation confidence)
- NO evidence of: Motion sensor, specific scene, time pattern

**Expected Output**:
```
Findings:
- Light activated at 12:34:10 AM, 4:58:33 AM, 6:37:59 AM
- Pattern: 2 rapid re-triggers detected (3-8 second gaps)
- Confidence: 95% automation-triggered
- Device manufacturer: Sengled

Limitations:
- SmartThings API cannot identify which automation controls this device
- No motion sensor detected in location
- Scene internals not accessible via API

Recommendations:
1. Check Sengled app/firmware for schedules or automation features
2. Review SmartThings app → Automations manually (API cannot filter by device)
3. Disable all automations temporarily to isolate cause

Evidence-based conclusion: Automation is triggering the light, but source
cannot be determined via API. Manual investigation required.
```

**Acceptance Criteria**:
- [ ] No recommendations generated without corresponding evidence
- [ ] Device manufacturer reported when known
- [ ] API limitations explicitly stated
- [ ] Speculation words removed ("likely", "possibly", "may be")
- [ ] All recommendations cite specific evidence

---

## NEW TICKET: Move Project-Level Documentation Files

**Title**: Organize project-level markdown files into docs/ directory

**Priority**: HIGH (Project organization standard)

**Problem**: Documentation files at project root violate project organization standards

**Files Relocated** (COMPLETED):
```
✓ docs/testing/AUTOMATION-IDENTIFICATION-TEST-REPORT.md
✓ docs/summaries/AUTOMATION-INTEGRATION-SUMMARY.md
✓ docs/planning/TICKETS-TO-CREATE.md (this file)
```

**Files Kept at Root** (Project essentials):
```
README.md (main project description)
CHANGELOG.md (version history)
CONTRIBUTING.md (contribution guidelines)
QUICKSTART.md (getting started guide)
```

**Implementation Steps**:
1. Create directories if needed:
   - `docs/testing/` (if doesn't exist)
   - `docs/planning/` (if doesn't exist)
2. Move files to new locations
3. Update any references in other files
4. Commit changes with message: "docs: organize project documentation files"

**Acceptance Criteria**:
- [ ] No non-essential markdown files at project root (only README, CHANGELOG, CONTRIBUTING, QUICKSTART)
- [ ] All test reports in `docs/testing/`
- [ ] All summaries in `docs/summaries/`
- [ ] All planning docs in `docs/planning/`
- [ ] Git history preserved (use `git mv` not delete+create)

**Standard**: Only these files allowed at project root:
- README.md
- CHANGELOG.md
- CONTRIBUTING.md
- LICENSE (if present)
- QUICKSTART.md (or similar getting started guide)
- Configuration files (.gitignore, package.json, tsconfig.json, etc.)
