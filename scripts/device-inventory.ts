#!/usr/bin/env tsx

/**
 * Device Inventory Script
 * Categorizes SmartThings devices by type and provides counts
 */

import { SmartThingsClient, BearerTokenAuthenticator } from '@smartthings/core-sdk';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

interface DeviceTypeCount {
  type: string;
  count: number;
  devices: string[];
}

async function getDeviceInventory(): Promise<void> {
  const token = process.env.SMARTTHINGS_PAT || process.env.SMARTTHINGS_TOKEN;

  if (!token) {
    console.error('❌ Error: SMARTTHINGS_PAT environment variable is required');
    process.exit(1);
  }

  const client = new SmartThingsClient(new BearerTokenAuthenticator(token));

  try {
    console.log('📡 Fetching devices from SmartThings...\n');

    const devices = await client.devices.list();

    console.log(`Found ${devices.length} total devices\n`);
    console.log('=' .repeat(70));
    console.log('DEVICE INVENTORY BY TYPE');
    console.log('='.repeat(70));
    console.log();

    // Group devices by type
    const typeMap = new Map<string, DeviceTypeCount>();

    for (const device of devices) {
      const deviceType = device.type || 'Unknown';

      if (!typeMap.has(deviceType)) {
        typeMap.set(deviceType, {
          type: deviceType,
          count: 0,
          devices: []
        });
      }

      const entry = typeMap.get(deviceType)!;
      entry.count++;
      entry.devices.push(device.label || device.name || 'Unnamed');
    }

    // Sort by count (descending)
    const sortedTypes = Array.from(typeMap.values())
      .sort((a, b) => b.count - a.count);

    // Display summary
    console.log('SUMMARY BY TYPE:');
    console.log('-'.repeat(70));
    console.log();

    for (const typeInfo of sortedTypes) {
      console.log(`📦 ${typeInfo.type}`);
      console.log(`   Count: ${typeInfo.count}`);
      console.log(`   Devices: ${typeInfo.devices.slice(0, 5).join(', ')}${typeInfo.count > 5 ? ` ... and ${typeInfo.count - 5} more` : ''}`);
      console.log();
    }

    console.log('='.repeat(70));
    console.log(`TOTAL: ${devices.length} devices across ${typeMap.size} types`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error fetching devices:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the inventory
getDeviceInventory().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
