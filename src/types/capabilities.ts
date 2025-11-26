/**
 * Device capability interfaces and type definitions.
 *
 * Each capability represents a distinct device function with:
 * - Commands: Actions that can be executed
 * - Attributes: State properties that can be read
 * - Metadata: Type information and constraints
 *
 * Design Principles:
 * - Interface-based: Each capability has a dedicated interface
 * - Type-safe: Strong typing for commands and attributes
 * - Discriminated unions: Use 'type' field for type narrowing
 * - Normalized values: Standard ranges (0-100, standard units)
 *
 * @module types/capabilities
 */

import type { DeviceCapability } from './unified-device.js';

/**
 * Event-based capability event structure.
 *
 * Used for capabilities that emit events rather than maintaining persistent state,
 * such as buttons, doorbells, and motion sensors with discrete events.
 *
 * Design Decision: Event Pattern for Transient Actions
 * - Some capabilities represent transient actions (button presses) not persistent state
 * - Event-based pattern allows subscriptions without polling
 * - Timestamp enables event ordering and deduplication
 */
export interface CapabilityEvent<T = unknown> {
  /** Event type identifier */
  eventType: string;
  /** Timestamp when event occurred */
  timestamp: Date;
  /** Event-specific payload data */
  data?: T;
}

/**
 * Event subscription handler type.
 */
export type EventHandler<T = unknown> = (event: CapabilityEvent<T>) => void;

/**
 * Event subscription interface for capabilities.
 *
 * Capabilities with event-based behavior can implement this interface
 * to allow subscribing to device events.
 */
export interface IEventSubscription<T = unknown> {
  /** Subscribe to events */
  subscribe: (handler: EventHandler<T>) => void;
  /** Unsubscribe from events */
  unsubscribe: (handler: EventHandler<T>) => void;
}

/**
 * Capability feature flags for runtime capability detection.
 *
 * Indicates which optional features are supported by a device's capability.
 * Enables runtime detection of supported commands and attributes.
 *
 * Phase 3 Addition: Feature Flags
 * - Allows checking command/attribute support before invocation
 * - Prevents errors from calling unsupported operations
 * - Enables conditional UI rendering based on device capabilities
 */
export interface CapabilityFeatures {
  /** List of supported command names */
  supportedCommands?: ReadonlyArray<string>;
  /** List of supported attribute names */
  supportedAttributes?: ReadonlyArray<string>;
  /** Capability-specific feature flags */
  features?: Readonly<Record<string, unknown>>;
}

/**
 * Base capability interface.
 *
 * All capability-specific interfaces extend this base.
 * The 'type' field enables discriminated union type narrowing.
 *
 * Phase 1 Enhancement: Event-Based Capabilities
 * - Added optional 'events' field for event-based capabilities
 * - Maintains backward compatibility with existing attribute-based capabilities
 *
 * Phase 3 Enhancement: Feature Flags
 * - Added optional 'capabilityFeatures' for runtime capability detection
 * - Enables checking supported commands/attributes before invocation
 */
export interface ICapability {
  /** Capability type discriminator */
  readonly type: DeviceCapability;
  /** Platform-specific capability information (escape hatch) */
  readonly platformSpecific?: Record<string, unknown>;
  /** Optional event subscriptions for event-based capabilities */
  events?: Record<string, IEventSubscription>;
  /** Optional feature flags for runtime capability detection */
  capabilityFeatures?: CapabilityFeatures;
}

//
// Control Capabilities (Actuators)
//

/**
 * Switch capability - Binary on/off control.
 *
 * Platform Mappings:
 * - SmartThings: 'switch' capability
 * - Tuya: 'switch_led' function code
 * - Lutron: OUTPUT with 0% or 100% only
 *
 * Commands: on, off, toggle
 * Attributes: switch (on/off)
 */
export interface ISwitchCapability extends ICapability {
  readonly type: DeviceCapability.SWITCH;
  commands: {
    /** Turn device on */
    on: () => Promise<void>;
    /** Turn device off */
    off: () => Promise<void>;
    /** Toggle current state */
    toggle: () => Promise<void>;
  };
  attributes: {
    /** Current switch state */
    switch: 'on' | 'off';
  };
}

/**
 * Dimmer capability - Level control with 0-100% range.
 *
 * Platform Mappings:
 * - SmartThings: 'switchLevel' capability (0-100)
 * - Tuya: 'bright_value' function code (0-1000, converted to 0-100)
 * - Lutron: OUTPUT (0.00-100.00, rounded to 0-100)
 *
 * Commands: setLevel
 * Attributes: level (0-100)
 */
