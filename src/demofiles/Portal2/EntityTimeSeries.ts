// Port of gallantlab/DemoFiles Portal2/EntityTimeSeries.py
//
// The Python is a mixin over the parser classes; here the parsers implement EntityTimeSeriesSource
// and hold an EntityTimeSeries built over themselves.

import {
  InvalidEntityHandle,
  MaxEdicts,
  PropArray,
  type PropertyValue,
} from '../DemoParser/Entities.ts'
import {
  type Matrix,
  argsortStable,
  copyMatrix,
  createMatrix,
  interp,
  matrixColumn,
  matrixGet,
  matrixSet,
  searchsorted,
  unique,
  vstack,
} from '../Numeric.ts'
import {
  CubeDescriptors,
  DoorDescriptors,
  FloorButtonDescriptors,
  HeldObjectDescriptors,
  HistoryFields,
  LaserDescriptors,
  BridgeDescriptors,
  PlayerDescriptor,
  PlayerDescriptors,
  PortalDescriptor,
  PortalDescriptors,
  PortalProximityParameterCount,
  PortalTraversalParameterCount,
  propertyValueToNumber,
  type EntityDescriptionParameters,
  type EntityHistory,
  type PortalTraversal,
} from './Structures.ts'

/** History lists by (entity index, serial), keyed with historyKey */
export type HistoryGroups = Map<string, EntityHistory[]>

export function historyKey(entityIndex: number, serial: number): string {
  return `${entityIndex}:${serial}`
}

export function parseHistoryKey(key: string): [number, number] {
  const [entityIndex, serial] = key.split(':')
  return [Number(entityIndex), Number(serial)]
}

/** Keys sorted like Python sorts (entity index, serial) tuples */
export function sortedHistoryKeys(keys: Iterable<string>): string[] {
  return Array.from(keys).sort((left, right) => {
    const [leftIndex, leftSerial] = parseHistoryKey(left)
    const [rightIndex, rightSerial] = parseHistoryKey(right)
    return leftIndex - rightIndex || leftSerial - rightSerial
  })
}

/** What a parser supplies to build per-tick series */
export interface EntityTimeSeriesSource {
  playerHistories(): HistoryGroups
  portalHistories(): HistoryGroups
  cubeHistories(): HistoryGroups
  floorButtonHistories(): HistoryGroups
  doorHistories(): HistoryGroups
  laserHistories(): HistoryGroups
  bridgeHistories(): HistoryGroups
  /** Ticks of the rows of every time series */
  tickAxis(): Int32Array
  /** Ticks at which entities were reported, on the tick axis clock, sorted */
  packetTicks(): Int32Array
  /** Recorded ticks of a history on the tick axis clock */
  historyTicks(history: EntityHistory): Int32Array
  /** Portal traversals with the tick of each on the tick axis clock, in tick order */
  portalTraversalRows(): [number, PortalTraversal][]
}

/**
 * Per-tick entity state series built from entity histories
 */
export class EntityTimeSeries {
  readonly source: EntityTimeSeriesSource

  constructor(source: EntityTimeSeriesSource) {
    this.source = source
  }

  /** Combines the history groups of two sources entity by entity */
  static mergeHistoryGroups(groups1: HistoryGroups, groups2: HistoryGroups): HistoryGroups {
    const merged: HistoryGroups = new Map()
    for (const [key, histories] of groups1) merged.set(key, [...histories])
    for (const [key, histories] of groups2) {
      const existing = merged.get(key)
      if (existing) {
        existing.push(...histories)
      } else {
        merged.set(key, [...histories])
      }
    }
    return merged
  }

  /** Entity index part of a networked entity handle, or null for an invalid or unset handle */
  static handleToEntityIndex(handle: PropertyValue | undefined): number | null {
    if (handle === null || handle === undefined || typeof handle !== 'number') return null
    if (handle === InvalidEntityHandle) return null
    return handle & (MaxEdicts - 1)
  }

