/**
 * DeviceService - Device operations service with comprehensive error handling.
 *
 * Design Decision: Service wrapper pattern with error handling
 * Rationale: Implements IDeviceService interface by delegating to SmartThingsService.
 * This provides a clean service layer while maintaining compatibility with existing code.
 *
 * Architecture: Service Layer (Layer 3)
 * - Delegates to SmartThingsService for actual operations
 * - Provides interface implementation for dependency injection
 * - Wraps all operations with error handling and transformation
 * - Integrates with retry policies and circuit breaker
 * - Future: Will use PlatformRegistry for multi-platform support
 *
 * Error Handling Enhancement (1M-252):
 * - All operations wrapped with try/catch
 * - Errors transformed to DeviceServiceError with context
 * - Structured logging with operation parameters
 * - Error context includes service, operation, and parameters
 *
 * Trade-offs:
 * - Simplicity: Minimal changes to existing code
 * - Compatibility: No breaking changes to MCP tools
 * - Error Context: Rich debugging information
 * - Performance: <1% overhead for error handling
 *
 * Performance:
 * - Zero overhead: Direct delegation to existing service
 * - Error handling: <1ms overhead (error path only)
 * - Same performance characteristics as SmartThingsService
 *
 * Migration Path:
 * Phase 1 (Current): Delegate to SmartThingsService with error handling
 * Phase 2 (Future): Replace SmartThingsService with SmartThingsAdapter + PlatformRegistry
 *
 * @module services/DeviceService
 */

import type { IDeviceService } from './interfaces.js';
import type { SmartThingsService } from '../smartthings/client.js';
import type { DeviceId, DeviceInfo, DeviceStatus, RoomId } from '../types/smartthings.js';
import type {
  DeviceEventOptions,
  DeviceEventServiceOptions,
  DeviceEventResult,
} from '../types/device-events.js';
import { ErrorHandler } from './errors/ErrorHandler.js';
import logger from '../utils/logger.js';

/**
 * DeviceService implementation with error handling.
 *
 * Currently delegates to SmartThingsService. Future versions will use PlatformRegistry
 * for multi-platform support.
 *
 * Error Handling:
 * - All operations wrapped with error transformation
 * - Errors include service context (service, operation, parameters)
 * - Structured logging with error details
 * - Integration with retry policies via ServiceContainer
 *
 * @example
 * ```typescript
 * const deviceService = new DeviceService(smartThingsService);
 *
 * // List all devices (errors transformed automatically)
 * try {
 *   const devices = await deviceService.listDevices();
 * } catch (error) {
 *   // error is DeviceServiceError with full context
 *   console.error(error.service, error.operation, error.metadata);
 * }
 *
 * // Filter by room
 * const roomDevices = await deviceService.listDevices('room-123' as RoomId);
 *
 * // Execute command
 * await deviceService.executeCommand(
 *   'device-abc' as DeviceId,
 *   'switch',
 *   'on'
 * );
 * ```
 */
export class DeviceService implements IDeviceService {
  constructor(private readonly smartThingsService: SmartThingsService) {}

  /**
   * List all devices accessible with the current token.
   *
   * Error Handling:
   * - Network errors: Transformed to DeviceServiceError with NETWORK_ERROR code
   * - Authentication errors: Transformed with UNAUTHORIZED code
   * - All errors include service context and parameters
   *
   * @param roomId Optional room ID to filter devices by room
   * @returns Array of device information
   * @throws DeviceServiceError if API request fails
   */
  async listDevices(roomId?: RoomId): Promise<DeviceInfo[]> {
    try {
      logger.debug('DeviceService.listDevices', { roomId });
      return await this.smartThingsService.listDevices(roomId);
    } catch (error) {
      const serviceError = ErrorHandler.transformApiError(
        error as Error,
        'DeviceService',
        'listDevices',
        { roomId }
      );

      ErrorHandler.logError(serviceError, { operation: 'listDevices' });
      throw serviceError;
    }
  }

  /**
   * Get detailed status of a specific device.
   *
   * Error Handling:
   * - Device not found: Transformed to DeviceServiceError with NOT_FOUND code
   * - Network errors: Transformed with NETWORK_ERROR code
   * - Offline devices: Transformed with DEVICE_OFFLINE code
   *
   * @param deviceId Device UUID
   * @returns Device status with capability states
   * @throws DeviceServiceError if device not found or API request fails
   */
  async getDeviceStatus(deviceId: DeviceId): Promise<DeviceStatus> {
    try {
      logger.debug('DeviceService.getDeviceStatus', { deviceId });
      return await this.smartThingsService.getDeviceStatus(deviceId);
    } catch (error) {
      const serviceError = ErrorHandler.transformApiError(
        error as Error,
        'DeviceService',
        'getDeviceStatus',
        { deviceId }
      );

      ErrorHandler.logError(serviceError, { operation: 'getDeviceStatus' });
      throw serviceError;
    }
  }

