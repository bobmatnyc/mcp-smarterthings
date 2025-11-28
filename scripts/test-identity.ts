#!/usr/bin/env tsx

/**
 * Test SmarterThings Identity
 * Ask the LLM who it is to verify branding
 */

import { config } from 'dotenv';
import { McpClient } from '../src/mcp/client.js';
import { LlmService } from '../src/services/llm.js';
import { ChatOrchestrator } from '../src/services/chat-orchestrator.js';

// Load environment variables
config({ path: '.env.local' });

async function testIdentity(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const smartThingsPat = process.env.SMARTTHINGS_PAT || process.env.SMARTTHINGS_TOKEN;

  if (!apiKey || !smartThingsPat) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  console.log('🤖 Testing SmarterThings Identity...\n');

  try {
    const mcpClient = new McpClient();
    const llmService = new LlmService({ apiKey, model: 'anthropic/claude-sonnet-4.5' });
    const orchestrator = new ChatOrchestrator(mcpClient, llmService);

    await orchestrator.initialize();

    // Ask the LLM who it is
    const questions = [
      "Who are you?",
      "What's your name?",
      "What do you do?"
    ];

    for (const question of questions) {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`❓ ${question}`);
      console.log('─'.repeat(70));

      const response = await orchestrator.processMessage(question);
      console.log(`\n💬 ${response}\n`);
    }

    await orchestrator.close();

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testIdentity().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
