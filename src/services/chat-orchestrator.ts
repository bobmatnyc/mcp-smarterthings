/**
 * Chat orchestrator for coordinating REPL, LLM, and MCP client.
 *
 * Design Decision: Centralized orchestration
 * Rationale: Single component manages conversation flow, tool execution,
 * and context management. Simplifies testing and state management.
 *
 * Architecture:
 * User → REPL → Orchestrator → LLM → Orchestrator → MCP Client → Services
 *                    ↓                                      ↓
 *              Context Mgmt                            Tool Execution
 *
 * Trade-offs:
 * - Centralization: Single point of control vs. distributed logic
 * - Complexity: More complex orchestrator vs. simpler components
 * - Testability: Easier to test orchestration vs. scattered logic
 *
 * Conversation Flow:
 * 1. User sends message
 * 2. Add to conversation history
 * 3. Send to LLM with available tools
 * 4. If LLM requests tool calls:
 *    a. Execute tools via MCP client
 *    b. Add results to conversation
 *    c. Send back to LLM
 *    d. Repeat until final response
 * 5. Return final response to user
 */

import type { IMcpClient, McpToolDefinition } from '../mcp/client.js';
import type { ILlmService, ChatMessage, LlmToolCall } from './llm.js';
import type { IntentClassifier } from './IntentClassifier.js';
import type { DiagnosticWorkflow, DiagnosticReport } from './DiagnosticWorkflow.js';
import { DiagnosticIntent } from './IntentClassifier.js';
import logger from '../utils/logger.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Mustache from 'mustache';

/**
 * Home context for session template rendering.
 */
interface HomeContext {
  timestamp: string;
  deviceCount: number;
  sceneCount: number;
  rooms: Array<{
    roomName: string;
    deviceCount: number;
    devices: Array<{
      name: string;
      type: string;
      deviceId: string;
      capabilities: string;
      state: string;
    }>;
  }>;
  scenes: Array<{
    name: string;
    description: string;
    sceneId: string;
    locationName: string;
  }>;
  locations: Array<{
    locationName: string;
    rooms: Array<{
      roomName: string;
      deviceCount: number;
    }>;
  }>;
  lastSync: string;
  activeDeviceCount: number;
  offlineDeviceCount: number;
  offlineDevices: Array<{
    name: string;
    roomName: string;
    lastSeen: string;
  }>;
  exampleRoom: string;
  temperatureUnit: string;
  verbosityLevel: string;
  confirmationStyle: string;
}

/**
 * Chat mode types.
 */
export enum ChatMode {
  NORMAL = 'normal',
  TROUBLESHOOTING = 'troubleshooting',
}

/**
 * Chat orchestrator configuration.
 */
export interface ChatOrchestratorConfig {
  /**
   * Maximum number of tool call iterations.
   * Prevents infinite loops.
   */
  maxToolIterations?: number;

  /**
   * Custom system prompt.
   */
  systemPrompt?: string;

  /**
   * Initial chat mode.
   * Default: NORMAL
   */
  initialMode?: ChatMode;

  /**
   * Intent classifier for diagnostic workflows.
   * Optional - if not provided, auto-detection only uses keywords.
   */
  intentClassifier?: IntentClassifier;

  /**
   * Diagnostic workflow orchestrator.
   * Optional - if not provided, diagnostic context injection disabled.
   */
  diagnosticWorkflow?: DiagnosticWorkflow;
}

/**
 * Chat orchestrator interface for dependency injection.
 */
export interface IChatOrchestrator {
  /**
   * Initialize the orchestrator.
   *
   * @throws Error if initialization fails
   */
  initialize(): Promise<void>;

  /**
   * Process a user message and return assistant response.
   *
   * @param message User message
   * @returns Assistant response
   * @throws Error if message processing fails
   */
  processMessage(message: string): Promise<string>;

  /**
   * Reset conversation history.
   */
  resetConversation(): void;

  /**
   * Close the orchestrator and cleanup resources.
   */
  close(): Promise<void>;

