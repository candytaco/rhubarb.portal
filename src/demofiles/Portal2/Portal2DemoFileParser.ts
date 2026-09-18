// Port of gallantlab/DemoFiles Portal2/Portal2DemoFileParser.py

import type { Vector3Tuple } from '../DemoParser/BitBuffer.ts'
import {
  DemofileParser,
  type DemofileParserOptions,
  type ProgressCallback,
} from '../DemoParser/DemofileParser.ts'
import type { Entity, EntityDecoder, PropertyValue } from '../DemoParser/Entities.ts'
import type { DemoFrame } from '../DemoParser/DemoFrame.ts'
import type { GameEvent } from '../DemoParser/GameEvents.ts'
import {
  NetStringCmd,
  NetTick,
  SvcGameEvent,
  SvcServerInfo,
  SvcSetPause,
  SvcSetView,
  SvcUserMessage,
  type SvcPacketEntities,
} from '../DemoParser/NetMessages.ts'
import { SayText, SayText2, type UserMessage } from '../DemoParser/UserMessages.ts'
import { arange, createMatrix, interpArray, matrixColumn, unique, type Matrix } from '../Numeric.ts'
import {
  EntityTimeSeries,
  historyKey,
  type EntityTimeSeriesSource,
  type HistoryGroups,
} from './EntityTimeSeries.ts'
import {
  EntityHistory,
  EntityPortalledMessageFieldList,
  EntityPortalledMessageFields,
  EntityProperties,
  GameCommandButtons,
  HazardServerClasses,
  LevelTransition,
  LevelTransitionCommands,
  MaxCoordinateInteger,
  NumEntityPortalledMessageSlots,
  OtherPlayerOnlyProperties,
  OwnPlayerOnlyProperties,
  PlayerProperties,
  PlayerServerClasses,
  Portal2CommandList,
  PortalProperties,
  PortalTraversal,
  PuzzleElementServerClasses,
  TTL,
  TTLCommand,
  TrackedClassProperties,
  entityPortalledMessageProperty,
  type Portal2Command,
} from './Structures.ts'

export interface ChatMessage {
  tick: number
  client: number
  sender: string
  text: string
}

/** One frame's CmdInfo values: the recording player's eye position and full view angles (viewer addition) */
export interface FrameViews {
  ticks: number[]
  origins: Matrix // [N x 3]
  angles: Matrix // [N x 3] pitch, yaw, roll in degrees
}

type ClassSetup = [string, string[], Map<string, number>]

/**
 * A class to parse Portal 2 demofiles
 */
export class Portal2DemoFileParser extends DemofileParser implements EntityTimeSeriesSource {
  gameCommands: Map<Portal2Command, number[]> = new Map() // ticks on which each command was pressed
  gameCommandReleases: Map<Portal2Command, number[]> = new Map() // ticks on which each command's button was released
  entityHistories: Map<string, EntityHistory> = new Map() // per-tick entity records by history key after parseEntityStates
  portalTraversals: PortalTraversal[] = [] // entity-portalled messages of the recording player's client after parseEntityStates
  readonly timeSeries: EntityTimeSeries

  constructor(
    fileName: string,
    data: ArrayBuffer | Uint8Array,
    options: DemofileParserOptions = {}
  ) {
    super(fileName, data, { ...options, splitScreen: true })
    this.timeSeries = new EntityTimeSeries(this)
  }

  /** Positions of the recording player at each tick, [numTicks x 3] */
  getPositions(): Matrix {
    return this.interpolateToTicks(this.getFramePositions())
  }

  /** Unit view vectors of the recording player at each tick, [numTicks x 3] */
  getViewVectors(): Matrix {
    return this.interpolateToTicks(this.getFrameViewVectors())
  }

  /**
   * Interpolates a set of frame values to each tick, since the game engine may not send data on
   * every tick. Uses linear interpolation since that's what most of it does.
   */
  interpolateToTicks([values, ticks]: [Matrix, number[]]): Matrix {
    const axis = arange(0, this.numTicks ?? 0)
    const result = createMatrix(axis.length, values.columns)
    for (let column = 0; column < values.columns; column++) {
      const interpolated = interpArray(axis, ticks, matrixColumn(values, column))
      for (let row = 0; row < axis.length; row++) {
        result.data[row * values.columns + column] = interpolated[row]
      }
    }
    return result
  }

