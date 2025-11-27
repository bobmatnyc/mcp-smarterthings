/**
 * RetryPolicy - Configurable retry policies and circuit breaker pattern.
 *
 * Design Decision: Policy-based retry with circuit breaker
 * Rationale: Provides flexible retry mechanisms for service operations:
 * - Configurable Policies: Different retry strategies per service/operation
 * - Exponential Backoff: Prevents thundering herd on failure
 * - Circuit Breaker: Prevents cascading failures in multi-service architecture
 * - Jitter: Randomizes retry timing to spread load
 *
 * Architecture: Resilience Layer (Layer 3.5)
 * - Integrates with CompositionUtils.executeWithRetry
 * - Uses ErrorHandler for error classification
 * - Supports per-service policy configuration
 * - Tracks failure rates for circuit breaker
 *
 * Trade-offs:
 * - Complexity: More sophisticated retry logic vs. simple retry
 * - Performance: Backoff delays increase latency on failure
 * - Reliability: Circuit breaker prevents cascading vs. might fail fast too early
 * - Memory: Circuit breaker tracks failure history (bounded)
 *
 * Circuit Breaker States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail immediately
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 *
 * Integration:
 * - Extends CompositionUtils.executeWithRetry with policies
 * - Used by all service operations for resilience
 * - Configurable per service for optimal behavior
 *
 * @module services/errors/RetryPolicy
 */

import { ServiceErrorCode } from './ServiceError.js';
import { ErrorHandler, ErrorCategory } from './ErrorHandler.js';
import logger from '../../utils/logger.js';

/**
 * Retry policy configuration.
 *
 * Defines how to retry failed operations.
 */
export interface RetryPolicy {
  /** Maximum retry attempts */
  maxAttempts: number;

  /** Base delay between retries (ms) */
  baseDelayMs: number;

  /** Maximum delay between retries (ms) */
  maxDelayMs: number;

  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Add random jitter to delays (±%) */
  jitterPercent: number;

  /** Error codes that should trigger retry */
  retryableErrors: ServiceErrorCode[];

  /** Error categories that should trigger retry */
  retryableCategories: ErrorCategory[];

  /** Enable circuit breaker */
  enableCircuitBreaker: boolean;

  /** Circuit breaker threshold (failures before opening) */
  circuitBreakerThreshold?: number;

  /** Circuit breaker timeout (ms before attempting recovery) */
  circuitBreakerTimeoutMs?: number;
}

/**
 * Circuit breaker state.
 */
export enum CircuitState {
  /** Normal operation - requests pass through */
  CLOSED = 'CLOSED',

  /** Too many failures - requests fail immediately */
  OPEN = 'OPEN',

  /** Testing recovery - limited requests allowed */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker status.
 */
export interface CircuitBreakerStatus {
  /** Current circuit state */
  state: CircuitState;

  /** Failure count in current window */
  failureCount: number;

  /** Success count in half-open state */
  successCount: number;

  /** Timestamp when circuit opened */
  openedAt?: Date;

  /** Next retry attempt allowed at */
  nextRetryAt?: Date;
}

/**
 * Circuit breaker implementation.
 *
 * Prevents cascading failures by failing fast when error rate is high.
 *
 * Design Decision: Time-based circuit breaker
 * Rationale: Automatically recovers after timeout without manual intervention.
 * Uses sliding window for failure tracking.
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private openedAt?: Date;

  constructor(
    private readonly threshold: number,
    private readonly timeoutMs: number
  ) {}

  /**
   * Check if request should be allowed.
   *
   * @returns True if request allowed
   * @throws Error if circuit is open
   */
  async allowRequest(): Promise<boolean> {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if timeout elapsed
      if (this.openedAt && Date.now() - this.openedAt.getTime() >= this.timeoutMs) {
        this.transitionToHalfOpen();
        return true;
      }

      throw new Error('Circuit breaker is OPEN - service unavailable');
    }

