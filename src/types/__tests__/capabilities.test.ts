/**
 * Unit tests for capability interfaces and enums.
 *
 * Tests:
 * - Event-based capability pattern
 * - New capability enums (DoorState, RobotVacuumState, etc.)
 * - New capability interfaces (7 additions)
 * - UnifiedCapabilityInterface union type
 * - Capability feature flags
 */

import { describe, it, expect } from 'vitest';
import { DeviceCapability } from '../unified-device.js';
import {
  // Event types
  type CapabilityEvent,
  type EventHandler,
  type IEventSubscription,
  type CapabilityFeatures,
  // New enums
  DoorState,
  RobotVacuumState,
  RobotVacuumFanSpeed,
  // New interfaces
  type IDoorControlCapability,
  type IButtonCapability,
  type IPressureSensorCapability,
  type ICoDetectorCapability,
  type ISoundSensorCapability,
  type IRobotVacuumCapability,
  type IIrBlasterCapability,
  type ButtonEventData,
  // Union type
  type UnifiedCapabilityInterface,
} from '../capabilities.js';

describe('Capability Enums', () => {
  describe('DoorState enum', () => {
    it('should have all door states', () => {
      expect(DoorState.OPEN).toBe('open');
      expect(DoorState.CLOSED).toBe('closed');
      expect(DoorState.OPENING).toBe('opening');
      expect(DoorState.CLOSING).toBe('closing');
      expect(DoorState.UNKNOWN).toBe('unknown');
    });

    it('should have exactly 5 states', () => {
      const states = Object.values(DoorState);
      expect(states).toHaveLength(5);
    });
  });

  describe('RobotVacuumState enum', () => {
    it('should have all vacuum states', () => {
      expect(RobotVacuumState.IDLE).toBe('idle');
      expect(RobotVacuumState.CLEANING).toBe('cleaning');
      expect(RobotVacuumState.PAUSED).toBe('paused');
      expect(RobotVacuumState.DOCKED).toBe('docked');
      expect(RobotVacuumState.RETURNING).toBe('returning');
      expect(RobotVacuumState.ERROR).toBe('error');
    });

    it('should have exactly 6 states', () => {
      const states = Object.values(RobotVacuumState);
      expect(states).toHaveLength(6);
    });
  });

  describe('RobotVacuumFanSpeed enum', () => {
    it('should have all fan speed modes', () => {
      expect(RobotVacuumFanSpeed.LOW).toBe('low');
      expect(RobotVacuumFanSpeed.MEDIUM).toBe('medium');
      expect(RobotVacuumFanSpeed.HIGH).toBe('high');
      expect(RobotVacuumFanSpeed.AUTO).toBe('auto');
      expect(RobotVacuumFanSpeed.MAX).toBe('max');
    });

    it('should have exactly 5 speed modes', () => {
      const modes = Object.values(RobotVacuumFanSpeed);
      expect(modes).toHaveLength(5);
    });
  });
});

describe('Event-Based Capability Pattern', () => {
  describe('CapabilityEvent', () => {
    it('should create valid capability event', () => {
      const event: CapabilityEvent<ButtonEventData> = {
        eventType: 'buttonEvent',
        timestamp: new Date(),
        data: {
          button: 1,
          value: 'pushed',
        },
      };

      expect(event.eventType).toBe('buttonEvent');
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.data?.button).toBe(1);
      expect(event.data?.value).toBe('pushed');
    });

    it('should allow events without data', () => {
      const event: CapabilityEvent = {
        eventType: 'genericEvent',
        timestamp: new Date(),
      };

      expect(event.data).toBeUndefined();
    });
  });

  describe('EventHandler', () => {
    it('should accept event handler function', () => {
      const handler: EventHandler<ButtonEventData> = (event) => {
        expect(event.eventType).toBe('buttonEvent');
        expect(event.data).toBeDefined();
      };

      const event: CapabilityEvent<ButtonEventData> = {
        eventType: 'buttonEvent',
        timestamp: new Date(),
        data: { button: 1, value: 'pushed' },
      };

      handler(event);
    });
  });

  describe('IEventSubscription', () => {
    it('should define subscription interface', () => {
      const subscribers: EventHandler<ButtonEventData>[] = [];

      const subscription: IEventSubscription<ButtonEventData> = {
        subscribe: (handler) => {
          subscribers.push(handler);
        },
        unsubscribe: (handler) => {
          const index = subscribers.indexOf(handler);
          if (index >= 0) {
            subscribers.splice(index, 1);
          }
        },
      };

      const handler: EventHandler<ButtonEventData> = () => {};

      subscription.subscribe(handler);
      expect(subscribers).toHaveLength(1);

      subscription.unsubscribe(handler);
      expect(subscribers).toHaveLength(0);
    });
  });
});

