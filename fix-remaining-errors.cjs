const fs = require('fs');

// Fix DeviceService.events.test.ts
let content = fs.readFileSync('src/services/__tests__/DeviceService.events.test.ts', 'utf8');

// Remove all remaining gaps properties from metadata objects
content = content.replace(/\s*gaps: \[[^\]]*\],?\n/g, '');

// Add dateRange to metadata objects that are missing it
const metadataPattern = /metadata: \{([^}]*?)(totalCount:|hasMore:|appliedFilters:|gapDetected:|largestGapMs:|reachedRetentionLimit:)/g;
const matches = [];
let match;
while ((match = metadataPattern.exec(content)) !== null) {
  matches.push({ index: match.index, content: match[0] });
}

// Process matches in reverse to maintain indices
for (let i = matches.length - 1; i >= 0; i--) {
  const m = matches[i];
  const metadataText = m.content;
  if (!metadataText.includes('dateRange:')) {
    // Add dateRange after the opening brace
    const replacement = metadataText.replace(
      'metadata: {',
      `metadata: {
          dateRange: {
            earliest: '2025-11-27T10:00:00Z',
            latest: '2025-11-27T12:00:00Z',
            durationMs: 7200000,
          },
`
    );
    content = content.substring(0, m.index) + replacement + content.substring(m.index + metadataText.length);
  }
}

fs.writeFileSync('src/services/__tests__/DeviceService.events.test.ts', content, 'utf8');
console.log('Fixed DeviceService.events.test.ts gaps and dateRange');
