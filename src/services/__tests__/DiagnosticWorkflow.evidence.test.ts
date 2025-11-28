/**
 * Evidence-Based Recommendations Tests (Ticket 1M-345)
 *
 * Test suite to validate that diagnostic system ONLY reports observable evidence
 * and does NOT speculate without supporting data.
 *
 * Critical Requirements:
 * - NO motion sensor recommendation without motion sensor evidence
 * - NO scene/routine recommendation without schedule evidence
 * - Manufacturer app recommended FIRST for proprietary devices
 * - API limitations explicitly stated
 * - Zero speculation keywords in output
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticWorkflow } from '../DiagnosticWorkflow.js';
import { DiagnosticIntent } from '../IntentClassifier.js';
import type { IntentClassification } from '../IntentClassifier.js';
import type { IDeviceService } from '../interfaces.js';
import type { SemanticIndex } from '../SemanticIndex.js';
import type { DeviceRegistry } from '../../abstract/DeviceRegistry.js';
import type { UnifiedDevice } from '../../types/unified-device.js';
import type { DeviceEvent } from '../../types/device-events.js';
import type { DeviceId } from '../../types/smartthings.js';
import type { AutomationService } from '../AutomationService.js';
import type { ServiceContainer } from '../ServiceContainer.js';

// Mock device factory
function createMockDevice(
  id: string,
  label: string,
  manufacturer?: string
): UnifiedDevice {
  return {
    id: `smartthings:${id}` as any, // Universal device ID format
    platform: 'smartthings',
    label,
    name: label,
    manufacturer,
    model: 'Test Model',
    capabilities: ['switch'],
    online: true,
    room: 'Test Room',
  } as unknown as UnifiedDevice;
}

// Mock event factory
function createMockEvent(partial: Partial<DeviceEvent>): DeviceEvent {
  return {
    deviceId: 'device-123' as DeviceId,
    locationId: 'loc-1' as any,
    time: '2025-11-28T00:00:00Z',
    epoch: Date.now(),
    component: 'main',
    capability: 'switch' as any,
    attribute: 'switch',
    value: 'on',
    ...partial,
  };
}

describe('DiagnosticWorkflow - Evidence-Based Recommendations (1M-345)', () => {
  let workflow: DiagnosticWorkflow;
  let mockDeviceService: IDeviceService;
  let mockSemanticIndex: SemanticIndex;
  let mockDeviceRegistry: DeviceRegistry;
  let mockAutomationService: AutomationService;
  let mockServiceContainer: ServiceContainer;

  beforeEach(() => {
    // Create minimal mocks
    mockDeviceService = {
      getDeviceStatus: vi.fn(),
      getDeviceEvents: vi.fn(),
      listDevices: vi.fn(),
      executeCommand: vi.fn(),
      getDevice: vi.fn(),
      getDeviceCapabilities: vi.fn(),
    } as any;

    mockSemanticIndex = {
      searchDevices: vi.fn(),
    } as any;

    mockDeviceRegistry = {
      getDevice: vi.fn(),
      getAllDevices: vi.fn().mockReturnValue([]),
      resolveDevice: vi.fn(),
      findDevices: vi.fn(),
    } as any;

    mockAutomationService = {
      findRulesForDevice: vi.fn().mockResolvedValue([]), // Default: no automations
    } as any;

    mockServiceContainer = {
      getAutomationService: () => mockAutomationService,
    } as any;

    // Correct constructor parameter order: semanticIndex, deviceService, deviceRegistry, serviceContainer
    workflow = new DiagnosticWorkflow(
      mockSemanticIndex,
      mockDeviceService,
      mockDeviceRegistry,
      mockServiceContainer
    );
  });

  describe('TC-1: Sengled Alcove Bar Test Case', () => {
    it('should recommend Sengled app FIRST and NOT recommend motion sensors without evidence', async () => {
      const mockDevice = createMockDevice('device-123', 'Master Alcove Bar', 'Sengled');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      // Mock rapid re-trigger pattern (95% confidence)
      const mockEvents = [
        createMockEvent({
          time: '2025-11-28T00:34:44Z',
          epoch: 1732757684000,
          attribute: 'switch',
          value: 'off',
        }),
        createMockEvent({
          time: '2025-11-28T00:34:47Z',
          epoch: 1732757687000,
          attribute: 'switch',
          value: 'on',
        }), // 3s gap = 95% confidence automation trigger
      ];

      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: { main: { switch: { switch: { value: 'on' } } } },
      } as any);

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[1]!.time,
            durationMs: 3000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      // NO identified automations (simulating API limitation)

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        'why did Master Alcove Bar turn on at 12:34 AM?'
      );

      // MUST recommend Sengled app FIRST
      expect(report.recommendations.some((r) => r.includes('Sengled'))).toBe(true);
      expect(report.recommendations.some((r) => r.includes('Sengled Home'))).toBe(true);
      expect(report.recommendations.some((r) => r.includes('PRIORITY'))).toBe(true);

      // MUST explain API limitation
      expect(
        report.recommendations.some(
          (r) => r.includes('API') && r.toLowerCase().includes('limitation')
        )
      ).toBe(true);

      // MUST NOT recommend motion sensors (no motion sensor evidence)
      expect(report.recommendations.some((r) => r.toLowerCase().includes('motion'))).toBe(false);

      // MUST include observable evidence
      expect(report.recommendations.some((r) => r.includes('Evidence:'))).toBe(true);

      // Check for speculation keywords (should NOT exist)
      const speculationKeywords = ['may be', 'possibly', 'might', 'could be', 'likely'];
      const hasSpeculation = report.recommendations.some((r) =>
        speculationKeywords.some((keyword) => r.toLowerCase().includes(keyword))
      );
      expect(hasSpeculation).toBe(false);
    });
  });

  describe('TC-2: Motion Sensor Evidence Required', () => {
    it('should NOT recommend motion sensor check when no motion sensor in automations', async () => {
      const mockDevice = createMockDevice('device-123', 'Living Room Light');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const mockEvents = [
        createMockEvent({ time: '2025-11-28T01:00:00Z', value: 'off' }),
        createMockEvent({ time: '2025-11-28T01:00:03Z', value: 'on' }),
      ];

      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: { earliest: mockEvents[0]!.time, latest: mockEvents[1]!.time, durationMs: 3000 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      // Mock deviceService.getDevice() for automation identification
      vi.mocked(mockDeviceService.getDevice).mockResolvedValue({
        deviceId: 'device-123',
        locationId: 'loc-123',
      } as any);

      // Automation WITHOUT motion sensor
      const mockAutomationServiceWithFind = mockAutomationService as any;
      mockAutomationServiceWithFind.findRulesForDevice = vi.fn().mockResolvedValue([
        {
          ruleId: 'rule-123',
          ruleName: 'Evening Light Auto-On',
          deviceRoles: ['Switch'], // NO motion sensor
          status: 'enabled',
          triggeredAt: '2025-11-28T01:00:03Z',
          confidence: 0.95,
        },
      ]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'why is light weird?');

      // MUST NOT recommend motion sensor (no motion sensor evidence)
      expect(report.recommendations.some((r) => r.toLowerCase().includes('motion'))).toBe(false);

      // MUST have recommendations (automation pattern detected)
      expect(report.recommendations.length).toBeGreaterThan(0);

      // MUST recommend checking automations (since pattern detected)
      expect(
        report.recommendations.some((r) => r.toLowerCase().includes('automation'))
      ).toBe(true);
    });

    it('should recommend motion sensor check ONLY when motion sensor in automation evidence', async () => {
      const mockDevice = createMockDevice('device-123', 'Hallway Light');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const mockEvents = [
        createMockEvent({ time: '2025-11-28T02:00:00Z', value: 'off' }),
        createMockEvent({ time: '2025-11-28T02:00:02Z', value: 'on' }),
      ];

      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: { earliest: mockEvents[0]!.time, latest: mockEvents[1]!.time, durationMs: 2000 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      // Mock deviceService.getDevice() for automation identification
      vi.mocked(mockDeviceService.getDevice).mockResolvedValue({
        deviceId: 'device-123',
        locationId: 'loc-123',
      } as any);

      // Automation WITH motion sensor
      const mockAutomationServiceWithFind = mockAutomationService as any;
      mockAutomationServiceWithFind.findRulesForDevice = vi.fn().mockResolvedValue([
        {
          ruleId: 'rule-456',
          ruleName: 'Motion Sensor Light Control',
          deviceRoles: ['Motion Sensor', 'Switch'], // Motion sensor present
          status: 'enabled',
          triggeredAt: '2025-11-28T02:00:02Z',
          confidence: 0.98,
        },
      ]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'hallway light issue');

      // Debug: Check if automation data was integrated
      expect(report.diagnosticContext.identifiedAutomations).toBeDefined();
      expect(report.diagnosticContext.identifiedAutomations?.length).toBeGreaterThan(0);

      // NOW motion sensor recommendation should appear (because automation has motion sensor role)
      expect(report.recommendations.some((r) => r.toLowerCase().includes('motion'))).toBe(true);

      // MUST include evidence-based language
      expect(
        report.recommendations.some((r) => r.includes('Evidence:') || r.includes('Action:'))
      ).toBe(true);
    });
  });

  describe('TC-3: Manufacturer App Prioritization', () => {
    it.each([
      ['Sengled', 'Sengled Home'],
      ['Philips', 'Philips Hue'],
      ['LIFX', 'LIFX'],
      ['Wyze', 'Wyze'],
      ['TP-Link', 'Kasa Smart'],
    ])('should recommend %s app for %s manufacturer', async (manufacturer, expectedApp) => {
      const mockDevice = createMockDevice('device-123', 'Test Device', manufacturer);
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const mockEvents = [
        createMockEvent({ time: '2025-11-28T03:00:00Z', value: 'off' }),
        createMockEvent({ time: '2025-11-28T03:00:02Z', value: 'on' }),
      ];

      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: { earliest: mockEvents[0]!.time, latest: mockEvents[1]!.time, durationMs: 2000 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'device issue');

      // MUST recommend manufacturer app
      expect(report.recommendations.some((r) => r.includes(expectedApp))).toBe(true);
      expect(report.recommendations.some((r) => r.includes('PRIORITY'))).toBe(true);
    });

    it('should NOT recommend manufacturer app for non-proprietary manufacturers', async () => {
      const mockDevice = createMockDevice('device-123', 'Generic Switch', 'Samsung SmartThings');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const mockEvents = [
        createMockEvent({ time: '2025-11-28T04:00:00Z', value: 'off' }),
        createMockEvent({ time: '2025-11-28T04:00:02Z', value: 'on' }),
      ];

      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: { earliest: mockEvents[0]!.time, latest: mockEvents[1]!.time, durationMs: 2000 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'device issue');

      // Should NOT have manufacturer app recommendation
      expect(report.recommendations.some((r) => r.includes('Samsung SmartThings app'))).toBe(false);
    });
  });

  describe('TC-4: Evidence-Based Language', () => {
    it('should use evidence-based template for all recommendations', async () => {
      const mockDevice = createMockDevice('device-123', 'Test Light', 'Sengled');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const mockEvents = [
        createMockEvent({ time: '2025-11-28T05:00:00Z', value: 'off' }),
        createMockEvent({ time: '2025-11-28T05:00:02Z', value: 'on' }),
      ];

      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: { earliest: mockEvents[0]!.time, latest: mockEvents[1]!.time, durationMs: 2000 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'light issue');

      // All recommendations should follow evidence-based template
      const evidenceKeywords = ['Evidence:', 'Action:', 'Observable', 'Observation:'];
      const hasEvidenceLanguage = report.recommendations.some((r) =>
        evidenceKeywords.some((keyword) => r.includes(keyword))
      );
      expect(hasEvidenceLanguage).toBe(true);

      // NO speculation keywords allowed
      const speculationKeywords = ['may be', 'possibly', 'might', 'could be'];
      const hasSpeculation = report.recommendations.some((r) =>
        speculationKeywords.some((keyword) => r.toLowerCase().includes(keyword))
      );
      expect(hasSpeculation).toBe(false);
    });
  });

  describe('TC-5: API Limitation Reporting', () => {
    it('should explicitly state API limitations when automation identification fails', async () => {
      const mockDevice = createMockDevice('device-123', 'Mystery Light');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      const mockEvents = [
        createMockEvent({ time: '2025-11-28T06:00:00Z', value: 'off' }),
        createMockEvent({ time: '2025-11-28T06:00:02Z', value: 'on' }),
      ];

      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: { earliest: mockEvents[0]!.time, latest: mockEvents[1]!.time, durationMs: 2000 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'why weird light?');

      // MUST explicitly state API limitation
      expect(
        report.recommendations.some((r) => r.includes('API Limitation') || r.includes('API limitation'))
      ).toBe(true);

      // MUST provide manual investigation guidance
      expect(
        report.recommendations.some(
          (r) => r.includes('Manual') || r.toLowerCase().includes('open smartthings app')
        )
      ).toBe(true);
    });
  });

  describe('TC-6: High Confidence Pattern Detection', () => {
    it('should report high confidence evidence with specific observable patterns', async () => {
      const mockDevice = createMockDevice('device-123', 'Test Switch');
      vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

      // Very short gap = very high confidence
      const mockEvents = [
        createMockEvent({ time: '2025-11-28T07:00:00Z', value: 'off' }),
        createMockEvent({ time: '2025-11-28T07:00:01Z', value: 'on' }), // 1s gap = 98% confidence
      ];

      vi.mocked(mockDeviceService.getDeviceStatus).mockResolvedValue({
        deviceId: 'device-123',
        components: {},
      } as any);

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: { earliest: mockEvents[0]!.time, latest: mockEvents[1]!.time, durationMs: 1000 },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      vi.mocked(mockSemanticIndex.searchDevices).mockResolvedValue([]);

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'switch issue');

      // Should report high confidence with evidence
      expect(report.recommendations.some((r) => r.includes('Evidence:'))).toBe(true);
      expect(
        report.recommendations.some((r) => r.includes('%') && r.includes('confidence'))
      ).toBe(true);
      expect(
        report.recommendations.some((r) => r.toLowerCase().includes('observable pattern'))
      ).toBe(true);
    });
  });
});
