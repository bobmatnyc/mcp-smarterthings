import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatOrchestrator, ChatMode } from '../../src/services/chat-orchestrator.js';
import type { IMcpClient, McpToolDefinition } from '../../src/mcp/client.js';
import type { ILlmService, LlmResponse } from '../../src/services/llm.js';

// Mock MCP Client
class MockMcpClient implements IMcpClient {
  initializeCalled = false;
  closeCalled = false;
  tools: McpToolDefinition[] = [
    {
      name: 'get_device_events',
      description: 'Get device event history',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' },
          hours: { type: 'number' },
        },
      },
    },
    {
      name: 'list_devices',
      description: 'List all devices',
      inputSchema: {
        type: 'object',
        properties: {},
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
    if (name === 'list_devices') {
      return {
        content: [{ type: 'text', text: '[]' }],
        isError: false,
      };
    }

    if (name === 'list_scenes') {
      return {
        content: [{ type: 'text', text: '[]' }],
        isError: false,
      };
    }

    return {
      content: [{ type: 'text', text: `Tool ${name} executed` }],
      data: args,
    };
  }

  async close(): Promise<void> {
    this.closeCalled = true;
  }
}

// Mock LLM Service with web search tracking
class MockLlmService implements ILlmService {
  responses: LlmResponse[] = [];
  currentResponseIndex = 0;
  lastWebSearchEnabled = false;
  lastSearchConfig: any = null;

  setResponses(responses: LlmResponse[]) {
    this.responses = responses;
    this.currentResponseIndex = 0;
  }

  async chat(
    messages: any[],
    tools: any[],
    options?: { enableWebSearch?: boolean; searchConfig?: any }
  ): Promise<LlmResponse> {
    // Track web search options
    this.lastWebSearchEnabled = options?.enableWebSearch ?? false;
    this.lastSearchConfig = options?.searchConfig ?? null;

    if (this.currentResponseIndex >= this.responses.length) {
      throw new Error('No more mock responses');
    }
    return this.responses[this.currentResponseIndex++]!;
  }
}

