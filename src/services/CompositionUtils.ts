/**
 * CompositionUtils - Service orchestration and composition utilities.
 *
 * Design Decision: Utility functions for multi-service operations
 * Rationale: Provides reusable patterns for:
 * - Multi-service orchestration
 * - Error handling and retry logic
 * - Parallel execution with error aggregation
 * - Fallback mechanisms
 * - Health check aggregation
 *
 * Architecture: Utility Layer (Layer 3.5)
 * - Stateless utility functions
 * - Generic service orchestration patterns
 * - Reusable error handling
 * - Performance optimization helpers
 *
 * Trade-offs:
 * - Simplicity: Pure functions, easy to test
 * - Reusability: Generic patterns applicable across services
 * - Error Handling: Explicit error propagation and aggregation
 * - Performance: Parallel execution where possible
 *
 * Use Cases:
 * 1. Multi-Service Operations: Execute operations across multiple services
 * 2. Error Resilience: Retry logic and fallback strategies
 * 3. Performance: Parallel execution with Promise.all
 * 4. Monitoring: Health check aggregation
 *
 * @module services/CompositionUtils
 */

import type { ServiceType, ServiceHealth } from './ServiceContainer.js';

/**
 * Result of a service operation with success/error information.
 */
export interface ServiceOperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  serviceType?: ServiceType;
}

/**
 * Options for retry execution.
 */
export interface RetryOptions {
  maxAttempts: number;
  delayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Options for parallel execution.
 */
export interface ParallelOptions {
  continueOnError?: boolean;
  maxConcurrency?: number;
}

/**
 * CompositionUtils - Utility functions for service orchestration.
 *
 * Provides reusable patterns for composing and orchestrating multiple
 * services with error handling, retries, and parallel execution.
 */
export class CompositionUtils {
  /**
   * Execute operation with automatic retry on failure.
   *
   * Retries the operation with exponential backoff on failure.
   * Useful for network operations that may fail temporarily.
   *
   * Performance:
   * - Best case: O(1) - succeeds on first attempt
   * - Worst case: O(n) where n = maxAttempts
   * - Delay: Exponential backoff between retries
   *
   * @param operation Async operation to execute
   * @param options Retry configuration
   * @returns Promise resolving to operation result
   * @throws Error if all retry attempts fail
   *
   * @example
   * ```typescript
   * const devices = await CompositionUtils.executeWithRetry(
   *   () => deviceService.listDevices(),
   *   { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 }
   * );
   * ```
   */
  static async executeWithRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
    const { maxAttempts, delayMs = 1000, backoffMultiplier = 2, onRetry } = options;

