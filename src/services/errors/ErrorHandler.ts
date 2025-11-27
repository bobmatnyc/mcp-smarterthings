/**
 * ErrorHandler - Centralized error handling utilities for services.
 *
 * Design Decision: Utility class pattern for error transformation and recovery
 * Rationale: Provides reusable error handling logic across all services:
 * - Error Classification: Categorize errors by type and severity
 * - Error Transformation: Convert platform errors to ServiceErrors
 * - Recovery Strategies: Determine how to handle each error type
 * - Retry Logic: Decide if/how to retry operations
 *
 * Architecture: Error Handling Utilities (Layer 3.5)
 * - Stateless utility functions
 * - Integrates with existing DeviceError hierarchy
 * - Works with RetryPolicy system
 * - Provides structured error context
 *
 * Trade-offs:
 * - Simplicity: Pure functions, easy to test
 * - Reusability: Generic patterns applicable across services
 * - Extensibility: Easy to add new error types and recovery strategies
 * - Performance: Minimal overhead (< 1ms per error)
 *
 * Use Cases:
 * 1. Transform platform errors to service errors
 * 2. Classify errors for appropriate handling
 * 3. Determine retry strategies
 * 4. Extract error context for logging
 *
 * @module services/errors/ErrorHandler
 */

import {
  DeviceError,
  AuthenticationError,
  DeviceNotFoundError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  CommandExecutionError,
  NotSupportedError,
  ConfigurationError,
  CapabilityNotSupportedError,
  InvalidCommandError,
  DeviceOfflineError,
  StateSyncError,
  isRetryableError,
} from '../../types/errors.js';

import {
  ServiceError,
  ServiceErrorCode,
  DeviceServiceError,
  LocationServiceError,
  SceneServiceError,
  createServiceError,
  isServiceError,
} from './ServiceError.js';

import logger from '../../utils/logger.js';

/**
 * Error classification categories.
 *
 * Used for routing errors to appropriate handlers.
 */
export enum ErrorCategory {
  /** Transient errors that should be retried */
  TRANSIENT = 'TRANSIENT',

  /** Permanent errors that won't succeed on retry */
  PERMANENT = 'PERMANENT',

  /** Configuration errors requiring manual intervention */
  CONFIGURATION = 'CONFIGURATION',

  /** Authentication/authorization errors */
  AUTHENTICATION = 'AUTHENTICATION',

  /** Input validation errors */
  VALIDATION = 'VALIDATION',

  /** Resource not found errors */
  NOT_FOUND = 'NOT_FOUND',

  /** Rate limiting errors */
  RATE_LIMIT = 'RATE_LIMIT',

  /** Unknown/unclassified errors */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Error recovery strategy.
 *
 * Defines how to handle an error.
 */
export interface RecoveryStrategy {
  /** Should retry the operation */
  shouldRetry: boolean;

  /** Suggested delay before retry (ms) */
  retryDelayMs?: number;

  /** Maximum retry attempts */
  maxRetries?: number;

  /** Should use exponential backoff */
  useExponentialBackoff: boolean;

  /** Should circuit breaker be triggered */
  shouldTriggerCircuitBreaker: boolean;

  /** User-friendly error message */
  userMessage: string;

  /** Recovery action suggestion */
  recoveryAction?: string;
}

/**
 * Error context for structured logging.
 */
export interface ErrorContext {
  /** Error category */
  category: ErrorCategory;

  /** Is error retryable */
  isRetryable: boolean;

  /** Error severity */
  severity: string;

  /** Service that encountered error */
  service?: string;

  /** Operation that failed */
  operation?: string;

  /** Error code */
  code?: string;

  /** Original error message */
  message: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * ErrorHandler - Centralized error handling utilities.
 *
 * Provides stateless functions for error classification, transformation,
 * and recovery strategy determination.
 */
export class ErrorHandler {
  /**
   * Transform any error to a ServiceError.
   *
   * Converts platform errors (DeviceError) and generic errors into
   * ServiceError instances with appropriate service context.
   *
   * Performance: O(1) - simple type checking and object creation
   *
   * @param error Original error
   * @param service Service name
   * @param operation Operation name
   * @param parameters Optional operation parameters
   * @returns ServiceError with appropriate type and context
   *
   * @example
   * ```typescript
   * try {
   *   await someOperation();
   * } catch (error) {
   *   throw ErrorHandler.transformApiError(
   *     error as Error,
   *     'DeviceService',
   *     'listDevices',
   *     { locationId }
   *   );
   * }
   * ```
   */
  static transformApiError(
    error: Error,
    service: string,
    operation: string,
    parameters?: Record<string, unknown>
  ): ServiceError {
    // If already a ServiceError, return as-is
    if (isServiceError(error)) {
      return error;
    }

    // If DeviceError, use createServiceError helper
    if (error instanceof DeviceError) {
      return createServiceError(error, service, operation, parameters);
    }

    // Generic error - classify and wrap
    const errorCode = this.classifyGenericError(error);

    switch (service) {
      case 'DeviceService':
        return new DeviceServiceError(errorCode, operation, error.message, error, parameters);
      case 'LocationService':
        return new LocationServiceError(errorCode, operation, error.message, error, parameters);
      case 'SceneService':
        return new SceneServiceError(errorCode, operation, error.message, error, parameters);
      default:
        return new ServiceError(errorCode, service, operation, error.message, error, parameters);
    }
  }

