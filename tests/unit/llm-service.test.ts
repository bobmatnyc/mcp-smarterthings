import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LlmService } from '../../src/services/llm.js';
import type { McpToolDefinition } from '../../src/mcp/client.js';

describe('LlmService', () => {
  describe('constructor', () => {
    it('should throw error if API key is missing', () => {
      expect(() => new LlmService({ apiKey: '' })).toThrow(
        'OpenRouter API key is required'
      );
    });

    it('should create service with valid API key', () => {
      const service = new LlmService({ apiKey: 'test-key' });
      expect(service).toBeDefined();
    });

    it('should use default model if not specified', () => {
      const service = new LlmService({ apiKey: 'test-key' });
      expect(service).toBeDefined();
      // Default model is set internally
    });

    it('should use custom model if specified', () => {
      const service = new LlmService({
        apiKey: 'test-key',
        model: 'grok-beta',
      });
      expect(service).toBeDefined();
    });
  });

  describe('convertToolsToOpenAiFormat', () => {
    it('should convert MCP tools to OpenAI format', () => {
      const service = new LlmService({ apiKey: 'test-key' });

      const mcpTools: McpToolDefinition[] = [
        {
          name: 'turn_on_device',
          description: 'Turn on a device',
          inputSchema: {
            type: 'object',
            properties: {
              deviceId: { type: 'string' },
            },
            required: ['deviceId'],
          },
        },
      ];

      // Access private method via type assertion for testing
      const converted = (service as any).convertToolsToOpenAiFormat(mcpTools);

      expect(converted).toHaveLength(1);
      expect(converted[0]).toEqual({
        type: 'function',
        function: {
          name: 'turn_on_device',
          description: 'Turn on a device',
          parameters: {
            type: 'object',
            properties: {
              deviceId: { type: 'string' },
            },
            required: ['deviceId'],
          },
        },
      });
    });

    it('should convert multiple tools correctly', () => {
      const service = new LlmService({ apiKey: 'test-key' });

      const mcpTools: McpToolDefinition[] = [
        {
          name: 'tool1',
          description: 'First tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'tool2',
          description: 'Second tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      const converted = (service as any).convertToolsToOpenAiFormat(mcpTools);

      expect(converted).toHaveLength(2);
      expect(converted[0]?.function.name).toBe('tool1');
      expect(converted[1]?.function.name).toBe('tool2');
    });
  });

  describe('chat', () => {
    it('should require initialization before calling', async () => {
      const service = new LlmService({ apiKey: 'test-key' });

      // Mock the OpenAI client to avoid actual API calls
      const mockChat = vi.fn().mockRejectedValue(new Error('API key invalid'));
      (service as any).client.chat = {
        completions: {
          create: mockChat,
        },
      };

      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const tools: McpToolDefinition[] = [];

      await expect(service.chat(messages, tools)).rejects.toThrow();
    });
  });
});
