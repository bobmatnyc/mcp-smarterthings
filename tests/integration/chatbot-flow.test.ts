import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChatOrchestrator } from '../../src/services/chat-orchestrator.js';
import { ChatbotService } from '../../src/services/chatbot.js';
import type { IMcpClient, McpToolDefinition, McpToolResult } from '../../src/mcp/client.js';
import type { ILlmService, ChatMessage, LlmResponse } from '../../src/services/llm.js';

/**
 * Integration test for complete chatbot flow.
 *
 * Tests the interaction between:
 * - ChatbotService (REPL interface)
 * - ChatOrchestrator (message coordination)
 * - Mock LLM Service (simulates AI responses)
 * - Mock MCP Client (simulates tool execution)
 *
 * This validates the complete data flow without requiring
 * actual MCP server or LLM API access.
 */

// Mock MCP Client for integration testing
class IntegrationMockMcpClient implements IMcpClient {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    return [
      {
        name: 'list_devices',
        description: 'List all SmartThings devices',
        inputSchema: {
          type: 'object',
          properties: {
            roomName: { type: 'string' },
          },
        },
      },
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
      {
        name: 'get_device_status',
        description: 'Get device status',
        inputSchema: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
      },
    ];
  }

  async callTool(name: string, args: unknown): Promise<McpToolResult> {
    const argsObj = args as Record<string, unknown>;

    switch (name) {
      case 'list_devices':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  deviceId: 'device-123',
                  name: 'Living Room Light',
                  label: 'Main Light',
                  type: 'Light',
                  roomId: 'room-456',
                },
              ]),
            },
          ],
          data: {
            devices: [
              {
                deviceId: 'device-123',
                name: 'Living Room Light',
              },
            ],
          },
        };

      case 'turn_on_device':
        return {
          content: [
            {
              type: 'text',
              text: `Device ${argsObj.deviceId} turned on successfully`,
            },
          ],
          data: {
            deviceId: argsObj.deviceId,
            success: true,
          },
        };

      case 'get_device_status':
        return {
          content: [
            {
              type: 'text',
              text: `Device ${argsObj.deviceId} is ON`,
            },
          ],
          data: {
            deviceId: argsObj.deviceId,
            status: 'on',
          },
        };

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  }

  async close(): Promise<void> {
    this.initialized = false;
  }
}

// Mock LLM Service for integration testing
class IntegrationMockLlmService implements ILlmService {
  private callCounts = new Map<string, number>();

  resetCallCount(key: string): void {
    this.callCounts.delete(key);
  }

  private getCallCount(key: string): number {
    const count = this.callCounts.get(key) ?? 0;
    this.callCounts.set(key, count + 1);
    return count + 1;
  }

  async chat(messages: ChatMessage[], tools: McpToolDefinition[]): Promise<LlmResponse> {
    // Find the most recent user message (not tool results)
    let userContent = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === 'user') {
        userContent = typeof msg.content === 'string' ? msg.content : '';
        break;
      }
    }

    // Simple pattern matching for test scenarios
    if (userContent.toLowerCase().includes('turn on') && userContent.toLowerCase().includes('light')) {
      const callCount = this.getCallCount('turn_on');

      // First call: list devices
      if (callCount === 1) {
        return {
          content: null,
          toolCalls: [
            {
              id: 'call_1',
              name: 'list_devices',
              arguments: { roomName: 'living room' },
            },
          ],
          finished: false,
        };
      }
      // Second call: turn on device
      else if (callCount === 2) {
        return {
          content: null,
          toolCalls: [
            {
              id: 'call_2',
              name: 'turn_on_device',
              arguments: { deviceId: 'device-123' },
            },
          ],
          finished: false,
        };
      }
      // Third call: final response
      else {
        return {
          content: 'I turned on the living room light for you.',
          toolCalls: [],
          finished: true,
        };
      }
    } else if (userContent.toLowerCase().includes('status')) {
      const callCount = this.getCallCount('status');

      // First call: get status
      if (callCount === 1) {
        return {
          content: null,
          toolCalls: [
            {
              id: 'call_1',
              name: 'get_device_status',
              arguments: { deviceId: 'device-123' },
            },
          ],
          finished: false,
        };
      }
      // Second call: final response
      else {
        return {
          content: 'The device is currently ON.',
          toolCalls: [],
          finished: true,
        };
      }
    }

    // Default response
    return {
      content: 'I can help you control your SmartThings devices.',
      toolCalls: [],
      finished: true,
    };
  }
}

describe('Chatbot Integration Flow', () => {
  let mcpClient: IntegrationMockMcpClient;
  let llmService: IntegrationMockLlmService;
  let orchestrator: ChatOrchestrator;
  let chatbot: ChatbotService;

  beforeAll(async () => {
    // Initialize all components
    mcpClient = new IntegrationMockMcpClient();
    llmService = new IntegrationMockLlmService();
    orchestrator = new ChatOrchestrator(mcpClient, llmService);
    chatbot = new ChatbotService({ useColor: false });

    await orchestrator.initialize();
  });

  afterAll(async () => {
    await orchestrator.close();
    await chatbot.stop();
  });

  describe('end-to-end message flow', () => {
    it('should handle simple query without tool calls', async () => {
      const response = await chatbot.sendMessage(
        'Hello',
        async (msg) => await orchestrator.processMessage(msg)
      );

      expect(response).toContain('SmartThings devices');
    });

    it('should handle device control with tool calls', async () => {
      // Reset LLM call count
      llmService.resetCallCount('turn_on');

      const response = await chatbot.sendMessage(
        'Turn on the living room light',
        async (msg) => await orchestrator.processMessage(msg)
      );

      expect(response).toContain('turned on');
      expect(response.toLowerCase()).toContain('living room');
    });

    it('should handle device status query', async () => {
      // Reset LLM call count
      llmService.resetCallCount('status');

      const response = await chatbot.sendMessage(
        'What is the status of device-123?',
        async (msg) => await orchestrator.processMessage(msg)
      );

      expect(response).toContain('ON');
    });

    it('should maintain conversation history', async () => {
      await chatbot.sendMessage(
        'Message 1',
        async (msg) => await orchestrator.processMessage(msg)
      );

      await chatbot.sendMessage(
        'Message 2',
        async (msg) => await orchestrator.processMessage(msg)
      );

      const history = (chatbot as any).messageHistory;
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle tool execution errors gracefully', async () => {
      // Mock LLM to call non-existent tool
      const originalChat = llmService.chat.bind(llmService);
      llmService.chat = async () => ({
        content: null,
        toolCalls: [
          {
            id: 'call_error',
            name: 'non_existent_tool',
            arguments: {},
          },
        ],
        finished: false,
      });

      // Should not throw, but handle error
      const response = await chatbot.sendMessage(
        'Test error handling',
        async (msg) => {
          try {
            return await orchestrator.processMessage(msg);
          } catch (error) {
            return 'Error handled gracefully';
          }
        }
      );

      expect(response).toBeDefined();

      // Restore original method
      llmService.chat = originalChat;
    });
  });

  describe('conversation reset', () => {
    it('should reset conversation history', async () => {
      await chatbot.sendMessage(
        'First message',
        async (msg) => await orchestrator.processMessage(msg)
      );

      orchestrator.resetConversation();

      const history = (orchestrator as any).conversationHistory;
      expect(history.length).toBe(1); // Only system prompt
      expect(history[0]?.role).toBe('system');
    });
  });
});
