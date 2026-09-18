// Port of gallantlab/DemoFiles DemoParser/StringTables.py

import { BitBuffer } from './BitBuffer.ts'

/**
 * Decompresses Source engine LZSS data (the payload after the 8-byte LZSS header)
 */
export function decompressLZSS(data: Uint8Array, outputSize: number): Uint8Array {
  const output = new Uint8Array(outputSize)
  let outputLength = 0
  let position = 0
  let commandByte = 0
  let commandBitsLeft = 0
  while (outputLength < outputSize) {
    if (commandBitsLeft === 0) {
      commandByte = data[position]
      position += 1
      commandBitsLeft = 8
    }
    if (commandByte & 1) {
      let offset = data[position] << 4
      position += 1
      offset |= data[position] >> 4
      const count = (data[position] & 0x0f) + 1
      position += 1
      if (count === 1) {
        break
      }
      const source = outputLength - offset - 1
      for (let index = 0; index < count; index++) {
        output[outputLength++] = output[source + index]
      }
    } else {
      output[outputLength++] = data[position]
      position += 1
    }
    commandByte >>= 1
    commandBitsLeft -= 1
  }
  return outputLength === outputSize ? output : output.subarray(0, outputLength)
}

/**
 * A userinfo string table entry (player_info_s)
 */
export class PlayerInfo {
  steamId: string | null = null // 64-bit Steam id as a decimal string
  name: string | null = null
  userIdBytes: Uint8Array | null = null
  userId: number | null = null
  guid: string | null = null
  friendsId: number | null = null
  friendsName: string | null = null
  fakePlayer: boolean = false
  isHltv: boolean = false
  customFiles: number[] = []
  filesDownloaded: number = 0

  /**
   * @param data       entry bytes
   * @param newEngine  demo protocol 4, which prefixes the struct with the 64-bit Steam id
   */
  static read(data: Uint8Array, newEngine: boolean = true): PlayerInfo {
    const buffer = new BitBuffer(data)
    const info = new PlayerInfo()
    if (newEngine) {
      info.steamId = buffer.readULong().toString()
    }
    info.name = buffer.readString(32)
    // the four user id bytes are stored big-endian in Portal 2 demos: read little-endian they give the game
    // event userid times 2^24, read big-endian they equal the userid carried by the game events
    info.userIdBytes = buffer.readBytes(4)
    info.userId =
      ((info.userIdBytes[0] << 24) >>> 0) +
      (info.userIdBytes[1] << 16) +
      (info.userIdBytes[2] << 8) +
      info.userIdBytes[3]
    info.guid = buffer.readString(33)
    buffer.skipBits(3 * 8)
    info.friendsId = buffer.readUInt()
    info.friendsName = buffer.readString(32)
    info.fakePlayer = buffer.readByte() !== 0
    info.isHltv = buffer.readByte() !== 0
    buffer.skipBits(2 * 8)
    for (let index = 0; index < 4; index++) info.customFiles.push(buffer.readUInt())
    info.filesDownloaded = buffer.readByte()
    return info
  }
}

/** One string table entry: a name and optional user data */
export class StringTableEntry {
  name: string
  data: Uint8Array | null
  dataBits: number | null
  playerInfo: PlayerInfo | null = null

  constructor(name: string, data: Uint8Array | null = null, dataBits: number | null = null) {
    this.name = name
    this.data = data
    this.dataBits = dataBits
  }
}

/** A class entry of a string table in the StringTables frame */
export class StringTableClass {
  name: string
  data: string | null

  constructor(name: string, data: string | null = null) {
    this.name = name
    this.data = data
  }
}

/** One string table with its creation parameters and current entries */
export class StringTable {
  name: string
  tableId: number = -1
  maxEntries: number = -1
  userDataFixedSize: boolean = false
  userDataSize: number = 0
  userDataSizeBits: number = 0
  flags: number = 0
  entries: StringTableEntry[] = []
  classes: StringTableClass[] = []

  constructor(name: string) {
    this.name = name
  }

  findEntry(name: string): StringTableEntry | null {
    for (const entry of this.entries) {
      if (entry.name === name) return entry
    }
    return null
  }
}

/** Decodes the StringTables demo frame */
export class StringTablesFrame {
  static read(data: Uint8Array, newEngine: boolean = true): StringTable[] {
    const buffer = new BitBuffer(data)
    const tables: StringTable[] = []
    const tableCount = buffer.readByte()
    for (let tableIndex = 0; tableIndex < tableCount; tableIndex++) {
      const table = new StringTable(buffer.readString())
      table.tableId = tableIndex
      const entryCount = buffer.readUShort()
      for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
        const name = buffer.readString()
        const entry = new StringTableEntry(name)
        if (buffer.readBool()) {
          const length = buffer.readUShort()
          entry.data = buffer.readBytes(length)
          entry.dataBits = length * 8
        }
        StringTableManager.decodeEntryData(table, entry, newEngine)
        table.entries.push(entry)
      }
      if (buffer.readBool()) {
        const classCount = buffer.readUShort()
        for (let classIndex = 0; classIndex < classCount; classIndex++) {
          const name = buffer.readString()
          const tableClass = new StringTableClass(name)
          if (buffer.readBool()) {
            const length = buffer.readUShort()
            tableClass.data = buffer.readString(length)
          }
          table.classes.push(tableClass)
        }
      }
      tables.push(table)
    }
    return tables
  }
}

/** Shape of the SvcCreateStringTable and SvcUpdateStringTable messages the manager applies */
export interface StringTableCreateMessage {
  tableName: string
  maxEntries: number
  entryCount: number
  userDataFixedSize: boolean
  userDataSize: number
  userDataSizeBits: number
  flags: number
  stringData: BitBuffer
  entries: [number, StringTableEntry][]
}