describe('New Capability Interfaces', () => {
  describe('IDoorControlCapability', () => {
    it('should create valid door control capability', () => {
      const capability: IDoorControlCapability = {
        type: DeviceCapability.DOOR_CONTROL,
        commands: {
          open: async () => {},
          close: async () => {},
        },
        attributes: {
          door: DoorState.CLOSED,
        },
      };

      expect(capability.type).toBe(DeviceCapability.DOOR_CONTROL);
      expect(capability.attributes.door).toBe(DoorState.CLOSED);
      expect(typeof capability.commands.open).toBe('function');
      expect(typeof capability.commands.close).toBe('function');
    });

    it('should support optional obstruction detection', () => {
      const capability: IDoorControlCapability = {
        type: DeviceCapability.DOOR_CONTROL,
        commands: {
          open: async () => {},
          close: async () => {},
        },
        attributes: {
          door: DoorState.OPENING,
          obstructionDetected: true,
        },
      };

      expect(capability.attributes.obstructionDetected).toBe(true);
    });
  });

  describe('IButtonCapability', () => {
    it('should create valid button capability', () => {
      const handlers: EventHandler<ButtonEventData>[] = [];

      const capability: IButtonCapability = {
        type: DeviceCapability.BUTTON,
        attributes: {
          numberOfButtons: 3,
          supportedButtonValues: ['pushed', 'held', 'double'],
        },
        events: {
          buttonEvent: {
            subscribe: (handler) => handlers.push(handler),
            unsubscribe: (handler) => {
              const index = handlers.indexOf(handler);
              if (index >= 0) handlers.splice(index, 1);
            },
          },
        },
      };

      expect(capability.type).toBe(DeviceCapability.BUTTON);
      expect(capability.attributes.numberOfButtons).toBe(3);
      expect(capability.attributes.supportedButtonValues).toHaveLength(3);
      expect(capability.events.buttonEvent).toBeDefined();
    });

    it('should support button event subscription', () => {
      let receivedEvent: CapabilityEvent<ButtonEventData> | undefined;

      const capability: IButtonCapability = {
        type: DeviceCapability.BUTTON,
        attributes: {
          numberOfButtons: 1,
          supportedButtonValues: ['pushed'],
        },
        events: {
          buttonEvent: {
            subscribe: (handler) => {
              // Simulate button press
              handler({
                eventType: 'buttonEvent',
                timestamp: new Date(),
                data: { button: 1, value: 'pushed' },
              });
            },
            unsubscribe: () => {},
          },
        },
      };

      capability.events.buttonEvent.subscribe((event) => {
        receivedEvent = event;
      });

      expect(receivedEvent).toBeDefined();
      if (receivedEvent?.data) {
        expect(receivedEvent.data.button).toBe(1);
        expect(receivedEvent.data.value).toBe('pushed');
      }
    });
  });

  describe('IPressureSensorCapability', () => {
    it('should create valid pressure sensor capability', () => {
      const capability: IPressureSensorCapability = {
        type: DeviceCapability.PRESSURE_SENSOR,
        attributes: {
          pressure: 1013.25,
          unit: 'hPa',
        },
      };

      expect(capability.type).toBe(DeviceCapability.PRESSURE_SENSOR);
      expect(capability.attributes.pressure).toBe(1013.25);
      expect(capability.attributes.unit).toBe('hPa');
    });

    it('should support different pressure units', () => {
      const units: Array<'mbar' | 'hPa' | 'inHg' | 'mmHg'> = ['mbar', 'hPa', 'inHg', 'mmHg'];

      units.forEach((unit) => {
        const capability: IPressureSensorCapability = {
          type: DeviceCapability.PRESSURE_SENSOR,
          attributes: {
            pressure: 1000,
            unit,
          },
        };

        expect(capability.attributes.unit).toBe(unit);
      });
    });
  });

  describe('ICoDetectorCapability', () => {
    it('should create valid CO detector capability', () => {
      const capability: ICoDetectorCapability = {
        type: DeviceCapability.CO_DETECTOR,
        attributes: {
          carbonMonoxide: 'clear',
        },
      };

      expect(capability.type).toBe(DeviceCapability.CO_DETECTOR);
      expect(capability.attributes.carbonMonoxide).toBe('clear');
    });

    it('should support CO level measurement', () => {
      const capability: ICoDetectorCapability = {
        type: DeviceCapability.CO_DETECTOR,
        attributes: {
          carbonMonoxide: 'detected',
          coLevel: 50, // ppm
        },
      };

      expect(capability.attributes.coLevel).toBe(50);
    });

    it('should support all CO states', () => {
      const states: Array<'clear' | 'detected' | 'tested'> = ['clear', 'detected', 'tested'];

      states.forEach((state) => {
        const capability: ICoDetectorCapability = {
          type: DeviceCapability.CO_DETECTOR,
          attributes: {
            carbonMonoxide: state,
          },
        };

        expect(capability.attributes.carbonMonoxide).toBe(state);
      });
    });
  });

  describe('ISoundSensorCapability', () => {
    it('should create valid sound sensor capability', () => {
      const capability: ISoundSensorCapability = {
        type: DeviceCapability.SOUND_SENSOR,
        attributes: {
          soundPressureLevel: 65, // dB
        },
      };

      expect(capability.type).toBe(DeviceCapability.SOUND_SENSOR);
      expect(capability.attributes.soundPressureLevel).toBe(65);
    });
  });

  describe('IRobotVacuumCapability', () => {
    it('should create valid robot vacuum capability', () => {
      const capability: IRobotVacuumCapability = {
        type: DeviceCapability.ROBOT_VACUUM,
        commands: {
          start: async () => {},
          pause: async () => {},
          stop: async () => {},
          returnToDock: async () => {},
        },
        attributes: {
          cleaningState: RobotVacuumState.IDLE,
          batteryLevel: 85,
          fanSpeed: RobotVacuumFanSpeed.AUTO,
        },
      };

      expect(capability.type).toBe(DeviceCapability.ROBOT_VACUUM);
      expect(capability.attributes.cleaningState).toBe(RobotVacuumState.IDLE);
      expect(capability.attributes.batteryLevel).toBe(85);
      expect(capability.attributes.fanSpeed).toBe(RobotVacuumFanSpeed.AUTO);
    });

    it('should support error state with message', () => {
      const capability: IRobotVacuumCapability = {
        type: DeviceCapability.ROBOT_VACUUM,
        commands: {
          start: async () => {},
          pause: async () => {},
          stop: async () => {},
          returnToDock: async () => {},
        },
        attributes: {
          cleaningState: RobotVacuumState.ERROR,
          batteryLevel: 20,
          fanSpeed: RobotVacuumFanSpeed.LOW,
          errorMessage: 'Wheel stuck',
        },
      };

      expect(capability.attributes.cleaningState).toBe(RobotVacuumState.ERROR);
      expect(capability.attributes.errorMessage).toBe('Wheel stuck');
    });

    it('should have all required commands', () => {
      const capability: IRobotVacuumCapability = {
        type: DeviceCapability.ROBOT_VACUUM,
        commands: {
          start: async () => {},
          pause: async () => {},
          stop: async () => {},
          returnToDock: async () => {},
        },
        attributes: {
          cleaningState: RobotVacuumState.CLEANING,
          batteryLevel: 50,
          fanSpeed: RobotVacuumFanSpeed.HIGH,
        },
      };

      expect(typeof capability.commands.start).toBe('function');
      expect(typeof capability.commands.pause).toBe('function');
      expect(typeof capability.commands.stop).toBe('function');
      expect(typeof capability.commands.returnToDock).toBe('function');
    });
  });

  describe('IIrBlasterCapability', () => {
    it('should create valid IR blaster capability', () => {
      const capability: IIrBlasterCapability = {
        type: DeviceCapability.IR_BLASTER,
        commands: {
          sendIRCommand: async (_code: string) => {},
        },
        attributes: {
          supportedCommands: ['power', 'volume_up', 'volume_down'],
        },
      };

      expect(capability.type).toBe(DeviceCapability.IR_BLASTER);
      expect(capability.attributes.supportedCommands).toHaveLength(3);
      expect(typeof capability.commands.sendIRCommand).toBe('function');
    });

    it('should support optional learn command', () => {
      const capability: IIrBlasterCapability = {
        type: DeviceCapability.IR_BLASTER,
        commands: {
          sendIRCommand: async (_code: string) => {},
          learnIRCommand: (_name: string) => Promise.resolve('LEARNED_CODE_123'),
        },
        attributes: {
          supportedCommands: [],
          infraredLevel: 85,
        },
      };

      expect(capability.commands.learnIRCommand).toBeDefined();
      expect(capability.attributes.infraredLevel).toBe(85);
    });
  });
});

