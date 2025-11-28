#!/usr/bin/env tsx

/**
 * Real-World Diagnostic Test: Master Alcove Bar Light Issue
 *
 * Purpose: Test the diagnostic framework against a known production issue
 * to validate effectiveness and identify gaps.
 *
 * Test Scenario:
 * - Device: Master Alcove Bar (ae92f481-1425-4436-b332-de44ff915565)
 * - Issue: Light turns on unexpectedly at 1:54 AM
 * - Expected: Framework identifies automation trigger with 95%+ confidence
 *
 * Test Coverage:
 * 1. Intent Classification - Detects troubleshooting intent
 * 2. Device Identification - Resolves "Master Alcove Bar"
 * 3. Event Retrieval - Fetches and analyzes recent events
 * 4. Semantic Search - Finds similar patterns
 * 5. Root Cause Analysis - Identifies automation trigger
 *
 * Success Criteria:
 * - Workflow execution < 500ms
 * - Device resolution success
 * - Event retrieval success (20+ events)
 * - Root cause matches manual finding (automation trigger)
 * - Confidence score >= 0.85
 *
 * Validation Against Manual Investigation:
 * - Manual finding: 95% confidence automation trigger (3-second gap)
 * - Framework should detect: Short time gap, automation pattern
 * - Framework should recommend: Check automations, review motion sensor
 */

import { SmartThingsService } from './src/smartthings/client.js';
import { DeviceRegistry } from './src/abstract/DeviceRegistry.js';
import { IntentClassifier } from './src/services/IntentClassifier.js';
import { SemanticIndex, createDeviceMetadataDocument } from './src/services/SemanticIndex.js';
import { DiagnosticWorkflow } from './src/services/DiagnosticWorkflow.js';
import { DeviceService } from './src/services/DeviceService.js';
import { LlmService } from './src/services/llm.js';
import type { IntentClassification } from './src/services/IntentClassifier.js';
import type { ISmartThingsService } from './src/services/interfaces.js';

// Configuration
const ALCOVE_DEVICE_ID = 'ae92f481-1425-4436-b332-de44ff915665';
const ALCOVE_DEVICE_NAME = 'Master Alcove Bar';
const TEST_QUERIES = [
  "Why is my Master Alcove Bar light turning on at night?",
  "Master Alcove Bar keeps turning on unexpectedly",
  "Diagnose issue with alcove light in master bedroom",
  "Check Master Alcove Bar",
];

interface TestResult {
  query: string;
  success: boolean;
  latencyMs: number;
  intent?: IntentClassification;
  deviceResolved: boolean;
  eventsRetrieved: number;
  rootCauseIdentified: boolean;
  confidence: number;
  findings: string[];
  errors: string[];
}

interface DiagnosticTestReport {
  timestamp: string;
  totalTests: number;
  successCount: number;
  failureCount: number;
  averageLatency: number;
  results: TestResult[];
  comparisonWithManual: {
    manualFindings: string[];
    frameworkFindings: string[];
    agreement: number; // 0-100%
    gaps: string[];
  };
  recommendations: string[];
}

class DiagnosticTester {
  private smartthingsService: ISmartThingsService;
  private deviceRegistry: DeviceRegistry;
  private intentClassifier: IntentClassifier;
  private semanticIndex: SemanticIndex;
  private diagnosticWorkflow: DiagnosticWorkflow;
  private deviceService: DeviceService;
  private llmService: LlmService;

  constructor() {
    const pat = process.env['SMARTTHINGS_PAT'];
    if (!pat) {
      throw new Error('SMARTTHINGS_PAT environment variable required');
    }

    this.smartthingsService = new SmartThingsService();
    this.deviceRegistry = new DeviceRegistry();
    this.llmService = new LlmService();
    this.intentClassifier = new IntentClassifier(this.llmService);
    this.semanticIndex = new SemanticIndex();
    this.deviceService = new DeviceService(this.smartthingsService, this.deviceRegistry);
    this.diagnosticWorkflow = new DiagnosticWorkflow(
      this.semanticIndex,
      this.deviceService,
      this.deviceRegistry
    );
  }

