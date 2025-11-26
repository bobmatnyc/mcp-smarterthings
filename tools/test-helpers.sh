#!/bin/bash

################################################################################
# MCP Test Helper Functions for SmartThings Server
#
# Quick shell functions for testing MCP server via JSON-RPC over stdio.
# These helpers provide one-liner commands for common testing scenarios.
#
# Design Decision: Shell functions over CLI tool
# Rationale: Minimal dependencies, works anywhere bash is available.
# Easy to source and customize for specific testing workflows.
#
# Usage:
#   source tools/test-helpers.sh
#   mcp_list_tools
#   st_list_devices
#   st_turn_on "abc-123-device-id"
#
# Requirements:
#   - jq (for JSON parsing and formatting)
#   - Built MCP server (npm run build)
#   - Valid SMARTTHINGS_PAT in environment or .env
################################################################################

# Configuration
MCP_SERVER_DIR="${MCP_SERVER_DIR:-$(dirname "$0")/..}"
MCP_SERVER_CMD="node $MCP_SERVER_DIR/dist/index.js"

# Colors for output
COLOR_RESET='\033[0m'
COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_RED='\033[0;31m'
COLOR_YELLOW='\033[0;33m'
COLOR_CYAN='\033[0;36m'
COLOR_DIM='\033[2m'

################################################################################
# Core MCP Protocol Functions
################################################################################

# List all available MCP tools
# Usage: mcp_list_tools
mcp_list_tools() {
  echo -e "${COLOR_BLUE}Listing MCP tools...${COLOR_RESET}"
  echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
    $MCP_SERVER_CMD 2>/dev/null | jq -r '.result.tools[] | "- \(.name)\n  \(.description)"'
}

# Call a generic MCP tool
# Usage: mcp_call_tool <tool_name> <json_args>
# Example: mcp_call_tool "list_devices" "{}"
mcp_call_tool() {
  local tool_name="$1"
  local args="${2:-{}}"

  if [ -z "$tool_name" ]; then
    echo -e "${COLOR_RED}Error: Tool name required${COLOR_RESET}"
    echo "Usage: mcp_call_tool <tool_name> <json_args>"
    return 1
  fi

  echo -e "${COLOR_BLUE}Calling tool: $tool_name${COLOR_RESET}"
  echo -e "${COLOR_DIM}Arguments: $args${COLOR_RESET}"

  echo "{
    \"jsonrpc\":\"2.0\",
    \"method\":\"tools/call\",
    \"params\":{
      \"name\":\"$tool_name\",
      \"arguments\":$args
    },
    \"id\":$(date +%s)
  }" | $MCP_SERVER_CMD 2>/dev/null | jq
}

# Initialize MCP connection
# Usage: mcp_initialize
mcp_initialize() {
  echo -e "${COLOR_BLUE}Initializing MCP connection...${COLOR_RESET}"
  echo '{
    "jsonrpc":"2.0",
    "method":"initialize",
    "params":{
      "protocolVersion":"2024-11-05",
      "capabilities":{},
      "clientInfo":{
        "name":"test-client",
        "version":"1.0.0"
      }
    },
    "id":1
  }' | $MCP_SERVER_CMD 2>/dev/null | jq
}

################################################################################
# SmartThings-Specific Functions
################################################################################

# List all SmartThings devices
# Usage: st_list_devices
st_list_devices() {
  echo -e "${COLOR_GREEN}Listing SmartThings devices...${COLOR_RESET}"
  mcp_call_tool "list_devices" "{}"
}

# List devices in compact format (just IDs and names)
# Usage: st_devices_compact
st_devices_compact() {
  echo -e "${COLOR_GREEN}SmartThings devices (compact):${COLOR_RESET}"
  echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_devices","arguments":{}},"id":1}' | \
    $MCP_SERVER_CMD 2>/dev/null | \
    jq -r '.result.content[0].text' | \
    grep -E "^- " | \
    sed 's/^- /  /'
}