  /** View vectors of the Packet frames whose view angles are not all zero: [(x, y, z) rows, ticks] */
  getFrameViewVectors(): [Matrix, number[]] {
    const views: number[][] = []
    const frames: number[] = []
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.Packet && frame.view?.viewAngles) {
        const angles = frame.view.viewAngles
        if (angles[0] === 0 && angles[1] === 0) continue
        // looking upwards corresponds to negative pitch in game, so we invert it
        const pitch = (-angles[0] * Math.PI) / 180
        const yaw = (angles[1] * Math.PI) / 180
        frames.push(frame.tick ?? 0)
        views.push([
          Math.cos(pitch) * Math.cos(yaw),
          Math.cos(pitch) * Math.sin(yaw),
          Math.sin(pitch),
        ])
      }
    }
    return [rowsToMatrix(views, 3), frames]
  }

  /** Positions of the Packet frames whose view origin is not zero: [(x, y, z) rows, ticks] */
  getFramePositions(): [Matrix, number[]] {
    const positions: number[][] = []
    const frames: number[] = []
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.Packet && frame.view?.viewOrigin) {
        const origin = frame.view.viewOrigin
        if (origin[0] === 0 && origin[1] === 0 && origin[2] === 0) continue
        frames.push(frame.tick ?? 0)
        positions.push([origin[0], origin[1], origin[2]])
      }
    }
    return [rowsToMatrix(positions, 3), frames]
  }

  /**
   * Viewer addition: eye origin and view angles (pitch, yaw, roll) of the Packet frames whose view
   * origin is not zero, one row per frame
   */
  getFrameViews(): FrameViews {
    const origins: number[][] = []
    const angles: number[][] = []
    const ticks: number[] = []
    for (const frame of this.frames) {
      if (
        frame.command === this.commandSet.Packet &&
        frame.view?.viewOrigin &&
        frame.view.viewAngles
      ) {
        const origin = frame.view.viewOrigin
        if (origin[0] === 0 && origin[1] === 0 && origin[2] === 0) continue
        ticks.push(frame.tick ?? 0)
        origins.push([origin[0], origin[1], origin[2]])
        angles.push([frame.view.viewAngles[0], frame.view.viewAngles[1], frame.view.viewAngles[2]])
      }
    }
    return { ticks, origins: rowsToMatrix(origins, 3), angles: rowsToMatrix(angles, 3) }
  }

  /** Tick at which the synchronization signal (level transition command) is sent, or -1 */
  getSyncTick(): number {
    for (let index = this.frames.length - 1; index >= 0; index--) {
      const frame = this.frames[index]
      if (frame.command === this.commandSet.ConsoleCommand && frame.contains(LevelTransition)) {
        return frame.tick ?? 0
      }
    }
    return -1
  }

  /**
   * Ticks of every level transition marker: the console command starting the transition video and
   * the server commands starting and ending it
   */
  getLevelTransitionTicks(): number[] {
    const ticks = new Set<number>()
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.ConsoleCommand) {
        if ((frame.consoleCommand ?? '').includes(LevelTransition)) {
          ticks.add(frame.tick ?? 0)
        }
      } else if (
        frame.command === this.commandSet.Signon ||
        frame.command === this.commandSet.Packet
      ) {
        for (const message of frame.packets) {
          if (
            message instanceof NetStringCmd &&
            LevelTransitionCommands.some(marker => message.command.includes(marker))
          ) {
            ticks.add(frame.tick ?? 0)
          }
        }
      }
    }
    return Array.from(ticks).sort((left, right) => left - right)
  }

  /** Decoded user messages from Packet and Signon frames, optionally of one type name */
  getUserMessages(name: string | null = null): [number, UserMessage][] {
    const messages: [number, UserMessage][] = []
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.Signon || frame.command === this.commandSet.Packet) {
        for (const message of frame.packets) {
          if (message instanceof SvcUserMessage && message.userMessage !== null) {
            if (name === null || message.userMessage.name === name) {
              messages.push([frame.tick ?? 0, message.userMessage])
            }
          }
        }
      }
    }
    return messages
  }

  /** Chat messages from SayText and SayText2 user messages */
  getChatMessages(): ChatMessage[] {
    const chat: ChatMessage[] = []
    for (const [tick, message] of this.getUserMessages()) {
      if (message instanceof SayText2) {
        chat.push({ tick, client: message.client, sender: message.sender, text: message.text })
      } else if (message instanceof SayText) {
        chat.push({ tick, client: message.client, sender: '', text: message.text })
      }
    }
    return chat
  }

  /** Ticks of the TTL chat messages, present in both the sender's and the receiver's demo */
  getTTLTicks(): number[] {
    return this.getChatMessages()
      .filter(message => message.text === TTL)
      .map(message => message.tick)
  }

  /** Ticks of the say TTL console commands, present in the sender's demo only */
  getTTLCommandTicks(): number[] {
    return this.frames
      .filter(
        frame =>
          frame.command === this.commandSet.ConsoleCommand && frame.consoleCommand === TTLCommand
      )
      .map(frame => frame.tick ?? 0)
  }

  /** Decoded game events, optionally of one name */
  getGameEvents(name: string | null = null): [number, GameEvent][] {
    const events: [number, GameEvent][] = []
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.Signon || frame.command === this.commandSet.Packet) {
        for (const message of frame.packets) {
          if (message instanceof SvcGameEvent && message.event !== null) {
            if (name === null || message.event.name === name) {
              events.push([frame.tick ?? 0, message.event])
            }
          }
        }
      }
    }
    return events
  }

  /** Server tick carried by the NetTick message of each Packet frame, as (demo tick, server tick) rows */
  getServerTicks(): [number, number][] {
    const rows: [number, number][] = []
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.Packet) {
        for (const message of frame.packets) {
          if (message instanceof NetTick) {
            rows.push([frame.tick ?? 0, message.tick])
            break
          }
        }
      }
    }
    return rows
  }

  /**
   * Interpolates one tick clock against another, extending the ends with the offset of the first
   * and last sample
   * @param values   ticks to map
   * @param axis     source clock of the samples
   * @param samples  target clock of the samples
   */
  static interpolateTicks(
    values: ArrayLike<number>,
    axis: ArrayLike<number>,
    samples: ArrayLike<number>
  ): Float64Array {
    const { values: uniqueAxis, firstIndices } = unique(axis)
    const uniqueSamples = new Float64Array(firstIndices.length)
    for (let index = 0; index < firstIndices.length; index++)
      uniqueSamples[index] = samples[firstIndices[index]]
    const mapped = interpArray(values, uniqueAxis, uniqueSamples)
    if (uniqueAxis.length === 0) return mapped
    const first = uniqueAxis[0]
    const last = uniqueAxis[uniqueAxis.length - 1]
    for (let index = 0; index < values.length; index++) {
      const value = values[index]
      if (value < first) {
        mapped[index] = value + (uniqueSamples[0] - first)
      } else if (value > last) {
        mapped[index] = value + (uniqueSamples[uniqueSamples.length - 1] - last)
      }
    }
    return mapped
  }

  /** Maps demo ticks to server ticks by interpolating between Packet frames */
  demoTicksToServerTicks(ticks: ArrayLike<number>): Float64Array {
    const table = this.getServerTicks()
    return Portal2DemoFileParser.interpolateTicks(
      ticks,
      table.map(row => row[0]),
      table.map(row => row[1])
    )
  }

  /** Maps server ticks to demo ticks by interpolating between Packet frames; ticks outside the demo come out before 0 or after the end */
  serverTicksToDemoTicks(serverTicks: ArrayLike<number>): Float64Array {
    const table = this.getServerTicks()
    return Portal2DemoFileParser.interpolateTicks(
      serverTicks,
      table.map(row => row[1]),
      table.map(row => row[0])
    )
  }

  /** Intervals during which the game was paused, from SvcSetPause messages; the last unpause tick is null when the demo ends paused */
  getPauseIntervals(): [number, number | null][] {
    const intervals: [number, number | null][] = []
    let pauseTick: number | null = null
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.Signon || frame.command === this.commandSet.Packet) {
        for (const message of frame.packets) {
          if (message instanceof SvcSetPause) {
            if (message.paused && pauseTick === null) {
              pauseTick = frame.tick ?? 0
            } else if (!message.paused && pauseTick !== null) {
              intervals.push([pauseTick, frame.tick ?? 0])
              pauseTick = null
            }
          }
        }
      }
    }
    if (pauseTick !== null) {
      intervals.push([pauseTick, null])
    }
    return intervals
  }

  /** Per-tick pause state, 1 while paused */
  getPauseStates(): Float64Array {
    const numTicks = this.numTicks ?? 0
    const paused = new Float64Array(numTicks)
    for (const [pauseTick, unpauseTick] of this.getPauseIntervals()) {
      const end = unpauseTick === null ? numTicks : unpauseTick
      for (let tick = Math.max(pauseTick, 0); tick < end; tick++) paused[tick] = 1
    }
    return paused
  }

  /** Button state per UserCmd frame: ticks and Buttons flag values, 0 when no buttons were sent */
  getButtonStateFrames(): [Int32Array, Int32Array] {
    const ticks: number[] = []
    const buttons: number[] = []
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.UserCommand) {
        ticks.push(frame.tick ?? 0)
        buttons.push(frame.lastUserCommand?.buttons ?? 0)
      }
    }
    return [Int32Array.from(ticks), Int32Array.from(buttons)]
  }

  /** Per-tick Buttons flag value from the UserCmd frames, held between frames, NaN before the first UserCmd frame */
  getButtonStates(): Float64Array {
    const [ticks, buttons] = this.getButtonStateFrames()
    const samples = createMatrix(buttons.length, 1)
    for (let index = 0; index < buttons.length; index++) samples.data[index] = buttons[index]
    return matrixColumn(
      EntityTimeSeries.resample(this.tickAxis(), ticks, samples, [false], new Int32Array(0)),
      0
    )
  }

  /** Per-tick pressed state of each command, [numTicks x Portal2Commands], 1 while pressed */
  getGameCommandStates(): Matrix {
    if (this.gameCommands.size === 0) {
      this.parseGameCommands()
    }
    const numTicks = this.numTicks ?? 0
    const states = createMatrix(numTicks, Portal2CommandList.length, 0)
    for (const command of Portal2CommandList) {
      const releases = this.gameCommandReleases.get(command) ?? []
      for (const pressTick of this.gameCommands.get(command) ?? []) {
        const following = releases.find(tick => tick > pressTick)
        const endTick = following !== undefined ? following : numTicks
        for (let tick = pressTick; tick < endTick && tick < numTicks; tick++) {
          states.data[tick * states.columns + command] = 1
        }
      }
    }
    return states
  }

  /**
   * Parses game command ticks from the button bits of the UserCmd frames.
   * Press ticks go to gameCommands and release ticks to gameCommandReleases.
   */
  parseGameCommands(): void {
    const [ticks, buttons] = this.getButtonStateFrames()
    this.gameCommands = new Map()
    this.gameCommandReleases = new Map()
    for (const command of Portal2CommandList) {
      const button = GameCommandButtons[command]
      const presses: number[] = []
      const releases: number[] = []
      let previous = 0
      for (let index = 0; index < ticks.length; index++) {
        const pressed = (buttons[index] & button) !== 0 ? 1 : 0
        if (pressed - previous === 1) presses.push(ticks[index])
        if (pressed - previous === -1) releases.push(ticks[index])
        previous = pressed
      }
      this.gameCommands.set(
        command,
        presses.sort((left, right) => left - right)
      )
      this.gameCommandReleases.set(
        command,
        releases.sort((left, right) => left - right)
      )
    }
  }

  /** Entity index of the player recording the demo, from the server info player slot or the first SvcSetView */
  getLocalPlayerEntityIndex(): number | null {
    for (const frame of this.frames) {
      if (frame.command === this.commandSet.Signon || frame.command === this.commandSet.Packet) {
        for (const message of frame.packets) {
          if (message instanceof SvcServerInfo) {
            return message.playerSlot + 1
          }
          if (message instanceof SvcSetView) {
            return message.entityIndex
          }
        }
      }
    }
    return null
  }

  /**
   * World origin of an entity from the player origin properties, or from its cell coordinates
   * @param entity           the entity
   * @param propertyIndices  flattened property index by name for the entity's class
   * @param localPlayer      use the local player origin properties rather than the non-local ones
   */
  entityOrigin(
    entity: Entity,
    propertyIndices: Map<string, number>,
    localPlayer: boolean
  ): Vector3Tuple | null {
    const originName = localPlayer ? PlayerProperties.LocalOrigin : PlayerProperties.NonLocalOrigin
    const heightName = localPlayer
      ? PlayerProperties.LocalOriginHeight
      : PlayerProperties.NonLocalOriginHeight
    const originIndex = propertyIndices.get(originName)
    if (originIndex !== undefined) {
      const planar = entity.props[originIndex]
      const height = entity.props[propertyIndices.get(heightName)!]
      if (Array.isArray(planar) && typeof height === 'number') {
        return [planar[0], planar[1], height]
      }
      // Deviation from the Python: when the player origin properties are unset (single-player
      // demos do not carry portallocaldata for the recording player) fall through to the cell
      // coordinate origin instead of returning null
    }
    const cellBitsIndex = propertyIndices.get(EntityProperties.CellBits)
    if (cellBitsIndex !== undefined) {
      const cellBits = entity.props[cellBitsIndex]
      const origin = entity.props[propertyIndices.get(EntityProperties.Origin)!]
      if (typeof cellBits !== 'number' || !Array.isArray(origin)) {
        return null
      }
      const cellWidth = 2 ** cellBits
      const cells = [EntityProperties.CellX, EntityProperties.CellY, EntityProperties.CellZ].map(
        name => entity.props[propertyIndices.get(name)!]
      )
      if (cells.some(cell => typeof cell !== 'number')) {
        return null
      }
      return [
        (cells[0] as number) * cellWidth - MaxCoordinateInteger + origin[0],
        (cells[1] as number) * cellWidth - MaxCoordinateInteger + origin[1],
        (cells[2] as number) * cellWidth - MaxCoordinateInteger + origin[2],
      ]
    }
    const plainOriginIndex = propertyIndices.get(EntityProperties.Origin)
    if (plainOriginIndex !== undefined) {
      const origin = entity.props[plainOriginIndex]
      return Array.isArray(origin) && origin.length >= 3 ? [origin[0], origin[1], origin[2]] : null
    }
    return null
  }

  /**
   * Decodes the entity stream and records the tracked properties of every entity of the tracked
   * classes at each Packet tick. Entities outside the PVS are not recorded, and an entity that
   * reuses a slot starts a new history under its own serial. Player properties the server does not
   * send to this demo's recorder for that player are recorded as unset rather than at their
   * baseline value. The entity-portalled messages of the recording player are read into
   * portalTraversals as their count grows.
   * @param trackedClasses  property names to record by class name; defaults to TrackedClassProperties
   * @param onProgress      called with the fraction of frames replayed
   */
  parseEntityStates(
    trackedClasses: Record<string, string[]> = TrackedClassProperties,
    onProgress?: ProgressCallback
  ): Map<string, EntityHistory> {
    const manager = this.dataTablesManager
    if (manager === null) {
      throw new Error('Entity parsing needs the DataTables frame')
    }
    const classSetups = new Map<number, ClassSetup>()
    const helperNames: string[] = [
      EntityProperties.CellBits,
      EntityProperties.CellX,
      EntityProperties.CellY,
      EntityProperties.CellZ,
      EntityProperties.Origin,
      PlayerProperties.LocalOrigin,
      PlayerProperties.LocalOriginHeight,
      PlayerProperties.NonLocalOrigin,
      PlayerProperties.NonLocalOriginHeight,
      PlayerProperties.EntityPortalledMessageCount,
    ]
    for (let slot = 0; slot < NumEntityPortalledMessageSlots; slot++) {
      for (const field of EntityPortalledMessageFieldList) {
        helperNames.push(entityPortalledMessageProperty(slot, field))
      }
    }
    for (const [className, propertyNames] of Object.entries(trackedClasses)) {
      const serverClass = manager.classesByName.get(className)
      if (!serverClass) continue
      const classId = serverClass.classId
      const names = new Map<string, number>()
      manager.flattenedProps[classId].forEach((flattenedProp, index) => {
        if (!names.has(flattenedProp.name)) names.set(flattenedProp.name, index)
      })
      const tracked = propertyNames.filter(name => names.has(name))
      const indices = new Map<string, number>()
      for (const name of tracked) indices.set(name, names.get(name)!)
      for (const name of helperNames) {
        if (names.has(name)) indices.set(name, names.get(name)!)
      }
      classSetups.set(classId, [className, tracked, indices])
    }
    const localPlayerIndex = this.getLocalPlayerEntityIndex()
    const histories = new Map<string, EntityHistory>()
    const traversals: PortalTraversal[] = []
    const messageCounts = new Map<string, number>()
    const packetCommand = this.commandSet.Packet

    const record = (frame: DemoFrame, _message: SvcPacketEntities, decoder: EntityDecoder) => {
      if (frame.command !== packetCommand) return
      const entities = decoder.entities
      for (let entityIndex = 0; entityIndex < entities.length; entityIndex++) {
        const entity = entities[entityIndex]
        if (entity === null || !entity.inPvs) continue
        const setup = classSetups.get(entity.classId)
        if (!setup) continue
        const [className, tracked, indices] = setup
        const key = historyKey(entityIndex, entity.serial)
        let history = histories.get(key)
        if (!history) {
          history = new EntityHistory(entityIndex, entity.serial, className, tracked)
          histories.set(key, history)
        }
        history.ticks.push(frame.tick ?? 0)
        history.serverTicks.push(decoder.serverTick)
        const ownPlayer = entityIndex === localPlayerIndex
        history.origins.push(this.entityOrigin(entity, indices, ownPlayer))
        const unsentProperties = ownPlayer ? OtherPlayerOnlyProperties : OwnPlayerOnlyProperties
        for (const name of tracked) {
          history.values[name].push(
            unsentProperties.has(name) ? null : entity.props[indices.get(name)!]
          )
        }
        const countIndex = indices.get(PlayerProperties.EntityPortalledMessageCount)
        if (ownPlayer && countIndex !== undefined) {
          const count = entity.props[countIndex]
          if (typeof count === 'number') {
            const previous = messageCounts.get(key)
            if (previous !== undefined) {
              for (let number = previous; number < count; number++) {
                traversals.push(
                  this.readPortalTraversal(frame, decoder, entity, indices, number, classSetups)
                )
              }
            }
            messageCounts.set(key, count)
          }
        }
      }
    }

    this.parseEntities(record, onProgress)
    this.entityHistories = histories
    this.portalTraversals = traversals
    return histories
  }

  /**
   * Reads one entity-portalled message out of the recording player's ring buffer
   * @param number  message number, which selects the ring buffer slot
   */
  readPortalTraversal(
    frame: DemoFrame,
    decoder: EntityDecoder,
    player: Entity,
    propertyIndices: Map<string, number>,
    number: number,
    classSetups: Map<number, ClassSetup>
  ): PortalTraversal {
    const slot = number % NumEntityPortalledMessageSlots
    const fields = new Map<string, PropertyValue>()
    for (const field of EntityPortalledMessageFieldList) {
      const index = propertyIndices.get(entityPortalledMessageProperty(slot, field))
      fields.set(field, index === undefined ? null : player.props[index])
    }
    const enteredPortal = EntityTimeSeries.handleToEntityIndex(
      fields.get(EntityPortalledMessageFields.Portal)
    )
    let exitPortal: number | null = null
    const portal = enteredPortal === null ? null : decoder.entities[enteredPortal]
    if (portal !== null) {
      const portalSetup = classSetups.get(portal.classId)
      if (portalSetup) {
        const linkedIndex = portalSetup[2].get(PortalProperties.LinkedPortal)
        if (linkedIndex !== undefined) {
          exitPortal = EntityTimeSeries.handleToEntityIndex(portal.props[linkedIndex])
        }
      }
    }
    const time = fields.get(EntityPortalledMessageFields.Time)
    return new PortalTraversal(
      frame.tick ?? 0,
      decoder.serverTick,
      typeof time === 'number' ? time : null,
      EntityTimeSeries.handleToEntityIndex(fields.get(EntityPortalledMessageFields.Entity)),
      enteredPortal,
      exitPortal,
      Boolean(fields.get(EntityPortalledMessageFields.ForcedDuck)),
      number
    )
  }

  /** Recorded histories of the entities of one class */
  getEntityHistories(className: string): Map<string, EntityHistory> {
    if (this.entityHistories.size === 0) {
      this.parseEntityStates()
    }
    const result = new Map<string, EntityHistory>()
    for (const [key, history] of this.entityHistories) {
      if (history.className === className) result.set(key, history)
    }
    return result
  }

  /** Origins of a history as a [N x 3] matrix with NaN rows where the origin was not set */
  static originArray(history: EntityHistory): Matrix {
    const matrix = createMatrix(history.origins.length, 3)
    history.origins.forEach((origin, row) => {
      if (origin !== null) {
        matrix.data[row * 3] = origin[0]
        matrix.data[row * 3 + 1] = origin[1]
        matrix.data[row * 3 + 2] = origin[2]
      }
    })
    return matrix
  }

  /** Recorded histories of the entities of the given classes, one per entity */
  historiesOf(classNames: string[]): HistoryGroups {
    const groups: HistoryGroups = new Map()
    for (const className of classNames) {
      for (const [key, history] of this.getEntityHistories(className)) {
        groups.set(key, [history])
      }
    }
    return groups
  }

  playerHistories(): HistoryGroups {
    return this.historiesOf([PlayerServerClasses.Player])
  }

  portalHistories(): HistoryGroups {
    return this.historiesOf([PlayerServerClasses.Portal])
  }

  cubeHistories(): HistoryGroups {
    return this.historiesOf([PuzzleElementServerClasses.WeightedCube])
  }

  floorButtonHistories(): HistoryGroups {
    return this.historiesOf([PuzzleElementServerClasses.FloorButton])
  }

  doorHistories(): HistoryGroups {
    return this.historiesOf([
      PuzzleElementServerClasses.SlidingDoor,
      PuzzleElementServerClasses.RotatingDoor,
    ])
  }

  laserHistories(): HistoryGroups {
    return this.historiesOf([HazardServerClasses.Laser])
  }

  /** Demo ticks of the rows of every time series, 0 to numTicks - 1 */
  tickAxis(): Int32Array {
    return arange(0, this.numTicks ?? 0)
  }

  /** Demo ticks of the Packet frames, sorted */
  packetTicks(): Int32Array {
    const ticks = this.frames
      .filter(frame => frame.command === this.commandSet.Packet)
      .map(frame => frame.tick ?? 0)
    return Int32Array.from(ticks).sort()
  }

  historyTicks(history: EntityHistory): Int32Array {
    return Int32Array.from(history.ticks)
  }

  /** Portal traversals read from the recording player's entity-portalled messages, in demo tick order */
  getPortalTraversalRecords(): PortalTraversal[] {
    if (this.entityHistories.size === 0) {
      this.parseEntityStates()
    }
    return this.portalTraversals
  }

  portalTraversalRows(): [number, PortalTraversal][] {
    return this.getPortalTraversalRecords().map(traversal => [traversal.tick, traversal])
  }

  // ─── time series delegates, so the parser keeps the Python accessor surface ───

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

function rowsToMatrix(rows: number[][], columns: number): Matrix {
  const matrix = createMatrix(rows.length, columns)
  rows.forEach((values, row) => {
    for (let column = 0; column < columns; column++)
      matrix.data[row * columns + column] = values[column]
  })
  return matrix
}