  /** Most frequent value among the values that are not NaN, or null when every value is NaN */
  static mostCommonValue(values: Float64Array): number | null {
    const counts = new Map<number, number>()
    for (let index = 0; index < values.length; index++) {
      const value = values[index]
      if (Number.isNaN(value)) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    if (counts.size === 0) return null
    let best: number | null = null
    let bestCount = -1
    // numpy.unique sorts the values, and argmax picks the first maximum, so ties go to the smallest value
    for (const value of Array.from(counts.keys()).sort((left, right) => left - right)) {
      const count = counts.get(value)!
      if (count > bestCount) {
        best = value
        bestCount = count
      }
    }
    return best
  }

  /** Reads the described columns out of a history, one row per recorded tick, NaN for unset values */
  static readDescriptors(
    history: EntityHistory,
    descriptors: EntityDescriptionParameters[]
  ): Matrix {
    const numRows = history.ticks.length
    const samples = createMatrix(numRows, descriptors.length)
    descriptors.forEach((descriptor, column) => {
      for (let row = 0; row < numRows; row++) {
        let value: number
        if (descriptor.source === HistoryFields.Origin) {
          const origin = history.origins[row]
          value = origin === null ? NaN : origin[descriptor.component ?? 0]
        } else if (descriptor.source === HistoryFields.ServerTick) {
          value = history.serverTicks[row]
        } else if (descriptor.source === HistoryFields.EntityIndex) {
          value = history.entityIndex
        } else {
          const values = history.values[descriptor.source]
          let raw: PropertyValue | undefined = values ? values[row] : undefined
          if (descriptor.component !== null) {
            if (Array.isArray(raw)) {
              raw = raw[descriptor.component] ?? null
            } else if (raw instanceof PropArray) {
              raw = raw.elements[descriptor.component] ?? null
            } else {
              raw = null
            }
          }
          if (descriptor.isHandle) {
            const entityIndex = EntityTimeSeries.handleToEntityIndex(raw)
            value = entityIndex === null ? NaN : entityIndex
          } else {
            value = propertyValueToNumber(raw)
          }
        }
        samples.data[row * descriptors.length + column] = value
      }
    })
    return samples
  }

  /**
   * Lays samples onto a tick axis: continuous columns are interpolated linearly and the others hold
   * their last value. Rows before the first sample and from the first packet tick after the last
   * sample onwards are NaN.
   * @param axis         integer ticks of the output rows (sorted)
   * @param sampleTicks  tick of each sample row; duplicate ticks keep the first value that is set
   * @param samples      [N x C] sample values
   * @param continuous   interpolate flag per column
   * @param packetTicks  sorted ticks at which entities were reported
   */
  static resample(
    axis: Int32Array,
    sampleTicks: ArrayLike<number>,
    samples: Matrix,
    continuous: boolean[],
    packetTicks: Int32Array
  ): Matrix {
    const series = createMatrix(axis.length, samples.columns)
    if (sampleTicks.length === 0 || axis.length === 0) {
      return series
    }
    const order = argsortStable(sampleTicks)
    const sortedTicks = new Float64Array(order.length)
    for (let position = 0; position < order.length; position++)
      sortedTicks[position] = sampleTicks[order[position]]
    const { values: uniqueTicks, inverse } = unique(sortedTicks)

    const followingIndex = searchsorted(packetTicks, uniqueTicks[uniqueTicks.length - 1], 'right')
    const spanEnd =
      followingIndex < packetTicks.length ? packetTicks[followingIndex] : axis[axis.length - 1] + 1
    const rowStart = searchsorted(axis, uniqueTicks[0], 'left')
    const rowEnd = searchsorted(axis, spanEnd, 'left')

    for (let column = 0; column < samples.columns; column++) {
      const merged = new Float64Array(uniqueTicks.length).fill(NaN)
      // assign in reverse so that the first set value of a tick wins
      for (let position = order.length - 1; position >= 0; position--) {
        const value = samples.data[order[position] * samples.columns + column]
        if (!Number.isNaN(value)) {
          merged[inverse[position]] = value
        }
      }
      const knownTicks: number[] = []
      const knownValues: number[] = []
      for (let index = 0; index < merged.length; index++) {
        if (!Number.isNaN(merged[index])) {
          knownTicks.push(uniqueTicks[index])
          knownValues.push(merged[index])
        }
      }
      if (knownTicks.length === 0) continue

      for (let row = rowStart; row < rowEnd; row++) {
        const tick = axis[row]
        let value: number
        if (continuous[column]) {
          value = interp(tick, knownTicks, knownValues)
        } else {
          const index = searchsorted(knownTicks, tick, 'right') - 1
          value = index >= 0 ? knownValues[index] : NaN
        }
        series.data[row * series.columns + column] = value
      }
    }
    return series
  }

  /** Time series of each entity from its recorded histories, [ticks x columns] by history key */
  entitySeries(
    groups: HistoryGroups,
    descriptors: EntityDescriptionParameters[]
  ): Map<string, Matrix> {
    const axis = this.source.tickAxis()
    const packetTicks = this.source.packetTicks()
    const continuous = descriptors.map(descriptor => descriptor.continuous)
    const series = new Map<string, Matrix>()
    for (const [key, histories] of groups) {
      const tickArrays = histories.map(history => this.source.historyTicks(history))
      const totalLength = tickArrays.reduce((total, ticks) => total + ticks.length, 0)
      const ticks = new Float64Array(totalLength)
      let offset = 0
      for (const array of tickArrays) {
        ticks.set(array, offset)
        offset += array.length
      }
      const samples = vstack(
        histories.map(history => EntityTimeSeries.readDescriptors(history, descriptors)),
        descriptors.length
      )
      series.set(key, EntityTimeSeries.resample(axis, ticks, samples, continuous, packetTicks))
    }
    return series
  }

  /** Copies the rows of a series that hold any value onto another series of the same shape */
  static overlaySeries(target: Matrix, source: Matrix): void {
    for (let row = 0; row < source.rows; row++) {
      let anyValue = false
      for (let column = 0; column < source.columns; column++) {
        if (!Number.isNaN(source.data[row * source.columns + column])) {
          anyValue = true
          break
        }
      }
      if (anyValue) {
        target.data.set(
          source.data.subarray(row * source.columns, (row + 1) * source.columns),
          row * target.columns
        )
      }
    }
  }

  /** Overlays the series of the entities that occupied each slot into one series per slot */
  static seriesBySlot(series: Map<string, Matrix>): Matrix[] {
    const slots = new Map<number, Matrix>()
    for (const key of sortedHistoryKeys(series.keys())) {
      const [entityIndex] = parseHistoryKey(key)
      const existing = slots.get(entityIndex)
      if (!existing) {
        slots.set(entityIndex, copyMatrix(series.get(key)!))
      } else {
        EntityTimeSeries.overlaySeries(existing, series.get(key)!)
      }
    }
    return Array.from(slots.keys())
      .sort((left, right) => left - right)
      .map(entityIndex => slots.get(entityIndex)!)
  }

  /** Entity indices of the players, in slot order */
  getPlayerEntityIndices(): number[] {
    const indices = new Set<number>()
    for (const key of this.source.playerHistories().keys()) {
      indices.add(parseHistoryKey(key)[0])
    }
    return Array.from(indices).sort((left, right) => left - right)
  }

  /** Per-tick state of the players, one [ticks x PlayerDescriptor] series per player in slot order */
  getPlayerEntityStates(): Matrix[] {
    return EntityTimeSeries.seriesBySlot(
      this.entitySeries(this.source.playerHistories(), PlayerDescriptors)
    )
  }

  /** Per-tick entity index of the object each player holds, one series per player in slot order */
  getHeldObjects(): Float64Array[] {
    return EntityTimeSeries.seriesBySlot(
      this.entitySeries(this.source.playerHistories(), HeldObjectDescriptors)
    ).map(series => matrixColumn(series, 0))
  }

  /** Per-tick state of the portals, in PortalSlot order; null for a portal never fired */
  getPortalStates(): (Matrix | null)[] {
    const series = this.entitySeries(this.source.portalHistories(), PortalDescriptors)
    const portals = new Map<string, Matrix>()
    for (const key of sortedHistoryKeys(series.keys())) {
      const matrix = series.get(key)!
      const firedBy = EntityTimeSeries.mostCommonValue(
        matrixColumn(matrix, PortalDescriptor.firedByPlayer)
      )
      const isPortal2 = EntityTimeSeries.mostCommonValue(
        matrixColumn(matrix, PortalDescriptor.isPortal2)
      )
      if (firedBy === null || isPortal2 === null) continue
      const portalKey = `${Math.trunc(firedBy)}:${Math.trunc(isPortal2)}`
      const existing = portals.get(portalKey)
      if (!existing) {
        portals.set(portalKey, copyMatrix(matrix))
      } else {
        EntityTimeSeries.overlaySeries(existing, matrix)
      }
    }
    const result: (Matrix | null)[] = []
    for (const playerIndex of this.getPlayerEntityIndices()) {
      for (const isPortal2 of [0, 1]) {
        result.push(portals.get(`${playerIndex}:${isPortal2}`) ?? null)
      }
    }
    return result
  }

  /** One entry of getPortalStates */
  portalState(index: number): Matrix | null {
    const portals = this.getPortalStates()
    return index < portals.length ? portals[index] : null
  }

  /** Per-tick floor button positions and states by history key */
  getFloorButtonStates(): Map<string, Matrix> {
    return this.entitySeries(this.source.floorButtonHistories(), FloorButtonDescriptors)
  }

  /** Per-tick door positions and rotations by history key */
  getDoorStates(): Map<string, Matrix> {
    return this.entitySeries(this.source.doorHistories(), DoorDescriptors)
  }

  /** Per-tick weighted cube positions by history key */
  getCubePositions(): Map<string, Matrix> {
    return this.entitySeries(this.source.cubeHistories(), CubeDescriptors)
  }

  /** Per-tick laser origin, start, end and on state by history key (viewer addition) */
  getLaserStates(): Map<string, Matrix> {
    return this.entitySeries(this.source.laserHistories(), LaserDescriptors)
  }

  /** Per-tick state of the light bridge segments, one [ticks x BridgeDescriptor] series per entity */
  getBridgeStates(): Map<string, Matrix> {
    return this.entitySeries(this.source.bridgeHistories(), BridgeDescriptors)
  }

  /** Portal traversals read from the entity-portalled messages, one row per traversal in tick order */
  getPortalTraversals(): Matrix {
    const rows = this.source.portalTraversalRows()
    const matrix = createMatrix(rows.length, PortalTraversalParameterCount)
    rows.forEach(([tick, traversal], row) => {
      const values = [
        tick,
        traversal.serverTick,
        traversal.time,
        traversal.entityIndex,
        traversal.enteredPortal,
        traversal.exitPortal,
        traversal.forcedDuck ? 1 : 0,
      ]
      values.forEach((value, column) => {
        matrix.data[row * matrix.columns + column] = value === null ? NaN : value
      })
    })
    return matrix
  }

  /**
   * Per-tick entity index of the entity entering, or coming out of, each portal
   * @param exits  mark the portal the entity came out of rather than the one it entered
   */
  portalTraversalSeries(exits: boolean): Matrix {
    const axis = this.source.tickAxis()
    const portals = this.getPortalStates()
    const series = createMatrix(axis.length, portals.length)
    for (const [tick, traversal] of this.source.portalTraversalRows()) {
      const portalIndex = exits ? traversal.exitPortal : traversal.enteredPortal
      const row = searchsorted(axis, tick, 'left')
      if (
        portalIndex === null ||
        traversal.entityIndex === null ||
        row >= axis.length ||
        axis[row] !== tick
      ) {
        continue
      }
      portals.forEach((portal, slot) => {
        if (
          portal !== null &&
          matrixGet(portal, row, PortalDescriptor.entityIndex) === portalIndex
        ) {
          matrixSet(series, row, slot, traversal.entityIndex!)
        }
      })
    }
    return series
  }

  getPortalEntries(): Matrix {
    return this.portalTraversalSeries(false)
  }

  getPortalExits(): Matrix {
    return this.portalTraversalSeries(true)
  }

  /**
   * Per-tick portal whose environment each player is in, from the player's portal environment
   * handle, one column per player in slot order; values are PortalSlot indices, NaN while the
   * player is not near a portal
   */
  getPortalProximity(): Matrix {
    const portals = this.getPortalStates()
    const players = this.getPlayerEntityStates()
    const series = createMatrix(this.source.tickAxis().length, players.length)
    players.forEach((player, column) => {
      const environment = matrixColumn(player, PlayerDescriptor.portalEnvironment)
      portals.forEach((portal, slot) => {
        if (portal === null) return
        for (let row = 0; row < series.rows; row++) {
          const portalEntity = matrixGet(portal, row, PortalDescriptor.entityIndex)
          if (!Number.isNaN(portalEntity) && environment[row] === portalEntity) {
            matrixSet(series, row, column, slot)
          }
        }
      })
    })
    return series
  }

  /**
   * Spans during which each player was in a portal's environment, one row per span in start order:
   * start tick, end tick (the first tick no longer near, NaN when the axis ends while still near),
   * player entity index, portal slot
   */
  getPortalProximityIntervals(): Matrix {
    const axis = this.source.tickAxis()
    const proximity = this.getPortalProximity()
    const rows: number[][] = []
    this.getPlayerEntityIndices().forEach((entityIndex, column) => {
      const codes = new Float64Array(axis.length)
      for (let row = 0; row < axis.length; row++) {
        const value = matrixGet(proximity, row, column)
        codes[row] = Number.isNaN(value) ? -1 : value
      }
      const starts: number[] = []
      let previous = -2
      for (let row = 0; row < codes.length; row++) {
        if (codes[row] !== previous) starts.push(row)
        previous = codes[row]
      }
      for (let index = 0; index < starts.length; index++) {
        const start = starts[index]
        const end = index + 1 < starts.length ? starts[index + 1] : axis.length
        if (codes[start] >= 0) {
          rows.push([axis[start], end < axis.length ? axis[end] : NaN, entityIndex, codes[start]])
        }
      }
    })
    rows.sort((left, right) => left[0] - right[0])
    const matrix = createMatrix(rows.length, PortalProximityParameterCount)
    rows.forEach((values, row) => {
      values.forEach((value, column) => {
        matrix.data[row * matrix.columns + column] = value
      })
    })
    return matrix
  }
}
