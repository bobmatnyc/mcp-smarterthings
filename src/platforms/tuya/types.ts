/**
 * Tuya platform type definitions.
 *
 * Defines Tuya-specific configuration, device structures, and DP code types
 * for the Tuya Cloud API integration.
 *
 * @module platforms/tuya/types
 */

/**
 * Tuya adapter configuration.
 *
 * Required credentials obtained from Tuya IoT Platform.
 *
 * Setup Steps:
 * 1. Create cloud project at https://iot.tuya.com
 * 2. Obtain Access ID and Secret from project overview
 * 3. Link user devices to cloud project
 * 4. Note region-specific base URL
 */
export interface TuyaAdapterConfig {
  /**
   * Tuya Access ID (Client ID).
   *
   * Generated when cloud project is created.
   * Also called "Client ID" in some Tuya documentation.
   */
  accessKey: string;

  /**
   * Tuya Access Secret (Client Secret).
   *
   * Secret key for signing API requests.
   * Keep this secure - treat like a password.
   */
  secretKey: string;

  /**
   * Region-specific API base URL.
   *
   * Available regions:
   * - Americas: https://openapi.tuyaus.com
   * - Europe: https://openapi.tuyaeu.com
   * - China: https://openapi.tuyacn.com
   * - India: https://openapi.tuyain.com
   */
  baseUrl: string;

  /**
   * User ID for device listing.
   *
   * Optional: Used to fetch devices linked to specific user.
   * If not provided, adapter will attempt to retrieve from API.
   */
  userId?: string;
}

/**
 * Tuya device category codes.
 *
 * Common device types in Tuya ecosystem.
 */
export enum TuyaCategory {
  // Lighting
  LIGHT = 'dj', // Light
  LIGHT_STRIP = 'dd', // Light strip
  CEILING_LIGHT = 'xdd', // Ceiling light
  AMBIANCE_LIGHT = 'fwd', // Ambiance light

  // Switches and Outlets
  SWITCH = 'kg', // Switch
  SOCKET = 'cz', // Socket/outlet
  DIMMER = 'tdq', // Dimmer switch
  POWER_STRIP = 'pc', // Power strip

  // Sensors
  PIR_SENSOR = 'pir', // Motion sensor
  DOOR_SENSOR = 'mcs', // Door/window contact sensor
  TEMP_HUMIDITY = 'wsdcg', // Temperature/humidity sensor
  SMOKE_DETECTOR = 'ywbj', // Smoke detector
  WATER_SENSOR = 'sj', // Water leak sensor

  // Climate Control
  THERMOSTAT = 'wk', // Thermostat
  FAN = 'fs', // Fan

  // Covers
  CURTAIN = 'cl', // Curtain/shade

  // Security
  LOCK = 'ms', // Smart lock
  CAMERA = 'sp', // IP camera

  // Others
  AIR_QUALITY = 'kqjcy', // Air quality monitor
  ROBOT_VACUUM = 'sd', // Robot vacuum
}

/**
 * Tuya Data Point (DP) code.
 *
 * DPs represent device functions. Each device has multiple DPs
 * for different capabilities (switch, brightness, color, etc.).
 */
export type TuyaDPCode = string;

/**
 * Tuya Data Point definition.
 *
 * Describes a single DP with its code, type, and value range.
 */
export interface TuyaDataPoint {
  /** DP code (e.g., 'switch_1', 'bright_value') */
  code: TuyaDPCode;
  /** DP value */
  value: unknown;
  /** DP type (Boolean, Integer, String, Enum, Json) */
  type?: string;
  /** Value range (for Integer types) */
  range?: { min: number; max: number };
}

/**
 * Tuya device response from API.
 *
 * Structure returned by GET /v1.0/devices/{device_id}
 * and GET /v1.0/users/{uid}/devices endpoints.
 */
export interface TuyaDevice {
  /** Unique device identifier */
  id: string;
  /** Device name (user-assigned) */
  name: string;
  /** Local key for local API communication */
  local_key?: string;
  /** Device category code */
  category: string;
  /** Product ID (device model) */
  product_id: string;
  /** Product name (device type description) */
  product_name?: string;
  /** Whether device is online */
  online: boolean;
  /** Device status (current DP values) */
  status?: TuyaDataPoint[];
  /** Device icon URL */
  icon?: string;
  /** Device local IP address */
  ip?: string;
  /** Time zone offset */
  time_zone?: string;
  /** Device creation timestamp */
  create_time?: number;
  /** Last update timestamp */
  update_time?: number;
  /** Home ID (location) */
  home_id?: string;
  /** Room ID */
  room_id?: string;
}

/**
 * Tuya device command request.
 *
 * Structure for POST /v1.0/devices/{device_id}/commands
 */
