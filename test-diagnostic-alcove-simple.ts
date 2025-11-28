#!/usr/bin/env tsx

/**
 * Simplified Real-World Diagnostic Test: Master Alcove Bar Light Issue
 *
 * This version skips the LLM-based intent classification and tests
 * the diagnostic workflow directly with pre-configured intent.
 *
 * Focus: Test diagnostic workflow components without LLM dependency
 */

// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

import { SmartThingsService } from './src/smartthings/client.js';
import { DeviceRegistry } from './src/abstract/DeviceRegistry.js';
import { SemanticIndex } from './src/services/SemanticIndex.js';
import { DiagnosticWorkflow } from './src/services/DiagnosticWorkflow.js';
import { DeviceService } from './src/services/DeviceService.js';
import { DiagnosticIntent } from './src/services/IntentClassifier.js';
import { toUnifiedDevice } from './src/services/transformers/deviceInfoToUnified.js';
import type { IntentClassification } from './src/services/IntentClassifier.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   DIAGNOSTIC FRAMEWORK TEST - ALCOVE LIGHT ISSUE');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Initialize services
    console.log('🔧 Initializing services...');
    const smartthingsService = new SmartThingsService();
    const deviceRegistry = new DeviceRegistry();
    const semanticIndex = new SemanticIndex();
    const deviceService = new DeviceService(smartthingsService, deviceRegistry);
    const diagnosticWorkflow = new DiagnosticWorkflow(
      semanticIndex,
      deviceService,
      deviceRegistry
    );

    // Load devices
    console.log('📦 Loading devices from SmartThings...');
    const deviceInfos = await smartthingsService.listDevices();
    console.log(`   Loaded ${deviceInfos.length} devices\n`);

    // Convert DeviceInfo to UnifiedDevice and add to registry
    deviceInfos.forEach(deviceInfo => {
      const unifiedDevice = toUnifiedDevice(deviceInfo);
      deviceRegistry.addDevice(unifiedDevice);
    });

    // Initialize semantic index
    console.log('🔍 Initializing semantic index...');
    await semanticIndex.initialize();
    await semanticIndex.syncWithRegistry(deviceRegistry);
    console.log('   Semantic index ready\n');

    // Simulated intent classification for "Master Alcove Bar issue"
    const classification: IntentClassification = {
      intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
      confidence: 0.90,
      entities: {
        deviceName: 'Master Alcove Bar',
        issueType: 'unexpected turn on',
        timeframe: 'at night',
      },
      requiresDiagnostics: true,
      reasoning: 'User reporting device turning on unexpectedly (simulated intent)',
    };

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   TEST 1: ISSUE DIAGNOSIS - MASTER ALCOVE BAR');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📋 Intent Classification (Simulated):');
    console.log(`   Intent: ${classification.intent}`);
    console.log(`   Confidence: ${(classification.confidence * 100).toFixed(1)}%`);
    console.log(`   Device: ${classification.entities.deviceName}`);
    console.log(`   Issue: ${classification.entities.issueType}`);
    console.log(`   Timeframe: ${classification.entities.timeframe}\n`);

    // Execute diagnostic workflow
    console.log('🔬 Executing diagnostic workflow...');
    const startTime = Date.now();

    const report = await diagnosticWorkflow.executeDiagnosticWorkflow(
      classification,
      'Why is my Master Alcove Bar turning on at night?'
    );

    const elapsed = Date.now() - startTime;

    console.log(`   ✅ Workflow completed in ${elapsed}ms\n`);

    // Analyze results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   DIAGNOSTIC RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`📊 Summary: ${report.summary}`);
    console.log(`⏱️  Latency: ${elapsed}ms (target: <500ms) ${elapsed < 500 ? '✅' : '❌'}`);
    console.log(`🎯 Confidence: ${(report.confidence * 100).toFixed(1)}%\n`);

    // Device resolution
    if (report.diagnosticContext.device) {
      const device = report.diagnosticContext.device;
      console.log('✅ Device Resolution: SUCCESS');
      console.log(`   Name: ${device.label || device.name}`);
      console.log(`   ID: ${device.id}`);
      console.log(`   Room: ${device.room || 'N/A'}`);
      console.log(`   Platform: ${device.platform}`);
      console.log(`   Capabilities: ${Array.from(device.capabilities).slice(0, 5).join(', ')}`);
    } else {
      console.log('❌ Device Resolution: FAILED');
    }

    // Event retrieval
    console.log('');
    if (report.diagnosticContext.recentEvents) {
      const events = report.diagnosticContext.recentEvents;
      console.log(`✅ Event Retrieval: SUCCESS (${events.length} events)`);

      // Analyze switch events for patterns
      const switchEvents = events.filter(e =>
        e.capability === 'switch' && e.attribute === 'switch'
      );

      if (switchEvents.length > 0) {
        console.log(`   Switch events: ${switchEvents.length}`);

        // Find rapid state changes
        let rapidChanges = 0;
        for (let i = 0; i < switchEvents.length - 1; i++) {
          const current = switchEvents[i];
          const next = switchEvents[i + 1];

          if (current && next && current.value !== next.value) {
            const timeDiff = Math.abs(current.epoch - next.epoch) / 1000;
            if (timeDiff < 10) {
              rapidChanges++;
              console.log(`   ⚡ Rapid change detected: ${timeDiff.toFixed(1)}s gap (${next.value} → ${current.value})`);
            }
          }
        }

        if (rapidChanges > 0) {
          console.log(`   ⚠️  Found ${rapidChanges} rapid state changes (automation indicator)`);
        }
      }
    } else {
      console.log('❌ Event Retrieval: FAILED');
    }

    // Health data
    console.log('');
    if (report.diagnosticContext.healthData) {
      console.log('✅ Health Data: AVAILABLE');
      console.log(`   Status: ${report.diagnosticContext.healthData.status}`);
      console.log(`   Online: ${report.diagnosticContext.healthData.online}`);
      if (report.diagnosticContext.healthData.batteryLevel) {
        console.log(`   Battery: ${report.diagnosticContext.healthData.batteryLevel}%`);
      }
    } else {
      console.log('⚠️  Health Data: NOT AVAILABLE');
    }

    // Similar devices
    console.log('');
    if (report.diagnosticContext.similarDevices && report.diagnosticContext.similarDevices.length > 0) {
      console.log(`✅ Similar Devices: ${report.diagnosticContext.similarDevices.length} found`);
      report.diagnosticContext.similarDevices.forEach((result, i) => {
        console.log(`   ${i + 1}. ${result.device.metadata.label} (${(result.score * 100).toFixed(0)}% match)`);
      });
    } else {
      console.log('⚠️  Similar Devices: NONE FOUND');
    }

    // Recommendations
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (report.recommendations.length > 0) {
      console.log(`Generated ${report.recommendations.length} recommendations:\n`);
      report.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    } else {
      console.log('⚠️  No automated recommendations generated');
    }

    // Rich context sample
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   RICH CONTEXT (Sample)');
    console.log('═══════════════════════════════════════════════════════════\n');
    const contextLines = report.richContext.split('\n');
    console.log(contextLines.slice(0, 20).join('\n'));
    if (contextLines.length > 20) {
      console.log(`\n... (${contextLines.length - 20} more lines)\n`);
    }

    // Comparison with manual findings
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   COMPARISON WITH MANUAL INVESTIGATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    const manualFindings = [
      'Light turned on 3-4 seconds after manual turn-off',
      'Multiple rapid ON/OFF cycles detected',
      'Likely automation with "keep light on" logic',
      'Motion sensor may be triggering automation',
      '95% confidence automation trigger',
    ];

    console.log('Manual Investigation Findings:');
    manualFindings.forEach((finding, i) => {
      console.log(`  ${i + 1}. ${finding}`);
    });

    console.log('\nFramework Agreement Analysis:');

    const reportText = JSON.stringify(report).toLowerCase();
    const hasRapidDetection = reportText.includes('rapid') || reportText.includes('quick');
    const hasAutomationMention = report.recommendations.some(r =>
      r.toLowerCase().includes('automation') || r.toLowerCase().includes('routine')
    );
    const hasMotionMention = reportText.includes('motion');

    console.log(`  ✅ Rapid state changes: ${hasRapidDetection ? 'DETECTED' : 'NOT DETECTED'}`);
    console.log(`  ${hasAutomationMention ? '✅' : '❌'} Automation recommendation: ${hasAutomationMention ? 'INCLUDED' : 'MISSING'}`);
    console.log(`  ${hasMotionMention ? '✅' : '⚠️'}  Motion sensor reference: ${hasMotionMention ? 'FOUND' : 'NOT FOUND'}`);

    // Overall assessment
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   OVERALL ASSESSMENT');
    console.log('═══════════════════════════════════════════════════════════\n');

    const criteria = {
      deviceResolved: !!report.diagnosticContext.device,
      eventsRetrieved: (report.diagnosticContext.recentEvents?.length || 0) >= 10,
      latencyGood: elapsed < 500,
      confidenceGood: report.confidence >= 0.7,
      hasRecommendations: report.recommendations.length > 0,
    };

    const passedCriteria = Object.values(criteria).filter(Boolean).length;
    const totalCriteria = Object.keys(criteria).length;
    const successRate = (passedCriteria / totalCriteria) * 100;

    console.log('Success Criteria:');
    console.log(`  ${criteria.deviceResolved ? '✅' : '❌'} Device resolved`);
    console.log(`  ${criteria.eventsRetrieved ? '✅' : '❌'} Events retrieved (10+ events)`);
    console.log(`  ${criteria.latencyGood ? '✅' : '❌'} Latency within target (<500ms)`);
    console.log(`  ${criteria.confidenceGood ? '✅' : '❌'} Confidence adequate (>=70%)`);
    console.log(`  ${criteria.hasRecommendations ? '✅' : '❌'} Recommendations provided`);

    console.log(`\nSuccess Rate: ${passedCriteria}/${totalCriteria} (${successRate.toFixed(0)}%)\n`);

    if (successRate >= 80) {
      console.log('✅ TEST PASSED - Framework meets performance targets');
    } else {
      console.log('❌ TEST FAILED - Framework needs improvement');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   END OF DIAGNOSTIC TEST');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Exit with appropriate code
    process.exit(successRate >= 80 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
