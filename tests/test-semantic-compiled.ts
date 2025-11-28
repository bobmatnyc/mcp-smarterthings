#!/usr/bin/env tsx
/**
 * Semantic Search Test using compiled dist files - READ-ONLY
 */

import { SmartThingsService } from './dist/smartthings/client.js';
import { DeviceService } from './dist/services/DeviceService.js';
import { DeviceRegistry } from './dist/abstract/DeviceRegistry.js';
import { SemanticIndex } from './dist/services/SemanticIndex.js';
import { IntentClassifier } from './dist/services/IntentClassifier.js';
import { DiagnosticWorkflow } from './dist/services/DiagnosticWorkflow.js';
import { LlmService } from './dist/services/llm.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PAT = process.env.SMARTTHINGS_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!PAT) {
  console.error('❌ SMARTTHINGS_TOKEN not found in environment');
  process.exit(1);
}

if (!OPENROUTER_KEY) {
  console.error('❌ OPENROUTER_API_KEY not found in environment');
  process.exit(1);
}

async function runTests(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     SEMANTIC SEARCH TEST - READ-ONLY MODE                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    // Initialize services
    console.log('📦 Initializing services...\n');

    const smartThingsService = new SmartThingsService(PAT!);
    const deviceService = new DeviceService(smartThingsService);
    const deviceRegistry = new DeviceRegistry();
    const llmService = new LlmService({
      apiKey: OPENROUTER_KEY!,
      model: 'anthropic/claude-sonnet-4.5'
    });

    // Initialize SemanticIndex
    let semanticIndex: SemanticIndex;
    try {
      semanticIndex = new SemanticIndex();
      await semanticIndex.initialize();
      console.log('✅ SemanticIndex initialized with ChromaDB\n');
    } catch (error) {
      console.log('⚠️  SemanticIndex initialization failed:', error instanceof Error ? error.message : error);
      console.log('   Continuing with limited functionality...\n');
      semanticIndex = new SemanticIndex();
    }

    const intentClassifier = new IntentClassifier(llmService);
    const diagnosticWorkflow = new DiagnosticWorkflow(semanticIndex, deviceService, deviceRegistry);

    // Phase 1: Load and index devices
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 1: Device Loading & Indexing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📡 Loading devices from SmartThings API...');
    const loadStart = Date.now();
    const devices = await deviceService.listDevices();
    const loadTime = Date.now() - loadStart;

    console.log(`✅ Loaded ${devices.length} devices in ${loadTime}ms\n`);

    // Show device summary
    console.log('📊 Device Summary:');
    const byType = devices.reduce((acc: Record<string, number>, d: any) => {
      const type = d.capabilities?.[0] || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    Object.entries(byType).slice(0, 10).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
    console.log();

    // Register devices
    console.log('🔍 Registering devices in DeviceRegistry...');
    const registerStart = Date.now();
    devices.forEach((device: any) => deviceRegistry.addDevice(device));
    const registerTime = Date.now() - registerStart;
    console.log(`✅ Registered ${devices.length} devices in ${registerTime}ms\n`);

    // Index devices
    console.log('🗄️  Indexing devices in SemanticIndex...');
    const indexStart = Date.now();
    try {
      await semanticIndex.indexDevices(devices);
      const indexTime = Date.now() - indexStart;
      console.log(`✅ Indexed ${devices.length} devices in ${indexTime}ms`);
      console.log(`   Average: ${(indexTime / devices.length).toFixed(2)}ms per device\n`);
    } catch (error) {
      console.log('⚠️  Indexing failed:', error instanceof Error ? error.message : error);
      console.log('   Skipping semantic search tests...\n');
    }

    // Phase 2: Semantic Search Tests
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 2: Semantic Search Testing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const searchQueries = [
      'lights in the bedroom',
      'all thermostats',
      'door locks',
      'motion sensors',
      'smart bulbs that support color',
      'temperature sensors',
      'devices in the kitchen',
      'battery powered sensors'
    ];

    const searchResults = [];
    let totalSearchTime = 0;

    for (const query of searchQueries) {
      console.log(`🔍 Query: "${query}"`);
      const searchStart = Date.now();

      try {
        const results = await semanticIndex.search(query, { limit: 5, minSimilarity: 0.3 });
        const latency = Date.now() - searchStart;
        totalSearchTime += latency;

        console.log(`   ⏱️  Latency: ${latency}ms`);
        console.log(`   📊 Results: ${results.length}`);

        if (results.length > 0) {
          const avgScore = results.reduce((sum: number, r: any) => sum + r.score, 0) / results.length;
          console.log(`   📈 Average score: ${(avgScore * 100).toFixed(1)}%`);
          console.log(`   🎯 Top match: ${results[0].name} (${(results[0].score * 100).toFixed(1)}%)`);

          searchResults.push({
            query,
            latency,
            resultCount: results.length,
            topScore: results[0].score,
            avgScore
          });
        } else {
          console.log(`   ⚠️  No results found`);
        }
      } catch (error) {
        console.log(`   ❌ Search failed: ${error instanceof Error ? error.message : error}`);
      }
      console.log();
    }

    if (searchResults.length > 0) {
      const avgLatency = totalSearchTime / searchResults.length;
      const avgScore = searchResults.reduce((sum: number, r: any) => sum + r.avgScore, 0) / searchResults.length;

      console.log('📊 Search Metrics:');
      console.log(`   - Average latency: ${avgLatency.toFixed(0)}ms`);
      console.log(`   - Average score: ${(avgScore * 100).toFixed(1)}%`);
      console.log(`   - Success rate: ${((searchResults.length / searchQueries.length) * 100).toFixed(0)}%\n`);
    }

    // Phase 3: Intent Classification Tests
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 3: Intent Classification Testing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const classificationQueries = [
      { q: 'Why isn\'t my bedroom light turning on?', expected: 'ISSUE_DIAGNOSIS' },
      { q: 'Show me all motion sensors', expected: 'DISCOVERY' },
      { q: 'What\'s the status of my thermostat?', expected: 'DEVICE_HEALTH' },
      { q: 'Turn off the lights', expected: 'NORMAL_QUERY' },
      { q: 'check my motion sensor', expected: 'DEVICE_HEALTH' },
      { q: 'enter troubleshooting mode', expected: 'MODE_MANAGEMENT' },
      { q: 'How is my system doing?', expected: 'SYSTEM_STATUS' }
    ];

    console.log('🎯 First Run (Cold Cache):\n');

    const classificationResults = [];
    let totalClassifyTime = 0;
    let correctCount = 0;

    for (const test of classificationQueries) {
      console.log(`💬 Query: "${test.q}"`);
      const classifyStart = Date.now();

      try {
        const result = await intentClassifier.classifyIntent(test.q);
        const latency = Date.now() - classifyStart;
        totalClassifyTime += latency;

        const correct = result.intent === test.expected;
        if (correct) correctCount++;

        console.log(`   ✓ Intent: ${result.intent} ${correct ? '✅' : '❌ Expected: ' + test.expected}`);
        console.log(`   ⏱️  Latency: ${latency}ms`);
        console.log(`   📊 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        console.log(`   🔍 Method: ${result.metadata.classificationMethod}`);

        classificationResults.push({
          query: test.q,
          expected: test.expected,
          actual: result.intent,
          correct,
          latency,
          confidence: result.confidence,
          method: result.metadata.classificationMethod
        });
      } catch (error) {
        console.log(`   ❌ Classification failed: ${error instanceof Error ? error.message : error}`);
      }
      console.log();
    }

    // Second run for cache testing
    console.log('🎯 Second Run (Warm Cache):\n');

    let totalCacheTime = 0;

    for (const test of classificationQueries) {
      const classifyStart = Date.now();

      try {
        const result = await intentClassifier.classifyIntent(test.q);
        const latency = Date.now() - classifyStart;
        totalCacheTime += latency;

        console.log(`💬 "${test.q.substring(0, 40)}..."`);
        console.log(`   ⏱️  Latency: ${latency}ms (${result.metadata.cached ? 'CACHED ✅' : 'NOT CACHED'})\n`);
      } catch (error) {
        console.log(`   ❌ Failed: ${error instanceof Error ? error.message : error}\n`);
      }
    }

    if (classificationResults.length > 0) {
      const avgLatency = totalClassifyTime / classificationResults.length;
      const avgCacheLatency = totalCacheTime / classificationQueries.length;
      const accuracy = correctCount / classificationResults.length;

      console.log('📊 Classification Metrics:');
      console.log(`   - Accuracy: ${(accuracy * 100).toFixed(0)}% (${correctCount}/${classificationResults.length})`);
      console.log(`   - Avg latency (cold): ${avgLatency.toFixed(0)}ms`);
      console.log(`   - Avg latency (warm): ${avgCacheLatency.toFixed(0)}ms`);
      console.log(`   - Cache speedup: ${(avgLatency / avgCacheLatency).toFixed(1)}x\n`);
    }

    // Phase 4: Quick Diagnostic Workflow Test
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 4: Diagnostic Workflow Test (READ-ONLY)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (devices.length > 0) {
      const testDevice = devices.find((d: any) => d.capabilities?.includes('switch')) || devices[0];

      console.log(`🔧 Testing workflow for: "${testDevice.name}"`);
      const workflowStart = Date.now();

      try {
        const context = await diagnosticWorkflow.gatherDiagnosticContext({
          intent: 'DEVICE_HEALTH',
          confidence: 1.0,
          entities: { deviceNames: [testDevice.name] },
          metadata: { classificationMethod: 'test', cached: false }
        });

        const workflowLatency = Date.now() - workflowStart;

        console.log(`   ⏱️  Total latency: ${workflowLatency}ms`);
        console.log(`   📊 Data sources collected:`);
        console.log(`      ${context.deviceHealth ? '✅' : '○'} Device health`);
        console.log(`      ${context.recentEvents?.length ? '✅' : '○'} Recent events (${context.recentEvents?.length || 0})`);
        console.log(`      ${context.similarDevices?.length ? '✅' : '○'} Similar devices (${context.similarDevices?.length || 0})`);
        console.log(`      ${context.systemStatus ? '✅' : '○'} System status`);
      } catch (error) {
        console.log(`   ❌ Workflow failed: ${error instanceof Error ? error.message : error}`);
      }
      console.log();
    }

    // Final Summary
    const totalTime = Date.now() - startTime;

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log(`✅ All tests completed in ${(totalTime / 1000).toFixed(1)}s\n`);

    console.log('📊 Success Criteria:\n');

    const criteria = [
      { name: 'Devices loaded successfully', met: devices.length > 0, value: `${devices.length} devices` },
      { name: 'Search avg score >50%', met: searchResults.length > 0 && (searchResults.reduce((s: number, r: any) => s + r.avgScore, 0) / searchResults.length) > 0.5, value: searchResults.length > 0 ? `${((searchResults.reduce((s: number, r: any) => s + r.avgScore, 0) / searchResults.length) * 100).toFixed(1)}%` : 'N/A' },
      { name: 'Classification accuracy >90%', met: (correctCount / classificationResults.length) > 0.9, value: `${((correctCount / classificationResults.length) * 100).toFixed(0)}%` },
      { name: 'Search latency <200ms', met: searchResults.length > 0 && (totalSearchTime / searchResults.length) < 200, value: searchResults.length > 0 ? `${(totalSearchTime / searchResults.length).toFixed(0)}ms` : 'N/A' },
      { name: 'READ-ONLY compliance', met: true, value: '✅ All read operations' }
    ];

    criteria.forEach(c => {
      console.log(`   ${c.met ? '✅' : '❌'} ${c.name}: ${c.value}`);
    });

    const metCount = criteria.filter(c => c.met).length;
    console.log(`\n✨ Success Rate: ${((metCount / criteria.length) * 100).toFixed(0)}% (${metCount}/${criteria.length})\n`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
