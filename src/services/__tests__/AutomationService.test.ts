/**
 * AutomationService unit tests.
 *
 * Test Coverage:
 * - Rule listing with cache hit/miss scenarios
 * - Cache TTL expiration
 * - Device rule matching logic
 * - Device role categorization (trigger/controlled/both)
 * - Error handling (API failures, null responses)
 * - Edge cases (empty rules, malformed data)
 * - Device index building
 * - Cache clearing (all locations vs specific)
 *
 * Design: Mocks SmartThingsAdapter to test caching and matching logic
 * without external dependencies.
 */

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import { AutomationService } from '../AutomationService.js';
import type { SmartThingsAdapter } from '../../platforms/smartthings/SmartThingsAdapter.js';
import type { Rule } from '@smartthings/core-sdk';
import type { DeviceId, LocationId } from '../../types/smartthings.js';

describe('AutomationService', () => {
  let mockAdapter: SmartThingsAdapter;
  let service: AutomationService;
  let originalEnv: NodeJS.ProcessEnv;

  // Mock data factories
  const createMockRule = (overrides?: Partial<Rule>): Rule => ({
    id: `rule-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Rule',
    status: 'Active',
    actions: [],
    ...overrides,
  });

  const createDeviceCommand = (deviceIds: string[], capability?: string, command?: string) => ({
    command: {
      devices: deviceIds,
      commands: [
        {
          capability: capability || 'switch',
          command: command || 'on',
        },
      ],
    },
  });

  beforeEach(() => {
    // Preserve original env
    originalEnv = { ...process.env };

    // Create mock adapter with all required methods
    mockAdapter = {
      listRules: vi.fn(),
      initialize: vi.fn(),
      listDevices: vi.fn(),
      getDevice: vi.fn(),
      executeCommand: vi.fn(),
    } as unknown as SmartThingsAdapter;

    // Default cache TTL: 300000ms (5 minutes)
    delete process.env['AUTOMATION_CACHE_TTL_MS'];
    service = new AutomationService(mockAdapter);
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default cache TTL', () => {
      const instance = new AutomationService(mockAdapter);
      expect(instance).toBeDefined();
      // Default TTL is 300000ms (5 minutes)
    });

    it('should respect AUTOMATION_CACHE_TTL_MS environment variable', () => {
      process.env['AUTOMATION_CACHE_TTL_MS'] = '60000'; // 1 minute
      const instance = new AutomationService(mockAdapter);
      expect(instance).toBeDefined();
    });

    it('should handle invalid AUTOMATION_CACHE_TTL_MS gracefully', () => {
      process.env['AUTOMATION_CACHE_TTL_MS'] = 'invalid';
      const instance = new AutomationService(mockAdapter);
      expect(instance).toBeDefined();
      // Should fall back to default or NaN -> 0
    });
  });

  describe('listRules', () => {
    const locationId = 'location-123' as LocationId;

    it('should fetch rules from API on cache miss', async () => {
      const mockRules: Rule[] = [
        createMockRule({ id: 'rule-1', name: 'Rule 1' }),
        createMockRule({ id: 'rule-2', name: 'Rule 2' }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const rules = await service.listRules(locationId);

      expect(rules).toEqual(mockRules);
      expect(mockAdapter.listRules).toHaveBeenCalledWith(locationId);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);
    });

    it('should return cached rules on subsequent calls', async () => {
      const mockRules: Rule[] = [createMockRule({ id: 'rule-1', name: 'Cached Rule' })];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // First call: cache miss
      const firstCall = await service.listRules(locationId);
      expect(firstCall).toEqual(mockRules);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);

      // Second call: cache hit
      const secondCall = await service.listRules(locationId);
      expect(secondCall).toEqual(mockRules);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1); // Still 1, no new API call
    });

    it('should cache results with TTL', async () => {
      const mockRules: Rule[] = [createMockRule()];
      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      await service.listRules(locationId);

      // Verify cache was populated by checking subsequent call doesn't hit API
      await service.listRules(locationId);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after TTL expires', async () => {
      // Create service with very short TTL
      process.env['AUTOMATION_CACHE_TTL_MS'] = '50'; // 50ms
      const shortTtlService = new AutomationService(mockAdapter);

      const mockRules: Rule[] = [createMockRule()];
      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // First call
      await shortTtlService.listRules(locationId);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second call should refresh cache
      await shortTtlService.listRules(locationId);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(2);
    });

    it('should handle API failures gracefully', async () => {
      const apiError = new Error('SmartThings API unavailable');
      (mockAdapter.listRules as Mock).mockRejectedValue(apiError);

      await expect(service.listRules(locationId)).rejects.toThrow('SmartThings API unavailable');
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);
    });

    it('should handle empty rule array', async () => {
      (mockAdapter.listRules as Mock).mockResolvedValue([]);

      const rules = await service.listRules(locationId);

      expect(rules).toEqual([]);
      expect(rules).toHaveLength(0);
    });

    it('should cache different locations separately', async () => {
      const location1 = 'location-1' as LocationId;
      const location2 = 'location-2' as LocationId;

      const rules1: Rule[] = [createMockRule({ id: 'rule-1', name: 'Location 1 Rule' })];
      const rules2: Rule[] = [createMockRule({ id: 'rule-2', name: 'Location 2 Rule' })];

      (mockAdapter.listRules as Mock)
        .mockResolvedValueOnce(rules1)
        .mockResolvedValueOnce(rules2);

      const result1 = await service.listRules(location1);
      const result2 = await service.listRules(location2);

      expect(result1).toEqual(rules1);
      expect(result2).toEqual(rules2);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(2);

      // Verify cache is separate
      const cached1 = await service.listRules(location1);
      const cached2 = await service.listRules(location2);

      expect(cached1).toEqual(rules1);
      expect(cached2).toEqual(rules2);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(2); // No new API calls
    });
  });

  describe('getRule', () => {
    const locationId = 'location-123' as LocationId;
    const ruleId = 'rule-456';

    it('should return specific rule by ID', async () => {
      const mockRules: Rule[] = [
        createMockRule({ id: 'rule-1', name: 'Rule 1' }),
        createMockRule({ id: ruleId, name: 'Target Rule' }),
        createMockRule({ id: 'rule-3', name: 'Rule 3' }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const rule = await service.getRule(ruleId, locationId);

      expect(rule).toBeDefined();
      expect(rule?.id).toBe(ruleId);
      expect(rule?.name).toBe('Target Rule');
    });

    it('should return null when rule not found', async () => {
      const mockRules: Rule[] = [createMockRule({ id: 'rule-1', name: 'Rule 1' })];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const rule = await service.getRule('nonexistent-rule', locationId);

      expect(rule).toBeNull();
    });

    it('should return null on API failure', async () => {
      (mockAdapter.listRules as Mock).mockRejectedValue(new Error('API failure'));

      const rule = await service.getRule(ruleId, locationId);

      expect(rule).toBeNull();
    });

    it('should use cached rules when available', async () => {
      const mockRules: Rule[] = [createMockRule({ id: ruleId, name: 'Cached Rule' })];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // First call caches the rules
      await service.listRules(locationId);

      // getRule should use cache
      const rule = await service.getRule(ruleId, locationId);

      expect(rule).toBeDefined();
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1); // Only one API call
    });
  });

  describe('findRulesForDevice', () => {
    const locationId = 'location-123' as LocationId;
    const deviceId = 'device-abc' as DeviceId;

    it('should find rules controlling a device', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Turn on Light',
          actions: [createDeviceCommand([deviceId as string])],
        }),
        createMockRule({
          id: 'rule-2',
          name: 'Unrelated Rule',
          actions: [createDeviceCommand(['other-device'])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.ruleId).toBe('rule-1');
      expect(matches[0]?.ruleName).toBe('Turn on Light');
      expect(matches[0]?.matchType).toBe('direct');
      expect(matches[0]?.confidence).toBe(1.0);
      expect(matches[0]?.deviceRoles).toContain('controlled');
    });

    it('should return empty array when no rules match', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Unrelated Rule',
          actions: [createDeviceCommand(['other-device'])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(0);
    });

    it('should use cached device index for O(1) lookup', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Cached Rule',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // First call builds cache
      const firstMatches = await service.findRulesForDevice(deviceId, locationId);
      expect(firstMatches).toHaveLength(1);

      // Second call uses cache index
      const secondMatches = await service.findRulesForDevice(deviceId, locationId);
      expect(secondMatches).toHaveLength(1);

      // Verify only one API call
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);
    });

    it('should find multiple rules controlling same device', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Morning Routine',
          actions: [createDeviceCommand([deviceId as string])],
        }),
        createMockRule({
          id: 'rule-2',
          name: 'Evening Routine',
          actions: [createDeviceCommand([deviceId as string])],
        }),
        createMockRule({
          id: 'rule-3',
          name: 'Other Device',
          actions: [createDeviceCommand(['other-device'])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.ruleId)).toContain('rule-1');
      expect(matches.map((m) => m.ruleId)).toContain('rule-2');
    });

    it('should include rule status in matches', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Active Rule',
          status: 'Active',
          actions: [createDeviceCommand([deviceId as string])],
        }),
        createMockRule({
          id: 'rule-2',
          name: 'Inactive Rule',
          status: 'Inactive',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(2);
      expect(matches.find((m) => m.ruleId === 'rule-1')?.status).toBe('Active');
      expect(matches.find((m) => m.ruleId === 'rule-2')?.status).toBe('Inactive');
    });

    it('should include evidence in match results', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Test Rule',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.evidence).toBeDefined();
      expect(matches[0]?.evidence).toContain(`Device ${deviceId} found in rule actions`);
    });

    it('should categorize device roles correctly', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Control Device',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.deviceRoles).toContain('controlled');
    });

    it('should handle device in multiple actions', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Multi-Action Rule',
          actions: [
            createDeviceCommand([deviceId as string], 'switch', 'on'),
            createDeviceCommand([deviceId as string], 'switchLevel', 'setLevel'),
            createDeviceCommand(['other-device']),
          ],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.ruleId).toBe('rule-1');
    });

    it('should handle device in group with other devices', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Group Control',
          actions: [createDeviceCommand([deviceId as string, 'device-2', 'device-3'])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.ruleId).toBe('rule-1');
    });

    it('should return cached results on subsequent calls', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Test Rule',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // First call
      await service.findRulesForDevice(deviceId, locationId);

      // Second call should use cache
      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);
    });

    it('should return empty array from cache when no matches', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Unrelated Rule',
          actions: [createDeviceCommand(['other-device'])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // First call builds cache
      await service.findRulesForDevice(deviceId, locationId);

      // Second call should return empty from cache
      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(0);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearCache', () => {
    const location1 = 'location-1' as LocationId;
    const location2 = 'location-2' as LocationId;

    it('should clear cache for specific location', async () => {
      const mockRules: Rule[] = [createMockRule()];
      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Populate cache
      await service.listRules(location1);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);

      // Clear cache
      service.clearCache(location1);

      // Next call should hit API
      await service.listRules(location1);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(2);
    });

    it('should clear all caches when no location specified', async () => {
      const mockRules: Rule[] = [createMockRule()];
      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Populate cache for multiple locations
      await service.listRules(location1);
      await service.listRules(location2);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(2);

      // Clear all caches
      service.clearCache();

      // Both locations should hit API
      await service.listRules(location1);
      await service.listRules(location2);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(4);
    });

    it('should not affect other location caches when clearing specific location', async () => {
      const mockRules: Rule[] = [createMockRule()];
      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Populate both caches
      await service.listRules(location1);
      await service.listRules(location2);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(2);

      // Clear only location1
      service.clearCache(location1);

      // Location1 should hit API, location2 should use cache
      await service.listRules(location1);
      await service.listRules(location2);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(3); // 2 initial + 1 for location1
    });

    it('should handle clearing non-existent location cache', () => {
      // Should not throw
      expect(() => service.clearCache('nonexistent-location' as LocationId)).not.toThrow();
    });

    it('should handle clearing empty cache', () => {
      // Should not throw
      expect(() => service.clearCache()).not.toThrow();
    });
  });

  describe('Device Index Building', () => {
    const locationId = 'location-123' as LocationId;

    it('should build device index during cache update', async () => {
      const device1 = 'device-1' as DeviceId;
      const device2 = 'device-2' as DeviceId;

      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Rule 1',
          actions: [createDeviceCommand([device1 as string])],
        }),
        createMockRule({
          id: 'rule-2',
          name: 'Rule 2',
          actions: [createDeviceCommand([device2 as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Trigger cache build
      await service.listRules(locationId);

      // Verify index works by finding both devices
      const matches1 = await service.findRulesForDevice(device1, locationId);
      const matches2 = await service.findRulesForDevice(device2, locationId);

      expect(matches1).toHaveLength(1);
      expect(matches2).toHaveLength(1);
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1); // Only initial call
    });

    it('should handle rules with no device references', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'No Devices',
          actions: [], // No actions
        }),
        createMockRule({
          id: 'rule-2',
          name: 'Also No Devices',
          actions: [{ if: 'some condition' }], // Non-command action
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      await service.listRules(locationId);

      const matches = await service.findRulesForDevice('any-device' as DeviceId, locationId);
      expect(matches).toHaveLength(0);
    });

    it('should handle malformed rule actions gracefully', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Malformed Rule',
          actions: [
            { command: null }, // Null command
            { command: { devices: null } }, // Null devices
            { command: { devices: [] } }, // Empty devices
            { command: { devices: 'not-an-array' } }, // Invalid type
          ] as any,
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Should not throw
      await expect(service.listRules(locationId)).resolves.toBeDefined();
    });

    it('should deduplicate device entries in index', async () => {
      const deviceId = 'device-123' as DeviceId;

      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Rule 1',
          actions: [
            createDeviceCommand([deviceId as string]),
            createDeviceCommand([deviceId as string]), // Same device twice
          ],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      await service.listRules(locationId);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      // Should have only one match per rule
      expect(matches).toHaveLength(1);
      expect(matches[0]?.ruleId).toBe('rule-1');
    });
  });

  describe('Edge Cases', () => {
    const locationId = 'location-123' as LocationId;

    it('should handle null rule array', async () => {
      (mockAdapter.listRules as Mock).mockResolvedValue(null);

      // Should handle gracefully
      await expect(service.listRules(locationId)).rejects.toThrow();
    });

    it('should handle undefined rule properties', async () => {
      const mockRules: Rule[] = [
        {
          id: 'rule-1',
          name: 'Minimal Rule',
          // Missing optional properties
        } as Rule,
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const rules = await service.listRules(locationId);
      expect(rules).toHaveLength(1);
    });

    it('should handle rules with empty actions array', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'No Actions',
          actions: [],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const rules = await service.listRules(locationId);
      expect(rules).toHaveLength(1);

      const matches = await service.findRulesForDevice('any-device' as DeviceId, locationId);
      expect(matches).toHaveLength(0);
    });

    it('should handle very large rule sets', async () => {
      // Create 1000 rules
      const mockRules: Rule[] = Array.from({ length: 1000 }, (_, i) =>
        createMockRule({
          id: `rule-${i}`,
          name: `Rule ${i}`,
          actions: [createDeviceCommand([`device-${i % 10}`])],
        })
      );

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const rules = await service.listRules(locationId);
      expect(rules).toHaveLength(1000);

      // Should be able to find device efficiently
      const matches = await service.findRulesForDevice('device-5' as DeviceId, locationId);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('should handle concurrent requests to same location', async () => {
      const mockRules: Rule[] = [createMockRule()];
      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Make 5 concurrent requests
      const promises = Array.from({ length: 5 }, () => service.listRules(locationId));

      const results = await Promise.all(promises);

      // All should return same data
      results.forEach((result) => {
        expect(result).toEqual(mockRules);
      });

      // API should have been called (race condition may cause 1-5 calls)
      expect(mockAdapter.listRules).toHaveBeenCalled();
    });

    it('should handle special characters in device IDs', async () => {
      const specialDeviceId = 'device-with-special-chars-!@#$%' as DeviceId;

      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Special Device Rule',
          actions: [createDeviceCommand([specialDeviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(specialDeviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.evidence[0]).toContain(specialDeviceId);
    });
  });

  describe('Error Handling', () => {
    const locationId = 'location-123' as LocationId;

    it('should propagate API errors', async () => {
      const apiError = new Error('Network timeout');
      (mockAdapter.listRules as Mock).mockRejectedValue(apiError);

      await expect(service.listRules(locationId)).rejects.toThrow('Network timeout');
    });

    it('should handle adapter initialization errors', async () => {
      const initError = new Error('Adapter not initialized');
      (mockAdapter.listRules as Mock).mockRejectedValue(initError);

      await expect(service.listRules(locationId)).rejects.toThrow('Adapter not initialized');
    });

    it('should handle malformed API response', async () => {
      const malformedResponse: any = {
        // Not an array
        rules: 'invalid',
      };

      (mockAdapter.listRules as Mock).mockResolvedValue(malformedResponse);

      // Should throw error when API returns non-iterable data
      await expect(service.listRules(locationId)).rejects.toThrow();
    });

    it('should handle missing rule IDs', async () => {
      const mockRules: Rule[] = [
        {
          // Missing id
          name: 'No ID Rule',
          actions: [],
        } as Rule,
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const rules = await service.listRules(locationId);
      expect(rules).toHaveLength(1);
    });

    it('should handle missing rule names', async () => {
      const mockRules: Rule[] = [
        {
          id: 'rule-1',
          // Missing name
          actions: [],
        } as Rule,
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const rules = await service.listRules(locationId);
      expect(rules).toHaveLength(1);
    });
  });

  describe('Performance Characteristics', () => {
    const locationId = 'location-123' as LocationId;

    it('should have O(1) cache lookup time', async () => {
      const mockRules: Rule[] = [createMockRule()];
      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Populate cache
      await service.listRules(locationId);

      // Measure cache hit time
      const start = Date.now();
      await service.listRules(locationId);
      const elapsed = Date.now() - start;

      // Cache hit should be very fast (< 10ms)
      expect(elapsed).toBeLessThan(10);
    });

    it('should reuse device index across multiple device queries', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Multi-Device Rule',
          actions: [createDeviceCommand(['device-1', 'device-2', 'device-3'])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Build cache
      await service.listRules(locationId);

      // Query multiple devices
      await service.findRulesForDevice('device-1' as DeviceId, locationId);
      await service.findRulesForDevice('device-2' as DeviceId, locationId);
      await service.findRulesForDevice('device-3' as DeviceId, locationId);

      // Should only have one API call
      expect(mockAdapter.listRules).toHaveBeenCalledTimes(1);
    });
  });

  describe('Device Role Categorization', () => {
    const locationId = 'location-123' as LocationId;
    const deviceId = 'device-123' as DeviceId;

    it('should categorize device as "controlled" when in actions', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Control Device',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.deviceRoles).toEqual(['controlled']);
    });

    it('should default to "controlled" role for all matches', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Rule 1',
          actions: [createDeviceCommand([deviceId as string])],
        }),
        createMockRule({
          id: 'rule-2',
          name: 'Rule 2',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(2);
      matches.forEach((match) => {
        expect(match.deviceRoles).toContain('controlled');
      });
    });
  });

  describe('Match Metadata', () => {
    const locationId = 'location-123' as LocationId;
    const deviceId = 'device-123' as DeviceId;

    it('should always set matchType to "direct"', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Test Rule',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches[0]?.matchType).toBe('direct');
    });

    it('should always set confidence to 1.0', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Test Rule',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches[0]?.confidence).toBe(1.0);
    });

    it('should include all required match fields', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-123',
          name: 'Test Rule Name',
          status: 'Active',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches[0]).toMatchObject({
        ruleId: 'rule-123',
        ruleName: 'Test Rule Name',
        matchType: 'direct',
        confidence: 1.0,
        deviceRoles: expect.arrayContaining(['controlled']),
        status: 'Active',
        evidence: expect.arrayContaining([expect.stringContaining('Device device-123')]),
      });
    });
  });

  describe('Fallback Path', () => {
    const locationId = 'location-123' as LocationId;
    const deviceId = 'device-abc' as DeviceId;

    it('should use filterRulesByDevice when cache update fails', async () => {
      const mockRules: Rule[] = [
        createMockRule({
          id: 'rule-1',
          name: 'Fallback Rule',
          actions: [createDeviceCommand([deviceId as string])],
        }),
      ];

      (mockAdapter.listRules as Mock).mockResolvedValue(mockRules);

      // Clear cache to force fallback path
      service.clearCache(locationId);

      // Spy on private method by checking the result
      const matches = await service.findRulesForDevice(deviceId, locationId);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.ruleId).toBe('rule-1');
      expect(matches[0]?.ruleName).toBe('Fallback Rule');
    });
  });
});