export interface IDimmerCapability extends ICapability {
  readonly type: DeviceCapability.DIMMER;
  commands: {
    /**
     * Set dimmer level.
     *
     * @param level Brightness level (0-100, where 0=off, 100=max)
     * @param duration Optional transition duration in seconds
     */
    setLevel: (level: number, duration?: number) => Promise<void>;
  };
  attributes: {
    /** Current brightness level (0-100) */
    level: number;
  };
}

/**
 * Color capability - Full RGB/HSV color control.
 *
 * Platform Mappings:
 * - SmartThings: 'colorControl' capability (hue: 0-100, sat: 0-100)
 * - Tuya: 'colour_data' function code (HSV JSON string, converted)
 * - Lutron: ❌ Not supported
 *
 * Commands: setColor, setHue, setSaturation
 * Attributes: hue, saturation, brightness
 *
 * Color Space: HSV (Hue-Saturation-Value)
 * - Hue: 0-360 degrees (red=0, green=120, blue=240)
 * - Saturation: 0-100% (0=white, 100=pure color)
 * - Brightness: 0-100% (0=black, 100=max brightness)
 */
export interface IColorCapability extends ICapability {
  readonly type: DeviceCapability.COLOR;
  commands: {
    /**
     * Set full color.
     *
     * @param hue Hue in degrees (0-360)
     * @param saturation Saturation percentage (0-100)
     * @param brightness Brightness percentage (0-100)
     */
    setColor: (hue: number, saturation: number, brightness: number) => Promise<void>;
    /**
     * Set hue only (keep saturation/brightness unchanged).
     *
     * @param hue Hue in degrees (0-360)
     */
    setHue: (hue: number) => Promise<void>;
    /**
     * Set saturation only (keep hue/brightness unchanged).
     *
     * @param saturation Saturation percentage (0-100)
     */
    setSaturation: (saturation: number) => Promise<void>;
  };
  attributes: {
    /** Current hue (0-360 degrees) */
    hue: number;
    /** Current saturation (0-100%) */
    saturation: number;
    /** Current brightness (0-100%) */
    brightness: number;
  };
}

/**
 * Color temperature capability - White spectrum control.
 *
 * Platform Mappings:
 * - SmartThings: 'colorTemperature' capability (Kelvin)
 * - Tuya: 'temp_value' function code (varies by device)
 * - Lutron: ❌ Not supported
 *
 * Commands: setColorTemperature
 * Attributes: colorTemperature, minKelvin, maxKelvin
 *
 * Color Temperature Scale:
 * - Warm white: 2700K (yellowish)
 * - Neutral white: 4000K
 * - Cool white: 6500K (bluish)
 */
export interface IColorTemperatureCapability extends ICapability {
  readonly type: DeviceCapability.COLOR_TEMPERATURE;
  commands: {
    /**
     * Set color temperature.
     *
     * @param kelvin Color temperature in Kelvin (typically 2700-6500)
     */
    setColorTemperature: (kelvin: number) => Promise<void>;
  };
  attributes: {
    /** Current color temperature in Kelvin */
    colorTemperature: number;
    /** Minimum supported color temperature (device-specific) */
    minKelvin?: number;
    /** Maximum supported color temperature (device-specific) */
    maxKelvin?: number;
  };
}

/**
 * Thermostat mode enumeration.
 */
export enum ThermostatMode {
  OFF = 'off',
  HEAT = 'heat',
  COOL = 'cool',
  AUTO = 'auto',
  ECO = 'eco',
  EMERGENCY_HEAT = 'emergencyHeat',
}

/**
 * Thermostat fan mode enumeration.
 */
export enum ThermostatFanMode {
  AUTO = 'auto',
  ON = 'on',
  CIRCULATE = 'circulate',
}

/**
 * Thermostat operating state enumeration.
 */
export enum ThermostatOperatingState {
  IDLE = 'idle',
  HEATING = 'heating',
  COOLING = 'cooling',
  FAN_ONLY = 'fanOnly',
  PENDING_HEAT = 'pendingHeat',
  PENDING_COOL = 'pendingCool',
}

