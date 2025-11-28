/**
 * Version information for mcp-smarterthings
 * This file is automatically updated during the release process
 */

// Version is synchronized with package.json during release
export const VERSION = '0.7.1';

// Build metadata (updated by build scripts)
export const BUILD_INFO = {
  version: VERSION,
  buildDate: '2025-11-28T07:32:26Z',
  gitCommit: 'a4210b38f1f953cb99d7ce1be78025169e147148',
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
