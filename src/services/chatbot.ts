/**
 * Chatbot REPL service with readline interface.
 *
 * Design Decision: readline over inquirer
 * Rationale: Built-in Node.js module, simpler, fewer dependencies.
 * Provides sufficient functionality for REPL interface.
 *
 * Architecture:
 * User Input → Readline → ChatbotService → Orchestrator → Response Display
 *
 * Trade-offs:
 * - Simplicity: readline is simpler vs. inquirer's rich features
 * - Dependencies: Zero external deps vs. inquirer package
 * - Features: Basic REPL vs. advanced prompts/menus
 *
 * Error Handling:
 * - Readline errors → Log and attempt to continue
 * - Signal handling → Graceful shutdown on Ctrl+C
 * - Input validation → Handle empty/invalid input
 */

import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import chalk from 'chalk';
import logger from '../utils/logger.js';

/**
 * Chatbot service configuration.
 */
export interface ChatbotConfig {
  /**
   * Enable colored output.
   */
  useColor?: boolean;

  /**
   * Custom prompt string.
   */
  prompt?: string;
}

/**
 * Message handler callback type.
 */
export type MessageHandler = (message: string) => Promise<string>;

/**
 * Chatbot service interface for dependency injection.
 */
export interface IChatbotService {
  /**
   * Start the REPL interface.
   *
   * @param handler Message handler function
   * @throws Error if REPL is already running
   */
  start(handler: MessageHandler): Promise<void>;

  /**
   * Stop the REPL interface.
   */
  stop(): Promise<void>;

  /**
   * Send a message programmatically (for testing).
   *
   * @param message Message to send
   * @param handler Message handler function
   * @returns Response from handler
   */
  sendMessage(message: string, handler: MessageHandler): Promise<string>;
}

/**
 * Chatbot REPL service implementation.
 *
 * Features:
 * - Colorized output (chalk)
 * - Command handling (/help, /exit)
 * - Signal handling (Ctrl+C)
 * - Message history tracking
 */
export class ChatbotService implements IChatbotService {
  private rl: readline.Interface | null = null;
  private running = false;
  private useColor: boolean;
  private promptString: string;
  private messageHistory: string[] = [];

  /**
   * Create chatbot service instance.
   *
   * @param config Service configuration
   */
  constructor(config: ChatbotConfig = {}) {
    this.useColor = config.useColor ?? true;
    this.promptString = config.prompt ?? 'You';

    logger.info('Chatbot service initialized', {
      useColor: this.useColor,
      prompt: this.promptString,
    });
  }