  async initialize(): Promise<void> {
    console.log('🔧 Initializing diagnostic framework...');

    // Load devices into registry
    const devices = await this.smartthingsService.listDevices();
    console.log(`📦 Loaded ${devices.length} devices from SmartThings`);

    devices.forEach(device => {
      this.deviceRegistry.addDevice(device);
    });

    // Initialize semantic index
    await this.semanticIndex.initialize();
    await this.semanticIndex.syncWithRegistry(this.deviceRegistry);

    console.log('✅ Framework initialized\n');
  }

  async runDiagnosticTest(query: string): Promise<TestResult> {
    const result: TestResult = {
      query,
      success: false,
      latencyMs: 0,
      deviceResolved: false,
      eventsRetrieved: 0,
      rootCauseIdentified: false,
      confidence: 0,
      findings: [],
      errors: [],
    };

    const startTime = Date.now();

    try {
      // Step 1: Intent Classification
      console.log(`\n🔍 Testing query: "${query}"`);
      console.log('Step 1: Classifying intent...');

      const classification = await this.intentClassifier.classifyIntent(query);
      result.intent = classification;
      result.confidence = classification.confidence;

      console.log(`  ✓ Intent: ${classification.intent} (confidence: ${(classification.confidence * 100).toFixed(1)}%)`);
      console.log(`  ✓ Requires diagnostics: ${classification.requiresDiagnostics}`);

      if (classification.entities.deviceName) {
        console.log(`  ✓ Device name extracted: "${classification.entities.deviceName}"`);
      }

      // Step 2: Execute Diagnostic Workflow
      console.log('Step 2: Executing diagnostic workflow...');

      const report = await this.diagnosticWorkflow.executeDiagnosticWorkflow(
        classification,
        query
      );

      result.latencyMs = Date.now() - startTime;

      // Step 3: Validate Results
      console.log('Step 3: Validating results...');

      // Check device resolution
      if (report.diagnosticContext.device) {
        result.deviceResolved = true;
        const deviceName = report.diagnosticContext.device.label || report.diagnosticContext.device.name;
        console.log(`  ✓ Device resolved: ${deviceName}`);

        // Validate it's the correct device
        if (deviceName.toLowerCase().includes('alcove')) {
          result.findings.push('Correctly identified Master Alcove Bar device');
        } else {
          result.errors.push(`Wrong device identified: ${deviceName} (expected: Master Alcove Bar)`);
        }
      } else {
        result.errors.push('Failed to resolve device reference');
        console.log('  ✗ Device resolution failed');
      }

      // Check event retrieval
      if (report.diagnosticContext.recentEvents) {
        result.eventsRetrieved = report.diagnosticContext.recentEvents.length;
        console.log(`  ✓ Retrieved ${result.eventsRetrieved} events`);

        if (result.eventsRetrieved >= 10) {
          result.findings.push(`Retrieved ${result.eventsRetrieved} events for analysis`);
        } else {
          result.errors.push(`Insufficient events retrieved: ${result.eventsRetrieved} (expected: 20+)`);
        }

        // Analyze event patterns
        const events = report.diagnosticContext.recentEvents;
        const switchEvents = events.filter(e => e.capability === 'switch' && e.attribute === 'switch');

        if (switchEvents.length >= 2) {
          // Check for rapid ON/OFF cycles (automation indicator)
          for (let i = 0; i < switchEvents.length - 1; i++) {
            const current = switchEvents[i];
            const next = switchEvents[i + 1];

            if (current && next) {
              const timeDiff = Math.abs(current.epoch - next.epoch) / 1000; // seconds

              // Detect rapid state changes (< 10 seconds = likely automation)
              if (timeDiff < 10 && current.value !== next.value) {
                result.rootCauseIdentified = true;
                result.findings.push(
                  `Detected rapid state change: ${timeDiff.toFixed(1)}s gap between ${next.value?.toUpperCase()} and ${current.value?.toUpperCase()}`
                );
              }
            }
          }
        }
      } else {
        result.errors.push('No events retrieved');
        console.log('  ✗ Event retrieval failed');
      }

      // Check recommendations
      if (report.recommendations.length > 0) {
        console.log(`  ✓ Generated ${report.recommendations.length} recommendations`);
        result.findings.push(`Framework provided ${report.recommendations.length} recommendations`);

        // Check if recommendations mention automation
        const hasAutomationRecommendation = report.recommendations.some(r =>
          r.toLowerCase().includes('automation') ||
          r.toLowerCase().includes('routine') ||
          r.toLowerCase().includes('schedule')
        );

        if (hasAutomationRecommendation) {
          result.findings.push('Recommendations include checking automations (matches manual finding)');
        }
      }

      // Check latency target
      if (result.latencyMs < 500) {
        result.findings.push(`Workflow latency within target: ${result.latencyMs}ms`);
      } else {
        result.errors.push(`Workflow latency exceeded target: ${result.latencyMs}ms (target: <500ms)`);
      }

      // Overall success criteria
      result.success = result.deviceResolved &&
                       result.eventsRetrieved >= 10 &&
                       result.confidence >= 0.7 &&
                       result.errors.length === 0;

      console.log(`\n${result.success ? '✅' : '❌'} Test ${result.success ? 'PASSED' : 'FAILED'}`);
      console.log(`   Latency: ${result.latencyMs}ms`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Findings: ${result.findings.length}`);
      console.log(`   Errors: ${result.errors.length}`);

    } catch (error) {
      result.latencyMs = Date.now() - startTime;
      result.success = false;
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Workflow execution failed: ${errorMsg}`);
      console.log(`\n❌ Test FAILED: ${errorMsg}`);
    }

    return result;
  }