  /**
   * Classify error into category.
   *
   * Determines error category for routing to appropriate handlers.
   *
   * @param error Error to classify
   * @returns Error category
   */
  static classifyError(error: Error): ErrorCategory {
    if (error instanceof AuthenticationError) {
      return ErrorCategory.AUTHENTICATION;
    }

    if (error instanceof ConfigurationError) {
      return ErrorCategory.CONFIGURATION;
    }

    if (error instanceof DeviceNotFoundError) {
      return ErrorCategory.NOT_FOUND;
    }

    if (error instanceof RateLimitError) {
      return ErrorCategory.RATE_LIMIT;
    }

    if (error instanceof InvalidCommandError || error instanceof CapabilityNotSupportedError) {
      return ErrorCategory.VALIDATION;
    }

    if (
      error instanceof NetworkError ||
      error instanceof TimeoutError ||
      error instanceof DeviceOfflineError ||
      error instanceof StateSyncError
    ) {
      return ErrorCategory.TRANSIENT;
    }

    if (error instanceof CommandExecutionError || error instanceof NotSupportedError) {
      return ErrorCategory.PERMANENT;
    }

    if (isServiceError(error)) {
      return this.classifyServiceError(error);
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Check if error is retryable.
   *
   * Determines if operation should be retried based on error type.
   *
   * @param error Error to check
   * @returns True if error is retryable
   */
  static isRetryable(error: Error): boolean {
    // Use existing type guard if DeviceError
    if (error instanceof DeviceError) {
      return isRetryableError(error);
    }

    // ServiceError delegates to cause
    if (isServiceError(error)) {
      return error.isRetryable;
    }

    // Unknown errors are not retryable by default
    return false;
  }

  /**
   * Get recovery strategy for error.
   *
   * Determines how to handle an error based on its type and context.
   *
   * @param error Error that occurred
   * @returns Recovery strategy
   *
   * @example
   * ```typescript
   * const strategy = ErrorHandler.getRecoveryStrategy(error);
   * if (strategy.shouldRetry) {
   *   await delay(strategy.retryDelayMs);
   *   return retry();
   * }
   * ```
   */
  static getRecoveryStrategy(error: Error): RecoveryStrategy {
    const category = this.classifyError(error);
    const isRetryable = this.isRetryable(error);

    // Base strategy
    const strategy: RecoveryStrategy = {
      shouldRetry: isRetryable,
      useExponentialBackoff: false,
      shouldTriggerCircuitBreaker: false,
      userMessage: error.message,
    };

    // Customize by category
    switch (category) {
      case ErrorCategory.TRANSIENT:
        strategy.shouldRetry = true;
        strategy.maxRetries = 3;
        strategy.retryDelayMs = 1000;
        strategy.useExponentialBackoff = true;
        strategy.userMessage = 'Temporary issue - retrying operation';
        break;

      case ErrorCategory.RATE_LIMIT:
        strategy.shouldRetry = true;
        strategy.maxRetries = 2;
        strategy.retryDelayMs = (error as RateLimitError).retryAfter
          ? (error as RateLimitError).retryAfter! * 1000
          : 5000;
        strategy.useExponentialBackoff = false;
        strategy.shouldTriggerCircuitBreaker = true;
        strategy.userMessage = 'Rate limit exceeded - waiting before retry';
        break;

      case ErrorCategory.AUTHENTICATION:
        strategy.shouldRetry = false;
        strategy.shouldTriggerCircuitBreaker = true;
        strategy.userMessage = 'Authentication failed - check credentials';
        strategy.recoveryAction = 'Verify API token is valid and not expired';
        break;

      case ErrorCategory.CONFIGURATION:
        strategy.shouldRetry = false;
        strategy.shouldTriggerCircuitBreaker = true;
        strategy.userMessage = 'Configuration error - manual intervention required';
        strategy.recoveryAction = 'Check service configuration';
        break;

      case ErrorCategory.VALIDATION:
        strategy.shouldRetry = false;
        strategy.userMessage = 'Invalid input - check parameters';
        strategy.recoveryAction = 'Verify operation parameters are correct';
        break;

      case ErrorCategory.NOT_FOUND:
        strategy.shouldRetry = false;
        strategy.userMessage = 'Resource not found';
        strategy.recoveryAction = 'Verify resource ID is correct';
        break;

      case ErrorCategory.PERMANENT:
        strategy.shouldRetry = false;
        strategy.userMessage = 'Operation failed - not retryable';
        break;

      case ErrorCategory.UNKNOWN:
        strategy.shouldRetry = false;
        strategy.maxRetries = 1;
        strategy.retryDelayMs = 1000;
        strategy.userMessage = 'Unknown error occurred';
        strategy.recoveryAction = 'Check logs for details';
        break;
    }

    return strategy;
  }

  /**
   * Extract structured error context for logging.
   *
   * Extracts all relevant information from error for structured logging.
   *
   * @param error Error to extract context from
   * @returns Structured error context
   */
  static extractErrorContext(error: Error): ErrorContext {
    const context: ErrorContext = {
      category: this.classifyError(error),
      isRetryable: this.isRetryable(error),
      severity: error instanceof DeviceError ? error.severity : 'medium',
      message: error.message,
    };

    // Add ServiceError-specific context
    if (isServiceError(error)) {
      context.service = error.service;
      context.operation = error.operation;
      context.code = error.errorCode;
      context.metadata = error.metadata;
    }

    // Add DeviceError-specific context
    if (error instanceof DeviceError) {
      context.code = error.code;
      context.metadata = error.context;
    }

    return context;
  }

  /**
   * Log error with appropriate level and context.
   *
   * Logs error using structured context based on severity.
   *
   * @param error Error to log
   * @param additionalContext Optional additional context
   */
  static logError(error: Error, additionalContext?: Record<string, unknown>): void {
    const context = this.extractErrorContext(error);
    const logContext = { ...context, ...additionalContext };

    // Determine log level from severity
    const severity = context.severity;
    if (severity === 'critical' || severity === 'high') {
      logger.error('Service error', logContext);
    } else if (severity === 'medium') {
      logger.warn('Service error', logContext);
    } else {
      logger.info('Service error', logContext);
    }
  }

  /**
   * Classify generic error to ServiceErrorCode.
   *
   * Maps generic errors to appropriate error codes.
   *
   * @param error Generic error
   * @returns Service error code
   */
  private static classifyGenericError(error: Error): ServiceErrorCode {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('econnrefused')) {
      return ServiceErrorCode.NETWORK_ERROR;
    }

    if (message.includes('timeout')) {
      return ServiceErrorCode.TIMEOUT;
    }

    if (message.includes('not found') || message.includes('404')) {
      return ServiceErrorCode.NOT_FOUND;
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return ServiceErrorCode.UNAUTHORIZED;
    }

    if (message.includes('rate limit') || message.includes('429')) {
      return ServiceErrorCode.RATE_LIMITED;
    }

    if (message.includes('invalid') || message.includes('validation')) {
      return ServiceErrorCode.INVALID_INPUT;
    }

    if (message.includes('configuration') || message.includes('config')) {
      return ServiceErrorCode.CONFIGURATION_ERROR;
    }

    return ServiceErrorCode.OPERATION_FAILED;
  }

  /**
   * Classify ServiceError to category.
   *
   * @param error ServiceError to classify
   * @returns Error category
   */
  private static classifyServiceError(error: ServiceError): ErrorCategory {
    switch (error.errorCode) {
      case ServiceErrorCode.UNAUTHORIZED:
        return ErrorCategory.AUTHENTICATION;

      case ServiceErrorCode.CONFIGURATION_ERROR:
      case ServiceErrorCode.DEPENDENCY_MISSING:
        return ErrorCategory.CONFIGURATION;

      case ServiceErrorCode.NOT_FOUND:
        return ErrorCategory.NOT_FOUND;

      case ServiceErrorCode.RATE_LIMITED:
        return ErrorCategory.RATE_LIMIT;

      case ServiceErrorCode.INVALID_INPUT:
      case ServiceErrorCode.CAPABILITY_NOT_SUPPORTED:
        return ErrorCategory.VALIDATION;

      case ServiceErrorCode.NETWORK_ERROR:
      case ServiceErrorCode.TIMEOUT:
      case ServiceErrorCode.DEVICE_OFFLINE:
      case ServiceErrorCode.STATE_SYNC_ERROR:
      case ServiceErrorCode.SERVICE_UNAVAILABLE:
        return ErrorCategory.TRANSIENT;

      case ServiceErrorCode.OPERATION_FAILED:
      case ServiceErrorCode.COMMAND_FAILED:
      case ServiceErrorCode.PLATFORM_ERROR:
      case ServiceErrorCode.INVALID_STATE:
        return ErrorCategory.PERMANENT;

      default:
        return ErrorCategory.UNKNOWN;
    }
  }
}