# Turn on a device
# Usage: st_turn_on <device_id>
st_turn_on() {
  local device_id="$1"

  if [ -z "$device_id" ]; then
    echo -e "${COLOR_RED}Error: Device ID required${COLOR_RESET}"
    echo "Usage: st_turn_on <device_id>"
    return 1
  fi

  echo -e "${COLOR_GREEN}Turning on device: $device_id${COLOR_RESET}"
  mcp_call_tool "turn_on_device" "{\"deviceId\":\"$device_id\"}"
}

# Turn off a device
# Usage: st_turn_off <device_id>
st_turn_off() {
  local device_id="$1"

  if [ -z "$device_id" ]; then
    echo -e "${COLOR_RED}Error: Device ID required${COLOR_RESET}"
    echo "Usage: st_turn_off <device_id>"
    return 1
  fi

  echo -e "${COLOR_GREEN}Turning off device: $device_id${COLOR_RESET}"
  mcp_call_tool "turn_off_device" "{\"deviceId\":\"$device_id\"}"
}

# Get device status
# Usage: st_status <device_id>
st_status() {
  local device_id="$1"

  if [ -z "$device_id" ]; then
    echo -e "${COLOR_RED}Error: Device ID required${COLOR_RESET}"
    echo "Usage: st_status <device_id>"
    return 1
  fi

  echo -e "${COLOR_CYAN}Getting status for device: $device_id${COLOR_RESET}"
  mcp_call_tool "get_device_status" "{\"deviceId\":\"$device_id\"}"
}

# Get device capabilities
# Usage: st_capabilities <device_id>
st_capabilities() {
  local device_id="$1"

  if [ -z "$device_id" ]; then
    echo -e "${COLOR_RED}Error: Device ID required${COLOR_RESET}"
    echo "Usage: st_capabilities <device_id>"
    return 1
  fi

  echo -e "${COLOR_CYAN}Getting capabilities for device: $device_id${COLOR_RESET}"
  mcp_call_tool "get_device_capabilities" "{\"deviceId\":\"$device_id\"}"
}

################################################################################
# Testing and Validation Functions
################################################################################

# Test all basic MCP operations
# Usage: mcp_test_all
mcp_test_all() {
  echo -e "${COLOR_BLUE}╔════════════════════════════════════════╗${COLOR_RESET}"
  echo -e "${COLOR_BLUE}║  MCP SmartThings Server Test Suite    ║${COLOR_RESET}"
  echo -e "${COLOR_BLUE}╚════════════════════════════════════════╝${COLOR_RESET}"
  echo ""

  echo -e "${COLOR_CYAN}[1/3] Testing MCP initialization...${COLOR_RESET}"
  mcp_initialize
  echo ""

  echo -e "${COLOR_CYAN}[2/3] Testing tool listing...${COLOR_RESET}"
  mcp_list_tools
  echo ""

  echo -e "${COLOR_CYAN}[3/3] Testing device listing...${COLOR_RESET}"
  st_list_devices
  echo ""

  echo -e "${COLOR_GREEN}✓ All basic tests completed${COLOR_RESET}"
}

# Test device control with a specific device
# Usage: st_test_device <device_id>
st_test_device() {
  local device_id="$1"

  if [ -z "$device_id" ]; then
    echo -e "${COLOR_RED}Error: Device ID required${COLOR_RESET}"
    echo "Usage: st_test_device <device_id>"
    return 1
  fi

  echo -e "${COLOR_BLUE}╔════════════════════════════════════════╗${COLOR_RESET}"
  echo -e "${COLOR_BLUE}║  Testing Device: $device_id           ${COLOR_RESET}"
  echo -e "${COLOR_BLUE}╚════════════════════════════════════════╝${COLOR_RESET}"
  echo ""

  echo -e "${COLOR_CYAN}[1/4] Getting device status...${COLOR_RESET}"
  st_status "$device_id"
  echo ""

  echo -e "${COLOR_CYAN}[2/4] Getting device capabilities...${COLOR_RESET}"
  st_capabilities "$device_id"
  echo ""

  echo -e "${COLOR_CYAN}[3/4] Turning device ON...${COLOR_RESET}"
  st_turn_on "$device_id"
  echo ""

  sleep 2

  echo -e "${COLOR_CYAN}[4/4] Turning device OFF...${COLOR_RESET}"
  st_turn_off "$device_id"
  echo ""

  echo -e "${COLOR_GREEN}✓ Device test completed${COLOR_RESET}"
}

