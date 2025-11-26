import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatOrchestrator } from '../../src/services/chat-orchestrator.js';
import type { IMcpClient, McpToolDefinition } from '../../src/mcp/client.js';
import type { ILlmService, LlmResponse } from '../../src/services/llm.js';

// Mock MCP Client
class MockMcpClient implements IMcpClient {
  initializeCalled = false;
  closeCalled = false;
  tools: McpToolDefinition[] = [
    {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: {
          arg: { type: 'string' },
        },
      },
    },
  ];

  async initialize(): Promise<void> {
    this.initializeCalled = true;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    return this.tools;
  }

  async callTool(name: string, args: unknown): Promise<any> {
    return {
      content: [{ type: 'text', text: `Tool ${name} executed` }],
      data: args,
    };
  }

  async close(): Promise<void> {
    this.closeCalled = true;
  }
}

// Mock LLM Service
class MockLlmService implements ILlmService {
  responses: LlmResponse[] = [];
  currentResponseIndex = 0;

  setResponses(responses: LlmResponse[]) {
    this.responses = responses;
    this.currentResponseIndex = 0;
  }

  async chat(): Promise<LlmResponse> {
    if (this.currentResponseIndex >= this.responses.length) {
      throw new Error('No more mock responses');
    }
    return this.responses[this.currentResponseIndex++]!;
  }
}

describe('ChatOrchestrator', () => {
  let mcpClient: MockMcpClient;
  let llmService: MockLlmService;
  let orchestrator: ChatOrchestrator;

  beforeEach(() => {
    mcpClient = new MockMcpClient();
    llmService = new MockLlmService();
    orchestrator = new ChatOrchestrator(mcpClient, llmService);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await orchestrator.initialize();

      expect(mcpClient.initializeCalled).toBe(true);
    });

    it('should load tools during initialization', async () => {
      await orchestrator.initialize();

      const tools = (orchestrator as any).availableTools;
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('test_tool');
    });

    it('should add system prompt to conversation', async () => {
      await orchestrator.initialize();

      const history = (orchestrator as any).conversationHistory;
      expect(history).toHaveLength(1);
      expect(history[0]?.role).toBe('system');
      expect(history[0]?.content).toContain('SmartThings');
    });
  });

  describe('processMessage', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should process simple message without tool calls', async () => {
      llmService.setResponses([
        {
          content: 'Hello! How can I help?',
          toolCalls: [],
          finished: true,
        },
      ]);

      const response = await orchestrator.processMessage('Hi');

      expect(response).toBe('Hello! How can I help?');
    });

    it('should handle tool calls', async () => {
      llmService.setResponses([
        {
          content: null,
          toolCalls: [
            {
              id: 'call_1',
              name: 'test_tool',
              arguments: { arg: 'value' },
            },
          ],
          finished: false,
        },
        {
          content: 'Tool executed successfully!',
          toolCalls: [],
          finished: true,
        },
      ]);

      const response = await orchestrator.processMessage('Run test tool');

      expect(response).toBe('Tool executed successfully!');
    });

    it('should add user message to conversation history', async () => {
      llmService.setResponses([
        {
          content: 'Response',
          toolCalls: [],
          finished: true,
        },
      ]);

      await orchestrator.processMessage('Test message');

      const history = (orchestrator as any).conversationHistory;
      const userMessages = history.filter((m: any) => m.role === 'user');
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0]?.content).toBe('Test message');
    });

    it('should handle max iterations limit', async () => {
      // Create orchestrator with low max iterations
      const limitedOrchestrator = new ChatOrchestrator(mcpClient, llmService, {
        maxToolIterations: 2,
      });
      await limitedOrchestrator.initialize();

      // Set up infinite tool call loop
      llmService.setResponses([
        {
          content: null,
          toolCalls: [{ id: '1', name: 'test_tool', arguments: {} }],
          finished: false,
        },
        {
          content: null,
          toolCalls: [{ id: '2', name: 'test_tool', arguments: {} }],
          finished: false,
        },
        {
          content: null,
          toolCalls: [{ id: '3', name: 'test_tool', arguments: {} }],
          finished: false,
        },
      ]);

      const response = await limitedOrchestrator.processMessage('Test');

      expect(response).toContain('Maximum tool iterations');
      expect(response).toContain('2');
    });
  });

  describe('resetConversation', () => {
    it('should reset conversation history', async () => {
      await orchestrator.initialize();

      llmService.setResponses([
        {
          content: 'Response 1',
          toolCalls: [],
          finished: true,
        },
        {
          content: 'Response 2',
          toolCalls: [],
          finished: true,
        },
      ]);

      await orchestrator.processMessage('Message 1');
      await orchestrator.processMessage('Message 2');

      orchestrator.resetConversation();

      const history = (orchestrator as any).conversationHistory;
      expect(history).toHaveLength(1); // Only system prompt
      expect(history[0]?.role).toBe('system');
    });
  });

  describe('close', () => {
    it('should close MCP client', async () => {
      await orchestrator.initialize();
      await orchestrator.close();

      expect(mcpClient.closeCalled).toBe(true);
    });

    it('should clear conversation history', async () => {
      await orchestrator.initialize();
      await orchestrator.close();

      const history = (orchestrator as any).conversationHistory;
      expect(history).toHaveLength(0);
    });
  });
});
