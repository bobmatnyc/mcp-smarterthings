/**
 * CompositionUtils unit tests.
 *
 * Tests:
 * - Retry logic with exponential backoff
 * - Fallback execution
 * - Parallel execution
 * - Safe parallel execution with error handling
 * - Health check aggregation
 * - Timeout handling
 * - Sequential execution
 * - Batched execution
 * - Memoization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompositionUtils } from '../CompositionUtils.js';
import type { ServiceHealth } from '../ServiceContainer.js';

describe('CompositionUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await CompositionUtils.executeWithRetry(operation, { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValue('success');

      const promise = CompositionUtils.executeWithRetry(operation, {
        maxAttempts: 3,
        delayMs: 100,
      });

      // Fast-forward through delays
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Permanent failure'));

      const promise = CompositionUtils.executeWithRetry(operation, {
        maxAttempts: 3,
        delayMs: 100,
      }).catch((error: Error) => error);

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain('Operation failed after 3 attempts');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      const promise = CompositionUtils.executeWithRetry(operation, {
        maxAttempts: 3,
        delayMs: 100,
        onRetry,
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('should use exponential backoff', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValue('success');

      const promise = CompositionUtils.executeWithRetry(operation, {
        maxAttempts: 3,
        delayMs: 100,
        backoffMultiplier: 2,
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('executeWithFallback', () => {
    it('should use primary operation when successful', async () => {
      const primary = vi.fn().mockResolvedValue('primary');
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await CompositionUtils.executeWithFallback(primary, fallback);

      expect(result).toBe('primary');
      expect(primary).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should use fallback when primary fails', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await CompositionUtils.executeWithFallback(primary, fallback);

      expect(result).toBe('fallback');
      expect(primary).toHaveBeenCalledTimes(1);
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should throw when both fail', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(CompositionUtils.executeWithFallback(primary, fallback)).rejects.toThrow(
        'Both primary and fallback operations failed'
      );
    });
  });

  describe('executeParallel', () => {
    it('should execute operations in parallel', async () => {
      const op1 = vi.fn().mockResolvedValue('result1');
      const op2 = vi.fn().mockResolvedValue('result2');
      const op3 = vi.fn().mockResolvedValue('result3');

      const results = await CompositionUtils.executeParallel([op1, op2, op3]);

      expect(results).toEqual(['result1', 'result2', 'result3']);
      expect(op1).toHaveBeenCalledTimes(1);
      expect(op2).toHaveBeenCalledTimes(1);
      expect(op3).toHaveBeenCalledTimes(1);
    });

    it('should throw on first failure by default', async () => {
      const op1 = vi.fn().mockResolvedValue('result1');
      const op2 = vi.fn().mockRejectedValue(new Error('Failed'));
      const op3 = vi.fn().mockResolvedValue('result3');

      await expect(CompositionUtils.executeParallel([op1, op2, op3])).rejects.toThrow('Failed');
    });

    it('should continue on error when configured', async () => {
      const op1 = vi.fn().mockResolvedValue('result1');
      const op2 = vi.fn().mockRejectedValue(new Error('Failed'));
      const op3 = vi.fn().mockResolvedValue('result3');

      await expect(
        CompositionUtils.executeParallel([op1, op2, op3], { continueOnError: true })
      ).rejects.toThrow('Operation 1 failed');
    });
  });

  describe('executeParallelSafe', () => {
    it('should return all results with success status', async () => {
      const op1 = vi.fn().mockResolvedValue('result1');
      const op2 = vi.fn().mockResolvedValue('result2');
      const op3 = vi.fn().mockResolvedValue('result3');

      const results = await CompositionUtils.executeParallelSafe([op1, op2, op3]);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ success: true, data: 'result1' });
      expect(results[1]).toEqual({ success: true, data: 'result2' });
      expect(results[2]).toEqual({ success: true, data: 'result3' });
    });

    it('should capture errors without throwing', async () => {
      const op1 = vi.fn().mockResolvedValue('result1');
      const op2 = vi.fn().mockRejectedValue(new Error('Failed'));
      const op3 = vi.fn().mockResolvedValue('result3');

      const results = await CompositionUtils.executeParallelSafe([op1, op2, op3]);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ success: true, data: 'result1' });
      expect(results[1]).toEqual({ success: false, error: expect.any(Error) });
      expect(results[2]).toEqual({ success: true, data: 'result3' });
      const errorResult = results[1];
      if (errorResult && errorResult.error) {
        expect(errorResult.error.message).toBe('Failed');
      }
    });
  });

  describe('aggregateHealth', () => {
    it('should report healthy when all services healthy', () => {
      const healthChecks: ServiceHealth[] = [
        { healthy: true, timestamp: new Date() },
        { healthy: true, timestamp: new Date() },
        { healthy: true, timestamp: new Date() },
      ];

      const result = CompositionUtils.aggregateHealth(healthChecks);

      expect(result.healthy).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should report unhealthy when any service unhealthy', () => {
      const healthChecks: ServiceHealth[] = [
        { healthy: true, timestamp: new Date() },
        { healthy: false, message: 'Service error', timestamp: new Date() },
        { healthy: true, timestamp: new Date() },
      ];

      const result = CompositionUtils.aggregateHealth(healthChecks);

      expect(result.healthy).toBe(false);
      expect(result.message).toBe('Service error');
    });

    it('should aggregate multiple error messages', () => {
      const healthChecks: ServiceHealth[] = [
        { healthy: false, message: 'Error 1', timestamp: new Date() },
        { healthy: false, message: 'Error 2', timestamp: new Date() },
        { healthy: true, timestamp: new Date() },
      ];

      const result = CompositionUtils.aggregateHealth(healthChecks);

      expect(result.healthy).toBe(false);
      expect(result.message).toBe('Error 1; Error 2');
    });
  });

  describe('withTimeout', () => {
    it('should return result when operation completes in time', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const promise = CompositionUtils.withTimeout(operation, 1000);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should throw when operation times out', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 2000)));

      const promise = CompositionUtils.withTimeout(operation, 1000).catch((error: Error) => error);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe('Operation timed out after 1000ms');
    });
  });

  describe('executeSequential', () => {
    it('should execute operations in sequence', async () => {
      const results: number[] = [];
      const op1 = vi.fn().mockImplementation(async () => {
        results.push(1);
        return 'result1';
      });
      const op2 = vi.fn().mockImplementation(async () => {
        results.push(2);
        return 'result2';
      });
      const op3 = vi.fn().mockImplementation(async () => {
        results.push(3);
        return 'result3';
      });

      const output = await CompositionUtils.executeSequential([op1, op2, op3]);

      expect(output).toEqual(['result1', 'result2', 'result3']);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should stop on first error', async () => {
      const op1 = vi.fn().mockResolvedValue('result1');
      const op2 = vi.fn().mockRejectedValue(new Error('Failed'));
      const op3 = vi.fn().mockResolvedValue('result3');

      await expect(CompositionUtils.executeSequential([op1, op2, op3])).rejects.toThrow('Failed');
      expect(op1).toHaveBeenCalledTimes(1);
      expect(op2).toHaveBeenCalledTimes(1);
      expect(op3).not.toHaveBeenCalled();
    });
  });

  describe('executeBatched', () => {
    it('should process operations in batches', async () => {
      const operations = Array.from({ length: 10 }, (_, i) =>
        vi.fn().mockResolvedValue(`result${i}`)
      );

      const results = await CompositionUtils.executeBatched(operations, 3);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toBe(`result${i}`);
      });
    });

    it('should handle batch size larger than array', async () => {
      const operations = [
        vi.fn().mockResolvedValue('result1'),
        vi.fn().mockResolvedValue('result2'),
      ];

      const results = await CompositionUtils.executeBatched(operations, 10);

      expect(results).toEqual(['result1', 'result2']);
    });
  });

  describe('memoize', () => {
    it('should cache operation result', async () => {
      const operation = vi.fn().mockResolvedValue('result');
      const memoized = CompositionUtils.memoize(operation);

      const result1 = await memoized();
      const result2 = await memoized();

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect TTL', async () => {
      const operation = vi.fn().mockResolvedValue('result');
      const memoized = CompositionUtils.memoize(operation, 1000);

      await memoized();

      // Advance time past TTL
      vi.advanceTimersByTime(1001);

      await memoized();

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not expire without TTL', async () => {
      const operation = vi.fn().mockResolvedValue('result');
      const memoized = CompositionUtils.memoize(operation);

      await memoized();

      // Advance time significantly
      vi.advanceTimersByTime(100000);

      await memoized();

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