/**
 * Thermostat capability - Temperature control with multiple modes.
 *
 * Platform Mappings:
 * - SmartThings: Multiple capabilities (thermostat*, 8 separate capabilities)
 * - Tuya: 'temp_set', 'temp_current', 'mode' function codes
 * - Lutron: ❌ Not supported
 *
 * Commands: setHeatingSetpoint, setCoolingSetpoint, setMode, setFanMode
 * Attributes: heatingSetpoint, coolingSetpoint, temperature, mode, fanMode, operatingState, temperatureUnit
 */
export interface IThermostatCapability extends ICapability {
  readonly type: DeviceCapability.THERMOSTAT;
  commands: {
    /**
     * Set heating setpoint temperature.
     *
     * @param temperature Target heating temperature
     * @param unit Temperature unit (C or F)
     */
    setHeatingSetpoint: (temperature: number, unit?: 'C' | 'F') => Promise<void>;
    /**
     * Set cooling setpoint temperature.
     *
     * @param temperature Target cooling temperature
     * @param unit Temperature unit (C or F)
     */
    setCoolingSetpoint: (temperature: number, unit?: 'C' | 'F') => Promise<void>;
    /**
     * Set thermostat mode.
     *
     * @param mode Operating mode
     */
    setMode: (mode: ThermostatMode) => Promise<void>;
    /**
     * Set fan mode.
     *
     * @param mode Fan operating mode
     */
    setFanMode: (mode: ThermostatFanMode) => Promise<void>;
  };
  attributes: {
    /** Current heating setpoint */
    heatingSetpoint: number;
    /** Current cooling setpoint */
    coolingSetpoint: number;
    /** Current measured temperature */
    temperature: number;
    /** Current thermostat mode */
    mode: ThermostatMode;
    /** Current fan mode */
    fanMode: ThermostatFanMode;
    /** Current operating state */
    operatingState: ThermostatOperatingState;
    /** Temperature unit in use */
    temperatureUnit: 'C' | 'F';
  };
}

/**
 * Lock state enumeration.
 */
export enum LockState {
  LOCKED = 'locked',
  UNLOCKED = 'unlocked',
  UNKNOWN = 'unknown',
  JAMMED = 'jammed',
}

/**
 * Lock capability - Lock/unlock control with state tracking.
 *
 * Platform Mappings:
 * - SmartThings: 'lock' capability
 * - Tuya: 'lock_motor_state' function code
 * - Lutron: ❌ Not supported
 *
 * Commands: lock, unlock
 * Attributes: lock, lockMethod
 */
export interface ILockCapability extends ICapability {
  readonly type: DeviceCapability.LOCK;
  commands: {
    /** Lock the device */
    lock: () => Promise<void>;
    /** Unlock the device */
    unlock: () => Promise<void>;
  };
  attributes: {
    /** Current lock state */
    lock: LockState;
    /** Method used for last lock/unlock (e.g., 'keypad', 'manual', 'auto') */
    lockMethod?: string;
  };
}

/**
 * Shade state enumeration.
 */
export enum ShadeState {
  OPEN = 'open',
  CLOSED = 'closed',
  OPENING = 'opening',
  CLOSING = 'closing',
  PARTIALLY_OPEN = 'partiallyOpen',
  UNKNOWN = 'unknown',
}

/**
 * Shade capability - Window covering position and tilt control.
 *
 * Platform Mappings:
 * - SmartThings: 'windowShade' capability
 * - Tuya: 'position' function code
 * - Lutron: POSITION and TILT integration commands
 *
 * Commands: open, close, setPosition, setTilt (optional)
 * Attributes: position, tilt (optional), state
 */
export interface IShadeCapability extends ICapability {
  readonly type: DeviceCapability.SHADE;
  commands: {
    /** Fully open the shade */
    open: () => Promise<void>;
    /** Fully close the shade */
    close: () => Promise<void>;
    /**
     * Set shade position.
     *
     * @param position Position percentage (0=closed, 100=open)
     */
    setPosition: (position: number) => Promise<void>;
    /**
     * Set slat tilt (optional, not all shades support).
     *
     * @param tilt Tilt percentage (0-100)
     */
    setTilt?: (tilt: number) => Promise<void>;
  };
  attributes: {
    /** Current position (0=closed, 100=open) */
    position: number;
    /** Current tilt (0-100, optional) */
    tilt?: number;
    /** Current shade state */
    state: ShadeState;
  };
}

/**
 * Fan mode enumeration (COMPLETE from code review).
 */