describe('ChatOrchestrator - Troubleshooting Mode', () => {
  let mcpClient: MockMcpClient;
  let llmService: MockLlmService;
  let orchestrator: ChatOrchestrator;

  beforeEach(() => {
    mcpClient = new MockMcpClient();
    llmService = new MockLlmService();
    orchestrator = new ChatOrchestrator(mcpClient, llmService);
  });

  describe('Mode Management', () => {
    it('should initialize in normal mode by default', async () => {
      await orchestrator.initialize();
      expect(orchestrator.getMode()).toBe(ChatMode.NORMAL);
    });

    it('should support setting initial mode via config', async () => {
      const troubleshootOrchestrator = new ChatOrchestrator(mcpClient, llmService, {
        initialMode: ChatMode.TROUBLESHOOTING,
      });

      await troubleshootOrchestrator.initialize();
      expect(troubleshootOrchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should switch modes programmatically', async () => {
      await orchestrator.initialize();

      expect(orchestrator.getMode()).toBe(ChatMode.NORMAL);

      await orchestrator.setMode(ChatMode.TROUBLESHOOTING);
      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);

      await orchestrator.setMode(ChatMode.NORMAL);
      expect(orchestrator.getMode()).toBe(ChatMode.NORMAL);
    });
  });

  describe('Mode Toggle Commands', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
      llmService.setResponses([
        {
          content: 'Response',
          toolCalls: [],
          finished: true,
        },
      ]);
    });

    it('should handle /troubleshoot command', async () => {
      const response = await orchestrator.processMessage('/troubleshoot');

      expect(response).toContain('troubleshooting mode');
      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should handle /normal command', async () => {
      await orchestrator.setMode(ChatMode.TROUBLESHOOTING);

      const response = await orchestrator.processMessage('/normal');

      expect(response).toContain('normal mode');
      expect(orchestrator.getMode()).toBe(ChatMode.NORMAL);
    });

    it('should report already in troubleshooting mode if /troubleshoot called twice', async () => {
      await orchestrator.processMessage('/troubleshoot');
      const response = await orchestrator.processMessage('/troubleshoot');

      expect(response).toContain('Already in troubleshooting mode');
    });

    it('should report already in normal mode if /normal called in normal mode', async () => {
      const response = await orchestrator.processMessage('/normal');

      expect(response).toContain('Already in normal mode');
    });
  });

  describe('Auto-Detection', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
      llmService.setResponses([
        {
          content: 'Let me help diagnose that issue',
          toolCalls: [],
          finished: true,
        },
      ]);
    });

    it('should auto-detect troubleshooting intent with "not working"', async () => {
      await orchestrator.processMessage('My light is not working');

      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should auto-detect troubleshooting intent with "troubleshoot"', async () => {
      await orchestrator.processMessage('Help me troubleshoot my thermostat');

      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should auto-detect troubleshooting intent with "randomly"', async () => {
      await orchestrator.processMessage('My lights turn on randomly at night');

      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should auto-detect troubleshooting intent with "why is"', async () => {
      await orchestrator.processMessage('Why is my motion sensor not triggering?');

      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should auto-detect troubleshooting intent with "issue with"', async () => {
      await orchestrator.processMessage('I have an issue with my door lock');

      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should auto-detect troubleshooting intent with "problem with"', async () => {
      await orchestrator.processMessage('Problem with my garage door opener');

      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should auto-detect troubleshooting intent with "won\'t"', async () => {
      await orchestrator.processMessage('My thermostat won\'t change temperature');

      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should auto-detect troubleshooting intent with "keeps"', async () => {
      await orchestrator.processMessage('My light keeps turning off');

      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);
    });

    it('should NOT auto-detect troubleshooting intent for normal queries', async () => {
      await orchestrator.processMessage('Turn on the living room lights');

      expect(orchestrator.getMode()).toBe(ChatMode.NORMAL);
    });

    it('should NOT auto-detect troubleshooting intent for status queries', async () => {
      await orchestrator.processMessage('What is the temperature in the bedroom?');

      expect(orchestrator.getMode()).toBe(ChatMode.NORMAL);
    });
  });

  describe('Web Search Integration', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
      llmService.setResponses([
        {
          content: 'Diagnosing the issue...',
          toolCalls: [],
          finished: true,
        },
      ]);
    });

    it('should enable web search in troubleshooting mode', async () => {
      await orchestrator.setMode(ChatMode.TROUBLESHOOTING);

      await orchestrator.processMessage('What is wrong with my device?');

      expect(llmService.lastWebSearchEnabled).toBe(true);
    });

    it('should NOT enable web search in normal mode', async () => {
      await orchestrator.processMessage('Turn on the lights');

      expect(llmService.lastWebSearchEnabled).toBe(false);
    });

    it('should configure web search with troubleshooting-specific settings', async () => {
      await orchestrator.setMode(ChatMode.TROUBLESHOOTING);

      await orchestrator.processMessage('My automation is not triggering');

      expect(llmService.lastSearchConfig).toBeDefined();
      expect(llmService.lastSearchConfig.maxResults).toBe(3);
      expect(llmService.lastSearchConfig.engine).toBe('native');
      expect(llmService.lastSearchConfig.contextSize).toBe('medium');
      expect(llmService.lastSearchConfig.searchPrompt).toContain('SmartThings');
      expect(llmService.lastSearchConfig.searchPrompt).toContain('troubleshooting');
    });
  });

  describe('System Prompt Injection', () => {
    it('should inject troubleshooting prompts when switching to troubleshooting mode', async () => {
      await orchestrator.initialize();

      // Check initial system prompt (normal mode)
      const initialHistory = (orchestrator as any).conversationHistory;
      expect(initialHistory[0]?.role).toBe('system');
      expect(initialHistory[0]?.content).not.toContain('TROUBLESHOOTING MODE ACTIVE');

      // Switch to troubleshooting mode
      await orchestrator.setMode(ChatMode.TROUBLESHOOTING);

      // Check updated system prompt
      const updatedHistory = (orchestrator as any).conversationHistory;
      expect(updatedHistory[0]?.role).toBe('system');
      expect(updatedHistory[0]?.content).toContain('TROUBLESHOOTING MODE');
    });

    it('should remove troubleshooting prompts when switching to normal mode', async () => {
      await orchestrator.initialize();

      // Switch to troubleshooting mode
      await orchestrator.setMode(ChatMode.TROUBLESHOOTING);

      const troubleshootHistory = (orchestrator as any).conversationHistory;
      expect(troubleshootHistory[0]?.content).toContain('TROUBLESHOOTING MODE');

      // Switch back to normal mode
      await orchestrator.setMode(ChatMode.NORMAL);

      const normalHistory = (orchestrator as any).conversationHistory;
      expect(normalHistory[0]?.role).toBe('system');
      expect(normalHistory[0]?.content).not.toContain('TROUBLESHOOTING MODE ACTIVE');
    });
  });

  describe('End-to-End Troubleshooting Flow', () => {
    it('should complete full troubleshooting workflow', async () => {
      await orchestrator.initialize();

      llmService.setResponses([
        {
          content: 'Let me check the device event history',
          toolCalls: [
            {
              id: 'call_1',
              name: 'get_device_events',
              arguments: { deviceId: 'device-123', hours: 24 },
            },
          ],
          finished: false,
        },
        {
          content:
            'I found the issue. The device has connectivity gaps. Based on SmartThings community forums, this is often caused by weak signal.',
          toolCalls: [],
          finished: true,
          citations: [
            {
              type: 'url_citation' as const,
              url_citation: {
                url: 'https://community.smartthings.com/example',
                title: 'Connectivity Issues',
                content: 'Weak signal causes gaps',
                start_index: 0,
                end_index: 100,
              },
            },
          ],
        },
      ]);

      // User reports issue (triggers auto-detection)
      const response = await orchestrator.processMessage(
        'My motion sensor randomly stops working'
      );

      // Should have switched to troubleshooting mode
      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);

      // Should have enabled web search
      expect(llmService.lastWebSearchEnabled).toBe(true);

      // Should return helpful troubleshooting response
      expect(response).toContain('issue');
      expect(response).toContain('SmartThings community');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should handle missing troubleshooting prompts gracefully', async () => {
      // Force troubleshooting prompt to null to simulate load failure
      (orchestrator as any).troubleshootingPrompt = null;

      await orchestrator.setMode(ChatMode.TROUBLESHOOTING);

      llmService.setResponses([
        {
          content: 'Response',
          toolCalls: [],
          finished: true,
        },
      ]);

      // Should still work with fallback prompt
      const response = await orchestrator.processMessage('Test message');
      expect(response).toBeDefined();
    });

    it('should preserve conversation history when switching modes', async () => {
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

      await orchestrator.processMessage('First message');
      await orchestrator.setMode(ChatMode.TROUBLESHOOTING);
      await orchestrator.processMessage('Second message');

      const history = (orchestrator as any).conversationHistory;

      // Should have: system + user1 + assistant1 + user2 + assistant2
      expect(history.length).toBeGreaterThan(3);
      expect(history.filter((m: any) => m.role === 'user').length).toBe(2);
    });

    it('should handle case-insensitive mode commands', async () => {
      llmService.setResponses([
        {
          content: 'Response',
          toolCalls: [],
          finished: true,
        },
      ]);

      const response1 = await orchestrator.processMessage('/TROUBLESHOOT');
      expect(orchestrator.getMode()).toBe(ChatMode.TROUBLESHOOTING);

      const response2 = await orchestrator.processMessage('/Normal');
      expect(orchestrator.getMode()).toBe(ChatMode.NORMAL);
    });
  });
});
