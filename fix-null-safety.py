#!/usr/bin/env python3
"""Fix null safety issues by adding toBeDefined() checks before assertions."""
import re

files = [
    'src/services/__tests__/DiagnosticWorkflow.patterns.test.ts',
    'src/services/__tests__/DiagnosticWorkflow.test.ts',
    'src/services/__tests__/SemanticIndex.test.ts',
]

for filepath in files:
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    modified = False
    new_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Pattern: expect(result.patterns[0].pattern) or similar
        # Need to add expect(result.patterns).toBeDefined() before it
        match = re.match(r'(\s+)expect\((result\.\w+)\[0\]\.(\w+)\)', line)
        if match:
            indent = match.group(1)
            array_ref = match.group(2)
            # Check if previous line doesn't already have toBeDefined for this array
            if i > 0 and f'expect({array_ref}).toBeDefined()' not in lines[i-1]:
                new_lines.append(f'{indent}expect({array_ref}).toBeDefined();\n')
                modified = True
        
        new_lines.append(line)
        i += 1
    
    if modified:
        with open(filepath, 'w') as f:
            f.writelines(new_lines)
        print(f"✅ Fixed {filepath}")
    else:
        print(f"⏭️  No changes for {filepath}")
