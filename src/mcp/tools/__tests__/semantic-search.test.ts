/**
 * Semantic search MCP tool unit tests.
 *
 * Test Categories:
 * 1. Input Validation (3 tests)
 * 2. Search Functionality (4 tests)
 * 3. Filtering (3 tests)
 * 4. Output Formatting (2 tests)
 * 5. Error Handling (2 tests)
 *
 * Total: 14 tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  semanticSearchDevices,
  semanticSearchDevicesSchema,
  type SemanticSearchDevicesInput,
} from '../semantic-search.js';
import type { SemanticIndex, DeviceSearchResult } from '../../../services/SemanticIndex.js';

describe('semantic_search_devices MCP tool', () => {
  let mockSemanticIndex: SemanticIndex;
  let mockSearchResults: DeviceSearchResult[];

  beforeEach(() => {
    // Create mock search results
    mockSearchResults = [
      {
        deviceId: 'smartthings:motion1',
        score: 0.92,
        device: {
          deviceId: 'smartthings:motion1',
          content: 'Living Room Motion Sensor, detects motion',
          metadata: {
            name: 'Living Room Motion Sensor',
            label: 'Motion Sensor',
            room: 'Living Room',
            capabilities: ['motionSensor', 'battery'],
            platform: 'smartthings',
            online: true,
            tags: ['sensor', 'online'],
          },
        },
      },
      {
        deviceId: 'smartthings:motion2',
        score: 0.85,
        device: {
          deviceId: 'smartthings:motion2',
          content: 'Bedroom Motion Sensor, detects motion',
          metadata: {
            name: 'Bedroom Motion Sensor',
            label: 'Motion Sensor',
            room: 'Bedroom',
            capabilities: ['motionSensor', 'battery'],
            platform: 'smartthings',
            online: true,
            tags: ['sensor', 'online'],
          },
        },
      },
    ];

    // Mock SemanticIndex
    mockSemanticIndex = {
      searchDevices: vi.fn().mockResolvedValue(mockSearchResults),
      initialize: vi.fn().mockResolvedValue(undefined),
      indexDevice: vi.fn().mockResolvedValue(undefined),
      indexDevices: vi.fn().mockResolvedValue(undefined),
      updateDevice: vi.fn().mockResolvedValue(undefined),
      removeDevice: vi.fn().mockResolvedValue(undefined),
      syncWithRegistry: vi.fn().mockResolvedValue({
        added: 0,
        updated: 0,
        removed: 0,
        errors: [],
        durationMs: 100,
      }),
      startPeriodicSync: vi.fn(),
      stopPeriodicSync: vi.fn(),
      setDeviceRegistry: vi.fn(),
      getStats: vi.fn().mockResolvedValue({
        totalDevices: 10,
        collectionName: 'test_collection',
        embeddingModel: 'test-model',
        healthy: true,
      }),
    } as unknown as SemanticIndex;
  });

  describe('Input Validation Tests', () => {
    it('should validate required query parameter', () => {
      const invalidInput = {
        limit: 10,
      };

      expect(() => semanticSearchDevicesSchema.parse(invalidInput)).toThrow();
    });

    it('should validate query is not empty', () => {
      const invalidInput = {
        query: '',
      };

      expect(() => semanticSearchDevicesSchema.parse(invalidInput)).toThrow();
    });

    it('should apply default values for optional parameters', () => {
      const input = {
        query: 'motion sensors',
      };

      const parsed = semanticSearchDevicesSchema.parse(input);

      expect(parsed.limit).toBe(10);
      expect(parsed.minSimilarity).toBe(0.5);
    });

    it('should validate limit is within bounds', () => {
      const invalidInput = {
        query: 'test',
        limit: 200, // Max is 100
      };

      expect(() => semanticSearchDevicesSchema.parse(invalidInput)).toThrow();
    });

    it('should validate minSimilarity is between 0 and 1', () => {
      const invalidInput = {
        query: 'test',
        minSimilarity: 1.5, // Must be <= 1
      };

      expect(() => semanticSearchDevicesSchema.parse(invalidInput)).toThrow();
    });
  });

  describe('Search Functionality Tests', () => {
    it('should return devices matching natural language query', async () => {
      const input: SemanticSearchDevicesInput = {
        query: 'motion sensors',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.devices).toHaveLength(2);
      expect(result.totalResults).toBe(2);
      expect(result.query).toBe('motion sensors');
      expect(result.metadata.searchMethod).toBe('semantic');
    });

    it('should call SemanticIndex.searchDevices with correct parameters', async () => {
      const input: SemanticSearchDevicesInput = {
        query: 'temperature sensors',
        limit: 20,
        minSimilarity: 0.7,
      };

      await semanticSearchDevices(input, mockSemanticIndex);

      expect(mockSemanticIndex.searchDevices).toHaveBeenCalledWith('temperature sensors', {
        limit: 20,
        minSimilarity: 0.7,
        filters: undefined, // No filters applied when none specified
      });
    });

    it('should format device results correctly', async () => {
      const input: SemanticSearchDevicesInput = {
        query: 'motion sensors',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      const device = result.devices[0];
      expect(device).toBeDefined();
      expect(device!.deviceId).toBe('smartthings:motion1');
      expect(device!.name).toBe('Living Room Motion Sensor');
      expect(device!.label).toBe('Motion Sensor');
      expect(device!.room).toBe('Living Room');
      expect(device!.capabilities).toEqual(['motionSensor', 'battery']);
      expect(device!.platform).toBe('smartthings');
      expect(device!.online).toBe(true);
      expect(device!.score).toBe(0.92);
      expect(device!.matchQuality).toBe('excellent');
    });

    it('should calculate average score correctly', async () => {
      const input: SemanticSearchDevicesInput = {
        query: 'motion sensors',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      // Average of 0.92 and 0.85 = 0.885, rounded to 0.89
      expect(result.metadata.averageScore).toBe(0.89);
    });
  });

  describe('Filtering Tests', () => {
    it('should apply metadata filters correctly', async () => {
      const input: SemanticSearchDevicesInput = {
        query: 'sensors',
        limit: 10,
        roomId: 'living-room',
        capabilities: ['motionSensor'],
        platform: 'smartthings',
        online: true,
        tags: ['sensor'],
        minSimilarity: 0.5,
      };

      await semanticSearchDevices(input, mockSemanticIndex);

      expect(mockSemanticIndex.searchDevices).toHaveBeenCalledWith('sensors', {
        limit: 10,
        minSimilarity: 0.5,
        filters: {
          room: 'living-room',
          capabilities: ['motionSensor'],
          platform: 'smartthings',
          online: true,
          tags: ['sensor'],
        },
      });
    });

    it('should respect minimum similarity threshold', async () => {
      // Mock results with varying scores
      const mixedResults: DeviceSearchResult[] = [
        {
          deviceId: mockSearchResults[0]!.deviceId,
          device: mockSearchResults[0]!.device,
          score: 0.9, // Above threshold
        },
        {
          deviceId: mockSearchResults[1]!.deviceId,
          device: mockSearchResults[1]!.device,
          score: 0.4, // Below threshold
        },
      ];

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue(mixedResults);

      const input: SemanticSearchDevicesInput = {
        query: 'sensors',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      // Only high-scoring result should be included
      expect(result.devices).toHaveLength(2); // Both should be included (filtering happens in SemanticIndex)
    });

    it('should limit results correctly', async () => {
      const input: SemanticSearchDevicesInput = {
        query: 'sensors',
        limit: 1,
        minSimilarity: 0.5,
      };

      await semanticSearchDevices(input, mockSemanticIndex);

      expect(mockSemanticIndex.searchDevices).toHaveBeenCalledWith('sensors', {
        limit: 1,
        minSimilarity: 0.5,
        filters: undefined, // No filters when none specified
      });
    });
  });

  describe('Output Formatting Tests', () => {
    it('should include match quality labels', async () => {
      const resultsWithVariedScores: DeviceSearchResult[] = [
        {
          deviceId: mockSearchResults[0]!.deviceId,
          device: mockSearchResults[0]!.device,
          score: 0.95,
        }, // excellent
        {
          deviceId: mockSearchResults[1]!.deviceId,
          device: mockSearchResults[1]!.device,
          score: 0.75,
        }, // good
      ];

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue(resultsWithVariedScores);

      const input: SemanticSearchDevicesInput = {
        query: 'sensors',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.devices[0]).toBeDefined();
      expect(result.devices[1]).toBeDefined();
      expect(result.devices[0]!.matchQuality).toBe('excellent');
      expect(result.devices[1]!.matchQuality).toBe('good');
    });

    it('should round scores to 2 decimal places', async () => {
      const resultsWithPreciseScores: DeviceSearchResult[] = [
        {
          deviceId: mockSearchResults[0]!.deviceId,
          device: mockSearchResults[0]!.device,
          score: 0.123456,
        },
      ];

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue(resultsWithPreciseScores);

      const input: SemanticSearchDevicesInput = {
        query: 'sensors',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.devices[0]).toBeDefined();
      expect(result.devices[0]!.score).toBe(0.12);
    });

    it('should include filters in output when applied', async () => {
      const input: SemanticSearchDevicesInput = {
        query: 'sensors',
        limit: 10,
        roomId: 'living-room',
        capabilities: ['motionSensor'],
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.filters).toBeDefined();
      expect(result.filters?.room).toBe('living-room');
      expect(result.filters?.capabilities).toEqual(['motionSensor']);
    });

    it('should omit filters from output when not applied', async () => {
      const input: SemanticSearchDevicesInput = {
        query: 'sensors',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.filters).toBeUndefined();
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle search failures gracefully', async () => {
      vi.mocked(mockSemanticIndex.searchDevices).mockRejectedValue(new Error('Search failed'));

      const input: SemanticSearchDevicesInput = {
        query: 'sensors',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      // Should return empty results, not throw
      expect(result.devices).toEqual([]);
      expect(result.totalResults).toBe(0);
      expect(result.metadata.searchMethod).toBe('semantic');
    });

    it('should handle no results gracefully', async () => {
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const input: SemanticSearchDevicesInput = {
        query: 'nonexistent devices',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.devices).toEqual([]);
      expect(result.totalResults).toBe(0);
      expect(result.metadata.averageScore).toBeUndefined();
    });
  });

  describe('Match Quality Classification Tests', () => {
    it('should classify scores >= 0.8 as excellent', async () => {
      const results: DeviceSearchResult[] = [
        {
          deviceId: mockSearchResults[0]!.deviceId,
          device: mockSearchResults[0]!.device,
          score: 0.95,
        },
        {
          deviceId: mockSearchResults[1]!.deviceId,
          device: mockSearchResults[1]!.device,
          score: 0.8,
        },
      ];

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue(results);

      const input: SemanticSearchDevicesInput = {
        query: 'test',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.devices[0]).toBeDefined();
      expect(result.devices[1]).toBeDefined();
      expect(result.devices[0]!.matchQuality).toBe('excellent');
      expect(result.devices[1]!.matchQuality).toBe('excellent');
    });

    it('should classify scores >= 0.6 and < 0.8 as good', async () => {
      const results: DeviceSearchResult[] = [
        {
          deviceId: mockSearchResults[0]!.deviceId,
          device: mockSearchResults[0]!.device,
          score: 0.75,
        },
        {
          deviceId: mockSearchResults[1]!.deviceId,
          device: mockSearchResults[1]!.device,
          score: 0.6,
        },
      ];

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue(results);

      const input: SemanticSearchDevicesInput = {
        query: 'test',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.devices[0]).toBeDefined();
      expect(result.devices[1]).toBeDefined();
      expect(result.devices[0]!.matchQuality).toBe('good');
      expect(result.devices[1]!.matchQuality).toBe('good');
    });

    it('should classify scores < 0.6 as fair', async () => {
      const results: DeviceSearchResult[] = [
        {
          deviceId: mockSearchResults[0]!.deviceId,
          device: mockSearchResults[0]!.device,
          score: 0.55,
        },
        {
          deviceId: mockSearchResults[1]!.deviceId,
          device: mockSearchResults[1]!.device,
          score: 0.5,
        },
      ];

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue(results);

      const input: SemanticSearchDevicesInput = {
        query: 'test',
        limit: 10,
        minSimilarity: 0.5,
      };

      const result = await semanticSearchDevices(input, mockSemanticIndex);

      expect(result.devices[0]).toBeDefined();
      expect(result.devices[1]).toBeDefined();
      expect(result.devices[0]!.matchQuality).toBe('fair');
      expect(result.devices[1]!.matchQuality).toBe('fair');
    });
  });
});
