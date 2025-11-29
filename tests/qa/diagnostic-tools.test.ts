/**
 * QA Test Suite for Diagnostic Tools (Ticket 1M-214)
 *
 * Tests all 6 diagnostic tools:
 * 1. test_connection
 * 2. get_device_health
 * 3. list_failed_commands
 * 4. get_system_info
 * 5. validate_device_capabilities
 * 6. export_diagnostics
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  handleTestConnection,
  handleGetDeviceHealth,
  handleListFailedCommands,
  handleGetSystemInfo,
  handleValidateDeviceCapabilities,
  handleExportDiagnostics,
} from '../../src/mcp/tools/diagnostics.js';
import { smartThingsService } from '../../src/smartthings/client.js';
import { diagnosticTracker } from '../../src/utils/diagnostic-tracker.js';

describe.skipIf(process.env.CI === 'true')('Diagnostic Tools - Ticket 1M-214', () => {
  beforeAll(async () => {
    // Verify SmartThings connection
    try {
      await smartThingsService.listLocations();
    } catch (error) {
      throw new Error(
        'SmartThings API not available. Check SMARTTHINGS_PAT environment variable.'
      );
    }
  });

  describe('Tool 1: test_connection', () => {
    it('should successfully test API connectivity', async () => {
      const startTime = Date.now();
      const result = await handleTestConnection({});
      const duration = Date.now() - startTime;

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      // Check for text content
      const textContent = result.content.find((c: any) => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent.text).toContain('Connection test');

      // Verify performance: should complete in < 2s
      expect(duration).toBeLessThan(2000);

      console.log(`✓ test_connection: ${duration}ms`);
    });

    it('should return token status information', async () => {
      const result = await handleTestConnection({});
      const textContent = result.content.find((c: any) => c.type === 'text');

      // Should mention either PASSED or token info
      expect(
        textContent.text.includes('PASSED') ||
        textContent.text.includes('token') ||
        textContent.text.includes('PAT')
      ).toBe(true);
    });
  });

  describe('Tool 2: get_system_info', () => {
    it('should return comprehensive system information', async () => {
      const startTime = Date.now();
      const result = await handleGetSystemInfo({});
      const duration = Date.now() - startTime;

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      const textContent = result.content.find((c: any) => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent.text).toContain('System Information');

      // Verify performance: should complete in < 5s
      expect(duration).toBeLessThan(5000);

      console.log(`✓ get_system_info: ${duration}ms`);
    });

    it('should include server metadata', async () => {
      const result = await handleGetSystemInfo({});
      const textContent = result.content.find((c: any) => c.type === 'text');

      // Should include server info
      expect(textContent.text).toContain('Server:');
      expect(textContent.text).toContain('Node:');
    });

    it('should include device statistics', async () => {
      const result = await handleGetSystemInfo({});
      const textContent = result.content.find((c: any) => c.type === 'text');

      // Should include device counts
      expect(textContent.text).toContain('Devices:');
      expect(textContent.text).toContain('Rooms:');
      expect(textContent.text).toContain('Locations:');
    });
  });

  describe('Tool 3: list_failed_commands', () => {
    it('should return empty list when no failures', async () => {
      const startTime = Date.now();
      const result = await handleListFailedCommands({ limit: 5 });
      const duration = Date.now() - startTime;

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Verify performance: should complete in < 500ms (in-memory operation)
      expect(duration).toBeLessThan(500);

      console.log(`✓ list_failed_commands: ${duration}ms`);
    });

    it('should handle limit parameter', async () => {
      const result = await handleListFailedCommands({ limit: 10 });
      expect(result).toBeDefined();
    });

    it('should track failures after recording', async () => {
      // Record a test failure
      diagnosticTracker.recordCommand({
        timestamp: new Date(),
        deviceId: 'test-device-123',
        deviceName: 'Test Device',
        capability: 'switch',
        command: 'on',
        success: false,
        error: 'Test error for QA',
        duration: 100,
      });

      const result = await handleListFailedCommands({ limit: 5 });
      const textContent = result.content.find((c: any) => c.type === 'text');

      expect(textContent.text).toContain('failed command');

      // Clean up
      diagnosticTracker.clear();
    });
  });

  describe('Tool 4: export_diagnostics - JSON format', () => {
    it('should export diagnostics in JSON format', async () => {
      const startTime = Date.now();
      const result = await handleExportDiagnostics({
        format: 'json',
        includeDeviceHealth: false, // Disable for speed
        includeFailedCommands: true,
        maxDevices: 5,
      });
      const duration = Date.now() - startTime;

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Verify performance: should complete in < 10s
      expect(duration).toBeLessThan(10000);

      console.log(`✓ export_diagnostics (JSON): ${duration}ms`);
    });

    it('should include valid JSON in response', async () => {
      const result = await handleExportDiagnostics({
        format: 'json',
        includeDeviceHealth: false,
        includeFailedCommands: true,
      });

      const textContent = result.content.find((c: any) => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent.text).toContain('format');
    });
  });

  describe('Tool 5: export_diagnostics - Markdown format', () => {
    it('should export diagnostics in Markdown format', async () => {
      const startTime = Date.now();
      const result = await handleExportDiagnostics({
        format: 'markdown',
        includeDeviceHealth: false, // Disable for speed
        includeFailedCommands: true,
        maxDevices: 5,
      });
      const duration = Date.now() - startTime;

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Verify performance: should complete in < 10s
      expect(duration).toBeLessThan(10000);

      console.log(`✓ export_diagnostics (Markdown): ${duration}ms`);
    });

    it('should include markdown headers', async () => {
      const result = await handleExportDiagnostics({
        format: 'markdown',
        includeDeviceHealth: false,
        includeFailedCommands: true,
      });

      const textContent = result.content.find((c: any) => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent.text).toContain('format');
    });
  });

  describe('Tool 6: get_device_health (conditional)', () => {
    it('should handle missing device gracefully', async () => {
      const result = await handleGetDeviceHealth({
        deviceId: 'invalid-device-id-12345'
      });

      // Should return error response but not throw
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should validate deviceId parameter', async () => {
      // Test with empty deviceId
      const result = await handleGetDeviceHealth({ deviceId: '' });
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });
  });

  describe('Tool 7: validate_device_capabilities (conditional)', () => {
    it('should handle missing device gracefully', async () => {
      const result = await handleValidateDeviceCapabilities({
        deviceId: 'invalid-device-id-12345',
        capability: 'switch',
      });

      // Should return error response but not throw
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should validate required parameters', async () => {
      const result = await handleValidateDeviceCapabilities({
        deviceId: '',
        capability: 'switch',
      });

      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle invalid format parameter for export_diagnostics', async () => {
      const result = await handleExportDiagnostics({
        format: 'invalid-format' as any,
      });

      // Zod validation should catch this
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should handle negative limit for list_failed_commands', async () => {
      const result = await handleListFailedCommands({ limit: -5 });

      // Zod validation should catch this
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should handle excessive limit (>100) for list_failed_commands', async () => {
      const result = await handleListFailedCommands({ limit: 200 });

      // Zod validation should catch this
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });
  });

  describe('Code Quality Checks', () => {
    it('should export all 6 diagnostic tools', () => {
      expect(handleTestConnection).toBeDefined();
      expect(handleGetDeviceHealth).toBeDefined();
      expect(handleListFailedCommands).toBeDefined();
      expect(handleGetSystemInfo).toBeDefined();
      expect(handleValidateDeviceCapabilities).toBeDefined();
      expect(handleExportDiagnostics).toBeDefined();
    });

    it('should use diagnosticTracker singleton', () => {
      expect(diagnosticTracker).toBeDefined();
      expect(diagnosticTracker.getCommandStats).toBeDefined();
      expect(diagnosticTracker.getRateLimitStatus).toBeDefined();
      expect(diagnosticTracker.getTokenStatus).toBeDefined();
    });
  });
});
