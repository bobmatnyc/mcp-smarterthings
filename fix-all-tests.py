#!/usr/bin/env python3
"""
Fix common TypeScript errors across all test files.
"""
import re
import sys

files_to_fix = [
    'src/services/__tests__/DiagnosticWorkflow.patterns.test.ts',
    'src/services/__tests__/DiagnosticWorkflow.test.ts',
    'src/services/__tests__/SemanticIndex.test.ts',
    'src/services/adapters/__tests__/DeviceRegistryAdapter.test.ts',
    'src/services/adapters/__tests__/SemanticIndexAdapter.test.ts',
    'src/services/adapters/DeviceRegistryAdapter.ts',
    'src/services/adapters/SemanticIndexAdapter.ts',
    'src/services/transformers/__tests__/integration.test.ts',
]

def fix_file(filepath):
    """Apply common fixes to a file."""
    try:
        with open(filepath, 'r') as f:
            content = f.read()

        original_content = content

        # Fix 1: Add null safety with optional chaining and toBeDefined()
        # Pattern: expect(result.field).toBe -> expect(result.field).toBeDefined(); expect(result.field!).toBe
        # This is complex, so we'll handle specific patterns

        # Fix 2: Add createUniversalDeviceId import if file uses UniversalDeviceId
        if 'UniversalDeviceId' in content and 'createUniversalDeviceId' not in content:
            # Find the imports section and add the helper
            if "from '../../types/type-helpers.js';" in content or "from '../types/type-helpers.js';" in content:
                # Already has type-helpers import, add to it
                content = re.sub(
                    r"(import \{[^}]*)(createDeviceId[^}]*)\} from '(\.\./)+(types/type-helpers\.js)';",
                    r"\1\2, createUniversalDeviceId } from '\3\4';",
                    content
                )
            elif "from '../../types/" in content or "from '../types/" in content:
                # Add new import after first types import
                content = re.sub(
                    r"(import type \{[^}]+\} from '(\.\./)+(types/[^']+)';)",
                    r"\1\nimport { createUniversalDeviceId } from '\2types/type-helpers.js';",
                    content,
                    count=1
                )

        # Fix 3: Remove unused imports
        # DeviceCapability from SemanticIndexAdapter test
        if 'SemanticIndexAdapter.test.ts' in filepath:
            content = re.sub(
                r", DeviceCapability",
                r"",
                content
            )

        # Fix 4: Add ! assertions for array access that should be defined
        # Pattern: expect(result.field[0].property) -> expect(result.field?.[0]?.property)
        # But only where we know it should be defined (after length checks)

        # Fix 5: Cast 'as unknown as UnifiedDevice' for mock objects
        content = re.sub(
            r"(\s+)\} as UnifiedDevice;",
            r"\1} as unknown as UnifiedDevice;",
            content
        )

        # Fix 6: Fix metadatas type issues - wrap arrays in JSON.stringify
        # This is for SemanticIndex test
        if 'SemanticIndex.test.ts' in filepath:
            # Fix metadata arrays (capabilities, tags)
            content = re.sub(
                r"capabilities: (\[[^\]]+\])",
                r"capabilities: JSON.stringify(\1)",
                content
            )
            content = re.sub(
                r"tags: (\[[^\]]+\])",
                r"tags: JSON.stringify(\1)",
                content
            )

        if content != original_content:
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"✅ Fixed {filepath}")
            return True
        else:
            print(f"⏭️  No changes needed for {filepath}")
            return False

    except Exception as e:
        print(f"❌ Error fixing {filepath}: {e}")
        return False

def main():
    fixed_count = 0
    for filepath in files_to_fix:
        if fix_file(filepath):
            fixed_count += 1

    print(f"\n✅ Fixed {fixed_count}/{len(files_to_fix)} files")

if __name__ == '__main__':
    main()