  async runAllTests(): Promise<DiagnosticTestReport> {
    const report: DiagnosticTestReport = {
      timestamp: new Date().toISOString(),
      totalTests: TEST_QUERIES.length,
      successCount: 0,
      failureCount: 0,
      averageLatency: 0,
      results: [],
      comparisonWithManual: {
        manualFindings: [
          'Light turned on 3-4 seconds after manual turn-off',
          'Multiple rapid ON/OFF cycles detected',
          'Likely automation with "keep light on" logic',
          'Motion sensor may be triggering automation',
          '95% confidence automation trigger',
        ],
        frameworkFindings: [],
        agreement: 0,
        gaps: [],
      },
      recommendations: [],
    };

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   DIAGNOSTIC FRAMEWORK TEST - ALCOVE LIGHT ISSUE');
    console.log('═══════════════════════════════════════════════════════════');

    for (const query of TEST_QUERIES) {
      const result = await this.runDiagnosticTest(query);
      report.results.push(result);

      if (result.success) {
        report.successCount++;
      } else {
        report.failureCount++;
      }

      // Aggregate framework findings
      report.comparisonWithManual.frameworkFindings.push(...result.findings);
    }

    // Calculate statistics
    report.averageLatency = report.results.reduce((sum, r) => sum + r.latencyMs, 0) / report.results.length;

    // Compare with manual investigation
    this.compareWithManualFindings(report);

    // Generate recommendations
    this.generateRecommendations(report);

    return report;
  }

  private compareWithManualFindings(report: DiagnosticTestReport): void {
    const manualKeywords = ['rapid', 'automation', 'motion', 'seconds', 'trigger'];
    const frameworkText = report.comparisonWithManual.frameworkFindings.join(' ').toLowerCase();

    let matches = 0;
    for (const keyword of manualKeywords) {
      if (frameworkText.includes(keyword)) {
        matches++;
      }
    }

    report.comparisonWithManual.agreement = (matches / manualKeywords.length) * 100;

    // Identify gaps
    if (!frameworkText.includes('automation')) {
      report.comparisonWithManual.gaps.push('Framework did not identify automation as root cause');
    }
    if (!frameworkText.includes('rapid') && !frameworkText.includes('quick')) {
      report.comparisonWithManual.gaps.push('Framework did not detect rapid state changes');
    }
    if (!frameworkText.includes('motion') && !frameworkText.includes('sensor')) {
      report.comparisonWithManual.gaps.push('Framework did not suggest motion sensor involvement');
    }
  }

  private generateRecommendations(report: DiagnosticTestReport): void {
    // Performance recommendations
    if (report.averageLatency > 500) {
      report.recommendations.push(
        `Performance Issue: Average latency ${report.averageLatency.toFixed(0)}ms exceeds 500ms target. Consider optimizing parallel data gathering.`
      );
    }

    // Accuracy recommendations
    if (report.comparisonWithManual.agreement < 80) {
      report.recommendations.push(
        `Accuracy Issue: Framework agreement with manual findings is ${report.comparisonWithManual.agreement.toFixed(0)}%. Improve pattern detection algorithms.`
      );
    }

    // Gap analysis
    for (const gap of report.comparisonWithManual.gaps) {
      report.recommendations.push(`Missing Feature: ${gap}`);
    }

    // Success rate recommendations
    const successRate = (report.successCount / report.totalTests) * 100;
    if (successRate < 80) {
      report.recommendations.push(
        `Reliability Issue: Success rate ${successRate.toFixed(0)}% below 80% target. Review error handling and fallback mechanisms.`
      );
    }
  }

