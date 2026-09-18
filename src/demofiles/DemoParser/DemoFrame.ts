// Port of gallantlab/DemoFiles DemoParser/DemoFrame.py and DemoFrameData.py

import { ByteReader, type Vector3Tuple } from './BitBuffer.ts'
import { CommandProto24, CommandProto36, type CommandSet } from './Commands.ts'
import { UserCommand } from './UserCommands.ts'
import type { NetMessage } from './NetMessages.ts'
import type { StringTable } from './StringTables.ts'
import type { DataTablesManager } from './DataTables.ts'

const textDecoder = new TextDecoder('utf-8')

/**
 * View vector information of a Signon or Packet frame (one CmdInfo block, 76 bytes)
 */
export class View {
  flags: number = -1
  viewOrigin: Vector3Tuple | null = null
  viewAngles: Vector3Tuple | null = null
  localViewAngles: Vector3Tuple | null = null
  viewOrigin2: Vector3Tuple | null = null
  viewAngles2: Vector3Tuple | null = null
  localViewAngles2: Vector3Tuple | null = null

  static read(reader: ByteReader): View {
    const view = new View()
    view.flags = reader.readInt32()
    const data: number[] = []
    for (let index = 0; index < 18; index++) data.push(reader.readFloat32())
    view.viewOrigin = [data[0], data[1], data[2]]
    view.viewAngles = [data[3], data[4], data[5]]
    view.localViewAngles = [data[6], data[7], data[8]]
    view.viewOrigin2 = [data[9], data[10], data[11]]
    view.viewAngles2 = [data[12], data[13], data[14]]
    view.localViewAngles2 = [data[15], data[16], data[17]]
    return view
  }
}

/** The in/out sequence pair of a Signon or Packet frame */
export class Sequence {
  in: number | null = null
  out: number | null = null

  static read(reader: ByteReader): Sequence {
    const sequence = new Sequence()
    sequence.in = reader.readInt32()
    sequence.out = reader.readInt32()
    return sequence
  }
}

/** Reads a length-prefixed payload; null when the length is zero */
export function readRawData(reader: ByteReader): Uint8Array | null {
  const length = reader.readInt32()
  if (length > 0) {
    return reader.readBytes(length)
  }
  return null
}

/** Raw data table payload of a DataTables frame */
export class DataTable {
  length: number = 0
  data: Uint8Array = new Uint8Array(0)

  static read(reader: ByteReader): DataTable {
    const dataTable = new DataTable()
    dataTable.length = reader.readInt32()
    dataTable.data = reader.readBytes(dataTable.length)
    return dataTable
  }
}

/**
 * A single frame of a demo. Fields are filled in by DemoFrame.read.
 */
export class DemoFrame {
  command: number = -1 // frame type, see Commands
  tick: number | null = null // tick number, normalised by DemofileParser.adjustTicks
  rawTick: number | null = null // tick number as stored in the file
  view: View | null = null
  datatable: DataTable | null = null
  rawData: Uint8Array | null = null
  lastUserCommand: UserCommand | null = null
  sequence: Sequence | null = null
  commandNumber: number | null = null // command number of a UserCmd frame
  customDataType: number | null = null // type field of a CustomData frame
  packets: NetMessage[] = [] // decoded net/svc messages of a Signon or Packet frame

  // fields only used in games that support split-screen mode
  slot: number | null = null
  view2: View | null = null

  // decoded frame payloads filled in by DemofileParser.decodeFrame
  stringTables: StringTable[] = []
  dataTablesManager: DataTablesManager | null = null

  /**
   * Reads the next frame from a reader positioned at its first byte
   * @param reader      byte reader over the file
   * @param commandSet  command protocol to use to interpret things
   * @param newEngine   demo protocol 4, which adds the slot byte and a second CmdInfo block
   * @param portal2     read the Portal 2 specific UserCmd fields
   */
  static read(
    reader: ByteReader,
    commandSet: CommandSet = CommandProto24,
    newEngine: boolean = false,
    portal2: boolean = false
  ): DemoFrame {
    const frame = new DemoFrame()
    frame.command = reader.readUint8()
    if (frame.command === commandSet.Stop) {
      frame.rawData = reader.readRest()
      return frame
    }

    frame.tick = reader.readInt32()
    frame.rawTick = frame.tick
    if (newEngine) {
      frame.slot = reader.readUint8()
    }

    if (frame.command === commandSet.SyncTick) {
      return frame
    } else if (frame.command === commandSet.ConsoleCommand) {
      frame.rawData = readRawData(reader)
    } else if (frame.command === commandSet.UserCommand) {
      frame.commandNumber = reader.readInt32()
      frame.rawData = readRawData(reader)
      frame.lastUserCommand = UserCommand.read(frame.rawData ?? new Uint8Array(0), portal2)
    } else if (frame.command === commandSet.DataTables) {
      frame.datatable = DataTable.read(reader)
    } else if (commandSet === CommandProto36 && frame.command === CommandProto36.CustomData) {
      frame.customDataType = reader.readInt32()
      frame.rawData = readRawData(reader)
    } else if (frame.command === commandSet.StringTables) {
      frame.rawData = readRawData(reader)
    } else if (frame.command === commandSet.Signon || frame.command === commandSet.Packet) {
      frame.view = View.read(reader)
      if (newEngine) {
        frame.view2 = View.read(reader)
      }
      frame.sequence = Sequence.read(reader)
      frame.rawData = readRawData(reader)
    } else {
      throw new Error(`Unknown frame type ${frame.command} at byte ${reader.position}`)
    }

    return frame
  }

  /** Text of a ConsoleCmd frame without the terminating null, or null for other frames */
  get consoleCommand(): string | null {
    if (this.rawData === null) return null
    let end = this.rawData.length
    while (end > 0 && this.rawData[end - 1] === 0) end--
    return textDecoder.decode(this.rawData.subarray(0, end))
  }

  /**
   * Checks whether this frame's raw data contains a string anywhere within its bits.
   * The position is not aligned to bytes.
   */
  contains(text: string): boolean {
    if (this.rawData === null) return false
    const pattern = new TextEncoder().encode(text)
    const data = this.rawData
    for (let shift = 0; shift < 8; shift++) {
      outer: for (let start = 0; start + pattern.length <= data.length; start++) {
        for (let index = 0; index < pattern.length; index++) {
          const position = start + index
          const low = data[position] >>> shift
          const high = position + 1 < data.length ? (data[position + 1] << (8 - shift)) & 0xff : 0
          const byte = shift === 0 ? data[position] : (low | high) & 0xff
          if (byte !== pattern[index]) continue outer
        }
        return true
      }
    }
    return false
  }
}
