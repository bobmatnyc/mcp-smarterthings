/**
 * LLM integration service using OpenRouter API.
 *
 * Design Decision: OpenRouter for multi-model access
 * Rationale: Free tier access to multiple models (DeepSeek, Grok, etc.)
 * via OpenAI-compatible API. Allows model flexibility without vendor lock-in.
 *
 * Architecture:
 * Chatbot → LlmService (OpenRouter) → Model API
 *
 * Trade-offs:
 * - Cost: Free tier vs. paid OpenAI/Anthropic
 * - Latency: Additional routing overhead vs. direct API
 * - Flexibility: Multi-model access vs. single provider
 * - Rate Limits: Shared free tier limits vs. dedicated quota
 *
 * Error Handling:
 * - API key missing → Throw with setup instructions
 * - Rate limits → Retry with exponential backoff
 * - Model errors → Return error message to user
 * - Network errors → Retry up to 3 times
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { McpToolDefinition } from '../mcp/client.js';
import logger from '../utils/logger.js';

/**
 * Chat message types.
 */
export type ChatMessage = ChatCompletionMessageParam;

/**
 * Tool call from LLM response.
 */
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * LLM response structure.
 */
export interface LlmResponse {
  /**
   * Response message content (may be null if tool calls present).
   */
  content: string | null;

  /**
   * Tool calls requested by the LLM.
   */
  toolCalls: LlmToolCall[];

  /**
   * Whether this is the final response (no tool calls).
   */
  finished: boolean;

  /**
   * Usage statistics from the API.
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * LLM service configuration.
 */
export interface LlmServiceConfig {
  apiKey: string;
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

/**
 * LLM service interface for dependency injection.
 */
export interface ILlmService {
  /**
   * Send a chat message and get LLM response.
   *
   * @param messages Conversation history
   * @param tools Available tools for function calling
   * @returns LLM response with content and/or tool calls
   * @throws Error if API request fails after retries
   */
  chat(messages: ChatMessage[], tools: McpToolDefinition[]): Promise<LlmResponse>;
}

/**
 * LLM service implementation using OpenRouter.
 *
 * Performance:
 * - Typical latency: 1-3 seconds for simple queries
 * - With tool calls: 2-5 seconds (depends on model)
 * - Retry overhead: +2-8 seconds on failures
 *
 * Rate Limits:
 * - Free tier: ~10-20 requests/minute (model dependent)
 * - Exponential backoff handles rate limit errors
 */
export class LlmService implements ILlmService {
  private client: OpenAI;
  private model: string;
  private maxRetries: number;

  /**
   * Create LLM service instance.
   *
   * @param config Service configuration
   * @throws Error if API key is missing
   */
  constructor(config: LlmServiceConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable.'
      );
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/masa/mcp-smartthings',
        'X-Title': 'MCP SmartThings Chatbot',
      },
    });

    this.model = config.model ?? 'deepseek/deepseek-chat'; // Free tier default
    this.maxRetries = config.maxRetries ?? 3;

    logger.info('LLM service initialized', {
      model: this.model,
      maxRetries: this.maxRetries,
    });
  }

  /**
   * Send chat message to LLM.
   *
   * Complexity: O(1) - single API call
   * Network: 1-5 seconds typical latency
   *
   * Retry Strategy:
   * 1. First attempt: immediate
   * 2. Retry 1: wait 2 seconds
   * 3. Retry 2: wait 4 seconds
   * 4. Retry 3: wait 8 seconds
   */
  async chat(messages: ChatMessage[], tools: McpToolDefinition[]): Promise<LlmResponse> {
    logger.debug('Sending chat request to LLM', {
      messageCount: messages.length,
      toolCount: tools.length,
      model: this.model,
    });

    const openaiTools = this.convertToolsToOpenAiFormat(tools);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          tools: openaiTools.length > 0 ? openaiTools : undefined,
          temperature: 0.7,
          max_tokens: 2000,
        });

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }

        const toolCalls: LlmToolCall[] = [];
        if (choice.message.tool_calls) {
          for (const toolCall of choice.message.tool_calls) {
            try {
              toolCalls.push({
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments),
              });
            } catch (error) {
              logger.error('Failed to parse tool call arguments', {
                toolCall: toolCall.function.name,
                error: error instanceof Error ? error.message : String(error),
              });
              throw new Error(
                `Failed to parse tool call arguments: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }

        const llmResponse: LlmResponse = {
          content: choice.message.content,
          toolCalls,
          finished: choice.finish_reason === 'stop',
          usage: response.usage
            ? {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
              }
            : undefined,
        };

        logger.info('LLM response received', {
          hasContent: !!llmResponse.content,
          toolCallCount: toolCalls.length,
          finishReason: choice.finish_reason,
          usage: llmResponse.usage,
        });

        return llmResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn('LLM request failed', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: lastError.message,
        });

        // Check if this is a rate limit error
        const isRateLimit =
          lastError.message.includes('rate limit') || lastError.message.includes('429');

        // Don't retry on non-retryable errors
        if (
          !isRateLimit &&
          (lastError.message.includes('401') || lastError.message.includes('invalid'))
        ) {
          throw lastError;
        }

        // Exponential backoff: 2s, 4s, 8s
        if (attempt < this.maxRetries - 1) {
          const delay = Math.pow(2, attempt + 1) * 1000;
          logger.debug('Retrying after delay', { delay });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    logger.error('LLM request failed after all retries', {
      error: lastError?.message,
    });

    throw new Error(
      `LLM request failed after ${this.maxRetries} attempts: ${lastError?.message ?? 'Unknown error'}`
    );
  }

  /**
   * Convert MCP tool definitions to OpenAI function calling format.
   *
   * Complexity: O(n) where n = number of tools
   * Space: O(n) for converted tool array
   */
  private convertToolsToOpenAiFormat(tools: McpToolDefinition[]): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
}