  /**
   * Set chat mode.
   *
   * @param mode Chat mode to set
   */
  setMode(mode: ChatMode): Promise<void>;

  /**
   * Get current chat mode.
   *
   * @returns Current chat mode
   */
  getMode(): ChatMode;
}

/**
 * Chat orchestrator implementation.
 *
 * Performance:
 * - Simple query: ~2-5 seconds (LLM latency)
 * - With 1 tool call: ~3-7 seconds (LLM + tool execution + LLM)
 * - With multiple tools: ~5-15 seconds (iterative tool calls)
 *
 * Conversation Context:
 * - System prompt: Instructions and available capabilities
 * - Message history: User and assistant messages
 * - Tool results: Function call results
 */
export class ChatOrchestrator implements IChatOrchestrator {
  private mcpClient: IMcpClient;
  private llmService: ILlmService;
  private conversationHistory: ChatMessage[] = [];
  private availableTools: McpToolDefinition[] = [];
  private maxToolIterations: number;
  private systemPrompt: string;
  private currentMode: ChatMode;
  private troubleshootingPrompt: string | null = null;
  private intentClassifier: IntentClassifier | null = null;
  private diagnosticWorkflow: DiagnosticWorkflow | null = null;

  /**
   * Troubleshooting mode detection keywords.
   */
  private static readonly TROUBLESHOOTING_KEYWORDS = [
    'troubleshoot',
    'diagnose',
    'debug',
    'fix',
    'not working',
    'randomly',
    'why is',
    'help me figure out',
    'issue with',
    'problem with',
    'won\'t',
    'keeps',
  ];

  /**
   * Create chat orchestrator instance.
   *
   * @param mcpClient MCP client for tool execution
   * @param llmService LLM service for chat
   * @param config Orchestrator configuration
   */
  constructor(mcpClient: IMcpClient, llmService: ILlmService, config: ChatOrchestratorConfig = {}) {
    this.mcpClient = mcpClient;
    this.llmService = llmService;
    this.maxToolIterations = config.maxToolIterations ?? 10;
    this.systemPrompt = config.systemPrompt ?? this.getDefaultSystemPrompt();
    this.currentMode = config.initialMode ?? ChatMode.NORMAL;
    this.intentClassifier = config.intentClassifier ?? null;
    this.diagnosticWorkflow = config.diagnosticWorkflow ?? null;

    logger.info('Chat orchestrator created', {
      maxToolIterations: this.maxToolIterations,
      initialMode: this.currentMode,
      hasIntentClassifier: !!this.intentClassifier,
      hasDiagnosticWorkflow: !!this.diagnosticWorkflow,
    });
  }

