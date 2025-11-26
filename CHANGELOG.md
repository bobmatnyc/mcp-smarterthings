# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-25

### Added
- Initial release of MCP SmartThings server
- Device control tools (turn_on, turn_off, get_device_status)
- Device discovery and listing with room filtering
- Scene management (list and execute scenes)
- Room management CRUD operations
- Device room assignment capabilities
- Location listing functionality
- Comprehensive diagnostic tools suite:
  - test_connection: API connectivity verification
  - get_device_health: Device health monitoring
  - list_failed_commands: Command failure tracking
  - get_system_info: System metadata and statistics
  - validate_device_capabilities: Capability validation
  - export_diagnostics: Comprehensive diagnostic reports
- Interactive chatbot with LLM integration
- Silent logging mode with user-controlled debug toggle
- TypeScript strict mode with branded types
- Retry logic with exponential backoff
- Comprehensive test suite (unit + integration)
- Complete documentation and user guides

### Infrastructure
- Version and build tracking system
- Automated version bumping with standard-version
- Single source of truth for version (package.json)
- npm lifecycle hooks for releases
- CHANGELOG generation support

[1.0.0]: https://github.com/bobmatnyc/mcp-smarterthings/releases/tag/v1.0.0
