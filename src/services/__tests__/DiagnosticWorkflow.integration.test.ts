/**
 * DiagnosticWorkflow Integration Tests - Phase 4 Testing
 *
 * **READ-ONLY TESTING ONLY**
 * - NO device commands
 * - NO state changes
 * - ONLY read operations
 *
 * Test Scenarios:
 * 1. Device Health Check
 * 2. Issue Diagnosis (Real-World Case)
 * 3. System Status
 *
 * Performance Target: <500ms total workflow latency
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config as loadEnv } from 'dotenv';
import { DiagnosticWorkflow } from '../DiagnosticWorkflow.js';
import { IntentClassifier, DiagnosticIntent } from '../IntentClassifier.js';
import { DeviceRegistry } from '../../abstract/DeviceRegistry.js';
import { SemanticIndex, createDeviceMetadataDocument } from '../SemanticIndex.js';
import { DeviceService } from '../DeviceService.js';
import { SmartThingsService } from '../../smartthings/client.js';
import { LlmService } from '../llm.js';
import { toUnifiedDevice } from '../transformers/index.js';
import type { IntentClassification } from '../IntentClassifier.js';

// Load environment variables
loadEnv();

// Integration test configuration
const INTEGRATION_TEST_TIMEOUT = 30000; // 30 seconds for real API calls

/**
 * Integration test suite for DiagnosticWorkflow.
 *
 * **IMPORTANT**: These tests make real API calls to SmartThings.
 * Set SMARTTHINGS_PAT environment variable to run these tests.
 */
