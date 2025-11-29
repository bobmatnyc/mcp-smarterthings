# MCP SmarterThings - Work Plan & Roadmap

**Generated**: 2025-11-28
**Project**: [MCP Smarterthings](https://linear.app/1m-hyperdev/project/mcp-smarterthings-89098cb0dd3c/issues)
**Status**: Based on codebase analysis and Linear project review

---

## 📊 Executive Summary

- **Total Open Tickets**: 52 (50 open + 2 in-progress)
- **Critical Priority**: 12 tickets
- **High Priority**: 3 tickets
- **Active Work Streams**: 4 major initiatives
- **Codebase Health**: 95.9% test pass rate (988/1028 tests)
- **Ready for Transition**: 2 tickets can be marked DONE

---

## 🚨 IMMEDIATE ACTIONS REQUIRED

### Ticket Transitions (Do First)

**1. Verify and Confirm DONE Status**
- ✅ 1M-276-279: Semantic indexing Phase 1 (ALREADY MARKED DONE - VERIFIED ✅)
- ✅ 1M-225: Device registry (ALREADY MARKED DONE - VERIFIED ✅)
- ✅ 1M-224: Unified device model (ALREADY MARKED DONE - VERIFIED ✅)

**2. Mark as DONE (Implementation Complete)**
- **1M-342**: Layer 2 Unified Device Abstraction (Base Architecture)
  - **Reason**: IDeviceAdapter interface complete, SmartThingsAdapter operational (158 tests passing)
  - **Action**: Mark base architecture DONE, create NEW tickets for Tuya/Lutron adapters
  - **Priority**: CRITICAL → Split into:
    - ✅ Base abstraction layer (DONE)
    - NEW: Add Tuya adapter implementation
    - NEW: Add Lutron adapter implementation

**3. Clarification Needed (URGENT)**
- **1M-325**: Sonnet 4.5 Integration
  - **Issue**: Ticket scope mentions "EDGAR platform" (Python code generation)
  - **Finding**: No EDGAR codebase found in this repository
  - **Existing**: TypeScript LlmService uses claude-sonnet-4.5 via OpenRouter (COMPLETE)
  - **Question**: Is EDGAR a separate repository? Should TypeScript integration be marked DONE?
  - **Recommendation**: Either:
    - A) Mark DONE if referring to TypeScript integration
    - B) Clarify EDGAR platform location/scope
    - C) Split into: TypeScript integration (DONE) + EDGAR platform (separate ticket)

---

## 🎯 ACTIVE WORK STREAMS (Priority Order)

### Stream 1: Weather API Code Generation Platform (CRITICAL)

**Epic**: 1M-318 - Phase 1: MVP - Weather API Proof-of-Concept
**Status**: In Progress (1M-325 critical blocker)
**Timeline**: 2-3 weeks for MVP

**Current Blocker**: 1M-325 scope confusion (see above)

**Sequential Workflow** (After 1M-325 resolved):

```
Phase 1A: Foundation (Week 1)
├─ 1M-323: Design project.yaml schema [CRITICAL] → 2 days
├─ 1M-326: Create weather API template → 1 day
└─ 1M-324: Build example parser [CRITICAL] → 3 days

Phase 1B: Code Generation Engine (Week 2)
├─ 1M-331: Implement IDataSource interface [CRITICAL] → 2 days
├─ 1M-332: Implement IDataExtractor interface [CRITICAL] → 2 days
├─ 1M-327: Build constraint enforcer (AST validation) [CRITICAL] → 3 days

Phase 1C: Integration & Testing (Week 3)
├─ 1M-328: Generate weather API extractor (end-to-end test) [CRITICAL] → 2 days
├─ 1M-343: Create weather data extraction project using platform → 3 days
└─ 1M-344: Implement terminal UI using Textual framework → 2 days
```

**Deliverables**:
- ✅ Working weather API data extractor
- ✅ Terminal UI for project management
- ✅ Validation framework with AST checks
- ✅ Proof-of-concept for code generation platform

**Dependencies**:
- 1M-325 resolution (BLOCKING)
- Research documents in `/docs/research/1m-325-*.md` (AVAILABLE)

**Success Criteria**:
- Generate Python code from weather API examples
- Pass AST validation checks
- Execute generated code successfully
- Document go/no-go decision for platform expansion

---

### Stream 2: Semantic Device Indexing & AI Diagnostics (HIGH PRIORITY)

**Epic**: 1M-275 - Semantic Device Indexing and Enhanced AI Diagnostics
**Status**: In Progress (Phase 1 COMPLETE, Phase 2-5 remaining)
**Timeline**: 5 weeks remaining (out of 7 total)

