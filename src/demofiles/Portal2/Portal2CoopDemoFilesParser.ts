// Port of gallantlab/DemoFiles Portal2/Portal2CoopDemoFilesParser.py
//
// The Python constructs the two parsers from file names; this port takes two parsed
// Portal2DemoFileParser instances, because the browser hands over file bytes.

import { DemofileParser } from '../DemoParser/DemofileParser.ts'
import {
  arange,
  createMatrix,
  diff,
  interpArray,
  matrixColumn,
  maximum,
  median,
  minimum,
  unique,
  type Matrix,
} from '../Numeric.ts'
import {
  EntityTimeSeries,
  parseHistoryKey,
  type EntityTimeSeriesSource,
  type HistoryGroups,
} from './EntityTimeSeries.ts'
import type { Portal2DemoFileParser } from './Portal2DemoFileParser.ts'
import type { EntityHistory, PortalTraversal } from './Structures.ts'

/**
 * Wrapper around two Portal2DemoFileParser objects to parse two demofiles from the same coop session
 */
export class Portal2CoopDemoFilesParser implements EntityTimeSeriesSource {
  readonly player1Parser: Portal2DemoFileParser
  readonly player2Parser: Portal2DemoFileParser
  readonly player1SyncTick: number
  readonly player2SyncTick: number
  readonly timeSeries: EntityTimeSeries

  constructor(player1Parser: Portal2DemoFileParser, player2Parser: Portal2DemoFileParser) {
    this.player1Parser = player1Parser
    this.player2Parser = player2Parser
    this.player1SyncTick = player1Parser.getSyncTick()
    this.player2SyncTick = player2Parser.getSyncTick()
    this.timeSeries = new EntityTimeSeries(this)
  }

  get parsers(): [Portal2DemoFileParser, Portal2DemoFileParser] {
    return [this.player1Parser, this.player2Parser]
  }

  /** Server ticks of the level transition markers in each demo, for checking the alignment */
  getLevelTransitionServerTicks(): [number[], number[]] {
    return [
      Array.from(
        this.player1Parser.demoTicksToServerTicks(this.player1Parser.getLevelTransitionTicks())
      ),
      Array.from(
        this.player2Parser.demoTicksToServerTicks(this.player2Parser.getLevelTransitionTicks())
      ),
    ]
  }

  /**
   * Server ticks of the scanner pulses, taken from the TTL chat messages of both demos and merged
   * @param repair  fill in missed pulses with repairTTLs
   * @param numTRs  expected number of pulses passed to repairTTLs
   * @returns sorted integer array of server ticks
   */
  getTTLServerTicks(repair: boolean = true, numTRs: number | null = null): Int32Array {
    let serverTicks: number[] = []
    for (const parser of this.parsers) {
      const ttlTicks = parser.getTTLTicks()
      serverTicks = serverTicks.concat(
        Array.from(parser.demoTicksToServerTicks(ttlTicks)).map(Math.round)
      )
    }
    serverTicks.sort((left, right) => left - right)
    if (serverTicks.length === 0) {
      return new Int32Array(0)
    }
    // the same pulse seen in both demos lands within a few server ticks; keep the earliest of each cluster
    const spacing = serverTicks.length > 1 ? Math.trunc(median(diff(serverTicks))) : 0
    let merged: number[] = [serverTicks[0]]
    for (const tick of serverTicks.slice(1)) {
      if (tick - merged[merged.length - 1] > 0.5 * spacing) {
        merged.push(tick)
      }
    }
    if (repair && merged.length > 2) {
      const repaired = DemofileParser.repairTTLs(merged, numTRs)
      merged = Array.isArray(repaired[0]) ? (repaired as number[][]).flat() : (repaired as number[])
    }
    return Int32Array.from(merged)
  }

