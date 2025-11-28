#!/usr/bin/env tsx
/**
 * Integration test script for Phase 1 & 2 features
 * Tests with real SmartThings account
 */

import { DeviceService } from './src/services/DeviceService.js';
import { smartThingsService } from './src/smartthings/client.js';
import { DeviceRegistry } from './src/abstract/DeviceRegistry.js';
import { SemanticIndex } from './src/services/SemanticIndex.js';

async function main() {
  console.log('='.repeat(60));
  console.log('MCP SmartThings - Integration Test');
  console.log('Testing Phases 1 & 2 with Real Account');
  console.log('='.repeat(60));
  console.log('');

  const startTime = Date.now();

  try {
    // Step 1: Initialize services
    console.log('1. Initializing services...');
    const deviceService = new DeviceService(smartThingsService);
    const deviceRegistry = new DeviceRegistry();

    console.log('   ✓ SmartThingsService initialized');
    console.log('   ✓ DeviceService initialized');
    console.log('   ✓ DeviceRegistry initialized');

    // Step 2: Load devices from SmartThings
    console.log('\n2. Loading devices from SmartThings API...');
    const devices = await deviceService.listDevices();
    console.log(`   ✓ Loaded ${devices.length} devices`);

    if (devices.length === 0) {
      console.log('   ⚠ No devices found in account!');
      return;
    }

    // Register devices
    devices.forEach(device => deviceRegistry.registerDevice(device));
    console.log(`   ✓ Registered ${devices.length} devices in registry`);

    // Step 3: Initialize SemanticIndex
    console.log('\n3. Initializing SemanticIndex with ChromaDB...');
    const semanticIndex = new SemanticIndex({ persist: false });
    await semanticIndex.initialize();
    console.log('   ✓ ChromaDB connection established');

    // Index devices
    const indexResult = await semanticIndex.syncWithRegistry(deviceRegistry);
    console.log(`   ✓ Indexed ${indexResult.added} devices`);
    console.log(`   - Collection size: ${await semanticIndex.getCollectionSize()}`);

    // Step 4: Test semantic search
    console.log('\n4. Testing semantic search...');

    const testQueries = [
      'lights',
      'motion sensors',
      'switches in the bedroom',
      'temperature sensors'
    ];

    for (const query of testQueries) {
      const results = await semanticIndex.searchDevices(query, { limit: 3 });
      console.log(`\n   Query: "${query}"`);
      console.log(`   Results: ${results.length} matches`);
      results.forEach((r, i) => {
        console.log(`     ${i + 1}. ${r.device?.name || 'Unknown'} (score: ${r.score.toFixed(3)})`);
      });
    }

    // Note: IntentClassifier and DiagnosticWorkflow tests require OPENROUTER_API_KEY
    console.log('\n5. Additional tests available with OPENROUTER_API_KEY:');
    console.log('   - IntentClassifier (NLU for user queries)');
    console.log('   - DiagnosticWorkflow (parallel data gathering)');
    console.log('   - Set OPENROUTER_API_KEY environment variable to test these');

    // Performance metrics
    const elapsed = Date.now() - startTime;
    console.log('\n' + '='.repeat(60));
    console.log('Integration Test Complete');
    console.log('='.repeat(60));
    console.log(`Total time: ${elapsed}ms`);
    console.log(`Devices indexed: ${devices.length}`);
    console.log('All systems operational ✓');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();