export enum FanMode {
  OFF = 'off',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  AUTO = 'auto',
}

/**
 * Fan capability - Fan speed control (COMPLETE from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'fanSpeed' capability
 * - Tuya: 'fan_speed' function code
 * - Lutron: FAN_SPEED (RadioRA3)
 *
 * Commands: setSpeed
 * Attributes: speed
 */
export interface IFanCapability extends ICapability {
  readonly type: DeviceCapability.FAN;
  commands: {
    /**
     * Set fan speed.
     *
     * @param speed Fan speed (0-100 or mode enum)
     */
    setSpeed: (speed: number | FanMode) => Promise<void>;
  };
  attributes: {
    /** Current fan speed (0-100) or mode */
    speed: number | FanMode;
  };
}

/**
 * Valve state enumeration (ADDED from code review).
 */
export enum ValveState {
  OPEN = 'open',
  CLOSED = 'closed',
  OPENING = 'opening',
  CLOSING = 'closing',
  UNKNOWN = 'unknown',
}

/**
 * Valve capability - Water/gas valve control (COMPLETE from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'valve' capability
 * - Tuya: 'switch_1' function code (for water valves)
 * - Lutron: ❌ Not supported
 *
 * Commands: open, close
 * Attributes: valve
 */
export interface IValveCapability extends ICapability {
  readonly type: DeviceCapability.VALVE;
  commands: {
    /** Open the valve */
    open: () => Promise<void>;
    /** Close the valve */
    close: () => Promise<void>;
  };
  attributes: {
    /** Current valve state */
    valve: ValveState;
  };
}

/**
 * Alarm capability - Security alarm control.
 *
 * Platform Mappings:
 * - SmartThings: 'alarm' capability
 * - Tuya: 'alarm_switch' function code
 * - Lutron: ❌ Not supported
 *
 * Commands: siren, strobe, both, off
 * Attributes: alarm
 */
export interface IAlarmCapability extends ICapability {
  readonly type: DeviceCapability.ALARM;
  commands: {
    /** Sound siren */
    siren: () => Promise<void>;
    /** Activate strobe light */
    strobe: () => Promise<void>;
    /** Activate both siren and strobe */
    both: () => Promise<void>;
    /** Turn off alarm */
    off: () => Promise<void>;
  };
  attributes: {
    /** Current alarm state */
    alarm: 'off' | 'siren' | 'strobe' | 'both';
  };
}

//
// Sensor Capabilities (Read-only)
//

/**
 * Temperature sensor capability - Temperature reading.
 *
 * Platform Mappings:
 * - SmartThings: 'temperatureMeasurement' capability
 * - Tuya: 'temp_current' function code
 * - Lutron: ❌ Not supported
 *
 * Attributes: temperature, unit
 */
export interface ITemperatureSensorCapability extends ICapability {
  readonly type: DeviceCapability.TEMPERATURE_SENSOR;
  attributes: {
    /** Current temperature reading */
    temperature: number;
    /** Temperature unit */
    unit: 'C' | 'F' | 'K';
  };
}

/**
 * Humidity sensor capability - Humidity reading.
 *
 * Platform Mappings:
 * - SmartThings: 'relativeHumidityMeasurement' capability
 * - Tuya: 'humidity_value' function code
 * - Lutron: ❌ Not supported
 *
 * Attributes: humidity
 */
export interface IHumiditySensorCapability extends ICapability {
  readonly type: DeviceCapability.HUMIDITY_SENSOR;
  attributes: {
    /** Relative humidity percentage (0-100) */
    humidity: number;
  };
}

/**
 * Motion sensor capability - Motion detection.
 *
 * Platform Mappings:
 * - SmartThings: 'motionSensor' capability
 * - Tuya: 'pir' function code
 * - Lutron: ❌ Not supported
 *
 * Attributes: motion
 */
export interface IMotionSensorCapability extends ICapability {
  readonly type: DeviceCapability.MOTION_SENSOR;
  attributes: {
    /** Motion detection state */
    motion: 'active' | 'inactive';
  };
}

/**
 * Contact sensor capability - Open/closed detection.
 *
 * Platform Mappings:
 * - SmartThings: 'contactSensor' capability
 * - Tuya: 'doorcontact_state' function code
 * - Lutron: ❌ Not supported
 *
 * Attributes: contact
 */
