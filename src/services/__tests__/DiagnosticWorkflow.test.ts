/**
 * DiagnosticWorkflow tests - Comprehensive test suite (15+ tests).
 *
 * Test Coverage:
 * 1. Device resolution (3 tests)
 * 2. Data gathering plans (5 tests)
 * 3. Context population (3 tests)
 * 4. Report generation (4 tests)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticWorkflow } from '../DiagnosticWorkflow.js';
import { DiagnosticIntent } from '../IntentClassifier.js';
import type { IntentClassification } from '../IntentClassifier.js';
import type { SemanticIndex } from '../SemanticIndex.js';
import type { IDeviceService } from '../interfaces.js';
import type { DeviceRegistry } from '../../abstract/DeviceRegistry.js';
import type { UnifiedDevice } from '../../types/unified-device.js';

// Mock dependencies
const createMockSemanticIndex = (): SemanticIndex =>
  ({
    searchDevices: vi.fn(),
  }) as any;

const createMockDeviceService = (): IDeviceService =>
  ({
    getDeviceStatus: vi.fn(),
    getDeviceEvents: vi.fn(),
    listDevices: vi.fn(),
    executeCommand: vi.fn(),
    getDevice: vi.fn(),
    getDeviceCapabilities: vi.fn(),
  }) as any;

const createMockDeviceRegistry = (): DeviceRegistry =>
  ({
    getDevice: vi.fn(),
    resolveDevice: vi.fn(),
    getAllDevices: vi.fn(),
    findDevices: vi.fn(),
  }) as any;

const createMockDevice = (id: string, name: string): UnifiedDevice =>
  ({
    id,
    name,
    label: name,
    platform: 'smartthings',
    capabilities: ['switch'],
    online: true,
    room: 'Living Room',
  }) as UnifiedDevice;

describe('DiagnosticWorkflow', () => {
  let workflow: DiagnosticWorkflow;
  let mockSemanticIndex: SemanticIndex;
  let mockDeviceService: IDeviceService;
  let mockDeviceRegistry: DeviceRegistry;

  beforeEach(() => {
    mockSemanticIndex = createMockSemanticIndex();
    mockDeviceService = createMockDeviceService();
    mockDeviceRegistry = createMockDeviceRegistry();

    workflow = new DiagnosticWorkflow(
      mockSemanticIndex,
      mockDeviceService,
      mockDeviceRegistry
    );
  });

  describe('Device Resolution', () => {
    it('should resolve device by exact ID', async () => {
      const mockDevice = createMockDevice('device-123', 'Living Room Light');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      expect(report.diagnosticContext.device).toEqual(mockDevice);
      expect(mockDeviceRegistry.getDevice).toHaveBeenCalledWith('device-123');
    });

    it('should resolve device by semantic search', async () => {
      const mockDevice = createMockDevice('device-456', 'Bedroom Motion Sensor');
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([
        {
          deviceId: 'device-456',
          score: 0.85,
          device: {
            deviceId: 'device-456',
            content: 'bedroom motion sensor',
            metadata: {
              name: 'Bedroom Motion Sensor',
              label: 'Bedroom Motion Sensor',
              room: 'Bedroom',
              capabilities: ['motionSensor'],
              platform: 'smartthings',
              online: true,
              tags: [],
            },
          },
        },
      ]);
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceName: 'bedroom motion sensor' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check sensor');

      expect(report.diagnosticContext.device).toEqual(mockDevice);
      expect(mockSemanticIndex.searchDevices).toHaveBeenCalledWith(
        'bedroom motion sensor',
        expect.objectContaining({ limit: 1, minSimilarity: 0.7 })
      );
    });

    it('should handle device resolution failure gracefully', async () => {
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(undefined);
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceName: 'nonexistent device' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      expect(report.diagnosticContext.device).toBeUndefined();
      expect(report.summary).toBeTruthy();
    });
  });

  describe('Data Gathering Plans', () => {
    it('should gather health data for DEVICE_HEALTH intent', async () => {
      const mockDevice = createMockDevice('device-123', 'Test Light');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        battery: 80,
        components: {},
      } as any);
      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: [],
        metadata: {
          totalCount: 0,
          hasMore: false,
          dateRange: { earliest: '', latest: '', durationMs: 0 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: 'No events',
      });
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check light');

      expect(report.diagnosticContext.healthData).toBeDefined();
      expect(report.diagnosticContext.recentEvents).toBeDefined();
      expect(report.diagnosticContext.similarDevices).toBeDefined();
      expect(mockDeviceService.getDeviceStatus).toHaveBeenCalled();
      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        'device-123',
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should gather comprehensive data for ISSUE_DIAGNOSIS intent', async () => {
      const mockDevice = createMockDevice('device-123', 'Problem Device');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);
      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: [],
        metadata: {
          totalCount: 0,
          hasMore: false,
          dateRange: { earliest: '', latest: '', durationMs: 0 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: 'No events',
      });
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'diagnose issue');

      expect(report.diagnosticContext.healthData).toBeDefined();
      expect(report.diagnosticContext.recentEvents).toBeDefined();
      expect(report.diagnosticContext.relatedIssues).toBeDefined();
      expect(mockDeviceService.getDeviceEvents).toHaveBeenCalledWith(
        'device-123',
        expect.objectContaining({ limit: 100 }) // More events for diagnosis
      );
    });

    it('should gather system status for SYSTEM_STATUS intent', async () => {
      const mockDevices = [
        createMockDevice('dev-1', 'Device 1'),
        createMockDevice('dev-2', 'Device 2'),
      ];
      mockDevices[1].online = false; // One offline device

      vi.mocked(mockDeviceRegistry.getAllDevices).mockReturnValue(mockDevices);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.SYSTEM_STATUS,
        confidence: 0.9,
        entities: {},
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'system status');

      expect(report.diagnosticContext.systemStatus).toBeDefined();
      expect(report.diagnosticContext.systemStatus?.totalDevices).toBe(2);
      expect(report.diagnosticContext.systemStatus?.healthyDevices).toBe(1);
      expect(report.diagnosticContext.systemStatus?.criticalDevices).toBe(1);
    });

    it('should gather similar devices for DISCOVERY intent', async () => {
      const mockDevice = createMockDevice('device-123', 'Main Sensor');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([
        {
          deviceId: 'device-456',
          score: 0.9,
          device: {
            deviceId: 'device-456',
            content: 'similar sensor',
            metadata: {
              name: 'Similar Sensor',
              label: 'Similar Sensor',
              capabilities: ['motionSensor'],
              platform: 'smartthings',
              online: true,
              tags: [],
            },
          },
        },
      ]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DISCOVERY,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: false,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'find similar');

      expect(report.diagnosticContext.similarDevices).toBeDefined();
      expect(report.diagnosticContext.similarDevices?.length).toBeGreaterThan(0);
    });

    it('should skip data gathering for NORMAL_QUERY intent', async () => {
      const classification: IntentClassification = {
        intent: DiagnosticIntent.NORMAL_QUERY,
        confidence: 0.9,
        entities: {},
        requiresDiagnostics: false,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'hello');

      expect(report.diagnosticContext.healthData).toBeUndefined();
      expect(report.diagnosticContext.recentEvents).toBeUndefined();
      expect(report.diagnosticContext.systemStatus).toBeUndefined();
    });
  });

  describe('Context Population', () => {
    it('should populate context from successful promises', async () => {
      const mockDevice = createMockDevice('device-123', 'Test Device');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        battery: 90,
        components: { main: { switch: { switch: { value: 'on' } } } },
      } as any);
      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: [
          {
            deviceId: 'device-123' as any,
            locationId: 'loc-1' as any,
            time: '2025-01-01T00:00:00Z',
            epoch: Date.now(),
            component: 'main',
            capability: 'switch' as any,
            attribute: 'switch',
            value: 'on',
          },
        ],
        metadata: {
          totalCount: 1,
          hasMore: false,
          dateRange: {
            earliest: '2025-01-01T00:00:00Z',
            latest: '2025-01-01T00:00:00Z',
            durationMs: 0,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '1 event',
      });
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      expect(report.diagnosticContext.healthData?.batteryLevel).toBe(90);
      expect(report.diagnosticContext.recentEvents?.length).toBe(1);
    });

    it('should handle partial failures gracefully', async () => {
      const mockDevice = createMockDevice('device-123', 'Test Device');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockDeviceService.getDeviceStatus).mockRejectedValue(new Error('API error'));
      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: [],
        metadata: {
          totalCount: 0,
          hasMore: false,
          dateRange: { earliest: '', latest: '', durationMs: 0 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: 'No events',
      });
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      // Should have events data even though health failed
      expect(report.diagnosticContext.healthData).toBeUndefined();
      expect(report.diagnosticContext.recentEvents).toBeDefined();
      expect(report.summary).toBeTruthy();
    });

    it('should handle complete failure gracefully', async () => {
      const mockDevice = createMockDevice('device-123', 'Test Device');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockDeviceService.getDeviceStatus).mockRejectedValue(new Error('API error'));
      vi.mocked(mockDeviceService.getDeviceEvents).mockRejectedValue(new Error('API error'));
      vi.mocked(mockSemanticIndex.searchDevices).mockRejectedValue(new Error('Search error'));

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      expect(report).toBeDefined();
      expect(report.summary).toBeTruthy();
      expect(report.diagnosticContext.device).toEqual(mockDevice);
    });
  });

  describe('Report Generation', () => {
    it('should generate rich context with device information', async () => {
      const mockDevice = createMockDevice('device-123', 'Test Light');
      mockDevice.manufacturer = 'Philips';
      mockDevice.model = 'Hue Bulb';

      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check light');

      expect(report.richContext).toContain('Test Light');
      expect(report.richContext).toContain('device-123');
      expect(report.richContext).toContain('Living Room');
      expect(report.richContext).toContain('Philips');
      expect(report.richContext).toContain('Hue Bulb');
    });

    it('should generate recommendations for offline devices', async () => {
      const mockDevice = createMockDevice('device-123', 'Offline Device');
      mockDevice.online = false;

      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);

      // Mock events to allow health data gathering
      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: [],
        metadata: {
          totalCount: 0,
          hasMore: false,
          dateRange: { earliest: '', latest: '', durationMs: 0 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: 'No events',
      });
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      // Should have health data with offline status
      expect(report.diagnosticContext.healthData?.online).toBe(false);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes('power') || r.includes('network'))).toBe(true);
    });

    it('should generate recommendations for low battery', async () => {
      const mockDevice = createMockDevice('device-123', 'Low Battery Device');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        battery: 15, // Low battery
        components: {},
      } as any);

      // Mock events to allow health data gathering
      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: [],
        metadata: {
          totalCount: 0,
          hasMore: false,
          dateRange: { earliest: '', latest: '', durationMs: 0 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: 'No events',
      });
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      // Should have battery warning
      expect(report.diagnosticContext.healthData?.batteryLevel).toBe(15);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.toLowerCase().includes('battery'))).toBe(true);
    });

    it('should include timestamp and confidence in report', async () => {
      const classification: IntentClassification = {
        intent: DiagnosticIntent.NORMAL_QUERY,
        confidence: 0.85,
        entities: {},
        requiresDiagnostics: false,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'hello');

      expect(report.timestamp).toBeTruthy();
      expect(new Date(report.timestamp)).toBeInstanceOf(Date);
      expect(report.confidence).toBe(0.85);
    });
  });

  describe('Performance', () => {
    it('should complete workflow within 500ms for typical case', async () => {
      const mockDevice = createMockDevice('device-123', 'Test Device');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);
      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);
      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: [],
        metadata: {
          totalCount: 0,
          hasMore: false,
          dateRange: { earliest: '', latest: '', durationMs: 0 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: 'No events',
      });
      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const startTime = Date.now();
      await workflow.executeDiagnosticWorkflow(classification, 'check device');
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(500);
    });
  });
});
