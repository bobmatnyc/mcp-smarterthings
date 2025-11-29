/**
 * Lutron platform type definitions.
 *
 * Defines Lutron-specific configuration, device structures, and LEAP protocol types
 * for the Lutron Caseta Smart Bridge integration.
 *
 * @module platforms/lutron/types
 */

/**
 * Lutron adapter configuration.
 *
 * Required for LEAP protocol connection to Smart Bridge.
 *
 * Setup Steps:
 * 1. Discover Smart Bridge IP using BridgeFinder or router DHCP
 * 2. Pair with Smart Bridge using lap-pair utility:
 *    `npx lap-pair <bridge-ip>`
 * 3. Press button on back of Smart Bridge when prompted
 * 4. Save generated certificate files to secure location
 * 5. Configure adapter with certificate paths
 */
export interface LutronAdapterConfig {
  /**
   * Smart Bridge IP address or hostname.
   *
   * Example: '192.168.1.100'
   * Default port: 8081 (LEAP protocol)
   */
  smartBridgeHost: string;

  /**
   * Path to client certificate file (caseta.crt).
   *
   * Generated during pairing process.
   * Used for TLS client authentication.
   */
  certificatePath: string;

  /**
   * Path to client private key file (caseta.key).
   *
   * Generated during pairing process.
   * Keep this file secure - contains private key material.
   */
  privateKeyPath: string;

  /**
   * Path to bridge CA certificate file (caseta-bridge.crt).
   *
   * Generated during pairing process.
   * Used to verify Smart Bridge identity.
   */
  caCertificatePath: string;

  /**
   * Optional Smart Bridge port.
   *
   * Default: 8081 (LEAP protocol standard port)
   */
  port?: number;
}

/**
 * Lutron device types from LEAP protocol.
 *
 * Device type identifiers as returned by Smart Bridge.
 */
export enum LutronDeviceType {
  // Control devices
  WALL_DIMMER = 'WallDimmer',
  WALL_SWITCH = 'WallSwitch',
  PLUG_IN_DIMMER = 'PlugInDimmer',

  // Shades and blinds
  SERENA_HONEYCOMB_SHADE = 'SerenaHoneycombShade',
  SERENA_ROLLER_SHADE = 'SerenaRollerShade',
  SERENA_WOOD_BLIND = 'SerenaWoodBlind',
  TRIATHLON_HONEYCOMB_SHADE = 'TriathlonHoneycombShade',

  // Fan control
  CASETA_FAN_SPEED_CONTROLLER = 'CasetaFanSpeedController',

  // Remotes and keypads
  PICO_KEYPAD = 'PicoKeypad',
  SEETOUCH_KEYPAD = 'seeTouchKeypad',

  // Sensors
  OCCUPANCY_SENSOR = 'OccupancySensor',
  MOTION_SENSOR = 'MotionSensor',
}

/**
 * Lutron zone information.
 *
 * Zones represent control points (lights, shades) in LEAP protocol.
 */
export interface LutronZone {
  /** Zone ID (unique identifier) */
  id: string;

  /** Zone name (user-assigned) */
  name: string;

  /** Parent area ID (room) */
  area?: string;

  /** Device type */
  type: LutronDeviceType;

  /** Current level (0-100 for dimmers, 0 or 100 for switches) */
  level?: number;

  /** Zone href (LEAP resource path) */
  href?: string;
}

/**
 * Lutron area information.
 *
 * Areas represent rooms or zones in the Smart Bridge configuration.
 */
export interface LutronArea {
  /** Area ID (unique identifier) */
  id: string;

  /** Area name (user-assigned room name) */
  name: string;

  /** Parent area ID (for nested areas) */
  parent?: string;

  /** Area href (LEAP resource path) */
  href?: string;
}

/**
 * Lutron button group information.
 *
 * Button groups represent Pico remotes and keypads.
 */
export interface LutronButtonGroup {
  /** Button group ID */
  id: string;

  /** Button group name */
  name: string;

  /** Parent area ID */
  area?: string;

  /** Device type (PicoKeypad, seeTouchKeypad) */
  type: LutronDeviceType;

  /** Button definitions */
  buttons?: LutronButton[];
}

/**
 * Lutron button definition.
 *
 * Represents a single button on a Pico remote or keypad.
 */
export interface LutronButton {
  /** Button number */
  number: number;

  /** Button name (e.g., 'On', 'Off', 'Raise', 'Lower') */
  name?: string;

