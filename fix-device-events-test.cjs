#!/usr/bin/env node
const fs = require('fs');

const filePath = 'src/services/__tests__/DeviceService.events.test.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Replace patterns where deviceService.getDeviceEvents is called
// Pattern 1: Empty options {}
content = content.replace(
  /deviceService\.getDeviceEvents\('device-123' as DeviceId, \{\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('device-123'), { deviceId: createDeviceId('device-123') })"
);

// Pattern 2: Empty options {} for 'nonexistent-device'
content = content.replace(
  /deviceService\.getDeviceEvents\('nonexistent-device' as DeviceId, \{\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('nonexistent-device'), { deviceId: createDeviceId('nonexistent-device') })"
);

// Pattern 3: Empty options {} for empty string
content = content.replace(
  /deviceService\.getDeviceEvents\('' as DeviceId, \{\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId(''), { deviceId: createDeviceId('') })"
);

// Pattern 4: Options with single property (limit, startTime, etc.)
content = content.replace(
  /deviceService\.getDeviceEvents\('device-123' as DeviceId, \{(\s+)limit: (\d+)(\s+)\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('device-123'), {$1deviceId: createDeviceId('device-123'),$1limit: $2$3})"
);

content = content.replace(
  /deviceService\.getDeviceEvents\('device-123' as DeviceId, \{(\s+)startTime: '([^']+)'(\s+)\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('device-123'), {$1deviceId: createDeviceId('device-123'),$1startTime: '$2'$3})"
);

content = content.replace(
  /deviceService\.getDeviceEvents\('device-123' as DeviceId, \{(\s+)capabilities: ([^}]+)\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('device-123'), {$1deviceId: createDeviceId('device-123'),$1capabilities: $2})"
);

content = content.replace(
  /deviceService\.getDeviceEvents\('device-123' as DeviceId, \{(\s+)attributes: ([^\}]+)\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('device-123'), {$1deviceId: createDeviceId('device-123'),$1attributes: $2})"
);

content = content.replace(
  /deviceService\.getDeviceEvents\('device-123' as DeviceId, \{(\s+)includeMetadata: true(\s+)\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('device-123'), {$1deviceId: createDeviceId('device-123'),$1includeMetadata: true$2})"
);

content = content.replace(
  /deviceService\.getDeviceEvents\('device-123' as DeviceId, \{(\s+)humanReadable: true(\s+)\}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('device-123'), {$1deviceId: createDeviceId('device-123'),$1humanReadable: true$2})"
);

// Pattern 5: Options with { startTime, endTime } variables
content = content.replace(
  /deviceService\.getDeviceEvents\('device-123' as DeviceId, \{ startTime, endTime \}\)/g,
  "deviceService.getDeviceEvents(createDeviceId('device-123'), { deviceId: createDeviceId('device-123'), startTime, endTime })"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed DeviceService.events.test.ts');
