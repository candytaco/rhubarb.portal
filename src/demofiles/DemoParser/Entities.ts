// Port of gallantlab/DemoFiles DemoParser/Entities.py

import { BitBuffer, bitLength } from './BitBuffer.ts'
import {
  FlattenedProp,
  SendPropFlags,
  SendPropType,
  type DataTablesManager,
  type SendProp,
} from './DataTables.ts'

// entity indices are 11 bits and handle serial numbers 10 bits
export const MaxEdictBits = 11
export const MaxEdicts = 1 << MaxEdictBits
export const HandleSerialBits = 10
export const InvalidEntityHandle = (1 << (MaxEdictBits + HandleSerialBits)) - 1

/** Array-typed property values, kept distinct from vectors so that they merge element by element */
export class PropArray {
  elements: PropertyValue[]
  constructor(elements: PropertyValue[]) {
    this.elements = elements
  }
}

export type PropertyValue = number | number[] | string | PropArray | null

/** Float encodings selected by the send property flags */
export const FloatEncoding = {
  Standard: 0,
  Coord: 1,
  CoordMp: 2,
  CoordMpLp: 3,
  CoordMpInt: 4,
  NoScale: 5,
  Normal: 6,
  CellCoord: 7,
  CellCoordLp: 8,
  CellCoordInt: 9,
} as const

/** Picks the float encoding for a property */
export function floatEncodingFromFlags(flags: number, newEngine: boolean): number {
  if (flags & SendPropFlags.Coord) return FloatEncoding.Coord
  if (flags & SendPropFlags.CoordMp) return FloatEncoding.CoordMp
  if (flags & SendPropFlags.CoordMpLp) return FloatEncoding.CoordMpLp
  if (flags & SendPropFlags.CoordMpInt) return FloatEncoding.CoordMpInt
  if (flags & SendPropFlags.NoScale) return FloatEncoding.NoScale
  if (flags & SendPropFlags.Normal) return FloatEncoding.Normal
  if (newEngine) {
    if (flags & SendPropFlags.CellCoord) return FloatEncoding.CellCoord
    if (flags & SendPropFlags.CellCoordLp) return FloatEncoding.CellCoordLp
    if (flags & SendPropFlags.CellCoordInt) return FloatEncoding.CellCoordInt
  }
  return FloatEncoding.Standard
}

/** State of one networked entity: its class, handle serial and property values in flattened property order */
export class Entity {
  classId: number
  serial: number
  props: PropertyValue[]
  inPvs: boolean = true

  constructor(classId: number, serial: number, props: PropertyValue[]) {
    this.classId = classId
    this.serial = serial
    this.props = props
  }
}

/** One entry of a SvcPacketEntities message */
export class EntityUpdate {
  static readonly Delta = 0
  static readonly LeavePvs = 1
  static readonly EnterPvs = 2
  static readonly Delete = 3

  entityIndex: number
  updateType: number
  classId: number | null
  serial: number | null
  isNew: boolean = false
  props: [number, PropertyValue][] = [] // (flattened property index, value)

  constructor(
    entityIndex: number,
    updateType: number,
    classId: number | null = null,
    serial: number | null = null
  ) {
    this.entityIndex = entityIndex
    this.updateType = updateType
    this.classId = classId
    this.serial = serial
  }
}

/** Shape of the SvcPacketEntities message the decoder consumes */
export interface PacketEntitiesMessage {
  isDelta: boolean
  baseline: boolean
  updatedEntries: number
  dataLength: number
  updateBaseline: boolean
  data: BitBuffer
  entityUpdates: EntityUpdate[]
}

/**
 * Decodes SvcPacketEntities messages into a running entity snapshot using the flattened send tables,
 * the class baselines and the per-entity baselines stored by the update baseline flag
 */
export class EntityDecoder {
  readonly manager: DataTablesManager
  readonly newEngine: boolean
  readonly serverClassBits: number
  baselines: (PropertyValue[] | null)[]
  entities: (Entity | null)[]
  entityBaselines: ([number, PropertyValue[]] | null)[][] // (class index, property values) per baseline slot and entity slot
  serverTick: number = 0

