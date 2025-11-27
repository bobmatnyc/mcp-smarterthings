/**
 * ServiceProvider - Async service resolution with lazy loading.
 *
 * Design Decision: Provider pattern for async service management
 * Rationale: Provides flexible, async-first service resolution with:
 * - Lazy loading and async initialization
 * - Service caching for performance
 * - Graceful error handling
 * - Lifecycle management (dispose)
 *
 * Architecture: Provider Pattern (Layer 3.5)
 * - Async service resolution
 * - Lazy initialization on first access
 * - Service caching to avoid re-initialization
 * - Clean disposal for resource cleanup
 *
 * Trade-offs:
 * - Async API: All service access is async (more flexible but requires await)
 * - Caching: Services cached after first access (better performance, but uses memory)
 * - Error Handling: Errors propagated to caller (explicit failure handling required)
 * - Lifecycle: Manual disposal required for cleanup
 *
 * Use Cases:
 * 1. Async Initialization: Services that require async setup
 * 2. Lazy Loading: Defer service creation until needed
 * 3. Performance: Cache services to avoid repeated initialization
 * 4. Testing: Easy to inject mocks via factory function
 *
 * Performance:
 * - First access: O(1) service creation + caching
 * - Subsequent access: O(1) cache lookup
 * - Memory: O(n) where n = number of cached services
 *
 * @module services/ServiceProvider
 */

import type { IDeviceService, ILocationService, ISceneService } from './interfaces.js';
import type { ServiceMap, ServiceType } from './ServiceContainer.js';
import { ServiceFactory } from './ServiceFactory.js';
import type { SmartThingsService } from '../smartthings/client.js';

/**
 * Service factory function type for custom service creation.
 */
export type ServiceFactoryFn<T> = () => Promise<T> | T;

/**
 * ServiceProvider interface for async service resolution.
 *
 * Provides async methods for retrieving services with lazy loading
 * and caching support.
 */
export interface IServiceProvider {
  /**
   * Get a service instance by type.
   *
   * @param serviceType Service type identifier
   * @returns Promise resolving to service instance
   * @throws Error if service type is invalid or initialization fails
   */
  getService<T>(serviceType: ServiceType): Promise<T>;

  /**
   * Check if a service is available.
   *
   * @param serviceType Service type identifier
   * @returns True if service type is valid
   */
  hasService(serviceType: ServiceType): boolean;

  /**
   * Get all available services.
   *
   * @returns Promise resolving to service map
   */
  getAllServices(): Promise<ServiceMap>;

  /**
   * Dispose all services and cleanup resources.
   *
   * @returns Promise that resolves when cleanup complete
   */
  dispose(): Promise<void>;

  /**
   * Check if provider has been disposed.
   *
   * @returns True if dispose() has been called
   */
  isDisposed(): boolean;
}

/**
 * ServiceProvider implementation with lazy loading and caching.
 *
 * Provides async service resolution with automatic caching to improve
 * performance. Services are created on first access and reused.
 *
 * @example
 * ```typescript
 * // Create provider
 * const provider = new ServiceProvider(smartThingsService);
 *
 * // Get service asynchronously
 * const deviceService = await provider.getService<IDeviceService>('device');
 * const devices = await deviceService.listDevices();
 *
 * // Check service availability
 * if (provider.hasService('scene')) {
 *   const sceneService = await provider.getService<ISceneService>('scene');
 * }
 *
 * // Cleanup when done
 * await provider.dispose();
 * ```
 */
export class ServiceProvider implements IServiceProvider {
  private readonly serviceCache = new Map<ServiceType, unknown>();
  private disposed = false;

  /**
   * Create a new ServiceProvider.
   *
   * @param smartThingsService SmartThingsService instance for operations
   */
  constructor(private readonly smartThingsService: SmartThingsService) {}

  /**
   * Get a service instance by type.
   *
   * Lazily creates and caches service on first access.
   * Subsequent calls return cached instance.
   *
   * Performance:
   * - First call: O(1) service creation + cache insertion
   * - Subsequent calls: O(1) cache lookup
   *
   * @param serviceType Service type identifier
   * @returns Promise resolving to service instance
   * @throws Error if provider disposed or service type invalid
   *
   * @example
   * ```typescript
   * const deviceService = await provider.getService<IDeviceService>('device');
   * const locationService = await provider.getService<ILocationService>('location');
   * ```
   */
  async getService<T>(serviceType: ServiceType): Promise<T> {
    this.assertNotDisposed();

    // Check cache first
    if (this.serviceCache.has(serviceType)) {
      return this.serviceCache.get(serviceType) as T;
    }

    // Create service using factory
    const service = await this.createService(serviceType);
    this.serviceCache.set(serviceType, service);

    return service as T;
  }

