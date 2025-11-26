#!/usr/bin/env node

/**
 * Interactive MCP Test Gateway
 *
 * A REPL-style test client for SmartThings MCP server.
 * Provides interactive commands for testing MCP tools without GUI.
 *
 * Design Decision: Interactive REPL over GUI
 * Rationale: Provides quick testing workflow for developers familiar with CLI.
 * Complements MCP Inspector for scenarios requiring scripting or automation.
 *
 * Usage:
 *   npx tsx tools/mcp-test-gateway.ts
 *   npm run test-gateway
 *
 * Commands:
 *   connect           - Connect to MCP server
 *   disconnect        - Disconnect from server
 *   tools             - List all available tools
 *   call <tool> <args> - Call a tool with JSON arguments
 *   devices           - List SmartThings devices (shortcut)
 *   status <deviceId> - Get device status (shortcut)
 *   on <deviceId>     - Turn device on (shortcut)
 *   off <deviceId>    - Turn device off (shortcut)
 *   help              - Show available commands
 *   exit              - Exit gateway
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import readline from 'readline/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Format output with color.
 */
function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Command definition interface.
 */
interface Command {
  name: string;
  description: string;
  usage?: string;
  handler: (args: string[]) => Promise<void>;
}

/**
 * MCP Test Gateway - Interactive client for testing SmartThings MCP server.
 *
 * Architecture:
 * - Uses readline for interactive command input
 * - Maintains persistent client connection
 * - Provides both generic MCP commands and SmartThings-specific shortcuts
 *
 * Error Handling:
 * - Connection errors: Caught and displayed with reconnection guidance
 * - Tool execution errors: Displayed with full error details
 * - Invalid commands: Suggests correct usage or help command
 */