  constructor(dataTablesManager: DataTablesManager, newEngine: boolean = true) {
    this.manager = dataTablesManager
    this.newEngine = newEngine
    this.serverClassBits = dataTablesManager.serverClassBits
    this.baselines = new Array(dataTablesManager.classes.length).fill(null)
    this.entities = new Array(MaxEdicts).fill(null)
    this.entityBaselines = [new Array(MaxEdicts).fill(null), new Array(MaxEdicts).fill(null)]
    for (const props of dataTablesManager.flattenedProps) {
      for (const flattenedProp of props) {
        this.prepareProp(flattenedProp.prop)
        if (flattenedProp.arrayElementProp !== null) {
          this.prepareProp(flattenedProp.arrayElementProp)
        }
      }
    }
  }

  /** Caches the float encoding on a property */
  prepareProp(prop: SendProp): void {
    prop.floatEncoding = floatEncodingFromFlags(prop.flags, this.newEngine)
  }

  /** Reads an instancebaseline string table entry into the class baseline */
  applyBaselineEntry(entryName: string, data: Uint8Array): void {
    const classId = Number(entryName)
    if (!Number.isInteger(classId) || classId < 0 || classId >= this.baselines.length) {
      throw new Error(`instancebaseline entry ${entryName} is not a server class index`)
    }
    const props = this.readProps(new BitBuffer(data), classId)
    this.updateBaseline(classId, props)
  }

  /** Merges property values into the class baseline */
  updateBaseline(classId: number, props: [number, PropertyValue][]): void {
    if (this.baselines[classId] === null) {
      this.baselines[classId] = new Array(this.manager.flattenedProps[classId].length).fill(null)
    }
    const baseline = this.baselines[classId]!
    for (const [index, value] of props) {
      EntityDecoder.storeValue(baseline, index, value)
    }
  }

  /** Stores a property value, merging array values element by element */
  static storeValue(props: PropertyValue[], index: number, value: PropertyValue): void {
    if (value instanceof PropArray) {
      const existing = props[index]
      if (existing instanceof PropArray && existing.elements.length > value.elements.length) {
        const merged = [...existing.elements]
        for (let elementIndex = 0; elementIndex < value.elements.length; elementIndex++) {
          merged[elementIndex] = value.elements[elementIndex]
        }
        props[index] = new PropArray(merged)
      } else {
        props[index] = new PropArray([...value.elements])
      }
    } else {
      props[index] = value
    }
  }

  /** Copies a property value list, duplicating array values */
  static copyProps(props: PropertyValue[]): PropertyValue[] {
    return props.map(value =>
      value instanceof PropArray ? new PropArray([...value.elements]) : value
    )
  }

  /**
   * Property values an entity entering the PVS is decoded against: the per-entity baseline slot named
   * by a delta message when it holds this class, otherwise the class baseline
   */
  baselineProps(
    classId: number,
    entityIndex: number,
    message: PacketEntitiesMessage
  ): PropertyValue[] {
    if (message.isDelta) {
      const stored = this.entityBaselines[message.baseline ? 1 : 0][entityIndex]
      if (stored !== null && stored[0] === classId) {
        return EntityDecoder.copyProps(stored[1])
      }
    }
    const baseline = this.baselines[classId]
    if (baseline === null) {
      return new Array(this.manager.flattenedProps[classId].length).fill(null)
    }
    return EntityDecoder.copyProps(baseline)
  }

