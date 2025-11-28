/**
 * Alexa Custom Skill handler (Conversational Alexa with LLM)
 *
 * Design Decision: Custom Skill vs Smart Home Skill
 * Rationale: Custom Skills support conversational AI with natural language
 * queries through LLM integration, while Smart Home Skills provide direct
 * device control with predefined commands.
 *
 * Architecture:
 * User → Alexa → Custom Skill Request → ChatOrchestrator → MCP → SmartThings
 *
 * Custom Skill Flow:
 * 1. LaunchRequest: "Alexa, open smart home"
 * 2. IntentRequest: Process CatchAllIntent with natural language
 * 3. ChatOrchestrator: Route query to LLM with MCP tools
 * 4. Response: Convert LLM response to speech output
 * 5. SessionEndedRequest: Cleanup session
 *
 * Integration Strategy:
 * - Reuses existing ChatOrchestrator for LLM + MCP integration
 * - No direct SmartThings API calls (goes through MCP tools)
 * - Session management for multi-turn conversations
 *
 * Trade-offs:
 * - Flexibility: Natural language vs. fixed command structure
 * - Latency: LLM processing adds 2-5s vs. <500ms for Smart Home
 * - Complexity: More sophisticated error handling required
 * - User Experience: Conversational vs. command-based
 *
 * Error Handling:
 * - Chatbot errors: Return user-friendly error message
 * - Unknown intents: Provide helpful fallback response
 * - Session errors: Log and continue with best effort
 */

import type { CustomSkillRequest, CustomSkillResponse, CustomSkillRequestType } from './types.js';
import { ChatOrchestrator } from '../services/chat-orchestrator.js';
import { McpClient } from '../mcp/client.js';
import { LlmService } from '../services/llm.js';
import logger from '../utils/logger.js';

/**
 * Session management for conversation context
 */
const sessionStore = new Map<
  string,
  {
    orchestrator: ChatOrchestrator;
    lastActivity: number;
  }
>();

/**
 * Session timeout in milliseconds (30 minutes)
 */
const SESSION_TIMEOUT = 30 * 60 * 1000;

/**
 * Cleanup expired sessions periodically
 */
setInterval(
  () => {
    const now = Date.now();
    for (const [sessionId, session] of sessionStore.entries()) {
      if (now - session.lastActivity > SESSION_TIMEOUT) {
        logger.info('Cleaning up expired session', { sessionId });
        session.orchestrator.close().catch((err) => {
          logger.error('Error closing orchestrator', { sessionId, error: err });
        });
        sessionStore.delete(sessionId);
      }
    }
  },
  5 * 60 * 1000
); // Check every 5 minutes

/**
 * Get or create session orchestrator
 *
 * Sessions are stored per user to maintain conversation context
 * across multiple interactions within the same Alexa session.
 *
 * @param sessionId Alexa session ID
 * @returns Chat orchestrator for session
 */
async function getOrCreateOrchestrator(sessionId: string): Promise<ChatOrchestrator> {
  // Check if session exists
  const existing = sessionStore.get(sessionId);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing.orchestrator;
  }

  // Create new session
  logger.info('Creating new chat session', { sessionId });

  const mcpClient = new McpClient();
  const llmService = new LlmService({
    apiKey: process.env['OPENROUTER_API_KEY'] || '',
    model: process.env['OPENROUTER_MODEL'] || 'anthropic/claude-sonnet-4.5',
  });
  const orchestrator = new ChatOrchestrator(mcpClient, llmService);

  await orchestrator.initialize();

  sessionStore.set(sessionId, {
    orchestrator,
    lastActivity: Date.now(),
  });

  return orchestrator;
}

/**
 * Process user query through chatbot
 *
 * Integration with ChatOrchestrator:
 * - Sends user query to LLM with MCP tools
 * - LLM decides which tools to call
 * - MCP executes SmartThings operations
 * - Returns natural language response
 *
 * @param query Natural language query from user
 * @param sessionId Session identifier
 * @returns Assistant response
 */
async function processQuery(query: string, sessionId: string): Promise<string> {
  try {
    logger.info('Processing query', { query, sessionId });

    const orchestrator = await getOrCreateOrchestrator(sessionId);
    const response = await orchestrator.processMessage(query);

    logger.info('Query processed successfully', {
      query,
      responseLength: response.length,
    });

    return response;
  } catch (error) {
    logger.error('Error processing query', {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Build speech response
 *
 * Converts text to Alexa speech output format.
 *
 * @param text Response text
 * @param shouldEndSession Whether to end session after response
 * @returns Custom Skill response
 */
function buildSpeechResponse(text: string, shouldEndSession: boolean = true): CustomSkillResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text,
      },
      shouldEndSession,
    },
  };
}

/**
 * Build launch response
 *
 * Response when user opens skill: "Alexa, open smart home"
 *
 * @returns Launch response
 */
function buildLaunchResponse(): CustomSkillResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: 'What would you like to do?',
      },
      shouldEndSession: false,
    },
  };
}

/**
 * Build empty response
 *
 * Used for SessionEndedRequest where no speech output is needed.
 *
 * @returns Empty response
 */
function buildEmptyResponse(): CustomSkillResponse {
  return {
    version: '1.0',
    response: {
      shouldEndSession: true,
    },
  };
}

/**
 * Build fallback response
 *
 * Used when request type or intent is not recognized.
 *
 * @returns Fallback response
 */
function buildFallbackResponse(): CustomSkillResponse {
  return buildSpeechResponse("I didn't understand that.", true);
}