    // HALF_OPEN - allow limited requests
    return true;
  }

  /**
   * Record successful request.
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // After 3 successes in HALF_OPEN, close circuit
      if (this.successCount >= 3) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record failed request.
   */
  recordFailure(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      // Single failure in HALF_OPEN reopens circuit
      this.transitionToOpen();
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      this.failureCount++;

      if (this.failureCount >= this.threshold) {
        this.transitionToOpen();
      }
    }
  }

  /**
   * Get current circuit breaker status.
   */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      openedAt: this.openedAt,
      nextRetryAt: this.openedAt ? new Date(this.openedAt.getTime() + this.timeoutMs) : undefined,
    };
  }

  private transitionToOpen(): void {
    logger.warn('Circuit breaker opening', {
      failureCount: this.failureCount,
      threshold: this.threshold,
    });

    this.state = CircuitState.OPEN;
    this.openedAt = new Date();
    this.failureCount = 0;
  }

  private transitionToHalfOpen(): void {
    logger.info('Circuit breaker transitioning to HALF_OPEN');
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
  }

  private transitionToClosed(): void {
    logger.info('Circuit breaker closing');
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = undefined;
  }

  /**
   * Reset circuit breaker to initial state.
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = undefined;
  }
}

/**
 * RetryPolicyManager - Manages retry policies and circuit breakers.
 *
 * Provides centralized retry policy configuration and execution.
 */
export class RetryPolicyManager {
  private static readonly circuitBreakers = new Map<string, CircuitBreaker>();