export interface TuyaCommandRequest {
  /** Array of DP commands to execute */
  commands: Array<{
    /** DP code to control */
    code: TuyaDPCode;
    /** Value to set */
    value: unknown;
  }>;
}

/**
 * Tuya device status response.
 *
 * Structure returned by GET /v1.0/devices/{device_id}/status
 */
export interface TuyaStatusResponse {
  /** Array of current DP values */
  result: TuyaDataPoint[];
  /** Success flag */
  success: boolean;
  /** Response timestamp */
  t: number;
}

/**
 * Tuya API response wrapper.
 *
 * All Tuya API endpoints return this structure.
 */
export interface TuyaAPIResponse<T = unknown> {
  /** Response data */
  result: T;
  /** Success flag */
  success: boolean;
  /** Response timestamp */
  t: number;
  /** Error code (if failed) */
  code?: string;
  /** Error message (if failed) */
  msg?: string;
}

/**
 * Tuya home (location) structure.
 *
 * Represents a physical location containing devices.
 */
export interface TuyaHome {
  /** Home ID */
  home_id: string;
  /** Home name */
  name: string;
  /** Geographic location */
  geo_name?: string;
  /** Latitude */
  lat?: number;
  /** Longitude */
  lon?: number;
  /** Room count */
  rooms?: number;
}

/**
 * Tuya room structure.
 *
 * Represents a room within a home.
 */
export interface TuyaRoom {
  /** Room ID */
  room_id: string;
  /** Room name */
  name: string;
  /** Parent home ID */
  home_id: string;
}

/**
 * Tuya scene structure.
 *
 * Represents an automation or scene.
 */
export interface TuyaScene {
  /** Scene ID */
  scene_id: string;
  /** Scene name */
  name: string;
  /** Home ID */
  home_id?: string;
  /** Scene enabled flag */
  enabled?: boolean;
  /** Background image URL */
  background?: string;
}

/**
 * Common Tuya DP codes.
 *
 * Standardized DP codes used across multiple device types.
 */
export const TuyaDPCodes = {
  // Switch controls
  SWITCH_LED: 'switch_led',
  SWITCH_1: 'switch_1',
  SWITCH_2: 'switch_2',
  SWITCH_3: 'switch_3',
  SWITCH_4: 'switch_4',

  // Brightness
  BRIGHT_VALUE: 'bright_value',
  BRIGHT_VALUE_1: 'bright_value_1',
  BRIGHT_VALUE_2: 'bright_value_2',

  // Color
  COLOUR_DATA: 'colour_data',
  COLOUR_DATA_V2: 'colour_data_v2',

  // Color temperature
  TEMP_VALUE: 'temp_value',
  TEMP_VALUE_V2: 'temp_value_v2',

  // Work mode (light)
  WORK_MODE: 'work_mode',

  // Sensors
  PIR: 'pir', // Motion sensor
  DOORCONTACT_STATE: 'doorcontact_state', // Door/window sensor
  TEMP_CURRENT: 'temp_current', // Temperature
  HUMIDITY_VALUE: 'humidity_value', // Humidity
  BATTERY_PERCENTAGE: 'battery_percentage', // Battery level
  SMOKE_SENSOR_STATUS: 'smoke_sensor_status', // Smoke detector
  WATERSENSOR_STATE: 'watersensor_state', // Water leak sensor

  // Energy monitoring
  CUR_POWER: 'cur_power', // Current power (watts)
  CUR_VOLTAGE: 'cur_voltage', // Current voltage
  CUR_CURRENT: 'cur_current', // Current amperage

  // Curtain/shade
  CONTROL: 'control', // Control command (open/close/stop)
  PERCENT_CONTROL: 'percent_control', // Position control
  PERCENT_STATE: 'percent_state', // Current position

  // Lock
  UNLOCK_FINGERPRINT: 'unlock_fingerprint',
  UNLOCK_PASSWORD: 'unlock_password',
  LOCK_STATE: 'lock',

  // Thermostat
  TEMP_SET: 'temp_set', // Target temperature
  MODE: 'mode', // Thermostat mode

  // Camera
  BASIC_FLIP: 'basic_flip',
  MOTION_SWITCH: 'motion_switch',
  RECORD_SWITCH: 'record_switch',

  // Fan
  FAN_SPEED: 'fan_speed',
  FAN_DIRECTION: 'fan_direction',

  // Air quality
  PM25: 'pm25',
  VOC: 'voc',
  CO2: 'co2',
} as const;

/**
 * Tuya light work modes.
 */
export enum TuyaWorkMode {
  WHITE = 'white', // White light only
  COLOUR = 'colour', // RGB color mode
  SCENE = 'scene', // Scene/effect mode
  MUSIC = 'music', // Music sync mode
}