# Test error handling
# Usage: mcp_test_errors
mcp_test_errors() {
  echo -e "${COLOR_YELLOW}Testing error handling...${COLOR_RESET}"
  echo ""

  echo -e "${COLOR_CYAN}[1/2] Testing invalid device ID...${COLOR_RESET}"
  st_status "invalid-device-id-12345"
  echo ""

  echo -e "${COLOR_CYAN}[2/2] Testing missing required parameter...${COLOR_RESET}"
  mcp_call_tool "turn_on_device" "{}"
  echo ""

  echo -e "${COLOR_GREEN}✓ Error handling tests completed${COLOR_RESET}"
}

################################################################################
# Utility Functions
################################################################################

# Show help for available functions
# Usage: mcp_help
mcp_help() {
  echo -e "${COLOR_BLUE}╔═══════════════════════════════════════════════════════════╗${COLOR_RESET}"
  echo -e "${COLOR_BLUE}║  MCP Test Helper Functions                                ║${COLOR_RESET}"
  echo -e "${COLOR_BLUE}╚═══════════════════════════════════════════════════════════╝${COLOR_RESET}"
  echo ""
  echo -e "${COLOR_CYAN}Core MCP Functions:${COLOR_RESET}"
  echo "  mcp_initialize                     - Initialize MCP connection"
  echo "  mcp_list_tools                     - List all MCP tools"
  echo "  mcp_call_tool <name> <args>        - Call any MCP tool"
  echo ""
  echo -e "${COLOR_CYAN}SmartThings Functions:${COLOR_RESET}"
  echo "  st_list_devices                    - List all devices"
  echo "  st_devices_compact                 - List devices (compact format)"
  echo "  st_turn_on <device_id>             - Turn device on"
  echo "  st_turn_off <device_id>            - Turn device off"
  echo "  st_status <device_id>              - Get device status"
  echo "  st_capabilities <device_id>        - Get device capabilities"
  echo ""
  echo -e "${COLOR_CYAN}Testing Functions:${COLOR_RESET}"
  echo "  mcp_test_all                       - Run all basic tests"
  echo "  st_test_device <device_id>         - Test device control"
  echo "  mcp_test_errors                    - Test error handling"
  echo ""
  echo -e "${COLOR_CYAN}Utility Functions:${COLOR_RESET}"
  echo "  mcp_help                           - Show this help"
  echo ""
  echo -e "${COLOR_DIM}Examples:${COLOR_RESET}"
  echo -e "${COLOR_DIM}  st_list_devices${COLOR_RESET}"
  echo -e "${COLOR_DIM}  st_turn_on \"abc-123-device-id\"${COLOR_RESET}"
  echo -e "${COLOR_DIM}  st_test_device \"abc-123-device-id\"${COLOR_RESET}"
  echo ""
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo -e "${COLOR_RED}Warning: jq is not installed${COLOR_RESET}"
  echo "Install jq for JSON parsing: brew install jq (macOS) or apt-get install jq (Linux)"
fi

# Check if server is built
if [ ! -f "$MCP_SERVER_DIR/dist/index.js" ]; then
  echo -e "${COLOR_YELLOW}Warning: MCP server not built${COLOR_RESET}"
  echo "Run: npm run build"
fi

# Show helper loaded message
echo -e "${COLOR_GREEN}✓ MCP test helpers loaded${COLOR_RESET}"
echo -e "${COLOR_DIM}  Type 'mcp_help' for available commands${COLOR_RESET}"