export interface StringTableUpdateMessage {
  tableId: number
  tableName: string | null
  changedEntries: number
  stringData: BitBuffer
  entries: [number, StringTableEntry][]
}

/**
 * Running state of the string tables of a demo, created by SvcCreateStringTable, updated by
 * SvcUpdateStringTable and re-initialised from the StringTables frame
 */
export class StringTableManager {
  readonly newEngine: boolean
  tables: StringTable[] = []
  tablesByName: Map<string, StringTable> = new Map()

  constructor(newEngine: boolean = true) {
    this.newEngine = newEngine
  }

  /** Decodes the user data of an entry for the tables with a known layout */
  static decodeEntryData(table: StringTable, entry: StringTableEntry, newEngine: boolean): void {
    if (entry.data === null) return
    if (table.name === 'userinfo') {
      entry.playerInfo = PlayerInfo.read(entry.data, newEngine)
    }
  }

  /** Creates a table from a SvcCreateStringTable message and applies the entries it carries */
  createTable(message: StringTableCreateMessage): StringTable {
    const table = new StringTable(message.tableName)
    table.tableId = this.tables.length
    table.maxEntries = message.maxEntries
    table.userDataFixedSize = message.userDataFixedSize
    table.userDataSize = message.userDataSize
    table.userDataSizeBits = message.userDataSizeBits
    table.flags = message.flags
    this.tables.push(table)
    this.tablesByName.set(table.name, table)
    message.entries = this.readUpdate(table, message.stringData, message.entryCount, true)
    return table
  }

  /** Applies a SvcUpdateStringTable message to its table */
  updateTable(message: StringTableUpdateMessage): StringTable {
    if (message.tableId >= this.tables.length) {
      throw new Error(`SvcUpdateStringTable for unknown table id ${message.tableId}`)
    }
    const table = this.tables[message.tableId]
    message.tableName = table.name
    message.entries = this.readUpdate(table, message.stringData, message.changedEntries, false)
    return table
  }

  /** Replaces the entries of the running tables with those of the StringTables frame, which are authoritative */
  initFromFrame(tables: StringTable[]): void {
    for (const frameTable of tables) {
      const table = this.tablesByName.get(frameTable.name)
      if (table) {
        table.entries = frameTable.entries
        table.classes = frameTable.classes
      } else {
        frameTable.tableId = this.tables.length
        this.tables.push(frameTable)
        this.tablesByName.set(frameTable.name, frameTable)
      }
    }
  }

  /**
   * Decodes the string table delta format and applies the entries to the table
   * @param table        table being updated
   * @param buffer       bit buffer over the message string data
   * @param entryCount   number of changed entries
   * @param canCompress  whether the data may be LZSS compressed (creation messages only)
   * @returns list of (entry index, entry) applied
   */
  readUpdate(
    table: StringTable,
    buffer: BitBuffer,
    entryCount: number,
    canCompress: boolean
  ): [number, StringTableEntry][] {
    if (canCompress && table.flags & 1) {
      buffer.readInt() // uncompressed size
      const compressedSize = buffer.readInt()
      const compressionId = buffer.readBytes(4)
      const decompressedSize = buffer.readInt()
      const id = String.fromCharCode(...compressionId)
      if (id !== 'LZSS') {
        throw new Error(`Unknown string table compression ${id}`)
      }
      const compressed = buffer.readBytes(compressedSize - 8)
      buffer = new BitBuffer(decompressLZSS(compressed, decompressedSize))
    }
    if (this.newEngine) {
      if (buffer.readBool()) {
        throw new Error(`String table ${table.name} is dictionary encoded, which is not supported`)
      }
    }

    const indexBits = Math.max(bitLengthOf(Math.max(table.maxEntries, 1)) - 1, 0)
    const history: string[] = []
    let entryIndex = -1
    const updates: [number, StringTableEntry][] = []
    for (let updateIndex = 0; updateIndex < entryCount; updateIndex++) {
      entryIndex += 1
      if (!buffer.readBool()) {
        entryIndex = buffer.readBits(indexBits)
      }
      if (entryIndex > table.entries.length) {
        throw new Error(
          `String table ${table.name} update index ${entryIndex} beyond ${table.entries.length} entries`
        )
      }

      let name: string | null = null
      if (buffer.readBool()) {
        if (buffer.readBool()) {
          const historyIndex = buffer.readBits(5)
          const substringLength = buffer.readBits(5)
          name = (history[historyIndex] ?? '').slice(0, substringLength) + buffer.readString()
        } else {
          name = buffer.readString()
        }
      }

      let data: Uint8Array | null = null
      let dataBits: number | null = null
      if (buffer.readBool()) {
        if (table.userDataFixedSize) {
          dataBits = table.userDataSizeBits
        } else {
          dataBits = buffer.readBits(14) * 8
        }
        data = buffer.readSubBuffer(dataBits).readBitBytes(dataBits)
      }

      let entry: StringTableEntry
      if (entryIndex < table.entries.length) {
        const existing = table.entries[entryIndex]
        if (name === null) name = existing.name
        entry = new StringTableEntry(
          name,
          data !== null ? data : existing.data,
          data !== null ? dataBits : existing.dataBits
        )
        table.entries[entryIndex] = entry
      } else {
        if (name === null) name = ''
        entry = new StringTableEntry(name, data, dataBits)
        table.entries.push(entry)
      }
      StringTableManager.decodeEntryData(table, entry, this.newEngine)
      updates.push([entryIndex, entry])
      history.push(name)
      if (history.length > 32) history.shift()
    }
    return updates
  }
}

function bitLengthOf(value: number): number {
  if (value <= 0) return 0
  return 32 - Math.clz32(value)
}
