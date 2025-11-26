import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createMcpError,
  isMcpError,
  classifyError,
} from '../../src/utils/error-handler.js';
import { ERROR_CODES } from '../../src/config/constants.js';

describe('Error Handler', () => {
  describe('createMcpError', () => {
    it('should create error response from Error object', () => {
      const error = new Error('Test error message');
      const result = createMcpError(error, ERROR_CODES.UNKNOWN_ERROR);

      expect(result.isError).toBe(true);
      expect(result.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.text).toContain('Test error message');
      expect(result.details).toHaveProperty('stack');
    });

    it('should create error response from Zod validation error', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      try {
        schema.parse({ name: 'John' }); // Missing age
      } catch (error) {
        const result = createMcpError(error, ERROR_CODES.VALIDATION_ERROR);

        expect(result.isError).toBe(true);
        expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
        expect(result.content).toHaveLength(1);
        expect(result.content[0]?.text).toContain('Validation error');
        expect(result.details).toHaveProperty('validationErrors');
      }
    });

    it('should create error response from string', () => {
      const result = createMcpError('Simple error string', ERROR_CODES.UNKNOWN_ERROR);

      expect(result.isError).toBe(true);
      expect(result.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.text).toContain('Simple error string');
    });
  });

  describe('isMcpError', () => {
    it('should return true for valid MCP error', () => {
      const error = {
        isError: true,
        code: 'TEST_ERROR',
        content: [{ type: 'text' as const, text: 'Test message' }],
      };

      expect(isMcpError(error)).toBe(true);
    });

    it('should return false for non-error objects', () => {
      expect(isMcpError({ isError: false })).toBe(false);
      expect(isMcpError({ code: 'TEST' })).toBe(false);
      expect(isMcpError('string')).toBe(false);
      expect(isMcpError(null)).toBe(false);
      expect(isMcpError(undefined)).toBe(false);
    });
  });

  describe('classifyError', () => {
    it('should classify Zod errors as VALIDATION_ERROR', () => {
      const schema = z.string();
      try {
        schema.parse(123);
      } catch (error) {
        expect(classifyError(error)).toBe(ERROR_CODES.VALIDATION_ERROR);
      }
    });

    it('should classify "not found" errors', () => {
      const error = new Error('Device not found');
      expect(classifyError(error)).toBe(ERROR_CODES.DEVICE_NOT_FOUND);
    });

    it('should classify authentication errors', () => {
      const error1 = new Error('Unauthorized access');
      const error2 = new Error('Forbidden');

      expect(classifyError(error1)).toBe(ERROR_CODES.AUTHENTICATION_ERROR);
      expect(classifyError(error2)).toBe(ERROR_CODES.AUTHENTICATION_ERROR);
    });

    it('should classify network errors', () => {
      const error1 = new Error('Network timeout');
      const error2 = new Error('ECONNRESET');

      expect(classifyError(error1)).toBe(ERROR_CODES.NETWORK_ERROR);
      expect(classifyError(error2)).toBe(ERROR_CODES.NETWORK_ERROR);
    });

    it('should classify capability errors', () => {
      const error = new Error('Capability not supported');
      expect(classifyError(error)).toBe(ERROR_CODES.CAPABILITY_NOT_SUPPORTED);
    });

    it('should default to UNKNOWN_ERROR', () => {
      const error = new Error('Some random error');
      expect(classifyError(error)).toBe(ERROR_CODES.UNKNOWN_ERROR);
    });
  });
});
