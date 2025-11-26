import logger from './logger.js';
import { API_CONSTANTS } from '../config/constants.js';

/**
 * Retry options configuration.
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

/**
 * Exponential backoff retry utility.
 *
 * Design Decision: Exponential backoff for API resilience
 * Rationale: Reduces load on failing services while maximizing success rate
 * for transient failures (network issues, rate limits).
 *
 * Performance:
 * - Time Complexity: O(n) where n = maxRetries
 * - Worst case delay: initialDelay * (multiplier ^ maxRetries)
 *
 * Error Handling:
 * - Retries on network errors and 5xx responses
 * - Immediate failure on 4xx client errors (no retry)
 * - Logs each retry attempt with backoff delay
 *
 * @param fn Function to retry
 * @param options Retry configuration
 * @returns Result of successful function execution
 * @throws Last error encountered after all retries exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = API_CONSTANTS.MAX_RETRIES,
    initialDelay = API_CONSTANTS.RETRY_DELAY,
    maxDelay = 30000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on final attempt
      if (attempt === maxRetries) {
        logger.error('All retry attempts exhausted', {
          error: lastError.message,
          attempts: attempt + 1,
        });
        break;
      }

      // Check if error is retryable (network errors, 5xx responses)
      if (!isRetryableError(lastError)) {
        logger.debug('Non-retryable error, failing immediately', {
          error: lastError.message,
        });
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay);

      logger.warn('Retry attempt scheduled', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Retry failed: no error details available');
}

/**
 * Determines if an error is retryable.
 *
 * Retryable errors:
 * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
 * - HTTP 5xx server errors
 * - HTTP 429 rate limit errors
 *
 * Non-retryable errors:
 * - HTTP 4xx client errors (except 429)
 * - Authentication failures
 * - Validation errors
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors
  if (
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('network')
  ) {
    return true;
  }

  // Check for rate limit errors (429)
  if (message.includes('429') || message.includes('rate limit')) {
    // Track rate limit hit for diagnostics
    import('../utils/diagnostic-tracker.js')
      .then(({ diagnosticTracker }) => {
        diagnosticTracker.recordRateLimitHit('unknown');
      })
      .catch(() => {
        // Ignore errors loading diagnostic tracker
      });
    return true;
  }

  // HTTP status codes (if present in error message)
  if (message.includes('status code')) {
    const statusMatch = message.match(/status code (\d+)/);
    if (statusMatch && statusMatch[1]) {
      const status = parseInt(statusMatch[1], 10);

      // Track rate limit hits
      if (status === 429) {
        import('../utils/diagnostic-tracker.js')
          .then(({ diagnosticTracker }) => {
            diagnosticTracker.recordRateLimitHit('unknown');
          })
          .catch(() => {
            // Ignore errors loading diagnostic tracker
          });
      }

      return status >= 500 || status === 429; // Retry on 5xx or rate limit
    }
  }

  return false;
}

/**
 * Sleep utility for async delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
