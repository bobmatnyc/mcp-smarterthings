/**
 * SmartThings Switch capability helper functions.
 *
 * The switch capability provides basic on/off control for devices.
 * Standard commands: on, off
 * Standard attributes: switch (on/off state)
 */

import { smartThingsService } from '../client.js';
import type { DeviceId } from '../../types/smartthings.js';
import { SMARTTHINGS_CAPABILITIES } from '../../config/constants.js';

/**
 * Turn on a switch device.
 *
 * @param deviceId Device UUID
 * @throws Error if device doesn't support switch capability or command fails
 */
export async function turnOn(deviceId: DeviceId): Promise<void> {
  await smartThingsService.executeCommand(deviceId, SMARTTHINGS_CAPABILITIES.SWITCH, 'on');
}

/**
 * Turn off a switch device.
 *
 * @param deviceId Device UUID
 * @throws Error if device doesn't support switch capability or command fails
 */
export async function turnOff(deviceId: DeviceId): Promise<void> {
  await smartThingsService.executeCommand(deviceId, SMARTTHINGS_CAPABILITIES.SWITCH, 'off');
}

/**
 * Get current switch state of a device.
 *
 * @param deviceId Device UUID
 * @returns Switch state ("on" or "off")
 * @throws Error if device doesn't support switch capability
 */
export async function getSwitchState(deviceId: DeviceId): Promise<string> {
  const status = await smartThingsService.getDeviceStatus(deviceId);
  const switchState = status.components['main']?.['switch']?.['switch']?.value;

  if (typeof switchState !== 'string') {
    throw new Error(`Device ${deviceId} does not support switch capability`);
  }

  return switchState;
}