class MCPTestGateway {
  private client?: Client;
  private transport?: StdioClientTransport;
  private rl: readline.Interface;
  private commands: Map<string, Command>;
  private lastDevices: Array<{ deviceId: string; name: string }> = [];

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: colorize('mcp> ', 'cyan'),
    });

    this.commands = new Map();
    this.registerCommands();
  }

  /**
   * Register all available commands.
   *
   * Commands are organized into:
   * - Connection management (connect, disconnect)
   * - MCP protocol commands (tools, call)
   * - SmartThings shortcuts (devices, status, on, off)
   * - Utility commands (help, exit, clear)
   */
  private registerCommands(): void {
    // Connection commands
    this.commands.set('connect', {
      name: 'connect',
      description: 'Connect to MCP server',
      handler: this.connect.bind(this),
    });

    this.commands.set('disconnect', {
      name: 'disconnect',
      description: 'Disconnect from MCP server',
      handler: this.disconnect.bind(this),
    });

    // MCP protocol commands
    this.commands.set('tools', {
      name: 'tools',
      description: 'List all available tools',
      handler: this.listTools.bind(this),
    });

    this.commands.set('call', {
      name: 'call',
      description: 'Call a tool with arguments',
      usage: 'call <tool-name> <json-args>',
      handler: this.callTool.bind(this),
    });

    // SmartThings shortcuts
    this.commands.set('devices', {
      name: 'devices',
      description: 'List all SmartThings devices',
      handler: this.listDevices.bind(this),
    });

    this.commands.set('status', {
      name: 'status',
      description: 'Get device status',
      usage: 'status <deviceId>',
      handler: this.getDeviceStatus.bind(this),
    });

    this.commands.set('on', {
      name: 'on',
      description: 'Turn device on',
      usage: 'on <deviceId>',
      handler: this.turnDeviceOn.bind(this),
    });

    this.commands.set('off', {
      name: 'off',
      description: 'Turn device off',
      usage: 'off <deviceId>',
      handler: this.turnDeviceOff.bind(this),
    });

    this.commands.set('capabilities', {
      name: 'capabilities',
      description: 'Get device capabilities',
      usage: 'capabilities <deviceId>',
      handler: this.getDeviceCapabilities.bind(this),
    });

    // Utility commands
    this.commands.set('help', {
      name: 'help',
      description: 'Show available commands',
      handler: this.showHelp.bind(this),
    });

    this.commands.set('clear', {
      name: 'clear',
      description: 'Clear the screen',
      handler: this.clearScreen.bind(this),
    });

    this.commands.set('exit', {
      name: 'exit',
      description: 'Exit the gateway',
      handler: this.exit.bind(this),
    });
  }

  /**
   * Connect to the MCP server.
   *
   * Creates stdio transport to communicate with the built server.
   * Sets LOG_LEVEL=error to reduce noise during testing.
   *
   * Error Handling:
   * - Connection failures: Displays error and suggests checking server build
   * - Already connected: Warns user to disconnect first
   */
  private async connect(_args: string[]): Promise<void> {
    if (this.client) {
      console.log(colorize('Already connected. Use "disconnect" first.', 'yellow'));
      return;
    }

    console.log(colorize('Connecting to SmartThings MCP server...', 'blue'));

    const serverPath = path.join(__dirname, '../dist/index.js');

    this.transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
        LOG_LEVEL: 'error', // Reduce log noise
      },
    });

    this.client = new Client(
      {
        name: 'mcp-test-gateway',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    try {
      await this.client.connect(this.transport);
      console.log(colorize('✓ Connected successfully!', 'green'));
      console.log(colorize('  Use "tools" to list available tools', 'dim'));
      console.log(colorize('  Use "devices" to list SmartThings devices', 'dim'));
    } catch (error) {
      console.error(colorize('✗ Connection failed:', 'red'), error instanceof Error ? error.message : String(error));
      console.log(colorize('  Make sure the server is built: npm run build', 'yellow'));
      this.client = undefined;
      this.transport = undefined;
    }
  }

  /**
   * Disconnect from the MCP server.
   */
  private async disconnect(_args: string[]): Promise<void> {
    if (!this.client) {
      console.log(colorize('Not connected.', 'yellow'));
      return;
    }

    await this.client.close();
    this.client = undefined;
    this.transport = undefined;
    console.log(colorize('✓ Disconnected.', 'green'));
  }

  /**
   * List all available tools from the server.
   */
  private async listTools(_args: string[]): Promise<void> {
    if (!this.ensureConnected()) return;

    try {
      const result = await this.client!.listTools();
      console.log(colorize('\nAvailable Tools:', 'bright'));
      console.log(colorize('━'.repeat(50), 'dim'));

      result.tools.forEach((tool) => {
        console.log(colorize(`\n${tool.name}`, 'cyan'));
        console.log(`  ${tool.description}`);
        console.log(colorize('  Input Schema:', 'dim'));
        console.log(`  ${JSON.stringify(tool.inputSchema, null, 2).replace(/\n/g, '\n  ')}`);
      });
    } catch (error) {
      this.handleError('Failed to list tools', error);
    }
  }

  /**
   * Call a tool with provided arguments.
   *
   * @param args - [toolName, jsonArgs]
   */
  private async callTool(args: string[]): Promise<void> {
    if (!this.ensureConnected()) return;

    if (args.length < 1) {
      console.log(colorize('Usage: call <tool-name> [<json-args>]', 'yellow'));
      console.log(colorize('Example: call list_devices {}', 'dim'));
      console.log(colorize('Example: call turn_on_device {"deviceId":"abc-123"}', 'dim'));
      return;
    }

    const toolName = args[0];
    let toolArgs: Record<string, unknown> = {};

    if (args.length > 1) {
      const argsJson = args.slice(1).join(' ');
      try {
        toolArgs = JSON.parse(argsJson);
      } catch (error) {
        console.error(colorize('✗ Invalid JSON arguments', 'red'));
        console.log(colorize('  Ensure arguments are valid JSON: {"key":"value"}', 'yellow'));
        return;
      }
    }

    console.log(colorize(`\nCalling tool: ${toolName}`, 'blue'));
    console.log(colorize('Arguments:', 'dim'), JSON.stringify(toolArgs, null, 2));

    try {
      const result = await this.client!.callTool({
        name: toolName,
        arguments: toolArgs,
      });

      this.displayToolResult(result);
    } catch (error) {
      this.handleError(`Failed to call tool "${toolName}"`, error);
    }
  }

  /**
   * List all SmartThings devices (shortcut command).
   */
  private async listDevices(_args: string[]): Promise<void> {
    if (!this.ensureConnected()) return;

    try {
      const result = await this.client!.callTool({
        name: 'list_devices',
        arguments: {},
      });

      this.displayToolResult(result);

      // Extract device IDs for quick reference
      this.extractDeviceIds(result);

      if (this.lastDevices.length > 0) {
        console.log(colorize('\n💡 Quick reference:', 'dim'));
        console.log(colorize('  Use device IDs with: on <deviceId>, off <deviceId>, status <deviceId>', 'dim'));
      }
    } catch (error) {
      this.handleError('Failed to list devices', error);
    }
  }

  /**
   * Get device status (shortcut command).
   */
  private async getDeviceStatus(args: string[]): Promise<void> {
    if (!this.ensureConnected()) return;

    if (args.length < 1) {
      console.log(colorize('Usage: status <deviceId>', 'yellow'));
      this.showDeviceHint();
      return;
    }

    const deviceId = args[0];

    try {
      const result = await this.client!.callTool({
        name: 'get_device_status',
        arguments: { deviceId },
      });

      this.displayToolResult(result);
    } catch (error) {
      this.handleError('Failed to get device status', error);
    }
  }

  /**
   * Turn device on (shortcut command).
   */
  private async turnDeviceOn(args: string[]): Promise<void> {
    if (!this.ensureConnected()) return;

    if (args.length < 1) {
      console.log(colorize('Usage: on <deviceId>', 'yellow'));
      this.showDeviceHint();
      return;
    }

    const deviceId = args[0];

    try {
      const result = await this.client!.callTool({
        name: 'turn_on_device',
        arguments: { deviceId },
      });

      this.displayToolResult(result);
    } catch (error) {
      this.handleError('Failed to turn device on', error);
    }
  }

  /**
   * Turn device off (shortcut command).
   */
  private async turnDeviceOff(args: string[]): Promise<void> {
    if (!this.ensureConnected()) return;

    if (args.length < 1) {
      console.log(colorize('Usage: off <deviceId>', 'yellow'));
      this.showDeviceHint();
      return;
    }

    const deviceId = args[0];

    try {
      const result = await this.client!.callTool({
        name: 'turn_off_device',
        arguments: { deviceId },
      });

      this.displayToolResult(result);
    } catch (error) {
      this.handleError('Failed to turn device off', error);
    }
  }

  /**
   * Get device capabilities (shortcut command).
   */
  private async getDeviceCapabilities(args: string[]): Promise<void> {
    if (!this.ensureConnected()) return;

    if (args.length < 1) {
      console.log(colorize('Usage: capabilities <deviceId>', 'yellow'));
      this.showDeviceHint();
      return;
    }

    const deviceId = args[0];

    try {
      const result = await this.client!.callTool({
        name: 'get_device_capabilities',
        arguments: { deviceId },
      });

      this.displayToolResult(result);
    } catch (error) {
      this.handleError('Failed to get device capabilities', error);
    }
  }

  /**
   * Show help information.
   */
  private async showHelp(_args: string[]): Promise<void> {
    console.log(colorize('\n╔═══════════════════════════════════════════════════════════╗', 'cyan'));
    console.log(colorize('║  MCP Test Gateway - SmartThings MCP Server Tester         ║', 'cyan'));
    console.log(colorize('╚═══════════════════════════════════════════════════════════╝', 'cyan'));

    console.log(colorize('\nConnection Commands:', 'bright'));
    this.printCommand('connect', 'Connect to the MCP server');
    this.printCommand('disconnect', 'Disconnect from the server');

    console.log(colorize('\nMCP Protocol Commands:', 'bright'));
    this.printCommand('tools', 'List all available tools');
    this.printCommand('call <tool> <args>', 'Call a tool with JSON arguments');

    console.log(colorize('\nSmartThings Shortcuts:', 'bright'));
    this.printCommand('devices', 'List all SmartThings devices');
    this.printCommand('status <deviceId>', 'Get device status');
    this.printCommand('on <deviceId>', 'Turn device on');
    this.printCommand('off <deviceId>', 'Turn device off');
    this.printCommand('capabilities <deviceId>', 'Get device capabilities');

    console.log(colorize('\nUtility Commands:', 'bright'));
    this.printCommand('help', 'Show this help message');
    this.printCommand('clear', 'Clear the screen');
    this.printCommand('exit', 'Exit the gateway');

    console.log(colorize('\nExamples:', 'bright'));
    console.log(colorize('  mcp> connect', 'dim'));
    console.log(colorize('  mcp> devices', 'dim'));
    console.log(colorize('  mcp> on abc-123-device-id', 'dim'));
    console.log(colorize('  mcp> call get_device_status {"deviceId":"abc-123"}', 'dim'));
    console.log('');
  }

  /**
   * Clear the screen.
   */
  private async clearScreen(_args: string[]): Promise<void> {
    console.clear();
  }

  /**
   * Exit the gateway.
   */
  private async exit(_args: string[]): Promise<void> {
    if (this.client) {
      await this.disconnect([]);
    }
    console.log(colorize('\nGoodbye! 👋', 'cyan'));
    this.rl.close();
    process.exit(0);
  }

  /**
   * Display tool execution result.
   */
  private displayToolResult(result: CallToolResult): void {
    console.log(colorize('\n✓ Result:', 'green'));
    console.log(colorize('━'.repeat(50), 'dim'));

    if (result.isError) {
      console.log(colorize('Error:', 'red'), result);
    } else if (result.content && result.content.length > 0) {
      result.content.forEach((content) => {
        if (content.type === 'text') {
          console.log(content.text);
        } else {
          console.log(JSON.stringify(content, null, 2));
        }
      });
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  }

  /**
   * Extract device IDs from list_devices result for quick reference.
   */
  private extractDeviceIds(result: CallToolResult): void {
    try {
      if (result.content && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === 'text') {
          // Parse device IDs from text output
          const matches = content.text.matchAll(/- (.+?) \(([a-f0-9-]+)\)/g);
          this.lastDevices = Array.from(matches).map((match) => ({
            name: match[1],
            deviceId: match[2],
          }));
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  /**
   * Show device ID hint when available.
   */
  private showDeviceHint(): void {
    if (this.lastDevices.length > 0) {
      console.log(colorize('\n💡 Available devices (from last "devices" command):', 'dim'));
      this.lastDevices.slice(0, 5).forEach((device) => {
        console.log(colorize(`  ${device.name}: ${device.deviceId}`, 'dim'));
      });
      if (this.lastDevices.length > 5) {
        console.log(colorize(`  ... and ${this.lastDevices.length - 5} more`, 'dim'));
      }
    } else {
      console.log(colorize('  Use "devices" to list available device IDs', 'dim'));
    }
  }

  /**
   * Print a command with description.
   */
  private printCommand(name: string, description: string): void {
    console.log(`  ${colorize(name.padEnd(25), 'cyan')} ${description}`);
  }

  /**
   * Ensure client is connected.
   */
  private ensureConnected(): boolean {
    if (!this.client) {
      console.log(colorize('✗ Not connected. Use "connect" first.', 'red'));
      return false;
    }
    return true;
  }

  /**
   * Handle and display errors.
   */
  private handleError(message: string, error: unknown): void {
    console.error(colorize(`✗ ${message}:`, 'red'));
    if (error instanceof Error) {
      console.error(colorize(`  ${error.message}`, 'red'));
      if (error.stack) {
        console.error(colorize(error.stack, 'dim'));
      }
    } else {
      console.error(colorize(`  ${String(error)}`, 'red'));
    }
  }

  /**
   * Start the interactive REPL.
   */
  async start(): Promise<void> {
    console.clear();
    console.log(colorize('╔═══════════════════════════════════════════════════════════╗', 'cyan'));
    console.log(colorize('║  MCP Test Gateway for SmartThings                         ║', 'cyan'));
    console.log(colorize('╚═══════════════════════════════════════════════════════════╝', 'cyan'));
    console.log(colorize('\nType "help" for available commands', 'dim'));
    console.log(colorize('Type "connect" to start testing\n', 'dim'));

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const parts = line.trim().split(/\s+/);
      const cmdName = parts[0];
      const args = parts.slice(1);

      if (!cmdName) {
        this.rl.prompt();
        return;
      }

      const command = this.commands.get(cmdName);
      if (command) {
        try {
          await command.handler(args);
        } catch (error) {
          this.handleError('Command execution failed', error);
        }
      } else {
        console.log(colorize(`✗ Unknown command: ${cmdName}`, 'red'));
        console.log(colorize('  Type "help" for available commands', 'yellow'));
      }

      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.exit([]).catch(console.error);
    });
  }
}

// Start the gateway
const gateway = new MCPTestGateway();
gateway.start().catch((error) => {
  console.error(colorize('Fatal error:', 'red'), error);
  process.exit(1);
});