  /** Applies a SvcPacketEntities message to the snapshot */
  decode(message: PacketEntitiesMessage): EntityUpdate[] {
    const buffer = BitBuffer.fromRange(message.data)
    const updates: EntityUpdate[] = []
    if (!message.isDelta) {
      this.entities = new Array(MaxEdicts).fill(null)
    }

    let entityIndex = -1
    for (let updateNumber = 0; updateNumber < message.updatedEntries; updateNumber++) {
      if (this.newEngine) {
        entityIndex += 1 + buffer.readUBitInt()
      } else {
        entityIndex += 1 + buffer.readUBitVar()
      }
      if (entityIndex < 0 || entityIndex >= MaxEdicts) {
        throw new Error(`Entity index ${entityIndex} out of range in update ${updateNumber}`)
      }
      const updateType = buffer.readBits(2)
      let update: EntityUpdate

      if (updateType === EntityUpdate.Delta) {
        const entity = this.entities[entityIndex]
        if (entity === null) {
          throw new Error(`Delta for empty entity slot ${entityIndex} in update ${updateNumber}`)
        }
        update = new EntityUpdate(entityIndex, updateType, entity.classId, entity.serial)
        update.props = this.readProps(buffer, entity.classId)
        for (const [index, value] of update.props) {
          EntityDecoder.storeValue(entity.props, index, value)
        }
      } else if (updateType === EntityUpdate.EnterPvs) {
        const classId = buffer.readBits(this.serverClassBits)
        const serial = buffer.readBits(HandleSerialBits)
        if (classId >= this.manager.classes.length) {
          throw new Error(`Server class ${classId} out of range in update ${updateNumber}`)
        }
        update = new EntityUpdate(entityIndex, updateType, classId, serial)
        let entity = this.entities[entityIndex]
        update.isNew = entity === null || entity.serial !== serial
        const props = this.baselineProps(classId, entityIndex, message)
        if (update.isNew || entity === null) {
          entity = new Entity(classId, serial, props)
          this.entities[entityIndex] = entity
        } else {
          entity.props = props
        }
        entity.inPvs = true
        update.props = this.readProps(buffer, classId)
        for (const [index, value] of update.props) {
          EntityDecoder.storeValue(entity.props, index, value)
        }
        if (message.updateBaseline) {
          this.entityBaselines[message.baseline ? 0 : 1][entityIndex] = [
            classId,
            EntityDecoder.copyProps(entity.props),
          ]
        }
      } else {
        const entity = this.entities[entityIndex]
        update = new EntityUpdate(
          entityIndex,
          updateType,
          entity ? entity.classId : null,
          entity ? entity.serial : null
        )
        if (entity !== null) {
          if (updateType === EntityUpdate.Delete) {
            this.entities[entityIndex] = null
          } else {
            entity.inPvs = false
          }
        }
      }
      updates.push(update)
    }

    if (message.isDelta) {
      while (buffer.readBool()) {
        const deletedIndex = buffer.readBits(MaxEdictBits)
        const entity = this.entities[deletedIndex]
        const update = new EntityUpdate(
          deletedIndex,
          EntityUpdate.Delete,
          entity ? entity.classId : null,
          entity ? entity.serial : null
        )
        this.entities[deletedIndex] = null
        updates.push(update)
      }
    }

    if (buffer.bitsLeft !== 0) {
      throw new Error(
        `SvcPacketEntities left ${buffer.bitsLeft} of ${message.dataLength} bits unread`
      )
    }
    message.entityUpdates = updates
    return updates
  }

  /** Reads a property list for an entity of a class */
  readProps(buffer: BitBuffer, classId: number): [number, PropertyValue][] {
    const flattenedProps = this.manager.flattenedProps[classId]
    const props: [number, PropertyValue][] = []
    let index = -1
    if (this.newEngine) {
      const newWay = buffer.readBool()
      index = buffer.readFieldIndex(index, newWay)
      while (index !== -1) {
        if (index >= flattenedProps.length) {
          throw new Error(
            `Property index ${index} beyond the ${flattenedProps.length} properties of class ${classId}`
          )
        }
        props.push([index, this.decodeProp(buffer, flattenedProps[index])])
        index = buffer.readFieldIndex(index, newWay)
      }
    } else {
      while (buffer.readBool()) {
        index += buffer.readUBitVar() + 1
        if (index >= flattenedProps.length) {
          throw new Error(
            `Property index ${index} beyond the ${flattenedProps.length} properties of class ${classId}`
          )
        }
        props.push([index, this.decodeProp(buffer, flattenedProps[index])])
      }
    }
    return props
  }

