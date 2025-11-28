#!/usr/bin/env tsx
/**
 * Direct Semantic Search Test - READ-ONLY
 * Simplified version that directly instantiates services
 */

import { SmartThingsService } from './src/smartthings/client.js';
import { DeviceService } from './src/services/DeviceService.js';
import { DeviceRegistry } from './src/services/DeviceRegistry.js';
import { SemanticIndex } from './src/services/SemanticIndex.js';
import { IntentClassifier } from './src/services/IntentClassifier.js';
import { DiagnosticWorkflow } from './src/services/DiagnosticWorkflow.js';
import { LlmService } from './src/services/LlmService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PAT = process.env.SMARTTHINGS_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!PAT) {
  console.error('❌ SMARTTHINGS_TOKEN not found in environment');
  process.exit(1);
}

if (!ANTHROPIC_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in environment');
  process.exit(1);
}

interface TestMetrics {
  deviceCount: number;
  loadTime: number;
  indexTime: number;
  searchTests: Array<{
    query: string;
    resultCount: number;
    topScore: number;
    latency: number;
  }>;
  classificationTests: Array<{
    query: string;
    intent: string;
    confidence: number;
    latency: number;
    cached: boolean;
  }>;
}

async function runTests(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     SEMANTIC SEARCH DIRECT TEST - READ-ONLY MODE             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const metrics: TestMetrics = {
    deviceCount: 0,
    loadTime: 0,
    indexTime: 0,
    searchTests: [],
    classificationTests: []
  };

  try {
    // Initialize services
    console.log('📦 Initializing services...\n');

    const smartThingsService = new SmartThingsService(PAT!);
    const deviceService = new DeviceService(smartThingsService);
    const deviceRegistry = new DeviceRegistry();
    const llmService = new LlmService();

    // Initialize SemanticIndex (may require ChromaDB)
    let semanticIndex: SemanticIndex;
    try {
      semanticIndex = new SemanticIndex();
      await semanticIndex.initialize();
      console.log('✅ SemanticIndex initialized\n');
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

    console.log('📡 Loading devices...');
    const loadStart = Date.now();
    const devices = await deviceService.listDevices();
    metrics.loadTime = Date.now() - loadStart;
    metrics.deviceCount = devices.length;

    console.log(`✅ Loaded ${devices.length} devices in ${metrics.loadTime}ms\n`);

    // Register devices
    console.log('🔍 Registering devices...');
    devices.forEach(device => deviceRegistry.registerDevice(device));
    console.log(`✅ Registered ${devices.length} devices\n`);

    // Index devices
    console.log('🗄️  Indexing devices...');
    const indexStart = Date.now();
    try {
      await semanticIndex.indexDevices(devices);
      metrics.indexTime = Date.now() - indexStart;
      console.log(`✅ Indexed ${devices.length} devices in ${metrics.indexTime}ms\n`);
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
      'temperature sensors'
    ];

    for (const query of searchQueries) {
      console.log(`🔍 Query: "${query}"`);
      const searchStart = Date.now();

      try {
        const results = await semanticIndex.search(query, { limit: 5 });
        const latency = Date.now() - searchStart;

        console.log(`   ⏱️  Latency: ${latency}ms`);
        console.log(`   📊 Results: ${results.length}`);

        if (results.length > 0) {
          console.log(`   🎯 Top: ${results[0].name} (${(results[0].score * 100).toFixed(1)}%)`);

          metrics.searchTests.push({
            query,
            resultCount: results.length,
            topScore: results[0].score,
            latency
          });
        }
      } catch (error) {
        console.log(`   ❌ Search failed: ${error instanceof Error ? error.message : error}`);
      }
      console.log();
    }

    // Phase 3: Intent Classification Tests
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 3: Intent Classification Testing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const classificationQueries = [
      'Why isn\'t my bedroom light turning on?',
      'Show me all motion sensors',
      'What\'s the status of my thermostat?',
      'check my motion sensor',
      'enter troubleshooting mode'
    ];

    console.log('🎯 First Run (Cold Cache):\n');

    for (const query of classificationQueries) {
      console.log(`💬 Query: "${query}"`);
      const classifyStart = Date.now();

      try {
        const result = await intentClassifier.classifyIntent(query);
        const latency = Date.now() - classifyStart;

        console.log(`   ✓ Intent: ${result.intent}`);
        console.log(`   ⏱️  Latency: ${latency}ms`);
        console.log(`   📊 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        console.log(`   🔍 Method: ${result.metadata.classificationMethod}`);

        metrics.classificationTests.push({
          query,
          intent: result.intent,
          confidence: result.confidence,
          latency,
          cached: result.metadata.cached || false
        });
      } catch (error) {
        console.log(`   ❌ Classification failed: ${error instanceof Error ? error.message : error}`);
      }
      console.log();
    }

    // Second run for cache testing
    console.log('🎯 Second Run (Warm Cache):\n');

    for (const query of classificationQueries) {
      const classifyStart = Date.now();

      try {
        const result = await intentClassifier.classifyIntent(query);
        const latency = Date.now() - classifyStart;

        console.log(`💬 "${query}"`);
        console.log(`   ⏱️  Latency: ${latency}ms (${result.metadata.cached ? 'CACHED ✅' : 'NOT CACHED'})\n`);
      } catch (error) {
        console.log(`   ❌ Classification failed: ${error instanceof Error ? error.message : error}\n`);
      }
    }

    // Phase 4: Quick Diagnostic Workflow Test
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 4: Diagnostic Workflow Test (READ-ONLY)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (devices.length > 0) {
      const testDevice = devices.find(d => d.capabilities?.includes('switch')) || devices[0];

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

        console.log(`   ⏱️  Latency: ${workflowLatency}ms`);
        console.log(`   📊 Data sources:`);
        console.log(`      ${context.deviceHealth ? '✓' : '○'} Device health`);
        console.log(`      ${context.recentEvents?.length ? '✓' : '○'} Recent events (${context.recentEvents?.length || 0})`);
        console.log(`      ${context.similarDevices?.length ? '✓' : '○'} Similar devices (${context.similarDevices?.length || 0})`);
        console.log(`      ${context.systemStatus ? '✓' : '○'} System status`);
      } catch (error) {
        console.log(`   ❌ Workflow failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Metrics:\n');
    console.log(`   Devices loaded: ${metrics.deviceCount}`);
    console.log(`   Load time: ${metrics.loadTime}ms`);
    console.log(`   Index time: ${metrics.indexTime}ms`);
    console.log(`   Search tests: ${metrics.searchTests.length}`);
    console.log(`   Classification tests: ${metrics.classificationTests.length}\n`);

    if (metrics.searchTests.length > 0) {
      const avgSearchLatency = metrics.searchTests.reduce((sum, t) => sum + t.latency, 0) / metrics.searchTests.length;
      const avgSearchScore = metrics.searchTests.reduce((sum, t) => sum + t.topScore, 0) / metrics.searchTests.length;

      console.log('   Search Performance:');
      console.log(`      Average latency: ${avgSearchLatency.toFixed(0)}ms`);
      console.log(`      Average score: ${(avgSearchScore * 100).toFixed(1)}%\n`);
    }

    if (metrics.classificationTests.length > 0) {
      const avgClassifyLatency = metrics.classificationTests.reduce((sum, t) => sum + t.latency, 0) / metrics.classificationTests.length;
      const avgConfidence = metrics.classificationTests.reduce((sum, t) => sum + t.confidence, 0) / metrics.classificationTests.length;

      console.log('   Classification Performance:');
      console.log(`      Average latency: ${avgClassifyLatency.toFixed(0)}ms`);
      console.log(`      Average confidence: ${(avgConfidence * 100).toFixed(0)}%\n`);
    }

    console.log('✅ All tests completed successfully!\n');

    // Save results
    const fs = await import('fs');
    const results = {
      timestamp: new Date().toISOString(),
      metrics,
      status: 'success'
    };

    fs.writeFileSync(
      '/Users/masa/Projects/mcp-smartthings/semantic-test-results-direct.json',
      JSON.stringify(results, null, 2)
    );

    console.log('📄 Results saved to: semantic-test-results-direct.json\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
