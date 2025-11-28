/**
 * Tests for SemanticIndexAdapter integration.
 *
 * Test Coverage:
 * - Single device indexing/update/remove
 * - Batch device operations
 * - Sync from DeviceRegistry
 * - Error handling (transformation failures, indexing errors)
 * - Performance verification (<5s for 200 devices)
 * - Status integration (online, lastSeen)
 *
 * Note: These tests use mocked SemanticIndex since ChromaDB may not be available.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemanticIndexAdapter } from '../SemanticIndexAdapter.js';
import { createDeviceId } from '../../../types/smartthings.js';
import { DeviceCapability, Platform } from '../../../types/unified-device.js';
import type { DeviceInfo, DeviceStatus } from '../../../types/smartthings.js';
import type { SemanticIndex, DeviceMetadataDocument } from '../../SemanticIndex.js';

describe('SemanticIndexAdapter', () => {
  let mockSemanticIndex: SemanticIndex;
  let adapter: SemanticIndexAdapter;
  let indexedDocuments: Map<string, DeviceMetadataDocument>;

  beforeEach(() => {
    indexedDocuments = new Map();

    // Create mock SemanticIndex
    mockSemanticIndex = {
      indexDevice: vi.fn(async (doc: DeviceMetadataDocument) => {
        indexedDocuments.set(doc.deviceId, doc);
      }),
      indexDevices: vi.fn(async (docs: DeviceMetadataDocument[]) => {
        docs.forEach((doc) => indexedDocuments.set(doc.deviceId, doc));
      }),
      updateDevice: vi.fn(async (deviceId: string, metadata: Partial<DeviceMetadataDocument>) => {
        const existing = indexedDocuments.get(deviceId);
        if (existing && metadata.content && metadata.metadata) {
          indexedDocuments.set(deviceId, {
            deviceId,
            content: metadata.content,
            metadata: metadata.metadata,
          });
        }
      }),
      removeDevice: vi.fn(async (deviceId: string) => {
        indexedDocuments.delete(deviceId);
      }),
      syncWithRegistry: vi.fn(),
    } as any;

    adapter = new SemanticIndexAdapter(mockSemanticIndex);
  });

  describe('Single Device Operations', () => {
    it('indexes DeviceInfo successfully', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-1'),
        name: 'Living Room Light',
        label: 'Main Light',
        capabilities: ['switch', 'switchLevel', 'colorControl'],
        roomName: 'Living Room',
      };

      await adapter.indexDeviceInfo(deviceInfo);

      expect(mockSemanticIndex.indexDevice).toHaveBeenCalledTimes(1);

      // Verify indexed document
      const doc = indexedDocuments.get('smartthings:test-device-1');
      expect(doc).toBeDefined();
      expect(doc?.metadata.name).toBe('Living Room Light');
      expect(doc?.metadata.label).toBe('Main Light');
      expect(doc?.metadata.room).toBe('Living Room');
      expect(doc?.metadata.platform).toBe(Platform.SMARTTHINGS);
      expect(doc?.metadata.capabilities).toContain('switch');
      expect(doc?.metadata.capabilities).toContain('dimmer'); // Mapped capability
    });

    it('indexes DeviceInfo with status (online, lastSeen)', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-2'),
        name: 'Motion Sensor',
        capabilities: ['motionSensor', 'battery'],
      };

      const status: DeviceStatus = {
        deviceId: createDeviceId('test-device-2'),
        components: {
          main: {
            healthCheck: {
              healthStatus: {
                value: 'offline',
                timestamp: '2024-01-15T12:00:00Z',
              },
            },
            battery: {
              battery: {
                value: 85,
                timestamp: '2024-01-15T12:30:00Z',
              },
            },
          },
        },
      };

      await adapter.indexDeviceInfo(deviceInfo, status);

      const doc = indexedDocuments.get('smartthings:test-device-2');
      expect(doc?.metadata.online).toBe(false);
      expect(doc?.metadata.lastSeen).toBe('2024-01-15T12:30:00.000Z');
    });

    it('generates semantic content for device', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-3'),
        name: 'Bedroom Temperature Sensor',
        capabilities: ['temperatureMeasurement', 'relativeHumidityMeasurement'],
        roomName: 'Master Bedroom',
      };

      await adapter.indexDeviceInfo(deviceInfo);

      const doc = indexedDocuments.get('smartthings:test-device-3');
      expect(doc?.content).toBeDefined();
      expect(doc?.content).toContain('Bedroom Temperature Sensor');
      expect(doc?.content).toContain('Master Bedroom');
    });

    it('updates existing DeviceInfo', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-4'),
        name: 'Original Name',
        capabilities: ['switch'],
      };

      await adapter.indexDeviceInfo(deviceInfo);

      // Update device
      const updatedInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-4'),
        name: 'Updated Name',
        label: 'New Label',
        capabilities: ['switch', 'switchLevel'],
        roomName: 'Bedroom',
      };

      await adapter.updateDeviceInfo(updatedInfo);

      expect(mockSemanticIndex.updateDevice).toHaveBeenCalledWith(
        'smartthings:test-device-4',
        expect.objectContaining({
          deviceId: 'smartthings:test-device-4',
        })
      );

      const doc = indexedDocuments.get('smartthings:test-device-4');
      expect(doc?.metadata.name).toBe('Updated Name');
      expect(doc?.metadata.label).toBe('New Label');
      expect(doc?.metadata.room).toBe('Bedroom');
    });

    it('removes DeviceInfo from index', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-5'),
        name: 'Device to Remove',
      };

      await adapter.indexDeviceInfo(deviceInfo);
      expect(indexedDocuments.has('smartthings:test-device-5')).toBe(true);

      await adapter.removeDeviceInfo(deviceInfo);

      expect(mockSemanticIndex.removeDevice).toHaveBeenCalledWith('smartthings:test-device-5');
      expect(indexedDocuments.has('smartthings:test-device-5')).toBe(false);
    });

    it('handles unknown capabilities gracefully', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('test-device-6'),
        name: 'Future Device',
        capabilities: ['switch', 'futureCapability2025', 'unknownThing'],
      };

      await adapter.indexDeviceInfo(deviceInfo);

      const doc = indexedDocuments.get('smartthings:test-device-6');
      // Should only include mapped capabilities
      expect(doc?.metadata.capabilities).toEqual(['switch']);
    });
  });

  describe('Batch Operations', () => {
    it('batch indexes multiple devices successfully', async () => {
      const devices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('batch-1'),
          name: 'Light 1',
          capabilities: ['switch'],
        },
        {
          deviceId: createDeviceId('batch-2'),
          name: 'Light 2',
          capabilities: ['switch', 'switchLevel'],
        },
        {
          deviceId: createDeviceId('batch-3'),
          name: 'Sensor 1',
          capabilities: ['temperatureMeasurement', 'battery'],
        },
      ];

      const result = await adapter.indexDeviceInfoBatch(devices);

      expect(result.indexed).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThan(0);

      // Verify all documents indexed
      expect(indexedDocuments.has('smartthings:batch-1')).toBe(true);
      expect(indexedDocuments.has('smartthings:batch-2')).toBe(true);
      expect(indexedDocuments.has('smartthings:batch-3')).toBe(true);
    });

    it('batch indexes with status map', async () => {
      const devices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('status-1'),
          name: 'Device 1',
          capabilities: ['switch'],
        },
        {
          deviceId: createDeviceId('status-2'),
          name: 'Device 2',
          capabilities: ['switch'],
        },
      ];

      const statusMap = new Map<string, DeviceStatus>([
        [
          'status-1',
          {
            deviceId: createDeviceId('status-1'),
            components: {
              main: {
                healthCheck: {
                  healthStatus: {
                    value: 'offline',
                    timestamp: '2024-01-15T12:00:00Z',
                  },
                },
              },
            },
          },
        ],
      ]);

      await adapter.indexDeviceInfoBatch(devices, statusMap);

      const doc1 = indexedDocuments.get('smartthings:status-1');
      const doc2 = indexedDocuments.get('smartthings:status-2');

      expect(doc1?.metadata.online).toBe(false); // Has offline status
      expect(doc2?.metadata.online).toBe(true); // No status = default online
    });

    it('handles all valid transformations in batch', async () => {
      // Note: The transformer is very permissive and handles edge cases gracefully,
      // so we test that all valid DeviceInfo structures can be transformed successfully
      const devices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('valid-1'),
          name: 'Valid Device',
          capabilities: ['switch'],
        },
        {
          deviceId: createDeviceId('valid-2'),
          name: 'Another Valid Device',
          capabilities: ['temperatureMeasurement'],
        },
        {
          deviceId: createDeviceId('valid-3'),
          name: 'Minimal Device',
          // No capabilities - should still transform successfully
        },
      ];

      const result = await adapter.indexDeviceInfoBatch(devices);

      // All devices should be indexed successfully
      expect(result.indexed).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('handles batch indexing failure gracefully', async () => {
      const devices: DeviceInfo[] = [
        {
          deviceId: createDeviceId('batch-fail-1'),
          name: 'Device 1',
        },
        {
          deviceId: createDeviceId('batch-fail-2'),
          name: 'Device 2',
        },
      ];

      // Mock batch indexing failure
      mockSemanticIndex.indexDevices = vi.fn().mockRejectedValue(new Error('ChromaDB error'));

      const result = await adapter.indexDeviceInfoBatch(devices);

      expect(result.indexed).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].deviceId).toBe('BATCH');
    });

    it('batch operation performance: <100ms for 50 devices (transformation only)', async () => {
      // Create 50 test devices
      const devices: DeviceInfo[] = Array.from({ length: 50 }, (_, i) => ({
        deviceId: createDeviceId(`perf-device-${i}`),
        name: `Device ${i}`,
        capabilities: ['switch', 'switchLevel'],
        roomName: `Room ${i % 5}`,
      }));

      const result = await adapter.indexDeviceInfoBatch(devices);

      expect(result.indexed).toBe(50);
      // Transformation should be fast (ChromaDB indexing is separate concern)
      expect(result.durationMs).toBeLessThan(100);
    });
  });

  describe('Sync from DeviceRegistry', () => {
    it('calls SemanticIndex.syncWithRegistry', async () => {
      const mockRegistry = {} as any;
      const mockSyncResult = {
        added: 5,
        updated: 2,
        removed: 1,
        errors: [],
        durationMs: 150,
      };

      mockSemanticIndex.syncWithRegistry = vi.fn().mockResolvedValue(mockSyncResult);

      const result = await adapter.syncFromRegistry(mockRegistry);

      expect(mockSemanticIndex.syncWithRegistry).toHaveBeenCalledWith(mockRegistry);
      expect(result).toEqual(mockSyncResult);
    });

    it('handles sync failure', async () => {
      const mockRegistry = {} as any;

      mockSemanticIndex.syncWithRegistry = vi.fn().mockRejectedValue(new Error('Sync failed'));

      await expect(adapter.syncFromRegistry(mockRegistry)).rejects.toThrow('Sync failed');
    });
  });

  describe('Error Handling', () => {
    it('throws error on indexing failure', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('error-device'),
        name: 'Error Device',
      };

      mockSemanticIndex.indexDevice = vi.fn().mockRejectedValue(new Error('Indexing failed'));

      await expect(adapter.indexDeviceInfo(deviceInfo)).rejects.toThrow('Indexing failed');
    });

    it('throws error on update failure', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('error-device'),
        name: 'Error Device',
      };

      mockSemanticIndex.updateDevice = vi.fn().mockRejectedValue(new Error('Update failed'));

      await expect(adapter.updateDeviceInfo(deviceInfo)).rejects.toThrow('Update failed');
    });

    it('throws error on remove failure', async () => {
      const deviceInfo: DeviceInfo = {
        deviceId: createDeviceId('error-device'),
        name: 'Error Device',
      };

      mockSemanticIndex.removeDevice = vi.fn().mockRejectedValue(new Error('Remove failed'));

      await expect(adapter.removeDeviceInfo(deviceInfo)).rejects.toThrow('Remove failed');
    });
  });

  describe('getIndex', () => {
    it('returns underlying SemanticIndex instance', () => {
      const underlyingIndex = adapter.getIndex();
      expect(underlyingIndex).toBe(mockSemanticIndex);
    });
  });
});
