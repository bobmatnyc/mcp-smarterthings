/**
 * ServiceFactory - Factory functions for service instantiation.
 *
 * Design Decision: Factory pattern for service creation
 * Rationale: Provides centralized, consistent service creation with:
 * - Type-safe factory methods for each service
 * - Pre-configured service instances
 * - Easy testing with mock support
 * - Separation of creation logic from business logic
 *
 * Architecture: Factory Pattern (Layer 3.5)
 * - Encapsulates service instantiation logic
 * - Enables dependency injection
 * - Supports both production and test scenarios
 * - Works alongside ServiceContainer for flexibility
 *
 * Trade-offs:
 * - Simplicity: Clean API for service creation
 * - Testability: Easy to create services with mocks
 * - Flexibility: Can create services without container
 * - Consistency: Ensures services created correctly
 *
 * Use Cases:
 * 1. Production: Create pre-configured service instances
 * 2. Testing: Create services with mock dependencies
 * 3. Composition: Build custom service combinations
 * 4. Migration: Gradually adopt new service patterns
 *
 * @module services/ServiceFactory
 */

import type { IDeviceService, ILocationService, ISceneService } from './interfaces.js';
import { DeviceService } from './DeviceService.js';
import { LocationService } from './LocationService.js';
import { SceneService } from './SceneService.js';
import type { SmartThingsService } from '../smartthings/client.js';
import type { ServiceMap } from './ServiceContainer.js';

/**
 * ServiceFactory - Static factory methods for service creation.
 *
 * Provides type-safe factory methods for instantiating services with
 * proper dependency injection. Supports both production and testing scenarios.
 *
 * @example
 * ```typescript
 * // Production: Create services with real dependencies
 * import { smartThingsService } from '../smartthings/client.js';
 * const deviceService = ServiceFactory.createDeviceService(smartThingsService);
 * const devices = await deviceService.listDevices();
 *
 * // Testing: Create services with mocks
 * const mockService = createMock<SmartThingsService>();
 * const deviceService = ServiceFactory.createDeviceService(mockService);
 *
 * // Batch creation: Create all services at once
 * const services = ServiceFactory.createAllServices(smartThingsService);
 * const { deviceService, locationService, sceneService } = services;
 * ```
 */
export class ServiceFactory {
  /**
   * Create a DeviceService instance.
   *
   * Factory method for creating properly configured DeviceService instances.
   * Injects SmartThingsService dependency for device operations.
   *
   * Dependencies:
   * - SmartThingsService: For device API operations
   *
   * @param smartThingsService SmartThingsService instance for operations
   * @returns Configured IDeviceService implementation
   *
   * @example
   * ```typescript
   * const deviceService = ServiceFactory.createDeviceService(smartThingsService);
   * const devices = await deviceService.listDevices();
   * ```
   */
  static createDeviceService(smartThingsService: SmartThingsService): IDeviceService {
    return new DeviceService(smartThingsService);
  }

  /**
   * Create a LocationService instance.
   *
   * Factory method for creating properly configured LocationService instances.
   * Injects SmartThingsService dependency for location/room operations.
   *
   * Dependencies:
   * - SmartThingsService: For location/room API operations
   *
   * @param smartThingsService SmartThingsService instance for operations
   * @returns Configured ILocationService implementation
   *
   * @example
   * ```typescript
   * const locationService = ServiceFactory.createLocationService(smartThingsService);
   * const locations = await locationService.listLocations();
   * ```
   */
  static createLocationService(smartThingsService: SmartThingsService): ILocationService {
    return new LocationService(smartThingsService);
  }

  /**
   * Create a SceneService instance.
   *
   * Factory method for creating properly configured SceneService instances.
   * Injects SmartThingsService dependency for scene operations.
   *
   * Dependencies:
   * - SmartThingsService: For scene API operations
   *
   * @param smartThingsService SmartThingsService instance for operations
   * @returns Configured ISceneService implementation
   *
   * @example
   * ```typescript
   * const sceneService = ServiceFactory.createSceneService(smartThingsService);
   * const scenes = await sceneService.listScenes();
   * ```
   */
  static createSceneService(smartThingsService: SmartThingsService): ISceneService {
    return new SceneService(smartThingsService);
  }

  /**
   * Create all services in a single call.
   *
   * Convenience factory method for creating all services at once with
   * the same SmartThingsService dependency. Useful for batch initialization
   * or testing scenarios.
   *
   * Performance: O(1) - Creates three service instances
   * Memory: Allocates three service objects
   *
   * @param smartThingsService SmartThingsService instance for operations
   * @returns Object containing all service instances
   *
   * @example
   * ```typescript
   * // Create all services at once
   * const services = ServiceFactory.createAllServices(smartThingsService);
   * const devices = await services.deviceService.listDevices();
   * const locations = await services.locationService.listLocations();
   * const scenes = await services.sceneService.listScenes();
   * ```
   */
  static createAllServices(smartThingsService: SmartThingsService): ServiceMap {
    return {
      deviceService: this.createDeviceService(smartThingsService),
      locationService: this.createLocationService(smartThingsService),
      sceneService: this.createSceneService(smartThingsService),
    };
  }

  /**
   * Create services with optional mock support for testing.
   *
   * Advanced factory method that allows selective mocking of services
   * for testing. Unmocked services use the provided SmartThingsService.
   *
   * @param smartThingsService SmartThingsService instance for real services
   * @param mocks Optional mock service implementations
   * @returns ServiceMap with real or mocked services
   *
   * @example
   * ```typescript
   * // Mock only DeviceService for testing
   * const mockDevice = createMock<IDeviceService>();
   * const services = ServiceFactory.createServicesWithMocks(
   *   smartThingsService,
   *   { deviceService: mockDevice }
   * );
   *
   * // deviceService is mocked, others are real
   * const devices = await services.deviceService.listDevices(); // Mock
   * const locations = await services.locationService.listLocations(); // Real
   * ```
   */
  static createServicesWithMocks(
    smartThingsService: SmartThingsService,
    mocks?: Partial<ServiceMap>
  ): ServiceMap {
    return {
      deviceService: mocks?.deviceService ?? this.createDeviceService(smartThingsService),
      locationService: mocks?.locationService ?? this.createLocationService(smartThingsService),
      sceneService: mocks?.sceneService ?? this.createSceneService(smartThingsService),
    };
  }
}