export interface IContactSensorCapability extends ICapability {
  readonly type: DeviceCapability.CONTACT_SENSOR;
  attributes: {
    /** Contact state */
    contact: 'open' | 'closed';
  };
}

/**
 * Occupancy sensor capability - Room occupancy detection.
 *
 * Platform Mappings:
 * - SmartThings: ❌ Not standard
 * - Tuya: ❌ Not standard
 * - Lutron: OCCUPANCY sensor
 *
 * Attributes: occupancy
 */
export interface IOccupancySensorCapability extends ICapability {
  readonly type: DeviceCapability.OCCUPANCY_SENSOR;
  attributes: {
    /** Occupancy state */
    occupancy: 'occupied' | 'unoccupied' | 'unknown';
  };
}

/**
 * Illuminance sensor capability - Light level measurement.
 *
 * Platform Mappings:
 * - SmartThings: 'illuminanceMeasurement' capability
 * - Tuya: 'bright_value' function code (for sensors)
 * - Lutron: ❌ Not supported
 *
 * Attributes: illuminance
 */
export interface IIlluminanceSensorCapability extends ICapability {
  readonly type: DeviceCapability.ILLUMINANCE_SENSOR;
  attributes: {
    /** Light level in lux */
    illuminance: number;
  };
}

/**
 * Battery capability - Battery level monitoring.
 *
 * Platform Mappings:
 * - SmartThings: 'battery' capability
 * - Tuya: 'battery_percentage' function code
 * - Lutron: ❌ Not supported
 *
 * Attributes: battery
 */
export interface IBatteryCapability extends ICapability {
  readonly type: DeviceCapability.BATTERY;
  attributes: {
    /** Battery level percentage (0-100) */
    battery: number;
  };
}

/**
 * Air quality sensor capability - Air quality measurement (ADDED from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'airQualitySensor' capability
 * - Tuya: 'pm25_value', 'co2_value', 'voc_value' function codes
 * - Lutron: ❌ Not supported
 *
 * Attributes: airQualityIndex, pm25, co2, voc
 */
export interface IAirQualitySensorCapability extends ICapability {
  readonly type: DeviceCapability.AIR_QUALITY_SENSOR;
  attributes: {
    /** Air quality index (AQI) */
    airQualityIndex?: number;
    /** PM2.5 particulate matter (µg/m³) */
    pm25?: number;
    /** CO2 level (ppm) */
    co2?: number;
    /** Volatile organic compounds (ppb) */
    voc?: number;
  };
}

/**
 * Water leak sensor capability - Water leak detection (ADDED from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'waterSensor' capability
 * - Tuya: 'watersensor_state' function code
 * - Lutron: ❌ Not supported
 *
 * Attributes: water
 */
export interface IWaterLeakSensorCapability extends ICapability {
  readonly type: DeviceCapability.WATER_LEAK_SENSOR;
  attributes: {
    /** Water detection state */
    water: 'dry' | 'wet';
  };
}

/**
 * Smoke detector capability - Smoke detection (ADDED from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'smokeDetector' capability
 * - Tuya: 'smoke_sensor_status' function code
 * - Lutron: ❌ Not supported
 *
 * Attributes: smoke
 */
export interface ISmokeDetectorCapability extends ICapability {
  readonly type: DeviceCapability.SMOKE_DETECTOR;
  attributes: {
    /** Smoke detection state */
    smoke: 'clear' | 'detected' | 'tested';
  };
}

//
// Composite Capabilities
//

/**
 * Energy meter capability - Power consumption monitoring (COMPLETE from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'powerMeter', 'energyMeter' capabilities
 * - Tuya: 'cur_power', 'cur_voltage', 'cur_current' function codes
 * - Lutron: ❌ Not supported
 *
 * Attributes: power, energy, voltage, current
 */
export interface IEnergyMeterCapability extends ICapability {
  readonly type: DeviceCapability.ENERGY_METER;
  attributes: {
    /** Current power consumption in watts */
    power: number;
    /** Total energy consumption in kWh */
    energy?: number;
    /** Current voltage in volts */
    voltage?: number;
    /** Current in amperes */
    current?: number;
  };
}

/**
 * Speaker capability - Audio playback control (ADDED from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'audioVolume', 'audioMute' capabilities
 * - Tuya: 'volume', 'mute' function codes
 * - Lutron: ❌ Not supported
 *
 * Commands: setVolume, mute, unmute
 * Attributes: volume, muted
 */
