/**
 * DiagnosticWorkflow - Orchestrates diagnostic data gathering and context injection.
 *
 * Design Decision: Parallel data gathering with typed context
 * Rationale: Multiple diagnostic data sources (device status, events, similar devices)
 * can be fetched in parallel for <500ms total latency. Structured context injection
 * provides LLM with rich troubleshooting information.
 *
 * Architecture: Service Layer (Layer 3)
 * - Orchestrates parallel API calls to gather diagnostic data
 * - Resolves device references using SemanticIndex + DeviceRegistry
 * - Builds structured diagnostic context for LLM injection
 * - Generates human-readable summaries and recommendations
 *
 * Trade-offs:
 * - Latency: Parallel fetching vs serial (500ms vs 2000ms)
 * - Completeness: All data vs minimal (better diagnosis vs cost)
 * - Robustness: Promise.allSettled (partial success) vs Promise.all (all-or-nothing)
 *
 * Performance:
 * - Device resolution: <100ms (semantic search)
 * - Parallel data gathering: <400ms (concurrent API calls)
 * - Context formatting: <50ms (string building)
 * - Total workflow: <500ms (target)
 *
 * @module services/DiagnosticWorkflow
 */

import type { IntentClassification, DiagnosticIntent } from './IntentClassifier.js';
import type { SemanticIndex, DeviceSearchResult } from './SemanticIndex.js';
import type { IDeviceService } from './interfaces.js';
import type { DeviceRegistry } from '../abstract/DeviceRegistry.js';
import type { DeviceId } from '../types/smartthings.js';
import type { DeviceEvent } from '../types/device-events.js';
import type { UnifiedDevice, UniversalDeviceId } from '../types/unified-device.js';
import logger from '../utils/logger.js';

// Helper function to safely convert UniversalDeviceId to DeviceId
function toDeviceId(id: UniversalDeviceId | string): DeviceId {
  return id as unknown as DeviceId;
}

// Helper function to safely convert DeviceId to UniversalDeviceId
function toUniversalId(id: DeviceId | string): UniversalDeviceId {
  return id as unknown as UniversalDeviceId;
}

/**
 * Device health data summary.
 */
export interface DeviceHealthData {
  /** Health status (online, offline, warning) */
  status: 'online' | 'offline' | 'warning';

  /** Battery level percentage (if applicable) */
  batteryLevel?: number;

  /** Whether device is currently online */
  online: boolean;

  /** Last activity timestamp */
  lastActivity?: string;

  /** Current state summary */
  currentState?: Record<string, unknown>;
}

/**
 * Issue pattern detected in event history.
 */
export interface IssuePattern {
  /** Pattern type */
  type: 'rapid_changes' | 'repeated_failures' | 'connectivity_gap' | 'normal';

  /** Human-readable description */
  description: string;

  /** Number of occurrences */
  occurrences: number;

  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Automation involving device.
 */
export interface Automation {
  /** Automation ID */
  id: string;

  /** Automation name */
  name: string;

  /** Description */
  description?: string;

  /** Whether automation is enabled */
  enabled: boolean;
}

/**
 * System-wide status report.
 */
export interface SystemStatusReport {
  /** Total devices in system */
  totalDevices: number;

  /** Number of healthy devices */
  healthyDevices: number;

  /** Number of devices with warnings */
  warningDevices: number;

  /** Number of critical/offline devices */
  criticalDevices: number;

  /** Recent issues detected */
  recentIssues: string[];
}

/**
 * Comprehensive diagnostic context.
 *
 * Design Decision: Rich context with multiple data sources
 * Rationale: LLMs perform better with comprehensive context than minimal data.
 * Structured fields allow selective injection based on intent type.
 */
export interface DiagnosticContext {
  /** Original intent classification */
  intent: IntentClassification;

  /** Resolved device (if applicable) */
  device?: UnifiedDevice;

  /** Device health data */
  healthData?: DeviceHealthData;

