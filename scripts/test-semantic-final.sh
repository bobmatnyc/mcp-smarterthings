#!/bin/bash
# Semantic Search Test Runner - Ensures environment is loaded before module initialization

# Load .env file and export variables
set -a  # automatically export all variables
source .env
set +a

# Verify critical environment variables
if [ -z "$SMARTTHINGS_TOKEN" ]; then
  echo "❌ SMARTTHINGS_TOKEN not found in .env"
  exit 1
fi

if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "❌ OPENROUTER_API_KEY not found in .env"
  exit 1
fi

# Also set SMARTTHINGS_PAT (some code uses this instead of SMARTTHINGS_TOKEN)
export SMARTTHINGS_PAT="$SMARTTHINGS_TOKEN"

echo "✅ Environment variables loaded"
echo "   SMARTTHINGS_TOKEN: ${SMARTTHINGS_TOKEN:0:8}..."
echo "   OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:0:8}..."
echo ""

# Run the test
npx tsx test-semantic-compiled.ts