export interface ISpeakerCapability extends ICapability {
  readonly type: DeviceCapability.SPEAKER;
  commands: {
    /**
     * Set volume level.
     *
     * @param volume Volume level (0-100)
     */
    setVolume: (volume: number) => Promise<void>;
    /** Mute audio */
    mute: () => Promise<void>;
    /** Unmute audio */
    unmute: () => Promise<void>;
  };
  attributes: {
    /** Current volume level (0-100) */
    volume: number;
    /** Mute state */
    muted: boolean;
  };
}

/**
 * Media player capability - Media playback control (ADDED from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'mediaPlayback' capability
 * - Tuya: 'work_state' function code
 * - Lutron: ❌ Not supported
 *
 * Commands: play, pause, stop, next, previous
 * Attributes: playbackStatus
 */
export interface IMediaPlayerCapability extends ICapability {
  readonly type: DeviceCapability.MEDIA_PLAYER;
  commands: {
    /** Start playback */
    play: () => Promise<void>;
    /** Pause playback */
    pause: () => Promise<void>;
    /** Stop playback */
    stop: () => Promise<void>;
    /** Next track */
    next: () => Promise<void>;
    /** Previous track */
    previous: () => Promise<void>;
  };
  attributes: {
    /** Current playback status */
    playbackStatus: 'playing' | 'paused' | 'stopped';
  };
}

/**
 * Camera capability - Video stream and snapshot (ADDED from code review).
 *
 * Platform Mappings:
 * - SmartThings: 'videoStream', 'imageCapture' capabilities
 * - Tuya: 'basic_device_status' function code
 * - Lutron: ❌ Not supported
 *
 * Commands: captureSnapshot, startStream, stopStream
 * Attributes: streamUrl, snapshotUrl
 */
export interface ICameraCapability extends ICapability {
  readonly type: DeviceCapability.CAMERA;
  commands: {
    /** Capture a snapshot image */
    captureSnapshot: () => Promise<string>; // Returns image URL
    /** Start video stream */
    startStream: () => Promise<string>; // Returns stream URL
    /** Stop video stream */
    stopStream: () => Promise<void>;
  };
  attributes: {
    /** Video stream URL (if streaming) */
    streamUrl?: string;
    /** Last snapshot URL */
    snapshotUrl?: string;
    /** Camera online status */
    recording?: boolean;
  };
}

//
// Phase 1: New Capabilities (7 additions)
//

/**
 * Door state enumeration.
 */
export enum DoorState {
  OPEN = 'open',
  CLOSED = 'closed',
  OPENING = 'opening',
  CLOSING = 'closing',
  UNKNOWN = 'unknown',
}

/**
 * Door control capability - Garage door/gate momentary control.
 *
 * Platform Mappings:
 * - SmartThings: 'doorControl' and 'garageDoorControl' capabilities
 * - Tuya: Category 'ckmkzq' (garage door opener)
 * - Lutron: ❌ Not supported
 *
 * Commands: open, close
 * Attributes: door
 *
 * Key Difference from LOCK:
 * - LOCK: State-based (locked/unlocked) with confirmation
 * - DOOR_CONTROL: Momentary trigger (may not know final state immediately)
 *
 * Design Decision: Momentary vs. State-Based
 * - Garage doors use momentary triggers (like physical button press)
 * - State may be uncertain during operation (opening/closing)
 * - Optional obstruction detection for safety
 */
export interface IDoorControlCapability extends ICapability {
  readonly type: DeviceCapability.DOOR_CONTROL;
  commands: {
    /** Trigger door opening (momentary command) */
    open: () => Promise<void>;
    /** Trigger door closing (momentary command) */
    close: () => Promise<void>;
  };
  attributes: {
    /** Current door state */
    door: DoorState;
    /** Obstruction detected (optional safety feature) */
    obstructionDetected?: boolean;
  };
}

/**
 * Button event data structure.
 */
export interface ButtonEventData {
  /** Button number/identifier (1-based for multi-button devices) */
  button: number;
  /** Button action type */
  value: 'pushed' | 'held' | 'double' | 'released' | 'pushed_2x' | 'pushed_3x';
  /** Optional sequence number for deduplication */
  sequenceNumber?: number;
}