  /** Recent event history */
  recentEvents?: DeviceEvent[];

  /** Similar devices */
  similarDevices?: DeviceSearchResult[];

  /** Related issue patterns */
  relatedIssues?: IssuePattern[];

  /** Automations involving device */
  automations?: Automation[];

  /** System-wide status */
  systemStatus?: SystemStatusReport;
}

/**
 * Diagnostic report for LLM injection.
 *
 * Design Decision: Separate summary and rich context
 * Rationale: Summary for quick understanding, richContext for detailed analysis.
 * Recommendations provide structured guidance for LLM responses.
 */
export interface DiagnosticReport {
  /** High-level summary */
  summary: string;

  /** Structured diagnostic context */
  diagnosticContext: DiagnosticContext;

  /** Recommended troubleshooting actions */
  recommendations: string[];

  /** Formatted context for LLM injection */
  richContext: string;

  /** Confidence in diagnostic data quality */
  confidence: number;

  /** Report generation timestamp */
  timestamp: string;
}

/**
 * DiagnosticWorkflow service.
 *
 * Orchestrates diagnostic data gathering and generates structured context for LLM.
 *
 * Workflow Steps:
 * 1. Resolve device reference (if present in intent)
 * 2. Build data gathering plan based on intent type
 * 3. Execute parallel data gathering (Promise.allSettled)
 * 4. Populate diagnostic context from results
 * 5. Generate rich context string for LLM injection
 * 6. Create diagnostic report with recommendations
 *
 * Error Handling:
 * - Device resolution failures: Log warning, continue without device context
 * - Individual data gathering failures: Log error, include partial data
 * - All data gathering fails: Return minimal diagnostic report
 * - Promise.allSettled ensures partial success is usable
 *
 * @example
 * ```typescript
 * const workflow = new DiagnosticWorkflow(semanticIndex, deviceService, deviceRegistry);
 *
 * const classification = { intent: DEVICE_HEALTH, entities: { deviceName: "bedroom motion sensor" } };
 * const report = await workflow.executeDiagnosticWorkflow(classification, "check bedroom sensor");
 *
 * // Inject into LLM system prompt
 * systemPrompt += `\n\n${report.richContext}`;
 * ```
 */
export class DiagnosticWorkflow {
  private semanticIndex: SemanticIndex;
  private deviceService: IDeviceService;
  private deviceRegistry: DeviceRegistry;

  /**
   * Create DiagnosticWorkflow instance.
   *
   * @param semanticIndex Semantic device search service
   * @param deviceService Device operations service
   * @param deviceRegistry Device registry for lookups
   */
  constructor(
    semanticIndex: SemanticIndex,
    deviceService: IDeviceService,
    deviceRegistry: DeviceRegistry
  ) {
    this.semanticIndex = semanticIndex;
    this.deviceService = deviceService;
    this.deviceRegistry = deviceRegistry;
    logger.info('DiagnosticWorkflow initialized');
  }

