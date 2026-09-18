// Port of gallantlab/DemoFiles DemoParser/DemofileParser.py
//
// The Python opens a file by name; this port takes the file bytes, which is what the browser has.
// The per-TR aggregation helpers (tickEventsToTRs, tickValuesToTRs) are not ported; repairTTLs is,
// because the co-op TTL merge uses it.

import { ByteReader } from './BitBuffer.ts'
import { CommandProto24, CommandProto36, type CommandSet } from './Commands.ts'
import { DataTablesManager } from './DataTables.ts'
import { DemoFrame } from './DemoFrame.ts'
import { EntityDecoder } from './Entities.ts'
import type { GameEventManager } from './GameEvents.ts'
import {
  MessageStream,
  NetTick,
  SvcCreateStringTable,
  SvcPacketEntities,
  SvcUpdateStringTable,
  type MessageStreamContext,
} from './NetMessages.ts'
import { StringTablesFrame, StringTableManager, type StringTable } from './StringTables.ts'
import { median } from '../Numeric.ts'

// game directories that use the Portal 2 branch of the engine
export const Portal2GameDirectories = [
  'portal2',
  'TWTM',
  'aperturetag',
  'portal_stories',
  'portalreloaded',
  'Portal 2 Speedrun Mod',
]

export type ProgressCallback = (fraction: number) => void

export type EntityCallback = (
  frame: DemoFrame,
  message: SvcPacketEntities,
  decoder: EntityDecoder
) => void

export interface DemofileParserOptions {
  /** is this a split-screen game? Defaults to whether the demo protocol is 4 */
  splitScreen?: boolean
  /** read all frames on construction */
  parseFrames?: boolean
  /** called with the fraction of the file read while parsing frames */
  onProgress?: ProgressCallback
}

/**
 * Parses a demo file
 */
export class DemofileParser implements MessageStreamContext {
  /**
   * Fills in missing TTL tick numbers
   * @param ticks         list of actually recorded TTLs
   * @param numTRs        number of expected TRs
   * @param runTolerance  number of missed TTLs to break into runs
   * @returns list with missing TTLs inserted, or a list of runs when the gaps split the pulses
   */
  static repairTTLs(
    ticks: number[],
    numTRs: number | null = null,
    runTolerance: number = 5
  ): number[] | number[][] {
    const deltas: number[] = []
    for (let index = 1; index < ticks.length; index++) deltas.push(ticks[index] - ticks[index - 1])
    // median duration of TTLs, used to estimate timing of missing TTLs
    const ttlDuration = Math.trunc(median(deltas))

    const runs: number[][] = []
    let out: number[] = [ticks[0]]
    for (let index = 1; index < ticks.length - 1; index++) {
      const deltaFromLastTick = ticks[index] - ticks[index - 1]
      // if this one is less than 0.5 median durations, it's a duplicate and we skip it
      if (deltaFromLastTick > 0.5 * ttlDuration) {
        out.push(ticks[index])
      }
      // if the next TTL tick is >= 1.5 median durations, then we missed one and we add in one at the
      // median value, but only if it's not too long, because if it's too long, that's a gap between
      // runs, and we start a new run
      const deltaToNextTick = ticks[index + 1] - ticks[index]
      if (deltaToNextTick > 1.5 * ttlDuration) {
        if (deltaToNextTick < (runTolerance + 0.5) * ttlDuration) {
          let next = ticks[index] + ttlDuration
          while (next < ticks[index + 1]) {
            out.push(next)
            next += ttlDuration
          }
        } else {
          runs.push(out)
          out = []
        }
      }
    }
    out.push(ticks[ticks.length - 1])
    runs.push(out)

    if (numTRs !== null) {
      while (out.length < numTRs) {
        out.push(out[out.length - 1] + ttlDuration)
      }
    }

    if (runs.length < 2) {
      return runs[0]
    }
    return runs
  }

  readonly fileName: string
  protected readonly reader: ByteReader

  // Header information
  gameName: string | null = null
  demoProtocol: number | null = null
  networkProtocol: number | null = null
  serverName: string | null = null
  clientName: string | null = null
  mapName: string | null = null
  gameDirectory: string | null = null
  playbackTime: number | null = null
  numTicks: number | null = null
  numFrames: number | null = null
  signOnDataLength: number | null = null

  frames: DemoFrame[] = []

  // running state built from the message stream
  gameEventManager: GameEventManager | null = null
  stringTableManager: StringTableManager
  dataTablesManager: DataTablesManager | null = null
  stringTables: StringTable[] = [] // tables decoded from the StringTables frame
  entityDecoder: EntityDecoder | null = null // entity state after parseEntities

  readonly newEngine: boolean
  readonly isPortal2: boolean
  readonly commandSet: CommandSet
  readonly splitScreen: boolean

  constructor(
    fileName: string,
    data: ArrayBuffer | Uint8Array,
    options: DemofileParserOptions = {}
  ) {
    this.fileName = fileName
    this.reader = new ByteReader(data instanceof Uint8Array ? data : new Uint8Array(data))

    this.readHeader()
    this.newEngine = this.demoProtocol === 4
    this.isPortal2 = Portal2GameDirectories.includes(this.gameDirectory ?? '')
    this.stringTableManager = new StringTableManager(this.newEngine)
    this.commandSet = this.newEngine ? CommandProto36 : CommandProto24
    this.splitScreen = options.splitScreen ?? this.newEngine

    if (options.parseFrames ?? true) {
      this.parseFile(options.onProgress)
    }
  }