**Progress**: 4/27 subtasks complete (Phase 1 ✅)

**Current Phase**: Phase 2 - Enhanced Prompt Patterns

```
Phase 2: Enhanced Prompt Patterns (Week 2-3) [CURRENT]
├─ 1M-281: Implement LLM-based IntentClassifier → 3 days
├─ 1M-282: Create DiagnosticWorkflow orchestrator → 2 days
│          (NOTE: Basic implementation EXISTS, needs enhancement)
├─ 1M-283: Integrate with ChatOrchestrator → 2 days
├─ 1M-284: Write 30+ tests for intent classification → 2 days
└─ 1M-285: Document intent patterns and workflows → 1 day

Phase 3: Integrated Diagnostics (Week 4)
├─ 1M-286: Implement PatternDetector service → 2 days
│          (NOTE: Basic implementation EXISTS, needs formalization)
├─ 1M-287: Build get_system_status MCP tool → 2 days
├─ 1M-288: Integrate health checks into DiagnosticWorkflow → 2 days
├─ 1M-289: Write 25+ tests for diagnostics → 2 days
└─ 1M-290: Document diagnostic methodology → 1 day

Phase 4: Discovery Features (Week 5)
├─ 1M-291: Build find_similar_devices MCP tool → 2 days
├─ 1M-292: Build find_related_issues MCP tool → 2 days
├─ 1M-293: Build discover_automations MCP tool → 2 days
│          (NOTE: Automation indexing EXISTS in AutomationService)
├─ 1M-294: Implement network topology analysis → 3 days
├─ 1M-295: Write 30+ tests for discovery features → 2 days
└─ 1M-296: Document discovery API and use cases → 1 day

Phase 5: Polish and Documentation (Week 6-7)
├─ 1M-297: Performance optimization for 500+ devices → 2 days
├─ 1M-298: Implement graceful degradation → 2 days
├─ 1M-299: Add comprehensive error handling → 2 days
├─ 1M-300: Load testing and benchmarking → 2 days
├─ 1M-301: Create comprehensive user documentation → 2 days
└─ 1M-302: Record demo video and create examples → 1 day
```

**Completed Work** (Can accelerate timeline):
- ✅ SemanticIndex service with ChromaDB (1M-276)
- ✅ Device metadata indexing (1M-277)
- ✅ semantic_search_devices MCP tool (1M-278)
- ✅ 20+ tests for semantic search (1M-279)
- ✅ Basic DiagnosticWorkflow (1M-282 partially done)
- ✅ Basic PatternDetector (1M-286 partially done)
- ✅ AutomationService with rule indexing (1M-293 foundation)

**Performance Targets**:
- Intent classification: <200ms
- Device semantic search: <100ms ✅ (ACHIEVED)
- Diagnostic workflow: <500ms
- Full troubleshooting response: <2 seconds

**Dependencies**:
- ✅ ChromaDB integration (via mcp-vector-search MCP server)
- ⚠️ OpenRouter API key for LLM intent classification (NEEDED)
- ✅ SmartThings API operational

---

### Stream 3: SmarterScript Sandboxed Automation Engine (NEW INITIATIVE)

**Epic**: 1M-349 - SmarterScript: Sandboxed Home Automation Engine
**Status**: Not Started (5 POC tasks open)
**Timeline**: 3-4 weeks for POCs + full implementation

**Priority**: DEFERRED (after Stream 1 & 2 complete)

```
POC Phase (Week 1-2)
├─ 1M-350: POC: isolated-vm sandbox foundation → 3 days
├─ 1M-351: POC: XState v5 with custom clock for sandbox timers → 2 days
├─ 1M-352: POC: Sun events and timezone-aware scheduling → 2 days
├─ 1M-353: Implement event bus and device event bridging → 3 days
└─ 1M-354: POC: Full integration - Sandbox + XState + Events → 3 days

Implementation Phase (Week 3-4)
└─ Architecture and production implementation (TBD based on POC results)
```

**Goals**:
- Safe execution of user automation scripts
- State machine orchestration with XState v5
- Event-driven architecture with device integration
- Timezone-aware scheduling with sun events

**Risk**: Medium complexity, depends on POC validation

---

### Stream 4: Platform Integrations (DEFERRED)

**Status**: Foundation exists, specific platforms NOT implemented
**Timeline**: 2 weeks per platform adapter

**Open Tickets**:
- 1M-341: Add Tuya Platform Support [HIGH PRIORITY]
- 1M-340: Add Lutron Caseta Platform Support
- 1M-339: Add Jina.ai Support for Web Content Extraction

