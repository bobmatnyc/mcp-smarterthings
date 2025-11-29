# Integration Tests Workflow Setup

**Ticket**: 1M-311 (Related)
**Created**: 2025-11-29
**Status**: Implemented

## Overview

This document describes the GitHub Actions workflow for running integration tests automatically on every push and pull request.

## Workflow File

**Location**: `.github/workflows/integration-tests.yml`

## Triggers

The integration tests workflow runs on:

1. **Push to main** - Validates code merged to main branch
2. **Pull requests** - Runs on all PRs to prevent regressions
3. **Manual trigger** - Can be run on-demand via GitHub Actions UI
4. **Daily schedule** - Runs at 2 AM UTC to catch integration issues

## Workflow Jobs

### 1. Integration Tests Job

**Purpose**: Run full test suite across multiple Node.js versions

**Matrix Strategy**:
- Node.js 18.x
- Node.js 20.x
- Fail-fast disabled (tests all versions even if one fails)

**Steps**:
1. Checkout code
2. Setup pnpm package manager
3. Setup Node.js with cache
4. Install dependencies (frozen lockfile)
5. Build project (TypeScript compilation)
6. Run integration tests in CI mode
7. Upload test results as artifacts
8. Generate test summary in GitHub UI

**Environment Variables**:
- `CI=true` - Ensures non-interactive test execution
- `NODE_ENV=test` - Test environment configuration
- `SMARTTHINGS_PAT` - Uses GitHub secret if available, falls back to test token
- `LOG_LEVEL=error` - Reduces log noise in CI

**Artifacts**:
- Test results uploaded with 7-day retention
- Coverage reports (if generated)
- Test logs

### 2. Test Coverage Report Job

**Purpose**: Generate and upload coverage reports for PRs

**Dependencies**: Runs after integration-tests job succeeds

**Triggers**: Only runs on pull requests

**Steps**:
1. Checkout code
2. Setup environment
3. Install dependencies
4. Build project
5. Run tests with coverage
6. Upload coverage to Codecov
7. Comment PR with coverage metrics

**Coverage Metrics**:
- Lines coverage
- Statements coverage
- Functions coverage
- Branches coverage

### 3. Verify Fixtures Job

**Purpose**: Validate test fixtures and configuration

**Steps**:
1. Check for nock fixtures (HTTP mocking)
2. Verify test setup file exists
3. Confirm PAT fallback is configured

## Test Execution

### CI Mode

Tests run in CI-safe mode:
```bash
CI=true pnpm test
```

This ensures:
- No watch mode (prevents hanging processes)
- Non-interactive execution
- Proper process cleanup
- Deterministic behavior

### Test Categories

The workflow runs all test types:
1. **Unit Tests** - Component isolation tests
2. **Integration Tests** - End-to-end MCP protocol tests
3. **API Tests** - SmartThings API interaction tests
4. **Diagnostic Tests** - System health and troubleshooting tests

### Current Test Status

**As of 2025-11-29**:
- Total tests: 1175
- Passing: 1147 (97.6%)
- Skipped: 28
- Failing: 0 (in CI mode)
- Duration: ~15 seconds

## Environment Variables

### Required

- `NODE_ENV=test` - Set automatically by workflow

### Optional

- `SMARTTHINGS_PAT` - SmartThings Personal Access Token
  - Uses GitHub secret if configured: `${{ secrets.SMARTTHINGS_PAT }}`
  - Falls back to test token for CI
  - Tests use nock mocking, so real API not required

### Configuration

The test setup file (`tests/setup.ts`) provides fallback values:
```typescript
if (!process.env.SMARTTHINGS_PAT) {
  process.env.SMARTTHINGS_PAT = 'test-token-12345';
}
```

## Secrets Configuration

To use real API credentials in CI (optional):

1. Go to repository Settings > Secrets and variables > Actions
2. Add new repository secret:
   - Name: `SMARTTHINGS_PAT`
   - Value: Your SmartThings Personal Access Token
3. Workflow will automatically use it if available

**Note**: Not required! Tests use HTTP mocking (nock) and work without real credentials.

## Viewing Results

### GitHub Actions UI

1. Navigate to repository > Actions tab
2. Select "Integration Tests" workflow
3. View run history and details
4. Download artifacts if needed

### Pull Request Checks

- Integration tests appear as required checks on PRs
- Test status shows in PR conversation
- Coverage report commented automatically
- Test summary visible in workflow run

### Test Summary

Workflow generates markdown summary with:
- Node.js version tested
- Test execution status
- Coverage metrics (if available)
- Test categories validated

