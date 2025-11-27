# SmartThingsService Split Analysis

**Research Date:** 2025-11-26
**Ticket:** 1M-249 - Split into DeviceService, LocationService, SceneService
**Researcher:** Claude Code Research Agent
**Status:** Complete

## Executive Summary

This research analyzes the current `SmartThingsService` architecture and provides a comprehensive roadmap for splitting it into three focused services: `DeviceService`, `LocationService`, and `SceneService`. The refactoring will improve maintainability, enable platform-agnostic operations through `PlatformRegistry` integration, and provide clear separation of concerns.

**Key Findings:**
- ✅ Service interfaces already defined in `src/services/interfaces.ts`
- ✅ `SmartThingsService` currently implements all three interfaces (monolithic)
- ✅ 7 MCP tool files directly import and use `smartThingsService` singleton
- ✅ `PlatformRegistry` provides platform abstraction layer (Layer 2)
- ✅ Clear method boundaries identified for each service
- ⚠️ Shared concerns: SmartThings SDK client, retry logic, diagnostic tracking
- 📋 Migration can be done in phases with minimal breaking changes

---

## 1. Current Architecture Analysis

### 1.1 SmartThingsService Implementation

**Location:** `src/smartthings/client.ts` (lines 44-459)

**Current Structure:**
```typescript
export class SmartThingsService implements ISmartThingsService {
  private client: SmartThingsClient;

  constructor() {
    this.client = new SmartThingsClient(
      new BearerTokenAuthenticator(environment.SMARTTHINGS_PAT)
    );
  }

  // 15 methods total across 3 domains
}

// Singleton export
export const smartThingsService = new SmartThingsService();
```

**Responsibilities:**
1. **Device Operations (5 methods):** Device discovery, status queries, command execution, capability management
2. **Location/Room Operations (3 methods):** Location listing, room management, room-based device queries
3. **Scene Operations (3 methods):** Scene listing, execution, name-based search
4. **Cross-cutting Concerns:** Retry logic, error handling, diagnostic tracking, logging

**Dependencies:**
- `@smartthings/core-sdk` - SmartThings API client
- `../config/environment.js` - Configuration management
- `../utils/logger.js` - Logging utility
- `../utils/retry.js` - Retry with exponential backoff
- `../utils/diagnostic-tracker.js` - Command execution tracking
- `../services/interfaces.js` - Service interface definitions
- `../types/smartthings.js` - Type definitions

### 1.2 Method-to-Service Mapping

#### DeviceService Methods (5 methods)

| Method | Lines | Responsibility | Dependencies |
|--------|-------|---------------|--------------|
| `listDevices(roomId?)` | 60-102 | List devices with optional room filter, enrich with room names | client.devices.list(), client.rooms.get(), retryWithBackoff |
| `getDeviceStatus(deviceId)` | 111-120 | Get device capability states | client.devices.getStatus(), retryWithBackoff |
| `executeCommand(deviceId, capability, command, args?)` | 131-200 | Execute device command with diagnostic tracking | client.devices.executeCommand(), diagnosticTracker, retryWithBackoff |
| `getDevice(deviceId)` | 209-229 | Get device details | client.devices.get(), retryWithBackoff |
| `getDeviceCapabilities(deviceId)` | 238-246 | Extract device capabilities | Delegates to getDevice() |

**Complexity Notes:**
- `listDevices()` fetches room names (N+1 query pattern) - optimization opportunity
- `executeCommand()` has diagnostic tracking side effects
- All methods use retry logic for resilience

#### LocationService Methods (3 methods)

| Method | Lines | Responsibility | Dependencies |
|--------|-------|---------------|--------------|
| `listLocations()` | 254-268 | List all accessible locations | client.locations.list(), retryWithBackoff |
| `listRooms(locationId?)` | 277-319 | List rooms with device counts | client.rooms.list(), listDevices(), retryWithBackoff |
| `findRoomByName(roomName)` | 328-363 | Find room by exact/partial match | Delegates to listRooms() |

**Complexity Notes:**
- `listRooms()` without locationId fetches ALL locations then iterates (O(n*m))
- `listRooms()` enriches with device counts (requires full device list fetch)
- Room name search supports case-insensitive partial matching

#### SceneService Methods (3 methods)

| Method | Lines | Responsibility | Dependencies |
|--------|-------|---------------|--------------|
| `listScenes(locationId?)` | 372-396 | List scenes with optional location filter | client.scenes.list(), retryWithBackoff |
| `executeScene(sceneId)` | 404-412 | Execute scene by ID | client.scenes.execute(), retryWithBackoff |
| `findSceneByName(sceneName)` | 421-458 | Find scene by exact/partial match | Delegates to listScenes() |