**Current State**:
- ✅ IDeviceAdapter interface complete (base abstraction)
- ✅ SmartThingsAdapter operational (158 tests passing)
- ✅ PlatformRegistry working (46 tests passing)
- ❌ TuyaAdapter: NOT IMPLEMENTED
- ❌ LutronAdapter: NOT IMPLEMENTED
- ❌ Jina.ai integration: NOT IMPLEMENTED

**Recommended Sequence** (After Stream 1-2):
```
1. Tuya Platform (1M-341) - 2 weeks
   ├─ Research Tuya local control API
   ├─ Implement TuyaAdapter (follow SmartThingsAdapter pattern)
   ├─ Add capability mapping to unified model
   ├─ Write 100+ tests for adapter
   └─ Document Tuya setup and limitations

2. Lutron Caseta (1M-340) - 2 weeks
   ├─ Research Lutron Caseta API (local vs. cloud)
   ├─ Implement LutronAdapter
   ├─ Add lighting capability mappings
   ├─ Write 100+ tests
   └─ Document setup

3. Jina.ai Web Extraction (1M-339) - 1 week
   ├─ Integrate Jina.ai API for web content
   ├─ Add to data extraction pipeline
   └─ Test with weather API use case
```

---

## 🔄 PHASE-BASED WORKFLOW (Other Initiatives)

### Weather API Platform Phases (Post-MVP)

**Phase 2: Core Platform Architecture** (1M-319)
- **Timeline**: 3 weeks (after Phase 1 MVP complete)
- **Prerequisites**: MVP success validation (1M-329 closed - decision made)

```
Week 1-2: Infrastructure
├─ 1M-333: Build project manager service [CRITICAL]
├─ 1M-334: Create project isolation system
├─ 1M-336: Build per-project DI container
└─ 1M-335: Implement YAML configuration parser

Week 3: Validation & Templates
├─ 1M-338: Build generic validation framework
├─ 1M-337: Create template engine for code generation
└─ 1M-330: Design generic abstraction layer interfaces [CRITICAL]
```

**Phase 3: Polish & Testing** (1M-320)
- Timeline: 1 week
- Load testing, error handling, documentation

**Phase 4: EDGAR Migration** (1M-321)
- Timeline: 2 weeks
- Migrate EDGAR financial data extraction to new platform

**Phase 5: Community Launch** (1M-322)
- Timeline: 1 week
- Public documentation, examples, community setup

---

## 📋 RECOMMENDED WORK SEQUENCE (Next 8 Weeks)

### Week 1-2: URGENT CLARIFICATIONS & FOUNDATION
**Focus**: Resolve blockers, confirm ticket states

```
Priority 1: Administrative (Days 1-2)
├─ Clarify 1M-325 scope (EDGAR platform vs. TypeScript)
├─ Transition 1M-342 to DONE (base architecture)
├─ Create new tickets for Tuya/Lutron adapters
└─ Verify DONE tickets: 1M-276-279, 1M-225, 1M-224

Priority 2: Weather API MVP Foundation (Days 3-10)
├─ 1M-323: Design project.yaml schema [2 days]
├─ 1M-326: Create weather API template [1 day]
├─ 1M-324: Build example parser [3 days]
├─ 1M-331: Implement IDataSource interface [2 days]
└─ 1M-332: Implement IDataExtractor interface [2 days]
```

### Week 3: WEATHER API MVP COMPLETION
```
├─ 1M-327: Build constraint enforcer (AST validation) [3 days]
├─ 1M-328: Generate weather API extractor (end-to-end) [2 days]
├─ 1M-343: Create weather data extraction project [2 days]
└─ 1M-344: Implement terminal UI (Textual) [2 days - parallel]
```

**Deliverable**: Working weather API code generation POC

### Week 4-5: SEMANTIC INDEXING PHASE 2-3
```
Phase 2: Enhanced Prompt Patterns
├─ 1M-281: LLM-based IntentClassifier [3 days]
├─ 1M-282: Enhance DiagnosticWorkflow [2 days]
├─ 1M-283: ChatOrchestrator integration [2 days]
└─ 1M-284-285: Tests & Documentation [3 days]

Phase 3: Integrated Diagnostics (overlap)
├─ 1M-286: Formalize PatternDetector [2 days]
├─ 1M-287: get_system_status MCP tool [2 days]
└─ 1M-288: Health check integration [2 days]
```

**Deliverable**: Production-ready AI diagnostics system

