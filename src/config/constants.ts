/**
 * Application-wide constants and configuration values.
 */

export const API_CONSTANTS = {
  SMARTTHINGS_BASE_URL: 'https://api.smartthings.com/v1',
  DEFAULT_TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second initial delay
} as const;

export const MCP_TOOL_NAMES = {
  TURN_ON_DEVICE: 'turn_on_device',
  TURN_OFF_DEVICE: 'turn_off_device',
  GET_DEVICE_STATUS: 'get_device_status',
  LIST_DEVICES: 'list_devices',
  GET_DEVICE_CAPABILITIES: 'get_device_capabilities',
} as const;

export const MCP_RESOURCE_URIS = {
  DEVICES: 'smartthings://devices',
  DEVICE_BY_ID: (id: string) => `smartthings://devices/${id}`,
} as const;

export const SMARTTHINGS_CAPABILITIES = {
  SWITCH: 'switch',
  SWITCH_LEVEL: 'switchLevel',
  COLOR_CONTROL: 'colorControl',
  TEMPERATURE_MEASUREMENT: 'temperatureMeasurement',
  MOTION_SENSOR: 'motionSensor',
  CONTACT_SENSOR: 'contactSensor',
  LOCK: 'lock',
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SMARTTHINGS_API_ERROR: 'SMARTTHINGS_API_ERROR',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  CAPABILITY_NOT_SUPPORTED: 'CAPABILITY_NOT_SUPPORTED',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  // Diagnostic-specific errors
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  DIAGNOSTIC_FAILED: 'DIAGNOSTIC_FAILED',
} as const;
