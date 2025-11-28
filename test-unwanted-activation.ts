#!/usr/bin/env tsx

/**
 * Re-Investigation: Master Alcove Bar - Unwanted Activation Analysis
 *
 * CORRECTED PROBLEM STATEMENT:
 * - Light turns ON at night WITHOUT manual activation (unwanted)
 * - User manually turns it OFF when this happens
 * - This is NOT about the light turning OFF after being turned ON
 * - This IS about automation/routine causing unwanted ON events
 *
 * INVESTIGATION FOCUS:
 * 1. Detect unexpected ON events (not manual activation)
 * 2. Analyze time patterns (night-time specific)
 * 3. Identify automation triggers
 * 4. Check for motion sensor automations
 * 5. Look for time-based routines
 *
 * ROOT CAUSE HYPOTHESES:
 * - Motion sensor automation: "Turn ON when motion detected"
 * - Time-based routine: "Turn lights ON at sunset/evening"
 * - Mode-based automation: "When arriving home, turn lights ON"
 * - Scene activation: Scene includes light in ON state
 * - Third-party integration: IFTTT, Alexa, Google Home
 * - Security automation: "Simulate presence" or "Turn ON when door opens"
 */

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
import type { DeviceEvent } from './src/types/device-events.js';

const MASTER_ALCOVE_BAR_ID = 'smartthings:ae92f481-1425-4436-b332-de44ff915565';

interface ActivationEvent {
  timestamp: string;
  epoch: number;
  hour: number;
  previousValue: string;
  gapFromPreviousOff: number; // milliseconds from previous OFF
  likelySource: 'manual' | 'automation' | 'routine' | 'unknown';
  confidence: number;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   UNWANTED ACTIVATION INVESTIGATION');
  console.log('   Device: Master Alcove Bar');
  console.log('   Issue: Light turns ON at night without manual activation');
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

    deviceInfos.forEach(deviceInfo => {
      const unifiedDevice = toUnifiedDevice(deviceInfo);
      deviceRegistry.addDevice(unifiedDevice);
    });

    // Initialize semantic index
    console.log('🔍 Initializing semantic index...');
    await semanticIndex.initialize();
    await semanticIndex.syncWithRegistry(deviceRegistry);
    console.log('   Semantic index ready\n');

    // Step 1: Run diagnostic workflow with CORRECTED intent
    const classification: IntentClassification = {
      intent: DiagnosticIntent.ISSUE_DIAGNOSIS,
      confidence: 0.95,
      entities: {
        deviceName: 'Master Alcove Bar',
        issueType: 'unwanted activation',
        timeframe: 'at night',
      },
      requiresDiagnostics: true,
      reasoning: 'Device turning ON unexpectedly at night (unwanted activation)',
    };

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   STEP 1: DIAGNOSTIC WORKFLOW ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const report = await diagnosticWorkflow.executeDiagnosticWorkflow(
      classification,
      'Why does my Master Alcove Bar turn on at night without me activating it?'
    );

    console.log(`📊 Summary: ${report.summary}`);
    console.log(`🎯 Confidence: ${(report.confidence * 100).toFixed(1)}%\n`);

    // Display pattern detection results
    if (report.diagnosticContext.relatedIssues && report.diagnosticContext.relatedIssues.length > 0) {
      console.log('🔍 Pattern Detection Results:');
      report.diagnosticContext.relatedIssues.forEach(issue => {
        console.log(`   - ${issue.type}: ${issue.description}`);
        console.log(`     Confidence: ${(issue.confidence * 100).toFixed(0)}%, Occurrences: ${issue.occurrences}`);
      });
      console.log('');
    }

    // Step 2: Deep dive into activation events
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   STEP 2: ACTIVATION EVENT ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const events = report.diagnosticContext.recentEvents || [];
    const switchEvents = events.filter(e => e.attribute === 'switch');

    console.log(`Total switch events analyzed: ${switchEvents.length}\n`);

    // Analyze ON events specifically
    const activationEvents = analyzeActivationEvents(switchEvents);

    console.log(`Found ${activationEvents.length} activation (ON) events:\n`);

    // Group by time of day
    const nightActivations = activationEvents.filter(a => a.hour >= 20 || a.hour <= 6);
    const dayActivations = activationEvents.filter(a => a.hour > 6 && a.hour < 20);

