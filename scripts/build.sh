#!/bin/bash
# Build script for mcp-smarterthings
# Handles full production builds with pre-build validation and post-build verification

set -e  # Exit on error
set -o pipefail  # Pipe failures cause script to fail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to project root
cd "$PROJECT_ROOT"

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Build modes
BUILD_MODE="${1:-production}"
SKIP_VALIDATION="${SKIP_VALIDATION:-false}"
SKIP_TESTS="${SKIP_TESTS:-false}"

log_info "Starting build process (mode: $BUILD_MODE)..."

# Pre-build validation
if [ "$SKIP_VALIDATION" != "true" ]; then
  log_info "Running pre-build validation..."

  # Type checking
  log_info "Running type check..."
  if ! pnpm run typecheck; then
    log_error "Type checking failed!"
    exit 1
  fi
  log_success "Type checking passed"

  # Linting
  log_info "Running linter..."
  if ! pnpm run lint; then
    log_error "Linting failed!"
    exit 1
  fi
  log_success "Linting passed"

  # Tests (unless skipped)
  if [ "$SKIP_TESTS" != "true" ]; then
    log_info "Running tests..."
    if ! pnpm test; then
      log_error "Tests failed!"
      exit 1
    fi
    log_success "Tests passed"
  else
    log_warning "Tests skipped (SKIP_TESTS=true)"
  fi
else
  log_warning "Pre-build validation skipped (SKIP_VALIDATION=true)"
fi

# Clean previous build
log_info "Cleaning previous build artifacts..."
rm -rf dist/
log_success "Build artifacts cleaned"

# Update build metadata
log_info "Updating build metadata..."
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Update version.ts with build metadata
if [ -f "src/version.ts" ]; then
  # Read current version from package.json
  VERSION=$(node -p "require('./package.json').version")

  # Create temporary version file with build info
  cat > src/version.ts << EOF
/**
 * Version information for mcp-smarterthings
 * This file is automatically updated during the release process
 */

// Version is synchronized with package.json during release
export const VERSION = '$VERSION';

// Build metadata (updated by build scripts)
export const BUILD_INFO = {
  version: VERSION,
  buildDate: '$(date -u +"%Y-%m-%dT%H:%M:%SZ")',
  gitCommit: '$GIT_COMMIT',
  gitBranch: '$GIT_BRANCH',
} as const;

/**
 * Get formatted version string with build info
 */
export function getVersionString(): string {
  return \`\${VERSION} (\${BUILD_INFO.gitCommit.substring(0, 7)})\`;
}

/**
 * Get full version information
 */
export function getFullVersionInfo(): typeof BUILD_INFO {
  return BUILD_INFO;
}
EOF
  log_success "Build metadata updated"
fi

# Build
log_info "Building TypeScript project..."
if ! pnpm run build:tsc; then
  log_error "Build failed!"
  exit 1
fi
log_success "TypeScript build completed"

# Post-build verification
log_info "Verifying build artifacts..."

# Check if dist directory exists
if [ ! -d "dist" ]; then
  log_error "dist/ directory not found!"
  exit 1
fi

# Check for main entry point
if [ ! -f "dist/index.js" ]; then
  log_error "dist/index.js not found!"
  exit 1
fi

# Check for type declarations
if [ ! -f "dist/index.d.ts" ]; then
  log_warning "dist/index.d.ts not found (type declarations missing)"
fi

# Check for MCP files
if [ ! -d "dist/mcp" ]; then
  log_warning "dist/mcp/ directory not found"
fi

# Verify dist directory size
DIST_SIZE=$(du -sh dist | cut -f1)
log_info "Build size: $DIST_SIZE"

# Count build artifacts
JS_FILES=$(find dist -name "*.js" | wc -l | tr -d ' ')
DTS_FILES=$(find dist -name "*.d.ts" | wc -l | tr -d ' ')
MAP_FILES=$(find dist -name "*.map" | wc -l | tr -d ' ')

log_info "Build artifacts: $JS_FILES JS files, $DTS_FILES declaration files, $MAP_FILES source maps"

log_success "Build verification completed"

# Track build
if [ -f "$SCRIPT_DIR/build-tracker.sh" ]; then
  log_info "Recording build metadata..."
  bash "$SCRIPT_DIR/build-tracker.sh" record
fi

log_success "Build completed successfully!"
echo ""
log_info "Build summary:"
echo "  - Version: $VERSION"
echo "  - Commit: $GIT_COMMIT"
echo "  - Branch: $GIT_BRANCH"
echo "  - Artifacts: $JS_FILES JS files, $DTS_FILES declaration files"
echo "  - Size: $DIST_SIZE"