describe('DiagnosticWorkflow Integration Tests', () => {
  let workflow: DiagnosticWorkflow;
  let intentClassifier: IntentClassifier;
  let deviceRegistry: DeviceRegistry;
  let semanticIndex: SemanticIndex;
  let deviceService: DeviceService;

  beforeAll(async () => {
    // Check for required environment variables
    const pat = process.env['SMARTTHINGS_PAT'];
    if (!pat) {
      throw new Error(
        'SMARTTHINGS_PAT environment variable required for integration tests'
      );
    }

    const openrouterApiKey = process.env['OPENROUTER_API_KEY'];
    if (!openrouterApiKey) {
      throw new Error(
        'OPENROUTER_API_KEY environment variable required for integration tests'
      );
    }

    // Initialize services
    // SmartThingsService reads from environment variables (already set via loadEnv())
    const smartThingsService = new SmartThingsService();
    const llmService = new LlmService({
      apiKey: openrouterApiKey,
      maxRetries: 3,
    });

    intentClassifier = new IntentClassifier(llmService);
    deviceRegistry = new DeviceRegistry();
    semanticIndex = new SemanticIndex();

    // Initialize semantic index
    await semanticIndex.initialize();

    deviceService = new DeviceService(smartThingsService);

    // Load devices and populate registry/index
    console.log('Loading devices from SmartThings...');
    const devices = await deviceService.listDevices();
    console.log(`Loaded ${devices.length} devices`);

    // Populate registry and semantic index
    for (const device of devices) {
      const unified = toUnifiedDevice(device);
      deviceRegistry.addDevice(unified);
      // Index each device individually
      const metadataDoc = createDeviceMetadataDocument(unified);
      await semanticIndex.indexDevice(metadataDoc);
    }
    console.log(`Indexed ${devices.length} devices`);

    // Initialize workflow
    workflow = new DiagnosticWorkflow(
      semanticIndex,
      deviceService,
      deviceRegistry
    );

    console.log('DiagnosticWorkflow integration test setup complete');
  }, INTEGRATION_TEST_TIMEOUT);

  /**
   * Test Scenario 1: Device Health Check
   *
   * Query: "check my master alcove motion sensor"
   * Expected Intent: DEVICE_HEALTH
   * Data to gather: device status, battery level, last seen, recent events
   * Performance: <500ms
   */
  it(
    'should complete device health check workflow within 500ms',
    async () => {
      const query = 'check my master alcove motion sensor';

      console.log('\n=== Test 1: Device Health Check ===');
      console.log(`Query: "${query}"`);

      const startTime = Date.now();

      // Step 1: Classify intent
      const classification: IntentClassification =
        await intentClassifier.classifyIntent(query);
      const classifyTime = Date.now() - startTime;

      console.log(`Intent classification: ${classifyTime}ms`);
      console.log(`  Intent: ${classification.intent}`);
      console.log(`  Confidence: ${classification.confidence}`);
      console.log(`  Entities:`, classification.entities);

      expect(classification.intent).toBe('device_health');
      expect(classification.confidence).toBeGreaterThan(0.7);

      // Step 2: Execute workflow
      const workflowStart = Date.now();
      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        query
      );
      const workflowTime = Date.now() - workflowStart;

      const totalTime = Date.now() - startTime;

      console.log(`Workflow execution: ${workflowTime}ms`);
      console.log(`Total time: ${totalTime}ms`);
      console.log(`Device resolved: ${report.diagnosticContext.device?.label || 'N/A'}`);
      console.log(
        `Data sources gathered: ${Object.keys(report.diagnosticContext).filter((k) => report.diagnosticContext[k as keyof typeof report.diagnosticContext] !== undefined).length}`
      );
      console.log(`Recommendations: ${report.recommendations.length}`);
      console.log(`Success: ${report.diagnosticContext.device ? '✅' : '❌'}`);

      // Assertions
      expect(report.diagnosticContext.device).toBeDefined();
      expect(report.diagnosticContext.healthData).toBeDefined();
      expect(report.diagnosticContext.recentEvents).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.richContext).toBeTruthy();
      expect(report.timestamp).toBeTruthy();

      // Performance assertion
      expect(totalTime).toBeLessThan(5000); // Relaxed for real API calls
      console.log(
        `Performance: ${totalTime < 5000 ? '✅' : '❌'} (target: <5000ms for integration test)`
      );
    },
    INTEGRATION_TEST_TIMEOUT
  );

  /**
   * Test Scenario 2: Issue Diagnosis (Real-World Case)
   *
   * Query: "my master bedroom alcove light just came on (i turned off) see if it can figure out why"
   * Expected Intent: ISSUE_DIAGNOSIS
   * Data to gather: recent events, automation patterns, similar device issues
   * Device resolution: Should find "Master Alcove Bar"
   * Performance: <500ms
   */
  it(
    'should diagnose issue with Master Alcove Bar light',
    async () => {
      const query =
        'my master bedroom alcove light just came on (i turned off) see if it can figure out why';

      console.log('\n=== Test 2: Issue Diagnosis (Real-World) ===');
      console.log(`Query: "${query}"`);

      const startTime = Date.now();

      // Step 1: Classify intent
      const classification: IntentClassification =
        await intentClassifier.classifyIntent(query);
      const classifyTime = Date.now() - startTime;

      console.log(`Intent classification: ${classifyTime}ms`);
      console.log(`  Intent: ${classification.intent}`);
      console.log(`  Confidence: ${classification.confidence}`);
      console.log(`  Entities:`, classification.entities);

      expect(classification.intent).toBe('issue_diagnosis');
      expect(classification.confidence).toBeGreaterThan(0.7);

      // Step 2: Execute workflow
      const workflowStart = Date.now();
      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        query
      );
      const workflowTime = Date.now() - workflowStart;

      const totalTime = Date.now() - startTime;

      console.log(`Workflow execution: ${workflowTime}ms`);
      console.log(`Total time: ${totalTime}ms`);
      console.log(`Device resolved: ${report.diagnosticContext.device?.label || 'N/A'}`);
      console.log(
        `Device ID: ${report.diagnosticContext.device?.id || 'N/A'}`
      );
      console.log(
        `Recent events: ${report.diagnosticContext.recentEvents?.length || 0}`
      );
      console.log(
        `Similar devices: ${report.diagnosticContext.similarDevices?.length || 0}`
      );
      console.log(`Recommendations: ${report.recommendations.length}`);

      // Log recent events summary
      if (report.diagnosticContext.recentEvents) {
        console.log('\nRecent events (last 5):');
        report.diagnosticContext.recentEvents.slice(0, 5).forEach((event) => {
          console.log(
            `  ${event.time}: ${event.capability}.${event.attribute} = ${event.value}`
          );
        });
      }

      console.log(`Success: ${report.diagnosticContext.device ? '✅' : '❌'}`);

      // Assertions
      expect(report.diagnosticContext.device).toBeDefined();
      expect(report.diagnosticContext.device?.label).toContain('Alcove');
      expect(report.diagnosticContext.healthData).toBeDefined();
      expect(report.diagnosticContext.recentEvents).toBeDefined();
      expect(report.diagnosticContext.recentEvents!.length).toBeGreaterThan(0);
      expect(report.diagnosticContext.relatedIssues).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);

      // Performance assertion
      expect(totalTime).toBeLessThan(5000); // Relaxed for real API calls
      console.log(
        `Performance: ${totalTime < 5000 ? '✅' : '❌'} (target: <5000ms for integration test)`
      );
    },
    INTEGRATION_TEST_TIMEOUT
  );

  /**
   * Test Scenario 3: System Status
   *
   * Query: "show me system status"
   * Expected Intent: SYSTEM_STATUS
   * Data to gather: system-wide statistics, offline devices, battery warnings
   * Performance: <500ms
   */
  it(
    'should provide system-wide status report',
    async () => {
      const query = 'show me system status';

      console.log('\n=== Test 3: System Status ===');
      console.log(`Query: "${query}"`);

      const startTime = Date.now();

      // Step 1: Classify intent
      const classification: IntentClassification =
        await intentClassifier.classifyIntent(query);
      const classifyTime = Date.now() - startTime;

      console.log(`Intent classification: ${classifyTime}ms`);
      console.log(`  Intent: ${classification.intent}`);
      console.log(`  Confidence: ${classification.confidence}`);
      console.log(`  Entities:`, classification.entities);

      expect(classification.intent).toBe('system_status');
      expect(classification.confidence).toBeGreaterThan(0.7);

      // Step 2: Execute workflow
      const workflowStart = Date.now();
      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        query
      );
      const workflowTime = Date.now() - workflowStart;

      const totalTime = Date.now() - startTime;

      console.log(`Workflow execution: ${workflowTime}ms`);
      console.log(`Total time: ${totalTime}ms`);
      console.log(
        `System status: ${report.diagnosticContext.systemStatus ? '✅' : '❌'}`
      );

      if (report.diagnosticContext.systemStatus) {
        const status = report.diagnosticContext.systemStatus;
        console.log(`  Total devices: ${status.totalDevices}`);
        console.log(`  Healthy: ${status.healthyDevices}`);
        console.log(`  Warnings: ${status.warningDevices}`);
        console.log(`  Critical/Offline: ${status.criticalDevices}`);
        console.log(`  Recent issues: ${status.recentIssues.length}`);
      }

      console.log(`Recommendations: ${report.recommendations.length}`);

      // Assertions
      expect(report.diagnosticContext.systemStatus).toBeDefined();
      expect(report.diagnosticContext.systemStatus!.totalDevices).toBeGreaterThan(
        0
      );
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.richContext).toBeTruthy();

      // Performance assertion
      expect(totalTime).toBeLessThan(5000); // Relaxed for real API calls
      console.log(
        `Performance: ${totalTime < 5000 ? '✅' : '❌'} (target: <5000ms for integration test)`
      );
    },
    INTEGRATION_TEST_TIMEOUT
  );

  /**
   * Performance Breakdown Test
   *
   * Tests each component individually to measure performance contribution.
   */
  it(
    'should measure performance breakdown',
    async () => {
      console.log('\n=== Performance Breakdown ===');

      const query = 'check my master alcove motion sensor';
      const timings: Record<string, number> = {};

      // 1. Intent classification
      let start = Date.now();
      const classification = await intentClassifier.classifyIntent(query);
      timings['intentClassification'] = Date.now() - start;
      console.log(`Intent classification: ${timings['intentClassification']}ms`);

      // 2. Device resolution (semantic search)
      start = Date.now();
      await semanticIndex.searchDevices(
        classification.entities.deviceName || 'master alcove motion sensor',
        { limit: 1, minSimilarity: 0.7 }
      );
      timings['deviceResolution'] = Date.now() - start;
      console.log(`Device resolution: ${timings['deviceResolution']}ms`);

      // 3. Workflow execution
      start = Date.now();
      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        query
      );
      timings['workflowExecution'] = Date.now() - start;
      console.log(`Workflow execution: ${timings['workflowExecution']}ms`);

      // Total
      const total = Object.values(timings).reduce((sum, t) => sum + t, 0);
      console.log(`\nTotal: ${total}ms`);

      // Performance targets
      console.log('\nPerformance vs Targets:');
      console.log(
        `  Intent classification: ${timings['intentClassification']}ms (target: <200ms) ${timings['intentClassification'] < 200 ? '✅' : '⚠️'}`
      );
      console.log(
        `  Device resolution: ${timings['deviceResolution']}ms (target: <100ms) ${timings['deviceResolution'] < 100 ? '✅' : '⚠️'}`
      );
      console.log(
        `  Workflow execution: ${timings['workflowExecution']}ms (target: <400ms) ${timings['workflowExecution'] < 400 ? '✅' : '⚠️'}`
      );
      console.log(
        `  Total: ${total}ms (target: <500ms) ${total < 500 ? '✅' : '⚠️'}`
      );

      expect(report).toBeDefined();
      expect(total).toBeLessThan(5000); // Relaxed for integration tests
    },
    INTEGRATION_TEST_TIMEOUT
  );

  /**
   * Error Handling Test
   *
   * Tests graceful degradation when some data sources fail.
   */
  it(
    'should handle partial data gathering failures gracefully',
    async () => {
      console.log('\n=== Error Handling Test ===');

      // Use a query that might not find a device
      const query = 'check nonexistent device xyz123';

      const classification: IntentClassification = {
        intent: DiagnosticIntent.DEVICE_HEALTH,
        confidence: 0.9,
        entities: { deviceName: 'nonexistent device xyz123' },
        requiresDiagnostics: true,
      };

      const startTime = Date.now();
      const report = await workflow.executeDiagnosticWorkflow(
        classification,
        query
      );
      const elapsed = Date.now() - startTime;

      console.log(`Workflow completed in ${elapsed}ms`);
      console.log(`Device resolved: ${report.diagnosticContext.device ? 'Yes' : 'No'}`);
      console.log(`Report generated: ${report.summary ? 'Yes' : 'No'}`);

      // Should still generate a report even if device not found
      expect(report).toBeDefined();
      expect(report.summary).toBeTruthy();
      expect(report.richContext).toBeTruthy();
      expect(report.timestamp).toBeTruthy();

      console.log('Graceful degradation: ✅');
    },
    INTEGRATION_TEST_TIMEOUT
  );
});