    console.log(`🌙 Night-time activations (8 PM - 6 AM): ${nightActivations.length}`);
    console.log(`☀️  Day-time activations (6 AM - 8 PM): ${dayActivations.length}\n`);

    // Display night-time activations (the problem events)
    if (nightActivations.length > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('   PROBLEM EVENTS: NIGHT-TIME ACTIVATIONS');
      console.log('═══════════════════════════════════════════════════════════\n');

      nightActivations.forEach((activation, i) => {
        const date = new Date(activation.timestamp);
        const timeStr = date.toLocaleString();
        const hourStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        console.log(`${i + 1}. ${timeStr} (${hourStr})`);
        console.log(`   Gap from previous OFF: ${(activation.gapFromPreviousOff / 1000).toFixed(1)}s`);
        console.log(`   Likely source: ${activation.likelySource}`);
        console.log(`   Confidence: ${(activation.confidence * 100).toFixed(0)}%`);
        console.log('');
      });
    }

    // Step 3: Pattern analysis for root cause
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   STEP 3: ROOT CAUSE ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const rootCauseHypotheses = analyzeRootCause(nightActivations, report);

    rootCauseHypotheses.forEach((hypothesis, i) => {
      const icon = hypothesis.confidence >= 0.8 ? '🔴' : hypothesis.confidence >= 0.6 ? '🟡' : '⚪';
      console.log(`${icon} Hypothesis ${i + 1}: ${hypothesis.hypothesis}`);
      console.log(`   Confidence: ${(hypothesis.confidence * 100).toFixed(0)}%`);
      console.log(`   Evidence: ${hypothesis.evidence}`);
      console.log(`   Action: ${hypothesis.action}\n`);
    });

    // Step 4: Recommendations
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   STEP 4: ACTIONABLE RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Immediate Actions:\n');

    // Diagnostic recommendations
    if (report.recommendations.length > 0) {
      report.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }

    // Additional targeted recommendations
    console.log('\nSpecific Investigation Steps:\n');
    console.log('1. Open SmartThings app → Automations');
    console.log('2. Search for automations affecting "Master Alcove Bar"');
    console.log('3. Check for:');
    console.log('   - Motion sensor triggers (e.g., "when motion detected, turn light ON")');
    console.log('   - Time-based routines (e.g., "turn lights ON at sunset")');
    console.log('   - Mode changes (e.g., "when arriving home, turn lights ON")');
    console.log('   - Scene activations that include this light');
    console.log('4. Review third-party integrations:');
    console.log('   - Alexa routines');
    console.log('   - Google Home automations');
    console.log('   - IFTTT applets\n');

    console.log('Verification Plan:\n');
    console.log('1. Disable suspected automation(s)');
    console.log('2. Monitor for 24-48 hours');
    console.log('3. Check if unwanted ON events stop');
    console.log('4. Re-enable with modified conditions if needed\n');

    // Step 5: Timeline visualization
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   STEP 5: EVENT TIMELINE (Last 24 Hours)');
    console.log('═══════════════════════════════════════════════════════════\n');

    displayEventTimeline(switchEvents.slice(0, 20));

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   INVESTIGATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Analyze activation (ON) events to determine likely source.
 */
function analyzeActivationEvents(switchEvents: DeviceEvent[]): ActivationEvent[] {
  const activations: ActivationEvent[] = [];

  // Sort by epoch (oldest first)
  const sorted = [...switchEvents].sort((a, b) => a.epoch - b.epoch);

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    if (!event || event.value !== 'on') continue;

    // Find previous OFF event
    let previousOff: DeviceEvent | undefined;
    for (let j = i - 1; j >= 0; j--) {
      const prevEvent = sorted[j];
      if (prevEvent && prevEvent.value === 'off') {
        previousOff = prevEvent;
        break;
      }
    }

    const gapFromPreviousOff = previousOff
      ? event.epoch - previousOff.epoch
      : Infinity;

    // Classify source based on gap
    let likelySource: 'manual' | 'automation' | 'routine' | 'unknown';
    let confidence: number;

    if (gapFromPreviousOff < 5000) {
      // <5s: Immediate re-trigger (automation)
      likelySource = 'automation';
      confidence = 0.95;
    } else if (gapFromPreviousOff < 60000) {
      // <1 minute: Quick re-trigger (possible automation)
      likelySource = 'automation';
      confidence = 0.80;
    } else if (gapFromPreviousOff === Infinity) {
      // No previous OFF: Could be scheduled routine or first activation
      likelySource = 'routine';
      confidence = 0.70;
    } else {
      // >1 minute: Could be manual or scheduled
      likelySource = 'unknown';
      confidence = 0.50;
    }

    const date = new Date(event.time);
    activations.push({
      timestamp: event.time,
      epoch: event.epoch,
      hour: date.getHours(),
      previousValue: previousOff?.value || 'unknown',
      gapFromPreviousOff,
      likelySource,
      confidence,
    });
  }