## Troubleshooting

### Test Failures

If tests fail in CI but pass locally:

1. **Check environment variables** - CI uses different env setup
2. **Verify build** - Ensure `pnpm run build:tsc` succeeds
3. **Check Node version** - CI tests Node 18.x and 20.x
4. **Review logs** - Download test artifacts for detailed logs

### Common Issues

**Issue**: Tests hang or timeout
- **Cause**: Watch mode enabled
- **Solution**: Workflow uses `CI=true` to prevent watch mode

**Issue**: SMARTTHINGS_PAT errors
- **Cause**: Missing environment variable
- **Solution**: Test setup provides fallback token

**Issue**: Coverage upload fails
- **Cause**: Codecov token not configured
- **Solution**: Workflow continues even if upload fails (`fail_ci_if_error: false`)

### Manual Workflow Trigger

To run tests manually:

1. Go to Actions > Integration Tests
2. Click "Run workflow" button
3. Select branch
4. Click "Run workflow"

## Comparison with Existing CI

### Existing `ci.yml` Workflow

The existing CI workflow (`.github/workflows/ci.yml`) provides:
- Type checking
- Linting
- Format checking
- Test execution
- Build verification

### New `integration-tests.yml` Workflow

The new workflow provides:
- **Focused integration testing**
- **Daily regression checks**
- **Manual trigger capability**
- **Detailed test summaries**
- **PR coverage comments**
- **Fixture validation**

### Relationship

Both workflows complement each other:
- `ci.yml` - Fast feedback on code quality
- `integration-tests.yml` - Comprehensive test coverage
- Both run on push/PR for maximum safety

## Performance

**Workflow Duration**: ~15-20 minutes total
- Integration tests: ~15 seconds per Node version
- Setup/build: ~2-3 minutes
- Coverage: ~20 seconds
- Matrix parallelization: Both Node versions run simultaneously

**Resource Usage**:
- Runner: ubuntu-latest
- Memory: Standard GitHub Actions runner
- Disk: Coverage and artifacts stored for 7 days

## Future Enhancements

Potential improvements:

1. **Separate test types** - Split unit/integration into separate jobs
2. **Test sharding** - Parallelize test execution for speed
3. **Visual regression** - Add screenshot comparison tests
4. **Performance benchmarks** - Track test execution time trends
5. **Flaky test detection** - Re-run flaky tests automatically

## Success Criteria

Workflow is successful when:

- ✅ Tests run on every push/PR
- ✅ 1147+ tests pass in CI
- ✅ Test results uploaded as artifacts
- ✅ Coverage reports generated
- ✅ No hanging processes
- ✅ Fast feedback (<5 minutes for test job)
- ✅ Clear error messages on failure

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vitest CI Documentation](https://vitest.dev/guide/ci.html)
- [pnpm CI Documentation](https://pnpm.io/continuous-integration)
- Related ticket: [1M-311 - Integration Test Implementation](../qa/integration-test-verification-1m-311.md)

## Design Decisions

### Why Separate Workflow?

**Rationale**: Separation of concerns and flexibility
- Main CI focuses on fast feedback (lint, typecheck, basic tests)
- Integration workflow focuses on comprehensive testing
- Allows different trigger strategies (daily schedule for integration)
- Easier to configure different environments/secrets

**Trade-offs**:
- **Pro**: Clear separation, flexible scheduling, easier debugging
- **Con**: Slight duplication in setup steps
- **Conclusion**: Benefits outweigh minimal duplication

### Why Matrix Testing?

**Rationale**: Ensure compatibility across Node.js versions
- Project supports Node 18+ (engines requirement)
- Tests both minimum and recommended versions
- Fail-fast disabled to catch version-specific issues

### Why Nock Mocking?

**Rationale**: Reliable CI without external dependencies
- Tests don't require live SmartThings API
- Consistent test results (no flakiness from API changes)
- Faster execution (no network latency)
- Works in any CI environment

**Implementation**: See `tests/setup.ts` for mock configuration

## Maintenance

**Workflow Updates**: Update version numbers in:
- `pnpm/action-setup@v4` - pnpm version
- `actions/checkout@v4` - Checkout action
- `actions/setup-node@v4` - Node.js setup
- `actions/upload-artifact@v4` - Artifact upload

**Test Updates**: When adding new test types:
1. Ensure they run in CI mode
2. Add to test summary generation
3. Update this documentation

**Secret Rotation**: If using SMARTTHINGS_PAT secret:
- Rotate token periodically
- Update GitHub secret when changed
- Tests continue working with fallback token if secret expires