  /** Resets the internal demo file parsing logic */
  reset(): void {
    this.reader.position = 0
    this.readHeader()
    this.frames = []
    this.gameEventManager = null
    this.stringTableManager = new StringTableManager(this.newEngine)
    this.dataTablesManager = null
    this.stringTables = []
    this.entityDecoder = null
  }

  /** Reads the demo header */
  readHeader(): void {
    const reader = this.reader
    this.gameName = reader.readFixedString(8)
    this.demoProtocol = reader.readInt32()
    this.networkProtocol = reader.readInt32()
    this.serverName = reader.readFixedString(260)
    this.clientName = reader.readFixedString(260)
    this.mapName = reader.readFixedString(260)
    this.gameDirectory = reader.readFixedString(260)
    this.playbackTime = reader.readFloat32()
    this.numTicks = reader.readInt32()
    this.numFrames = reader.readInt32()
    this.signOnDataLength = reader.readInt32()
  }

  /** Reads the next frame from the file and decodes its payload */
  readFrame(): DemoFrame {
    const frame = DemoFrame.read(this.reader, this.commandSet, this.newEngine, this.isPortal2)
    this.decodeFrame(frame)
    return frame
  }

  /**
   * Decodes the payload of a frame: the message stream of Signon and Packet frames, the StringTables
   * frame and the DataTables frame
   */
  decodeFrame(frame: DemoFrame): void {
    if (frame.command === this.commandSet.Signon || frame.command === this.commandSet.Packet) {
      if (frame.rawData !== null) {
        frame.packets = MessageStream.read(frame.rawData, this, frame.rawTick)
      }
    } else if (frame.command === this.commandSet.StringTables) {
      this.stringTables = StringTablesFrame.read(frame.rawData ?? new Uint8Array(0), this.newEngine)
      frame.stringTables = this.stringTables
      this.stringTableManager.initFromFrame(this.stringTables)
    } else if (frame.command === this.commandSet.DataTables) {
      this.dataTablesManager = DataTablesManager.read(
        frame.datatable?.data ?? new Uint8Array(0),
        this.newEngine
      )
      this.dataTablesManager.flattenClasses()
      frame.dataTablesManager = this.dataTablesManager
    }
  }

  /** Parses the rest of the file after the header */
  parseFile(onProgress?: ProgressCallback): void {
    const total = this.reader.data.length
    this.frames.push(this.readFrame())
    let counter = 0
    while (this.frames[this.frames.length - 1].command !== this.commandSet.Stop) {
      if (this.reader.remaining <= 0) {
        break
      }
      this.frames.push(this.readFrame())
      if (onProgress && ++counter % 256 === 0) {
        onProgress(this.reader.position / total)
      }
    }
    if (onProgress) onProgress(1)
    this.adjustTicks()
  }

  /**
   * Normalises frame ticks: frames before the SyncTick get tick 0 and negative ticks after it repeat
   * the previous tick. The tick stored in the file stays available as rawTick.
   */
  adjustTicks(): void {
    let synced = false
    let lastTick = 0
    for (const frame of this.frames) {
      if (frame.rawTick === null) continue
      if (frame.command === this.commandSet.SyncTick) {
        synced = true
      }
      if (!synced) {
        frame.tick = 0
      } else if (frame.rawTick < 0) {
        frame.tick = lastTick
      } else {
        frame.tick = frame.rawTick
      }
      lastTick = frame.tick
    }
  }

  /**
   * Replays the frames in order and decodes every SvcPacketEntities message into a running entity
   * snapshot. Baselines come from the instancebaseline string table entries as they arrive.
   * @param callback    called as callback(frame, message, decoder) after each decoded SvcPacketEntities
   * @param onProgress  called with the fraction of frames replayed
   * @returns the decoder holding the final snapshot; also stored as entityDecoder
   */
  parseEntities(
    callback: EntityCallback | null = null,
    onProgress?: ProgressCallback
  ): EntityDecoder {
    if (this.dataTablesManager === null) {
      throw new Error('Entity parsing needs the DataTables frame')
    }
    const decoder = new EntityDecoder(this.dataTablesManager, this.newEngine)
    const frameCount = this.frames.length
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const frame = this.frames[frameIndex]
      if (onProgress && frameIndex % 256 === 0) onProgress(frameIndex / frameCount)
      if (frame.command === this.commandSet.Signon || frame.command === this.commandSet.Packet) {
        for (const message of frame.packets) {
          if (message instanceof NetTick) {
            decoder.serverTick = message.tick
          } else if (
            message instanceof SvcCreateStringTable ||
            message instanceof SvcUpdateStringTable
          ) {
            if (message.tableName === 'instancebaseline') {
              for (const [, entry] of message.entries) {
                if (entry.data !== null) {
                  decoder.applyBaselineEntry(entry.name, entry.data)
                }
              }
            }
          } else if (message instanceof SvcPacketEntities) {
            try {
              decoder.decode(message)
            } catch (error) {
              throw new Error(
                `Entity decoding failed at tick ${frame.rawTick}: ${error instanceof Error ? error.message : String(error)}`
              )
            }
            if (callback !== null) {
              callback(frame, message, decoder)
            }
          }
        }
      } else if (frame.command === this.commandSet.StringTables) {
        for (const table of frame.stringTables) {
          if (table.name === 'instancebaseline') {
            for (const entry of table.entries) {
              if (entry.data !== null) {
                decoder.applyBaselineEntry(entry.name, entry.data)
              }
            }
          }
        }
      }
    }
    if (onProgress) onProgress(1)
    this.entityDecoder = decoder
    return decoder
  }
}