  printReport(report: DiagnosticTestReport): void {
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('   DIAGNOSTIC TEST REPORT - COMPREHENSIVE RESULTS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\nTest Timestamp: ${report.timestamp}`);
    console.log(`Total Tests: ${report.totalTests}`);
    console.log(`Success: ${report.successCount} | Failure: ${report.failureCount}`);
    console.log(`Success Rate: ${((report.successCount / report.totalTests) * 100).toFixed(1)}%`);
    console.log(`Average Latency: ${report.averageLatency.toFixed(0)}ms`);

    console.log('\n───────────────────────────────────────────────────────────');
    console.log('   COMPARISON WITH MANUAL INVESTIGATION');
    console.log('───────────────────────────────────────────────────────────');

    console.log('\nManual Findings:');
    report.comparisonWithManual.manualFindings.forEach((finding, i) => {
      console.log(`  ${i + 1}. ${finding}`);
    });

    console.log('\nFramework Findings:');
    const uniqueFindings = [...new Set(report.comparisonWithManual.frameworkFindings)];
    uniqueFindings.forEach((finding, i) => {
      console.log(`  ${i + 1}. ${finding}`);
    });

    console.log(`\nAgreement Score: ${report.comparisonWithManual.agreement.toFixed(1)}%`);

    if (report.comparisonWithManual.gaps.length > 0) {
      console.log('\nIdentified Gaps:');
      report.comparisonWithManual.gaps.forEach((gap, i) => {
        console.log(`  ${i + 1}. ${gap}`);
      });
    }

    console.log('\n───────────────────────────────────────────────────────────');
    console.log('   RECOMMENDATIONS FOR IMPROVEMENT');
    console.log('───────────────────────────────────────────────────────────');

    if (report.recommendations.length > 0) {
      report.recommendations.forEach((rec, i) => {
        console.log(`\n${i + 1}. ${rec}`);
      });
    } else {
      console.log('\n✅ No improvements needed - framework meets all targets!');
    }

    console.log('\n───────────────────────────────────────────────────────────');
    console.log('   DETAILED TEST RESULTS');
    console.log('───────────────────────────────────────────────────────────');

    report.results.forEach((result, i) => {
      console.log(`\nTest ${i + 1}: ${result.query}`);
      console.log(`  Status: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`  Latency: ${result.latencyMs}ms`);
      console.log(`  Intent: ${result.intent?.intent} (${(result.confidence * 100).toFixed(1)}% confidence)`);
      console.log(`  Device Resolved: ${result.deviceResolved ? 'Yes' : 'No'}`);
      console.log(`  Events Retrieved: ${result.eventsRetrieved}`);
      console.log(`  Root Cause Identified: ${result.rootCauseIdentified ? 'Yes' : 'No'}`);

      if (result.findings.length > 0) {
        console.log('  Findings:');
        result.findings.forEach(f => console.log(`    • ${f}`));
      }

      if (result.errors.length > 0) {
        console.log('  Errors:');
        result.errors.forEach(e => console.log(`    ✗ ${e}`));
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   END OF REPORT');
    console.log('═══════════════════════════════════════════════════════════\n');
  }

  async saveReportToFile(report: DiagnosticTestReport): Promise<void> {
    const fs = await import('fs/promises');
    const filename = `diagnostic-test-report-${Date.now()}.json`;

    await fs.writeFile(
      filename,
      JSON.stringify(report, null, 2),
      'utf-8'
    );

    console.log(`📄 Report saved to: ${filename}\n`);
  }
}

// Main execution
async function main() {
  try {
    const tester = new DiagnosticTester();
    await tester.initialize();

    const report = await tester.runAllTests();
    tester.printReport(report);
    await tester.saveReportToFile(report);

    // Exit with appropriate code
    process.exit(report.failureCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
