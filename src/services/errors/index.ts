/**
 * Service Error Handling Module
 *
 * Comprehensive error handling for multi-service architecture.
 *
 * Exports:
 * - ServiceError classes (DeviceServiceError, LocationServiceError, SceneServiceError)
 * - ErrorHandler utilities (error transformation, classification, recovery)
 * - RetryPolicy system (policies, circuit breaker, retry execution)
 *
 * @module services/errors
 */

// ServiceError types and utilities
export {
  ServiceError,
  ServiceErrorCode,
  DeviceServiceError,
  LocationServiceError,
  SceneServiceError,
  isServiceError,
  isDeviceServiceError,
  isLocationServiceError,
  isSceneServiceError,
  createServiceError,
} from './ServiceError.js';
export type { ServiceErrorMetadata } from './ServiceError.js';

// ErrorHandler utilities
export { ErrorHandler, ErrorCategory } from './ErrorHandler.js';
export type { RecoveryStrategy, ErrorContext } from './ErrorHandler.js';

// RetryPolicy system
export { RetryPolicyManager, CircuitState } from './RetryPolicy.js';
export type { RetryPolicy, CircuitBreakerStatus } from './RetryPolicy.js';