describe('Capability Feature Flags', () => {
  describe('CapabilityFeatures', () => {
    it('should create valid feature flags', () => {
      const features: CapabilityFeatures = {
        supportedCommands: ['open', 'close'],
        supportedAttributes: ['door', 'obstructionDetected'],
        features: {
          supportsObstructionDetection: true,
        },
      };

      expect(features.supportedCommands).toHaveLength(2);
      expect(features.supportedAttributes).toHaveLength(2);
      expect(features.features?.['supportsObstructionDetection']).toBe(true);
    });

    it('should work with ICapability', () => {
      const capability: IDoorControlCapability = {
        type: DeviceCapability.DOOR_CONTROL,
        commands: {
          open: async () => {},
          close: async () => {},
        },
        attributes: {
          door: DoorState.CLOSED,
        },
        capabilityFeatures: {
          supportedCommands: ['open', 'close'],
          supportedAttributes: ['door'],
        },
      };

      expect(capability.capabilityFeatures?.supportedCommands).toContain('open');
      expect(capability.capabilityFeatures?.supportedCommands).toContain('close');
    });
  });
});

describe('UnifiedCapabilityInterface union type', () => {
  it('should accept new door control capability', () => {
    const capability: UnifiedCapabilityInterface = {
      type: DeviceCapability.DOOR_CONTROL,
      commands: {
        open: async () => {},
        close: async () => {},
      },
      attributes: {
        door: DoorState.CLOSED,
      },
    };

    expect(capability.type).toBe(DeviceCapability.DOOR_CONTROL);
  });

  it('should accept new button capability', () => {
    const capability: UnifiedCapabilityInterface = {
      type: DeviceCapability.BUTTON,
      attributes: {
        numberOfButtons: 1,
        supportedButtonValues: ['pushed'],
      },
      events: {
        buttonEvent: {
          subscribe: () => {},
          unsubscribe: () => {},
        },
      },
    };

    expect(capability.type).toBe(DeviceCapability.BUTTON);
  });

  it('should enable type narrowing with switch statement', () => {
    const capability: UnifiedCapabilityInterface = {
      type: DeviceCapability.ROBOT_VACUUM,
      commands: {
        start: async () => {},
        pause: async () => {},
        stop: async () => {},
        returnToDock: async () => {},
      },
      attributes: {
        cleaningState: RobotVacuumState.IDLE,
        batteryLevel: 100,
        fanSpeed: RobotVacuumFanSpeed.AUTO,
      },
    };

    let matched = false;

    switch (capability.type) {
      case DeviceCapability.ROBOT_VACUUM:
        matched = true;
        expect(capability.attributes.cleaningState).toBe(RobotVacuumState.IDLE);
        break;
    }

    expect(matched).toBe(true);
  });
});

describe('DeviceCapability enum (new additions)', () => {
  it('should include all 7 new capabilities', () => {
    expect(DeviceCapability.DOOR_CONTROL).toBe('doorControl');
    expect(DeviceCapability.BUTTON).toBe('button');
    expect(DeviceCapability.PRESSURE_SENSOR).toBe('pressureSensor');
    expect(DeviceCapability.CO_DETECTOR).toBe('coDetector');
    expect(DeviceCapability.SOUND_SENSOR).toBe('soundSensor');
    expect(DeviceCapability.ROBOT_VACUUM).toBe('robotVacuum');
    expect(DeviceCapability.IR_BLASTER).toBe('irBlaster');
  });

  it('should have 31 total capabilities', () => {
    const capabilities = Object.values(DeviceCapability);
    expect(capabilities.length).toBe(31);
  });
});
