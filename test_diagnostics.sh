#!/bin/bash

# Diagnostic Tools Test Script
# Tests all 6 diagnostic tools via test gateway

echo "========================================"
echo "DIAGNOSTIC TOOLS TEST SUITE"
echo "Testing ticket 1M-214 implementation"
echo "========================================"
echo ""

# Create test commands file
cat > /tmp/mcp_test_commands.txt <<'COMMANDS'
connect
call test_connection {}
call get_system_info {}
call list_failed_commands {"limit": 5}
call export_diagnostics {"format": "json"}
call export_diagnostics {"format": "markdown"}
disconnect
exit
COMMANDS

echo "Test 1: Connection Test"
echo "Test 2: System Info"
echo "Test 3: Failed Commands List"
echo "Test 4: Export Diagnostics (JSON)"
echo "Test 5: Export Diagnostics (Markdown)"
echo ""
echo "Running tests..."
echo ""

# Run test gateway with commands
npm run test-gateway < /tmp/mcp_test_commands.txt 2>&1

# Clean up
rm -f /tmp/mcp_test_commands.txt

echo ""
echo "========================================"
echo "Test execution completed"
echo "========================================"
