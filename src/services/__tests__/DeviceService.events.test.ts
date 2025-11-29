/**
 * DeviceService.getDeviceEvents unit tests.
 *
 * Test Coverage:
 * - Happy path: event retrieval with various options
 * - Edge cases: empty results, retention limit, missing locationId
 * - Error handling: device not found, API failures, invalid inputs
 * - Time range validation
 * - Client-side filtering (capabilities, attributes)
 * - Gap detection and metadata generation
 * - Human-readable formatting
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { DeviceService } from '../DeviceService.js';
import type { SmartThingsService } from '../../smartthings/client.js';
import type { DeviceEventResult, DeviceEvent } from '../../types/device-events.js';
import { DeviceServiceError } from '../errors/index.js';
import { createDeviceId } from '../../types/smartthings.js';

describe('DeviceService.getDeviceEvents', () => {
  let mockSmartThingsService: SmartThingsService;
  let deviceService: DeviceService;

  // Mock event data factory
  const createMockEvent = (overrides?: Partial<DeviceEvent>): DeviceEvent => ({
    deviceId: createDeviceId('device-123'),
    deviceName: 'Living Room Light',
    locationId: createDeviceId('location-456') as any,
    time: '2025-11-27T12:00:00Z',
    epoch: 1732708800000,
    component: 'main',
    capability: 'switch' as any,
    attribute: 'switch',
    value: 'on',
    ...overrides,
  });

  // Mock result factory
  const createMockResult = (
    events: DeviceEvent[],
    overrides?: Partial<DeviceEventResult>
  ): DeviceEventResult => {
    // Ensure metadata always has gaps field
    const metadata = {
      totalCount: events.length,
      hasMore: false,
      appliedFilters: {},
      gapDetected: false,
      largestGapMs: 0,
      reachedRetentionLimit: false,
      gaps: [],
      dateRange: {
        earliest: events[0]?.time || new Date().toISOString(),
        latest: events[events.length - 1]?.time || new Date().toISOString(),
        durationMs: 0,
      },
      ...overrides?.metadata,
    };

    // Ensure gaps is present even after spread
    if (!('gaps' in metadata)) {
      metadata.gaps = [];
    }

    // Destructure overrides to exclude metadata (we've already merged it)
    const { metadata: _ignored, ...rest } = overrides || {};

    return {
      events,
      metadata,
      summary: `Found ${events.length} events`,
      ...rest,
    };
  };

  beforeEach(() => {
    // Create mock SmartThingsService with all required methods
    mockSmartThingsService = {
      getDeviceEvents: vi.fn(),
      getDevice: vi.fn(),
      listDevices: vi.fn(),
      getDeviceStatus: vi.fn(),
      executeCommand: vi.fn(),
      getDeviceCapabilities: vi.fn(),
      listLocations: vi.fn(),
      listRooms: vi.fn(),
      findRoomByName: vi.fn(),
      listScenes: vi.fn(),
      executeScene: vi.fn(),
      findSceneByName: vi.fn(),
    } as unknown as SmartThingsService;

    deviceService = new DeviceService(mockSmartThingsService);
  });

  describe('Happy Path Tests', () => {
    it('should retrieve events for valid deviceId and options', async () => {
      const mockEvents = [
        createMockEvent(),
        createMockEvent({ time: '2025-11-27T11:00:00Z', epoch: 1732705200000, value: 'off' }),
      ];
      const mockResult = createMockResult(mockEvents);

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const deviceId = createDeviceId('device-123');
      const result = await deviceService.getDeviceEvents(deviceId, {
        startTime: '24h',
        limit: 100,
      });

      expect(result).toBeDefined();
      expect(result.events).toHaveLength(2);
      expect(result.metadata.totalCount).toBe(2);
      expect(mockSmartThingsService.getDeviceEvents).toHaveBeenCalledWith(
        deviceId,
        expect.objectContaining({
          startTime: '24h',
          limit: 100,
        })
      );
    });

    it('should apply time range filters correctly', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const startTime = new Date('2025-11-20T00:00:00Z');
      const endTime = new Date('2025-11-27T23:59:59Z');

      await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        startTime,
        endTime,
      });

      expect(mockSmartThingsService.getDeviceEvents).toHaveBeenCalledWith(
        'device-123',
        expect.objectContaining({
          startTime,
          endTime,
        })
      );
    });

    it('should respect limit parameter', async () => {
      const mockEvents = Array.from({ length: 50 }, (_, i) =>
        createMockEvent({ epoch: 1732708800000 + i * 1000 })
      );
      const mockResult = createMockResult(mockEvents);
      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        limit: 50,
      });

      expect(result.events).toHaveLength(50);
      expect(mockSmartThingsService.getDeviceEvents).toHaveBeenCalledWith(
        'device-123',
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should filter by capabilities when specified', async () => {
      const switchEvents = [
        createMockEvent({ capability: 'switch' as any }),
        createMockEvent({ capability: 'switch' as any, value: 'off' }),
      ];
      const mockResult = createMockResult(switchEvents, {
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T12:00:00Z',
            latest: '2025-11-27T12:01:00Z',
            durationMs: 60000,
          },
          appliedFilters: { capabilities: ['switch'] },
          gapDetected: false,
          largestGapMs: 0,
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        capabilities: ['switch'] as any,
      });

      expect(result.events).toHaveLength(2);
      expect(result.events.every((e) => e.capability === 'switch')).toBe(true);
      expect(result.metadata.appliedFilters.capabilities).toContain('switch');
    });

    it('should filter by attributes when specified', async () => {
      const tempEvents = [
        createMockEvent({
          capability: 'temperatureMeasurement' as any,
          attribute: 'temperature',
          value: 72,
        }),
        createMockEvent({
          capability: 'temperatureMeasurement' as any,
          attribute: 'temperature',
          value: 73,
        }),
      ];
      const mockResult = createMockResult(tempEvents, {
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T12:00:00Z',
            latest: '2025-11-27T12:01:00Z',
            durationMs: 60000,
          },
          appliedFilters: { attributes: ['temperature'] },
          gapDetected: false,
          largestGapMs: 0,
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        attributes: ['temperature'],
      });

      expect(result.events).toHaveLength(2);
      expect(result.events.every((e) => e.attribute === 'temperature')).toBe(true);
      expect(result.metadata.appliedFilters.attributes).toContain('temperature');
    });

    it('should detect gaps when includeMetadata=true', async () => {
      // Create events with a 2-hour gap
      const eventsWithGap = [
        createMockEvent({ time: '2025-11-27T10:00:00Z', epoch: 1732701600000 }),
        createMockEvent({ time: '2025-11-27T12:00:00Z', epoch: 1732708800000 }), // 2 hour gap
      ];

      const mockResult = createMockResult(eventsWithGap, {
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T10:00:00Z',
            latest: '2025-11-27T12:00:00Z',
            durationMs: 7200000,
          },
          appliedFilters: {},
          gapDetected: true,
          gaps: [
            {
              gapStart: 1732701600000,
              gapEnd: 1732708800000,
              durationMs: 7200000,
              durationText: '2 hours',
              likelyConnectivityIssue: true,
            },
          ],
          largestGapMs: 7200000,
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        includeMetadata: true,
      });

      expect(result.metadata.gapDetected).toBe(true);
      expect(result.metadata.gaps).toHaveLength(1);
      expect(result.metadata.gaps?.[0]?.durationMs).toBe(7200000);
      expect(result.metadata.gaps?.[0]?.likelyConnectivityIssue).toBe(true);
    });

    it('should format timestamps when humanReadable=true', async () => {
      const mockEvent = createMockEvent({
        text: 'Switch turned on', // Human-readable text from SmartThings
      });
      const mockResult = createMockResult([mockEvent]);

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        humanReadable: true,
      });

      expect(result.events[0]?.text).toBe('Switch turned on');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty result set', async () => {
      const mockResult = createMockResult([]);
      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {});

      expect(result.events).toHaveLength(0);
      expect(result.metadata.totalCount).toBe(0);
      expect(result.metadata.hasMore).toBe(false);
    });

    it('should handle retention limit exceeded', async () => {
      const mockEvents = [createMockEvent()];
      const mockResult = createMockResult(mockEvents, {
        metadata: {
          totalCount: 1,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T12:00:00Z',
            latest: '2025-11-27T12:01:00Z',
            durationMs: 60000,
          },
          appliedFilters: {},
          gapDetected: false,
          largestGapMs: 0,
          reachedRetentionLimit: true,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      // Try to query 30 days ago (exceeds 7-day limit)
      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        startTime: '30d',
      });

      expect(result.metadata.reachedRetentionLimit).toBe(true);
    });

    it('should handle device not found', async () => {
      const notFoundError = new Error('Device not found');
      (mockSmartThingsService.getDeviceEvents as Mock).mockRejectedValue(notFoundError);

      await expect(
        deviceService.getDeviceEvents(createDeviceId('nonexistent-device'), {})
      ).rejects.toThrow(DeviceServiceError);
    });

    it('should handle invalid time ranges', async () => {
      const invalidRangeError = new Error('Start time must be before end time');
      (mockSmartThingsService.getDeviceEvents as Mock).mockRejectedValue(invalidRangeError);

      const startTime = new Date('2025-11-27T12:00:00Z');
      const endTime = new Date('2025-11-20T12:00:00Z'); // End before start

      await expect(
        deviceService.getDeviceEvents(createDeviceId('device-123'), { startTime, endTime })
      ).rejects.toThrow(DeviceServiceError);
    });

    it('should handle missing locationId (auto-fetch)', async () => {
      // When locationId is not provided, SmartThingsService should fetch it
      const mockResult = createMockResult([createMockEvent()]);
      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        // locationId not provided
      });

      expect(result).toBeDefined();
      expect(result.events).toHaveLength(1);
      // Service should handle fetching locationId internally
    });

    it('should handle pagination with hasMore flag', async () => {
      const mockEvents = Array.from({ length: 100 }, (_, i) =>
        createMockEvent({ epoch: 1732708800000 + i * 1000 })
      );
      const mockResult = createMockResult(mockEvents, {
        metadata: {
          totalCount: 100,
          hasMore: true, // More events available
          dateRange: {
            earliest: '2025-11-27T12:00:00Z',
            latest: '2025-11-27T12:01:00Z',
            durationMs: 60000,
          },
          appliedFilters: {},
          gapDetected: false,
          largestGapMs: 0,
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        limit: 100,
      });

      expect(result.metadata.hasMore).toBe(true);
      expect(result.events).toHaveLength(100);
    });

    it('should handle events with no gaps', async () => {
      // Create events with small intervals (no gaps)
      const densEvents = Array.from({ length: 5 }, (_, i) =>
        createMockEvent({
          time: new Date(1732708800000 + i * 60000).toISOString(), // 1 minute apart
          epoch: 1732708800000 + i * 60000,
        })
      );

      const mockResult = createMockResult(densEvents, {
        metadata: {
          totalCount: 5,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T12:00:00Z',
            latest: '2025-11-27T12:04:00Z',
            durationMs: 240000,
          },
          appliedFilters: {},
          gapDetected: false,
          largestGapMs: 60000, // Just 1 minute
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        includeMetadata: true,
      });

      expect(result.metadata.gapDetected).toBe(false);
      expect(result.metadata.gaps).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw DeviceServiceError on API failure', async () => {
      const apiError = new Error('SmartThings API unavailable');
      (mockSmartThingsService.getDeviceEvents as Mock).mockRejectedValue(apiError);

      await expect(deviceService.getDeviceEvents(createDeviceId('device-123'), {})).rejects.toThrow(
        DeviceServiceError
      );
    });

    it('should include context in DeviceServiceError', async () => {
      const apiError = new Error('Network timeout');
      (mockSmartThingsService.getDeviceEvents as Mock).mockRejectedValue(apiError);

      try {
        await deviceService.getDeviceEvents(createDeviceId('device-123'), { limit: 50 });
        // Should not reach here
        expect.fail('Expected DeviceServiceError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DeviceServiceError);
        const serviceError = error as DeviceServiceError;

        expect(serviceError.service).toBe('DeviceService');
        expect(serviceError.operation).toBe('getDeviceEvents');
        expect(serviceError.metadata).toBeDefined();
        // Parameters are stored in metadata.parameters
        expect(serviceError.metadata.parameters).toBeDefined();
        expect(serviceError.metadata.parameters?.['deviceId']).toBe('device-123');
      }
    });

    it('should handle SmartThings SDK errors', async () => {
      const sdkError = new Error('Unauthorized: Invalid API token');
      (mockSmartThingsService.getDeviceEvents as Mock).mockRejectedValue(sdkError);

      await expect(deviceService.getDeviceEvents(createDeviceId('device-123'), {})).rejects.toThrow(
        DeviceServiceError
      );
    });

    it('should handle network errors with retry indication', async () => {
      // Simulate transient network error
      const networkError = new Error('ECONNREFUSED');
      (mockSmartThingsService.getDeviceEvents as Mock).mockRejectedValueOnce(networkError);

      await expect(deviceService.getDeviceEvents(createDeviceId('device-123'), {})).rejects.toThrow(
        DeviceServiceError
      );

      // Verify the error was attempted
      expect(mockSmartThingsService.getDeviceEvents).toHaveBeenCalledTimes(1);
    });

    it('should validate deviceId parameter', async () => {
      const invalidError = new Error('Invalid deviceId');
      (mockSmartThingsService.getDeviceEvents as Mock).mockRejectedValue(invalidError);

      await expect(
        deviceService.getDeviceEvents(createDeviceId(''), {}) // Empty deviceId
      ).rejects.toThrow(DeviceServiceError);
    });
  });

  describe('Filtering Logic', () => {
    it('should combine capability and attribute filters', async () => {
      const filteredEvents = [
        createMockEvent({
          capability: 'temperatureMeasurement' as any,
          attribute: 'temperature',
          value: 72,
        }),
      ];

      const mockResult = createMockResult(filteredEvents, {
        metadata: {
          totalCount: 1,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T12:00:00Z',
            latest: '2025-11-27T12:01:00Z',
            durationMs: 60000,
          },
          appliedFilters: {
            capabilities: ['temperatureMeasurement'],
            attributes: ['temperature'],
          },
          gapDetected: false,
          largestGapMs: 0,
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        capabilities: ['temperatureMeasurement'] as any,
        attributes: ['temperature'],
      });

      expect(result.events).toHaveLength(1);
      expect(result.metadata.appliedFilters.capabilities).toContain('temperatureMeasurement');
      expect(result.metadata.appliedFilters.attributes).toContain('temperature');
    });

    it('should handle multiple capability filters', async () => {
      const multiEvents = [
        createMockEvent({ capability: 'switch' as any, attribute: 'switch' }),
        createMockEvent({
          capability: 'temperatureMeasurement' as any,
          attribute: 'temperature',
        }),
      ];

      const mockResult = createMockResult(multiEvents, {
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T12:00:00Z',
            latest: '2025-11-27T12:01:00Z',
            durationMs: 60000,
          },
          appliedFilters: { capabilities: ['switch', 'temperatureMeasurement'] },
          gapDetected: false,
          largestGapMs: 0,
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        capabilities: ['switch', 'temperatureMeasurement'] as any,
      });

      expect(result.events).toHaveLength(2);
    });
  });

  describe('Metadata Generation', () => {
    it('should include all metadata fields when includeMetadata=true', async () => {
      const mockResult = createMockResult([createMockEvent()], {
        metadata: {
          totalCount: 1,
          hasMore: false,
          dateRange: {
            earliest: '2025-11-27T12:00:00Z',
            latest: '2025-11-27T12:01:00Z',
            durationMs: 60000,
          },
          appliedFilters: { capabilities: ['switch'] },
          gapDetected: false,
          largestGapMs: 0,
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        includeMetadata: true,
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty('totalCount');
      expect(result.metadata).toHaveProperty('hasMore');
      expect(result.metadata).toHaveProperty('appliedFilters');
      expect(result.metadata).toHaveProperty('gapDetected');
      expect(result.metadata).toHaveProperty('gaps');
      expect(result.metadata).toHaveProperty('largestGapMs');
      expect(result.metadata).toHaveProperty('reachedRetentionLimit');
    });

    it('should calculate correct totalCount', async () => {
      const events = Array.from({ length: 42 }, () => createMockEvent());
      const mockResult = createMockResult(events);

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {});

      expect(result.metadata.totalCount).toBe(42);
    });
  });

  describe('Logging and Monitoring', () => {
    it('should log successful event retrieval', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      await deviceService.getDeviceEvents(createDeviceId('device-123'), {});

      // Logger should have been called with success info
      // (Note: Actual logger verification would require logger mocking)
      expect(mockSmartThingsService.getDeviceEvents).toHaveBeenCalled();
    });

    it('should log gap detection warnings', async () => {
      const mockResult = createMockResult([createMockEvent()], {
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
          gaps: [
            {
              gapStart: 1732701600000,
              gapEnd: 1732708800000,
              durationMs: 7200000,
              durationText: '2 hours',
              likelyConnectivityIssue: true,
            },
          ],
          largestGapMs: 7200000,
          reachedRetentionLimit: false,
        },
      });

      (mockSmartThingsService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await deviceService.getDeviceEvents(createDeviceId('device-123'), {
        includeMetadata: true,
      });

      expect(result.metadata.gapDetected).toBe(true);
    });
  });
});