  /** Decodes one property value */
  decodeProp(buffer: BitBuffer, flattenedProp: FlattenedProp): PropertyValue {
    const prop = flattenedProp.prop
    const propType = prop.propType
    if (propType === SendPropType.Int) {
      return this.decodeInt(buffer, prop)
    }
    if (propType === SendPropType.Float) {
      return this.decodeFloat(buffer, prop)
    }
    if (propType === SendPropType.Vector) {
      return this.decodeVector(buffer, prop)
    }
    if (propType === SendPropType.VectorXY) {
      return [this.decodeFloat(buffer, prop), this.decodeFloat(buffer, prop)]
    }
    if (propType === SendPropType.String) {
      return buffer.readString(buffer.readBits(9))
    }
    if (propType === SendPropType.Array) {
      const count = buffer.readBits(bitLength(prop.numElements ?? 0))
      const element = new FlattenedProp(flattenedProp.name, flattenedProp.arrayElementProp!)
      const elements: PropertyValue[] = []
      for (let elementIndex = 0; elementIndex < count; elementIndex++) {
        elements.push(this.decodeProp(buffer, element))
      }
      return new PropArray(elements)
    }
    throw new Error(`Cannot decode property type ${propType}`)
  }

  decodeInt(buffer: BitBuffer, prop: SendProp): number {
    if (prop.flags & SendPropFlags.Unsigned) {
      return buffer.readBits(prop.numBits ?? 0)
    }
    return buffer.readBits(prop.numBits ?? 0, true)
  }

  /** Decodes a float property according to its encoding */
  decodeFloat(buffer: BitBuffer, prop: SendProp): number {
    const encoding = prop.floatEncoding
    if (encoding === FloatEncoding.Standard) {
      const bits = prop.numBits ?? 0
      const low = prop.lowValue ?? 0
      const high = prop.highValue ?? 0
      return low + (high - low) * (buffer.readBits(bits) / (2 ** bits - 1))
    }
    if (encoding === FloatEncoding.Coord) {
      return buffer.readCoord()
    }
    if (encoding === FloatEncoding.NoScale) {
      return buffer.readFloat()
    }
    if (encoding === FloatEncoding.Normal) {
      return buffer.readBitNormal()
    }
    if (
      encoding === FloatEncoding.CellCoord ||
      encoding === FloatEncoding.CellCoordLp ||
      encoding === FloatEncoding.CellCoordInt
    ) {
      let value = buffer.readBits(prop.numBits ?? 0)
      if (encoding === FloatEncoding.CellCoord) {
        value += buffer.readBits(5) / 32
      } else if (encoding === FloatEncoding.CellCoordLp) {
        value += buffer.readBits(3) / 8
      }
      return value
    }
    return EntityDecoder.readCoordMp(buffer, encoding)
  }

  /** Reads a multiplayer coordinate: an in-bounds bit, integer part in 11 or 14 bits and a 5 or 3 bit fraction */
  static readCoordMp(buffer: BitBuffer, encoding: number): number {
    const inBounds = buffer.readBool()
    let value = 0
    let sign = false
    if (encoding === FloatEncoding.CoordMpInt) {
      if (buffer.readBool()) {
        sign = buffer.readBool()
        value = buffer.readBits(inBounds ? 11 : 14) + 1
      }
    } else {
      const hasInteger = buffer.readBool()
      sign = buffer.readBool()
      if (hasInteger) {
        value = buffer.readBits(inBounds ? 11 : 14) + 1
      }
      if (encoding === FloatEncoding.CoordMpLp) {
        value += buffer.readBits(3) / 8
      } else {
        value += buffer.readBits(5) / 32
      }
    }
    if (sign) value = -value
    return value
  }

  /** Decodes a three-component vector, deriving z for normals */
  decodeVector(buffer: BitBuffer, prop: SendProp): number[] {
    const x = this.decodeFloat(buffer, prop)
    const y = this.decodeFloat(buffer, prop)
    if (prop.flags & SendPropFlags.Normal) {
      const sign = buffer.readBool()
      const squared = x * x + y * y
      let z = squared < 1 ? Math.sqrt(1 - squared) : 0
      if (sign) z = -z
      return [x, y, z]
    }
    return [x, y, this.decodeFloat(buffer, prop)]
  }
}