  /**
   * Initialize the orchestrator.
   *
   * Initialization:
   * 1. Initialize MCP client
   * 2. Fetch available tools
   * 3. Load system instructions
   * 4. Load troubleshooting prompts
   * 5. Generate session context
   * 6. Combine instructions and add to conversation
   */
  async initialize(): Promise<void> {
    logger.info('Initializing chat orchestrator');

    try {
      // Initialize MCP client
      await this.mcpClient.initialize();

      // Fetch available tools
      this.availableTools = await this.mcpClient.listTools();

      logger.info('Tools loaded', {
        count: this.availableTools.length,
        tools: this.availableTools.map((t) => t.name),
      });

      // Load troubleshooting prompts
      await this.loadTroubleshootingPrompts();

      // Load and build layered instructions
      const layeredInstructions = await this.buildLayeredInstructions();

      // Add combined instructions as system prompt
      this.conversationHistory = [
        {
          role: 'system',
          content: layeredInstructions,
        },
      ];

      logger.info('Chat orchestrator initialized successfully with layered instructions', {
        mode: this.currentMode,
      });
    } catch (error) {
      logger.error('Failed to initialize chat orchestrator', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to initialize chat orchestrator: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Process user message.
   *
   * Complexity: O(n) where n = number of tool call iterations
   * Typical: O(1-3) iterations for most queries
   * Worst case: O(maxToolIterations) if LLM keeps calling tools
   *
   * Error Handling:
   * - Tool execution errors → Return error to LLM, let it handle
   * - LLM errors → Propagate to caller
   * - Max iterations → Return partial response with warning
   */
  async processMessage(message: string): Promise<string> {
    logger.info('Processing user message', { message, mode: this.currentMode });

    // Step 1: Classify intent (if classifier available)
    let diagnosticReport: DiagnosticReport | null = null;
    if (this.intentClassifier && this.diagnosticWorkflow) {
      try {
        const classification = await this.intentClassifier.classifyIntent(
          message,
          this.getConversationContext()
        );

        logger.debug('Intent classified', {
          intent: classification.intent,
          confidence: classification.confidence,
          requiresDiagnostics: classification.requiresDiagnostics,
        });

        // Handle mode management intents
        if (classification.intent === DiagnosticIntent.MODE_MANAGEMENT) {
          const modeCommand = this.handleModeCommand(message);
          if (modeCommand) {
            return modeCommand;
          }
        }

        // Auto-switch to troubleshooting mode for diagnostic intents
        if (
          this.currentMode === ChatMode.NORMAL &&
          (classification.intent === DiagnosticIntent.DEVICE_HEALTH ||
            classification.intent === DiagnosticIntent.ISSUE_DIAGNOSIS ||
            classification.intent === DiagnosticIntent.SYSTEM_STATUS) &&
          classification.confidence > 0.8
        ) {
          logger.info('Auto-switching to troubleshooting mode based on intent', {
            intent: classification.intent,
            confidence: classification.confidence,
          });
          await this.setMode(ChatMode.TROUBLESHOOTING);
        }

        // Execute diagnostic workflow if needed
        if (classification.requiresDiagnostics) {
          diagnosticReport = await this.diagnosticWorkflow.executeDiagnosticWorkflow(
            classification,
            message
          );

          logger.info('Diagnostic workflow completed', {
            intent: classification.intent,
            dataPoints: diagnosticReport.diagnosticContext,
            recommendations: diagnosticReport.recommendations.length,
          });
        }
      } catch (error) {
        logger.warn('Intent classification or diagnostic workflow failed, continuing without', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      // Fallback to keyword-based detection if no classifier
      const modeCommand = this.handleModeCommand(message);
      if (modeCommand) {
        return modeCommand;
      }

      if (this.currentMode === ChatMode.NORMAL && this.detectTroubleshootingIntent(message)) {
        logger.info('Auto-detected troubleshooting intent, switching to troubleshooting mode');
        await this.setMode(ChatMode.TROUBLESHOOTING);
      }
    }

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: message,
    });

    let iterations = 0;

    // Tool call loop
    while (iterations < this.maxToolIterations) {
      iterations++;

      logger.debug('LLM iteration', { iteration: iterations });

      try {
        // Determine if web search should be enabled
        const enableWebSearch = this.currentMode === ChatMode.TROUBLESHOOTING;

        // Configure web search for troubleshooting mode
        const webSearchConfig = enableWebSearch
          ? {
              maxResults: 3,
              searchPrompt:
                'Focus on SmartThings smart home device issues, automation problems, and recent troubleshooting solutions',
              engine: 'native' as const,
              contextSize: 'medium' as const,
            }
          : undefined;

        // Inject diagnostic context if available
        const messagesWithContext = diagnosticReport
          ? this.injectDiagnosticContext(this.conversationHistory, diagnosticReport)
          : this.conversationHistory;

        // Get LLM response with optional web search
        const llmResponse = await this.llmService.chat(
          messagesWithContext,
          this.availableTools,
          {
            enableWebSearch,
            searchConfig: webSearchConfig,
          }
        );

        // Add assistant response to history (even if it has tool calls)
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: llmResponse.content,
        };

        // Add tool calls if present
        if (llmResponse.toolCalls.length > 0) {
          assistantMessage.tool_calls = llmResponse.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }));
        }

        this.conversationHistory.push(assistantMessage);

        // If no tool calls, we have final response
        if (llmResponse.toolCalls.length === 0) {
          logger.info('Final response received', {
            iterations,
            hasContent: !!llmResponse.content,
          });

          return llmResponse.content ?? 'No response from assistant.';
        }

        // Execute tool calls
        logger.info('Executing tool calls', {
          count: llmResponse.toolCalls.length,
        });

        await this.executeToolCalls(llmResponse.toolCalls);

        // Continue loop to get final response
      } catch (error) {
        logger.error('Error in message processing loop', {
          iteration: iterations,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new Error(
          `Failed to process message: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Max iterations reached
    const warning = `⚠️ Maximum tool iterations (${this.maxToolIterations}) reached. Unable to complete request.`;
    logger.warn('Max tool iterations reached');

    return warning;
  }

  /**
   * Reset conversation history.
   *
   * Keeps system prompt, clears all user/assistant messages.
   */
  resetConversation(): void {
    logger.info('Resetting conversation history');

    this.conversationHistory = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
    ];
  }

  /**
   * Close the orchestrator and cleanup.
   *
   * Cleanup:
   * - Close MCP client
   * - Clear conversation history
   * - Clear available tools
   */
  async close(): Promise<void> {
    logger.info('Closing chat orchestrator');

    await this.mcpClient.close();

    this.conversationHistory = [];
    this.availableTools = [];

    logger.info('Chat orchestrator closed');
  }

  /**
   * Set chat mode.
   *
   * Switches between normal and troubleshooting modes.
   * Rebuilds system prompt with mode-specific instructions.
   *
   * @param mode Chat mode to set
   */
  async setMode(mode: ChatMode): Promise<void> {
    logger.info('Switching chat mode', { from: this.currentMode, to: mode });

    this.currentMode = mode;

    // Rebuild layered instructions with new mode
    const layeredInstructions = await this.buildLayeredInstructions();

    // Update system prompt in conversation history
    if (this.conversationHistory.length > 0 && this.conversationHistory[0]?.role === 'system') {
      this.conversationHistory[0].content = layeredInstructions;
    } else {
      // If no system message, add one
      this.conversationHistory.unshift({
        role: 'system',
        content: layeredInstructions,
      });
    }

    logger.info('Chat mode switched successfully', { mode: this.currentMode });
  }

  /**
   * Get current chat mode.
   *
   * @returns Current chat mode
   */
  getMode(): ChatMode {
    return this.currentMode;
  }

  /**
   * Execute tool calls and add results to conversation.
   *
   * Complexity: O(n) where n = number of tool calls
   * Parallelization: Tools executed in parallel for better performance
   *
   * Error Handling:
   * - Individual tool errors → Add error message to conversation
   * - All tools fail → Add error summary to conversation
   * - Let LLM handle errors and respond to user
   */
  private async executeToolCalls(toolCalls: LlmToolCall[]): Promise<void> {
    logger.debug('Executing tool calls', { count: toolCalls.length });

    // Execute all tool calls in parallel
    const results = await Promise.allSettled(
      toolCalls.map(async (toolCall) => {
        try {
          logger.debug('Calling tool', {
            name: toolCall.name,
            args: toolCall.arguments,
          });

          const result = await this.mcpClient.callTool(toolCall.name, toolCall.arguments);

          logger.debug('Tool call succeeded', {
            name: toolCall.name,
            hasError: result.isError,
          });

          return {
            toolCallId: toolCall.id,
            result,
          };
        } catch (error) {
          logger.error('Tool call failed', {
            name: toolCall.name,
            error: error instanceof Error ? error.message : String(error),
          });

          // Return error as tool result
          return {
            toolCallId: toolCall.id,
            result: {
              content: [
                {
                  type: 'text' as const,
                  text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
              isError: true,
            },
          };
        }
      })
    );

    // Add tool results to conversation
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { toolCallId, result: toolResult } = result.value;

        // Extract text content from MCP result
        const content =
          toolResult.content.map((c) => c.text).join('\n') || 'Tool executed successfully';

        this.conversationHistory.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content,
        });

        logger.debug('Tool result added to conversation', {
          toolCallId,
          contentLength: content.length,
        });
      } else {
        logger.error('Tool execution promise rejected', {
          reason: result.reason,
        });
      }
    }
  }

  /**
   * Detect troubleshooting intent in user message.
   *
   * @param message User message
   * @returns True if troubleshooting intent detected
   */
  private detectTroubleshootingIntent(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    return ChatOrchestrator.TROUBLESHOOTING_KEYWORDS.some((keyword) =>
      lowerMessage.includes(keyword)
    );
  }

  /**
   * Handle mode toggle commands.
   *
   * @param message User message
   * @returns Mode switch confirmation or null if not a command
   */
  private handleModeCommand(message: string): string | null {
    const trimmed = message.trim().toLowerCase();

    if (trimmed === '/troubleshoot') {
      if (this.currentMode === ChatMode.TROUBLESHOOTING) {
        return '🔧 Already in troubleshooting mode.';
      }

      void this.setMode(ChatMode.TROUBLESHOOTING);
      return '🔧 Switched to troubleshooting mode. I\'ll help diagnose issues systematically using event history and web search.';
    }

    if (trimmed === '/normal') {
      if (this.currentMode === ChatMode.NORMAL) {
        return '💬 Already in normal mode.';
      }

      void this.setMode(ChatMode.NORMAL);
      return '💬 Switched to normal mode.';
    }

    return null;
  }

  /**
   * Load troubleshooting prompts from file.
   *
   * Loads and caches troubleshooting prompts for later use.
   * Non-critical - continues with fallback if loading fails.
   */
  private async loadTroubleshootingPrompts(): Promise<void> {
    try {
      const docsDir = join(process.cwd(), 'docs');
      const troubleshootingPromptsPath = join(docsDir, 'troubleshooting-system-prompts.md');

      logger.debug('Loading troubleshooting prompts', {
        path: troubleshootingPromptsPath,
      });

      const content = await readFile(troubleshootingPromptsPath, 'utf-8');

      // Extract the core prompts sections (not the documentation parts)
      this.troubleshootingPrompt = this.extractTroubleshootingPrompts(content);

      logger.info('Troubleshooting prompts loaded successfully', {
        length: this.troubleshootingPrompt.length,
      });
    } catch (error) {
      logger.warn('Failed to load troubleshooting prompts, will use inline fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      this.troubleshootingPrompt = this.getFallbackTroubleshootingPrompt();
    }
  }

  /**
   * Extract troubleshooting prompts from documentation.
   *
   * Extracts only the prompt sections, not the documentation/metadata.
   *
   * @param content Full documentation content
   * @returns Extracted prompt text
   */
  private extractTroubleshootingPrompts(content: string): string {
    // Extract sections between code blocks
    const sections: string[] = [];

    // Match all code blocks
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = content.match(codeBlockRegex);

    if (codeBlocks) {
      for (const block of codeBlocks) {
        // Remove the ``` markers
        const cleaned = block.replace(/```[a-z]*\n?/g, '').replace(/```$/g, '').trim();
        sections.push(cleaned);
      }
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Get fallback troubleshooting prompt.
   *
   * Provides inline fallback if external prompts can't be loaded.
   *
   * @returns Fallback troubleshooting prompt
   */
  private getFallbackTroubleshootingPrompt(): string {
    return `You are an expert SmartThings smart home troubleshooting assistant.

When diagnosing issues, follow this structured approach:

1. **GATHER CONTEXT** - Ask clarifying questions about the issue
2. **COLLECT DATA** - Retrieve device event history using get_device_events
3. **ANALYZE PATTERNS** - Look for event gaps, timing anomalies, correlations
4. **RESEARCH SOLUTIONS** - Use web search for known issues and solutions
5. **DIAGNOSE ROOT CAUSE** - Form hypothesis based on data and research
6. **PROPOSE SOLUTIONS** - Recommend specific fixes ordered by likelihood
7. **IMPLEMENT FIXES** - Execute changes with user approval
8. **VERIFY RESOLUTION** - Monitor and confirm issue is resolved

Always cite web search sources and provide confidence levels for diagnoses.`;
  }

  /**
   * Build layered instructions by combining system and session instructions.
   *
   * Architecture:
   * - System Instructions: Static identity, tone, behavior guidelines
   * - Session Instructions: Dynamic device/room/scene context
   * - Troubleshooting Prompts: When in troubleshooting mode
   *
   * @returns Combined instruction text
   */
  private async buildLayeredInstructions(): Promise<string> {
    try {
      // Load system instructions (static identity)
      const systemInstructions = await this.loadSystemInstructions();

      // Generate session context (dynamic device data)
      const sessionContext = await this.generateSessionContext();

      // Build combined instructions based on mode
      let combined: string;

      if (this.currentMode === ChatMode.TROUBLESHOOTING && this.troubleshootingPrompt) {
        // Troubleshooting mode: Add troubleshooting prompts
        combined = `${systemInstructions}\n\n---\n\n# TROUBLESHOOTING MODE ACTIVE\n\n${this.troubleshootingPrompt}\n\n---\n\n${sessionContext}`;

        logger.debug('Layered instructions built (troubleshooting mode)', {
          systemLength: systemInstructions.length,
          troubleshootingLength: this.troubleshootingPrompt.length,
          sessionLength: sessionContext.length,
          totalLength: combined.length,
        });
      } else {
        // Normal mode: Standard instructions
        combined = `${systemInstructions}\n\n---\n\n${sessionContext}`;

        logger.debug('Layered instructions built (normal mode)', {
          systemLength: systemInstructions.length,
          sessionLength: sessionContext.length,
          totalLength: combined.length,
        });
      }

      return combined;
    } catch (error) {
      logger.warn('Failed to load layered instructions, using fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to default prompt if custom instructions fail
      return this.systemPrompt || this.getDefaultSystemPrompt();
    }
  }

  /**
   * Load system instructions from file.
   *
   * @returns System instruction text
   */
  private async loadSystemInstructions(): Promise<string> {
    const promptsDir = join(process.cwd(), 'prompts');
    const systemInstructionsPath = join(promptsDir, 'system-instructions.md');

    logger.debug('Loading system instructions', {
      path: systemInstructionsPath,
    });

    const content = await readFile(systemInstructionsPath, 'utf-8');

    return content;
  }

  /**
   * Generate session context by querying MCP for current device state.
   *
   * @returns Rendered session instructions with dynamic context
   */
  private async generateSessionContext(): Promise<string> {
    const promptsDir = join(process.cwd(), 'prompts');
    const sessionTemplatePath = join(promptsDir, 'session-instructions.template.md');

    logger.debug('Loading session template', {
      path: sessionTemplatePath,
    });

    const template = await readFile(sessionTemplatePath, 'utf-8');

    // Query MCP for current home state
    const homeContext = await this.fetchHomeContext();

    // Render template with context
    const rendered = Mustache.render(template, homeContext);

    logger.debug('Session context generated', {
      deviceCount: homeContext.deviceCount,
      sceneCount: homeContext.sceneCount,
      roomCount: homeContext.rooms?.length ?? 0,
    });

    return rendered;
  }

  /**
   * Fetch home context from MCP client.
   *
   * Queries devices, scenes, and locations to build dynamic context.
   *
   * @returns Context object for Mustache template
   */
  private async fetchHomeContext(): Promise<HomeContext> {
    try {
      // Fetch devices
      const devicesResult = await this.mcpClient.callTool('list_devices', {});
      const devicesText = devicesResult.content.find((c) => c.type === 'text')?.text ?? '[]';
      const devices = JSON.parse(devicesText);

      // Fetch scenes
      const scenesResult = await this.mcpClient.callTool('list_scenes', {});
      const scenesText = scenesResult.content.find((c) => c.type === 'text')?.text ?? '[]';
      const scenes = JSON.parse(scenesText);

      // Group devices by room
      const roomMap = new Map<
        string,
        Array<{
          name: string;
          type: string;
          deviceId: string;
          capabilities: string;
          state: string;
        }>
      >();

      for (const device of devices) {
        const roomName = device.roomName ?? 'Unassigned';
        if (!roomMap.has(roomName)) {
          roomMap.set(roomName, []);
        }

        roomMap.get(roomName)!.push({
          name: device.name,
          type: device.type ?? 'Unknown',
          deviceId: device.deviceId,
          capabilities: device.capabilities?.join(', ') ?? 'None',
          state: this.summarizeDeviceState(device),
        });
      }

      // Build room structure
      const rooms = Array.from(roomMap.entries()).map(([roomName, roomDevices]) => ({
        roomName,
        deviceCount: roomDevices.length,
        devices: roomDevices,
      }));

      // Build locations structure
      const locationMap = new Map<string, Array<{ roomName: string; deviceCount: number }>>();

      for (const device of devices) {
        const locationName = device.locationName ?? 'Unknown';
        const roomName = device.roomName ?? 'Unassigned';

        if (!locationMap.has(locationName)) {
          locationMap.set(locationName, []);
        }

        const existingRoom = locationMap.get(locationName)!.find((r) => r.roomName === roomName);

        if (existingRoom) {
          existingRoom.deviceCount++;
        } else {
          locationMap.get(locationName)!.push({
            roomName,
            deviceCount: 1,
          });
        }
      }

      const locations = Array.from(locationMap.entries()).map(([locationName, locationRooms]) => ({
        locationName,
        rooms: locationRooms,
      }));

      // Format scenes
      const formattedScenes = scenes.map((scene: any) => ({
        name: scene.sceneName,
        description: scene.sceneName, // SmartThings doesn't provide descriptions
        sceneId: scene.sceneId,
        locationName: scene.locationName ?? 'Unknown',
      }));

      // Count active/offline devices
      const activeDeviceCount = devices.filter((d: any) => d.status !== 'OFFLINE').length;
      const offlineDeviceCount = devices.filter((d: any) => d.status === 'OFFLINE').length;

      const offlineDevices = devices
        .filter((d: any) => d.status === 'OFFLINE')
        .map((d: any) => ({
          name: d.name,
          roomName: d.roomName ?? 'Unassigned',
          lastSeen: 'Unknown',
        }));

      return {
        timestamp: new Date().toISOString(),
        deviceCount: devices.length,
        sceneCount: scenes.length,
        rooms,
        scenes: formattedScenes,
        locations,
        lastSync: new Date().toLocaleString(),
        activeDeviceCount,
        offlineDeviceCount,
        offlineDevices,
        exampleRoom: rooms[0]?.roomName ?? 'Living Room',
        temperatureUnit: 'F',
        verbosityLevel: 'normal',
        confirmationStyle: 'brief',
      };
    } catch (error) {
      logger.error('Failed to fetch home context', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return minimal context on error
      return {
        timestamp: new Date().toISOString(),
        deviceCount: 0,
        sceneCount: 0,
        rooms: [],
        scenes: [],
        locations: [],
        lastSync: new Date().toLocaleString(),
        activeDeviceCount: 0,
        offlineDeviceCount: 0,
        offlineDevices: [],
        exampleRoom: 'Living Room',
        temperatureUnit: 'F',
        verbosityLevel: 'normal',
        confirmationStyle: 'brief',
      };
    }
  }

  /**
   * Summarize device state for display.
   *
   * @param device Device object
   * @returns Human-readable state summary
   */
  private summarizeDeviceState(device: any): string {
    const components = device.components?.main;
    if (!components) return 'Unknown';

    const states: string[] = [];

    if (components.switch?.switch?.value) {
      states.push(`Power: ${components.switch.switch.value}`);
    }

    if (components.switchLevel?.level?.value !== undefined) {
      states.push(`Level: ${components.switchLevel.level.value}%`);
    }

    if (components.temperatureMeasurement?.temperature?.value !== undefined) {
      states.push(`Temp: ${components.temperatureMeasurement.temperature.value}°`);
    }

    if (components.thermostatMode?.thermostatMode?.value) {
      states.push(`Mode: ${components.thermostatMode.thermostatMode.value}`);
    }

    return states.length > 0 ? states.join(', ') : 'OK';
  }

  /**
   * Get default system prompt.
   *
   * Provides context about capabilities and usage guidelines.
   */
  private getDefaultSystemPrompt(): string {
    return `You are a helpful assistant that controls SmartThings home automation devices.

You have access to these capabilities:
- Control devices (turn on/off, set levels, adjust temperature)
- Query device status and capabilities
- List devices by room or location
- Manage rooms and locations
- Execute and list scenes

When users ask you to control devices:
1. If they mention a room (e.g., "living room lights"), use list_devices with roomName first
2. Use the device information to find the correct device ID
3. Execute the requested action with the device ID
4. Confirm the action was successful

When device names are ambiguous or not found:
1. List available devices in the mentioned room
2. Ask the user to clarify which device they meant

Be conversational and helpful. Provide clear feedback on actions taken.
If an operation fails, explain what went wrong and suggest alternatives.

Available tools will be provided as function calls. Use them to fulfill user requests.`;
  }

  /**
   * Get conversation context for intent classification.
   *
   * Returns last 3 messages for context window.
   *
   * @returns Array of recent message contents
   */
  private getConversationContext(): string[] {
    return this.conversationHistory
      .slice(-3)
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => `${msg.role}: ${msg.content || ''}`);
  }

  /**
   * Inject diagnostic context into conversation history.
   *
   * Design Decision: Insert before user message as system context
   * Rationale: System messages provide LLM with additional context without
   * appearing as user conversation. LLM treats this as privileged information.
   *
   * @param messages Original conversation history
   * @param report Diagnostic report to inject
   * @returns Messages with injected diagnostic context
   */
  private injectDiagnosticContext(
    messages: ChatMessage[],
    report: DiagnosticReport
  ): ChatMessage[] {
    // Find system message index (should be first)
    const systemMsgIndex = messages.findIndex((msg) => msg.role === 'system');

    if (systemMsgIndex === -1) {
      // No system message, shouldn't happen but handle gracefully
      logger.warn('No system message found for diagnostic context injection');
      return messages;
    }

    // Build enhanced system prompt with diagnostic context
    const systemMsg = messages[systemMsgIndex];
    if (!systemMsg) {
      logger.warn('System message index is invalid');
      return messages;
    }

    const enhancedSystemPrompt = this.buildEnhancedSystemPrompt(
      systemMsg.content?.toString() || '',
      report
    );

    // Clone messages array and update system message
    const messagesWithContext = [...messages];
    messagesWithContext[systemMsgIndex] = {
      role: 'system',
      content: enhancedSystemPrompt,
    };

    logger.debug('Diagnostic context injected into system prompt', {
      originalLength: systemMsg.content?.toString().length || 0,
      enhancedLength: enhancedSystemPrompt.length,
    });

    return messagesWithContext;
  }

  /**
   * Build enhanced system prompt with diagnostic context.
   *
   * @param basePrompt Base system prompt
   * @param report Diagnostic report
   * @returns Enhanced system prompt
   */
  private buildEnhancedSystemPrompt(basePrompt: string, report: DiagnosticReport): string {
    const sections: string[] = [basePrompt];

    // Add diagnostic context section
    sections.push('\n---\n');
    sections.push('## DIAGNOSTIC CONTEXT (Auto-Gathered)\n');
    sections.push(`I've automatically gathered the following diagnostic information:\n`);
    sections.push(report.richContext);

    // Add recommendations if present
    if (report.recommendations.length > 0) {
      sections.push('\n## RECOMMENDATIONS\n');
      report.recommendations.forEach((rec) => {
        sections.push(`- ${rec}`);
      });
    }

    sections.push('\n---\n');

    return sections.join('\n');
  }
}
