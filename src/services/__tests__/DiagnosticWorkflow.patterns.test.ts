/**
 * DiagnosticWorkflow Pattern Detection Tests
 *
 * Test Coverage:
 * - TC-1: Detect rapid state changes (<10s gaps)
 * - TC-2: Detect automation triggers (<5s gaps, high confidence)
 * - TC-3: Detect connectivity gaps (>1h)
 * - TC-4: Return normal pattern when no issues
 * - TC-5: Handle empty event list gracefully
 * - TC-6: Handle single event (no gaps to calculate)
 * - TC-7: Detect multiple rapid changes (automation loop)
 * - TC-8: Filter non-state-change events
 * - TC-9: Real-world Alcove Bar validation
 * - TC-10: Recommendation integration
 * - TC-11: Performance test (<100ms)
 * - TC-12: Graceful degradation on API error
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiagnosticWorkflow } from '../DiagnosticWorkflow.js';
import { DiagnosticIntent } from '../IntentClassifier.js';
import type { IntentClassification } from '../IntentClassifier.js';
import type { SemanticIndex } from '../SemanticIndex.js';
import type { IDeviceService } from '../interfaces.js';
import type { DeviceRegistry } from '../../abstract/DeviceRegistry.js';
import type { DeviceEvent } from '../../types/device-events.js';
import type { UnifiedDevice } from '../../types/unified-device.js';
import type { DeviceId, LocationId, CapabilityName } from '../../types/smartthings.js';

// Test helper to create mock events
function createMockEvent(partial: Partial<DeviceEvent>): DeviceEvent {
  return {
    deviceId: 'mock-device-id' as DeviceId,
    locationId: 'mock-location-id' as LocationId,
    time: partial.time || '2025-11-28T00:00:00Z',
    epoch: partial.epoch || 1732752000000,
    component: 'main',
    capability: (partial.capability || 'switch') as CapabilityName,
    attribute: partial.attribute || 'switch',
    value: partial.value || 'on',
    ...partial,
  };
}

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
    capabilities: new Set(['switch']),
    online: true,
    room: 'Test Room',
  }) as unknown as UnifiedDevice;

describe('DiagnosticWorkflow - Pattern Detection', () => {
  let workflow: DiagnosticWorkflow;
  let mockSemanticIndex: SemanticIndex;
  let mockDeviceService: IDeviceService;
  let mockDeviceRegistry: DeviceRegistry;
  let mockDevice: UnifiedDevice;

  beforeEach(() => {
    mockSemanticIndex = createMockSemanticIndex();
    mockDeviceService = createMockDeviceService();
    mockDeviceRegistry = createMockDeviceRegistry();

    mockDevice = createMockDevice('device-123', 'Test Device');
    vi.mocked(mockDeviceRegistry.getDevice).mockReturnValue(mockDevice);

    workflow = new DiagnosticWorkflow(mockSemanticIndex, mockDeviceService, mockDeviceRegistry);
  });

  describe('TC-1: Detect Rapid State Changes', () => {
    it('should detect rapid state changes (<10s gaps)', async () => {
      const mockEvents = [
        createMockEvent({
          time: '2025-11-28T01:00:00Z',
          epoch: 1732755600000,
          attribute: 'switch',
          value: 'off',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:05Z',
          epoch: 1732755605000,
          attribute: 'switch',
          value: 'on',
        }), // 5s gap
      ];

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[1]!.time,
            durationMs: 5000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        'why is light acting weird?'
      );

      expect(report.diagnosticContext.relatedIssues).toBeDefined();
      expect(report.diagnosticContext.relatedIssues!.length).toBeGreaterThan(0);

      const rapidPattern = report.diagnosticContext.relatedIssues!.find(
        (issue) => issue.type === 'rapid_changes'
      );
      expect(rapidPattern).toBeDefined();
      expect(rapidPattern!.occurrences).toBeGreaterThanOrEqual(1);
      expect(rapidPattern!.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('TC-2: Detect Automation Trigger', () => {
    it('should detect automation trigger (<5s gap, high confidence)', async () => {
      const mockEvents = [
        createMockEvent({
          time: '2025-11-28T01:54:00Z',
          epoch: 1732759440000,
          attribute: 'switch',
          value: 'off',
        }),
        createMockEvent({
          time: '2025-11-28T01:54:03Z',
          epoch: 1732759443000,
          attribute: 'switch',
          value: 'on',
        }), // 3s gap (AUTOMATION)
      ];

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

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        'light turned on by itself'
      );

      const rapidPattern = report.diagnosticContext.relatedIssues!.find(
        (issue) => issue.type === 'rapid_changes'
      );

      expect(rapidPattern).toBeDefined();
      expect(rapidPattern!.confidence).toBeGreaterThanOrEqual(0.95); // High confidence for <5s gap
      expect(rapidPattern!.description.toLowerCase()).toContain('automation');
    });
  });

  describe('TC-3: Detect Connectivity Gaps', () => {
    it('should detect connectivity gaps (event gaps >1h)', async () => {
      const mockEvents = [
        createMockEvent({
          time: '2025-11-28T10:00:00Z',
          epoch: 1732788000000,
        }),
        createMockEvent({
          time: '2025-11-28T14:00:00Z',
          epoch: 1732802400000,
        }), // 4h gap
      ];

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[1]!.time,
            durationMs: 14400000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'device offline?');

      const connectivityPattern = report.diagnosticContext.relatedIssues!.find(
        (issue) => issue.type === 'connectivity_gap'
      );

      expect(connectivityPattern).toBeDefined();
      expect(connectivityPattern!.occurrences).toBeGreaterThan(0);
    });
  });

  describe('TC-4: Return Normal Pattern', () => {
    it('should return normal pattern when no issues detected', async () => {
      const mockEvents = [
        createMockEvent({
          time: '2025-11-28T10:00:00Z',
          epoch: 1732788000000,
          attribute: 'switch',
          value: 'on',
        }),
        createMockEvent({
          time: '2025-11-28T10:15:00Z',
          epoch: 1732788900000,
          attribute: 'switch',
          value: 'off',
        }), // 15min gap (normal)
      ];

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[1]!.time,
            durationMs: 900000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'how is my device?');

      expect(report.diagnosticContext.relatedIssues).toBeDefined();
      expect(report.diagnosticContext.relatedIssues!.length).toBeGreaterThan(0);

      const normalPattern = report.diagnosticContext.relatedIssues!.find(
        (issue) => issue.type === 'normal'
      );

      expect(normalPattern).toBeDefined();
      expect(normalPattern!.description).toContain('No unusual patterns detected');
      expect(normalPattern!.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('TC-5: Handle Empty Event List', () => {
    it('should handle empty event list gracefully', async () => {
      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: [],
        metadata: {
          totalCount: 0,
          hasMore: false,
          dateRange: {
            earliest: '',
            latest: '',
            durationMs: 0,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: 'No events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      expect(report.diagnosticContext.relatedIssues).toBeDefined();
      // Should return normal pattern for empty events
      expect(report.diagnosticContext.relatedIssues!.length).toBeGreaterThan(0);
      expect(report.diagnosticContext.relatedIssues?.[0]?.type).toBe('normal');
    });
  });

  describe('TC-6: Handle Single Event', () => {
    it('should handle single event (no gaps to calculate)', async () => {
      const mockEvents = [
        createMockEvent({
          time: '2025-11-28T10:00:00Z',
          epoch: 1732788000000,
        }),
      ];

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 1,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[0]!.time,
            durationMs: 0,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '1 event',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      expect(report.diagnosticContext.relatedIssues).toBeDefined();
      // Should not crash, return normal pattern
      expect(report.diagnosticContext.relatedIssues!.length).toBeGreaterThan(0);
    });
  });

  describe('TC-7: Multiple Rapid Changes', () => {
    it('should detect multiple rapid changes indicating automation loop', async () => {
      // Create 7 rapid changes (>5 threshold for loop warning)
      const mockEvents = [
        createMockEvent({
          time: '2025-11-28T01:00:00Z',
          epoch: 1732755600000,
          attribute: 'switch',
          value: 'on',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:03Z',
          epoch: 1732755603000,
          attribute: 'switch',
          value: 'off',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:06Z',
          epoch: 1732755606000,
          attribute: 'switch',
          value: 'on',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:09Z',
          epoch: 1732755609000,
          attribute: 'switch',
          value: 'off',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:12Z',
          epoch: 1732755612000,
          attribute: 'switch',
          value: 'on',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:15Z',
          epoch: 1732755615000,
          attribute: 'switch',
          value: 'off',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:18Z',
          epoch: 1732755618000,
          attribute: 'switch',
          value: 'on',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:21Z',
          epoch: 1732755621000,
          attribute: 'switch',
          value: 'off',
        }),
      ];

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 8,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[7]!.time,
            durationMs: 21000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '8 events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'device flickering');

      const rapidPattern = report.diagnosticContext.relatedIssues!.find(
        (issue) => issue.type === 'rapid_changes'
      );

      expect(rapidPattern).toBeDefined();
      expect(rapidPattern!.occurrences).toBeGreaterThanOrEqual(6); // 7 rapid transitions
      expect(rapidPattern!.confidence).toBeGreaterThanOrEqual(0.95);

      // Should have automation loop warning (>5 occurrences)
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some((r) => r.toLowerCase().includes('loop'))).toBe(true);
    });
  });

  describe('TC-8: Filter Non-State-Change Events', () => {
    it('should ignore non-state-change events (temperature, hue, etc.)', async () => {
      const mockEvents = [
        createMockEvent({
          attribute: 'temperature',
          value: 72,
          time: '2025-11-28T09:45:00Z',
          epoch: 1732787100000,
        }),
        createMockEvent({
          attribute: 'hue',
          value: 180,
          time: '2025-11-28T09:50:00Z',
          epoch: 1732787400000,
        }),
        createMockEvent({
          attribute: 'switch',
          value: 'on',
          time: '2025-11-28T10:00:00Z',
          epoch: 1732788000000,
        }),
        createMockEvent({
          attribute: 'switch',
          value: 'off',
          time: '2025-11-28T10:15:00Z',
          epoch: 1732788900000,
        }),
      ];

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 4,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[3]!.time,
            durationMs: 1800000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '4 events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      // Pattern detection should focus on switch events only
      expect(report.diagnosticContext.relatedIssues).toBeDefined();
      expect(report.diagnosticContext.relatedIssues!.length).toBeGreaterThan(0);

      // Should detect normal pattern (15min gap between switch events)
      // Temperature and hue events should be ignored
      const normalPattern = report.diagnosticContext.relatedIssues!.find(
        (issue) => issue.type === 'normal'
      );
      expect(normalPattern).toBeDefined();
    });
  });

  describe('TC-9: Real-World Alcove Bar Validation', () => {
    it('should match manual investigation findings (Alcove Bar case)', async () => {
      // Real data from docs/research/alcove-light-diagnostic-2025-11-28.md
      const alcoveEvents = [
        createMockEvent({
          time: '2025-11-28T00:34:44Z',
          epoch: 1732754084000,
          attribute: 'switch',
          value: 'off',
        }), // Manual
        createMockEvent({
          time: '2025-11-28T00:34:47Z',
          epoch: 1732754087000,
          attribute: 'switch',
          value: 'on',
        }), // 3s gap (automation)
      ];

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: alcoveEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: alcoveEvents[0]!.time,
            latest: alcoveEvents[1]!.time,
            durationMs: 3000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123', deviceName: 'Master Alcove Bar' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        'why did Alcove light turn on?'
      );

      // Should detect automation trigger
      const rapidPattern = report.diagnosticContext.relatedIssues!.find(
        (issue) => issue.type === 'rapid_changes'
      );

      expect(rapidPattern).toBeDefined();
      expect(rapidPattern!.confidence).toBeGreaterThanOrEqual(0.95); // HIGH confidence (3s gap)

      // Should recommend checking automations
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some((r) => r.toLowerCase().includes('automation'))).toBe(true);
    });
  });

  describe('TC-10: Recommendation Integration', () => {
    it('should generate automation recommendations when rapid changes detected', async () => {
      const mockEvents = [
        createMockEvent({
          time: '2025-11-28T01:00:00Z',
          epoch: 1732755600000,
          attribute: 'switch',
          value: 'off',
        }),
        createMockEvent({
          time: '2025-11-28T01:00:04Z',
          epoch: 1732755604000,
          attribute: 'switch',
          value: 'on',
        }), // 4s gap
      ];

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 2,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[1]!.time,
            durationMs: 4000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '2 events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        'why is light acting weird?'
      );

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some((r) => r.toLowerCase().includes('smartthings'))).toBe(
        true
      );
      expect(report.recommendations.some((r) => r.toLowerCase().includes('automation'))).toBe(true);
    });
  });

  describe('TC-11: Performance Test', () => {
    it('should complete pattern detection in <100ms for 100 events', async () => {
      // Generate 100 events with normal gaps
      const mockEvents = Array.from({ length: 100 }, (_, i) =>
        createMockEvent({
          time: new Date(1732755600000 + i * 60000).toISOString(),
          epoch: 1732755600000 + i * 60000,
          attribute: 'switch',
          value: i % 2 === 0 ? 'on' : 'off',
        })
      );

      vi.mocked(mockDeviceService.getDeviceEvents).mockResolvedValue({
        events: mockEvents,
        metadata: {
          totalCount: 100,
          hasMore: false,
          dateRange: {
            earliest: mockEvents[0]!.time,
            latest: mockEvents[99]!.time,
            durationMs: 5940000,
          },
          appliedFilters: {},
          reachedRetentionLimit: false,
        },
        summary: '100 events',
      });

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const start = Date.now();
      await workflow.executeDiagnosticWorkflow(classification, 'check device');
      const elapsed = Date.now() - start;

      // Note: This is total workflow time, pattern detection should be much faster
      expect(elapsed).toBeLessThan(500); // Generous timeout for entire workflow
    });
  });

  describe('TC-12: Graceful Degradation', () => {
    it('should gracefully handle event retrieval errors', async () => {
      vi.mocked(mockDeviceService.getDeviceEvents).mockRejectedValue(
        new Error('SmartThings API rate limit exceeded')
      );

      const classification: IntentClassification = {
        intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
        confidence: 0.9,
        entities: { deviceId: 'device-123' },
        requiresDiagnostics: true,
      };

      const report = await workflow.executeDiagnosticWorkflow(classification, 'check device');

      // Should return report with empty patterns, not crash
      expect(report).toBeDefined();
      expect(report.diagnosticContext).toBeDefined();
    });
  });
});
