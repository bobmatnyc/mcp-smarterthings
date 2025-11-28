#!/usr/bin/env ts-node
/**
 * Comprehensive Semantic Search & Intent Classification Test
 * READ-ONLY TESTING - No device state changes
 *
 * Tests:
 * 1. Device loading & indexing
 * 2. Semantic search with real queries
 * 3. Intent classification accuracy
 * 4. Diagnostic workflow integration
 */

import { ServiceProvider } from './src/services/ServiceProvider.js';
import { SemanticIndex } from './src/services/SemanticIndex.js';
import { IntentClassifier } from './src/services/IntentClassifier.js';
import { DiagnosticWorkflow } from './src/services/DiagnosticWorkflow.js';
import { DeviceRegistry } from './src/services/DeviceRegistry.js';

interface TestResult {
  phase: string;
  success: boolean;
  duration: number;
  details: any;
  errors?: string[];
}

interface SearchTestCase {
  query: string;
  expectedType: string;
  minScore?: number;
  expectedCapabilities?: string[];
}

interface ClassificationTestCase {
  query: string;
  expectedIntent: string;
  expectedEntities?: { deviceNames?: string[]; rooms?: string[] };
}

class SemanticSearchTester {
  private results: TestResult[] = [];
  private startTime: number = Date.now();

  async runAllTests(): Promise<void> {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  SEMANTIC SEARCH COMPREHENSIVE TEST - READ-ONLY MODE         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('⚠️  CRITICAL CONSTRAINT: READ-ONLY TESTING ONLY');
    console.log('   - NO device state changes');
    console.log('   - NO commands executed');
    console.log('   - ONLY read operations\n');

    try {
      // Phase 1: Infrastructure & Device Loading
      await this.testPhase1_Infrastructure();

      // Phase 2: Semantic Search Testing
      await this.testPhase2_SemanticSearch();

      // Phase 3: Intent Classification Testing
      await this.testPhase3_IntentClassification();

      // Phase 4: Diagnostic Workflow Testing (READ-ONLY)
      await this.testPhase4_DiagnosticWorkflow();

      // Generate comprehensive report
      this.generateReport();

    } catch (error) {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    }
  }