  /** Button href (LEAP resource path) */
  href?: string;
}

/**
 * Lutron button event action types.
 */
export enum LutronButtonAction {
  /** Single button press */
  PUSHED = 'pushed',

  /** Button held down */
  HELD = 'held',

  /** Button released after hold */
  RELEASED = 'released',
}

/**
 * Lutron button event.
 *
 * Emitted when a button on a Pico remote or keypad is pressed.
 */
export interface LutronButtonEvent {
  /** Device (button group) ID */
  deviceId: string;

  /** Button number */
  buttonNumber: number;

  /** Action type (pushed, held, released) */
  action: LutronButtonAction;

  /** Event timestamp */
  timestamp: Date;
}

/**
 * Lutron occupancy sensor information.
 *
 * Occupancy sensors detect presence in a room.
 */
export interface LutronOccupancySensor {
  /** Sensor ID */
  id: string;

  /** Sensor name */
  name: string;

  /** Parent area ID */
  area?: string;

  /** Current occupancy state */
  occupied?: boolean;

  /** Sensor href (LEAP resource path) */
  href?: string;
}

/**
 * Lutron device from LEAP protocol.
 *
 * Combined device structure representing all LEAP device types.
 */
export interface LutronDevice {
  /** Device ID */
  id: string;

  /** Device name (user-assigned) */
  name: string;

  /** Device type */
  type: LutronDeviceType;

  /** Parent area ID (room) */
  area?: string;

  /** Zone information (for control devices) */
  zone?: LutronZone;

  /** Button group information (for Pico remotes) */
  buttonGroup?: LutronButtonGroup;

  /** Occupancy sensor information */
  occupancySensor?: LutronOccupancySensor;

  /** Device href (LEAP resource path) */
  href?: string;

  /** Serial number */
  serialNumber?: string;

  /** Model number */
  modelNumber?: string;
}

/**
 * Lutron scene (virtual button).
 *
 * Scenes in Lutron are virtual buttons that trigger pre-configured actions.
 */
export interface LutronScene {
  /** Scene ID */
  id: string;

  /** Scene name */
  name: string;

  /** Parent area ID */
  area?: string;

  /** Scene href (LEAP resource path) */
  href?: string;
}

/**
 * LEAP zone status update.
 *
 * Event data for zone status changes.
 */
export interface LEAPZoneStatus {
  /** Zone ID */
  zoneId: string;

  /** New level (0-100) */
  level: number;

  /** Timestamp */
  timestamp: Date;
}

/**
 * LEAP occupancy update.
 *
 * Event data for occupancy sensor changes.
 */
export interface LEAPOccupancyUpdate {
  /** Sensor ID */
  sensorId: string;

  /** Occupancy state */
  occupied: boolean;

  /** Timestamp */
  timestamp: Date;
}

/**
 * LEAP connection options.
 *
 * Options for SmartBridge connection.
 */
export interface LEAPConnectionOptions {
  /** Smart Bridge host */
  host: string;

  /** Smart Bridge port (default: 8081) */
  port?: number;

  /** CA certificate (bridge certificate) */
  ca: Buffer | string;

  /** Client certificate */
  cert: Buffer | string;

  /** Client private key */
  key: Buffer | string;

  /** Connection timeout in milliseconds */
  timeout?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Pico remote button configurations.
 *
 * Standard button layouts for different Pico remote models.
 */
export const PicoButtonLayouts = {
  /** 2-button Pico (On/Off) */
  TWO_BUTTON: {
    ON: 2,
    OFF: 4,
  },

  /** 3-button Pico (On/Favorite/Off) */
  THREE_BUTTON: {
    ON: 2,
    FAVORITE: 3,
    OFF: 4,
  },

  /** 3-button with raise/lower (On/Raise/Lower/Off) */
  THREE_BUTTON_RAISE_LOWER: {
    ON: 2,
    RAISE: 5,
    LOWER: 6,
    OFF: 4,
  },

  /** 5-button Audio Pico (for Sonos) */
  FIVE_BUTTON_AUDIO: {
    ON: 2,
    FAVORITE_1: 3,
    FAVORITE_2: 4,
    FAVORITE_3: 5,
    OFF: 6,
  },
} as const;

/**
 * Fan speed levels for Caseta Fan Speed Controller.
 */
export enum LutronFanSpeed {
  OFF = 0,
  LOW = 25,
  MEDIUM_LOW = 50,
  MEDIUM_HIGH = 75,
  HIGH = 100,
}
