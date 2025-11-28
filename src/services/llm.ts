/**
 * LLM integration service using OpenRouter API.
 *
 * Design Decision: OpenRouter with Claude Sonnet 4.5
 * Rationale: Claude Sonnet 4.5 provides state-of-the-art instruction following,
 * tool use, and natural language understanding via OpenAI-compatible API.
 * OpenRouter allows model flexibility without vendor lock-in.
 *
 * Architecture:
 * Chatbot → LlmService (OpenRouter) → Claude API
 *
 * Trade-offs:
 * - Quality: Claude Sonnet 4.5 for best-in-class performance
 * - Latency: Additional routing overhead vs. direct API (~100-200ms)
 * - Flexibility: Can switch models via config vs. hardcoded provider
 * - Rate Limits: OpenRouter rate limits apply
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
 * Web search configuration for LLM requests.
 */
export interface WebSearchConfig {
  /**
   * Maximum number of search results to include.
   * Default: 3 (balance between context and cost)
   * Range: 1-10 (higher = more cost)
   */
  maxResults?: number;

  /**
   * Custom search prompt to guide search query generation.
   * Example: "Focus on recent smart home device issues and solutions"
   */
  searchPrompt?: string;

  /**
   * Search engine to use.
   * - 'native': Provider's built-in search (Anthropic, OpenAI, etc.)
   * - 'exa': Exa search engine (fallback for unsupported providers)
   * - undefined: Auto-select based on provider
   */
  engine?: 'native' | 'exa';

  /**
   * Search context size (affects depth of search).
   * - 'low': Fast, minimal context
   * - 'medium': Balanced (default)
   * - 'high': Deep search, more results
   */
  contextSize?: 'low' | 'medium' | 'high';
}

/**
 * Citation annotation from web search results.
 */
export interface UrlCitation {
  type: 'url_citation';
  url_citation: {
    /**
     * Full URL of the source.
     */
    url: string;

    /**
     * Title of the source page.
     */
    title: string;

    /**
     * Excerpt from the source (search result snippet).
     */
    content: string;

    /**
     * Character index where citation starts in response text.
     */
    start_index: number;

    /**
     * Character index where citation ends in response text.
     */
    end_index: number;
  };
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
   * Citation annotations from web search results (if web search enabled).
   */
  citations?: UrlCitation[];

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
   * @param options Optional configuration including web search settings
   * @returns LLM response with content and/or tool calls
   * @throws Error if API request fails after retries
   */
  chat(
    messages: ChatMessage[],
    tools: McpToolDefinition[],
    options?: { enableWebSearch?: boolean; searchConfig?: WebSearchConfig }
  ): Promise<LlmResponse>;
}

/**
 * LLM service implementation using OpenRouter.
 *
 * Performance (Claude Sonnet 4.5):
 * - Typical latency: 1-2 seconds for simple queries
 * - With tool calls: 2-3 seconds (Sonnet 4.5 excels at tool use)
 * - Retry overhead: +2-8 seconds on failures
 *
 * Rate Limits:
 * - OpenRouter rate limits apply (varies by plan)
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
        'HTTP-Referer': 'https://github.com/masa/mcp-smarterthings',
        'X-Title': 'MCP SmartThings Chatbot',
      },
    });

    this.model = config.model ?? 'anthropic/claude-sonnet-4.5'; // Claude Sonnet 4.5 for best performance
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
   * Network: 1-5 seconds typical latency (2-7 seconds with web search)
   *
   * Retry Strategy:
   * 1. First attempt: immediate
   * 2. Retry 1: wait 2 seconds
   * 3. Retry 2: wait 4 seconds
   * 4. Retry 3: wait 8 seconds
   *
   * Web Search: When enableWebSearch=true, OpenRouter's web search plugin
   * is used to augment LLM responses with real-time information from the web.
   */
  async chat(
    messages: ChatMessage[],
    tools: McpToolDefinition[],
    options?: { enableWebSearch?: boolean; searchConfig?: WebSearchConfig }
  ): Promise<LlmResponse> {
    logger.debug('Sending chat request to LLM', {
      messageCount: messages.length,
      toolCount: tools.length,
      model: this.model,
      webSearchEnabled: options?.enableWebSearch ?? false,
    });

    const openaiTools = this.convertToolsToOpenAiFormat(tools);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Build request parameters
        const requestParams: any = {
          model: this.model,
          messages,
          tools: openaiTools.length > 0 ? openaiTools : undefined,
          temperature: 0.7,
          max_tokens: 2000,
        };

        // Add web search plugin if enabled
        if (options?.enableWebSearch) {
          const searchConfig = options.searchConfig ?? {};

          requestParams.plugins = [
            {
              id: 'web',
              engine: searchConfig.engine ?? 'native',
              max_results: searchConfig.maxResults ?? 3,
              search_prompt: searchConfig.searchPrompt,
            },
          ];

          // Add search context size if specified
          if (searchConfig.contextSize) {
            requestParams.web_search_options = {
              search_context_size: searchConfig.contextSize,
            };
          }

          logger.debug('Web search enabled', {
            engine: searchConfig.engine ?? 'native',
            maxResults: searchConfig.maxResults ?? 3,
            contextSize: searchConfig.contextSize,
          });
        }

        const response = await this.client.chat.completions.create(requestParams);

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }

        const toolCalls: LlmToolCall[] = [];
        if (choice.message.tool_calls) {
          for (const toolCall of choice.message.tool_calls) {
            try {
              // Handle empty or undefined arguments (for tools with no parameters)
              const argsString = toolCall.function.arguments || '{}';
              toolCalls.push({
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: JSON.parse(argsString),
              });
            } catch (error) {
              logger.error('Failed to parse tool call arguments', {
                toolCall: toolCall.function.name,
                arguments: toolCall.function.arguments,
                error: error instanceof Error ? error.message : String(error),
              });
              throw new Error(
                `Failed to parse tool call arguments: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }

        // Extract citations from web search results
        const citations: UrlCitation[] = [];
        if (options?.enableWebSearch && (choice.message as any).annotations) {
          for (const annotation of (choice.message as any).annotations) {
            if (annotation.type === 'url_citation') {
              citations.push(annotation as UrlCitation);
            }
          }

          if (citations.length > 0) {
            logger.info('Web search citations extracted', {
              citationCount: citations.length,
            });
          }
        }

        const llmResponse: LlmResponse = {
          content: choice.message.content,
          toolCalls,
          finished: choice.finish_reason === 'stop',
          citations: citations.length > 0 ? citations : undefined,
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
          citationCount: citations.length,
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