    let lastError: Error | undefined;
    let currentDelay = delayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          onRetry?.(attempt, lastError);
          await this.delay(currentDelay);
          currentDelay *= backoffMultiplier;
        }
      }
    }

    throw new Error(`Operation failed after ${maxAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Execute operation with fallback on failure.
   *
   * Attempts primary operation, falls back to secondary if it fails.
   * Useful for graceful degradation scenarios.
   *
   * @param primary Primary operation to attempt
   * @param fallback Fallback operation if primary fails
   * @returns Promise resolving to result from primary or fallback
   *
   * @example
   * ```typescript
   * const devices = await CompositionUtils.executeWithFallback(
   *   () => deviceService.listDevices(),
   *   () => cachedDeviceService.getCachedDevices()
   * );
   * ```
   */
  static async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    try {
      return await primary();
    } catch (primaryError) {
      try {
        return await fallback();
      } catch (fallbackError) {
        throw new Error(
          `Both primary and fallback operations failed. ` +
            `Primary: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}. ` +
            `Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
        );
      }
    }
  }

  /**
   * Execute multiple operations in parallel.
   *
   * Runs operations concurrently using Promise.all or Promise.allSettled.
   * Provides options for error handling and concurrency control.
   *
   * Performance:
   * - Parallel execution: O(max(operation_times))
   * - Sequential would be: O(sum(operation_times))
   *
   * @param operations Array of async operations to execute
   * @param options Parallel execution options
   * @returns Promise resolving to array of results
   * @throws Error if any operation fails (unless continueOnError: true)
   *
   * @example
   * ```typescript
   * const [devices, locations, scenes] = await CompositionUtils.executeParallel([
   *   () => deviceService.listDevices(),
   *   () => locationService.listLocations(),
   *   () => sceneService.listScenes()
   * ]);
   * ```
   */
  static async executeParallel<T>(
    operations: Array<() => Promise<T>>,
    options: ParallelOptions = {}
  ): Promise<T[]> {
    const { continueOnError = false } = options;

    if (continueOnError) {
      const results = await Promise.allSettled(operations.map((op) => op()));
      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          throw new Error(`Operation ${index} failed: ${result.reason}`);
        }
      });
    } else {
      return await Promise.all(operations.map((op) => op()));
    }
  }

  /**
   * Execute multiple operations and return results with error information.
   *
   * Similar to executeParallel but returns detailed results for each operation
   * including success/failure status. Never throws - errors are captured.
   *
   * @param operations Array of async operations to execute
   * @returns Promise resolving to array of operation results
   *
   * @example
   * ```typescript
   * const results = await CompositionUtils.executeParallelSafe([
   *   () => deviceService.listDevices(),
   *   () => locationService.listLocations(),
   *   () => sceneService.listScenes()
   * ]);
   *
   * results.forEach((result, index) => {
   *   if (result.success) {
   *     console.log(`Operation ${index} succeeded:`, result.data);
   *   } else {
   *     console.error(`Operation ${index} failed:`, result.error);
   *   }
   * });
   * ```
   */
  static async executeParallelSafe<T>(
    operations: Array<() => Promise<T>>
  ): Promise<Array<ServiceOperationResult<T>>> {
    const results = await Promise.allSettled(operations.map((op) => op()));

    return results.map((result) => {
      if (result.status === 'fulfilled') {
        return {
          success: true,
          data: result.value,
        };
      } else {
        return {
          success: false,
          error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
        };
      }
    });
  }

  /**
   * Aggregate health checks from multiple services.
   *
   * Combines health check results from multiple services into single result.
   * Overall health is healthy only if all services are healthy.
   *
   * @param healthChecks Array of service health results
   * @returns Aggregated health result
   *
   * @example
   * ```typescript
   * const deviceHealth = await checkDeviceServiceHealth();
   * const locationHealth = await checkLocationServiceHealth();
   *
   * const overall = CompositionUtils.aggregateHealth([deviceHealth, locationHealth]);
   * console.log(`System healthy: ${overall.healthy}`);
   * ```
   */
  static aggregateHealth(healthChecks: ServiceHealth[]): ServiceHealth {
    const allHealthy = healthChecks.every((check) => check.healthy);
    const messages = healthChecks
      .filter((check) => !check.healthy && check.message)
      .map((check) => check.message)
      .join('; ');

    return {
      healthy: allHealthy,
      message: allHealthy ? undefined : messages || 'One or more services unhealthy',
      timestamp: new Date(),
    };
  }

  /**
   * Create a timeout wrapper for an operation.
   *
   * Wraps an operation with a timeout. Rejects if operation takes longer
   * than specified timeout.
   *
   * @param operation Async operation to execute
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise resolving to operation result or rejecting on timeout
   * @throws Error if operation times out
   *
   * @example
   * ```typescript
   * const devices = await CompositionUtils.withTimeout(
   *   () => deviceService.listDevices(),
   *   5000 // 5 second timeout
   * );
   * ```
   */
  static async withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      operation(),
      this.delay(timeoutMs).then(() => {
        throw new Error(`Operation timed out after ${timeoutMs}ms`);
      }),
    ]);
  }

  /**
   * Execute operations sequentially with early termination on error.
   *
   * Runs operations one after another, stopping if any fails.
   * Useful when operations have dependencies.
   *
   * Performance: O(n) where n = number of operations
   *
   * @param operations Array of async operations to execute
   * @returns Promise resolving to array of results
   * @throws Error on first operation failure
   *
   * @example
   * ```typescript
   * const results = await CompositionUtils.executeSequential([
   *   () => validateConfig(),
   *   () => initializeServices(),
   *   () => startHealthChecks()
   * ]);
   * ```
   */
  static async executeSequential<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = [];

    for (const operation of operations) {
      results.push(await operation());
    }

    return results;
  }

  /**
   * Batch operations with configurable batch size.
   *
   * Processes operations in batches to control concurrency.
   * Useful for rate limiting or resource management.
   *
   * @param operations Array of async operations to execute
   * @param batchSize Number of operations per batch
   * @returns Promise resolving to array of results
   *
   * @example
   * ```typescript
   * // Process 100 devices in batches of 10
   * const results = await CompositionUtils.executeBatched(
   *   deviceIds.map(id => () => deviceService.getDevice(id)),
   *   10
   * );
   * ```
   */
  static async executeBatched<T>(
    operations: Array<() => Promise<T>>,
    batchSize: number
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((op) => op()));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Memoize an async operation result.
   *
   * Caches the result of an operation and returns cached value on subsequent calls.
   * Useful for expensive operations that don't change frequently.
   *
   * @param operation Async operation to memoize
   * @param ttlMs Cache time-to-live in milliseconds (optional)
   * @returns Memoized function
   *
   * @example
   * ```typescript
   * const getCachedDevices = CompositionUtils.memoize(
   *   () => deviceService.listDevices(),
   *   60000 // Cache for 1 minute
   * );
   *
   * const devices1 = await getCachedDevices(); // Executes operation
   * const devices2 = await getCachedDevices(); // Returns cached result
   * ```
   */
  static memoize<T>(operation: () => Promise<T>, ttlMs?: number): () => Promise<T> {
    let cached: { value: T; timestamp: number } | undefined;

    return async (): Promise<T> => {
      const now = Date.now();

      if (cached && (!ttlMs || now - cached.timestamp < ttlMs)) {
        return cached.value;
      }

      const value = await operation();
      cached = { value, timestamp: now };

      return value;
    };
  }

  /**
   * Delay execution for specified milliseconds.
   *
   * Helper function for creating delays in async operations.
   *
   * @param ms Milliseconds to delay
   * @returns Promise that resolves after delay
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
