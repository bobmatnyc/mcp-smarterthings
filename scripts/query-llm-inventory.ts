#!/usr/bin/env tsx

/**
 * Query LLM for Device Inventory
 * Uses the ChatOrchestrator to ask the LLM for a categorized device inventory
 */

import { config } from 'dotenv';
import { McpClient } from '../src/mcp/client.js';
import { LlmService } from '../src/services/llm.js';
import { ChatOrchestrator } from '../src/services/chat-orchestrator.js';

// Load environment variables
config({ path: '.env.local' });

async function queryDeviceInventory(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const smartThingsPat = process.env.SMARTTHINGS_PAT || process.env.SMARTTHINGS_TOKEN;

  if (!apiKey) {
    console.error('❌ Error: OPENROUTER_API_KEY environment variable is required');
    process.exit(1);
  }

  if (!smartThingsPat) {
    console.error('❌ Error: SMARTTHINGS_PAT environment variable is required');
    process.exit(1);
  }

  console.log('🤖 Initializing LLM controller...\n');

  try {
    // Create MCP client
    const mcpClient = new McpClient();

    // Create LLM service
    const llmService = new LlmService({
      apiKey,
      model: 'anthropic/claude-sonnet-4.5',
    });

    // Create chat orchestrator
    const orchestrator = new ChatOrchestrator(mcpClient, llmService);

    // Initialize orchestrator (spawns MCP server, fetches tools)
    await orchestrator.initialize();

    console.log('✅ LLM controller initialized\n');
    console.log('📡 Asking LLM for device inventory categorized by type...\n');
    console.log('─'.repeat(70));
    console.log();

    // Ask the LLM for device inventory
    const query = 'Please give me an inventory of my SmartThings devices categorized by type, with counts for each type. Format it nicely.';

    const response = await orchestrator.processMessage(query);

    console.log(response);
    console.log();
    console.log('─'.repeat(70));

    // Cleanup
    await orchestrator.close();

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the query
queryDeviceInventory().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
