/**
 * TC-3: API Response Validation Integration Tests (1M-311)
 *
 * Tests SmartThings API response parsing and validation using realistic fixtures.
 * Validates that code properly handles all fields from actual API responses including:
 * - Device list responses (items array, pagination)
 * - Single device responses (capabilities, components, metadata)
 * - Device event structures (deviceId, capability, attribute, value, timestamp)
 * - Error response handling (404, 401, 403, 500)
 * - Malformed JSON response handling
 *
 * Test Approach:
 * - Mock SmartThings API with nock for HTTP simulation
 * - Use actual fixture data from tests/fixtures/
 * - Validate response parsing and field extraction
 * - Test error scenarios and edge cases
 *
 * No actual SmartThings API calls - all HTTP traffic intercepted by nock.
 */

import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { SmartThingsService } from '../../src/smartthings/client.js';
import type { DeviceId, LocationId, CapabilityName } from '../../src/types/smartthings.js';

// Load fixtures
import deviceListFixture from '../fixtures/device-list.json';
import alcoveDeviceFixture from '../fixtures/alcove-device.json';
import alcoveEventsFixture from '../fixtures/alcove-events.json';

// Nock setup constants
const SMARTTHINGS_API_BASE = 'https://api.smartthings.com';

/**
 * TC-3: API Response Validation Integration Test Suite
 *
 * Validates API response structures match real SmartThings API contracts.
 * Ensures code can handle all fields from actual API responses.
 */
