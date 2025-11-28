#!/usr/bin/env node

/**
 * Chat CLI entry point.
 *
 * Design Decision: CLI-first design with dependency injection
 * Rationale: Clean separation of concerns, easy to test, flexible configuration.
 *
 * Architecture:
 * CLI Args → Config → Services → Orchestrator → REPL
 *
 * Trade-offs:
 * - Flexibility: CLI args override env vars vs. env-only config
 * - Complexity: More setup code vs. simpler hardcoded config
 * - Testability: DI makes testing easier vs. direct instantiation
 *
 * Error Handling:
 * - Missing API key → Clear error message with setup instructions
 * - Invalid args → Display help and exit
 * - Service init failures → Log error and exit gracefully
 * - Unhandled errors → Catch and log before exit
 */

import { parseArgs } from 'util';
import chalk from 'chalk';
import { config as loadEnv } from 'dotenv';
import { McpClient } from '../mcp/client.js';
import { LlmService } from '../services/llm.js';
import { ChatbotService } from '../services/chatbot.js';
import { ChatOrchestrator } from '../services/chat-orchestrator.js';
import logger from '../utils/logger.js';

// Load environment variables from .env.local
loadEnv({ path: '.env.local' });

// Disable logging by default in chat mode (silent)
// User can enable with /debug command via toggle_debug tool
logger.level = 'error';

/**
 * CLI argument configuration.
 */
interface CliArgs {
  model?: string;
  debug?: boolean;
  noColor?: boolean;
  help?: boolean;
}

/**
 * Parse CLI arguments.
 *
 * Supported arguments:
 * --model <model-name>  LLM model to use (default: anthropic/claude-sonnet-4.5)
 * --debug               Enable debug logging
 * --no-color            Disable colored output
 * --help                Show help message
 */
function parseCliArgs(): CliArgs {
  try {
    const { values } = parseArgs({
      options: {
        model: {
          type: 'string',
          short: 'm',
        },
        debug: {
          type: 'boolean',
          short: 'd',
        },
        'no-color': {
          type: 'boolean',
        },
        help: {
          type: 'boolean',
          short: 'h',
        },
      },
      allowPositionals: false,
    });

    return {
      model: values.model,
      debug: values.debug,
      noColor: values['no-color'],
      help: values.help,
    };
  } catch (error) {
    console.error(chalk.red('Error parsing arguments:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * Display help message.
 */
function displayHelp(): void {
  const help = `
${chalk.bold.cyan('MCP SmartThings Chatbot')}
${chalk.gray('Natural language interface for SmartThings home automation')}

${chalk.bold('Usage:')}
  npm run chat [options]

${chalk.bold('Options:')}
  -m, --model <name>    LLM model to use (default: anthropic/claude-sonnet-4.5)
  -d, --debug           Enable debug logging
  --no-color            Disable colored output
  -h, --help            Show this help message

${chalk.bold('Environment Variables:')}
  OPENROUTER_API_KEY    OpenRouter API key (required)
  SMARTTHINGS_PAT       SmartThings Personal Access Token (required)

${chalk.bold('Examples:')}
  npm run chat
  npm run chat --model grok-beta
  npm run chat --debug --no-color

${chalk.bold('Setup:')}
  1. Set OPENROUTER_API_KEY in .env.local
  2. Set SMARTTHINGS_PAT in .env.local
  3. Run: npm run chat

${chalk.bold('Commands (in chat):')}
  /help      Show available commands
  /exit      Exit the chatbot
  /history   Show message history
  /clear     Clear message history
`;

  // Use logger for consistency, but console.log is appropriate here for CLI help text
  // eslint-disable-next-line no-console
  console.log(help);
}

/**
 * Main entry point.
 *
 * Lifecycle:
 * 1. Parse CLI arguments
 * 2. Setup logging
 * 3. Validate environment
 * 4. Initialize services
 * 5. Start chatbot REPL
 * 6. Cleanup on exit
 */
async function main(): Promise<void> {
  const args = parseCliArgs();

  // Show help if requested
  if (args.help) {
    displayHelp();
    process.exit(0);
  }

  // Configure logging
  if (args.debug) {
    logger.level = 'debug';
  }

  // Disable color if requested
  if (args.noColor) {
    chalk.level = 0;
  }

  logger.info('Starting MCP SmartThings Chatbot');

  // Validate environment
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    console.error(chalk.red('\n❌ Error: OPENROUTER_API_KEY environment variable is required\n'));
    console.error(chalk.gray('Setup instructions:'));
    console.error(chalk.gray('  1. Get an API key from https://openrouter.ai/'));
    console.error(chalk.gray('  2. Add to .env.local: OPENROUTER_API_KEY=sk-or-v1-...\n'));
    process.exit(1);
  }

  const smartThingsPat = process.env['SMARTTHINGS_PAT'] || process.env['SMARTTHINGS_TOKEN'];
  if (!smartThingsPat) {
    console.error(chalk.red('\n❌ Error: SMARTTHINGS_PAT environment variable is required\n'));
    console.error(chalk.gray('Setup instructions:'));
    console.error(chalk.gray('  1. Create a PAT at https://account.smartthings.com/tokens'));
    console.error(chalk.gray('  2. Add to .env.local: SMARTTHINGS_PAT=your-token-here\n'));
    process.exit(1);
  }

  // Initialize services
  let mcpClient: McpClient | null = null;
  let orchestrator: ChatOrchestrator | null = null;
  let chatbot: ChatbotService | null = null;

  try {
    logger.info('Initializing services');

    // Create MCP client
    mcpClient = new McpClient();

    // Create LLM service
    const llmService = new LlmService({
      apiKey,
      model: args.model,
    });

    // Create chat orchestrator
    orchestrator = new ChatOrchestrator(mcpClient, llmService);

    // Initialize orchestrator (spawns MCP server, fetches tools)
    await orchestrator.initialize();

    // Create chatbot service
    chatbot = new ChatbotService({
      useColor: !args.noColor,
    });

    logger.info('Services initialized successfully');

    // Setup signal handlers for graceful shutdown
    const cleanup = async (): Promise<void> => {
      logger.info('Shutting down...');

      if (chatbot) {
        await chatbot.stop();
      }

      if (orchestrator) {
        await orchestrator.close();
      }

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => {
      void cleanup();
    });
    process.on('SIGTERM', () => {
      void cleanup();
    });

    // Start chatbot REPL
    await chatbot.start(async (message: string) => {
      return await orchestrator!.processMessage(message);
    });
  } catch (error) {
    logger.error('Fatal error in chat CLI', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    console.error(chalk.red('\n❌ Fatal error:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));

    // Cleanup
    if (chatbot) {
      await chatbot.stop();
    }

    if (orchestrator) {
      await orchestrator.close();
    }

    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise,
  });

  console.error(chalk.red('\n❌ Unhandled promise rejection:'));
  console.error(chalk.red(reason instanceof Error ? reason.message : String(reason)));

  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });

  console.error(chalk.red('\n❌ Uncaught exception:'));
  console.error(chalk.red(error.message));

  process.exit(1);
});

// Start the CLI
main().catch((error) => {
  logger.error('Fatal error in main', {
    error: error instanceof Error ? error.message : String(error),
  });

  console.error(chalk.red('\n❌ Fatal error:'));
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));

  process.exit(1);
});