  /**
   * Execute diagnostic workflow.
   *
   * Time Complexity: O(k) where k = number of parallel data gathering tasks
   * Performance: <500ms for typical workflows
   *
   * @param classification Intent classification result
   * @param userMessage Original user message
   * @returns Diagnostic report with rich context
   */
  async executeDiagnosticWorkflow(
    classification: IntentClassification,
    _userMessage: string
  ): Promise<DiagnosticReport> {
    const startTime = Date.now();

    const context: DiagnosticContext = {
      intent: classification,
    };

    // Step 1: Resolve device reference
    if (classification.entities.deviceName || classification.entities.deviceId) {
      try {
        context.device = await this.resolveDevice(classification.entities);
      } catch (error) {
        logger.warn('Failed to resolve device reference', {
          deviceName: classification.entities.deviceName,
          deviceId: classification.entities.deviceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Step 2: Build data gathering plan
    const dataGatheringTasks = this.buildDataGatheringPlan(classification.intent, context.device);

    // Step 3: Execute parallel data gathering
    const results = await Promise.allSettled(dataGatheringTasks);

    // Step 4: Populate context from results
    this.populateContext(context, results);

    // Step 5: Generate diagnostic report
    const report = this.compileDiagnosticReport(context);

    const elapsed = Date.now() - startTime;
    logger.info('Diagnostic workflow completed', {
      intent: classification.intent,
      hasDevice: !!context.device,
      dataPointsGathered: this.countDataPoints(context),
      elapsedMs: elapsed,
    });

    return report;
  }

  /**
   * Build data gathering plan based on intent.
   *
   * Design Decision: Intent-specific data gathering
   * Rationale: Different intents need different data. DEVICE_HEALTH needs current
   * status, ISSUE_DIAGNOSIS needs event history, SYSTEM_STATUS needs aggregates.
   * Minimizes unnecessary API calls.
   *
   * @param intent Diagnostic intent
   * @param device Resolved device (if applicable)
   * @returns Array of data gathering promises
   */
  private buildDataGatheringPlan(
    intent: DiagnosticIntent,
    device?: UnifiedDevice
  ): Promise<any>[] {
    const tasks: Promise<any>[] = [];

    switch (intent) {
      case 'device_health':
        if (device) {
          tasks.push(this.getDeviceHealth(toDeviceId(device.id)));
          tasks.push(this.getRecentEvents(toDeviceId(device.id), 50));
          tasks.push(this.findSimilarDevices(device.id, 3));
        }
        break;

      case 'issue_diagnosis':
        if (device) {
          tasks.push(this.getDeviceHealth(toDeviceId(device.id)));
          tasks.push(this.getRecentEvents(toDeviceId(device.id), 100));
          tasks.push(this.detectPatterns(toDeviceId(device.id)));
          tasks.push(this.findSimilarDevices(device.id, 3));
          // Note: automations would require additional service
        }
        break;

      case 'discovery':
        if (device) {
          tasks.push(this.findSimilarDevices(device.id, 10));
        }
        break;

      case 'system_status':
        tasks.push(this.getSystemStatus());
        break;

      // MODE_MANAGEMENT and NORMAL_QUERY don't need diagnostic data
      case 'mode_management':
      case 'normal_query':
      default:
        break;
    }

    return tasks;
  }

  /**
   * Populate diagnostic context from settled promises.
   *
   * Design Decision: Use Promise.allSettled for partial success
   * Rationale: If 3/4 data sources succeed, use those 3. Don't fail entire
   * workflow because one API call failed. Graceful degradation.
   *
   * @param context Diagnostic context to populate
   * @param results Settled promise results
   */
  private populateContext(
    context: DiagnosticContext,
    results: PromiseSettledResult<any>[]
  ): void {
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const data = result.value;

        if (!data || !data.type) {
          continue;
        }

        switch (data.type) {
          case 'health':
            context.healthData = data.value;
            break;
          case 'events':
            context.recentEvents = data.value;
            break;
          case 'similar':
            context.similarDevices = data.value;
            break;
          case 'patterns':
            context.relatedIssues = data.value;
            break;
          case 'automations':
            context.automations = data.value;
            break;
          case 'systemStatus':
            context.systemStatus = data.value;
            break;
        }
      } else {
        logger.warn('Data gathering task failed', {
          reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  /**
   * Compile diagnostic report with formatted context.
   *
   * Design Decision: Multi-section Markdown formatting
   * Rationale: LLMs comprehend structured Markdown better than plain text.
   * Clear section headers enable selective reading.
   *
   * @param context Diagnostic context
   * @returns Complete diagnostic report
   */
  private compileDiagnosticReport(
    context: DiagnosticContext
  ): DiagnosticReport {
    const richContext = this.formatRichContext(context);
    const summary = this.generateSummary(context);
    const recommendations = this.generateRecommendations(context);

    return {
      summary,
      diagnosticContext: context,
      recommendations,
      richContext,
      confidence: context.intent.confidence,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format rich diagnostic context for LLM injection.
   *
   * Design Decision: Markdown sections with hierarchical structure
   * Rationale: Markdown headers (##) provide clear delineation. Bullet points
   * make data scannable. Human-readable format helps LLM comprehension.
   *
   * @param context Diagnostic context
   * @returns Formatted Markdown string
   */
  private formatRichContext(context: DiagnosticContext): string {
    const sections: string[] = [];

    // Device Information
    if (context.device) {
      sections.push('## Device Information');
      sections.push(`- **Name**: ${context.device.label || context.device.name}`);
      sections.push(`- **ID**: ${context.device.id}`);
      sections.push(`- **Room**: ${context.device.room || 'Not assigned'}`);
      sections.push(`- **Platform**: ${context.device.platform}`);
      sections.push(`- **Capabilities**: ${Array.from(context.device.capabilities).join(', ')}`);
      if (context.device.manufacturer) {
        sections.push(`- **Manufacturer**: ${context.device.manufacturer}`);
      }
      if (context.device.model) {
        sections.push(`- **Model**: ${context.device.model}`);
      }
    }

    // Health Status
    if (context.healthData) {
      sections.push('\n## Health Status');
      sections.push(`- **Status**: ${context.healthData.status}`);
      sections.push(`- **Online**: ${context.healthData.online ? 'Yes' : 'No'}`);
      if (context.healthData.batteryLevel !== undefined) {
        sections.push(`- **Battery**: ${context.healthData.batteryLevel}%`);
      }
      if (context.healthData.lastActivity) {
        sections.push(`- **Last Activity**: ${context.healthData.lastActivity}`);
      }
    }

    // Recent Events
    if (context.recentEvents && context.recentEvents.length > 0) {
      sections.push('\n## Recent Events');
      sections.push(`Showing ${Math.min(10, context.recentEvents.length)} most recent events:\n`);

      context.recentEvents.slice(0, 10).forEach((event) => {
        sections.push(`- **${event.time}**: ${event.capability}.${event.attribute} = ${event.value}`);
      });

      if (context.recentEvents.length > 10) {
        sections.push(`\n_(${context.recentEvents.length - 10} more events not shown)_`);
      }
    }

    // Similar Devices
    if (context.similarDevices && context.similarDevices.length > 0) {
      sections.push('\n## Similar Devices');
      context.similarDevices.forEach((result) => {
        const score = (result.score * 100).toFixed(0);
        sections.push(`- **${result.device.metadata.label}** (${score}% match) - ${result.device.metadata.room || 'No room'}`);
      });
    }

    // Related Issues
    if (context.relatedIssues && context.relatedIssues.length > 0) {
      sections.push('\n## Related Issues Detected');
      context.relatedIssues.forEach((issue) => {
        sections.push(`- **${issue.type}**: ${issue.description} (${issue.occurrences} occurrences, ${(issue.confidence * 100).toFixed(0)}% confidence)`);
      });
    }

    // Automations
    if (context.automations && context.automations.length > 0) {
      sections.push('\n## Automations Involving This Device');
      context.automations.forEach((auto) => {
        const status = auto.enabled ? 'Enabled' : 'Disabled';
        sections.push(`- **${auto.name}** (${status}): ${auto.description || 'No description'}`);
      });
    }

    // System Status
    if (context.systemStatus) {
      sections.push('\n## System Status Overview');
      sections.push(`- **Total Devices**: ${context.systemStatus.totalDevices}`);
      sections.push(`- **Healthy**: ${context.systemStatus.healthyDevices}`);
      sections.push(`- **Warnings**: ${context.systemStatus.warningDevices}`);
      sections.push(`- **Critical/Offline**: ${context.systemStatus.criticalDevices}`);

      if (context.systemStatus.recentIssues.length > 0) {
        sections.push('\n**Recent Issues**:');
        context.systemStatus.recentIssues.forEach((issue) => {
          sections.push(`  - ${issue}`);
        });
      }
    }

    return sections.join('\n');
  }

  /**
   * Generate human-readable summary.
   *
   * @param context Diagnostic context
   * @returns Summary string
   */
  private generateSummary(context: DiagnosticContext): string {
    if (context.device) {
      const deviceName = context.device.label || context.device.name;
      const status = context.healthData?.status || 'unknown';

      return `Diagnostic data gathered for ${deviceName} (status: ${status})`;
    }

    if (context.systemStatus) {
      return `System-wide status: ${context.systemStatus.healthyDevices}/${context.systemStatus.totalDevices} devices healthy`;
    }

    return 'Diagnostic data gathered successfully';
  }

  /**
   * Generate troubleshooting recommendations.
   *
   * Design Decision: Rule-based recommendations
   * Rationale: Simple rules cover 80% of common issues. LLM can elaborate
   * on these recommendations using full diagnostic context.
   *
   * @param context Diagnostic context
   * @returns Array of recommendations
   */
  private generateRecommendations(context: DiagnosticContext): string[] {
    const recommendations: string[] = [];

    // Offline device recommendations
    if (context.healthData && !context.healthData.online) {
      recommendations.push('Check device power supply and network connectivity');
      recommendations.push('Verify SmartThings hub is online and accessible');
    }

    // Low battery recommendations
    if (context.healthData?.batteryLevel && context.healthData.batteryLevel < 20) {
      recommendations.push(`Battery level is low (${context.healthData.batteryLevel}%). Replace battery soon.`);
    }

    // Event gap recommendations
    if (context.relatedIssues?.some((issue) => issue.type === 'connectivity_gap')) {
      recommendations.push('Detected connectivity gaps. Check network stability and hub logs.');
    }

    // Rapid changes recommendations
    if (context.relatedIssues?.some((issue) => issue.type === 'rapid_changes')) {
      recommendations.push('Detected rapid state changes. Check for automation loops or faulty sensors.');
    }

    return recommendations;
  }

  /**
   * Resolve device from entities.
   *
   * Resolution Priority:
   * 1. Exact deviceId match (O(1))
   * 2. Semantic search by deviceName (O(log n))
   * 3. DeviceRegistry fuzzy match (O(n))
   *
   * @param entities Intent entities
   * @returns Resolved device or undefined
   */
  private async resolveDevice(entities: any): Promise<UnifiedDevice | undefined> {
    // Try exact ID first
    if (entities.deviceId) {
      const device = this.deviceRegistry.getDevice(entities.deviceId);
      if (device) {
        logger.debug('Device resolved by exact ID', { deviceId: entities.deviceId });
        return device;
      }
    }

    // Try semantic search
    if (entities.deviceName) {
      const results = await this.semanticIndex.searchDevices(entities.deviceName, {
        limit: 1,
        minSimilarity: 0.7,
      });

      if (results.length > 0) {
        const firstResult = results[0];
        if (firstResult && firstResult.deviceId) {
          const deviceId = toUniversalId(firstResult.deviceId);
          const device = this.deviceRegistry.getDevice(deviceId);
          if (device) {
            logger.debug('Device resolved by semantic search', {
              deviceName: entities.deviceName,
              deviceId,
              similarity: firstResult.score,
            });
            return device;
          }
        }
      }

      // Fallback to DeviceRegistry fuzzy match
      const resolution = this.deviceRegistry.resolveDevice(entities.deviceName);
      if (resolution) {
        logger.debug('Device resolved by fuzzy match', {
          deviceName: entities.deviceName,
          matchType: resolution.matchType,
          confidence: resolution.confidence,
        });
        return resolution.device;
      }
    }

    logger.warn('Failed to resolve device', { entities });
    return undefined;
  }

  /**
   * Get device health data.
   *
   * @param deviceId Device ID
   * @returns Health data with type marker
   */
  private async getDeviceHealth(deviceId: DeviceId): Promise<{ type: string; value: DeviceHealthData }> {
    try {
      const device = this.deviceRegistry.getDevice(toUniversalId(deviceId));
      const status = await this.deviceService.getDeviceStatus(deviceId);

      // Extract battery level from components if available
      const mainComponent = status.components?.['main'];
      const batteryComponent = mainComponent ? mainComponent['battery'] : undefined;
      const batteryLevel = batteryComponent ? batteryComponent['value'] : undefined;

      return {
        type: 'health',
        value: {
          status: device?.online ? 'online' : 'offline',
          batteryLevel: typeof batteryLevel === 'number' ? batteryLevel : undefined,
          online: device?.online ?? false,
          lastActivity: device?.lastSeen?.toISOString(),
          currentState: status.components?.['main'],
        },
      };
    } catch (error) {
      logger.error('Failed to get device health', {
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get recent device events.
   *
   * @param deviceId Device ID
   * @param limit Maximum events to retrieve
   * @returns Event list with type marker
   */
  private async getRecentEvents(
    deviceId: DeviceId,
    limit: number
  ): Promise<{ type: string; value: DeviceEvent[] }> {
    try {
      const result = await this.deviceService.getDeviceEvents(deviceId, {
        deviceId,
        limit,
        includeMetadata: false, // Minimize overhead
      });

      return {
        type: 'events',
        value: result.events,
      };
    } catch (error) {
      logger.error('Failed to get recent events', {
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Find similar devices.
   *
   * @param deviceId Device ID
   * @param limit Maximum similar devices
   * @returns Similar devices with type marker
   */
  private async findSimilarDevices(
    deviceId: string,
    limit: number
  ): Promise<{ type: string; value: DeviceSearchResult[] }> {
    try {
      const device = this.deviceRegistry.getDevice(toUniversalId(deviceId));
      if (!device) {
        return { type: 'similar', value: [] };
      }

      const results = await this.semanticIndex.searchDevices(
        `devices like ${device.label || device.name}`,
        { limit: limit + 1 } // +1 to account for self-match
      );

      // Filter out self
      const filtered = results.filter((r) => r.deviceId !== deviceId);

      return {
        type: 'similar',
        value: filtered.slice(0, limit),
      };
    } catch (error) {
      logger.error('Failed to find similar devices', {
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Detect issue patterns in event history.
   *
   * Future Enhancement: Implement pattern detection algorithms
   * Currently returns placeholder.
   *
   * @param _deviceId Device ID (unused in current implementation)
   * @returns Issue patterns with type marker
   */
  private async detectPatterns(_deviceId: DeviceId): Promise<{ type: string; value: IssuePattern[] }> {
    // Placeholder: Pattern detection not yet implemented
    return {
      type: 'patterns',
      value: [],
    };
  }

  /**
   * Get system-wide status.
   *
   * @returns System status report with type marker
   */
  private async getSystemStatus(): Promise<{ type: string; value: SystemStatusReport }> {
    try {
      const allDevices = this.deviceRegistry.getAllDevices();
      const totalDevices = allDevices.length;
      const healthyDevices = allDevices.filter((d) => d.online).length;
      const criticalDevices = allDevices.filter((d) => !d.online).length;

      return {
        type: 'systemStatus',
        value: {
          totalDevices,
          healthyDevices,
          warningDevices: 0, // Placeholder: warning detection not implemented
          criticalDevices,
          recentIssues: [],
        },
      };
    } catch (error) {
      logger.error('Failed to get system status', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Count total data points gathered.
   *
   * Used for logging/metrics.
   *
   * @param context Diagnostic context
   * @returns Number of data points
   */
  private countDataPoints(context: DiagnosticContext): number {
    let count = 0;
    if (context.device) count++;
    if (context.healthData) count++;
    if (context.recentEvents) count += context.recentEvents.length;
    if (context.similarDevices) count += context.similarDevices.length;
    if (context.relatedIssues) count += context.relatedIssues.length;
    if (context.automations) count += context.automations.length;
    if (context.systemStatus) count++;
    return count;
  }
}