**Complexity Notes:**
- Scene operations are simpler than device/location operations
- No cross-domain dependencies (scenes don't need device/room enrichment)

### 1.3 Service Interface Definitions

**Location:** `src/services/interfaces.ts`

**Status:** ✅ Already defined with comprehensive documentation

```typescript
// Device operations interface
export interface IDeviceService {
  listDevices(roomId?: RoomId): Promise<DeviceInfo[]>;
  getDeviceStatus(deviceId: DeviceId): Promise<DeviceStatus>;
  executeCommand(deviceId: DeviceId, capability: string, command: string, args?: unknown[]): Promise<void>;
  getDevice(deviceId: DeviceId): Promise<DeviceInfo>;
  getDeviceCapabilities(deviceId: DeviceId): Promise<string[]>;
}

// Location/room operations interface
export interface ILocationService {
  listLocations(): Promise<LocationInfo[]>;
  listRooms(locationId?: LocationId): Promise<RoomInfo[]>;
  findRoomByName(roomName: string): Promise<RoomInfo>;
}

// Scene operations interface
export interface ISceneService {
  listScenes(locationId?: LocationId): Promise<SceneInfo[]>;
  executeScene(sceneId: SceneId): Promise<void>;
  findSceneByName(sceneName: string): Promise<SceneInfo>;
}

// Combined interface for backward compatibility
export interface ISmartThingsService extends IDeviceService, ILocationService, ISceneService {}
```

**Observations:**
- Interfaces are well-documented with complexity analysis
- Performance characteristics documented (Time/Space complexity)
- Error handling expectations defined
- Ready for implementation extraction

---

## 2. MCP Tool Dependencies Analysis

### 2.1 Direct SmartThingsService Usage

**7 MCP tool files** import `smartThingsService` singleton:

| File | Tools | Service Methods Used | Service Type |
|------|-------|---------------------|--------------|
| `device-control.ts` | 3 tools | `getDevice()`, `getDeviceStatus()` | **Device** |
| `device-query.ts` | 4 tools | `findRoomByName()`, `listDevices()`, `listRooms()`, `getDevice()`, `getDeviceCapabilities()` | **Device + Location** |
| `scenes.ts` | 3 tools | `findRoomByName()`, `listScenes()`, `executeScene()`, `findSceneByName()` | **Scene + Location** |
| `management.ts` | 5 tools | `listLocations()`, `findRoomByName()`, `listDevices()`, `getDevice()`, `client.*` (direct SDK access) | **All + Direct SDK** |
| `diagnostics.ts` | 1 tool | `listLocations()` | **Location** |
| `system.ts` | N/A | Unknown (not analyzed) | Unknown |
| `index.ts` | N/A | Tool export aggregator | None |

### 2.2 Tool-to-Service Mapping

#### Tools Requiring ONLY DeviceService
- `turn_on_device` (device-control.ts)
- `turn_off_device` (device-control.ts)
- `get_device_status` (device-control.ts)
- `get_device_capabilities` (device-query.ts)

#### Tools Requiring DeviceService + LocationService
- `list_devices` (device-query.ts) - uses `findRoomByName()` for filtering
- `list_devices_by_room` (device-query.ts) - uses `findRoomByName()`, `listDevices()`

#### Tools Requiring LocationService ONLY
- `list_rooms` (device-query.ts)
- `list_locations` (management.ts, diagnostics.ts)

#### Tools Requiring SceneService + LocationService
- `list_scenes` (scenes.ts) - uses `findRoomByName()` for filtering
- `list_scenes_by_room` (scenes.ts) - uses `findRoomByName()`, `listScenes()`
- `execute_scene` (scenes.ts) - uses `findSceneByName()`, `executeScene()`

#### Tools with Direct SDK Access (⚠️ Breaking Abstraction)
- `create_room` (management.ts) - calls `(smartThingsService as any).client.rooms.create()`
- `update_room` (management.ts) - calls `(smartThingsService as any).client.rooms.update()`
- `delete_room` (management.ts) - calls `(smartThingsService as any).client.rooms.delete()`
- `assign_device_to_room` (management.ts) - calls `(smartThingsService as any).client.devices.update()`

**Critical Finding:** Management tools bypass service abstraction and access SDK directly!

### 2.3 Import Pattern Analysis

**Current Pattern:**
```typescript
import { smartThingsService } from '../../smartthings/client.js';

// Usage
const devices = await smartThingsService.listDevices(roomId);
```

**Post-Split Pattern (Dependency Injection):**
```typescript
// Option 1: Import specific services
import { deviceService } from '../../services/device-service.js';
import { locationService } from '../../services/location-service.js';

// Option 2: Inject via tool handler factory
export function createDeviceControlTools(services: {
  deviceService: IDeviceService;
}) {
  return {
    turn_on_device: {
      handler: async (input) => {
        const device = await services.deviceService.getDevice(input.deviceId);
        // ...
      }
    }
  };
}
```

---

## 3. Shared Concerns & Dependencies

### 3.1 Shared Infrastructure

#### SmartThings SDK Client
**Current:** Single `SmartThingsClient` instance in `SmartThingsService`

**Issue:** All services need access to the same authenticated client

**Solutions:**
1. **Shared Client Instance** (Recommended)
   - Create `SmartThingsClientFactory` or `SmartThingsClientProvider`
   - All services receive same client instance
   - Maintains connection pooling and authentication state

2. **Client Per Service** (Not Recommended)
   - Each service creates own client
   - Multiple authentication tokens/connections
   - Higher overhead, potential rate limiting issues

**Recommendation:** Option 1 - Shared client via dependency injection

#### Retry Logic
**Current:** `retryWithBackoff()` utility used by all methods

**Status:** ✅ Already externalized in `src/utils/retry.js`

**Action:** No changes needed, all services can import and use

#### Diagnostic Tracking
**Current:** `diagnosticTracker` imported dynamically in `executeCommand()`

**Status:** ✅ Already externalized in `src/utils/diagnostic-tracker.js`

**Issue:** Only device commands are tracked, not scenes/locations

**Recommendation:**
- Keep diagnostic tracking in DeviceService
- Consider adding to SceneService.executeScene()
- LocationService doesn't need tracking (read-only operations)

#### Logging
**Current:** `logger` imported from `src/utils/logger.js`

**Status:** ✅ Already externalized

**Action:** All services import and use logger

#### Environment Configuration
**Current:** `environment.SMARTTHINGS_PAT` accessed in constructor

**Status:** ✅ Already externalized in `src/config/environment.js`

**Action:** Pass credentials to client factory, not individual services

### 3.2 Cross-Service Dependencies

#### DeviceService → LocationService
**Dependency:** `listDevices()` fetches room names via `client.rooms.get()`

**Issue:** Creating circular dependency if LocationService manages rooms

**Solutions:**
1. **Keep room enrichment in DeviceService** (Simpler)
   - DeviceService directly calls `client.rooms.get()`
   - No dependency on LocationService
   - Duplicates room access logic

2. **DeviceService depends on LocationService** (Cleaner)
   - DeviceService injects LocationService
   - Calls `locationService.getRoom(roomId)` for enrichment
   - Single source of truth for room operations
   - Not circular: Device → Location is one-way

**Recommendation:** Option 2 - DeviceService depends on LocationService

#### Tools Using Multiple Services
**Pattern:** Many tools need both Device and Location services

**Example:** `list_devices` tool with room filter
```typescript
// Current
const room = await smartThingsService.findRoomByName(roomName);
const devices = await smartThingsService.listDevices(room.roomId);

// Post-split
const room = await locationService.findRoomByName(roomName);
const devices = await deviceService.listDevices(room.roomId);
```

**Impact:** Tool handlers need multiple service injections

---

## 4. Platform Abstraction Layer (PlatformRegistry)

### 4.1 Current Implementation Status

**Location:** `src/adapters/PlatformRegistry.ts`

**Status:** ✅ Fully implemented (Layer 2 abstraction)

**Purpose:** Manage multiple platform adapters (SmartThings, Tuya, etc.) with unified interface

**Key Features:**
- Adapter lifecycle management (register, initialize, dispose)
- Device routing by universal ID (`smartthings:device-id`)
- Unified device listing across platforms
- Event propagation from adapters
- Health monitoring and graceful degradation
- Device platform caching for performance

**Adapter Interface:** `IDeviceAdapter` (src/adapters/base/IDeviceAdapter.ts)
```typescript
export interface IDeviceAdapter extends EventEmitter {
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;

  // Device operations
  listDevices(filters?: DeviceFilters): Promise<UnifiedDevice[]>;
  getDevice(deviceId: string): Promise<UnifiedDevice>;
  getDeviceState(deviceId: string): Promise<DeviceState>;
  executeCommand(deviceId: string, command: DeviceCommand, options?: CommandExecutionOptions): Promise<CommandResult>;

  // Location/Room operations
  listLocations(): Promise<Location[]>;
  listRooms(locationId?: LocationId): Promise<Room[]>;

  // Scene operations
  listScenes(filters?: SceneFilters): Promise<Scene[]>;
  executeScene(sceneId: SceneId, options?: SceneExecutionOptions): Promise<void>;

  // Health monitoring
  getHealth(): Promise<AdapterHealthStatus>;
}
```

### 4.2 Integration Strategy

**Question:** Should services use PlatformRegistry or remain SmartThings-specific?

**Options:**

#### Option A: SmartThings-Specific Services (Current Path)
```
MCP Tools
    ↓
DeviceService, LocationService, SceneService (SmartThings-specific)
    ↓
SmartThingsClient (SDK)
    ↓
SmartThings API
```

**Pros:**
- Simpler migration from current architecture
- No platform abstraction complexity
- Direct access to SmartThings-specific features

**Cons:**
- Services are platform-locked
- Can't support multi-platform in future
- Duplicate service implementations for each platform

#### Option B: Platform-Agnostic Services via Registry
```
MCP Tools
    ↓
DeviceService, LocationService, SceneService (Platform-agnostic)
    ↓
PlatformRegistry
    ↓
SmartThingsAdapter | TuyaAdapter | LutronAdapter
    ↓
Platform APIs
```

**Pros:**
- Services work across all platforms
- Single service implementation
- Future-proof for multi-platform support
- Aligns with existing PlatformRegistry architecture

**Cons:**
- More complex migration
- Need to implement SmartThingsAdapter
- Services must use UnifiedDevice types

**Recommendation:** **Option B - Platform-Agnostic Services**

**Rationale:**
- PlatformRegistry already exists and is complete
- Ticket 1M-249 explicitly mentions "platform-agnostic" requirement
- Long-term strategy supports multiple platforms
- SmartThingsAdapter can wrap existing SmartThingsService logic

---

## 5. Proposed Service Architecture

### 5.1 Service Composition Pattern

**Architecture:** Layered Service Architecture with Dependency Injection

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Tool Layer                          │
│  (device-control.ts, device-query.ts, scenes.ts, etc.)      │
└─────────────────────────────────────────────────────────────┘
                             ↓
                    (Dependency Injection)
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                  Service Layer (Layer 3)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ DeviceService│  │LocationService│  │ SceneService │     │
│  │              │  │               │  │              │     │
│  │ - listDevices│  │ - listLocations│  │ - listScenes│     │
│  │ - getDevice  │  │ - listRooms   │  │ - executeScene│    │
│  │ - execute    │  │ - findRoom    │  │ - findScene  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  ↑                  │             │
│         └──────────────────┘                  │             │
│           (DeviceService                      │             │
│            depends on                         │             │
│            LocationService)                   │             │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│            Platform Abstraction Layer (Layer 2)              │
│                    PlatformRegistry                          │
│         (Routes to appropriate platform adapter)             │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                  Adapter Layer (Layer 1)                     │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │SmartThingsAdapter│  │  TuyaAdapter    │  (Future)        │
│  │                  │  │                  │                  │
│  │ - Wraps ST SDK   │  │ - Wraps Tuya SDK │                 │
│  │ - Maps to Unified│  │ - Maps to Unified│                 │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
                             ↓
                      Platform APIs
```

### 5.2 Service Interface Definitions

#### DeviceService

```typescript
/**
 * DeviceService - Platform-agnostic device operations.
 *
 * Handles device discovery, status queries, and command execution
 * across all registered platforms via PlatformRegistry.
 */
export interface IDeviceService {
  /**
   * List all devices across all platforms.
   *
   * @param filters Optional filters (roomId, capability, platform)
   * @returns Unified device list from all platforms
   */
  listDevices(filters?: DeviceFilters): Promise<UnifiedDevice[]>;

  /**
   * Get detailed device information.
   *
   * @param deviceId Universal device ID (e.g., "smartthings:abc-123")
   * @returns Unified device details
   */
  getDevice(deviceId: UniversalDeviceId): Promise<UnifiedDevice>;

  /**
   * Get current device state.
   *
   * @param deviceId Universal device ID
   * @returns Current device state (all capabilities)
   */
  getDeviceState(deviceId: UniversalDeviceId): Promise<DeviceState>;

  /**
   * Execute command on a device.
   *
   * @param deviceId Universal device ID
   * @param command Command to execute (capability, command, args)
   * @param options Execution options (timeout, retries)
   * @returns Command execution result
   */
  executeCommand(
    deviceId: UniversalDeviceId,
    command: DeviceCommand,
    options?: CommandExecutionOptions
  ): Promise<CommandResult>;

  /**
   * Get device capabilities.
   *
   * @param deviceId Universal device ID
   * @returns Array of supported capabilities
   */
  getDeviceCapabilities(deviceId: UniversalDeviceId): Promise<DeviceCapability[]>;
}
```

#### LocationService

```typescript
/**
 * LocationService - Platform-agnostic location and room operations.
 *
 * Handles location/room listing and management across all platforms.
 */
export interface ILocationService {
  /**
   * List all locations across all platforms.
   *
   * @param platform Optional platform filter
   * @returns Unified location list
   */
  listLocations(platform?: Platform): Promise<Location[]>;

  /**
   * List all rooms across all platforms.
   *
   * @param filters Optional filters (locationId, platform)
   * @returns Unified room list
   */
  listRooms(filters?: RoomFilters): Promise<Room[]>;

  /**
   * Find room by name (case-insensitive partial match).
   *
   * @param roomName Room name to search for
   * @param platform Optional platform filter
   * @returns Matched room
   * @throws RoomNotFoundError if no match or multiple matches
   */
  findRoomByName(roomName: string, platform?: Platform): Promise<Room>;

  /**
   * Get room by ID.
   *
   * @param roomId Universal room ID (e.g., "smartthings:room-123")
   * @returns Room details
   */
  getRoom(roomId: UniversalRoomId): Promise<Room>;
}
```

#### SceneService

```typescript
/**
 * SceneService - Platform-agnostic scene operations.
 *
 * Handles scene listing and execution across all platforms.
 */
export interface ISceneService {
  /**
   * List all scenes across all platforms.
   *
   * @param filters Optional filters (locationId, platform)
   * @returns Unified scene list
   */
  listScenes(filters?: SceneFilters): Promise<Scene[]>;

  /**
   * Execute a scene.
   *
   * @param sceneId Universal scene ID (e.g., "smartthings:scene-123")
   * @param options Execution options
   * @returns Execution result
   */
  executeScene(
    sceneId: UniversalSceneId,
    options?: SceneExecutionOptions
  ): Promise<void>;

  /**
   * Find scene by name (case-insensitive partial match).
   *
   * @param sceneName Scene name to search for
   * @param platform Optional platform filter
   * @returns Matched scene
   * @throws SceneNotFoundError if no match or multiple matches
   */
  findSceneByName(sceneName: string, platform?: Platform): Promise<Scene>;
}
```

### 5.3 Service Implementation Outline

#### DeviceService Implementation

```typescript
export class DeviceService implements IDeviceService {
  constructor(
    private registry: PlatformRegistry,
    private locationService: ILocationService, // For room enrichment
    private diagnosticTracker: DiagnosticTracker,
    private logger: Logger
  ) {}

  async listDevices(filters?: DeviceFilters): Promise<UnifiedDevice[]> {
    // Delegate to PlatformRegistry
    return await this.registry.listAllDevices(filters);
  }

  async getDevice(deviceId: UniversalDeviceId): Promise<UnifiedDevice> {
    // Route to correct adapter via registry
    const adapter = this.registry.getAdapterForDevice(deviceId);
    return await adapter.getDevice(deviceId);
  }

  async executeCommand(
    deviceId: UniversalDeviceId,
    command: DeviceCommand,
    options?: CommandExecutionOptions
  ): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      // Route command to correct adapter
      const result = await this.registry.executeCommand(deviceId, command, options);

      // Track successful execution
      this.diagnosticTracker.recordCommand({
        timestamp: new Date(),
        deviceId,
        command: command.command,
        capability: command.capability,
        success: true,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      // Track failed execution
      this.diagnosticTracker.recordCommand({
        timestamp: new Date(),
        deviceId,
        command: command.command,
        capability: command.capability,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }

  // ... other methods delegate to registry
}
```

#### LocationService Implementation

```typescript
export class LocationService implements ILocationService {
  constructor(
    private registry: PlatformRegistry,
    private logger: Logger
  ) {}

  async listLocations(platform?: Platform): Promise<Location[]> {
    if (platform) {
      // Get adapter for specific platform
      const adapter = this.registry.getAdapter(platform);
      if (!adapter) {
        throw new Error(`Platform ${platform} not registered`);
      }
      return await adapter.listLocations();
    }

    // List locations from all platforms
    const adapters = this.registry.getAdapters();
    const locationLists = await Promise.all(
      Array.from(adapters.values()).map(adapter => adapter.listLocations())
    );

    return locationLists.flat();
  }

  async findRoomByName(roomName: string, platform?: Platform): Promise<Room> {
    const rooms = await this.listRooms({ platform });
    const normalizedSearch = roomName.toLowerCase().trim();

    // Try exact match first
    const exactMatch = rooms.find(room => room.name.toLowerCase() === normalizedSearch);
    if (exactMatch) {
      return exactMatch;
    }

    // Try partial match
    const partialMatches = rooms.filter(room =>
      room.name.toLowerCase().includes(normalizedSearch)
    );

    if (partialMatches.length === 0) {
      throw new RoomNotFoundError(roomName);
    }

    if (partialMatches.length === 1) {
      return partialMatches[0];
    }

    // Multiple matches - ambiguous
    const matchNames = partialMatches.map(r => r.name).join(', ');
    throw new Error(
      `Multiple rooms match "${roomName}": ${matchNames}. Please be more specific.`
    );
  }

  // ... other methods
}
```

#### SceneService Implementation

```typescript
export class SceneService implements ISceneService {
  constructor(
    private registry: PlatformRegistry,
    private logger: Logger
  ) {}

  async listScenes(filters?: SceneFilters): Promise<Scene[]> {
    // Delegate to each adapter
    const adapters = filters?.platform
      ? [this.registry.getAdapter(filters.platform)]
      : Array.from(this.registry.getAdapters().values());

    const sceneLists = await Promise.all(
      adapters
        .filter(adapter => adapter !== undefined)
        .map(adapter => adapter.listScenes(filters))
    );

    return sceneLists.flat();
  }

  async executeScene(
    sceneId: UniversalSceneId,
    options?: SceneExecutionOptions
  ): Promise<void> {
    // Parse scene ID to determine platform
    const { platform } = parseUniversalSceneId(sceneId);

    // Get adapter for platform
    const adapter = this.registry.getAdapter(platform);
    if (!adapter) {
      throw new Error(`Platform ${platform} not registered`);
    }

    await adapter.executeScene(sceneId, options);
  }

  // ... other methods
}
```

### 5.4 Service Factory / Container

**Purpose:** Centralize service instantiation and dependency injection

```typescript
/**
 * ServiceContainer - Dependency injection container for services.
 *
 * Manages service lifecycle and provides dependency injection.
 */
export class ServiceContainer {
  private deviceService?: IDeviceService;
  private locationService?: ILocationService;
  private sceneService?: ISceneService;

  constructor(
    private registry: PlatformRegistry,
    private diagnosticTracker: DiagnosticTracker,
    private logger: Logger
  ) {}

  /**
   * Get DeviceService instance (singleton).
   */
  getDeviceService(): IDeviceService {
    if (!this.deviceService) {
      this.deviceService = new DeviceService(
        this.registry,
        this.getLocationService(), // Inject LocationService dependency
        this.diagnosticTracker,
        this.logger
      );
    }
    return this.deviceService;
  }

  /**
   * Get LocationService instance (singleton).
   */
  getLocationService(): ILocationService {
    if (!this.locationService) {
      this.locationService = new LocationService(
        this.registry,
        this.logger
      );
    }
    return this.locationService;
  }

  /**
   * Get SceneService instance (singleton).
   */
  getSceneService(): ISceneService {
    if (!this.sceneService) {
      this.sceneService = new SceneService(
        this.registry,
        this.logger
      );
    }
    return this.sceneService;
  }

  /**
   * Initialize all services.
   */
  async initialize(): Promise<void> {
    // Services are lazy-initialized, nothing to do here
    // unless we need startup validation
  }

  /**
   * Dispose all services.
   */
  async dispose(): Promise<void> {
    // Cleanup if needed
    this.deviceService = undefined;
    this.locationService = undefined;
    this.sceneService = undefined;
  }
}
```

### 5.5 Preventing Circular Dependencies

**Dependency Graph:**
```
DeviceService ──depends on──> LocationService
                                    │
                                    │
                                    ↓
                              PlatformRegistry
                                    ↑
                                    │
SceneService ───depends on───────────┘
```

**Rules:**
1. **One-way dependencies only:** DeviceService → LocationService (not bidirectional)
2. **No service-to-service cycles:** LocationService does NOT depend on DeviceService
3. **All services depend on PlatformRegistry** (bottom-up dependency)
4. **Services do NOT depend on MCP tools** (top-down only)

**Validation:**
- DeviceService needs room info → injects LocationService ✅
- LocationService needs device counts → calls registry.listAllDevices() ✅ (not DeviceService)
- SceneService is independent → no service dependencies ✅

---

## 6. Migration Strategy

### 6.1 Phase-Based Approach

#### Phase 1: Create Service Foundations (Week 1)

**Goal:** Extract service classes without breaking existing code

**Tasks:**
1. Create service implementation files:
   - `src/services/device-service.ts`
   - `src/services/location-service.ts`
   - `src/services/scene-service.ts`
   - `src/services/service-container.ts`

2. Implement services using PlatformRegistry:
   - Inject PlatformRegistry dependency
   - Implement all interface methods
   - Add comprehensive error handling
   - Add logging and diagnostics

3. Update service interfaces if needed:
   - Change from SmartThings types to Unified types
   - Add platform parameter where appropriate
   - Document migration notes

**Success Criteria:**
- ✅ All three services implement their interfaces
- ✅ Services use PlatformRegistry for platform routing
- ✅ Unit tests pass for all service methods
- ✅ No breaking changes to existing code (parallel implementation)

#### Phase 2: Implement SmartThingsAdapter (Week 1-2)

**Goal:** Wrap existing SmartThingsService logic in adapter pattern

**Tasks:**
1. Create SmartThingsAdapter:
   - `src/adapters/smartthings/smartthings-adapter.ts`
   - Implement IDeviceAdapter interface
   - Wrap existing SmartThingsService logic
   - Map SmartThings types to Unified types

2. Create capability mapper:
   - `src/adapters/smartthings/capability-mapper.ts`
   - Map SmartThings capabilities to DeviceCapability enum
   - Handle platform-specific capability quirks

3. Register adapter with PlatformRegistry:
   - Update main.ts to register SmartThingsAdapter
   - Maintain backward compatibility with singleton

**Success Criteria:**
- ✅ SmartThingsAdapter implements IDeviceAdapter
- ✅ All SmartThings operations work through adapter
- ✅ Integration tests pass
- ✅ PlatformRegistry routes to adapter correctly

#### Phase 3: Update MCP Tools (Week 2)

**Goal:** Migrate MCP tools to use new services via dependency injection

**Tasks:**
1. Create tool factory functions:
   - `src/mcp/tools/factories/device-tools.ts`
   - `src/mcp/tools/factories/location-tools.ts`
   - `src/mcp/tools/factories/scene-tools.ts`
   - Accept service dependencies as parameters

2. Update tool implementations:
   - Replace `smartThingsService` imports with service injection
   - Update to use Unified types (UniversalDeviceId, etc.)
   - Handle platform-agnostic IDs

3. Update management tools to use service methods:
   - Remove direct SDK access (`(service as any).client.*`)
   - Add create/update/delete methods to LocationService if needed
   - Or create separate ManagementService for CRUD operations

4. Update MCP server initialization:
   - Initialize ServiceContainer
   - Pass services to tool factories
   - Register tools with MCP server

**Success Criteria:**
- ✅ All MCP tools use injected services
- ✅ No direct smartThingsService imports in tools
- ✅ MCP tool tests pass
- ✅ End-to-end testing successful

#### Phase 4: Add Management Methods to Services (Week 2)

**Goal:** Eliminate direct SDK access from management tools

**Tasks:**
1. Extend LocationService interface:
   ```typescript
   interface ILocationService {
     // Read operations (existing)
     listLocations(...): Promise<Location[]>;
     listRooms(...): Promise<Room[]>;

     // Add write operations
     createRoom(locationId: LocationId, name: string): Promise<Room>;
     updateRoom(roomId: RoomId, updates: Partial<Room>): Promise<Room>;
     deleteRoom(roomId: RoomId): Promise<void>;
   }
   ```

2. Extend DeviceService interface:
   ```typescript
   interface IDeviceService {
     // Existing operations
     listDevices(...): Promise<UnifiedDevice[]>;

     // Add device management
     updateDevice(deviceId: UniversalDeviceId, updates: DeviceUpdates): Promise<UnifiedDevice>;
     assignDeviceToRoom(deviceId: UniversalDeviceId, roomId: RoomId): Promise<void>;
   }
   ```

3. Implement methods in services:
   - Delegate to PlatformRegistry
   - Add to IDeviceAdapter interface
   - Implement in SmartThingsAdapter

**Success Criteria:**
- ✅ Management tools use service methods
- ✅ No `(service as any).client.*` calls
- ✅ All CRUD operations work
- ✅ Tests updated and passing

#### Phase 5: Deprecate SmartThingsService (Week 3)

**Goal:** Remove old monolithic service class

**Tasks:**
1. Add deprecation warnings:
   - Mark `SmartThingsService` as `@deprecated`
   - Add migration guide in JSDoc
   - Log warnings when singleton accessed

2. Update documentation:
   - README with new architecture
   - Migration guide for external consumers
   - API reference updates

3. Remove singleton export:
   - Delete `export const smartThingsService = new SmartThingsService()`
   - Keep class for backward compatibility (internal use in adapter)
   - Eventually delete class entirely

**Success Criteria:**
- ✅ No internal code uses SmartThingsService directly
- ✅ SmartThingsAdapter wraps any remaining logic
- ✅ Documentation updated
- ✅ Deprecation warnings visible

#### Phase 6: Testing & Validation (Week 3)

**Goal:** Ensure system stability and correctness

**Tasks:**
1. Unit testing:
   - DeviceService unit tests
   - LocationService unit tests
   - SceneService unit tests
   - ServiceContainer tests

2. Integration testing:
   - PlatformRegistry with SmartThingsAdapter
   - Service interaction tests
   - MCP tool end-to-end tests

3. Manual testing:
   - Test all MCP tools via Claude Desktop
   - Verify device control works
   - Verify room/location filtering
   - Verify scene execution

4. Performance testing:
   - Compare latency before/after refactor
   - Check memory usage
   - Verify caching effectiveness

**Success Criteria:**
- ✅ All unit tests pass (100% coverage target)
- ✅ Integration tests pass
- ✅ Manual testing successful
- ✅ Performance within 10% of baseline

### 6.2 Migration Timeline

```
Week 1: Phase 1 + Phase 2 start
  [====Phase 1====][=====Phase 2=====
  Day 1-2: Service foundations
  Day 3-5: SmartThingsAdapter

Week 2: Phase 2 finish + Phase 3 + Phase 4
  ===][====Phase 3====][====Phase 4====
  Day 6-7: SmartThingsAdapter testing
  Day 8-10: Update MCP tools
  Day 11-12: Add management methods

Week 3: Phase 5 + Phase 6
  =][====Phase 5====][=====Phase 6=====]
  Day 13-14: Deprecate old service
  Day 15-18: Testing & validation
  Day 19-21: Buffer for issues
```

**Total Estimated Time:** 3 weeks (15-21 working days)

### 6.3 Backward Compatibility Strategy

**During Migration:**
1. **Dual Implementation:** Both old and new code paths exist
2. **Feature Flags:** Environment variable to switch between implementations
3. **Gradual Migration:** Tool-by-tool migration, not all at once
4. **Fallback Mechanism:** If new services fail, fallback to old service

**Post-Migration:**
1. **Deprecation Period:** 1 release cycle with warnings
2. **Major Version Bump:** Breaking changes in v2.0.0
3. **Migration Guide:** Comprehensive docs for external users

**Singleton Compatibility:**
```typescript
// Legacy support (temporary)
import { smartThingsService } from './smartthings/client.js'; // @deprecated

// New approach
import { serviceContainer } from './services/container.js';
const deviceService = serviceContainer.getDeviceService();
```

---

## 7. Risk Assessment & Mitigation

### 7.1 Technical Risks

#### Risk 1: Breaking Changes to MCP Tools
**Impact:** HIGH
**Probability:** MEDIUM
**Mitigation:**
- Phased migration with dual code paths
- Feature flags for new vs old implementation
- Comprehensive integration testing
- Rollback plan if issues detected

#### Risk 2: Performance Regression
**Impact:** MEDIUM
**Probability:** LOW
**Mitigation:**
- PlatformRegistry uses caching (already optimized)
- Services add minimal overhead (thin wrappers)
- Performance benchmarks before/after
- Load testing with realistic scenarios

#### Risk 3: Circular Dependencies
**Impact:** HIGH
**Probability:** LOW
**Mitigation:**
- Clear dependency rules documented
- DeviceService → LocationService (one-way only)
- ServiceContainer manages initialization order
- Automated dependency graph validation

#### Risk 4: Type Incompatibility (SmartThings vs Unified)
**Impact:** MEDIUM
**Probability:** MEDIUM
**Mitigation:**
- SmartThingsAdapter handles type mapping
- Comprehensive type tests
- Gradual migration allows validation
- Fallback to SmartThings types if needed

#### Risk 5: Missing Adapter Methods
**Impact:** MEDIUM
**Probability:** MEDIUM
**Mitigation:**
- Audit IDeviceAdapter vs current SmartThingsService
- Add missing methods to adapter interface
- Implement in SmartThingsAdapter
- Document platform-specific limitations

### 7.2 Operational Risks

#### Risk 1: Increased Complexity
**Impact:** MEDIUM
**Probability:** HIGH
**Mitigation:**
- Comprehensive documentation
- Architectural decision records
- Clear onboarding guide
- Regular architecture reviews

#### Risk 2: Developer Learning Curve
**Impact:** LOW
**Probability:** MEDIUM
**Mitigation:**
- Migration guide with examples
- Code comments explaining DI patterns
- Pair programming during migration
- Knowledge sharing sessions

### 7.3 Migration Risks

#### Risk 1: Incomplete Migration
**Impact:** MEDIUM
**Probability:** LOW
**Mitigation:**
- Checklist of all files to update
- Automated search for old imports
- Code review requirements
- Migration tracking dashboard

#### Risk 2: Testing Gaps
**Impact:** HIGH
**Probability:** MEDIUM
**Mitigation:**
- Test coverage requirements (>90%)
- Integration test suite
- Manual testing protocol
- Staging environment testing

---

## 8. Files Requiring Updates

### 8.1 New Files to Create

#### Service Implementations
- `src/services/device-service.ts` - DeviceService class
- `src/services/location-service.ts` - LocationService class
- `src/services/scene-service.ts` - SceneService class
- `src/services/service-container.ts` - DI container

#### Adapter Implementation
- `src/adapters/smartthings/smartthings-adapter.ts` - SmartThings adapter
- `src/adapters/smartthings/capability-mapper.ts` - Capability mapping
- `src/adapters/smartthings/type-mapper.ts` - Type conversion utilities
- `src/adapters/smartthings/config.ts` - Adapter configuration

#### Tool Factories
- `src/mcp/tools/factories/device-tools.ts` - Device tool factory
- `src/mcp/tools/factories/location-tools.ts` - Location tool factory
- `src/mcp/tools/factories/scene-tools.ts` - Scene tool factory
- `src/mcp/tools/factories/management-tools.ts` - Management tool factory

#### Tests
- `src/services/__tests__/device-service.test.ts`
- `src/services/__tests__/location-service.test.ts`
- `src/services/__tests__/scene-service.test.ts`
- `src/adapters/smartthings/__tests__/smartthings-adapter.test.ts`

### 8.2 Existing Files to Modify

#### Service Layer
- `src/services/interfaces.ts` - Update interfaces to use Unified types
- `src/smartthings/client.ts` - Mark as deprecated, keep for adapter use

#### MCP Tools (7 files)
- `src/mcp/tools/device-control.ts` - Use DeviceService injection
- `src/mcp/tools/device-query.ts` - Use DeviceService + LocationService
- `src/mcp/tools/scenes.ts` - Use SceneService + LocationService
- `src/mcp/tools/management.ts` - Use LocationService + DeviceService methods
- `src/mcp/tools/diagnostics.ts` - Use LocationService
- `src/mcp/tools/system.ts` - Update if using services
- `src/mcp/tools/index.ts` - Update tool exports to use factories

#### Entry Points
- `src/mcp/server.ts` - Initialize ServiceContainer, pass to tool factories
- `src/main.ts` - Register SmartThingsAdapter with PlatformRegistry

#### Configuration
- `src/config/environment.ts` - No changes (already externalized)

#### Utilities (No changes needed)
- `src/utils/retry.ts` - Used by services
- `src/utils/logger.ts` - Used by services
- `src/utils/diagnostic-tracker.ts` - Used by DeviceService
- `src/utils/error-handler.ts` - Used by all

### 8.3 Files to Eventually Delete

- `src/smartthings/client.ts` - After complete migration to adapter
- Possibly merge into SmartThingsAdapter internal implementation

### 8.4 Documentation Updates

- `README.md` - New architecture section
- `docs/architecture.md` - Service layer documentation (create)
- `docs/migration-guide.md` - Migration from v1 to v2 (create)
- `docs/research/` - This research document (already exists)

---

## 9. Open Questions & Decisions Needed

### 9.1 Service Scope

**Question:** Should LocationService handle CRUD operations (create/update/delete rooms)?

**Options:**
- **A:** Yes, add to ILocationService interface
- **B:** No, create separate ManagementService
- **C:** Add to IDeviceAdapter but not services (tools access adapter directly)

**Recommendation:** **Option A** - Keep location management in LocationService
- Natural grouping of location-related operations
- Services should be CRUD-complete for their domain
- ManagementService would create unnecessary layer

**Decision:** ✅ Option A

### 9.2 Diagnostic Tracking Scope

**Question:** Should diagnostic tracking be extended to scenes and locations?

**Options:**
- **A:** Device commands only (current state)
- **B:** Add scene execution tracking
- **C:** Track all service operations

**Recommendation:** **Option B** - Add scene execution tracking
- Scene execution is user-facing action (like device command)
- Location/room queries are read-only (less useful to track)
- Keeps diagnostics focused on state-changing operations

**Decision:** ✅ Option B

### 9.3 Type System Strategy

**Question:** Should services use SmartThings types or Unified types?

**Options:**
- **A:** SmartThings types (current, delay platform abstraction)
- **B:** Unified types (full platform abstraction)
- **C:** Hybrid (internal SmartThings, expose Unified)

**Recommendation:** **Option B** - Unified types throughout
- Aligns with PlatformRegistry architecture
- Enables multi-platform from day 1
- SmartThingsAdapter handles type mapping
- Ticket 1M-249 explicitly mentions "platform-agnostic"

**Decision:** ✅ Option B

### 9.4 Singleton vs Dependency Injection

**Question:** Should services be singletons or always dependency-injected?

**Options:**
- **A:** Singletons like current SmartThingsService
- **B:** Pure DI via ServiceContainer only
- **C:** Both (singletons for convenience, DI for testing)

**Recommendation:** **Option C** - Hybrid approach
- ServiceContainer provides singletons for production
- Tests can inject mocks directly
- Tools import from ServiceContainer (not individual files)
- Best of both worlds

**Decision:** ✅ Option C

```typescript
// Production: Singleton via container
import { serviceContainer } from './services/container.js';
const deviceService = serviceContainer.getDeviceService();

// Testing: Direct instantiation with mocks
const mockRegistry = createMock<PlatformRegistry>();
const deviceService = new DeviceService(mockRegistry, ...);
```

---

## 10. Recommended Next Steps

### Immediate Actions (This Week)

1. **Get stakeholder approval on platform-agnostic approach**
   - Confirm Option B (Unified types) is acceptable
   - Verify PlatformRegistry integration is desired
   - Validate 3-week timeline

2. **Create tracking subtasks in Linear**
   - One subtask per migration phase
   - Link to 1M-249 parent ticket
   - Assign to appropriate team members

3. **Set up feature flag**
   - `ENABLE_NEW_SERVICES=true/false` environment variable
   - Allows gradual rollout and easy rollback

### Phase 1 Kickoff (Next Week)

1. **Create service interface PRs**
   - Update `src/services/interfaces.ts` with Unified types
   - Add comprehensive JSDoc
   - Get review and approval

2. **Implement service classes**
   - DeviceService, LocationService, SceneService
   - ServiceContainer
   - Unit tests for each

3. **Begin SmartThingsAdapter**
   - Scaffold adapter structure
   - Implement core methods
   - Type mapping utilities

### Ongoing

1. **Daily standup updates**
   - Progress on current phase
   - Blockers or questions
   - Integration points with other work

2. **Code reviews**
   - Pair review on service implementations
   - Architecture validation
   - Test coverage verification

3. **Documentation**
   - Update as code changes
   - Migration guide for tools
   - Architecture decision records

---

## 11. Appendices

### A. Method Reference Table

Complete mapping of current SmartThingsService methods to proposed services:

| Current Method | Current Lines | Target Service | New Method | Dependencies | Notes |
|----------------|---------------|----------------|------------|--------------|-------|
| `listDevices(roomId?)` | 60-102 | DeviceService | `listDevices(filters?)` | PlatformRegistry, LocationService | Uses LocationService for room enrichment |
| `getDeviceStatus(deviceId)` | 111-120 | DeviceService | `getDeviceState(deviceId)` | PlatformRegistry | Renamed for clarity |
| `executeCommand(...)` | 131-200 | DeviceService | `executeCommand(...)` | PlatformRegistry, DiagnosticTracker | Maintains diagnostic tracking |
| `getDevice(deviceId)` | 209-229 | DeviceService | `getDevice(deviceId)` | PlatformRegistry | Direct mapping |
| `getDeviceCapabilities(deviceId)` | 238-246 | DeviceService | `getDeviceCapabilities(deviceId)` | PlatformRegistry | Direct mapping |
| `listLocations()` | 254-268 | LocationService | `listLocations(platform?)` | PlatformRegistry | Added platform filter |
| `listRooms(locationId?)` | 277-319 | LocationService | `listRooms(filters?)` | PlatformRegistry, DeviceService | Uses DeviceService for counts |
| `findRoomByName(roomName)` | 328-363 | LocationService | `findRoomByName(roomName, platform?)` | PlatformRegistry | Added platform filter |
| `listScenes(locationId?)` | 372-396 | SceneService | `listScenes(filters?)` | PlatformRegistry | Added filter object |
| `executeScene(sceneId)` | 404-412 | SceneService | `executeScene(sceneId, options?)` | PlatformRegistry | Added execution options |
| `findSceneByName(sceneName)` | 421-458 | SceneService | `findSceneByName(sceneName, platform?)` | PlatformRegistry | Added platform filter |

### B. Type Migration Map

Mapping from SmartThings types to Unified types:

| SmartThings Type | Unified Type | Conversion |
|------------------|--------------|------------|
| `DeviceId` | `UniversalDeviceId` | Add platform prefix: `smartthings:${deviceId}` |
| `DeviceInfo` | `UnifiedDevice` | Map via SmartThingsAdapter |
| `DeviceStatus` | `DeviceState` | Map capability states |
| `RoomId` | `UniversalRoomId` | Add platform prefix |
| `RoomInfo` | `Room` | Map room properties |
| `LocationId` | `UniversalLocationId` | Add platform prefix |
| `LocationInfo` | `Location` | Map location properties |
| `SceneId` | `UniversalSceneId` | Add platform prefix |
| `SceneInfo` | `Scene` | Map scene properties |

### C. Service Dependency Graph

```
ServiceContainer
    │
    ├─> DeviceService
    │       ├─> PlatformRegistry
    │       ├─> LocationService (for room enrichment)
    │       ├─> DiagnosticTracker
    │       └─> Logger
    │
    ├─> LocationService
    │       ├─> PlatformRegistry
    │       └─> Logger
    │
    └─> SceneService
            ├─> PlatformRegistry
            └─> Logger
```

### D. Related Tickets

- **1M-249** (Primary): Split into DeviceService, LocationService, SceneService
- **1M-250**: Related to service architecture
- **1M-251**: Related to service architecture
- **1M-252**: Related to service architecture
- **1M-239**: Implement Layer 2 abstraction (PlatformRegistry) ✅ COMPLETED
- **1M-240**: Implement PlatformRegistry with adapter management ✅ COMPLETED

### E. References

**Code Files:**
- `src/smartthings/client.ts` - Current SmartThingsService
- `src/services/interfaces.ts` - Service interface definitions
- `src/adapters/PlatformRegistry.ts` - Platform registry implementation
- `src/adapters/base/IDeviceAdapter.ts` - Adapter interface
- `src/mcp/tools/*.ts` - MCP tool implementations

**Research Documents:**
- `docs/research/architecture-analysis-2025-11-26.md` - Previous architecture analysis
- `docs/research/ideviceadapter-design-2025-11-26.md` - IDeviceAdapter design
- `docs/research/mcp-smartthings-architecture-research-2025-11-25.md` - Original architecture

---

## Summary

This research provides a comprehensive analysis of the SmartThingsService split into three focused services. The key findings are:

1. **Current State:** Monolithic SmartThingsService with 15 methods across 3 domains
2. **Target State:** Three services (Device, Location, Scene) using PlatformRegistry for platform abstraction
3. **Dependencies:** 7 MCP tool files need updates, some with direct SDK access
4. **Shared Concerns:** SmartThings SDK client, retry logic, diagnostics, logging
5. **Service Composition:** DeviceService depends on LocationService (one-way)
6. **Migration Strategy:** 6 phases over 3 weeks with backward compatibility
7. **Risks:** Manageable with mitigation strategies in place

**Recommendation:** Proceed with platform-agnostic service split using PlatformRegistry. This aligns with existing architecture (Layer 2 abstraction already complete) and future multi-platform support goals.

**Next Step:** Get stakeholder approval on approach and begin Phase 1 implementation.
