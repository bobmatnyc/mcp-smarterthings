import { SmartThingsService } from '../src/smartthings/client.js';
import type { DeviceId, LocationId } from '../src/types/smartthings.js';

const PAT = process.env.SMARTTHINGS_PAT || '5f595e57-fedb-4ac3-8e46-09f5f903cbd0';
const DEVICE_ID = 'ae92f481-1425-4436-b332-de44ff915565' as DeviceId;

async function investigate() {
  try {
    const smartThings = new SmartThingsService(PAT);

    console.log('🔍 MASTER ALCOVE BAR - DIAGNOSTIC INVESTIGATION');
    console.log('═'.repeat(80));

    // Get device details
    console.log('\n📱 DEVICE INFORMATION:\n');
    const device = await smartThings.getDevice(DEVICE_ID);
    console.log(`Name: ${device.label || device.name}`);
    console.log(`Device ID: ${device.deviceId}`);
    console.log(`Location: ${device.locationId}`);
    console.log(`Room: ${device.roomId || 'N/A'}`);

    // Get events for last 30 minutes
    console.log('\n📜 RETRIEVING EVENTS (Last 30 minutes):\n');

    const result = await smartThings.getDeviceEvents(DEVICE_ID, {
      startTime: '30m',
      limit: 100,
      includeMetadata: true,
    });

    console.log(`Total events: ${result.events.length}`);
    console.log(`Summary: ${result.summary}`);

    if (result.metadata.reachedRetentionLimit) {
      console.log(`⚠️  ${result.metadata.retentionWarning}`);
    }

    if (result.events.length === 0) {
      console.log('\n❌ No events in last 30 minutes');
      console.log('\nTrying last 24 hours instead...\n');

      const result24h = await smartThings.getDeviceEvents(DEVICE_ID, {
        startTime: '24h',
        limit: 100,
        includeMetadata: true,
      });

      console.log(`Found ${result24h.events.length} events in last 24 hours\n`);
      displayEvents(result24h.events);
      analyzeEvents(result24h.events);
      return;
    }

    displayEvents(result.events);
    analyzeEvents(result.events);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

function displayEvents(events: any[]) {
  console.log('\n═'.repeat(80));
  console.log('\n⏰ EVENT TIMELINE:\n');

  const now = Date.now();

  events.slice(0, 20).forEach((event, idx) => {
    const time = new Date(event.time);
    const minAgo = Math.round((now - event.epoch) / 60000);
    const secAgo = Math.round((now - event.epoch) / 1000);

    console.log(`[${idx + 1}] ${minAgo}m ${secAgo % 60}s ago - ${time.toLocaleString()}`);
    console.log(`    ${event.capability}/${event.attribute} → ${JSON.stringify(event.value)}`);
    if (event.componentLabel) console.log(`    Component: ${event.componentLabel}`);
    console.log('');
  });
}

function analyzeEvents(events: any[]) {
  console.log('═'.repeat(80));
  console.log('\n🔍 ROOT CAUSE ANALYSIS:\n');

  const switchEvents = events.filter(e =>
    e.capability === 'switch' && e.attribute === 'switch'
  );

  if (switchEvents.length === 0) {
    console.log('⚠️  No switch events found');
    return;
  }

  console.log(`Found ${switchEvents.length} switch events:\n`);

  const now = Date.now();
  switchEvents.forEach((e, idx) => {
    const time = new Date(e.time);
    const minAgo = Math.round((now - e.epoch) / 60000);
    console.log(`${idx + 1}. ${e.value.toUpperCase()} at ${time.toLocaleString()} (${minAgo}m ago)`);
  });

  // Find OFF→ON pattern (events are newest first)
  let offEvent = null;
  let onEvent = null;

  for (let i = 0; i < switchEvents.length - 1; i++) {
    if (switchEvents[i].value === 'on' && switchEvents[i + 1].value === 'off') {
      onEvent = switchEvents[i];
      offEvent = switchEvents[i + 1];
      break;
    }
  }

  if (!offEvent || !onEvent) {
    console.log('\n⚠️  Could not identify OFF→ON sequence');
    return;
  }

  const offTime = new Date(offEvent.time);
  const onTime = new Date(onEvent.time);
  const gapMs = Math.abs(onEvent.epoch - offEvent.epoch);
  const gapSeconds = Math.round(gapMs / 1000);
  const gapMinutes = Math.round(gapMs / 60000);

  console.log('\n' + '═'.repeat(80));
  console.log('\n🎯 UNEXPECTED TURN-ON DETECTED:\n');
  console.log(`Manual OFF:     ${offTime.toLocaleString()}`);
  console.log(`Unexpected ON:  ${onTime.toLocaleString()}`);
  console.log(`Time Gap:       ${gapMinutes}m ${gapSeconds % 60}s (${gapSeconds}s total)`);

  console.log('\n🔎 TRIGGER SOURCE ANALYSIS:\n');

  if (gapSeconds < 5) {
    console.log('⚡ IMMEDIATE TRIGGER (< 5 seconds)');
    console.log('   Most likely causes:');
    console.log('   1. ⭐ Automation with "when turned off, turn back on" logic');
    console.log('   2. Scene or routine triggered immediately');
    console.log('   3. Hardware issue or third-party integration');
  } else if (gapSeconds < 60) {
    console.log('⏱️  SHORT DELAY TRIGGER (5-60 seconds)');
    console.log('   Most likely causes:');
    console.log('   1. ⭐ Motion sensor automation (Master Alcove Motion Sensor)');
    console.log('   2. Time-based routine with coincidental timing');
    console.log('   3. Voice command to virtual assistant');
  } else {
    console.log('⏰ DELAYED TRIGGER (> 1 minute)');
    console.log('   Most likely causes:');
    console.log('   1. ⭐ Scheduled automation or routine');
    console.log('   2. Smart lighting rule (circadian, sunset-based)');
  }

  console.log('\n💡 RECOMMENDED ACTIONS:\n');
  console.log('1. 🔍 CHECK SMARTTHINGS APP → Automations for this device');
  console.log('2. 🎭 REVIEW "Master Alcove Motion Sensor" automations');
  console.log('3. 🎤 CHECK Alexa/Google Home routines');
  console.log('4. 🧪 DISABLE automations temporarily and test');
  console.log('5. 📊 MONITOR events for patterns');
  console.log('\n' + '═'.repeat(80));
}

investigate();
