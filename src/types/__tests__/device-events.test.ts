/**
 * Unit tests for device event type utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseTimeRange,
  validateRetentionLimit,
  detectEventGaps,
  formatDuration,
  createDeviceEvent,
  type DeviceEvent,
} from '../device-events.js';
import type { DeviceId, LocationId, CapabilityName } from '../smartthings.js';

describe('parseTimeRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should parse Date objects', () => {
    const input = new Date('2025-01-27T10:00:00Z');
    const result = parseTimeRange(input);
    expect(result).toEqual(input);
  });

  it('should parse epoch milliseconds', () => {
    const epoch = 1737979200000; // 2025-01-27T10:00:00Z
    const result = parseTimeRange(epoch);
    expect(result.getTime()).toBe(epoch);
  });

  it('should parse relative time - minutes', () => {
    const result = parseTimeRange('30m');
    expect(result.getTime()).toBe(new Date('2025-01-27T11:30:00Z').getTime());
  });

  it('should parse relative time - hours', () => {
    const result = parseTimeRange('2h');
    expect(result.getTime()).toBe(new Date('2025-01-27T10:00:00Z').getTime());
  });

  it('should parse relative time - days', () => {
    const result = parseTimeRange('1d');
    expect(result.getTime()).toBe(new Date('2025-01-26T12:00:00Z').getTime());
  });

  it('should parse ISO-8601 strings', () => {
    const isoString = '2025-01-27T08:00:00Z';
    const result = parseTimeRange(isoString);
    expect(result.toISOString()).toBe('2025-01-27T08:00:00.000Z');
  });

  it('should throw error for invalid format', () => {
    expect(() => parseTimeRange('invalid')).toThrow(TypeError);
    expect(() => parseTimeRange('invalid')).toThrow(/Invalid time range format/);
  });
});

describe('validateRetentionLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should pass validation for time within 7-day limit', () => {
    const startTime = new Date('2025-01-25T12:00:00Z'); // 2 days ago
    const result = validateRetentionLimit(startTime);
    expect(result.valid).toBe(true);
    expect(result.exceedsLimit).toBe(false);
    expect(result.adjustedStart).toBeUndefined();
  });

  it('should fail validation for time exceeding 7-day limit', () => {
    const startTime = new Date('2025-01-15T12:00:00Z'); // 12 days ago
    const result = validateRetentionLimit(startTime);
    expect(result.valid).toBe(false);
    expect(result.exceedsLimit).toBe(true);
    expect(result.adjustedStart).toBeDefined();
    expect(result.message).toContain('exceeds 7-day retention limit');
  });

  it('should adjust start time to 7 days ago', () => {
    const startTime = new Date('2025-01-10T12:00:00Z'); // 17 days ago
    const result = validateRetentionLimit(startTime);
    expect(result.adjustedStart).toBeDefined();
    // Should be exactly 7 days before now
    const expectedStart = new Date('2025-01-20T12:00:00Z');
    expect(result.adjustedStart?.getTime()).toBe(expectedStart.getTime());
  });
});

describe('formatDuration', () => {
  it('should format seconds', () => {
    expect(formatDuration(45 * 1000)).toBe('45s');
  });

  it('should format minutes only', () => {
    expect(formatDuration(5 * 60 * 1000)).toBe('5m');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(5 * 60 * 1000 + 30 * 1000)).toBe('5m 30s');
  });

  it('should format hours only', () => {
    expect(formatDuration(3 * 60 * 60 * 1000)).toBe('3h');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe('2h 30m');
  });

  it('should format days only', () => {
    expect(formatDuration(2 * 24 * 60 * 60 * 1000)).toBe('2d');
  });

  it('should format days and hours', () => {
    expect(formatDuration(1 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000)).toBe('1d 6h');
  });
});

describe('detectEventGaps', () => {
  const createMockEvent = (epoch: number, time: string): DeviceEvent => ({
    deviceId: 'device1' as DeviceId,
    locationId: 'loc1' as LocationId,
    epoch,
    time,
    component: 'main',
    capability: 'switch' as CapabilityName,
    attribute: 'switch',
    value: 'on',
  });

  it('should return empty array for single event', () => {
    const events = [createMockEvent(1000, '2025-01-27T12:00:00Z')];
    const gaps = detectEventGaps(events);
    expect(gaps).toHaveLength(0);
  });

  it('should detect gap above threshold', () => {
    const events = [
      createMockEvent(1000, '2025-01-27T12:00:00Z'),
      createMockEvent(1000 + 45 * 60 * 1000, '2025-01-27T12:45:00Z'), // 45 min gap
    ];
    const gaps = detectEventGaps(events);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.durationMs).toBe(45 * 60 * 1000);
  });

  it('should not detect gap below threshold', () => {
    const events = [
      createMockEvent(1000, '2025-01-27T12:00:00Z'),
      createMockEvent(1000 + 20 * 60 * 1000, '2025-01-27T12:20:00Z'), // 20 min gap
    ];
    const gaps = detectEventGaps(events, 30 * 60 * 1000);
    expect(gaps).toHaveLength(0);
  });

  it('should mark large gaps as connectivity issues', () => {
    const events = [
      createMockEvent(1000, '2025-01-27T12:00:00Z'),
      createMockEvent(1000 + 90 * 60 * 1000, '2025-01-27T13:30:00Z'), // 90 min gap
    ];
    const gaps = detectEventGaps(events);
    expect(gaps[0]?.likelyConnectivityIssue).toBe(true);
  });

  it('should not mark small gaps as connectivity issues', () => {
    const events = [
      createMockEvent(1000, '2025-01-27T12:00:00Z'),
      createMockEvent(1000 + 45 * 60 * 1000, '2025-01-27T12:45:00Z'), // 45 min gap
    ];
    const gaps = detectEventGaps(events);
    expect(gaps[0]?.likelyConnectivityIssue).toBe(false);
  });

  it('should sort events before detecting gaps', () => {
    const events = [
      createMockEvent(1000 + 90 * 60 * 1000, '2025-01-27T13:30:00Z'),
      createMockEvent(1000, '2025-01-27T12:00:00Z'), // Out of order
    ];
    const gaps = detectEventGaps(events);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.durationMs).toBe(90 * 60 * 1000);
  });

  it('should format gap duration', () => {
    const events = [
      createMockEvent(1000, '2025-01-27T12:00:00Z'),
      createMockEvent(1000 + 2 * 60 * 60 * 1000 + 30 * 60 * 1000, '2025-01-27T14:30:00Z'),
    ];
    const gaps = detectEventGaps(events);
    expect(gaps[0]?.durationText).toBe('2h 30m');
  });
});

describe('createDeviceEvent', () => {
  it('should convert raw activity to branded DeviceEvent', () => {
    const rawActivity = {
      deviceId: 'abc123',
      deviceName: 'Living Room Switch',
      locationId: 'loc123',
      locationName: 'Home',
      time: '2025-01-27T12:00:00Z',
      epoch: 1737979200000,
      component: 'main',
      componentLabel: 'Main',
      capability: 'switch',
      attribute: 'switch',
      value: 'on',
      unit: undefined,
      text: 'Switch turned on',
      hash: 'abc',
    };

    const event = createDeviceEvent(rawActivity);

    expect(event.deviceId).toBe('abc123');
    expect(event.deviceName).toBe('Living Room Switch');
    expect(event.locationId).toBe('loc123');
    expect(event.capability).toBe('switch');
    expect(event.value).toBe('on');
    expect(event.epoch).toBe(1737979200000);
  });

  it('should handle optional fields', () => {
    const rawActivity = {
      deviceId: 'abc123',
      locationId: 'loc123',
      time: '2025-01-27T12:00:00Z',
      epoch: 1737979200000,
      component: 'main',
      capability: 'switch',
      attribute: 'switch',
      value: 'on',
    };

    const event = createDeviceEvent(rawActivity);

    expect(event.deviceName).toBeUndefined();
    expect(event.unit).toBeUndefined();
    expect(event.text).toBeUndefined();
  });
});
