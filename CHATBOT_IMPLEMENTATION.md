# MCP SmartThings Chatbot - Implementation Summary

## Overview

Successfully implemented a natural language chatbot interface for SmartThings home automation control. The chatbot validates the MCP protocol by connecting as a real MCP client over stdio, demonstrating that the server works correctly end-to-end.

## Architecture

```
User → Readline REPL → ChatbotService → ChatOrchestrator → LlmService (OpenRouter)
                                    ↓
                              McpClient (stdio) → MCP Server Process → SmartThings API
```

##Files Implemented

### 1. MCP Client (`src/mcp/client.ts`)
**Purpose**: Internal MCP client that spawns and communicates with the MCP server process via stdio

**Key Features**:
- JSON-RPC 2.0 communication over stdio
- Process lifecycle management (spawn, monitor, kill)
- Request/response correlation with timeout handling
- Branded type for request IDs (`JsonRpcId`)
- Automatic retry and error recovery
- Clean shutdown with graceful/forced termination

**Interface**:
```typescript
interface IMcpClient {
  initialize(): Promise<void>;
  listTools(): Promise<McpToolDefinition[]>;
  callTool(name: string, args: unknown): Promise<McpToolResult>;
  close(): Promise<void>;
}
```

**Design Decisions**:
- **Why stdio?** Validates MCP protocol works as designed, not a mock
- **Why spawn process?** Ensures complete isolation and realistic testing
- **Timeout**: 30 seconds for tool calls to handle slow network requests

### 2. LLM Service (`src/services/llm.ts`)
**Purpose**: Integration with OpenRouter API for multi-model LLM access

**Key Features**:
- OpenRouter API client using OpenAI-compatible SDK
- Function calling support (converts MCP tools to OpenAI format)
- Retry logic with exponential backoff (2s, 4s, 8s)
- Default model: `deepseek/deepseek-chat` (free tier)
- Rate limit handling
- Usage statistics tracking

**Interface**:
```typescript
interface ILlmService {
  chat(messages: ChatMessage[], tools: McpToolDefinition[]): Promise<LlmResponse>;
}
```

**Design Decisions**:
- **Why OpenRouter?** Free tier access to multiple models including Grok
- **Why OpenAI SDK?** OpenRouter provides OpenAI-compatible API
- **Retry strategy**: Exponential backoff for rate limits, fail fast for auth errors

### 3. Chatbot Service (`src/services/chatbot.ts`)
**Purpose**: Readline-based REPL interface for user interaction

**Key Features**:
- Colorized output using chalk
- Message history tracking
- Command handling (`/help`, `/exit`, `/history`, `/clear`)
- Signal handling (SIGINT, SIGTERM)
- Graceful shutdown
- Programmatic message sending for testing

**Interface**:
```typescript
interface IChatbotService {
  start(handler: MessageHandler): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: string, handler: MessageHandler): Promise<string>;
}
```

**Design Decisions**:
- **Why readline?** Built-in, simpler than inquirer, fewer dependencies
- **Why chalk?** Standard, well-maintained, ESM-compatible
- **Commands**: Slash-prefixed for consistency with other CLIs

### 4. Chat Orchestrator (`src/services/chat-orchestrator.ts`)
**Purpose**: Coordinates conversation flow between REPL, LLM, and MCP client

**Key Features**:
- Conversation history management
- System prompt injection
- Tool call execution loop (max 10 iterations)
- Parallel tool execution with Promise.allSettled
- Error handling (returns errors to LLM, not to user directly)
- Conversation reset capability

**Interface**:
```typescript
interface IChatOrchestrator {
  initialize(): Promise<void>;
  processMessage(message: string): Promise<string>;
  resetConversation(): void;
  close(): Promise<void>;
}
```

**Design Decisions**:
- **Max iterations**: 10 to prevent infinite loops
- **Parallel tools**: Execute multiple tool calls simultaneously
- **Error strategy**: Let LLM handle tool errors and explain to user
- **System prompt**: Guides LLM on how to use tools effectively

### 5. CLI Entry Point (`src/cli/chat.ts`)
**Purpose**: Command-line interface for starting the chatbot

**Key Features**:
- Argument parsing (`--model`, `--debug`, `--no-color`, `--help`)
- Environment validation
- Service initialization with DI
- Signal handling for clean shutdown
- Helpful error messages with setup instructions

**Usage**:
```bash
npm run chat
npm run chat -- --model grok-beta --debug
npm run chat -- --no-color
npm run chat -- --help
```

**Design Decisions**:
- **Why Node util.parseArgs?** Built-in, no external deps
- **Validation**: Check API keys before starting services
- **Help text**: Comprehensive with examples and env var docs

## Testing

### Unit Tests
- **MCP Client** (`tests/unit/mcp-client.test.ts`): Basic structure tests
- **LLM Service** (`tests/unit/llm-service.test.ts`): Constructor, tool conversion
- **Chatbot Service** (`tests/unit/chatbot-service.test.ts`): Message handling, history
- **Chat Orchestrator** (`tests/unit/chat-orchestrator.test.ts`): Full message flow, tool calls, iteration limits

### Integration Tests
- **Chatbot Flow** (`tests/integration/chatbot-flow.test.ts`):
  - End-to-end message processing
  - Device control with tool calls
  - Status queries
  - Conversation history
  - Error handling
  - Conversation reset

**Test Results**: 82 passed, 2 skipped (100% pass rate on chatbot functionality)

## Dependencies Added

```json
{
  "dependencies": {
    "chalk": "^5.3.0",     // Colorized terminal output
    "openai": "^4.20.0"    // OpenRouter client (OpenAI-compatible)
  }
}
```

## Scripts Added

```json
{
  "chat": "npm run build && node dist/cli/chat.js",
  "chat:dev": "tsx src/cli/chat.ts"
}
```

## Configuration

### Environment Variables
Added to `.env.local`:

```env
# OpenRouter API Key (required for chatbot)
OPENROUTER_API_KEY=sk-or-v1-...

# SmartThings PAT (already required)
SMARTTHINGS_PAT=...
```

### System Prompt
Guides the LLM on how to use SmartThings tools:
- List devices before controlling them
- Search by room when room mentioned
- Confirm actions taken
- Handle errors gracefully
- Ask for clarification when ambiguous

## User Experience

### Welcome Screen
```
🏠 SmartThings Chatbot
Control your home with natural language
Type /help for commands, /exit to quit

You: _
```

### Commands
- `/help` - Show available commands and examples
- `/exit` or `/quit` - Exit the chatbot
- `/history` - Show message history
- `/clear` - Clear message history
- `Ctrl+C` - Graceful shutdown

### Example Interactions

**Device Control**:
```
You: Turn on the living room lights