### Week 6: SEMANTIC INDEXING PHASE 4 (DISCOVERY)
```
├─ 1M-291: find_similar_devices MCP tool [2 days]
├─ 1M-292: find_related_issues MCP tool [2 days]
├─ 1M-293: discover_automations MCP tool [2 days]
└─ 1M-294: Network topology analysis [3 days - parallel]
```

### Week 7-8: POLISH, TESTING, DOCUMENTATION
```
Semantic Indexing Phase 5
├─ 1M-297-300: Performance, degradation, testing [4 days]
└─ 1M-301-302: Documentation & demo [3 days]

Weather API Platform Phase 2 (Start)
├─ 1M-333: Project manager service [3 days]
├─ 1M-334: Project isolation [2 days]
└─ Planning for Phase 3-5
```

---

## 🎯 SUCCESS METRICS & MILESTONES

### Milestone 1: Weather API MVP (Week 3)
- ✅ Project.yaml schema defined
- ✅ Example parser extracts patterns
- ✅ Code generation produces valid Python
- ✅ AST validation enforces constraints
- ✅ Terminal UI for project management
- ✅ Go/no-go decision documented

### Milestone 2: Semantic Diagnostics Production (Week 6)
- ✅ Intent classification <200ms
- ✅ 90%+ accuracy on common queries
- ✅ Pattern detection operational
- ✅ Discovery features deployed
- ✅ 100+ tests passing
- ✅ User documentation complete

### Milestone 3: Platform Architecture (Week 8)
- ✅ Generic abstraction layer interfaces
- ✅ Project isolation system
- ✅ Validation framework operational
- ✅ Template engine working
- ✅ Ready for EDGAR migration

---

## 🚧 DEFERRED / BACKLOG

**Lower Priority** (After Week 8):
- SmarterScript POCs (1M-350-354)
- Tuya platform integration (1M-341)
- Lutron platform integration (1M-340)
- Jina.ai integration (1M-339)
- Weather API Phase 3-5 (1M-320-322)

**Requires Investigation**:
- 1M-163: Prompt/Instruction Reinforcement
- 1M-306-312: Various enhancements (grid view, historical patterns, etc.)

---

## 📊 TICKET STATISTICS & HEALTH

**Completed Work** (Recent):
- 50 tickets marked DONE
- 95.9% test pass rate
- Production-ready semantic indexing
- Operational device registry
- SmartThings adapter fully tested

**Active Development**:
- 2 tickets in-progress (both critical/high priority)
- 50 tickets open
- 12 critical priority items
- Clear sequential dependencies

**Codebase Health**:
- ~15,000+ lines of TypeScript
- 988 passing tests (out of 1,028)
- 32 test suites operational
- Comprehensive research documentation

---

## 🔗 KEY RESOURCES

**Documentation**:
- Research Analysis: `/docs/research/codebase-ticket-alignment-analysis-2025-11-28.md`
- Sonnet 4.5 Scope: `/docs/research/1m-325-scope-validation-and-project-location.md`
- Sonnet 4.5 Requirements: `/docs/research/1m-325-sonnet45-integration-requirements.md`
- Semantic Indexing Guide: `/docs/research/semantic-indexing-enhanced-troubleshooting-2025-11-27.md`

**Linear Project**:
- Main Project: https://linear.app/1m-hyperdev/project/mcp-smarterthings-89098cb0dd3c/issues
- Project ID: `4bfcd979-73bb-4098-8d09-2e2e1b9fc69c`

**Codebase Entry Points**:
- Semantic Index: `src/services/SemanticIndex.ts`
- Device Registry: `src/abstract/DeviceRegistry.ts`
- Unified Model: `src/types/unified-device.ts`
- SmartThings Adapter: `src/adapters/smartthings/`
- MCP Tools: `src/mcp/tools/`

---

## ⚠️ RISKS & DEPENDENCIES

**High Risk**:
- 1M-325 scope confusion blocks Weather API MVP (CRITICAL)
- OpenRouter API key needed for LLM intent classification
- EDGAR platform location/scope unclear

**Medium Risk**:
- SmarterScript POCs may reveal technical limitations
- Platform integrations (Tuya/Lutron) depend on API availability
- Timeline assumes no major blockers

**Mitigations**:
- Resolve 1M-325 scope ASAP (within 48 hours)
- Parallel work streams where possible
- Leverage existing implementations to accelerate

---

**Next Actions**:
1. ✅ Clarify 1M-325 scope with stakeholders
2. ✅ Transition 1M-342 to DONE (split Tuya/Lutron)
3. ✅ Begin Weather API MVP foundation (1M-323-324)
4. ✅ Obtain OpenRouter API key for LLM features

**Work Plan Generated**: 2025-11-28
**Valid Until**: 2025-12-31 (requires quarterly review)
