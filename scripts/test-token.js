#!/usr/bin/env node
import { readFileSync } from 'fs';
import { SmartThingsClient, BearerTokenAuthenticator } from '@smartthings/core-sdk';

// Load token from .env.local
const envContent = readFileSync('.env.local', 'utf-8');
const tokenMatch = envContent.match(/SMARTTHINGS_PAT=(.+)/);

if (!tokenMatch) {
  console.error('❌ No SMARTTHINGS_PAT found in .env.local');
  process.exit(1);
}

const token = tokenMatch[1].trim();

async function testToken() {
  try {
    const client = new SmartThingsClient(new BearerTokenAuthenticator(token));

    console.log('🔍 Testing SmartThings API...\n');

    // Test 1: List locations
    console.log('1️⃣ Fetching locations...');
    const locations = await client.locations.list();
    console.log(`✅ Found ${locations.length} location(s)`);
    locations.forEach(loc => {
      console.log(`   - ${loc.name} (${loc.locationId})`);
    });

    console.log('');

    // Test 2: List devices
    console.log('2️⃣ Fetching devices...');
    const devices = await client.devices.list();
    console.log(`✅ Found ${devices.items?.length || 0} device(s)`);

    if (devices.items && devices.items.length > 0) {
      devices.items.slice(0, 10).forEach(device => {
        console.log(`   - ${device.label || device.name} (${device.deviceId})`);
        console.log(`     Type: ${device.type}`);
        console.log(`     Room: ${device.roomId || 'Unassigned'}`);
      });

      if (devices.items.length > 10) {
        console.log(`   ... and ${devices.items.length - 10} more`);
      }
    } else {
      console.log('⚠️  No devices found in your SmartThings account');
      console.log('   Please check:');
      console.log('   1. Do you have devices in the SmartThings app?');
      console.log('   2. Is your PAT token configured with correct scopes?');
      console.log('   3. Try the config menu: pnpm config:dev');
    }

    console.log('');
    console.log('✅ Token test complete!');

  } catch (error) {
    console.error('❌ Token test failed:', error.message);
    console.error('');
    console.error('Possible issues:');
    console.error('  - Token is expired or invalid');
    console.error('  - Token missing required scopes');
    console.error('  - Network connectivity issue');
    console.error('');
    console.error('Fix: Run "pnpm config:dev" to reconfigure your token');
    process.exit(1);
  }
}

testToken();
