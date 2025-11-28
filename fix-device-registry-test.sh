#!/bin/bash
# Fix DeviceRegistryAdapter.test.ts

file="src/services/adapters/__tests__/DeviceRegistryAdapter.test.ts"

# Add import for createUniversalDeviceId if not present
if ! grep -q "createUniversalDeviceId" "$file"; then
    sed -i '' "s/from '\.\.\.\/\.\.\/types\/type-helpers\.js';/, createUniversalDeviceId } from '..\/..\/types\/type-helpers.js';/" "$file"
fi

# Fix all hardcoded device IDs to use helper
sed -i '' "s/adapter\.getDevice('smartthings:\([^']*\)')/adapter.getDevice(createUniversalDeviceId(Platform.SMARTTHINGS, '\1'))/g" "$file"

# Fix null safety for results array access  
sed -i '' 's/expect(devices\[0\]\./expect(devices[0]!\./g' "$file"

echo "Fixed DeviceRegistryAdapter.test.ts"
