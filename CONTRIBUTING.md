# Contributing to mcp-smarterthings

Thank you for your interest in contributing to mcp-smarterthings! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [File Organization Standards](#file-organization-standards)
- [AI-Assisted Development](#ai-assisted-development)
- [Development Workflow](#development-workflow)
- [Commit Guidelines](#commit-guidelines)
- [Release Process](#release-process)
- [Testing](#testing)
- [Code Quality](#code-quality)

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 10.0.0
- Git

### Initial Setup

1. Fork and clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/mcp-smarterthings.git
cd mcp-smarterthings
```

2. Install dependencies:
```bash
make install
# or
pnpm install
```

3. Verify setup:
```bash
make verify
# or
pnpm run verify
```

You should now be ready to start development!

## File Organization Standards

**MANDATORY**: This project enforces strict file organization standards. All contributors must follow these conventions.

### Directory Structure

The project uses a standardized directory structure. Files MUST be placed in their designated locations:

#### Documentation Files
- **ALL documentation** → `/docs/` directory (NOT project root)
  - Research documentation → `/docs/research/`
  - API documentation → `/docs/api/`
  - Integration guides → `/docs/integration/`
  - Examples → `/docs/examples/`
  - User guides → `/docs/user/` (if applicable)

#### Test Files
- **ALL test files** → `/tests/` directory (NOT project root)
  - Unit tests → `/tests/unit/`
  - Integration tests → `/tests/integration/`
  - Test fixtures → `/tests/fixtures/`
  - Test utilities → `/tests/helpers/`

#### Scripts and Utilities
- Temporary scripts → `/scripts/`
- Build scripts → `/scripts/build/`
- Utility scripts → `/scripts/utils/`

#### Source Code
- Production code → `/src/`
- Type definitions → `/src/types/`
- Services → `/src/services/`
- MCP tools → `/src/mcp/tools/`

### File Placement Rules

**REQUIRED Standards:**

1. **No documentation in project root** except:
   - `README.md` (project overview)
   - `CONTRIBUTING.md` (this file)
   - `LICENSE` (project license)
   - `CHANGELOG.md` (auto-generated)

2. **No test files in project root**
   - All `.test.ts`, `.spec.ts` files go in `/tests/`
   - Test utilities go in `/tests/helpers/`

3. **No temporary files in project root**
   - Temporary scripts → `/scripts/temp/` or delete when done
   - Investigation scripts → `/scripts/investigate/`

4. **Research and design documents**
   - All research → `/docs/research/`
   - Design decisions → `/docs/design/` or `/docs/architecture/`
   - Include date in filename: `feature-name-YYYY-MM-DD.md`

### Linear Ticket Integration

When creating documentation related to specific features or issues:

1. **Attach documentation to Linear tickets** when applicable
2. **Reference ticket ID** in documentation headers:
   ```markdown
   # Feature Name

   **Linear Ticket**: [Ticket Title](https://linear.app/workspace/issue/ID)
   **Status**: In Progress
   ```

3. **Update ticket description** with links to generated documentation

### File Naming Conventions

- Use kebab-case for file names: `feature-name.md`, `module-name.ts`
- Include dates for timestamped docs: `research-topic-2025-11-28.md`
- Use descriptive names: `api-reference-event-retrieval.md` not `api-ref.md`
- Prefix executive summaries: `EXECUTIVE-SUMMARY-feature-name.md`
- Prefix comprehensive reports: `COMPREHENSIVE-feature-report.md`

### Enforcement

These standards are enforced through:
- Code review requirements
- CI/CD validation scripts
- Pre-commit hooks (future enhancement)

**Non-compliance will result in PR rejection.** Please reorganize files before submitting pull requests.

### Questions?

If you're unsure where a file should go, ask in your PR or create an issue. When in doubt, follow the pattern of similar existing files.

## AI-Assisted Development

This project supports AI-assisted development. If you're using Claude Code or similar AI tools:

- Review the `.claude/agents/` directory for agent-specific guidelines
- Follow the documentation standards when AI generates docs
- Ensure AI-generated code follows our quality standards
- Test AI-generated code thoroughly before committing

For detailed AI-assisted development guidelines, see the agent documentation in `.claude/agents/`.

## Development Workflow

### Quick Commands

We provide a comprehensive Makefile for all common operations:

```bash
make help              # Show all available commands
make dev               # Start development mode with watch
make build             # Build the project
make test              # Run tests
make lint              # Check code quality
make format            # Format code
make quality           # Run all quality checks
```

### Development Mode

Start the development server with watch mode:

```bash
make dev
# or
pnpm run dev
```

### Building

Build the project for production:

```bash
make build
# or
pnpm run build
```

The build script will:
1. Run type checking
2. Run linter
3. Run tests
4. Clean previous build
5. Build TypeScript
6. Verify build artifacts

### Testing

Run tests:

```bash
make test              # Run all tests
make test-unit         # Run unit tests only
make test-integration  # Run integration tests only
make test-coverage     # Run tests with coverage
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test changes
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes (dependencies, etc.)

### Examples

```bash
feat(devices): add support for temperature sensors
fix(auth): resolve token refresh issue
docs(readme): update installation instructions
refactor(api): simplify error handling
```

### Breaking Changes

For breaking changes, add `!` after the type and include `BREAKING CHANGE:` in the footer:

```bash
feat(api)!: redesign device control interface

BREAKING CHANGE: The device control API has been redesigned.
Previous method names have been deprecated.
```

## Release Process

We use semantic versioning (MAJOR.MINOR.PATCH) and automated release workflows.

### Automated Release (Recommended)

The easiest way to create a release:

```bash
# Auto-detect version bump from commits
make release-auto

# Or specify the bump type
make release-patch    # 1.0.0 -> 1.0.1 (bug fixes)
make release-minor    # 1.0.0 -> 1.1.0 (new features)
make release-major    # 1.0.0 -> 2.0.0 (breaking changes)
```

The release script will:
1. ✅ Verify working directory is clean
2. ✅ Run all quality checks (type check, lint, test)
3. ✅ Bump version in package.json and package-lock.json
4. ✅ Update CHANGELOG.md from conventional commits
5. ✅ Update src/version.ts
6. ✅ Build the project
7. ✅ Create git commit and tag
8. ✅ Push changes and tags
9. ✅ Publish to npm (if configured)

### Dry Run

Test the release process without making changes:

```bash
make release-dry-run
# or
DRY_RUN=true bash scripts/release.sh patch
```

### Manual Release

If you prefer manual control:

1. Check version status:
```bash
make version-status
```

2. Bump version:
```bash
pnpm run release:patch    # or minor/major
```

3. Build and test:
```bash
make verify
```

4. Push changes:
```bash
git push --follow-tags origin main
```

### Version Management

Check current version and status:

```bash
make version-current      # Show current version
make version-status       # Show version status and suggestions
make version-sync         # Sync version across all files
```

### Release Checklist

Before creating a release:

- [ ] All tests passing (`make test`)
- [ ] Code is properly formatted (`make format`)
- [ ] Code passes linting (`make lint`)
- [ ] Type checking passes (`make typecheck`)
- [ ] Documentation is updated
- [ ] CHANGELOG.md is accurate (generated automatically)
- [ ] Version number follows semver
- [ ] Git working directory is clean

## Testing

### Test Structure

```
tests/
├── unit/           # Unit tests
└── integration/    # Integration tests
```

### Writing Tests

We use Vitest for testing. Example:

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../src/myModule';

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Running Tests

```bash
make test              # Run all tests
make test-watch        # Watch mode
make test-coverage     # With coverage report
pnpm run test:unit     # Unit tests only
pnpm run test:integration  # Integration tests only
```

## Code Quality

We maintain high code quality standards with automated checks.

### Linting

```bash
make lint              # Check for linting errors
make lint-fix          # Auto-fix linting errors
```

### Formatting

```bash
make format            # Format all code
make format-check      # Check formatting without changes
```

### Type Checking

```bash
make typecheck         # Run TypeScript type checking
```

### Pre-commit Checks

Run all quality checks before committing:

```bash
make pre-commit
# Runs: format, lint-fix, test
```

### Quality Verification

Run comprehensive quality checks:

```bash
make quality           # Run typecheck, lint, and test
make verify            # Full verification (quality + build)
```

## Build System

### Build Tracking

The build system tracks build numbers and metadata:

```bash
make build-history     # Show build history
make build-latest      # Show latest build info
make build-clean       # Clean build artifacts
```

### Build Modes

```bash
make build             # Full production build
make build-dev         # Development build (skips validation)
make build-verify      # Verify build artifacts
```

## CI/CD

The project uses GitHub Actions for CI/CD:

- **CI Workflow** (`.github/workflows/ci.yml`): Runs on every push and PR
  - Type checking
  - Linting
  - Tests
  - Build verification

- **Release Workflow** (`.github/workflows/release.yml`): Runs on version tags
  - Build and test
  - Publish to npm
  - Create GitHub release

## Need Help?

- Check the [README.md](README.md) for project overview
- Review existing [issues](https://github.com/bobmatnyc/mcp-smarterthings/issues)
- Create a new issue for bugs or feature requests

## License

By contributing to mcp-smarterthings, you agree that your contributions will be licensed under the MIT License.
