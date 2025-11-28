/**
 * MCP Tool: get_device_events unit tests.
 *
 * Test Coverage:
 * - Input validation with Zod schema
 * - Success cases with various query patterns
 * - Error handling and classification
 * - LLM-formatted output generation
 * - Gap detection warnings
 * - Retention limit warnings
 * - Event list formatting
 * - ServiceContainer integration
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  handleGetDeviceEvents,
  initializeDeviceEventTools,
} from '../device-events.js';
import type { ServiceContainer } from '../../../services/ServiceContainer.js';
import type { DeviceService } from '../../../services/DeviceService.js';
import type { DeviceInfo } from '../../../types/smartthings.js';
import type { DeviceEventResult, DeviceEvent } from '../../../types/device-events.js';

// Mock ServiceContainer
vi.mock('../../../services/ServiceContainer.js', () => ({
  serviceContainer: {
    getDeviceService: vi.fn(),
  },
}));

describe('handleGetDeviceEvents', () => {
  let mockDeviceService: DeviceService;
  let mockServiceContainer: ServiceContainer;

  // Mock event data factory (use valid UUID)
  const createMockEvent = (overrides?: Partial<DeviceEvent>): DeviceEvent => ({
    deviceId: '12345678-1234-1234-1234-123456789abc',
    deviceName: 'Living Room Light',
    locationId: '87654321-4321-4321-4321-cba987654321',
    time: '2025-11-27T12:00:00Z',
    epoch: 1732708800000,
    component: 'main',
    capability: 'switch' as any,
    attribute: 'switch',
    value: 'on',
    text: 'Switch turned on',
    ...overrides,
  });

  // Mock device info (use valid UUID)
  const mockDevice: DeviceInfo = {
    deviceId: '12345678-1234-1234-1234-123456789abc' as any,
    name: 'Living Room Light',
    type: 'Light',
    capabilities: ['switch' as any],
    locationId: '87654321-4321-4321-4321-cba987654321',
  };

  // Mock result factory
  const createMockResult = (
    events: DeviceEvent[],
    overrides?: Partial<DeviceEventResult>
  ): DeviceEventResult => ({
    events,
    metadata: {
      totalCount: events.length,
      hasMore: false,
      appliedFilters: {},
      gapDetected: false,
      gaps: [],
      largestGapMs: 0,
      reachedRetentionLimit: false,
      ...overrides?.metadata,
    },
    summary: `Found ${events.length} events`,
    ...overrides,
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock DeviceService
    mockDeviceService = {
      getDeviceEvents: vi.fn(),
      getDevice: vi.fn(),
      listDevices: vi.fn(),
      getDeviceStatus: vi.fn(),
      executeCommand: vi.fn(),
      getDeviceCapabilities: vi.fn(),
    } as unknown as DeviceService;

    // Create mock ServiceContainer
    mockServiceContainer = {
      getDeviceService: vi.fn().mockReturnValue(mockDeviceService),
    } as unknown as ServiceContainer;

    // Initialize tools with mock container
    initializeDeviceEventTools(mockServiceContainer);

    // Setup default mock responses
    (mockDeviceService.getDevice as Mock).mockResolvedValue(mockDevice);
  });

  describe('Input Validation', () => {
    it('should validate required deviceId parameter', async () => {
      const result = await handleGetDeviceEvents({
        // Missing deviceId
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('deviceId'),
          }),
        ])
      );
    });

    it('should accept valid deviceId', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(false);
      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        '12345678-1234-1234-1234-123456789abc',
        expect.any(Object)
      );
    });

    it('should validate optional time range parameters', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        startTime: '24h',
        endTime: '1h',
      });

      expect(result.isError).toBe(false);
    });

    it('should validate limit bounds (1-500)', async () => {
      // Test upper bound
      const result1 = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        limit: 501, // Exceeds max
      });

      expect(result1.isError).toBe(true);
      expect(result1.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('500'),
          }),
        ])
      );

      // Test lower bound
      const result2 = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        limit: 0, // Below min
      });

      expect(result2.isError).toBe(true);
    });

    it('should accept valid capability arrays', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        capabilities: ['switch', 'temperatureMeasurement'],
      });

      expect(result.isError).toBe(false);
      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        '12345678-1234-1234-1234-123456789abc',
        expect.objectContaining({
          capabilities: ['switch', 'temperatureMeasurement'],
        })
      );
    });

    it('should accept valid attribute arrays', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        attributes: ['switch', 'temperature'],
      });

      expect(result.isError).toBe(false);
      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        '12345678-1234-1234-1234-123456789abc',
        expect.objectContaining({
          attributes: ['switch', 'temperature'],
        })
      );
    });

    it('should reject invalid time range format', async () => {
      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        startTime: 'invalid-time', // Invalid format
      });

      expect(result.isError).toBe(true);
    });

    it('should accept ISO-8601 timestamps', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        startTime: '2025-11-20T00:00:00Z',
        endTime: '2025-11-27T23:59:59Z',
      });

      expect(result.isError).toBe(false);
    });

    it('should accept epoch milliseconds', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        startTime: 1732147200000,
        endTime: 1732708800000,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Success Cases', () => {
    it('should return MCP response with events and metadata', async () => {
      const mockEvents = [
        createMockEvent(),
        createMockEvent({ value: 'off', time: '2025-11-27T11:00:00Z' }),
      ];
      const mockResult = createMockResult(mockEvents);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(false);
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.any(String),
          }),
        ])
      );

      // Check for structured data
      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Living Room Light');
      expect(textContent?.text).toContain('2 events');
    });

    it('should format response text for LLM readability', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('📊'); // Emoji indicators
      expect(textContent?.text).toContain('Event History');
      expect(textContent?.text).toContain('📋 Events:');
    });

    it('should include gap warnings in response text', async () => {
      const eventsWithGap = [
        createMockEvent({ time: '2025-11-27T10:00:00Z', epoch: 1732701600000 }),
        createMockEvent({ time: '2025-11-27T12:00:00Z', epoch: 1732708800000 }),
      ];

      const mockResult = createMockResult(eventsWithGap, {
        metadata: {
          totalCount: 2,
          hasMore: false,
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

      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        includeMetadata: true,
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('🔍 Gap Detected');
      expect(textContent?.text).toContain('2 hours');
      expect(textContent?.text).toContain('Connectivity Issue');
    });

    it('should include retention warnings in response text', async () => {
      const mockResult = createMockResult([createMockEvent()], {
        metadata: {
          totalCount: 1,
          hasMore: false,
          appliedFilters: {},
          gapDetected: false,
          gaps: [],
          largestGapMs: 0,
          reachedRetentionLimit: true,
        },
      });

      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        startTime: '30d', // Exceeds retention
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('⚠️');
      expect(textContent?.text).toContain('retention limit');
    });

    it('should format event list with timestamps', async () => {
      const mockEvents = [
        createMockEvent({ time: '2025-11-27T12:00:00Z' }),
        createMockEvent({ time: '2025-11-27T11:00:00Z', value: 'off' }),
      ];
      const mockResult = createMockResult(mockEvents);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // Date format
      expect(textContent?.text).toMatch(/\d{1,2}:\d{2}/); // Time format
    });

    it('should handle empty result set gracefully', async () => {
      const mockResult = createMockResult([]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('No events found');
    });

    it('should respect humanReadable parameter', async () => {
      const mockResult = createMockResult([
        createMockEvent({ text: 'Switch turned on' }),
      ]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        humanReadable: true,
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Switch turned on');
    });

    it('should respect oldestFirst parameter', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        oldestFirst: true,
      });

      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        '12345678-1234-1234-1234-123456789abc',
        expect.objectContaining({
          oldestFirst: true,
        })
      );
    });

    it('should use default values for optional parameters', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        '12345678-1234-1234-1234-123456789abc',
        expect.objectContaining({
          limit: 100,
          oldestFirst: false,
          includeMetadata: true,
          humanReadable: true,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should return MCP error for invalid input', async () => {
      const result = await handleGetDeviceEvents({
        deviceId: 123, // Invalid type
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
          }),
        ])
      );
    });

    it('should return MCP error for device not found', async () => {
      const notFoundError = new Error('Device not found');
      (mockDeviceService.getDevice as Mock).mockRejectedValue(notFoundError);

      const result = await handleGetDeviceEvents({
        deviceId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      });

      expect(result.isError).toBe(true);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Device not found');
    });

    it('should classify errors correctly', async () => {
      const networkError = new Error('ECONNREFUSED');
      (mockDeviceService.getDeviceEvents as Mock).mockRejectedValue(networkError);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(true);
      // Error should be classified as network error
    });

    it('should handle service layer exceptions', async () => {
      const serviceError = new Error('Service unavailable');
      (mockDeviceService.getDeviceEvents as Mock).mockRejectedValue(serviceError);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(true);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('Service unavailable');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Unauthorized: Invalid token');
      (mockDeviceService.getDevice as Mock).mockRejectedValue(authError);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(true);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toMatch(/Unauthorized|Invalid token/i);
    });

    it('should handle invalid time range errors', async () => {
      const rangeError = new Error('Start time must be before end time');
      (mockDeviceService.getDeviceEvents as Mock).mockRejectedValue(rangeError);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        startTime: '2025-11-27T12:00:00Z',
        endTime: '2025-11-20T12:00:00Z', // Invalid range
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should call ServiceContainer.getDeviceService', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(mockServiceContainer.getDeviceService).toHaveBeenCalled();
    });

    it('should fetch device info for display name', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(mockDeviceService.getDevice).toHaveBeenCalledWith('12345678-1234-1234-1234-123456789abc');
    });

    it('should pass all options to DeviceService', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        locationId: '87654321-4321-4321-4321-cba987654321',
        startTime: '24h',
        endTime: '1h',
        limit: 50,
        oldestFirst: true,
        capabilities: ['switch'],
        attributes: ['switch'],
        includeMetadata: true,
        humanReadable: false,
      });

      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        '12345678-1234-1234-1234-123456789abc',
        expect.objectContaining({
          locationId: '87654321-4321-4321-4321-cba987654321',
          limit: 50,
          oldestFirst: true,
          capabilities: ['switch'],
          attributes: ['switch'],
          includeMetadata: true,
          humanReadable: false,
        })
      );
    });
  });

  describe('Response Formatting', () => {
    it('should include summary section', async () => {
      const mockResult = createMockResult([createMockEvent()]);
      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('📊 Event History');
      expect(textContent?.text).toContain('⏱️  Time Range');
      expect(textContent?.text).toContain('📈 Total Events');
    });

    it('should format multiple gaps correctly', async () => {
      const mockResult = createMockResult([createMockEvent()], {
        metadata: {
          totalCount: 1,
          hasMore: false,
          appliedFilters: {},
          gapDetected: true,
          gaps: [
            {
              gapStart: 1732701600000,
              gapEnd: 1732705200000,
              durationMs: 3600000,
              durationText: '1 hour',
              likelyConnectivityIssue: false,
            },
            {
              gapStart: 1732705200000,
              gapEnd: 1732708800000,
              durationMs: 3600000,
              durationText: '1 hour',
              likelyConnectivityIssue: false,
            },
          ],
          largestGapMs: 3600000,
          reachedRetentionLimit: false,
        },
      });

      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        includeMetadata: true,
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('🔍 Detected Gaps');
      expect((textContent?.text.match(/1 hour/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it('should show filter information in summary', async () => {
      const mockResult = createMockResult([createMockEvent()], {
        metadata: {
          totalCount: 1,
          hasMore: false,
          appliedFilters: {
            capabilities: ['switch'],
            attributes: ['switch'],
          },
          gapDetected: false,
          gaps: [],
          largestGapMs: 0,
          reachedRetentionLimit: false,
        },
      });

      (mockDeviceService.getDeviceEvents as Mock).mockResolvedValue(mockResult);

      const result = await handleGetDeviceEvents({
        deviceId: '12345678-1234-1234-1234-123456789abc',
        capabilities: ['switch'],
        attributes: ['switch'],
      });

      expect(result.isError).toBe(false);

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent?.text).toContain('🔎 Filtered by');
    });
  });
});
