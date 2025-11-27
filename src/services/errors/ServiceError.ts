/**
 * ServiceError - Service-specific error types for multi-service architecture.
 *
 * Design Decision: Service-aware error hierarchy with rich context
 * Rationale: Extends existing DeviceError system to support multi-service architecture.
 * - Service Context: Errors track which service and operation failed
 * - Error Propagation: Transforms platform errors into service errors
 * - Debugging: Rich metadata for troubleshooting multi-service issues
 * - Monitoring: Enables per-service error tracking and alerting
 *
 * Architecture: Service Layer Error Handling (Layer 3)
 * - Extends existing error types from types/errors.ts
 * - Adds service and operation context
 * - Supports error transformation from platform errors
 * - Integrates with retry policies and circuit breakers
 *
 * Trade-offs:
 * - Complexity: More error types vs. better debugging context
 * - Performance: Minimal overhead (<1% - error path only)
 * - Compatibility: Extends existing errors, maintains backward compatibility
 * - Monitoring: Enables granular error tracking per service
 *
 * Error Hierarchy:
 * DeviceError (base from types/errors.ts)
 *   └── ServiceError (service-aware wrapper)
 *       ├── DeviceServiceError
 *       ├── LocationServiceError
 *       └── SceneServiceError
 *
 * @module services/errors/ServiceError
 */

import {
  DeviceError,
  ErrorSeverity,
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
} from '../../types/errors.js';

/**
 * Service error codes for classification.
 *
 * Extends existing error codes with service-specific failures.
 */
export enum ServiceErrorCode {
  // Service-level errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  OPERATION_FAILED = 'OPERATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',

  // Configuration errors
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',

  // Platform errors
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  CAPABILITY_NOT_SUPPORTED = 'CAPABILITY_NOT_SUPPORTED',
  COMMAND_FAILED = 'COMMAND_FAILED',

  // Network/connectivity errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',

  // State management errors
  STATE_SYNC_ERROR = 'STATE_SYNC_ERROR',
  INVALID_STATE = 'INVALID_STATE',
}

/**
 * Service error metadata for debugging and monitoring.
 */
export interface ServiceErrorMetadata extends Record<string, unknown> {
  /** Service name that encountered the error */
  service: string;

  /** Operation that failed (e.g., 'listDevices', 'executeCommand') */
  operation: string;

  /** Timestamp when error occurred */
  timestamp: Date;

  /** Operation parameters (sanitized) */
  parameters?: Record<string, unknown>;

  /** Retry attempt number (if applicable) */
  retryAttempt?: number;

  /** Original platform error (if transformed) */
  cause?: Error;
}

/**
 * Base ServiceError class with service context.
 *
 * Wraps platform errors (DeviceError) with service-level context.
 * All service errors extend this class.
 *
 * Design Decision: Wrapper pattern vs. Multiple inheritance
 * Rationale: Extends DeviceError to maintain compatibility while adding service context.
 * This allows existing error handling code to work with service errors.
 *
 * @example
 * ```typescript
 * throw new ServiceError(
 *   ServiceErrorCode.OPERATION_FAILED,
 *   'DeviceService',
 *   'listDevices',
 *   'Failed to retrieve device list',
 *   originalError,
 *   { locationId: 'loc-123' }
 * );
 * ```
 */
export class ServiceError extends DeviceError {
  /** Service name that encountered the error */
  public readonly service: string;

  /** Operation that failed */
  public readonly operation: string;

  /** Timestamp when error occurred */
  public readonly timestamp: Date;

  /** Original error that caused this service error */
  public override readonly cause?: Error;

  /** Service error metadata */
  public readonly metadata: ServiceErrorMetadata;

  constructor(
    public readonly errorCode: ServiceErrorCode,
    service: string,
    operation: string,
    message: string,
    cause?: Error,
    parameters?: Record<string, unknown>
  ) {
    // Call DeviceError constructor with error code mapping
    super(message, errorCode, {
      service,
      operation,
      cause: cause?.message,
      parameters,
    });

    this.service = service;
    this.operation = operation;
    this.timestamp = new Date();
    this.cause = cause;

    this.metadata = {
      service,
      operation,
      timestamp: this.timestamp,
      parameters,
      cause,
    };

    this.name = 'ServiceError';
  }

  /**
   * Determine if error is retryable based on error code.
   */
  protected override determineRetryable(): boolean {
    // Delegate to cause if available
    if (this.cause && this.cause instanceof DeviceError) {
      return this.cause.isRetryable;
    }

    // Otherwise, determine from error code
    const retryableCodes = [
      ServiceErrorCode.NETWORK_ERROR,
      ServiceErrorCode.TIMEOUT,
      ServiceErrorCode.RATE_LIMITED,
      ServiceErrorCode.SERVICE_UNAVAILABLE,
      ServiceErrorCode.DEVICE_OFFLINE,
      ServiceErrorCode.STATE_SYNC_ERROR,
    ];

    return retryableCodes.includes(this.errorCode);
  }

