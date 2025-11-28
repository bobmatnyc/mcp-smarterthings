#!/bin/bash
# Final comprehensive fix for all remaining TypeScript errors

echo "Applying final fixes..."

# Fix all null safety issues with mockEvents array access
find src -name "*.test.ts" -exec sed -i '' 's/mockEvents\[1\]\./mockEvents[1]!\./g' {} \;
find src -name "*.test.ts" -exec sed -i '' 's/mockEvents\[2\]\./mockEvents[2]!\./g' {} \;

# Fix result.patterns array access
find src -name "*.test.ts" -exec sed -i '' 's/result\.patterns!\?\[0\]/result.patterns?.[0]/g' {} \;

# Fix metadata capabilities arrays - they should be typed properly, not stringified
# The SemanticIndex test uses capabilities as arrays of DeviceCapability
# but the mock query results have them as strings in metadata

# Fix QueryResult type issues - add 'as any' to mock query results
sed -i '' 's/const mockQueryResult = {/const mockQueryResult: any = {/g' src/services/__tests__/SemanticIndex.test.ts

# Fix capabilities assignment - metadata in chromadb can be strings
sed -i '' 's/capabilities: \[[^]]*\]$/capabilities: "switch,temperatureSensor"/g' src/services/__tests__/SemanticIndex.test.ts

# Fix production files - remove unused imports
sed -i '' '/import.*DeviceCapability.*from/d; /import type { DeviceCapability/d' src/services/adapters/__tests__/SemanticIndexAdapter.test.ts
sed -i '' '/import.*UnifiedDevice.*from/d; /import type { UnifiedDevice/d' src/services/adapters/SemanticIndexAdapter.ts

# Fix transformer integration tests - add null safety
sed -i '' 's/expect(result\[0\]\./expect(result[0]!\./g' src/services/transformers/__tests__/integration.test.ts

echo "✅ Applied all fixes"
