/**
 * Platform registry type definitions.
 *
 * Defines types for managing multiple platform adapters and
 * routing device operations to the appropriate platform.
 *
 * Design Principles:
 * - Type-safe: Branded types prevent cross-platform ID mixing
 * - Health-aware: Track adapter health and status
 * - Filter-capable: Flexible device filtering across platforms
 * - Event-driven: Propagate adapter events to registry listeners
 *
 * @module types/registry
 */

import type { Platform, DeviceCapability, RoomId } from './unified-device.js';
import type { AdapterHealthStatus } from '../adapters/base/IDeviceAdapter.js';

/**
 * Device filter options for querying across platforms.
 *
 * All filters are optional and use AND logic (all must match).
 * Platform-specific filters are supported via the platform field.
 */
export interface DeviceFilter {
  /** Filter by room ID */
  roomId?: RoomId | string;

  /** Filter by device capability */
  capability?: DeviceCapability;

  /** Filter by specific platform */
  platform?: Platform;

  /** Filter by online status */
  online?: boolean;

  /** Filter by device name pattern (regex) */
  namePattern?: RegExp;
}

/**
 * Registry health status aggregated across all adapters.
 *
 * Reports overall health of the platform registry including
 * status of each registered adapter.
 */
export interface RegistryHealthStatus {
  /** Overall registry health (true if at least one adapter healthy) */
  healthy: boolean;

  /** Total number of registered adapters */
  adapterCount: number;

  /** Number of healthy adapters */
  healthyAdapterCount: number;

  /** Health status of each adapter keyed by platform */
  adapters: Map<Platform, AdapterHealthStatus>;

  /** When this health check was performed */
  lastCheck: Date;

  /** Optional error message if registry unhealthy */
  error?: string;
}

/**
 * Adapter health status with extended platform information.
 *
 * Extends the base AdapterHealthStatus with additional metrics
 * useful for monitoring and diagnostics.
 */
export interface AdapterHealth extends AdapterHealthStatus {
  /** Average API latency (milliseconds) */
  latency: number;

  /** Error rate (0.0-1.0) over recent operations */
  errorRate: number;

  /** Last successful health check timestamp */
  lastCheck: Date;

  /** Optional error details if unhealthy */
  error?: Error;
}

/**
 * Registry configuration options.
 *
 * Controls registry behavior including caching, event propagation,
 * and error handling strategies.
 */
export interface RegistryConfig {
  /**
   * Enable device platform caching.
   *
   * Default: true
   *
   * When true:
   * - Caches platform lookups for faster routing
   * - Reduces ID parsing overhead
   * - Updates cache on device events
   *
   * When false:
   * - Parses device ID on every operation
   * - No memory overhead for cache
   * - Slower routing performance
   */
  enableCaching?: boolean;

  /**
   * Propagate adapter events to registry listeners.
   *
   * Default: true
   *
   * When true:
   * - Registry emits events from all adapters
   * - Centralized event handling
   * - Easier to monitor all platforms
   *
   * When false:
   * - No event propagation
   * - Must listen to individual adapters
   * - Reduces memory overhead
   */
  propagateEvents?: boolean;

  /**
   * Graceful degradation on adapter failures.
   *
   * Default: true
   *
   * When true:
   * - Continue with remaining adapters if one fails
   * - Log errors but don't throw
   * - Best-effort approach
   *
   * When false:
   * - Throw on first adapter failure
   * - Fail-fast approach
   * - Useful for testing
   */
  gracefulDegradation?: boolean;

  /**
   * Maximum concurrent operations across all adapters.
   *
   * Default: 10
   *
   * Limits concurrent API calls to prevent overwhelming
   * platform APIs or local resources.
   */
  maxConcurrency?: number;
}

/**
 * Registry metrics for monitoring and diagnostics.
 *
 * Tracks performance and reliability across all registered adapters.
 */
export interface RegistryMetrics {
  /** Total number of operations performed */
  totalOperations: number;

  /** Successful operations */
  successfulOperations: number;

  /** Failed operations */
  failedOperations: number;

  /** Average operation latency (milliseconds) */
  averageLatency: number;

  /** P95 operation latency (milliseconds) */
  p95Latency: number;

  /** P99 operation latency (milliseconds) */
  p99Latency: number;

  /** Cache hit rate (0.0-1.0) */
  cacheHitRate: number;

  /** Total cache hits */
  cacheHits: number;

  /** Total cache misses */
  cacheMisses: number;

  /** Operations per adapter */
  operationsPerAdapter: Map<Platform, number>;

  /** Error rate per adapter (0.0-1.0) */
  errorRatePerAdapter: Map<Platform, number>;
}

/**
 * Adapter registration event data.
 *
 * Emitted when an adapter is registered with the registry.
 */
export interface AdapterRegisteredEvent {
  /** Platform that was registered */
  platform: Platform;

  /** When the adapter was registered */
  timestamp: Date;

  /** Adapter metadata */
  metadata: {
    platformName: string;
    version: string;
  };
}

/**
 * Adapter unregistration event data.
 *
 * Emitted when an adapter is unregistered from the registry.
 */
export interface AdapterUnregisteredEvent {
  /** Platform that was unregistered */
  platform: Platform;

  /** When the adapter was unregistered */
  timestamp: Date;

  /** Reason for unregistration (if provided) */
  reason?: string;
}

/**
 * Registry error event data.
 *
 * Emitted for non-fatal registry errors that should be logged.
 */
export interface RegistryErrorEvent {
  /** Error that occurred */
  error: Error;

  /** Context describing where error occurred */
  context: string;

  /** Platform where error occurred (if applicable) */
  platform?: Platform;

  /** Event timestamp */
  timestamp: Date;
}