  /**
   * Start the REPL interface.
   *
   * Lifecycle:
   * 1. Create readline interface
   * 2. Display welcome message
   * 3. Enter message loop
   * 4. Handle commands and messages
   * 5. Continue until /exit or Ctrl+C
   */
  async start(handler: MessageHandler): Promise<void> {
    if (this.running) {
      throw new Error('Chatbot is already running');
    }

    logger.info('Starting chatbot REPL');

    this.rl = readline.createInterface({
      input,
      output,
      prompt: this.formatPrompt(this.promptString),
    });

    this.running = true;

    // Display welcome message
    this.displayWelcome();

    // Setup signal handlers
    this.setupSignalHandlers();

    // Enter message loop
    try {
      for await (const line of this.rl) {
        const trimmed = line.trim();

        if (trimmed.length === 0) {
          this.rl.prompt();
          continue;
        }

        // Handle commands
        if (trimmed.startsWith('/')) {
          const shouldContinue = await this.handleCommand(trimmed);
          if (!shouldContinue) {
            break;
          }
          this.rl.prompt();
          continue;
        }

        // Process user message
        try {
          this.messageHistory.push(trimmed);

          const response = await handler(trimmed);

          this.displayResponse(response);
        } catch (error) {
          this.displayError(error instanceof Error ? error.message : String(error));
        }

        this.rl.prompt();
      }
    } catch (error) {
      logger.error('REPL error', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await this.stop();
    }
  }

  /**
   * Stop the REPL interface.
   *
   * Cleanup:
   * - Close readline interface
   * - Clear running flag
   * - Display goodbye message
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info('Stopping chatbot REPL');

    this.running = false;

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    this.displayGoodbye();
  }

  /**
   * Send message programmatically (for testing).
   */
  async sendMessage(message: string, handler: MessageHandler): Promise<string> {
    this.messageHistory.push(message);
    return await handler(message);
  }

  /**
   * Handle REPL commands.
   *
   * Supported commands:
   * - /help - Show help message
   * - /exit - Exit the chatbot
   * - /history - Show message history
   * - /clear - Clear message history
   *
   * @param command Command string (including /)
   * @returns true to continue, false to exit
   */
  private async handleCommand(command: string): Promise<boolean> {
    const cmd = command.toLowerCase();

    switch (cmd) {
      case '/help':
        this.displayHelp();
        return true;

      case '/exit':
      case '/quit':
        return false;

      case '/history':
        this.displayHistory();
        return true;

      case '/clear':
        this.messageHistory = [];
        this.displayInfo('Message history cleared');
        return true;

      default:
        this.displayError(`Unknown command: ${command}`);
        this.displayInfo('Type /help for available commands');
        return true;
    }
  }

  /**
   * Setup signal handlers for graceful shutdown.
   */
  private setupSignalHandlers(): void {
    // Handle Ctrl+C
    this.rl?.on('SIGINT', () => {
      this.displayInfo('\nReceived Ctrl+C, exiting...');
      void this.stop().finally(() => process.exit(0));
    });
  }

  /**
   * Display welcome message.
   */
  private displayWelcome(): void {
    const welcome = this.useColor
      ? chalk.bold.cyan('\n🤖 SmarterThings\n')
      : '\n🤖 SmarterThings\n';

    const subtitle = this.useColor
      ? chalk.gray('Your AI-powered SmartThings controller\n')
      : 'Your AI-powered SmartThings controller\n';

    const helpHint = this.useColor
      ? chalk.gray('Type /help for commands, /exit to quit\n')
      : 'Type /help for commands, /exit to quit\n';

    output.write(welcome + subtitle + helpHint + '\n');
  }

  /**
   * Display help message.
   */
  private displayHelp(): void {
    const title = this.useColor ? chalk.bold('\nAvailable Commands:\n') : '\nAvailable Commands:\n';

    const commands = [
      '/help          - Show this help message',
      '/exit          - Exit the chatbot',
      '/history       - Show message history',
      '/clear         - Clear message history',
      '/troubleshoot  - Enter troubleshooting mode',
      '/normal        - Return to normal mode',
    ];

    const commandsText = this.useColor
      ? commands.map((cmd) => chalk.gray('  ' + cmd)).join('\n')
      : commands.map((cmd) => '  ' + cmd).join('\n');

    const examples = this.useColor ? chalk.bold('\nExample Messages:\n') : '\nExample Messages:\n';

    const examplesList = [
      'Turn on the living room lights',
      "What's the temperature in bedroom?",
      'List all devices in the kitchen',
      'Execute the "Movie Time" scene',
    ];

    const examplesText = this.useColor
      ? examplesList.map((ex) => chalk.gray('  • ' + ex)).join('\n')
      : examplesList.map((ex) => '  • ' + ex).join('\n');

    const troubleshooting = this.useColor
      ? chalk.bold('\nTroubleshooting Mode:\n')
      : '\nTroubleshooting Mode:\n';

    const troubleshootingList = [
      'Auto-activates when you describe an issue',
      'Uses web search to find solutions',
      'Analyzes device event history',
      'Example: "My motion sensor randomly stops working"',
    ];

    const troubleshootingText = this.useColor
      ? troubleshootingList.map((ex) => chalk.gray('  • ' + ex)).join('\n')
      : troubleshootingList.map((ex) => '  • ' + ex).join('\n');

    output.write(
      title +
        commandsText +
        '\n' +
        examples +
        examplesText +
        '\n' +
        troubleshooting +
        troubleshootingText +
        '\n\n'
    );
  }

  /**
   * Display message history.
   */
  private displayHistory(): void {
    if (this.messageHistory.length === 0) {
      this.displayInfo('No message history');
      return;
    }

    const title = this.useColor ? chalk.bold('\nMessage History:\n') : '\nMessage History:\n';

    const history = this.messageHistory.map((msg, i) => `  ${i + 1}. ${msg}`).join('\n');

    const historyText = this.useColor ? chalk.gray(history) : history;

    output.write(title + historyText + '\n\n');
  }

  /**
   * Display assistant response.
   */
  private displayResponse(response: string): void {
    const label = this.useColor ? chalk.bold.green('\nAssistant: ') : '\nAssistant: ';

    const content = this.useColor ? chalk.white(response) : response;

    output.write(label + content + '\n\n');
  }

  /**
   * Display error message.
   */
  private displayError(message: string): void {
    const label = this.useColor ? chalk.bold.red('\n❌ Error: ') : '\nError: ';

    const content = this.useColor ? chalk.red(message) : message;

    output.write(label + content + '\n\n');
  }

  /**
   * Display info message.
   */
  private displayInfo(message: string): void {
    const content = this.useColor ? chalk.cyan(message) : message;

    output.write('\n' + content + '\n\n');
  }

  /**
   * Display goodbye message.
   */
  private displayGoodbye(): void {
    const goodbye = this.useColor ? chalk.bold.cyan('\nGoodbye! 👋\n') : '\nGoodbye! 👋\n';

    output.write(goodbye);
  }

  /**
   * Format prompt string with color.
   */
  private formatPrompt(prompt: string): string {
    return this.useColor ? chalk.bold.blue(`\n${prompt}: `) : `\n${prompt}: `;
  }
}
