/**
 * Comprehensive tests for LLM service web search functionality.
 *
 * Test Coverage:
 * - Web search configuration (maxResults, engine, contextSize, searchPrompt)
 * - Plugin integration with OpenRouter API
 * - Citation extraction from API responses
 * - Response format with citations
 * - Integration with existing chat functionality
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LlmService } from '../../src/services/llm.js';
import type { McpToolDefinition } from '../../src/mcp/client.js';
import type { ChatMessage, UrlCitation, LlmResponse } from '../../src/services/llm.js';

describe('LlmService - Web Search Functionality', () => {
  let service: LlmService;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create service with test API key
    service = new LlmService({ apiKey: 'test-key' });

    // Mock the OpenAI client's create method
    mockCreate = vi.fn();
    (service as any).client.chat = {
      completions: {
        create: mockCreate,
      },
    };
  });

  describe('Web Search Configuration Tests', () => {
    it('should apply default WebSearchConfig values when enableWebSearch is true', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              tool_calls: undefined,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, { enableWebSearch: true });

      // Verify default values: maxResults=3, engine='native'
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: [
            {
              id: 'web',
              engine: 'native',
              max_results: 3,
              search_prompt: undefined,
            },
          ],
        })
      );
    });

    it('should pass custom maxResults parameter to API', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: { maxResults: 7 },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: [
            expect.objectContaining({
              max_results: 7,
            }),
          ],
        })
      );
    });

    it('should correctly configure exa search engine', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: { engine: 'exa' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: [
            expect.objectContaining({
              engine: 'exa',
            }),
          ],
        })
      );
    });

    it('should pass custom search prompt correctly', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];
      const customPrompt = 'Focus on recent smart home device issues';

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: { searchPrompt: customPrompt },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: [
            expect.objectContaining({
              search_prompt: customPrompt,
            }),
          ],
        })
      );
    });

    it('should add web_search_options when contextSize is specified - low', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: { contextSize: 'low' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          web_search_options: {
            search_context_size: 'low',
          },
        })
      );
    });

    it('should add web_search_options when contextSize is specified - medium', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: { contextSize: 'medium' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          web_search_options: {
            search_context_size: 'medium',
          },
        })
      );
    });

    it('should add web_search_options when contextSize is specified - high', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: { contextSize: 'high' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          web_search_options: {
            search_context_size: 'high',
          },
        })
      );
    });

    it('should NOT add web_search_options when contextSize is not specified', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: {},
      });

      const callArgs = mockCreate.mock.calls[0]?.[0];
      expect(callArgs).not.toHaveProperty('web_search_options');
    });
  });

  describe('Plugin Integration Tests', () => {
    it('should structure plugin object correctly for OpenRouter API', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: {
          engine: 'native',
          maxResults: 5,
          searchPrompt: 'Custom prompt',
        },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: [
            {
              id: 'web',
              engine: 'native',
              max_results: 5,
              search_prompt: 'Custom prompt',
            },
          ],
        })
      );
    });

    it('should add plugin only when enableWebSearch is true', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, { enableWebSearch: true });

      const callArgs = mockCreate.mock.calls[0]?.[0];
      expect(callArgs).toHaveProperty('plugins');
      expect(callArgs.plugins).toHaveLength(1);
    });

    it('should NOT add plugin when enableWebSearch is false', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, { enableWebSearch: false });

      const callArgs = mockCreate.mock.calls[0]?.[0];
      expect(callArgs).not.toHaveProperty('plugins');
    });

    it('should NOT add plugin when enableWebSearch is not provided', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools);

      const callArgs = mockCreate.mock.calls[0]?.[0];
      expect(callArgs).not.toHaveProperty('plugins');
    });

    it('should preserve other request parameters when adding plugin', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      await service.chat(messages, tools, { enableWebSearch: true });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          messages: messages,
          tools: expect.any(Array),
          temperature: 0.7,
          max_tokens: 2000,
          plugins: expect.any(Array),
        })
      );
    });
  });

  describe('Citation Extraction Tests', () => {
    it('should extract citations from API response annotations', async () => {
      const mockCitations: UrlCitation[] = [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article',
            title: 'Example Article',
            content: 'Article excerpt',
            start_index: 10,
            end_index: 50,
          },
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response with citations',
              annotations: mockCitations,
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response.citations).toBeDefined();
      expect(response.citations).toHaveLength(1);
      expect(response.citations?.[0]).toEqual(mockCitations[0]);
    });

    it('should handle multiple citations correctly', async () => {
      const mockCitations: UrlCitation[] = [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article1',
            title: 'Article 1',
            content: 'First excerpt',
            start_index: 10,
            end_index: 50,
          },
        },
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article2',
            title: 'Article 2',
            content: 'Second excerpt',
            start_index: 60,
            end_index: 100,
          },
        },
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article3',
            title: 'Article 3',
            content: 'Third excerpt',
            start_index: 110,
            end_index: 150,
          },
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response with multiple citations',
              annotations: mockCitations,
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response.citations).toBeDefined();
      expect(response.citations).toHaveLength(3);
      expect(response.citations?.[0]?.url_citation.url).toBe(
        'https://example.com/article1'
      );
      expect(response.citations?.[1]?.url_citation.url).toBe(
        'https://example.com/article2'
      );
      expect(response.citations?.[2]?.url_citation.url).toBe(
        'https://example.com/article3'
      );
    });

    it('should NOT extract citations when web search is disabled', async () => {
      const mockCitations: UrlCitation[] = [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article',
            title: 'Example Article',
            content: 'Article excerpt',
            start_index: 10,
            end_index: 50,
          },
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              annotations: mockCitations,
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: false });

      expect(response.citations).toBeUndefined();
    });

    it('should handle empty annotations array', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              annotations: [],
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response.citations).toBeUndefined();
    });

    it('should handle response without annotations field', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response.citations).toBeUndefined();
    });

    it('should filter out non-url_citation annotations', async () => {
      const mockAnnotations = [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article',
            title: 'Valid Citation',
            content: 'Content',
            start_index: 10,
            end_index: 50,
          },
        },
        {
          type: 'other_annotation',
          data: 'some data',
        },
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article2',
            title: 'Another Valid Citation',
            content: 'More content',
            start_index: 60,
            end_index: 100,
          },
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              annotations: mockAnnotations,
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response.citations).toBeDefined();
      expect(response.citations).toHaveLength(2);
      expect(response.citations?.[0]?.type).toBe('url_citation');
      expect(response.citations?.[1]?.type).toBe('url_citation');
    });
  });

  describe('Response Format Tests', () => {
    it('should include citations field in LlmResponse when web search enabled', async () => {
      const mockCitations: UrlCitation[] = [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article',
            title: 'Example Article',
            content: 'Article excerpt',
            start_index: 10,
            end_index: 50,
          },
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              annotations: mockCitations,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response).toHaveProperty('citations');
      expect(Array.isArray(response.citations)).toBe(true);
    });

    it('should verify UrlCitation structure is correct', async () => {
      const mockCitation: UrlCitation = {
        type: 'url_citation',
        url_citation: {
          url: 'https://example.com/article',
          title: 'Example Article',
          content: 'Article excerpt with details',
          start_index: 10,
          end_index: 50,
        },
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              annotations: [mockCitation],
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      const citation = response.citations?.[0];
      expect(citation).toBeDefined();
      expect(citation?.type).toBe('url_citation');
      expect(citation?.url_citation.url).toBe('https://example.com/article');
      expect(citation?.url_citation.title).toBe('Example Article');
      expect(citation?.url_citation.content).toBe('Article excerpt with details');
      expect(citation?.url_citation.start_index).toBe(10);
      expect(citation?.url_citation.end_index).toBe(50);
    });

    it('should set citations to undefined when none found', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              annotations: [],
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response.citations).toBeUndefined();
    });

    it('should preserve existing response fields with web search', async () => {
      const mockCitations: UrlCitation[] = [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article',
            title: 'Example Article',
            content: 'Content',
            start_index: 10,
            end_index: 50,
          },
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response content',
              annotations: mockCitations,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function' as const,
                  function: {
                    name: 'test_tool',
                    arguments: '{"param": "value"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response.content).toBe('Test response content');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls[0]?.name).toBe('test_tool');
      expect(response.finished).toBe(false);
      expect(response.citations).toHaveLength(1);
      expect(response.usage).toEqual({
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      });
    });
  });

  describe('Integration Tests', () => {
    it('should work normally when web search is not enabled', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Normal response without web search',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      const response = await service.chat(messages, tools);

      expect(response.content).toBe('Normal response without web search');
      expect(response.citations).toBeUndefined();
      expect(response.finished).toBe(true);

      const callArgs = mockCreate.mock.calls[0]?.[0];
      expect(callArgs).not.toHaveProperty('plugins');
    });

    it('should handle tool calls with web search enabled', async () => {
      const mockCitations: UrlCitation[] = [
        {
          type: 'url_citation',
          url_citation: {
            url: 'https://example.com/article',
            title: 'Tool Documentation',
            content: 'How to use the tool',
            start_index: 10,
            end_index: 50,
          },
        },
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Based on documentation...',
              annotations: mockCitations,
              tool_calls: [
                {
                  id: 'call_456',
                  type: 'function' as const,
                  function: {
                    name: 'execute_action',
                    arguments: '{"action": "do_something"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Execute action' }];
      const tools: McpToolDefinition[] = [
        {
          name: 'execute_action',
          description: 'Execute an action',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string' },
            },
            required: ['action'],
          },
        },
      ];

      const response = await service.chat(messages, tools, { enableWebSearch: true });

      expect(response.content).toBe('Based on documentation...');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls[0]?.name).toBe('execute_action');
      expect(response.citations).toHaveLength(1);
      expect(response.finished).toBe(false);
    });

    it('should handle errors consistently with web search enabled', async () => {
      // Create a service with maxRetries: 1 to speed up the test
      const fastFailService = new LlmService({ apiKey: 'test-key', maxRetries: 1 });
      const fastMockCreate = vi.fn().mockRejectedValue(new Error('API Error'));
      (fastFailService as any).client.chat = {
        completions: {
          create: fastMockCreate,
        },
      };

      const messages: ChatMessage[] = [{ role: 'user', content: 'Test question' }];
      const tools: McpToolDefinition[] = [];

      await expect(
        fastFailService.chat(messages, tools, { enableWebSearch: true })
      ).rejects.toThrow('LLM request failed after 1 attempts: API Error');
    });

    it('should handle complex configuration with all options', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Comprehensive test response',
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Complex query' }];
      const tools: McpToolDefinition[] = [];

      await service.chat(messages, tools, {
        enableWebSearch: true,
        searchConfig: {
          maxResults: 10,
          engine: 'exa',
          contextSize: 'high',
          searchPrompt: 'Focus on technical documentation and recent updates',
        },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: [
            {
              id: 'web',
              engine: 'exa',
              max_results: 10,
              search_prompt: 'Focus on technical documentation and recent updates',
            },
          ],
          web_search_options: {
            search_context_size: 'high',
          },
        })
      );
    });
  });
});