  /**
   * Check if a service type is valid.
   *
   * @param serviceType Service type identifier
   * @returns True if service type is valid
   */
  hasService(serviceType: ServiceType): boolean {
    return serviceType === 'device' || serviceType === 'location' || serviceType === 'scene';
  }

  /**
   * Get all available services.
   *
   * Creates all services if not already cached.
   * Useful for batch initialization.
   *
   * Performance: O(n) where n = number of uncached services
   *
   * @returns Promise resolving to service map
   * @throws Error if provider disposed or service creation fails
   *
   * @example
   * ```typescript
   * const services = await provider.getAllServices();
   * const { deviceService, locationService, sceneService } = services;
   * ```
   */
  async getAllServices(): Promise<ServiceMap> {
    this.assertNotDisposed();

    return {
      deviceService: await this.getService<IDeviceService>('device'),
      locationService: await this.getService<ILocationService>('location'),
      sceneService: await this.getService<ISceneService>('scene'),
    };
  }

  /**
   * Dispose all services and cleanup resources.
   *
   * Clears service cache and prevents further service access.
   * Idempotent - safe to call multiple times.
   *
   * @returns Promise that resolves when cleanup complete
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.serviceCache.clear();
    this.disposed = true;
  }

  /**
   * Check if provider has been disposed.
   *
   * @returns True if dispose() has been called
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Create a service instance by type.
   *
   * Internal factory method for creating services.
   *
   * @param serviceType Service type identifier
   * @returns Promise resolving to service instance
   * @throws Error if service type is invalid
   */
  private async createService(
    serviceType: ServiceType
  ): Promise<IDeviceService | ILocationService | ISceneService> {
    switch (serviceType) {
      case 'device':
        return ServiceFactory.createDeviceService(this.smartThingsService);
      case 'location':
        return ServiceFactory.createLocationService(this.smartThingsService);
      case 'scene':
        return ServiceFactory.createSceneService(this.smartThingsService);
      default:
        throw new Error(`Unknown service type: ${serviceType}`);
    }
  }

  /**
   * Assert that provider has not been disposed.
   *
   * @throws Error if provider has been disposed
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('ServiceProvider has been disposed');
    }
  }
}

/**
 * CustomServiceProvider - Service provider with custom factory functions.
 *
 * Advanced provider that allows custom service creation logic.
 * Useful for testing or custom service implementations.
 *
 * @example
 * ```typescript
 * // Create provider with custom factories
 * const provider = new CustomServiceProvider({
 *   device: async () => new CustomDeviceService(),
 *   location: async () => new CustomLocationService(),
 *   scene: async () => new CustomSceneService(),
 * });
 *
 * const deviceService = await provider.getService<IDeviceService>('device');
 * ```
 */
export class CustomServiceProvider implements IServiceProvider {
  private readonly serviceCache = new Map<ServiceType, unknown>();
  private disposed = false;

  /**
   * Create a CustomServiceProvider.
   *
   * @param factories Map of service type to factory function
   */
  constructor(private readonly factories: Record<ServiceType, ServiceFactoryFn<unknown>>) {}

  /**
   * Get a service instance by type.
   *
   * Uses custom factory function to create service.
   * Caches result for subsequent calls.
   *
   * @param serviceType Service type identifier
   * @returns Promise resolving to service instance
   * @throws Error if provider disposed or factory fails
   */
  async getService<T>(serviceType: ServiceType): Promise<T> {
    this.assertNotDisposed();

    // Check cache first
    if (this.serviceCache.has(serviceType)) {
      return this.serviceCache.get(serviceType) as T;
    }

    // Create service using custom factory
    const factory = this.factories[serviceType];
    if (!factory) {
      throw new Error(`No factory registered for service type: ${serviceType}`);
    }

    const service = await factory();
    this.serviceCache.set(serviceType, service);

    return service as T;
  }

  /**
   * Check if a service factory is registered.
   *
   * @param serviceType Service type identifier
   * @returns True if factory is registered
   */
  hasService(serviceType: ServiceType): boolean {
    return serviceType in this.factories;
  }

  /**
   * Get all available services.
   *
   * @returns Promise resolving to service map
   */
  async getAllServices(): Promise<ServiceMap> {
    this.assertNotDisposed();

    return {
      deviceService: await this.getService<IDeviceService>('device'),
      locationService: await this.getService<ILocationService>('location'),
      sceneService: await this.getService<ISceneService>('scene'),
    };
  }

  /**
   * Dispose all services and cleanup resources.
   *
   * @returns Promise that resolves when cleanup complete
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.serviceCache.clear();
    this.disposed = true;
  }

  /**
   * Check if provider has been disposed.
   *
   * @returns True if dispose() has been called
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Assert that provider has not been disposed.
   *
   * @throws Error if provider has been disposed
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('CustomServiceProvider has been disposed');
    }
  }
}
