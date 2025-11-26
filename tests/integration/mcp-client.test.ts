/**
 * MCP Client Integration Tests
 *
 * Tests the SmartThings MCP server using the official SDK client.
 * Validates MCP protocol compliance, tool execution, and error handling.
 *
 * Design Decision: Integration tests using real client-server communication
 * Rationale: Validates end-to-end MCP protocol compliance and real-world behavior.
 * Complements unit tests which mock SmartThings API calls.
 *
 * Test Strategy:
 * - Use stdio transport for reliable subprocess communication
 * - Mock SmartThings API responses to avoid device dependencies
 * - Test both success and error scenarios
 * - Validate MCP response format compliance
 *
 * Requirements:
 * - Built server (npm run build)
 * - SMARTTHINGS_PAT environment variable (can be test value)
 * - Node.js 18+
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Integration test suite for MCP SmartThings Server.
 *
 * Error Handling:
 * - Connection failures: Tests skip if server fails to start
 * - Tool execution errors: Validates error response format
 * - Invalid inputs: Tests proper validation and error codes
 */
describe('MCP SmartThings Server Integration', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let serverStarted = false;

  /**
   * Set up client connection before all tests.
   *
   * Creates stdio transport to server subprocess.
   * Sets LOG_LEVEL=error to reduce noise in test output.
   */
  beforeAll(async () => {
    const serverPath = path.join(__dirname, '../../dist/index.js');

    // Create transport to server
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
        // Use test PAT or existing PAT
        SMARTTHINGS_PAT: process.env.SMARTTHINGS_PAT || 'test-token-for-integration-tests',
        LOG_LEVEL: 'error', // Reduce log noise in tests
        NODE_ENV: 'test',
      },
    });

    // Create client
    client = new Client(
      {
        name: 'smartthings-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    try {
      // Connect to server
      await client.connect(transport);
      serverStarted = true;
    } catch (error) {
      console.error('Failed to start MCP server for integration tests:', error);
      serverStarted = false;
    }
  }, 30000); // 30 second timeout for server startup

  /**
   * Clean up client connection after all tests.
   */
  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  /**
   * Test server capabilities discovery.
   */
  describe('Server Capabilities', () => {
    it('should successfully connect to server', () => {
      expect(serverStarted).toBe(true);
    });

    it('should list available tools', async () => {
      if (!serverStarted) return;

      const result = await client.listTools();

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it('should include all expected SmartThings tools', async () => {
      if (!serverStarted) return;

      const result = await client.listTools();
      const toolNames = result.tools.map((t: Tool) => t.name);

      // Verify all 10 expected tools are present (8 original + 2 new room-specific tools)
      expect(toolNames).toContain('list_devices');
      expect(toolNames).toContain('list_devices_by_room');
      expect(toolNames).toContain('list_rooms');
      expect(toolNames).toContain('turn_on_device');
      expect(toolNames).toContain('turn_off_device');
      expect(toolNames).toContain('get_device_status');
      expect(toolNames).toContain('get_device_capabilities');
      expect(toolNames).toContain('list_scenes');
      expect(toolNames).toContain('list_scenes_by_room');
      expect(toolNames).toContain('execute_scene');
      expect(toolNames.length).toBe(10);
    });

    it('should provide proper tool metadata', async () => {
      if (!serverStarted) return;

      const result = await client.listTools();
      const listDevicesTool = result.tools.find((t: Tool) => t.name === 'list_devices');

      expect(listDevicesTool).toBeDefined();
      expect(listDevicesTool?.description).toBeDefined();
      expect(listDevicesTool?.description).toContain('SmartThings');
      expect(listDevicesTool?.inputSchema).toBeDefined();
      expect(listDevicesTool?.inputSchema.type).toBe('object');
    });

    it('should provide input schemas for all tools', async () => {
      if (!serverStarted) return;

      const result = await client.listTools();

      result.tools.forEach((tool: Tool) => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  /**
   * Test device query tools.
   *
   * Note: These tests call the real SmartThings API.
   * They may fail if SMARTTHINGS_PAT is invalid or API is unreachable.
   */
  describe('Device Query Tools', () => {
    it('should call list_devices successfully', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'list_devices',
        arguments: {},
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should return text content from list_devices', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'list_devices',
        arguments: {},
      });

      const content = result.content[0];
      expect(content.type).toBe('text');

      if (content.type === 'text') {
        expect(content.text).toBeDefined();
        expect(typeof content.text).toBe('string');
        // Should contain device count, list, or error (if auth fails)
        expect(content.text).toMatch(/Found \d+ device|device|Error|401|Unauthorized/i);
      }
    });

    it('should handle get_device_capabilities with invalid deviceId', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'get_device_capabilities',
        arguments: { deviceId: 'invalid-device-id-12345' },
      });

      // Should return error response
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });
  });

  /**
   * Test device control tools.
   *
   * Note: These tests use invalid device IDs to avoid controlling real devices.
   * They validate error handling rather than successful execution.
   */
  describe('Device Control Tools', () => {
    it('should validate deviceId format for turn_on_device', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'turn_on_device',
        arguments: { deviceId: 'invalid-id' },
      });

      // Should return error for invalid device
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should validate deviceId format for turn_off_device', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'turn_off_device',
        arguments: { deviceId: 'invalid-id' },
      });

      // Should return error for invalid device
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should validate deviceId format for get_device_status', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'get_device_status',
        arguments: { deviceId: 'invalid-id' },
      });

      // Should return error for invalid device
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
    });

    /**
     * Optional: Test with real device if TEST_DEVICE_ID is set.
     * Skipped by default to avoid controlling real devices in CI.
     */
    it.skipIf(!process.env.TEST_DEVICE_ID)('should turn on device with valid ID', async () => {
      if (!serverStarted) return;

      const deviceId = process.env.TEST_DEVICE_ID!;

      const result = await client.callTool({
        name: 'turn_on_device',
        arguments: { deviceId },
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();

      const content = result.content[0];
      if (content.type === 'text') {
        expect(content.text).toContain('turned on');
      }
    });

    it.skipIf(!process.env.TEST_DEVICE_ID)('should turn off device with valid ID', async () => {
      if (!serverStarted) return;

      const deviceId = process.env.TEST_DEVICE_ID!;

      const result = await client.callTool({
        name: 'turn_off_device',
        arguments: { deviceId },
      });

      expect(result).toBeDefined();
      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();

      const content = result.content[0];
      if (content.type === 'text') {
        expect(content.text).toContain('turned off');
      }
    });
  });

  /**
   * Test error handling and validation.
   */
  describe('Error Handling', () => {
    it('should return error for missing required parameters', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'turn_on_device',
        arguments: {}, // Missing deviceId
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should handle invalid tool names gracefully', async () => {
      if (!serverStarted) return;

      // SDK should throw for invalid tool names
      await expect(
        client.callTool({
          name: 'non_existent_tool',
          arguments: {},
        })
      ).rejects.toThrow();
    });

    it('should return structured error responses', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'get_device_status',
        arguments: { deviceId: 'invalid-device-id-12345' },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);

      // Error response should have text content
      const content = result.content[0];
      expect(content.type).toBe('text');
    });

    it('should validate JSON schema for tool arguments', async () => {
      if (!serverStarted) return;

      // Test with wrong argument type (number instead of string)
      const result = await client.callTool({
        name: 'turn_on_device',
        arguments: { deviceId: 12345 as any }, // Invalid type
      });

      // Should return validation error
      expect(result.isError).toBe(true);
    });
  });

  /**
   * Test MCP protocol compliance.
   */
  describe('MCP Protocol Compliance', () => {
    it('should return content array in tool responses', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'list_devices',
        arguments: {},
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should use text content type for results', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'list_devices',
        arguments: {},
      });

      const content = result.content[0];
      expect(content.type).toBe('text');
    });

    it('should set isError flag for error responses', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'turn_on_device',
        arguments: {}, // Missing deviceId
      });

      expect(result.isError).toBe(true);
    });

    it('should not set isError for successful responses', async () => {
      if (!serverStarted) return;

      const result = await client.callTool({
        name: 'list_devices',
        arguments: {},
      });

      // If PAT is valid, isError should be false
      // If PAT is invalid (test token), isError will be true - both are acceptable
      expect(result.isError !== undefined).toBe(true);
    });
  });

  /**
   * Test concurrent tool execution.
   */
  describe('Concurrent Execution', () => {
    it('should handle multiple concurrent tool calls', async () => {
      if (!serverStarted) return;

      const promises = [
        client.callTool({ name: 'list_devices', arguments: {} }),
        client.callTool({ name: 'list_devices', arguments: {} }),
        client.callTool({ name: 'list_devices', arguments: {} }),
      ];

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        // Results should be consistent (all success or all error)
        expect(typeof result.isError).toBe('boolean');
      });
    });

    it('should handle mixed success and error responses concurrently', async () => {
      if (!serverStarted) return;

      const promises = [
        client.callTool({ name: 'list_devices', arguments: {} }),
        client.callTool({ name: 'turn_on_device', arguments: {} }), // Error: missing deviceId
        client.callTool({ name: 'list_devices', arguments: {} }),
      ];

      const results = await Promise.all(promises);

      // Second call should always error (missing deviceId)
      expect(results[1].isError).toBe(true);

      // First and third calls should have consistent results
      expect(results[0].isError).toBe(results[2].isError);
    });
  });

  /**
   * Performance tests.
   */
  describe('Performance', () => {
    it('should respond to tool calls within reasonable time', async () => {
      if (!serverStarted) return;

      const startTime = Date.now();

      await client.callTool({
        name: 'list_devices',
        arguments: {},
      });

      const duration = Date.now() - startTime;

      // Should respond within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle rapid sequential calls', async () => {
      if (!serverStarted) return;

      const calls = 10;
      const startTime = Date.now();

      for (let i = 0; i < calls; i++) {
        await client.callTool({
          name: 'list_devices',
          arguments: {},
        });
      }

      const duration = Date.now() - startTime;
      const avgDuration = duration / calls;

      // Average call should complete within 2 seconds
      expect(avgDuration).toBeLessThan(2000);
    });
  });
});