/**
 * Button capability - Button press events (event-based).
 *
 * Platform Mappings:
 * - SmartThings: 'button' capability with button events
 * - Tuya: Category 'cjkg' (scene switch)
 * - Lutron: Pico remotes (platform-specific)
 *
 * Events: buttonEvent (pressed, held, double, released)
 * Attributes: numberOfButtons, supportedButtonValues
 *
 * Design Decision: Event-Based vs. Attribute-Based
 * - Buttons represent transient actions, not persistent state
 * - Event-based pattern prevents polling and enables immediate response
 * - Supports multi-button devices (scene switches, remotes)
 *
 * Important: This is an EVENT-BASED capability
 * - No commands (buttons are triggers, not controllable)
 * - Attributes describe capabilities, not current state
 * - Use events.buttonEvent.subscribe() to listen for button presses
 */
export interface IButtonCapability extends ICapability {
  readonly type: DeviceCapability.BUTTON;
  attributes: {
    /** Number of buttons on device (1-6 typical for scene switches) */
    numberOfButtons: number;
    /** Supported button action types */
    supportedButtonValues: ReadonlyArray<string>;
  };
  /** Button press event subscriptions */
  events: {
    buttonEvent: IEventSubscription<ButtonEventData>;
  };
}

/**
 * Pressure sensor capability - Barometric pressure measurement.
 *
 * Platform Mappings:
 * - SmartThings: 'pressureMeasurement' capability
 * - Tuya: Category 'ylcg' (pressure sensor)
 * - Lutron: ❌ Not supported
 *
 * Attributes: pressure, unit
 *
 * Use Cases:
 * - Weather stations
 * - Altitude sensors
 * - Environmental monitoring
 */
export interface IPressureSensorCapability extends ICapability {
  readonly type: DeviceCapability.PRESSURE_SENSOR;
  attributes: {
    /** Barometric pressure reading */
    pressure: number;
    /** Pressure unit */
    unit: 'mbar' | 'hPa' | 'inHg' | 'mmHg';
  };
}

/**
 * Carbon monoxide detector capability - CO detection.
 *
 * Platform Mappings:
 * - SmartThings: 'carbonMonoxideDetector' capability
 * - Tuya: Unknown (likely exists)
 * - Lutron: ❌ Not supported
 *
 * Attributes: carbonMonoxide, coLevel (optional)
 *
 * Safety Note: This is a safety-critical capability
 * - 'detected' state should trigger immediate alerts
 * - 'tested' state indicates user-initiated self-test
 * - Optional CO level in ppm for advanced sensors
 */
export interface ICoDetectorCapability extends ICapability {
  readonly type: DeviceCapability.CO_DETECTOR;
  attributes: {
    /** CO detection state */
    carbonMonoxide: 'clear' | 'detected' | 'tested';
    /** Optional CO level in parts per million (ppm) */
    coLevel?: number;
  };
}

/**
 * Sound sensor capability - Sound pressure level measurement.
 *
 * Platform Mappings:
 * - SmartThings: 'soundPressureLevel' capability
 * - Tuya: Unknown
 * - Lutron: ❌ Not supported
 *
 * Attributes: soundPressureLevel
 *
 * Use Cases:
 * - Noise monitoring
 * - Sound-activated automation
 * - Occupancy detection (indirect)
 */
export interface ISoundSensorCapability extends ICapability {
  readonly type: DeviceCapability.SOUND_SENSOR;
  attributes: {
    /** Sound pressure level in decibels (dB) */
    soundPressureLevel: number;
  };
}

/**
 * Robot vacuum cleaning state enumeration.
 */
export enum RobotVacuumState {
  IDLE = 'idle',
  CLEANING = 'cleaning',
  PAUSED = 'paused',
  DOCKED = 'docked',
  RETURNING = 'returning',
  ERROR = 'error',
}

/**
 * Robot vacuum fan speed enumeration.
 */
export enum RobotVacuumFanSpeed {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  AUTO = 'auto',
  MAX = 'max',
}

/**
 * Robot vacuum capability - Vacuum cleaner control.
 *
 * Platform Mappings:
 * - SmartThings: 'robotCleanerMovement', 'robotCleanerCleaningMode' capabilities
 * - Tuya: Category 'sd' (robot vacuum)
 * - Lutron: ❌ Not supported
 *
 * Commands: start, pause, stop, returnToDock
 * Attributes: cleaningState, batteryLevel, fanSpeed
 *
 * Design Note: Composite Capability
 * - Combines movement control, cleaning modes, and battery monitoring
 * - Battery level duplicates BATTERY capability but included for convenience
 * - Fan speed controls suction power
 */