  /**
   * Determine error severity based on error code.
   */
  protected override determineSeverity(): ErrorSeverity {
    // Delegate to cause if available
    if (this.cause && this.cause instanceof DeviceError) {
      return this.cause.severity;
    }

    // Map error codes to severity
    switch (this.errorCode) {
      case ServiceErrorCode.UNAUTHORIZED:
      case ServiceErrorCode.CONFIGURATION_ERROR:
      case ServiceErrorCode.DEPENDENCY_MISSING:
        return 'high';

      case ServiceErrorCode.SERVICE_UNAVAILABLE:
      case ServiceErrorCode.OPERATION_FAILED:
      case ServiceErrorCode.TIMEOUT:
      case ServiceErrorCode.RATE_LIMITED:
      case ServiceErrorCode.NETWORK_ERROR:
      case ServiceErrorCode.DEVICE_OFFLINE:
      case ServiceErrorCode.COMMAND_FAILED:
        return 'medium';

      case ServiceErrorCode.NOT_FOUND:
      case ServiceErrorCode.INVALID_INPUT:
      case ServiceErrorCode.CAPABILITY_NOT_SUPPORTED:
      case ServiceErrorCode.STATE_SYNC_ERROR:
      case ServiceErrorCode.INVALID_STATE:
      case ServiceErrorCode.PLATFORM_ERROR:
        return 'low';

      default:
        return 'medium';
    }
  }

  /**
   * Serialize error to JSON with service context.
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      service: this.service,
      operation: this.operation,
      timestamp: this.timestamp.toISOString(),
      errorCode: this.errorCode,
      cause: this.cause?.message,
      metadata: this.metadata,
    };
  }
}

/**
 * DeviceService-specific error.
 *
 * Thrown by DeviceService operations (listDevices, executeCommand, etc.)
 */
export class DeviceServiceError extends ServiceError {
  constructor(
    errorCode: ServiceErrorCode,
    operation: string,
    message: string,
    cause?: Error,
    parameters?: Record<string, unknown>
  ) {
    super(errorCode, 'DeviceService', operation, message, cause, parameters);
    this.name = 'DeviceServiceError';
  }
}

/**
 * LocationService-specific error.
 *
 * Thrown by LocationService operations (listLocations, getRooms, etc.)
 */
export class LocationServiceError extends ServiceError {
  constructor(
    errorCode: ServiceErrorCode,
    operation: string,
    message: string,
    cause?: Error,
    parameters?: Record<string, unknown>
  ) {
    super(errorCode, 'LocationService', operation, message, cause, parameters);
    this.name = 'LocationServiceError';
  }
}

/**
 * SceneService-specific error.
 *
 * Thrown by SceneService operations (listScenes, executeScene, etc.)
 */
export class SceneServiceError extends ServiceError {
  constructor(
    errorCode: ServiceErrorCode,
    operation: string,
    message: string,
    cause?: Error,
    parameters?: Record<string, unknown>
  ) {
    super(errorCode, 'SceneService', operation, message, cause, parameters);
    this.name = 'SceneServiceError';
  }
}

/**
 * Type guard to check if error is a ServiceError.
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Type guard to check if error is a DeviceServiceError.
 */
export function isDeviceServiceError(error: unknown): error is DeviceServiceError {
  return error instanceof DeviceServiceError;
}

/**
 * Type guard to check if error is a LocationServiceError.
 */
export function isLocationServiceError(error: unknown): error is LocationServiceError {
  return error instanceof LocationServiceError;
}

/**
 * Type guard to check if error is a SceneServiceError.
 */
export function isSceneServiceError(error: unknown): error is SceneServiceError {
  return error instanceof SceneServiceError;
}

/**
 * Create appropriate ServiceError from DeviceError.
 *
 * Helper function to transform platform errors into service errors.
 *
 * @param error Original error
 * @param service Service name
 * @param operation Operation name
 * @param parameters Optional operation parameters
 * @returns ServiceError with appropriate type
 */
export function createServiceError(
  error: Error,
  service: string,
  operation: string,
  parameters?: Record<string, unknown>
): ServiceError {
  // Map DeviceError types to ServiceErrorCode
  let errorCode = ServiceErrorCode.OPERATION_FAILED;

  if (error instanceof AuthenticationError) {
    errorCode = ServiceErrorCode.UNAUTHORIZED;
  } else if (error instanceof DeviceNotFoundError) {
    errorCode = ServiceErrorCode.NOT_FOUND;
  } else if (error instanceof NetworkError) {
    errorCode = ServiceErrorCode.NETWORK_ERROR;
  } else if (error instanceof RateLimitError) {
    errorCode = ServiceErrorCode.RATE_LIMITED;
  } else if (error instanceof TimeoutError) {
    errorCode = ServiceErrorCode.TIMEOUT;
  } else if (error instanceof CommandExecutionError) {
    errorCode = ServiceErrorCode.COMMAND_FAILED;
  } else if (error instanceof NotSupportedError) {
    errorCode = ServiceErrorCode.CAPABILITY_NOT_SUPPORTED;
  } else if (error instanceof ConfigurationError) {
    errorCode = ServiceErrorCode.CONFIGURATION_ERROR;
  } else if (error instanceof CapabilityNotSupportedError) {
    errorCode = ServiceErrorCode.CAPABILITY_NOT_SUPPORTED;
  } else if (error instanceof InvalidCommandError) {
    errorCode = ServiceErrorCode.INVALID_INPUT;
  } else if (error instanceof DeviceOfflineError) {
    errorCode = ServiceErrorCode.DEVICE_OFFLINE;
  } else if (error instanceof StateSyncError) {
    errorCode = ServiceErrorCode.STATE_SYNC_ERROR;
  }

  // Create service-specific error
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