  /**
   * Execute a command on a device.
   *
   * Error Handling:
   * - Invalid commands: Transformed to DeviceServiceError with INVALID_INPUT code
   * - Command execution failures: Transformed with COMMAND_FAILED code
   * - Device offline: Transformed with DEVICE_OFFLINE code
   * - Capability not supported: Transformed with CAPABILITY_NOT_SUPPORTED code
   *
   * @param deviceId Device UUID
   * @param capability Capability name (e.g., "switch")
   * @param command Command name (e.g., "on", "off")
   * @param args Optional command arguments
   * @throws DeviceServiceError if command execution fails
   */
  async executeCommand(
    deviceId: DeviceId,
    capability: string,
    command: string,
    args?: unknown[]
  ): Promise<void> {
    try {
      logger.debug('DeviceService.executeCommand', {
        deviceId,
        capability,
        command,
        args,
      });

      await this.smartThingsService.executeCommand(deviceId, capability, command, args);

      logger.info('Command executed successfully', {
        deviceId,
        capability,
        command,
      });
    } catch (error) {
      const serviceError = ErrorHandler.transformApiError(
        error as Error,
        'DeviceService',
        'executeCommand',
        { deviceId, capability, command, args }
      );

      ErrorHandler.logError(serviceError, { operation: 'executeCommand' });
      throw serviceError;
    }
  }

  /**
   * Get detailed information about a specific device.
   *
   * Error Handling:
   * - Device not found: Transformed to DeviceServiceError with NOT_FOUND code
   * - Network errors: Transformed with NETWORK_ERROR code
   *
   * @param deviceId Device UUID
   * @returns Device information
   * @throws DeviceServiceError if device not found
   */
  async getDevice(deviceId: DeviceId): Promise<DeviceInfo> {
    try {
      logger.debug('DeviceService.getDevice', { deviceId });
      return await this.smartThingsService.getDevice(deviceId);
    } catch (error) {
      const serviceError = ErrorHandler.transformApiError(
        error as Error,
        'DeviceService',
        'getDevice',
        { deviceId }
      );

      ErrorHandler.logError(serviceError, { operation: 'getDevice' });
      throw serviceError;
    }
  }

  /**
   * Get capabilities of a specific device.
   *
   * Error Handling:
   * - Device not found: Transformed to DeviceServiceError with NOT_FOUND code
   * - Network errors: Transformed with NETWORK_ERROR code
   *
   * @param deviceId Device UUID
   * @returns Array of capability names
   * @throws DeviceServiceError if device not found
   */
  async getDeviceCapabilities(deviceId: DeviceId): Promise<string[]> {
    try {
      logger.debug('DeviceService.getDeviceCapabilities', { deviceId });
      return await this.smartThingsService.getDeviceCapabilities(deviceId);
    } catch (error) {
      const serviceError = ErrorHandler.transformApiError(
        error as Error,
        'DeviceService',
        'getDeviceCapabilities',
        { deviceId }
      );

      ErrorHandler.logError(serviceError, { operation: 'getDeviceCapabilities' });
      throw serviceError;
    }
  }

  /**
   * Get device event history with filtering and metadata.
   *
   * Error Handling:
   * - Device not found: Transformed to DeviceServiceError with NOT_FOUND code
   * - Invalid time range: Transformed to DeviceServiceError with INVALID_INPUT code
   * - Network errors: Transformed with NETWORK_ERROR code
   * - Empty results: Returns valid DeviceEventResult with empty events array
   *
   * @param deviceId Device UUID to query events for
   * @param options Query options (time range, filters, limits)
   * @returns Event result with events, metadata, and summary
   * @throws DeviceServiceError if device not found or time range invalid
   *
   * @example
   * ```typescript
   * // Get last 24 hours of switch events
   * const result = await deviceService.getDeviceEvents(
   *   deviceId,
   *   {
   *     startTime: '24h',
   *     capabilities: ['switch'],
   *     includeMetadata: true
   *   }
   * );
   *
   * console.log(result.summary); // "Found 15 switch events in last 24 hours"
   * if (result.metadata.gapDetected) {
   *   console.log(`Detected ${result.metadata.gaps.length} gaps in event history`);
   * }
   * ```
   */
  async getDeviceEvents(
    deviceId: DeviceId,
    options: DeviceEventServiceOptions = {}
  ): Promise<DeviceEventResult> {
    try {
      logger.debug('DeviceService.getDeviceEvents', { deviceId, options });
      // Merge deviceId into options for SmartThingsService
      const fullOptions: DeviceEventOptions = { ...options, deviceId };
      const result = await this.smartThingsService.getDeviceEvents(deviceId, fullOptions);

      logger.info('Device events retrieved', {
        deviceId,
        eventCount: result.events.length,
        hasMore: result.metadata.hasMore,
        gapDetected: result.metadata.gapDetected,
      });

      return result;
    } catch (error) {
      const serviceError = ErrorHandler.transformApiError(
        error as Error,
        'DeviceService',
        'getDeviceEvents',
        { deviceId, options }
      );

      ErrorHandler.logError(serviceError, { operation: 'getDeviceEvents' });
      throw serviceError;
    }
  }
}
