import { smartThingsService } from '../../smartthings/client.js';
import { MCP_RESOURCE_URIS } from '../../config/constants.js';
import logger from '../../utils/logger.js';
import type { DeviceId } from '../../types/smartthings.js';

/**
 * MCP resource handlers for SmartThings devices.
 *
 * Resources provide read-only access to SmartThings data via URIs:
 * - smartthings://devices - List all devices
 * - smartthings://devices/{id} - Get specific device details
 */

/**
 * List all devices resource handler.
 *
 * URI: smartthings://devices
 * Returns: JSON array of all accessible devices
 */
export async function listDevicesResource(): Promise<string> {
  logger.debug('Resource request: list all devices');

  const devices = await smartThingsService.listDevices();

  return JSON.stringify(devices, null, 2);
}

/**
 * Get specific device resource handler.
 *
 * URI: smartthings://devices/{deviceId}
 * Returns: JSON object with device details and current status
 *
 * @param deviceId Device UUID
 * @throws Error if device not found
 */
export async function getDeviceResource(deviceId: string): Promise<string> {
  logger.debug('Resource request: get device', { deviceId });

  const [device, status] = await Promise.all([
    smartThingsService.getDevice(deviceId as DeviceId),
    smartThingsService.getDeviceStatus(deviceId as DeviceId),
  ]);

  return JSON.stringify({ device, status }, null, 2);
}

/**
 * Resource metadata for MCP server registration.
 */
export const deviceResources = {
  devices: {
    uri: MCP_RESOURCE_URIS.DEVICES,
    name: 'SmartThings Devices',
    description: 'List all SmartThings devices',
    mimeType: 'application/json',
    handler: listDevicesResource,
  },
  device: {
    uriTemplate: 'smartthings://devices/{deviceId}',
    name: 'SmartThings Device',
    description: 'Get details for a specific SmartThings device',
    mimeType: 'application/json',
    handler: getDeviceResource,
  },
} as const;
