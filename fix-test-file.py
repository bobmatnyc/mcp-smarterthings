#!/usr/bin/env python3
"""
Fix DeviceService.events.test.ts to use createDeviceId and remove redundant patterns.
"""
import re

# Read the file
with open('src/services/__tests__/DeviceService.events.test.ts', 'r') as f:
    content = f.read()

# Pattern 1: Replace 'device-123' as DeviceId with createDeviceId('device-123')
content = re.sub(
    r"'device-123' as DeviceId",
    r"createDeviceId('device-123')",
    content
)

# Pattern 2: Replace 'nonexistent-device' as DeviceId with createDeviceId
content = re.sub(
    r"'nonexistent-device' as DeviceId",
    r"createDeviceId('nonexistent-device')",
    content
)

# Pattern 3: Replace '' as DeviceId with createDeviceId('')
content = re.sub(
    r"'' as DeviceId",
    r"createDeviceId('')",
    content
)

# Pattern 4: Fix metadata.parameters?.deviceId access
content = re.sub(
    r"expect\(serviceError\.metadata\.parameters\?\.deviceId\)",
    r"expect(serviceError.metadata.parameters?.['deviceId'])",
    content
)

# Pattern 5: Remove gaps: [] from metadata objects (they're now properly typed)
content = re.sub(
    r",\s*gaps: \[\],?\s*",
    r",\n          ",
    content
)

# Write back
with open('src/services/__tests__/DeviceService.events.test.ts', 'w') as f:
    f.write(content)

print("Fixed DeviceService.events.test.ts")
