/**
 * IntentClassifier tests - Comprehensive test suite (15+ tests).
 *
 * Test Coverage:
 * 1. Keyword classification (5 tests)
 * 2. LLM classification (5 tests)
 * 3. Entity extraction (3 tests)
 * 4. Caching behavior (2 tests)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntentClassifier, DiagnosticIntent } from '../IntentClassifier.js';
import type { ILlmService } from '../llm.js';

// Mock LLM service
const createMockLlmService = (): ILlmService => ({
  chat: vi.fn(),
});

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;
  let mockLlmService: ILlmService;

  beforeEach(() => {
    mockLlmService = createMockLlmService();
    classifier = new IntentClassifier(mockLlmService);
  });

  describe('Keyword Classification (Fast Path)', () => {
    it('should classify MODE_MANAGEMENT intent from /troubleshoot command', async () => {
      const result = await classifier.classifyIntent('/troubleshoot');

      expect(result.intent).toBe(DiagnosticIntent.MODE_MANAGEMENT);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.requiresDiagnostics).toBe(false);
      expect(mockLlmService.chat).not.toHaveBeenCalled(); // Should use keyword path
    });

    it('should classify DEVICE_HEALTH intent from "check my sensor"', async () => {
      const result = await classifier.classifyIntent('check my motion sensor');

      expect(result.intent).toBe(DiagnosticIntent.DEVICE_HEALTH);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.requiresDiagnostics).toBe(true);
      expect(result.entities.deviceName).toContain('sensor');
      expect(mockLlmService.chat).not.toHaveBeenCalled();
    });

    it('should classify ISSUE_DIAGNOSIS intent from "why is my light broken"', async () => {
      const result = await classifier.classifyIntent('why is my bedroom light not working');

      expect(result.intent).toBe(DiagnosticIntent.ISSUE_DIAGNOSIS);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.requiresDiagnostics).toBe(true);
      expect(result.entities.deviceName).toBeTruthy();
      expect(mockLlmService.chat).not.toHaveBeenCalled();
    });

    it('should classify SYSTEM_STATUS intent from "how is my system doing"', async () => {
      const result = await classifier.classifyIntent('how is my system doing');

      expect(result.intent).toBe(DiagnosticIntent.SYSTEM_STATUS);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.requiresDiagnostics).toBe(true);
      expect(mockLlmService.chat).not.toHaveBeenCalled();
    });

    it('should classify DISCOVERY intent from "find similar devices"', async () => {
      const result = await classifier.classifyIntent('find devices similar to this sensor');

      expect(result.intent).toBe(DiagnosticIntent.DISCOVERY);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.requiresDiagnostics).toBe(false);
      expect(mockLlmService.chat).not.toHaveBeenCalled();
    });
  });

  describe('LLM Classification (Complex Cases)', () => {
    it('should use LLM for ambiguous query', async () => {
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: JSON.stringify({
          intent: 'device_health',
          confidence: 0.75,
          entities: { deviceName: 'garage door' },
          requiresDiagnostics: true,
          reasoning: 'User wants to verify device status',
        }),
        toolCalls: [],
        finished: true,
      });

      const result = await classifier.classifyIntent('is the garage working fine');

      expect(result.intent).toBe(DiagnosticIntent.DEVICE_HEALTH);
      expect(result.confidence).toBe(0.75);
      expect(result.entities.deviceName).toBe('garage door');
      expect(mockLlmService.chat).toHaveBeenCalledTimes(1);
    });

    it('should handle LLM JSON response parsing', async () => {
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: JSON.stringify({
          intent: 'issue_diagnosis',
          confidence: 0.92,
          entities: {
            deviceName: 'thermostat',
            issueType: 'temperature',
          },
          requiresDiagnostics: true,
          reasoning: 'User reports temperature problem',
        }),
        toolCalls: [],
        finished: true,
      });

      const result = await classifier.classifyIntent('my thermostat temperature is off');

      expect(result.intent).toBe(DiagnosticIntent.ISSUE_DIAGNOSIS);
      expect(result.confidence).toBe(0.92);
      expect(result.entities.deviceName).toBe('thermostat');
      expect(result.entities.issueType).toBe('temperature');
    });

    it('should normalize intent strings from LLM', async () => {
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: JSON.stringify({
          intent: 'systemstatus', // No underscore
          confidence: 0.88,
          entities: {},
          requiresDiagnostics: true,
        }),
        toolCalls: [],
        finished: true,
      });

      const result = await classifier.classifyIntent('show me everything');

      expect(result.intent).toBe(DiagnosticIntent.SYSTEM_STATUS);
    });

    it('should fallback to NORMAL_QUERY on LLM failure', async () => {
      vi.mocked(mockLlmService.chat).mockRejectedValue(new Error('LLM API error'));

      const result = await classifier.classifyIntent('tell me about your features');

      expect(result.intent).toBe(DiagnosticIntent.NORMAL_QUERY);
      expect(result.confidence).toBeLessThan(0.9);
    });

    it('should handle invalid JSON from LLM gracefully', async () => {
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: 'This is not valid JSON',
        toolCalls: [],
        finished: true,
      });

      // The fallback should return NORMAL_QUERY instead of throwing
      const result = await classifier.classifyIntent('some query');
      expect(result.intent).toBe(DiagnosticIntent.NORMAL_QUERY);
    });
  });

  describe('Entity Extraction', () => {
    it('should extract device name from message', async () => {
      const result = await classifier.classifyIntent('check my bedroom motion sensor');

      // Keyword extraction picks up "motion sensor" (last match wins)
      expect(result.entities.deviceName).toContain('sensor');
    });

    it('should extract room name from message', async () => {
      // Use a query that doesn't trigger keyword fast path
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: JSON.stringify({
          intent: 'device_health',
          confidence: 0.8,
          entities: { deviceName: 'kitchen light', roomName: 'kitchen' },
          requiresDiagnostics: true,
        }),
        toolCalls: [],
        finished: true,
      });

      const result = await classifier.classifyIntent('is the kitchen light ok now');

      expect(result.entities.roomName).toBe('kitchen');
    });

    it('should extract timeframe from message', async () => {
      const result = await classifier.classifyIntent('my lock stopped working yesterday');

      expect(result.entities.timeframe).toBe('yesterday');
    });
  });

  describe('Caching Behavior', () => {
    it('should cache high-confidence keyword results', async () => {
      const message = 'check my sensor status';

      // First call
      const result1 = await classifier.classifyIntent(message);
      expect(result1.intent).toBe(DiagnosticIntent.DEVICE_HEALTH);

      // Second call (should hit cache)
      const result2 = await classifier.classifyIntent(message);
      expect(result2).toEqual(result1);

      const stats = classifier.getCacheStats();
      expect(stats.hits).toBeGreaterThanOrEqual(1);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
    });

    it('should cache high-confidence LLM results', async () => {
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: JSON.stringify({
          intent: 'device_health',
          confidence: 0.9, // High confidence
          entities: {},
          requiresDiagnostics: true,
        }),
        toolCalls: [],
        finished: true,
      });

      const message = 'is my device ok';

      // First call (LLM)
      await classifier.classifyIntent(message);
      expect(mockLlmService.chat).toHaveBeenCalledTimes(1);

      // Second call (cache hit)
      await classifier.classifyIntent(message);
      expect(mockLlmService.chat).toHaveBeenCalledTimes(1); // No additional LLM call

      const stats = classifier.getCacheStats();
      expect(stats.hits).toBe(1);
    });
  });

  describe('Conversation Context', () => {
    it('should pass conversation context to LLM', async () => {
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: JSON.stringify({
          intent: 'issue_diagnosis',
          confidence: 0.85,
          entities: {},
          requiresDiagnostics: true,
        }),
        toolCalls: [],
        finished: true,
      });

      const context = ['user: my light is flickering', 'assistant: I can help diagnose that'];

      await classifier.classifyIntent('yes, the bedroom one', context);

      expect(mockLlmService.chat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('bedroom one'),
          }),
        ]),
        expect.any(Array),
        expect.objectContaining({ enableWebSearch: false })
      );
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', async () => {
      // Use LLM to ensure caching happens
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: JSON.stringify({
          intent: 'device_health',
          confidence: 0.9,
          entities: {},
          requiresDiagnostics: true,
        }),
        toolCalls: [],
        finished: true,
      });

      // Add some cached results
      await classifier.classifyIntent('check my unique device 123');
      await classifier.classifyIntent('check my unique device 123'); // Cache hit

      let stats = classifier.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      // Clear cache
      classifier.clearCache();

      stats = classifier.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', async () => {
      vi.mocked(mockLlmService.chat).mockResolvedValue({
        content: JSON.stringify({
          intent: 'normal_query',
          confidence: 0.5,
          entities: {},
          requiresDiagnostics: false,
        }),
        toolCalls: [],
        finished: true,
      });

      const result = await classifier.classifyIntent('');

      expect(result.intent).toBe(DiagnosticIntent.NORMAL_QUERY);
    });

    it('should handle very long messages', async () => {
      const longMessage = 'check my sensor ' + 'a'.repeat(1000);

      const result = await classifier.classifyIntent(longMessage);

      expect(result.intent).toBe(DiagnosticIntent.DEVICE_HEALTH);
    });

    it('should handle special characters in message', async () => {
      const result = await classifier.classifyIntent('check my @#$% sensor!!!');

      expect(result.intent).toBe(DiagnosticIntent.DEVICE_HEALTH);
    });
  });
});