  /** Scanner pulses on the server clock and on each demo's clock, arrays of the same length */
  getTTLTicks(
    repair: boolean = true,
    numTRs: number | null = null
  ): [Int32Array, Int32Array, Int32Array] {
    const serverTicks = this.getTTLServerTicks(repair, numTRs)
    return [
      serverTicks,
      Int32Array.from(this.player1Parser.serverTicksToDemoTicks(serverTicks), Math.round),
      Int32Array.from(this.player2Parser.serverTicksToDemoTicks(serverTicks), Math.round),
    ]
  }

  /** Server ticks covered by both demos, consecutive */
  getSynchronizedServerTicks(): Int32Array {
    const ticks1 = this.player1Parser.getServerTicks().map(row => row[1])
    const ticks2 = this.player2Parser.getServerTicks().map(row => row[1])
    if (ticks1.length === 0 || ticks2.length === 0) return new Int32Array(0)
    return arange(
      Math.max(minimum(ticks1), minimum(ticks2)),
      Math.min(maximum(ticks1), maximum(ticks2)) + 1
    )
  }

  /**
   * Resamples per-frame values of one demo onto a server tick axis
   * @param parser       the demo's parser
   * @param values       [N x C] values
   * @param demoTicks    demo tick of each row
   * @param serverTicks  server tick axis
   */
  resampleToServerTicks(
    parser: Portal2DemoFileParser,
    values: Matrix,
    demoTicks: ArrayLike<number>,
    serverTicks: Int32Array
  ): Matrix {
    const rowServerTicks = parser.demoTicksToServerTicks(demoTicks)
    const { values: axis, firstIndices } = unique(rowServerTicks)
    const result = createMatrix(serverTicks.length, values.columns)
    for (let column = 0; column < values.columns; column++) {
      const columnValues = matrixColumn(values, column)
      const samples = new Float64Array(firstIndices.length)
      for (let index = 0; index < firstIndices.length; index++)
        samples[index] = columnValues[firstIndices[index]]
      const interpolated = interpArray(serverTicks, axis, samples)
      for (let row = 0; row < serverTicks.length; row++) {
        result.data[row * values.columns + column] = interpolated[row]
      }
    }
    return result
  }

  /** Synchronized view vectors for the two players: server ticks, [M x 3], [M x 3] */
  getViewVectors(): [Int32Array, Matrix, Matrix] {
    const serverTicks = this.getSynchronizedServerTicks()
    const [vectors1, ticks1] = this.player1Parser.getFrameViewVectors()
    const [vectors2, ticks2] = this.player2Parser.getFrameViewVectors()
    return [
      serverTicks,
      this.resampleToServerTicks(this.player1Parser, vectors1, ticks1, serverTicks),
      this.resampleToServerTicks(this.player2Parser, vectors2, ticks2, serverTicks),
    ]
  }

  /** Synchronized positions for the two players: server ticks, [M x 3], [M x 3] */
  getPositions(): [Int32Array, Matrix, Matrix] {
    const serverTicks = this.getSynchronizedServerTicks()
    const [positions1, ticks1] = this.player1Parser.getFramePositions()
    const [positions2, ticks2] = this.player2Parser.getFramePositions()
    return [
      serverTicks,
      this.resampleToServerTicks(this.player1Parser, positions1, ticks1, serverTicks),
      this.resampleToServerTicks(this.player2Parser, positions2, ticks2, serverTicks),
    ]
  }

  /**
   * Recorded histories of the player entities from both demos. For each player's entity the demo
   * that player recorded is listed first, since it carries that player's origin at full precision.
   */
  playerHistories(): HistoryGroups {
    const groups = EntityTimeSeries.mergeHistoryGroups(
      this.player1Parser.playerHistories(),
      this.player2Parser.playerHistories()
    )
    const player2Index = this.player2Parser.getLocalPlayerEntityIndex()
    for (const [key, histories] of groups) {
      const [entityIndex] = parseHistoryKey(key)
      if (entityIndex === player2Index) {
        histories.reverse()
      }
    }
    return groups
  }

