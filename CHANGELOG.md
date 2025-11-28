# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2025-11-28

### Added
- **Pattern Detection in Diagnostic Framework** ([#1M-307](https://linear.app/1m-hyperdev/issue/1M-307))
  - Implemented 4 pattern detection algorithms: rapid changes, automation triggers, connectivity gaps, normal patterns
  - Achieved 95%+ confidence on real-world automation detection (validated with Alcove Bar case)
  - Performance: <100ms for 100 events, <500ms end-to-end diagnostic workflow
  - 12/12 comprehensive test coverage with real-world validation
  - Enhanced recommendation generation with confidence-based specificity
  - Pattern types:
    - `rapid_changes`: Automation triggers (<5s gaps, 95% confidence) and rapid changes (5-10s gaps, 85% confidence)
    - `connectivity_gap`: Network/hub connectivity issues (>1h gaps, 80% confidence)
    - `normal`: No issues detected (95% confidence baseline)
  - Advanced features:
    - Odd-hour activity detection (1-5 AM) increases automation confidence to 98%
    - Motion sensor automation detection and recommendations
    - Automation loop detection (multiple rapid changes alert)
    - Graceful degradation on API errors or insufficient data
  - Comprehensive documentation:
    - Diagnostic Framework Overview (architecture, components, workflow)
    - Pattern Detection API Reference (algorithms, data types, examples)
    - Integration Guide (chatbot, CLI, MCP tools)
    - Troubleshooting Patterns Guide (user-facing, step-by-step fixes)
    - Quick Reference Card (one-page cheat sheet)

## [0.6.1] - 2025-11-26

### Added
- **Unified DeviceCapability System** (1M-241)
  - Single source of truth DeviceCapability enum with 27 capabilities
  - Comprehensive capability registry with platform mappings
  - Value conversion system for cross-platform compatibility
  - Support for 7 new capabilities:
    - DOOR_CONTROL (garage doors, gates)
    - BUTTON (wireless buttons, scene controllers)
    - PRESSURE_SENSOR (barometric pressure)
    - CO_DETECTOR (carbon monoxide detection)
    - SOUND_SENSOR (noise/audio detection)
    - ROBOT_VACUUM (robotic vacuum cleaners)
    - IR_BLASTER (infrared remote control)
  - Capability-specific documentation with 1300+ lines
  - Quick reference guide for all capabilities
  - Test coverage: 563 lines for capabilities, 540 lines for registry
- **Build and Release Automation**
  - Semantic versioning system with automated version management
  - Comprehensive build scripts (build.sh, version.sh, release.sh)
  - Build number tracking and git metadata integration
  - Makefile with standardized commands (build, test, deploy)
  - GitHub Actions CI/CD workflows
  - Pre-commit quality gates
  - Release documentation and guides
- **Enhanced Documentation**
  - Comprehensive README with project overview
  - CONTRIBUTING.md with development guidelines
  - BUILD_AND_RELEASE.md guide
  - VERSIONING_SYSTEM.md documentation
  - QUICK_REFERENCE.md for common tasks
  - RELEASE_GUIDE.md for maintainers

### Changed
- Enhanced DeviceCapability type system with platform-agnostic design
- Improved type safety across capability mappings
- Updated README with better project structure documentation

### Fixed
- Platform-specific capability mapping inconsistencies
- Type safety issues in capability registry

## [0.6.0] - 2025-11-26

### Added
- **Layer 2 Platform Abstraction** (1M-240)
  - PlatformRegistry with centralized adapter management
  - Dynamic adapter registration and lifecycle management
  - Platform routing system for multi-platform support
  - Adapter health monitoring and diagnostics
  - 808 lines of comprehensive tests for PlatformRegistry
- **SmartThings Adapter Implementation** (1M-239)
  - IDeviceAdapter interface with platform-agnostic design
  - Unified device types and capabilities
  - Command execution framework with type safety
  - Device state caching system
  - Comprehensive error handling with typed errors
  - 681 lines of adapter interface code
  - 616 lines of command executor implementation
  - 415 lines of state cache implementation
  - 399 lines of error handling tests
  - Architecture analysis and design documentation (2390 lines)
  - IDeviceAdapter design documentation (2777 lines)

### Changed
- Abstracted platform-specific logic into adapters
- Improved error handling with typed error system
- Enhanced command execution with retry logic
- Optimized device state caching

## [0.5.0] - 2025-11-26

### Added
- **Alexa Smart Home Skill Integration**
  - Custom skill implementation with request verification
  - Comprehensive handler system for device control
  - Response builders for Alexa-compatible responses
  - Support for all SmartThings device types via Alexa
  - CLI server for local Alexa skill testing
  - Full Alexa types and interfaces
  - 425 lines of custom skill implementation
  - 245 lines of handler logic
  - 409 lines of response builders
  - 388 lines of Alexa types
  - 186 lines of request verification
  - 171 lines of CLI server
- **Documentation for Alexa Integration**
  - Quick start guide (250 lines)
  - Implementation documentation (408 lines)
  - Testing guide (495 lines)
  - Ngrok setup guides for HTTPS tunneling
  - Alexa HTTP integration research (1133 lines)

### Changed
- Organized project structure with dedicated docs folders
- Improved documentation hierarchy
- Enhanced setup guides

## [0.4.0] - 2025-11-25

### Added
- **MCP Server Implementation**
  - Device discovery and listing tools
  - Device control tools (turn_on, turn_off, get_device_status)
  - State monitoring capabilities
  - Room-based filtering
  - Scene management (list and execute)
- **Room Management**
  - CRUD operations for rooms
  - Device room assignment
  - Room-based device organization
- **Diagnostic Tools Suite**
  - test_connection: API connectivity verification
  - get_device_health: Device health monitoring
  - list_failed_commands: Command failure tracking
  - get_system_info: System metadata and statistics
  - validate_device_capabilities: Capability validation
  - export_diagnostics: Comprehensive diagnostic reports
- **Interactive Chatbot**
  - LLM integration for natural language control
  - Silent logging mode with debug toggle
  - Conversational device control

### Changed
- Implemented TypeScript strict mode
- Added branded types for type safety
- Enhanced error handling with retry logic

### Fixed
- 14 critical errors blocking initial release
- Type safety issues across codebase
- NPM package configuration issues

## [0.3.0] - 2025-11-25

### Added
- **SmartThings API Integration**
  - Complete SDK integration
  - Device state management
  - Command execution
  - Location management
  - Scene support
- **State Management**
  - Device state caching
  - Real-time state updates
  - Capability-based state tracking
- **Error Handling**
  - Retry logic with exponential backoff
  - Comprehensive error types
  - Graceful degradation

## [0.2.0] - 2025-11-25

### Added
- **TypeScript Type System**
  - Unified device types
  - Capability interfaces
  - Device state types
  - Command types
  - Error types
- **Testing Infrastructure**
  - Vitest setup
  - Unit test framework
  - Integration test framework
  - Test utilities
  - Coverage reporting

### Changed
- Migrated to strict TypeScript configuration
- Implemented branded types for IDs

## [0.1.0] - 2025-11-25

### Added
- **Project Foundation**
  - Initial project structure
  - Package configuration with pnpm
  - TypeScript configuration
  - ESLint and Prettier setup
  - Development environment setup
  - Build system with TypeScript compiler
  - Git repository initialization
- **Documentation**
  - README.md with project overview
  - Development setup instructions
  - API documentation structure
- **Development Tools**
  - Hot reload with tsx
  - Linting and formatting scripts
  - Type checking setup

### Infrastructure
- Node.js >= 18.0.0 requirement
- PNPM package manager
- TypeScript 5.6.0
- Vitest for testing
- Standard-version for changelog

---

## Version History Summary

- **0.6.1** - Unified capability system and build automation
- **0.6.0** - Platform abstraction layer and adapter system
- **0.5.0** - Alexa Smart Home skill integration
- **0.4.0** - MCP server and diagnostic tools
- **0.3.0** - SmartThings API integration
- **0.2.0** - TypeScript type system and testing
- **0.1.0** - Initial project foundation

[0.6.1]: https://github.com/bobmatnyc/mcp-smarterthings/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/bobmatnyc/mcp-smarterthings/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/bobmatnyc/mcp-smarterthings/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/bobmatnyc/mcp-smarterthings/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/bobmatnyc/mcp-smarterthings/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bobmatnyc/mcp-smarterthings/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bobmatnyc/mcp-smarterthings/releases/tag/v0.1.0