  /**
   * Default retry policy for most operations.
   */
  static readonly DEFAULT_POLICY: RetryPolicy = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 16000,
    backoffMultiplier: 2,
    jitterPercent: 20,
    retryableErrors: [
      ServiceErrorCode.NETWORK_ERROR,
      ServiceErrorCode.TIMEOUT,
      ServiceErrorCode.SERVICE_UNAVAILABLE,
      ServiceErrorCode.DEVICE_OFFLINE,
      ServiceErrorCode.STATE_SYNC_ERROR,
    ],
    retryableCategories: [ErrorCategory.TRANSIENT],
    enableCircuitBreaker: false,
  };

  /**
   * Aggressive retry policy for critical operations.
   */
  static readonly AGGRESSIVE_POLICY: RetryPolicy = {
    maxAttempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 32000,
    backoffMultiplier: 2,
    jitterPercent: 20,
    retryableErrors: [
      ServiceErrorCode.NETWORK_ERROR,
      ServiceErrorCode.TIMEOUT,
      ServiceErrorCode.SERVICE_UNAVAILABLE,
      ServiceErrorCode.DEVICE_OFFLINE,
      ServiceErrorCode.STATE_SYNC_ERROR,
      ServiceErrorCode.RATE_LIMITED,
    ],
    retryableCategories: [ErrorCategory.TRANSIENT, ErrorCategory.RATE_LIMIT],
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 10,
    circuitBreakerTimeoutMs: 60000, // 1 minute
  };

  /**
   * Conservative retry policy for non-critical operations.
   */
  static readonly CONSERVATIVE_POLICY: RetryPolicy = {
    maxAttempts: 2,
    baseDelayMs: 2000,
    maxDelayMs: 8000,
    backoffMultiplier: 2,
    jitterPercent: 20,
    retryableErrors: [ServiceErrorCode.NETWORK_ERROR, ServiceErrorCode.TIMEOUT],
    retryableCategories: [ErrorCategory.TRANSIENT],
    enableCircuitBreaker: false,
  };

  /**
   * Get default retry policy for service.
   *
   * @param service Service name
   * @returns Retry policy for service
   */
  static getDefaultPolicy(service: string): RetryPolicy {
    // Customize policies per service if needed
    switch (service) {
      case 'DeviceService':
        return this.AGGRESSIVE_POLICY; // Critical operations
      case 'LocationService':
        return this.DEFAULT_POLICY; // Standard operations
      case 'SceneService':
        return this.CONSERVATIVE_POLICY; // Less critical
      default:
        return this.DEFAULT_POLICY;
    }
  }

  /**
   * Execute operation with retry policy.
   *
   * Retries operation according to policy, handles circuit breaker,
   * and applies exponential backoff with jitter.
   *
   * Performance:
   * - Best case: O(1) - succeeds on first attempt
   * - Worst case: O(n) where n = maxAttempts
   * - Delays add latency only on failure
   *
   * @param fn Async operation to execute
   * @param policy Retry policy to use
   * @param serviceName Service name for circuit breaker tracking
   * @returns Promise resolving to operation result
   * @throws Error if all retries exhausted or circuit breaker open
   *
   * @example
   * ```typescript
   * const result = await RetryPolicyManager.executeWithPolicy(
   *   () => deviceService.listDevices(),
   *   RetryPolicyManager.AGGRESSIVE_POLICY,
   *   'DeviceService'
   * );
   * ```
   */
  static async executeWithPolicy<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy,
    serviceName?: string
  ): Promise<T> {
    let circuitBreaker: CircuitBreaker | undefined;

    // Get or create circuit breaker if enabled
    if (policy.enableCircuitBreaker && serviceName) {
      circuitBreaker = this.getCircuitBreaker(
        serviceName,
        policy.circuitBreakerThreshold ?? 5,
        policy.circuitBreakerTimeoutMs ?? 60000
      );
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      try {
        // Check circuit breaker
        if (circuitBreaker) {
          await circuitBreaker.allowRequest();
        }

        // Execute operation
        const result = await fn();

        // Record success
        if (circuitBreaker) {
          circuitBreaker.recordSuccess();
        }

        // Log retry success if not first attempt
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', { attempt, serviceName });
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure
        if (circuitBreaker) {
          const strategy = ErrorHandler.getRecoveryStrategy(lastError);
          if (strategy.shouldTriggerCircuitBreaker) {
            circuitBreaker.recordFailure();
          }
        }

        // Check if error is retryable
        if (!this.shouldRetry(lastError, policy)) {
          logger.debug('Error not retryable', {
            error: lastError.message,
            attempt,
            serviceName,
          });
          throw lastError;
        }

        // Don't retry if last attempt
        if (attempt >= policy.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt, policy);

        logger.debug('Retrying operation', {
          attempt,
          maxAttempts: policy.maxAttempts,
          delayMs: delay,
          error: lastError.message,
          serviceName,
        });

        // Wait before retry
        await this.delay(delay);
      }
    }

    // All retries exhausted
    throw new Error(`Operation failed after ${policy.maxAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Get circuit breaker status for service.
   *
   * @param serviceName Service name
   * @returns Circuit breaker status or undefined if not found
   */
  static getCircuitBreakerStatus(serviceName: string): CircuitBreakerStatus | undefined {
    return this.circuitBreakers.get(serviceName)?.getStatus();
  }

  /**
   * Reset circuit breaker for service.
   *
   * @param serviceName Service name
   */
  static resetCircuitBreaker(serviceName: string): void {
    this.circuitBreakers.get(serviceName)?.reset();
  }

  /**
   * Reset all circuit breakers.
   */
  static resetAllCircuitBreakers(): void {
    this.circuitBreakers.forEach((cb) => cb.reset());
  }

  /**
   * Get or create circuit breaker for service.
   */
  private static getCircuitBreaker(
    serviceName: string,
    threshold: number,
    timeoutMs: number
  ): CircuitBreaker {
    let circuitBreaker = this.circuitBreakers.get(serviceName);

    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker(threshold, timeoutMs);
      this.circuitBreakers.set(serviceName, circuitBreaker);
    }

    return circuitBreaker;
  }

  /**
   * Check if error should trigger retry.
   */
  private static shouldRetry(error: Error, policy: RetryPolicy): boolean {
    const recovery = ErrorHandler.getRecoveryStrategy(error);
    const category = ErrorHandler.classifyError(error);

    // Check category-based retry
    if (policy.retryableCategories.includes(category)) {
      return true;
    }

    // Check recovery strategy
    return recovery.shouldRetry;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter.
   */
  private static calculateDelay(attempt: number, policy: RetryPolicy): number {
    // Exponential backoff
    const exponentialDelay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, policy.maxDelayMs);

    // Add jitter (±jitterPercent%)
    const jitterRange = cappedDelay * (policy.jitterPercent / 100);
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;

    return Math.round(cappedDelay + jitter);
  }

  /**
   * Delay execution for specified milliseconds.
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
