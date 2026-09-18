// Port of gallantlab/DemoFiles DemoParser/DataTables.py

import { BitBuffer, bitLength } from './BitBuffer.ts'

/** Send property types */
export const SendPropType = {
  Int: 0,
  Float: 1,
  Vector: 2,
  VectorXY: 3,
  String: 4,
  Array: 5,
  DataTable: 6,
} as const

/** Send property flags with the demo protocol 4 bit positions */
export const SendPropFlags = {
  Unsigned: 1 << 0,
  Coord: 1 << 1,
  NoScale: 1 << 2,
  RoundDown: 1 << 3,
  RoundUp: 1 << 4,
  Normal: 1 << 5,
  Exclude: 1 << 6,
  Xyze: 1 << 7,
  InsideArray: 1 << 8,
  ProxyAlwaysYes: 1 << 9,
  IsVectorElem: 1 << 10,
  Collapsible: 1 << 11,
  CoordMp: 1 << 12,
  CoordMpLp: 1 << 13,
  CoordMpInt: 1 << 14,
  CellCoord: 1 << 15,
  CellCoordLp: 1 << 16,
  CellCoordInt: 1 << 17,
  ChangesOften: 1 << 18,
} as const

// demo protocol 3 flag bit position -> demo protocol 4 flag
const Protocol3FlagPositions: [number, number][] = [
  [0, SendPropFlags.Unsigned],
  [1, SendPropFlags.Coord],
  [2, SendPropFlags.NoScale],
  [3, SendPropFlags.RoundDown],
  [4, SendPropFlags.RoundUp],
  [5, SendPropFlags.Normal],
  [6, SendPropFlags.Exclude],
  [7, SendPropFlags.Xyze],
  [8, SendPropFlags.InsideArray],
  [9, SendPropFlags.ProxyAlwaysYes],
  [10, SendPropFlags.ChangesOften],
  [11, SendPropFlags.IsVectorElem],
  [12, SendPropFlags.Collapsible],
  [13, SendPropFlags.CoordMp],
  [14, SendPropFlags.CoordMpLp],
  [15, SendPropFlags.CoordMpInt],
]

/** One send property of a send table */
export class SendProp {
  propType: number = -1
  name: string = ''
  flags: number = 0
  priority: number = 0
  excludeTableName: string | null = null
  lowValue: number | null = null
  highValue: number | null = null
  numBits: number | null = null
  numElements: number | null = null
  floatEncoding: number = 0 // cached by EntityDecoder.prepareProp

  /**
   * @param buffer     bit buffer positioned at the property
   * @param newEngine  demo protocol 4, which has 19 flag bits and a priority byte
   */
  static read(buffer: BitBuffer, newEngine: boolean = true): SendProp {
    const prop = new SendProp()
    prop.propType = buffer.readBits(5)
    prop.name = buffer.readString()
    if (newEngine) {
      prop.flags = buffer.readBits(19)
      prop.priority = buffer.readByte()
    } else {
      const rawFlags = buffer.readBits(16)
      let flags = 0
      for (const [position, flag] of Protocol3FlagPositions) {
        if (rawFlags & (1 << position)) flags |= flag
      }
      prop.flags = flags
    }
    if (prop.propType === SendPropType.DataTable || prop.flags & SendPropFlags.Exclude) {
      prop.excludeTableName = buffer.readString()
    } else if (prop.propType === SendPropType.Array) {
      prop.numElements = buffer.readBits(10)
    } else {
      prop.lowValue = buffer.readFloat()
      prop.highValue = buffer.readFloat()
      prop.numBits = buffer.readBits(7)
    }
    return prop
  }
}

/** One send table */
export class SendTable {
  needsDecoder: boolean = false
  name: string = ''
  props: SendProp[] = []

  static read(buffer: BitBuffer, newEngine: boolean = true): SendTable {
    const table = new SendTable()
    table.needsDecoder = buffer.readBool()
    table.name = buffer.readString()
    const propCount = buffer.readBits(10)
    for (let index = 0; index < propCount; index++) {
      table.props.push(SendProp.read(buffer, newEngine))
    }
    return table
  }
}

/** A server class: id, class name and the name of its send table */
export class ServerClass {
  classId: number = -1
  className: string = ''
  dataTableName: string = ''

  static read(buffer: BitBuffer): ServerClass {
    const serverClass = new ServerClass()
    serverClass.classId = buffer.readShort()
    serverClass.className = buffer.readString()
    serverClass.dataTableName = buffer.readString()
    return serverClass
  }
}

/** One entry of the flattened property list of a server class */
export class FlattenedProp {
  name: string // property name with table prefixes
  prop: SendProp
  arrayElementProp: SendProp | null // element definition for array properties

  constructor(name: string, prop: SendProp, arrayElementProp: SendProp | null = null) {
    this.name = name
    this.prop = prop
    this.arrayElementProp = arrayElementProp
  }
}

/**
 * Holds the send tables and server classes of a demo and builds the flattened property list per class
 */
export class DataTablesManager {
  readonly tables: SendTable[]
  readonly tablesByName: Map<string, SendTable>
  readonly classes: ServerClass[]
  readonly classesByName: Map<string, ServerClass>
  readonly newEngine: boolean
  leftoverBits: number = 0
  flattenedProps: FlattenedProp[][] = []

