/**
 * MCP Tool: get_device_events integration tests.
 *
 * Focused integration tests that validate key behaviors:
 * - Input validation errors
 * - Successful event retrieval
 * - Service error handling
 * - Response formatting
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  handleGetDeviceEvents,
  initializeDeviceEventTools,
} from '../device-events.js';
import type { ServiceContainer } from '../../../services/ServiceContainer.js';
import type { DeviceService } from '../../../services/DeviceService.js';
import type { DeviceInfo } from '../../../types/smartthings.js';
import { createDeviceId, createLocationId } from '../../../types/smartthings.js';
import type { DeviceEventResult, DeviceEvent } from '../../../types/device-events.js';

// Mock ServiceContainer
vi.mock('../../../services/ServiceContainer.js', () => ({
  serviceContainer: {
    getDeviceService: vi.fn(),
  },
}));

describe('handleGetDeviceEvents - Integration Tests', () => {
  let mockDeviceService: DeviceService;
  let mockServiceContainer: ServiceContainer;

  const VALID_DEVICE_ID = '12345678-1234-1234-1234-123456789abc';
  const VALID_LOCATION_ID = '87654321-4321-4321-4321-cba987654321';

  // Helper to create mock event
  const createMockEvent = (): DeviceEvent => ({
    deviceId: createDeviceId(VALID_DEVICE_ID),
    deviceName: 'Living Room Light',
    locationId: createLocationId(VALID_LOCATION_ID),
    time: '2025-11-27T12:00:00Z',
    epoch: 1732708800000,
    component: 'main',
    capability: 'switch' as any,
    attribute: 'switch',
    value: 'on',
    text: 'Switch turned on',
  });

  // Helper to create mock result
  const createMockResult = (eventCount: number = 1): DeviceEventResult => ({
    events: Array.from({ length: eventCount }, () => createMockEvent()),
    metadata: {
      totalCount: eventCount,
      hasMore: false,
      dateRange: {
        earliest: '2025-11-27T12:00:00Z',
        latest: '2025-11-27T12:00:00Z',
        durationMs: 0,
      },
      appliedFilters: {},
      gapDetected: false,
      largestGapMs: 0,
      reachedRetentionLimit: false,
    },
    summary: `Found ${eventCount} events`,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockDeviceService = {
      getDeviceEvents: vi.fn(),
      getDevice: vi.fn(),
      listDevices: vi.fn(),
      getDeviceStatus: vi.fn(),
      executeCommand: vi.fn(),
      getDeviceCapabilities: vi.fn(),
    } as unknown as DeviceService;

    mockServiceContainer = {
      getDeviceService: vi.fn().mockReturnValue(mockDeviceService),
    } as unknown as ServiceContainer;

    initializeDeviceEventTools(mockServiceContainer);

    // Default mock responses
    (mockDeviceService.getDevice as Mock).mockResolvedValue({
      deviceId: VALID_DEVICE_ID,
      name: 'Living Room Light',
      type: 'Light',
      capabilities: ['switch'],
      locationId: VALID_LOCATION_ID,
    } as DeviceInfo);
  });

  describe('Input Validation', () => {
    it('should reject missing deviceId', async () => {
      const result = await handleGetDeviceEvents({});

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText.toLowerCase()).toContain('error');
      // Error message contains validation error (exact format may vary)
    });

    it('should reject invalid deviceId format', async () => {
      const result = await handleGetDeviceEvents({
        deviceId: 'not-a-uuid',
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText.toLowerCase()).toContain('error');
      // Error message contains validation error (exact format may vary)
    });

    it('should reject limit exceeding maximum', async () => {
      const result = await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
        limit: 501,
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText.toLowerCase()).toContain('error');
      // Error message contains validation error (exact format may vary)
    });

    it('should accept valid UUID deviceId', async () => {
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(createMockResult());

      const result = await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText).not.toContain('Error (');
      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        VALID_DEVICE_ID,
        expect.any(Object)
      );
    });
  });

  describe('Successful Event Retrieval', () => {
    it('should return formatted event history', async () => {
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(createMockResult(5));

      const result = await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText).toContain('Event History');
      expect(responseText).toContain('Living Room Light');
      expect(responseText).toContain('Total Events: 5');
    });

    it('should pass all options to service', async () => {
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(createMockResult());

      await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
        limit: 50,
        oldestFirst: true,
        capabilities: ['switch'],
        attributes: ['switch'],
      });

      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        VALID_DEVICE_ID,
        expect.objectContaining({
          limit: 50,
          oldestFirst: true,
          capabilities: ['switch'],
          attributes: ['switch'],
        })
      );
    });

    it('should handle empty results gracefully', async () => {
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(createMockResult(0));

      const result = await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText).toContain('No events found');
    });

    it('should include gap warnings when detected', async () => {
      const resultWithGap: DeviceEventResult = {
        events: [createMockEvent()],
        metadata: {
          totalCount: 1,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T10:00:00Z',
            latest: '2025-11-27T12:00:00Z',
            durationMs: 7200000,
          },
          appliedFilters: {},
          gapDetected: true,
          largestGapMs: 7200000,
          reachedRetentionLimit: false,
        },
        summary: 'Found 1 event',
      };

      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(resultWithGap);

      const result = await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
        includeMetadata: true,
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText).toContain('Gap Detected');
      expect(responseText).toContain('Detected Gaps');
    });
  });

  describe('Error Handling', () => {
    it('should handle device not found', async () => {
      (mockDeviceService.getDevice as Mock).mockRejectedValue(new Error('Device not found'));

      const result = await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText).toContain('Error');
      expect(responseText.toLowerCase()).toContain('device not found');
    });

    it('should handle service errors', async () => {
      (mockDeviceService.getDeviceEvents as Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      const result = await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText).toContain('Error');
    });
  });

  describe('Response Formatting', () => {
    it('should use human-readable formatting by default', async () => {
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(createMockResult());

      const result = await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
      });

      const responseText = (result.content as any)[0]?.text || '';
      expect(responseText).toContain('📊'); // Emoji indicators
      expect(responseText).toContain('Event History');
    });

    it('should use default limit of 100', async () => {
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(createMockResult());

      await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
      });

      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        VALID_DEVICE_ID,
        expect.objectContaining({
          limit: 100,
        })
      );
    });

    it('should fetch device info for display name', async () => {
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(createMockResult());

      await handleGetDeviceEvents({
        deviceId: VALID_DEVICE_ID,
      });

      expect(mockDeviceService.getDevice).toHaveBeenCalledWith(VALID_DEVICE_ID);
    });
  });
});
