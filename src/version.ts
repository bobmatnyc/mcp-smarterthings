/**
 * Version information for mcp-smarterthings
 * This file is automatically updated during the release process
 */

// Version is synchronized with package.json during release
export const VERSION = '0.7.2';

// Build metadata (updated by build scripts)
export const BUILD_INFO = {
  version: VERSION,
  buildDate: new Date().toISOString(),
  gitCommit: process.env['GIT_COMMIT'] || 'unknown',
  gitBranch: process.env['GIT_BRANCH'] || 'unknown',
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