/**
 * Build error response
 *
 * User-friendly error message when processing fails.
 *
 * @returns Error response
 */
function buildErrorResponse(): CustomSkillResponse {
  return buildSpeechResponse('Sorry, something went wrong.', true);
}

/**
 * Handle built-in intents
 *
 * Built-in intents:
 * - AMAZON.HelpIntent: Provide help information
 * - AMAZON.CancelIntent: Cancel current operation
 * - AMAZON.StopIntent: Stop and exit
 * - AMAZON.FallbackIntent: Handle unrecognized input
 *
 * @param intentName Built-in intent name
 * @returns Intent response
 */
function handleBuiltInIntent(intentName: string): CustomSkillResponse {
  logger.info('Handling built-in intent', { intentName });

  switch (intentName) {
    case 'AMAZON.HelpIntent':
      return buildSpeechResponse(
        'You can ask me to control your SmartThings devices. For example, say "turn on living room light" or "what is the temperature in bedroom?"',
        false
      );

    case 'AMAZON.CancelIntent':
    case 'AMAZON.StopIntent':
      return buildSpeechResponse('Goodbye!', true);

    case 'AMAZON.FallbackIntent':
      return buildSpeechResponse(
        "I'm not sure how to help with that. Try asking me to control a device or check a device status.",
        false
      );

    default:
      logger.warn('Unknown built-in intent', { intentName });
      return buildFallbackResponse();
  }
}

/**
 * Handle LaunchRequest
 *
 * Triggered when user opens skill: "Alexa, open smart home"
 *
 * @param request Custom Skill request
 * @returns Launch response
 */
function handleLaunchRequest(_request: CustomSkillRequest): CustomSkillResponse {
  logger.info('Handling LaunchRequest');
  return buildLaunchResponse();
}

/**
 * Handle IntentRequest
 *
 * Processes user intents with natural language queries.
 *
 * Supported Intents:
 * - CatchAllIntent: Natural language queries routed to chatbot
 * - Built-in intents: Help, Cancel, Stop, Fallback
 *
 * @param request Custom Skill request
 * @returns Intent response
 */
async function handleIntentRequest(request: CustomSkillRequest): Promise<CustomSkillResponse> {
  const intentName = request.request.intent?.name;
  const sessionId = request.session?.sessionId ?? 'default';

  logger.info('Handling IntentRequest', { intentName, sessionId });

  if (!intentName) {
    logger.warn('IntentRequest missing intent name');
    return buildFallbackResponse();
  }

  // Handle CatchAllIntent with chatbot
  if (intentName === 'CatchAllIntent') {
    const query = request.request.intent?.slots?.['query']?.value || '';

    if (!query) {
      logger.warn('CatchAllIntent missing query slot');
      return buildSpeechResponse('I did not hear what you wanted to do.', false);
    }

    try {
      const response = await processQuery(query, sessionId);
      return buildSpeechResponse(response, true);
    } catch (error) {
      logger.error('Error processing CatchAllIntent', {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return buildErrorResponse();
    }
  }

  // Handle built-in intents
  if (intentName.startsWith('AMAZON.')) {
    return handleBuiltInIntent(intentName);
  }

  // Unknown intent
  logger.warn('Unknown intent', { intentName });
  return buildFallbackResponse();
}

/**
 * Handle SessionEndedRequest
 *
 * Cleanup when session ends (user says "stop", timeout, or error).
 *
 * Cleanup:
 * - Close orchestrator
 * - Remove session from store
 *
 * @param request Custom Skill request
 * @returns Empty response
 */
function handleSessionEndedRequest(request: CustomSkillRequest): CustomSkillResponse {
  const sessionId = request.session?.sessionId;
  const reason = request.request.reason;

  logger.info('Handling SessionEndedRequest', { sessionId, reason });

  // Cleanup session
  if (sessionId) {
    const session = sessionStore.get(sessionId);
    if (session) {
      session.orchestrator.close().catch((err) => {
        logger.error('Error closing orchestrator on session end', {
          sessionId,
          error: err,
        });
      });
      sessionStore.delete(sessionId);
    }
  }

  return buildEmptyResponse();
}

/**
 * Main Custom Skill request handler
 *
 * Routes request to appropriate handler based on request type:
 * - LaunchRequest → handleLaunchRequest
 * - IntentRequest → handleIntentRequest
 * - SessionEndedRequest → handleSessionEndedRequest
 *
 * Error Handling:
 * - Invalid request structure → Fallback response
 * - Handler errors → Error response
 * - Logging for all error cases
 *
 * @param request Custom Skill request
 * @returns Custom Skill response
 */
export async function handleCustomSkillRequest(
  request: CustomSkillRequest
): Promise<CustomSkillResponse> {
  const requestType: CustomSkillRequestType = request.request?.type;

  logger.info('Handling Custom Skill request', {
    requestType,
    sessionId: request.session?.sessionId,
    requestId: request.request?.requestId,
  });

  try {
    // Route based on request type
    switch (requestType) {
      case 'LaunchRequest':
        return handleLaunchRequest(request);

      case 'IntentRequest':
        return await handleIntentRequest(request);

      case 'SessionEndedRequest':
        return handleSessionEndedRequest(request);

      default:
        logger.warn('Unknown request type', { requestType });
        return buildFallbackResponse();
    }
  } catch (error) {
    logger.error('Error handling Custom Skill request', {
      requestType,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return buildErrorResponse();
  }
}
