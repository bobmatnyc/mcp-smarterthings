/**
 * Vitest global test setup.
 *
 * Configures test environment and mocks for all test files.
 * MUST set environment variables BEFORE any imports happen.
 */

import { config } from 'dotenv';

// Load .env file for integration tests
config();

// Set test environment variables IMMEDIATELY (before any module imports)
process.env.NODE_ENV = 'test';
// Use real PAT for integration tests if available, otherwise use mock
if (!process.env.SMARTTHINGS_PAT) {
  process.env.SMARTTHINGS_PAT = 'test-token-12345';
}
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests

import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Already set above
});

afterAll(() => {
  // Cleanup after all tests
});