  /** Decodes the DataTables frame payload */
  static read(data: Uint8Array, newEngine: boolean = true): DataTablesManager {
    const buffer = new BitBuffer(data)
    const tables: SendTable[] = []
    while (buffer.readBool()) {
      tables.push(SendTable.read(buffer, newEngine))
    }
    const classCount = buffer.readShort()
    const classes: ServerClass[] = []
    for (let index = 0; index < classCount; index++) {
      classes.push(ServerClass.read(buffer))
    }
    const manager = new DataTablesManager(tables, classes, newEngine)
    manager.leftoverBits = buffer.bitsLeft
    return manager
  }

  constructor(tables: SendTable[], classes: ServerClass[], newEngine: boolean = true) {
    this.tables = tables
    this.tablesByName = new Map(tables.map(table => [table.name, table]))
    this.classes = classes
    this.classesByName = new Map(classes.map(serverClass => [serverClass.className, serverClass]))
    this.newEngine = newEngine
  }

  /** Number of bits used for a class index in entity messages */
  get serverClassBits(): number {
    return bitLength(this.classes.length)
  }

  /** Builds the flattened property list of every server class, in the order used by entity messages */
  flattenClasses(): void {
    this.flattenedProps = this.classes.map(() => [])
    for (const serverClass of this.classes) {
      const table = this.tablesByName.get(serverClass.dataTableName)
      if (!table) {
        throw new Error(
          `Server class ${serverClass.className} names unknown table ${serverClass.dataTableName}`
        )
      }
      const excludes = this.gatherExcludes(table)
      const props: FlattenedProp[] = []
      this.gatherProps(table, excludes, '', props)
      this.flattenedProps[serverClass.classId] = this.sortProps(props)
    }
  }

  private lookupTable(name: string): SendTable {
    const table = this.tablesByName.get(name)
    if (!table) throw new Error(`Unknown send table ${name}`)
    return table
  }

  /** Collects the (table name, property name) pairs excluded anywhere under a table */
  gatherExcludes(table: SendTable): Set<string> {
    const excludes = new Set<string>()
    for (const prop of table.props) {
      if (prop.propType === SendPropType.DataTable) {
        for (const exclude of this.gatherExcludes(this.lookupTable(prop.excludeTableName!))) {
          excludes.add(exclude)
        }
      } else if (prop.flags & SendPropFlags.Exclude) {
        excludes.add(excludeKey(prop.excludeTableName!, prop.name))
      }
    }
    return excludes
  }

  /**
   * Appends the properties of a table to the class list: nested tables first, in the order met,
   * then the table's own properties
   */
  gatherProps(
    table: SendTable,
    excludes: Set<string>,
    prefix: string,
    output: FlattenedProp[]
  ): void {
    const props: FlattenedProp[] = []
    this.iterateProps(table, excludes, prefix, props, output)
    output.push(...props)
  }

  /**
   * Walks the properties of a table, inlining collapsible tables and gathering other nested tables
   * straight into the class list
   */
  iterateProps(
    table: SendTable,
    excludes: Set<string>,
    prefix: string,
    props: FlattenedProp[],
    output: FlattenedProp[]
  ): void {
    for (let index = 0; index < table.props.length; index++) {
      const prop = table.props[index]
      if (prop.flags & SendPropFlags.Exclude || prop.flags & SendPropFlags.InsideArray) {
        continue
      }
      if (excludes.has(excludeKey(table.name, prop.name))) {
        continue
      }
      if (prop.propType === SendPropType.DataTable) {
        const subTable = this.lookupTable(prop.excludeTableName!)
        if (prop.flags & SendPropFlags.Collapsible) {
          this.iterateProps(subTable, excludes, prefix, props, output)
        } else {
          const subPrefix = prop.name.length > 0 && prop.name !== 'baseclass' ? prop.name + '.' : ''
          this.gatherProps(subTable, excludes, subPrefix, output)
        }
      } else {
        const arrayElement = prop.propType === SendPropType.Array ? table.props[index - 1] : null
        props.push(new FlattenedProp(prefix + prop.name, prop, arrayElement))
      }
    }
  }

  /**
   * Orders flattened properties by priority with ChangesOften treated as priority 64, using the
   * engine's in-place partition
   */
  sortProps(props: FlattenedProp[]): FlattenedProp[] {
    if (this.newEngine) {
      const priorities = Array.from(new Set([...props.map(prop => prop.prop.priority), 64])).sort(
        (left, right) => left - right
      )
      let start = 0
      for (const priority of priorities) {
        for (let index = start; index < props.length; index++) {
          const prop = props[index].prop
          if (
            prop.priority === priority ||
            (prop.flags & SendPropFlags.ChangesOften && priority === 64)
          ) {
            if (start !== index) {
              const swapped = props[start]
              props[start] = props[index]
              props[index] = swapped
            }
            start += 1
          }
        }
      }
    } else {
      let start = 0
      for (let index = 0; index < props.length; index++) {
        if (props[index].prop.flags & SendPropFlags.ChangesOften) {
          const swapped = props[start]
          props[start] = props[index]
          props[index] = swapped
          start += 1
        }
      }
    }
    return props
  }
}

function excludeKey(tableName: string, propName: string): string {
  return tableName + '\u0000' + propName
}
