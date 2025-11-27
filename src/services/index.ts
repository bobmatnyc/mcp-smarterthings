/**
 * Service Layer - Public API exports.
 *
 * This module exports all service-related components for the application.
 * Provides a centralized export point for dependency injection, service management,
 * and orchestration utilities.
 *
 * @module services
 */

// Core service interfaces
export type {
  IDeviceService,
  ILocationService,
  ISceneService,
  ISmartThingsService,
} from './interfaces.js';

// Service implementations
export { DeviceService } from './DeviceService.js';
export { LocationService } from './LocationService.js';
export { SceneService } from './SceneService.js';

// Service container and DI
export {
  ServiceContainer,
  type ServiceType,
  type ServiceMap,
  type ServiceHealth,
  type ContainerHealth,
} from './ServiceContainer.js';

// Service factory
export { ServiceFactory } from './ServiceFactory.js';

// Service provider
export {
  ServiceProvider,
  CustomServiceProvider,
  type IServiceProvider,
  type ServiceFactoryFn,
} from './ServiceProvider.js';

// Composition utilities
export {
  CompositionUtils,
  type ServiceOperationResult,
  type RetryOptions,
  type ParallelOptions,
} from './CompositionUtils.js';