export interface IRobotVacuumCapability extends ICapability {
  readonly type: DeviceCapability.ROBOT_VACUUM;
  commands: {
    /** Start cleaning cycle */
    start: () => Promise<void>;
    /** Pause current cleaning cycle */
    pause: () => Promise<void>;
    /** Stop cleaning and stay in place */
    stop: () => Promise<void>;
    /** Return to charging dock */
    returnToDock: () => Promise<void>;
  };
  attributes: {
    /** Current cleaning state */
    cleaningState: RobotVacuumState;
    /** Battery level (0-100%) */
    batteryLevel: number;
    /** Current fan/suction speed */
    fanSpeed: RobotVacuumFanSpeed;
    /** Optional error message when state is ERROR */
    errorMessage?: string;
  };
}

/**
 * IR blaster capability - Infrared remote control.
 *
 * Platform Mappings:
 * - SmartThings: 'infraredLevel' capability
 * - Tuya: Unknown category
 * - Lutron: ❌ Not supported
 *
 * Commands: sendIRCommand, learnIRCommand (optional)
 * Attributes: infraredLevel (optional), supportedCommands
 *
 * Design Challenge: Platform-Specific IR Codes
 * - IR codes are device-specific and hard to standardize
 * - Code format varies (Pronto, NEC, RC5, etc.)
 * - Learning mode is optional and platform-dependent
 *
 * Use Cases:
 * - Universal remote control
 * - Legacy device integration (TVs, ACs, etc.)
 * - Macro automation (send multiple IR commands)
 */
export interface IIrBlasterCapability extends ICapability {
  readonly type: DeviceCapability.IR_BLASTER;
  commands: {
    /**
     * Send IR command code.
     *
     * @param code IR code string (format varies by platform)
     */
    sendIRCommand: (code: string) => Promise<void>;
    /**
     * Learn IR command from physical remote (optional).
     *
     * @param name Friendly name for learned command
     * @returns Learned IR code
     */
    learnIRCommand?: (name: string) => Promise<string>;
  };
  attributes: {
    /** Optional IR signal strength/level */
    infraredLevel?: number;
    /** List of learned/supported IR command names */
    supportedCommands: ReadonlyArray<string>;
  };
}

/**
 * Union type of all capability interfaces.
 *
 * Used for type narrowing in adapter implementations.
 * The 'type' field enables discriminated union pattern.
 *
 * Phase 1 Update: Added 7 new capability interfaces
 * - IDoorControlCapability (garage doors)
 * - IButtonCapability (event-based button presses)
 * - IPressureSensorCapability (barometric pressure)
 * - ICoDetectorCapability (carbon monoxide)
 * - ISoundSensorCapability (sound level)
 * - IRobotVacuumCapability (vacuum cleaners)
 * - IIrBlasterCapability (IR remote control)
 *
 * @example
 * ```typescript
 * function getCapabilityCommands(cap: UnifiedCapabilityInterface): string[] {
 *   switch (cap.type) {
 *     case DeviceCapability.SWITCH:
 *       return ['on', 'off', 'toggle'];
 *     case DeviceCapability.DIMMER:
 *       return ['setLevel'];
 *     case DeviceCapability.DOOR_CONTROL:
 *       return ['open', 'close'];
 *     // ... TypeScript ensures exhaustive checking
 *   }
 * }
 * ```
 */
export type UnifiedCapabilityInterface =
  | ISwitchCapability
  | IDimmerCapability
  | IColorCapability
  | IColorTemperatureCapability
  | IThermostatCapability
  | ILockCapability
  | IShadeCapability
  | IFanCapability
  | IValveCapability
  | IAlarmCapability
  | ITemperatureSensorCapability
  | IHumiditySensorCapability
  | IMotionSensorCapability
  | IContactSensorCapability
  | IOccupancySensorCapability
  | IIlluminanceSensorCapability
  | IBatteryCapability
  | IAirQualitySensorCapability
  | IWaterLeakSensorCapability
  | ISmokeDetectorCapability
  | IEnergyMeterCapability
  | ISpeakerCapability
  | IMediaPlayerCapability
  | ICameraCapability
  | IDoorControlCapability
  | IButtonCapability
  | IPressureSensorCapability
  | ICoDetectorCapability
  | ISoundSensorCapability
  | IRobotVacuumCapability
  | IIrBlasterCapability;