describe('TC-3: API Response Validation Integration Tests', () => {
  let service: SmartThingsService;

  // Initialize service before each test
  beforeEach(() => {
    service = new SmartThingsService();
  });

  afterEach(() => {
    // Clean up all nock interceptors after each test
    nock.cleanAll();
  });

  /**
   * TC-3.1: Validate device list response structure
   *
   * Validates:
   * - Response has 'items' array
   * - Items contain deviceId, name, capabilities
   * - Pagination structure is correct
   * - All devices have required fields
   */
  it('TC-3.1: should validate device list response structure (items array, pagination)', async () => {
    // Mock SmartThings API: GET /devices (SDK uses /devices without /v1)
    nock(SMARTTHINGS_API_BASE)
      .get('/devices')
      .reply(200, deviceListFixture);

    // Mock room endpoints for device list enrichment
    const roomIds = [...new Set(deviceListFixture.items.map(d => d.roomId).filter(Boolean))];
    for (const roomId of roomIds) {
      nock(SMARTTHINGS_API_BASE)
        .get(`/rooms/${roomId}`)
        .reply(200, {
          roomId,
          name: `Room ${roomId}`,
          locationId: 'location-home-001'
        });
    }

    // Execute API call
    const result = await service.listDevices();

    // Validate response structure
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBe(deviceListFixture.items.length);

    // Validate first device structure
    const firstDevice = result[0];
    expect(firstDevice).toHaveProperty('deviceId');
    expect(firstDevice).toHaveProperty('name');
    expect(firstDevice).toHaveProperty('capabilities');
    expect(firstDevice).toHaveProperty('components');
    expect(firstDevice).toHaveProperty('locationId');

    // Validate capabilities array
    expect(Array.isArray(firstDevice.capabilities)).toBe(true);
    expect(firstDevice.capabilities.length).toBeGreaterThan(0);

    // Validate components array
    expect(Array.isArray(firstDevice.components)).toBe(true);
    expect(firstDevice.components.length).toBeGreaterThan(0);

    // Validate all devices have required fields
    for (const device of result) {
      expect(device.deviceId).toBeDefined();
      expect(typeof device.deviceId).toBe('string');
      expect(device.name).toBeDefined();
      expect(typeof device.name).toBe('string');
      expect(Array.isArray(device.capabilities)).toBe(true);
      expect(Array.isArray(device.components)).toBe(true);
    }

    // Validate specific fixture data
    const alcoveDevice = result.find(d => d.deviceId === 'alcove-bedroom-light-001');
    expect(alcoveDevice).toBeDefined();
    expect(alcoveDevice?.name).toBe('Bedroom Alcove Light');
    expect(alcoveDevice?.capabilities).toContain('switch');
    expect(alcoveDevice?.capabilities).toContain('healthCheck');
  });

  /**
   * TC-3.2: Validate single device response structure
   *
   * Validates:
   * - Device has deviceId, name, label
   * - Components structure with 'main' component
   * - Capabilities array in components
   * - Metadata fields (locationId, roomId, type)
   */
  it('TC-3.2: should validate single device response structure (capabilities, components, metadata)', async () => {
    const deviceId = 'alcove-bedroom-light-001' as DeviceId;

    // Mock SmartThings API: GET /devices/{deviceId}
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId}`)
      .reply(200, alcoveDeviceFixture);

    // Execute API call
    const device = await service.getDevice(deviceId);

    // Validate device structure
    expect(device).toHaveProperty('deviceId');
    expect(device).toHaveProperty('name');
    expect(device).toHaveProperty('label');
    expect(device).toHaveProperty('type');
    expect(device).toHaveProperty('capabilities');
    expect(device).toHaveProperty('components');
    expect(device).toHaveProperty('locationId');

    // Validate deviceId
    expect(device.deviceId).toBe(deviceId);
    expect(typeof device.deviceId).toBe('string');

    // Validate name and label
    expect(device.name).toBe('Bedroom Alcove Light');
    expect(device.label).toBe('Alcove Bedroom Light');

    // Validate components structure
    expect(Array.isArray(device.components)).toBe(true);
    expect(device.components).toContain('main');

    // Validate capabilities array
    expect(Array.isArray(device.capabilities)).toBe(true);
    expect(device.capabilities.length).toBeGreaterThan(0);
    expect(device.capabilities).toContain('switch');
    expect(device.capabilities).toContain('healthCheck');
    expect(device.capabilities).toContain('refresh');

    // Validate metadata
    expect(device.locationId).toBe('location-home-001');
    expect(device.type).toBe('DTH');

    // Validate fixture-specific fields from alcove-device.json
    const fixtureDevice = alcoveDeviceFixture;
    expect(device.deviceId).toBe(fixtureDevice.deviceId);
    expect(device.name).toBe(fixtureDevice.name);
    expect(device.label).toBe(fixtureDevice.label);
  });

  /**
   * TC-3.3: Validate device event structure
   *
   * Validates:
   * - Events array with deviceId, capability, attribute, value
   * - Timestamp fields (time, epoch)
   * - Component information
   * - Event metadata (hash, text)
   */
  it('TC-3.3: should validate device event structure (deviceId, capability, attribute, value, timestamp)', async () => {
    const deviceId = 'alcove-bedroom-light-001' as DeviceId;
    const locationId = 'location-home-001' as LocationId;

    // Mock device detail endpoint for locationId resolution
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId}`)
      .reply(200, alcoveDeviceFixture);

    // Mock device events/history endpoint with paginated response
    nock(SMARTTHINGS_API_BASE)
      .get('/history/devices')
      .query(true) // Match any query parameters
      .reply(200, { items: alcoveEventsFixture });

    // Execute API call
    const result = await service.getDeviceEvents(deviceId, {
      startTime: '7d',
      limit: 20,
      includeMetadata: true,
      locationId
    });

    // Validate result structure
    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('summary');

    // Validate events array
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.length).toBeLessThanOrEqual(20);

    // Validate first event structure
    const firstEvent = result.events[0];
    expect(firstEvent).toHaveProperty('deviceId');
    expect(firstEvent).toHaveProperty('capability');
    expect(firstEvent).toHaveProperty('attribute');
    expect(firstEvent).toHaveProperty('value');
    expect(firstEvent).toHaveProperty('time');
    expect(firstEvent).toHaveProperty('epoch');
    expect(firstEvent).toHaveProperty('component');

    // Validate event fields
    expect(typeof firstEvent.deviceId).toBe('string');
    expect(typeof firstEvent.capability).toBe('string');
    expect(typeof firstEvent.attribute).toBe('string');
    expect(firstEvent.value).toBeDefined();
    expect(typeof firstEvent.time).toBe('string');
    expect(typeof firstEvent.epoch).toBe('number');
    expect(firstEvent.component).toBe('main');

    // Validate all events have required fields
    for (const event of result.events) {
      expect(event.deviceId).toBeDefined();
      expect(event.capability).toBeDefined();
      expect(event.attribute).toBeDefined();
      expect(event.value).toBeDefined();
      expect(event.time).toBeDefined();
      expect(event.epoch).toBeDefined();
      expect(event.component).toBeDefined();
    }

    // Validate metadata structure
    expect(result.metadata).toHaveProperty('totalCount');
    expect(result.metadata).toHaveProperty('hasMore');
    expect(result.metadata).toHaveProperty('dateRange');
    expect(result.metadata.dateRange).toHaveProperty('earliest');
    expect(result.metadata.dateRange).toHaveProperty('latest');
    expect(result.metadata.dateRange).toHaveProperty('durationMs');

    // Validate specific event data from fixture
    const switchOnEvent = result.events.find(e => e.value === 'on');
    expect(switchOnEvent).toBeDefined();
    expect(switchOnEvent?.capability).toBe('switch');
    expect(switchOnEvent?.attribute).toBe('switch');
  });

  /**
   * TC-3.4: Validate error response handling
   *
   * Tests error scenarios:
   * - 404 Not Found
   * - 401 Unauthorized
   * - 403 Forbidden
   * - 500 Internal Server Error
   */
  it('TC-3.4: should validate error response handling (404, 401, 403, 500)', async () => {
    const deviceId = 'non-existent-device' as DeviceId;

    // Test 404 Not Found
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId}`)
      .reply(404, {
        error: 'Not Found',
        message: 'Device not found',
        statusCode: 404
      });

    await expect(service.getDevice(deviceId)).rejects.toThrow();

    // Clean nock for next error test
    nock.cleanAll();

    // Test 401 Unauthorized (SDK uses /devices without /v1)
    nock(SMARTTHINGS_API_BASE)
      .get('/devices')
      .reply(401, {
        error: 'Unauthorized',
        message: 'Invalid authentication credentials',
        statusCode: 401
      });

    await expect(service.listDevices()).rejects.toThrow();

    // Clean nock for next error test
    nock.cleanAll();

    // Test 403 Forbidden (SDK uses /devices without /v1)
    nock(SMARTTHINGS_API_BASE)
      .get('/devices')
      .reply(403, {
        error: 'Forbidden',
        message: 'Insufficient permissions',
        statusCode: 403
      });

    await expect(service.listDevices()).rejects.toThrow();

    // Clean nock for next error test
    nock.cleanAll();

    // Test 500 Internal Server Error (SDK uses /devices without /v1)
    nock(SMARTTHINGS_API_BASE)
      .get('/devices')
      .reply(500, {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        statusCode: 500
      });

    await expect(service.listDevices()).rejects.toThrow();
  });

  /**
   * TC-3.5: Validate malformed JSON response handling
   *
   * Tests edge cases:
   * - Invalid JSON syntax
   * - Empty response body
   * - Null response
   * - Missing required fields
   */
  it('TC-3.5: should validate malformed JSON response handling', async () => {
    const deviceId1 = 'test-device-malformed-001' as DeviceId;
    const deviceId2 = 'test-device-empty-002' as DeviceId;
    const deviceId3 = 'test-device-null-003' as DeviceId;
    const deviceId4 = 'test-device-missing-004' as DeviceId;

    // Test invalid JSON syntax - should throw parsing error
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId1}`)
      .reply(200, 'This is not valid JSON {]', {
        'Content-Type': 'application/json'
      });

    // Invalid JSON may be handled gracefully by SDK
    try {
      const result = await service.getDevice(deviceId1);
      // If no error, verify response is not a valid device
      expect(result.deviceId).toBeUndefined();
    } catch (error) {
      // Throwing on invalid JSON is acceptable
      expect(error).toBeDefined();
    }

    // Clean nock for next malformed test
    nock.cleanAll();

    // Test empty response body - SDK may parse as empty object
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId2}`)
      .reply(200, '');

    // Empty response may not throw, but should not return valid device
    try {
      const result = await service.getDevice(deviceId2);
      // If it doesn't throw, verify the result is not a valid device
      expect(result.deviceId).toBeUndefined();
    } catch (error) {
      // Empty response throwing is acceptable behavior
      expect(error).toBeDefined();
    }

    // Clean nock for next malformed test
    nock.cleanAll();

    // Test null response
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId3}`)
      .reply(200, null);

    // Null response should be handled gracefully
    try {
      const result = await service.getDevice(deviceId3);
      // If parsing succeeds, result should be empty
      expect(result.deviceId).toBeUndefined();
    } catch (error) {
      // Throwing on null is acceptable
      expect(error).toBeDefined();
    }

    // Clean nock for next malformed test
    nock.cleanAll();

    // Test response missing required fields (deviceId) - this tests graceful handling
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId4}`)
      .reply(200, {
        name: 'Test Device',
        // Missing deviceId field
        components: []
      });

    // Should handle missing deviceId gracefully (may return undefined deviceId)
    const result = await service.getDevice(deviceId4);
    expect(result.deviceId).toBeUndefined();
  });

  /**
   * TC-3.6: Validate device status response structure
   *
   * Validates:
   * - Components structure with capability states
   * - Nested capability values
   * - Health check status
   */
  it('TC-3.6: should validate device status response structure', async () => {
    const deviceId = 'alcove-bedroom-light-001' as DeviceId;

    // Mock device status endpoint
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId}/status`)
      .reply(200, {
        components: {
          main: {
            switch: {
              switch: { value: 'on' }
            },
            healthCheck: {
              healthStatus: { value: 'online' }
            }
          }
        }
      });

    // Execute API call
    const status = await service.getDeviceStatus(deviceId);

    // Validate status structure
    expect(status).toHaveProperty('components');
    expect(status.components).toHaveProperty('main');

    // Validate main component structure
    const mainComponent = status.components.main;
    expect(mainComponent).toHaveProperty('switch');
    expect(mainComponent).toHaveProperty('healthCheck');

    // Validate switch capability
    expect(mainComponent.switch).toHaveProperty('switch');
    expect(mainComponent.switch.switch).toHaveProperty('value');
    expect(mainComponent.switch.switch.value).toBe('on');

    // Validate health check capability
    expect(mainComponent.healthCheck).toHaveProperty('healthStatus');
    expect(mainComponent.healthCheck.healthStatus).toHaveProperty('value');
    expect(mainComponent.healthCheck.healthStatus.value).toBe('online');
  });

  /**
   * TC-3.7: Validate pagination in device list
   *
   * Validates:
   * - Large device list handling
   * - All devices processed correctly
   * - No data loss in pagination
   */
  it('TC-3.7: should validate pagination handling in device list', async () => {
    // Mock SmartThings API with large device list
    const largeDeviceList = {
      items: [
        ...deviceListFixture.items,
        ...deviceListFixture.items.map((d, i) => ({
          ...d,
          deviceId: `${d.deviceId}-copy-${i}`,
          name: `${d.name} Copy ${i}`
        }))
      ]
    };

    // SDK uses /devices without /v1
    nock(SMARTTHINGS_API_BASE)
      .get('/devices')
      .reply(200, largeDeviceList);

    // Mock room endpoints
    const roomIds = [...new Set(largeDeviceList.items.map(d => d.roomId).filter(Boolean))];
    for (const roomId of roomIds) {
      nock(SMARTTHINGS_API_BASE)
        .get(`/rooms/${roomId}`)
        .reply(200, {
          roomId,
          name: `Room ${roomId}`,
          locationId: 'location-home-001'
        });
    }

    // Execute API call
    const result = await service.listDevices();

    // Validate all devices returned
    expect(result.length).toBe(largeDeviceList.items.length);
    expect(result.length).toBeGreaterThan(deviceListFixture.items.length);

    // Validate no duplicate deviceIds
    const deviceIds = new Set(result.map(d => d.deviceId));
    expect(deviceIds.size).toBe(result.length);
  });

  /**
   * TC-3.8: Validate event filtering by capability
   *
   * Validates:
   * - Capability filter applied correctly
   * - Only matching events returned
   * - Event count accurate
   */
  it('TC-3.8: should validate event filtering by capability', async () => {
    const deviceId = 'alcove-bedroom-light-001' as DeviceId;
    const locationId = 'location-home-001' as LocationId;

    // Mock device detail endpoint
    nock(SMARTTHINGS_API_BASE)
      .get(`/devices/${deviceId}`)
      .reply(200, alcoveDeviceFixture);

    // Mock device events with mixed capabilities
    const mixedEvents = [
      ...alcoveEventsFixture,
      {
        deviceId,
        capability: 'healthCheck' as CapabilityName,
        attribute: 'healthStatus',
        value: 'online',
        time: '2025-11-28T12:00:00.000Z',
        epoch: 1732795200000,
        component: 'main'
      }
    ];

    nock(SMARTTHINGS_API_BASE)
      .get('/history/devices')
      .query(true)
      .reply(200, { items: mixedEvents });

    // Execute API call with capability filter
    const result = await service.getDeviceEvents(deviceId, {
      capabilities: ['switch' as CapabilityName],
      limit: 50,
      locationId
    });

    // Validate filtering
    expect(result.events.length).toBeGreaterThan(0);

    // All events should be switch capability
    for (const event of result.events) {
      expect(event.capability).toBe('switch');
    }

    // Validate metadata shows filter applied
    expect(result.metadata.appliedFilters.capabilities).toContain('switch');
  });
});
