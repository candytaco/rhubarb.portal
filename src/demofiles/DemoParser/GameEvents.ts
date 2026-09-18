// Port of gallantlab/DemoFiles DemoParser/GameEvents.py

import { BitBuffer } from './BitBuffer.ts'

export type GameEventValue = string | number | boolean

/**
 * Describes one game event type: its id, name and the ordered list of typed keys
 * (types are 1 string, 2 float, 3 int32, 4 int16, 5 int8, 6 bool)
 */
export class GameEventDescriptor {
  eventId: number = -1
  name: string = ''
  keys: [string, number][] = []

  static read(buffer: BitBuffer): GameEventDescriptor {
    const descriptor = new GameEventDescriptor()
    descriptor.eventId = buffer.readBits(9)
    descriptor.name = buffer.readString()
    let valueType = buffer.readBits(3)
    while (valueType !== 0) {
      descriptor.keys.push([buffer.readString(), valueType])
      valueType = buffer.readBits(3)
    }
    return descriptor
  }
}

/** One decoded game event */
export class GameEvent {
  readonly descriptor: GameEventDescriptor
  values: Record<string, GameEventValue> = {}

  constructor(descriptor: GameEventDescriptor) {
    this.descriptor = descriptor
  }

  get name(): string {
    return this.descriptor.name
  }

  get eventId(): number {
    return this.descriptor.eventId
  }
}

/**
 * Holds the game event descriptors of a demo and decodes events with them
 */
export class GameEventManager {
  readonly descriptors: GameEventDescriptor[]
  readonly descriptorsById: Map<number, GameEventDescriptor>
  readonly descriptorsByName: Map<string, GameEventDescriptor>

  static read(buffer: BitBuffer, eventCount: number): GameEventManager {
    const descriptors: GameEventDescriptor[] = []
    for (let index = 0; index < eventCount; index++) {
      descriptors.push(GameEventDescriptor.read(buffer))
    }
    return new GameEventManager(descriptors)
  }

  constructor(descriptors: GameEventDescriptor[]) {
    this.descriptors = descriptors
    this.descriptorsById = new Map(descriptors.map(descriptor => [descriptor.eventId, descriptor]))
    this.descriptorsByName = new Map(descriptors.map(descriptor => [descriptor.name, descriptor]))
  }

  /** Decodes one event from SvcGameEvent data */
  readEvent(buffer: BitBuffer): GameEvent {
    const eventId = buffer.readBits(9)
    const descriptor = this.descriptorsById.get(eventId)
    if (!descriptor) {
      throw new Error(`Unknown game event id ${eventId}`)
    }
    const event = new GameEvent(descriptor)
    for (const [keyName, valueType] of descriptor.keys) {
      switch (valueType) {
        case 1:
          event.values[keyName] = buffer.readString()
          break
        case 2:
          event.values[keyName] = buffer.readFloat()
          break
        case 3:
          event.values[keyName] = buffer.readInt()
          break
        case 4:
          event.values[keyName] = buffer.readShort()
          break
        case 5:
          event.values[keyName] = buffer.readSignedByte()
          break
        case 6:
          event.values[keyName] = buffer.readBool()
          break
        default:
          throw new Error(`Unknown game event value type ${valueType} for key ${keyName}`)
      }
    }
    return event
  }
}
