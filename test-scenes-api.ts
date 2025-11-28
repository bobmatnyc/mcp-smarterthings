import { SmartThingsClient, BearerTokenAuthenticator } from '@smartthings/core-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const ALCOVE_BAR_DEVICE_ID = 'ae92f481-1425-4436-b332-de44ff915565';

async function testScenesAPI() {
  const token = process.env.SMARTTHINGS_TOKEN;
  if (!token) {
    throw new Error('SMARTTHINGS_TOKEN not set');
  }

  const client = new SmartThingsClient(new BearerTokenAuthenticator(token));

  console.log('Fetching all scenes...');
  const scenes = await client.scenes.list();

  console.log(`\nFound ${scenes.length} scenes\n`);

  for (const scene of scenes) {
    console.log(`Scene: ${scene.sceneName} (ID: ${scene.sceneId})`);
    console.log(`  Location: ${scene.locationId}`);

    // Get scene details to see if it controls Alcove Bar
    try {
      const details = await client.scenes.get(scene.sceneId);
      const detailsStr = JSON.stringify(details, null, 2);

      // Check if this scene controls the Alcove Bar
      if (detailsStr.includes(ALCOVE_BAR_DEVICE_ID)) {
        console.log(`  🎯 THIS SCENE CONTROLS ALCOVE BAR!`);
      }

      console.log(`  Actions: ${detailsStr.substring(0, 500)}...`);
    } catch (error) {
      console.log(`  Could not fetch details: ${error}`);
    }
    console.log('');
  }
}

testScenesAPI().catch(console.error);
