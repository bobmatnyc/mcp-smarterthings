/**
 * Version information for mcp-smarterthings
 * This file is automatically updated during the release process
 */

// Version is synchronized with package.json during release
export const VERSION = '0.6.1';

// Build metadata (updated by build scripts)
export const BUILD_INFO = {
  version: VERSION,
  buildDate: '2025-11-27T02:29:35Z',
  gitCommit: '80e0ccd43a7f9dc8d9373f79330f1b8c1678cdb5',
  gitBranch: 'main',
} as const;

/**
 * Get formatted version string with build info
 */
export function getVersionString(): string {
  return `${VERSION} (${BUILD_INFO.gitCommit.substring(0, 7)})`;
}

/**
 * Get full version information
 */
export function getFullVersionInfo(): typeof BUILD_INFO {
  return BUILD_INFO;
}