  return activations;
}

/**
 * Analyze root cause hypotheses based on activation patterns.
 */
function analyzeRootCause(nightActivations: ActivationEvent[], report: any): Array<{
  hypothesis: string;
  confidence: number;
  evidence: string;
  action: string;
}> {
  const hypotheses: Array<{
    hypothesis: string;
    confidence: number;
    evidence: string;
    action: string;
  }> = [];

  // Hypothesis 1: Motion sensor automation
  const automationTriggers = nightActivations.filter(a => a.likelySource === 'automation').length;
  if (automationTriggers > 0) {
    const motionSensorNearby = report.diagnosticContext.similarDevices?.some((d: any) =>
      Array.from(d.device.metadata.capabilities).includes('motionSensor')
    );

    const confidence = motionSensorNearby ? 0.90 : 0.75;

    hypotheses.push({
      hypothesis: 'Motion sensor automation causing unwanted ON events',
      confidence,
      evidence: `${automationTriggers} automation-triggered activations detected. ${motionSensorNearby ? 'Motion sensor found nearby.' : 'No motion sensor found, but automation pattern evident.'}`,
      action: 'Review SmartThings automations for motion sensor triggers affecting Master Alcove Bar',
    });
  }

  // Hypothesis 2: Time-based routine
  const activationHours = nightActivations.map(a => a.hour);
  const uniqueHours = new Set(activationHours);
  const hasConsistentTime = uniqueHours.size <= 2; // Activations within 2 different hours

  if (hasConsistentTime && nightActivations.length >= 2) {
    const mostCommonHour = Array.from(uniqueHours)[0] || 0;
    hypotheses.push({
      hypothesis: `Scheduled routine triggering light at ~${mostCommonHour}:00`,
      confidence: 0.85,
      evidence: `Activations occur consistently at similar times: ${Array.from(uniqueHours).join(', ')} hours`,
      action: `Check SmartThings app → Routines for time-based triggers around ${mostCommonHour}:00`,
    });
  }

  // Hypothesis 3: Scene activation
  const rapidRetriggers = nightActivations.filter(a => a.gapFromPreviousOff < 10000).length;
  if (rapidRetriggers > 0) {
    hypotheses.push({
      hypothesis: 'Scene activation or "keep light ON" automation',
      confidence: 0.80,
      evidence: `${rapidRetriggers} rapid re-triggers detected (light turned back ON within 10s of being turned OFF)`,
      action: 'Review scenes and automations with "restore state" or "keep ON" logic',
    });
  }

  // Hypothesis 4: Third-party integration
  if (nightActivations.length > 0 && automationTriggers === 0) {
    hypotheses.push({
      hypothesis: 'Third-party integration (Alexa, Google Home, IFTTT)',
      confidence: 0.60,
      evidence: 'No clear SmartThings automation pattern detected, but activations are occurring',
      action: 'Check Alexa routines, Google Home automations, and IFTTT applets',
    });
  }

  // Sort by confidence
  return hypotheses.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Display event timeline for visual analysis.
 */
function displayEventTimeline(events: DeviceEvent[]): void {
  if (events.length === 0) {
    console.log('No events to display');
    return;
  }

  console.log('Time                     | State | Gap from Previous');
  console.log('---------------------------|-------|------------------');

  let prevEpoch = 0;
  events.forEach(event => {
    const date = new Date(event.time);
    const timeStr = date.toLocaleTimeString();
    const gap = prevEpoch > 0 ? ((event.epoch - prevEpoch) / 1000).toFixed(1) : 'N/A';
    const stateIcon = event.value === 'on' ? '🟢 ON ' : '🔴 OFF';

    console.log(`${timeStr.padEnd(24)} | ${stateIcon} | ${gap}s`);
    prevEpoch = event.epoch;
  });
}

main();