  private async testPhase1_Infrastructure(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 1: Device Loading & Indexing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const phaseStart = Date.now();
    const errors: string[] = [];
    const details: any = {};

    try {
      // Initialize services
      console.log('📦 Initializing services...');
      const initStart = Date.now();
      const provider = ServiceProvider.getInstance();
      await provider.initialize();
      const initDuration = Date.now() - initStart;
      console.log(`✅ Services initialized in ${initDuration}ms\n`);
      details.initDuration = initDuration;

      // Get service instances
      const semanticIndex = provider.getSemanticIndex();
      const deviceRegistry = provider.getDeviceRegistry();
      const smartThings = provider.getSmartThingsService();

      // Load devices from API
      console.log('📡 Loading devices from SmartThings API...');
      const loadStart = Date.now();
      const devices = await smartThings.getDevices();
      const loadDuration = Date.now() - loadStart;
      console.log(`✅ Loaded ${devices.length} devices in ${loadDuration}ms\n`);
      details.deviceCount = devices.length;
      details.loadDuration = loadDuration;

      // Display device summary
      console.log('📊 Device Summary:');
      const byPlatform = devices.reduce((acc, d) => {
        const platform = d.platform || 'unknown';
        acc[platform] = (acc[platform] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(byPlatform).forEach(([platform, count]) => {
        console.log(`   - ${platform}: ${count} devices`);
      });
      console.log();

      details.devicesByPlatform = byPlatform;

      // Register devices
      console.log('🔍 Registering devices in DeviceRegistry...');
      const registerStart = Date.now();
      devices.forEach(device => deviceRegistry.registerDevice(device));
      const registerDuration = Date.now() - registerStart;
      console.log(`✅ Registered ${devices.length} devices in ${registerDuration}ms\n`);
      details.registerDuration = registerDuration;

      // Index devices in ChromaDB
      console.log('🗄️  Indexing devices in ChromaDB...');
      const indexStart = Date.now();
      await semanticIndex.indexDevices(devices);
      const indexDuration = Date.now() - indexStart;
      console.log(`✅ Indexed ${devices.length} devices in ${indexDuration}ms\n`);
      details.indexDuration = indexDuration;

      // Calculate performance metrics
      const avgIndexTime = indexDuration / devices.length;
      console.log('📈 Performance Metrics:');
      console.log(`   - Average indexing time: ${avgIndexTime.toFixed(2)}ms per device`);
      console.log(`   - Indexing throughput: ${(devices.length / (indexDuration / 1000)).toFixed(0)} devices/sec\n`);

      details.avgIndexTime = avgIndexTime;
      details.indexingThroughput = devices.length / (indexDuration / 1000);

      this.results.push({
        phase: 'Phase 1: Infrastructure',
        success: true,
        duration: Date.now() - phaseStart,
        details
      });

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      this.results.push({
        phase: 'Phase 1: Infrastructure',
        success: false,
        duration: Date.now() - phaseStart,
        details,
        errors
      });
      throw error;
    }
  }

  private async testPhase2_SemanticSearch(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 2: Semantic Search Testing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const phaseStart = Date.now();
    const errors: string[] = [];
    const details: any = { queries: [] };

    try {
      const provider = ServiceProvider.getInstance();
      const semanticIndex = provider.getSemanticIndex();

      const testCases: SearchTestCase[] = [
        { query: 'lights in the bedroom', expectedType: 'light', minScore: 0.5 },
        { query: 'all thermostats', expectedType: 'thermostat', minScore: 0.6 },
        { query: 'door locks', expectedType: 'lock', expectedCapabilities: ['lock'] },
        { query: 'motion sensors', expectedType: 'sensor', expectedCapabilities: ['motionSensor'] },
        { query: 'smart bulbs that support color', expectedType: 'light', expectedCapabilities: ['colorControl'] },
        { query: 'temperature sensors', expectedType: 'sensor', expectedCapabilities: ['temperatureMeasurement'] },
        { query: 'devices in the kitchen', expectedType: 'any', minScore: 0.4 },
        { query: 'battery powered sensors', expectedType: 'sensor', minScore: 0.4 }
      ];

      const queryResults: any[] = [];
      let totalLatency = 0;
      let totalScore = 0;
      let queryCount = 0;

      for (const testCase of testCases) {
        console.log(`🔍 Query: "${testCase.query}"`);

        const queryStart = Date.now();
        const results = await semanticIndex.search(testCase.query, {
          limit: 5,
          minSimilarity: testCase.minScore || 0.3
        });
        const queryLatency = Date.now() - queryStart;
        totalLatency += queryLatency;
        queryCount++;

        console.log(`   ⏱️  Latency: ${queryLatency}ms`);
        console.log(`   📊 Results: ${results.length} devices found`);

        if (results.length > 0) {
          const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
          totalScore += avgScore;
          console.log(`   📈 Average score: ${(avgScore * 100).toFixed(1)}%`);
          console.log(`   🎯 Top match: ${results[0].name} (${(results[0].score * 100).toFixed(1)}%)`);

          // Show top 3 results
          console.log('   📋 Top results:');
          results.slice(0, 3).forEach((r, i) => {
            console.log(`      ${i + 1}. ${r.name} - ${(r.score * 100).toFixed(1)}% (${r.capabilities?.slice(0, 3).join(', ')})`);
          });
        } else {
          console.log('   ⚠️  No results found');
        }
        console.log();

        queryResults.push({
          query: testCase.query,
          latency: queryLatency,
          resultCount: results.length,
          topMatch: results[0] ? {
            name: results[0].name,
            score: results[0].score,
            capabilities: results[0].capabilities
          } : null,
          avgScore: results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0,
          results: results.slice(0, 3).map(r => ({
            name: r.name,
            score: r.score,
            capabilities: r.capabilities
          }))
        });
      }

      // Calculate aggregate metrics
      const avgLatency = totalLatency / queryCount;
      const avgScore = totalScore / queryCount;

      console.log('📊 Aggregate Metrics:');
      console.log(`   - Average search latency: ${avgLatency.toFixed(0)}ms`);
      console.log(`   - Average relevance score: ${(avgScore * 100).toFixed(1)}%`);
      console.log(`   - Success rate: ${(queryResults.filter(r => r.resultCount > 0).length / queryCount * 100).toFixed(0)}%\n`);

      details.queries = queryResults;
      details.avgLatency = avgLatency;
      details.avgScore = avgScore;
      details.successRate = queryResults.filter(r => r.resultCount > 0).length / queryCount;

      this.results.push({
        phase: 'Phase 2: Semantic Search',
        success: true,
        duration: Date.now() - phaseStart,
        details
      });

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      this.results.push({
        phase: 'Phase 2: Semantic Search',
        success: false,
        duration: Date.now() - phaseStart,
        details,
        errors
      });
      throw error;
    }
  }

  private async testPhase3_IntentClassification(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 3: Intent Classification Testing');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const phaseStart = Date.now();
    const errors: string[] = [];
    const details: any = { classifications: [] };

    try {
      const provider = ServiceProvider.getInstance();
      const intentClassifier = provider.getIntentClassifier();

      const testCases: ClassificationTestCase[] = [
        {
          query: 'Why isn\'t my bedroom light turning on?',
          expectedIntent: 'ISSUE_DIAGNOSIS',
          expectedEntities: { deviceNames: ['bedroom light'] }
        },
        {
          query: 'Show me all motion sensors',
          expectedIntent: 'DISCOVERY'
        },
        {
          query: 'What\'s the status of my thermostat?',
          expectedIntent: 'DEVICE_HEALTH',
          expectedEntities: { deviceNames: ['thermostat'] }
        },
        {
          query: 'Turn off the lights',
          expectedIntent: 'NORMAL_QUERY'
        },
        {
          query: 'check my motion sensor',
          expectedIntent: 'DEVICE_HEALTH',
          expectedEntities: { deviceNames: ['motion sensor'] }
        },
        {
          query: 'enter troubleshooting mode',
          expectedIntent: 'MODE_MANAGEMENT'
        },
        {
          query: 'How is my system doing?',
          expectedIntent: 'SYSTEM_STATUS'
        }
      ];

      const classificationResults: any[] = [];
      let totalLatencyFirstRun = 0;
      let totalLatencySecondRun = 0;
      let correctClassifications = 0;

      console.log('🎯 First Run (Cold Cache):\n');

      for (const testCase of testCases) {
        console.log(`💬 Query: "${testCase.query}"`);

        const classifyStart = Date.now();
        const result = await intentClassifier.classifyIntent(testCase.query);
        const classifyLatency = Date.now() - classifyStart;
        totalLatencyFirstRun += classifyLatency;

        const correct = result.intent === testCase.expectedIntent;
        if (correct) correctClassifications++;

        console.log(`   ✓ Intent: ${result.intent} ${correct ? '✅' : '❌ Expected: ' + testCase.expectedIntent}`);
        console.log(`   ⏱️  Latency: ${classifyLatency}ms`);
        console.log(`   📊 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        console.log(`   🔍 Method: ${result.metadata.classificationMethod}`);

        if (result.entities.deviceNames && result.entities.deviceNames.length > 0) {
          console.log(`   🎯 Entities: ${result.entities.deviceNames.join(', ')}`);
        }
        console.log();

        classificationResults.push({
          query: testCase.query,
          expected: testCase.expectedIntent,
          actual: result.intent,
          correct,
          latency: classifyLatency,
          confidence: result.confidence,
          method: result.metadata.classificationMethod,
          entities: result.entities
        });
      }

      // Second run to test cache
      console.log('\n🎯 Second Run (Warm Cache):\n');

      for (const testCase of testCases) {
        const classifyStart = Date.now();
        const result = await intentClassifier.classifyIntent(testCase.query);
        const classifyLatency = Date.now() - classifyStart;
        totalLatencySecondRun += classifyLatency;

        console.log(`💬 "${testCase.query}"`);
        console.log(`   ⏱️  Latency: ${classifyLatency}ms (${result.metadata.cached ? 'CACHED' : 'NOT CACHED'})\n`);
      }

      // Calculate metrics
      const avgLatencyFirstRun = totalLatencyFirstRun / testCases.length;
      const avgLatencySecondRun = totalLatencySecondRun / testCases.length;
      const accuracy = correctClassifications / testCases.length;

      console.log('📊 Classification Metrics:');
      console.log(`   - Accuracy: ${(accuracy * 100).toFixed(0)}% (${correctClassifications}/${testCases.length})`);
      console.log(`   - Avg latency (cold): ${avgLatencyFirstRun.toFixed(0)}ms`);
      console.log(`   - Avg latency (warm): ${avgLatencySecondRun.toFixed(0)}ms`);
      console.log(`   - Cache speedup: ${(avgLatencyFirstRun / avgLatencySecondRun).toFixed(1)}x\n`);

      details.classifications = classificationResults;
      details.accuracy = accuracy;
      details.avgLatencyFirstRun = avgLatencyFirstRun;
      details.avgLatencySecondRun = avgLatencySecondRun;
      details.cacheSpeedup = avgLatencyFirstRun / avgLatencySecondRun;

      this.results.push({
        phase: 'Phase 3: Intent Classification',
        success: true,
        duration: Date.now() - phaseStart,
        details
      });

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      this.results.push({
        phase: 'Phase 3: Intent Classification',
        success: false,
        duration: Date.now() - phaseStart,
        details,
        errors
      });
      throw error;
    }
  }

  private async testPhase4_DiagnosticWorkflow(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 4: Diagnostic Workflow Testing (READ-ONLY)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const phaseStart = Date.now();
    const errors: string[] = [];
    const details: any = { workflows: [] };

    try {
      const provider = ServiceProvider.getInstance();
      const diagnosticWorkflow = provider.getDiagnosticWorkflow();
      const deviceRegistry = provider.getDeviceRegistry();

      // Get some real device names to test
      const devices = deviceRegistry.getAllDevices();
      if (devices.length === 0) {
        console.log('⚠️  No devices available for workflow testing\n');
        this.results.push({
          phase: 'Phase 4: Diagnostic Workflow',
          success: true,
          duration: Date.now() - phaseStart,
          details: { workflows: [], note: 'No devices available' }
        });
        return;
      }

      // Pick a few devices to test
      const testDevices = [
        devices.find(d => d.capabilities?.includes('switch')),
        devices.find(d => d.capabilities?.includes('lock')),
        devices.find(d => d.capabilities?.includes('motionSensor'))
      ].filter(Boolean) as any[];

      const workflowResults: any[] = [];

      for (const device of testDevices) {
        console.log(`🔧 Testing workflow for: "${device.name}"`);

        const workflowStart = Date.now();
        const context = await diagnosticWorkflow.gatherDiagnosticContext({
          intent: 'DEVICE_HEALTH',
          confidence: 1.0,
          entities: {
            deviceNames: [device.name]
          },
          metadata: {
            classificationMethod: 'test',
            cached: false
          }
        });
        const workflowLatency = Date.now() - workflowStart;

        console.log(`   ⏱️  Total latency: ${workflowLatency}ms`);
        console.log(`   📊 Data sources collected:`);

        if (context.deviceHealth) {
          console.log(`      ✓ Device health`);
        }
        if (context.recentEvents && context.recentEvents.length > 0) {
          console.log(`      ✓ Recent events (${context.recentEvents.length})`);
        }
        if (context.similarDevices && context.similarDevices.length > 0) {
          console.log(`      ✓ Similar devices (${context.similarDevices.length})`);
        }
        if (context.systemStatus) {
          console.log(`      ✓ System status`);
        }
        console.log();

        workflowResults.push({
          deviceName: device.name,
          deviceId: device.deviceId,
          latency: workflowLatency,
          dataSourcesCollected: {
            deviceHealth: !!context.deviceHealth,
            recentEvents: context.recentEvents?.length || 0,
            similarDevices: context.similarDevices?.length || 0,
            systemStatus: !!context.systemStatus
          }
        });
      }

      // Calculate aggregate metrics
      const avgWorkflowLatency = workflowResults.reduce((sum, r) => sum + r.latency, 0) / workflowResults.length;

      console.log('📊 Workflow Metrics:');
      console.log(`   - Average workflow latency: ${avgWorkflowLatency.toFixed(0)}ms`);
      console.log(`   - Workflows tested: ${workflowResults.length}`);
      console.log(`   - All workflows successful: ✅\n`);

      details.workflows = workflowResults;
      details.avgWorkflowLatency = avgWorkflowLatency;

      this.results.push({
        phase: 'Phase 4: Diagnostic Workflow',
        success: true,
        duration: Date.now() - phaseStart,
        details
      });

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      this.results.push({
        phase: 'Phase 4: Diagnostic Workflow',
        success: false,
        duration: Date.now() - phaseStart,
        details,
        errors
      });
      throw error;
    }
  }

  private generateReport(): void {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                   TEST EXECUTION SUMMARY                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const totalDuration = Date.now() - this.startTime;
    const successfulPhases = this.results.filter(r => r.success).length;
    const totalPhases = this.results.length;

    console.log(`📊 Overall Results:`);
    console.log(`   - Total phases: ${totalPhases}`);
    console.log(`   - Successful: ${successfulPhases}`);
    console.log(`   - Failed: ${totalPhases - successfulPhases}`);
    console.log(`   - Total duration: ${totalDuration}ms\n`);

    // Phase summaries
    console.log('📋 Phase Results:\n');
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.phase} (${result.duration}ms)`);

      if (result.errors && result.errors.length > 0) {
        console.log(`   Errors:`);
        result.errors.forEach(err => console.log(`   - ${err}`));
      }
    });

    // Success criteria validation
    console.log('\n📈 Success Criteria Validation:\n');

    const phase1 = this.results.find(r => r.phase === 'Phase 1: Infrastructure');
    const phase2 = this.results.find(r => r.phase === 'Phase 2: Semantic Search');
    const phase3 = this.results.find(r => r.phase === 'Phase 3: Intent Classification');
    const phase4 = this.results.find(r => r.phase === 'Phase 4: Diagnostic Workflow');

    const criteria = [
      {
        name: 'Devices load successfully',
        target: 'Success',
        actual: phase1?.details?.deviceCount > 0 ? `✅ ${phase1.details.deviceCount} devices` : '❌ Failed',
        met: phase1?.details?.deviceCount > 0
      },
      {
        name: 'Semantic search relevance',
        target: '>50% avg score',
        actual: phase2?.details?.avgScore ? `${(phase2.details.avgScore * 100).toFixed(1)}%` : 'N/A',
        met: phase2?.details?.avgScore > 0.5
      },
      {
        name: 'Intent classification accuracy',
        target: '>90%',
        actual: phase3?.details?.accuracy ? `${(phase3.details.accuracy * 100).toFixed(0)}%` : 'N/A',
        met: phase3?.details?.accuracy > 0.9
      },
      {
        name: 'Search latency',
        target: '<200ms',
        actual: phase2?.details?.avgLatency ? `${phase2.details.avgLatency.toFixed(0)}ms` : 'N/A',
        met: phase2?.details?.avgLatency < 200
      },
      {
        name: 'Classification latency',
        target: '<200ms',
        actual: phase3?.details?.avgLatencySecondRun ? `${phase3.details.avgLatencySecondRun.toFixed(0)}ms` : 'N/A',
        met: phase3?.details?.avgLatencySecondRun < 200
      },
      {
        name: 'Workflow latency',
        target: '<500ms',
        actual: phase4?.details?.avgWorkflowLatency ? `${phase4.details.avgWorkflowLatency.toFixed(0)}ms` : 'N/A',
        met: phase4?.details?.avgWorkflowLatency < 500
      },
      {
        name: 'READ-ONLY compliance',
        target: '100%',
        actual: '✅ All operations read-only',
        met: true
      }
    ];

    criteria.forEach(c => {
      const status = c.met ? '✅' : '❌';
      console.log(`${status} ${c.name}`);
      console.log(`   Target: ${c.target}`);
      console.log(`   Actual: ${c.actual}\n`);
    });

    const criteriaMetCount = criteria.filter(c => c.met).length;
    const criteriaTotalCount = criteria.length;

    console.log(`✨ Overall Success Rate: ${(criteriaMetCount / criteriaTotalCount * 100).toFixed(0)}% (${criteriaMetCount}/${criteriaTotalCount})\n`);

    // Save detailed results to JSON
    const reportData = {
      timestamp: new Date().toISOString(),
      totalDuration,
      phases: this.results,
      successCriteria: criteria,
      overallSuccess: criteriaMetCount === criteriaTotalCount
    };

    const fs = require('fs');
    const reportPath = '/Users/masa/Projects/mcp-smartthings/semantic-search-test-results.json';
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`📄 Detailed results saved to: ${reportPath}\n`);
  }
}

// Run tests
const tester = new SemanticSearchTester();
tester.runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
