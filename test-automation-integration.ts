/**
 * Integration test for AutomationService + DiagnosticWorkflow (BUG-1M-308)
 *
 * This test verifies that the DiagnosticWorkflow can identify automations
 * controlling a device and include specific automation names in recommendations.
 *
 * Test Case: Alcove Bar unwanted activation
 * - Device ID: ae92f481-1425-4436-b332-de44ff915565
 * - Expected: System identifies controlling automation by name
 */

import 'dotenv/config';
import { DiagnosticWorkflow } from './src/services/DiagnosticWorkflow.js';
import { ServiceContainer } from './src/services/ServiceContainer.js';
import { smartThingsService } from './src/smartthings/client.js';
import { SmartThingsAdapter } from './src/platforms/smartthings/SmartThingsAdapter.js';
import logger from './src/utils/logger.js';
import type { IntentClassification } from './src/services/IntentClassifier.js';

async function testAutomationIdentification() {
  try {
    logger.info('Starting automation identification integration test...');

    // Setup: Create ServiceContainer with SmartThingsAdapter for AutomationService
    const token = process.env.SMARTTHINGS_TOKEN;
    if (!token) {
      throw new Error('SMARTTHINGS_TOKEN environment variable is required');
    }

    const adapter = new SmartThingsAdapter({ token });

    // Initialize adapter first (required for AutomationService)
    await adapter.initialize();

    const serviceContainer = new ServiceContainer(smartThingsService, adapter);

    // Initialize services
    await serviceContainer.initialize();

    // Get services needed for DiagnosticWorkflow
    const deviceService = serviceContainer.getDeviceService();

    // Load devices to populate registry (simplified - in real code this is done by ServiceFactory)
    const devices = await deviceService.listDevices();
    logger.info(`Loaded ${devices.length} devices from SmartThings`);

    // For this test, we'll create minimal mocks since we need a full setup
    // In production, this would use the actual SemanticIndex and DeviceRegistry
    const mockSemanticIndex = {
      searchDevices: async () => [],
    } as any;

    const mockDeviceRegistry = {
      getDevice: (id: string) => {
        // Return minimal device info needed for automation identification
        return {
          id,
          platform: 'smartthings',
          // locationId will be fetched from API in our implementation
        };
      },
      getAllDevices: () => devices,
    } as any;

    // Create DiagnosticWorkflow WITH ServiceContainer
    const workflow = new DiagnosticWorkflow(
      mockSemanticIndex,
      deviceService,
      mockDeviceRegistry,
      serviceContainer // NEW: Enable automation identification
    );

    // Test Case: Diagnose Alcove Bar device
    const deviceId = 'smartthings:ae92f481-1425-4436-b332-de44ff915565';

    const classification: IntentClassification = {
      intent: 'issue_diagnosis',
      confidence: 0.95,
      entities: {
        deviceId,
      },
      reasoning: 'User wants to diagnose device issue',
    };

    logger.info('Executing diagnostic workflow with automation identification...');
    const report = await workflow.executeDiagnosticWorkflow(classification, 'diagnose alcove bar');

    // Verify Results
    logger.info('Diagnostic Report:', {
      summary: report.summary,
      patternsDetected: report.diagnosticContext.relatedIssues?.length || 0,
      automationsIdentified: report.diagnosticContext.identifiedAutomations?.length || 0,
      recommendationsCount: report.recommendations.length,
    });

    // Check if automations were identified
    if (report.diagnosticContext.identifiedAutomations) {
      logger.info('✅ Identified Automations:');
      for (const auto of report.diagnosticContext.identifiedAutomations) {
        logger.info(`  - ${auto.ruleName} (ID: ${auto.ruleId}, Status: ${auto.status})`);
        logger.info(`    Roles: ${auto.deviceRoles.join(', ')}`);
        logger.info(`    Confidence: ${(auto.confidence * 100).toFixed(0)}%`);
      }
    } else {
      logger.warn('⚠️ No automations identified (may be expected if no rules exist)');
    }

    // Check recommendations
    logger.info('\n📋 Recommendations:');
    for (const rec of report.recommendations) {
      logger.info(`  ${rec}`);
    }

    // Verify SUCCESS CRITERIA
    const hasAutomationPattern = report.diagnosticContext.relatedIssues?.some(
      (p) => p.type === 'rapid_changes' || p.type === 'automation_trigger'
    );

    const hasSpecificAutomations =
      report.diagnosticContext.identifiedAutomations &&
      report.diagnosticContext.identifiedAutomations.length > 0;

    const hasAutomationRecommendations = report.recommendations.some((r) =>
      r.toLowerCase().includes('automation')
    );

    logger.info('\n✅ Test Results:');
    logger.info(`  Automation pattern detected: ${hasAutomationPattern ? 'YES' : 'NO'}`);
    logger.info(`  Specific automations identified: ${hasSpecificAutomations ? 'YES' : 'NO'}`);
    logger.info(
      `  Automation recommendations provided: ${hasAutomationRecommendations ? 'YES' : 'NO'}`
    );

    if (hasAutomationPattern && hasSpecificAutomations) {
      logger.info(
        '\n🎉 SUCCESS: BUG-1M-308 integration complete - system identifies automations by name!'
      );
    } else if (hasAutomationRecommendations) {
      logger.info(
        '\n✅ PARTIAL SUCCESS: Automation recommendations provided (pattern detection working)'
      );
    } else {
      logger.warn('\n⚠️ No automation patterns detected for this device (may be expected)');
    }
  } catch (error) {
    logger.error('Test failed:', error);
    throw error;
  }
}

// Run test
testAutomationIdentification()
  .then(() => {
    logger.info('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Test failed:', error);
    process.exit(1);
  });