  portalHistories(): HistoryGroups {
    return EntityTimeSeries.mergeHistoryGroups(
      this.player1Parser.portalHistories(),
      this.player2Parser.portalHistories()
    )
  }

  cubeHistories(): HistoryGroups {
    return EntityTimeSeries.mergeHistoryGroups(
      this.player1Parser.cubeHistories(),
      this.player2Parser.cubeHistories()
    )
  }

  floorButtonHistories(): HistoryGroups {
    return EntityTimeSeries.mergeHistoryGroups(
      this.player1Parser.floorButtonHistories(),
      this.player2Parser.floorButtonHistories()
    )
  }

  doorHistories(): HistoryGroups {
    return EntityTimeSeries.mergeHistoryGroups(
      this.player1Parser.doorHistories(),
      this.player2Parser.doorHistories()
    )
  }

  laserHistories(): HistoryGroups {
    return EntityTimeSeries.mergeHistoryGroups(
      this.player1Parser.laserHistories(),
      this.player2Parser.laserHistories()
    )
  }

  /** Server ticks of the rows of every time series, those covered by both demos */
  tickAxis(): Int32Array {
    return this.getSynchronizedServerTicks()
  }

  /** Server ticks of the Packet frames of either demo, sorted and unique */
  packetTicks(): Int32Array {
    const ticks = [
      ...this.player1Parser.getServerTicks().map(row => row[1]),
      ...this.player2Parser.getServerTicks().map(row => row[1]),
    ]
    return Int32Array.from(unique(ticks).values)
  }

  /** Server ticks at which a history was recorded */
  historyTicks(history: EntityHistory): Int32Array {
    return Int32Array.from(history.serverTicks)
  }

  /**
   * Portal traversals seen by either demo on the server tick clock; a traversal reported by both
   * demos is kept once, at the earlier server tick
   */
  portalTraversalRows(): [number, PortalTraversal][] {
    const traversals = new Map<string, PortalTraversal>()
    for (const parser of this.parsers) {
      for (const traversal of parser.getPortalTraversalRecords()) {
        const time =
          traversal.time === null ? 'null' : (Math.round(traversal.time * 1000) / 1000).toString()
        const key = `${traversal.entityIndex}:${traversal.enteredPortal}:${time}`
        const existing = traversals.get(key)
        if (!existing || traversal.serverTick < existing.serverTick) {
          traversals.set(key, traversal)
        }
      }
    }
    return Array.from(traversals.values())
      .map(traversal => [traversal.serverTick, traversal] as [number, PortalTraversal])
      .sort((left, right) => left[0] - right[0])
  }

  // ─── time series delegates ───

  getPlayerEntityIndices(): number[] {
    return this.timeSeries.getPlayerEntityIndices()
  }

  getPlayerEntityStates(): Matrix[] {
    return this.timeSeries.getPlayerEntityStates()
  }

  getHeldObjects(): Float64Array[] {
    return this.timeSeries.getHeldObjects()
  }

  getPortalStates(): (Matrix | null)[] {
    return this.timeSeries.getPortalStates()
  }

  getFloorButtonStates(): Map<string, Matrix> {
    return this.timeSeries.getFloorButtonStates()
  }

  getDoorStates(): Map<string, Matrix> {
    return this.timeSeries.getDoorStates()
  }

  getCubePositions(): Map<string, Matrix> {
    return this.timeSeries.getCubePositions()
  }

  getLaserStates(): Map<string, Matrix> {
    return this.timeSeries.getLaserStates()
  }

  getPortalTraversals(): Matrix {
    return this.timeSeries.getPortalTraversals()
  }

  getPortalEntries(): Matrix {
    return this.timeSeries.getPortalEntries()
  }

  getPortalExits(): Matrix {
    return this.timeSeries.getPortalExits()
  }

  getPortalProximity(): Matrix {
    return this.timeSeries.getPortalProximity()
  }

  getPortalProximityIntervals(): Matrix {
    return this.timeSeries.getPortalProximityIntervals()
  }
}
