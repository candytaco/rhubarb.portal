// Builds a Portal2Session from one or two parsed demos. Runs inside the parse worker.

import { Portal2DemoFileParser } from '../../../demofiles/Portal2/Portal2DemoFileParser'
import { Portal2CoopDemoFilesParser } from '../../../demofiles/Portal2/Portal2CoopDemoFilesParser'
import { parseHistoryKey } from '../../../demofiles/Portal2/EntityTimeSeries'
import {
  PlayerDescriptor,
  PlayerDescriptors,
  PortalDescriptors,
  TTL,
  TrackedClassProperties,
  type PortalTraversal,
} from '../../../demofiles/Portal2/Structures'
import { MPMapCompleted, Rumble } from '../../../demofiles/DemoParser/UserMessages'
import { interpArray, type Matrix } from '../../../demofiles/Numeric'
import {
  CONSOLE_COMMAND_NOISE,
  RUMBLE_PORTAL_PLACEMENT_FAILURE,
  TEAM_BLUE,
  TEAM_ORANGE,
  type PlayerRole,
} from '@constants/portal2'
import {
  Portal2Session,
  SessionChatMessage,
  SessionDemoInfo,
  SessionEntitySeries,
  SessionEvent,
  SessionPlayer,
  SessionPortal,
  VIEW_COLUMNS,
} from './Session'

export type SessionProgress = (fraction: number, stage: string) => void

const EVENT_DEDUPE_TICKS = 6
const BOUNDS_PADDING = 256

interface DemoInput {
  fileName: string
  buffer: ArrayBuffer
}

/**
 * Parses the demos and assembles the session. Two demos are merged on the server tick clock by
 * Portal2CoopDemoFilesParser; one demo keeps its own tick axis.
 */
export function buildSession(
  inputs: DemoInput[],
  onProgress: SessionProgress = () => {}
): Portal2Session {
  if (inputs.length === 0 || inputs.length > 2) {
    throw new Error('A session needs one or two demo files')
  }

  const parseStart = performance.now()
  const parsers = inputs.map((input, index) => {
    const parser = new Portal2DemoFileParser(input.fileName, input.buffer, {
      onProgress: fraction =>
        onProgress(((index + fraction) / inputs.length) * 0.3, 'Reading frames'),
    })
    if (!parser.isPortal2 || parser.demoProtocol !== 4) {
      throw new Error(
        `${input.fileName} is not a Portal 2 demo (game ${parser.gameDirectory}, protocol ${parser.demoProtocol})`
      )
    }
    return parser
  })
  const parseMs = performance.now() - parseStart

  const entityStart = performance.now()
  parsers.forEach((parser, index) => {
    parser.parseEntityStates(TrackedClassProperties, fraction =>
      onProgress(0.3 + ((index + fraction) / parsers.length) * 0.5, 'Decoding entities')
    )
  })
  const entityMs = performance.now() - entityStart

  const seriesStart = performance.now()
  onProgress(0.8, 'Building series')

  const coop = parsers.length === 2 ? new Portal2CoopDemoFilesParser(parsers[0], parsers[1]) : null
  const timeSeries: Portal2DemoFileParser | Portal2CoopDemoFilesParser = coop ?? parsers[0]
  const tickAxis = timeSeries.tickAxis()
  if (tickAxis.length === 0) {
    throw new Error(
      coop ? 'The two demos do not overlap on the server clock' : 'The demo has no ticks'
    )
  }
  const axisStart = tickAxis[0]

  // maps a demo tick of demo k onto a row of the axis, or -1 when outside
  const rowForDemoTick = (demoIndex: number, demoTick: number): number => {
    let row: number
    if (coop) {
      row = Math.round(parsers[demoIndex].demoTicksToServerTicks([demoTick])[0]) - axisStart
    } else {
      row = demoTick
    }
    return row >= 0 && row < tickAxis.length ? row : -1
  }

  // players
  const playerIndices = timeSeries.getPlayerEntityIndices()
  const playerStates = timeSeries.getPlayerEntityStates()
  const players: SessionPlayer[] = playerIndices.map((entityIndex, slot) => {
    const state = playerStates[slot]
    const info = lookupPlayerInfo(parsers, entityIndex)
    const demoIndex = parsers.findIndex(
      parser => parser.getLocalPlayerEntityIndex() === entityIndex
    )
    const view =
      demoIndex >= 0 ? buildViewSeries(parsers[demoIndex], tickAxis, coop !== null) : null
    return {
      slot,
      entityIndex,
      name: info?.name ?? `Player ${slot + 1}`,
      userId: info?.userId ?? null,
      steamId: info?.steamId ?? null,
      role: roleFromState(state),
      demoIndex: demoIndex >= 0 ? demoIndex : null,
      state: toFloat32(state),
      view,
    }
  })
  const playerSlotByEntity = new Map(players.map(player => [player.entityIndex, player.slot]))
  const playerSlotByUserId = new Map(
    players
      .filter(player => player.userId !== null)
      .map(player => [player.userId as number, player.slot])
  )

  // portals in PortalSlot order
  const portals: (SessionPortal | null)[] = timeSeries.getPortalStates().map((state, slot) =>
    state
      ? {
          slot,
          playerSlot: Math.floor(slot / 2),
          portalNumber: (slot % 2 === 0 ? 1 : 2) as 1 | 2,
          state: toFloat32(state),
        }
      : null
  )

  const cubes = toEntitySeries(timeSeries.getCubePositions())
  const floorButtons = toEntitySeries(timeSeries.getFloorButtonStates())
  const doors = toEntitySeries(timeSeries.getDoorStates())
  const lasers = toEntitySeries(timeSeries.getLaserStates())

  // events
  const events: SessionEvent[] = []
  const chat: SessionChatMessage[] = []
  const ttlRows = new Set<number>()
  const levelTransitionRows = new Set<number>()
  const pauseIntervals: [number, number][] = []

  const pushEvent = (event: SessionEvent) => {
    if (event.row < 0) return
    if (coop) {
      // an event the server sent to both players appears in both demos; keep the earlier copy
      const duplicate = events.find(
        other =>
          other.type === event.type &&
          other.name === event.name &&
          other.playerSlot === event.playerSlot &&
          other.text === event.text &&
          other.demoIndex !== event.demoIndex &&
          Math.abs(other.row - event.row) <= EVENT_DEDUPE_TICKS
      )
      if (duplicate) {
        if (event.row < duplicate.row) duplicate.row = event.row
        return
      }
    }
    events.push(event)
  }

  parsers.forEach((parser, demoIndex) => {
    const localSlot = playerSlotByEntity.get(parser.getLocalPlayerEntityIndex() ?? -1) ?? null

    for (const [tick, event] of parser.getGameEvents()) {
      const userId = typeof event.values.userid === 'number' ? event.values.userid : null
      const playerSlot = userId !== null ? (playerSlotByUserId.get(userId) ?? null) : null
      const playerName = playerSlot !== null ? players[playerSlot].name : null
      pushEvent({
        row: rowForDemoTick(demoIndex, tick),
        tick: 0,
        demoIndex,
        type: 'game',
        name: event.name,
        playerSlot,
        text: describeGameEvent(event.name, event.values, playerName),
        data: { ...event.values },
      })
    }

    for (const message of parser.getChatMessages()) {
      const row = rowForDemoTick(demoIndex, message.tick)
      if (row < 0) continue
      const playerSlot = matchChatSender(players, message.sender)
      if (message.text === TTL) {
        ttlRows.add(row)
        pushEvent({
          row,
          tick: 0,
          demoIndex,
          type: 'ttl',
          name: 'ttl',
          playerSlot,
          text: 'scanner pulse',
        })
        continue
      }
      pushEvent({
        row,
        tick: 0,
        demoIndex,
        type: 'chat',
        name: 'chat',
        playerSlot,
        text: message.text,
        data: { sender: message.sender },
      })
    }

    for (const frame of parser.frames) {
      if (frame.command !== parser.commandSet.ConsoleCommand) continue
      const command = frame.consoleCommand ?? ''
      if (command.length === 0 || CONSOLE_COMMAND_NOISE.some(pattern => pattern.test(command)))
        continue
      const row = rowForDemoTick(demoIndex, frame.tick ?? 0)
      if (row < 0) continue
      events.push({
        row,
        tick: 0,
        demoIndex,
        type: 'console',
        name: 'console',
        playerSlot: localSlot,
        text: command,
      })
    }

    for (const [pauseTick, unpauseTick] of parser.getPauseIntervals()) {
      const startRow = rowForDemoTick(demoIndex, pauseTick)
      const endRow =
        unpauseTick === null ? tickAxis.length - 1 : rowForDemoTick(demoIndex, unpauseTick)
      pushEvent({
        row: startRow,
        tick: 0,
        demoIndex,
        type: 'pause',
        name: 'pause',
        playerSlot: null,
        text: 'game paused',
      })
      if (unpauseTick !== null) {
        pushEvent({
          row: endRow,
          tick: 0,
          demoIndex,
          type: 'unpause',
          name: 'unpause',
          playerSlot: null,
          text: 'game unpaused',
        })
      }
      if (startRow >= 0 && endRow >= startRow) {
        const overlapping = pauseIntervals.find(
          interval => Math.abs(interval[0] - startRow) <= EVENT_DEDUPE_TICKS
        )
        if (!overlapping) pauseIntervals.push([startRow, endRow])
      }
    }

    for (const tick of parser.getLevelTransitionTicks()) {
      const row = rowForDemoTick(demoIndex, tick)
      if (row < 0) continue
      levelTransitionRows.add(row)
      pushEvent({
        row,
        tick: 0,
        demoIndex,
        type: 'level_transition',
        name: 'level_transition',
        playerSlot: null,
        text: 'level transition',
      })
    }

    for (const [tick, message] of parser.getUserMessages()) {
      if (message instanceof Rumble && message.index === RUMBLE_PORTAL_PLACEMENT_FAILURE) {
        pushEvent({
          row: rowForDemoTick(demoIndex, tick),
          tick: 0,
          demoIndex,
          type: 'portal_placement_failure',
          name: 'portal_placement_failure',
          playerSlot: localSlot,
          text: 'portal placement failed',
        })
      } else if (message instanceof MPMapCompleted) {
        pushEvent({
          row: rowForDemoTick(demoIndex, tick),
          tick: 0,
          demoIndex,
          type: 'map_completed',
          name: 'map_completed',
          playerSlot: null,
          text: 'map completed',
          data: { branch: message.branch, level: message.level },
        })
      }
    }
  })

  // portal traversals on the session clock (deduplicated by the co-op parser when two demos)
  const traversalRows: [number, PortalTraversal][] = coop
    ? coop
        .portalTraversalRows()
        .map(([serverTick, traversal]) => [serverTick - axisStart, traversal])
    : parsers[0].portalTraversalRows()
  for (const [row, traversal] of traversalRows) {
    if (row < 0 || row >= tickAxis.length) continue
    const playerSlot =
      traversal.entityIndex !== null
        ? (playerSlotByEntity.get(traversal.entityIndex) ?? null)
        : null
    events.push({
      row,
      tick: 0,
      demoIndex: 0,
      type: 'portal_traversal',
      name: 'portal_traversal',
      playerSlot,
      text:
        playerSlot !== null
          ? 'went through a portal'
          : `entity ${traversal.entityIndex} went through a portal`,
      data: {
        entityIndex: traversal.entityIndex ?? -1,
        enteredPortal: traversal.enteredPortal ?? -1,
        exitPortal: traversal.exitPortal ?? -1,
      },
    })
  }

  events.sort((left, right) => left.row - right.row)
  for (const event of events) event.tick = tickAxis[event.row]
  for (const event of events) {
    if (event.type === 'chat') {
      chat.push({
        row: event.row,
        tick: event.tick,
        demoIndex: event.demoIndex,
        playerSlot: event.playerSlot,
        sender: String(event.data?.sender ?? ''),
        text: event.text,
      })
    }
  }

  const demos: SessionDemoInfo[] = parsers.map((parser, index) => ({
    fileName: inputs[index].fileName,
    mapName: parser.mapName ?? '',
    clientName: parser.clientName ?? '',
    serverName: parser.serverName ?? '',
    numTicks: parser.numTicks ?? 0,
    numFrames: parser.numFrames ?? 0,
    playbackTime: parser.playbackTime ?? 0,
    localPlayerEntityIndex: parser.getLocalPlayerEntityIndex(),
    syncTick: parser.getSyncTick(),
    levelTransitionTicks: parser.getLevelTransitionTicks(),
  }))

  const session: Portal2Session = {
    kind: coop ? 'coop' : 'single',
    map: parsers[0].mapName ?? 'unknown',
    skyName: parsers[0].getSkyName() ?? '',
    intervalPerTick: 1 / 60,
    tickAxis,
    players,
    portals,
    cubes,
    floorButtons,
    doors,
    lasers,
    events,
    chat,
    ttlRows: Int32Array.from(Array.from(ttlRows).sort((left, right) => left - right)),
    pauseIntervals: pauseIntervals.sort((left, right) => left[0] - right[0]),
    levelTransitionRows: Int32Array.from(
      Array.from(levelTransitionRows).sort((left, right) => left - right)
    ),
    bounds: computeBounds(players, portals, cubes, floorButtons, doors),
    demos,
    perf: { parseMs, entityMs, seriesMs: 0, totalBytes: 0 },
  }
  session.perf.seriesMs = performance.now() - seriesStart
  session.perf.totalBytes = sessionBytes(session)
  onProgress(1, 'Done')
  return session
}

function toFloat32(matrix: Matrix): Float32Array {
  return Float32Array.from(matrix.data)
}

function toEntitySeries(series: Map<string, Matrix>): SessionEntitySeries[] {
  return Array.from(series.entries())
    .map(([key, matrix]) => {
      const [entityIndex, serial] = parseHistoryKey(key)
      return { key, entityIndex, serial, columns: matrix.columns, state: toFloat32(matrix) }
    })
    .sort((left, right) => left.entityIndex - right.entityIndex || left.serial - right.serial)
}

function lookupPlayerInfo(
  parsers: Portal2DemoFileParser[],
  entityIndex: number
): { name: string; userId: number | null; steamId: string | null } | null {
  for (const parser of parsers) {
    const table = parser.stringTableManager.tablesByName.get('userinfo')
    const entry = table?.entries[entityIndex - 1]
    if (entry?.playerInfo?.name) {
      return {
        name: entry.playerInfo.name,
        userId: entry.playerInfo.userId,
        steamId: entry.playerInfo.steamId,
      }
    }
  }
  return null
}

function roleFromState(state: Matrix): PlayerRole {
  const counts = new Map<number, number>()
  for (let row = 0; row < state.rows; row++) {
    const team = state.data[row * state.columns + PlayerDescriptor.team]
    if (Number.isNaN(team)) continue
    counts.set(team, (counts.get(team) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [team, count] of counts) {
    if (count > bestCount) {
      best = team
      bestCount = count
    }
  }
  if (best === TEAM_BLUE) return 'blue'
  if (best === TEAM_ORANGE) return 'orange'
  return 'unknown'
}

/**
 * The recording player's eye position and view angles per axis row, from the CmdInfo blocks.
 * Angles are unwrapped before interpolation so that yaw crossing 180 degrees does not spin.
 */
function buildViewSeries(
  parser: Portal2DemoFileParser,
  tickAxis: Int32Array,
  coop: boolean
): Float32Array | null {
  const views = parser.getFrameViews()
  if (views.ticks.length === 0) return null
  // for one demo the axis is the demo ticks themselves; for two it is server ticks
  const sampleTicks = coop ? Array.from(parser.demoTicksToServerTicks(views.ticks)) : views.ticks
  const result = new Float32Array(tickAxis.length * VIEW_COLUMNS)
  const columns: number[][] = [0, 1, 2].map(column =>
    Array.from(matrixColumnOf(views.origins, column))
  )
  const angleColumns: number[][] = [0, 1, 2].map(column =>
    unwrapDegrees(Array.from(matrixColumnOf(views.angles, column)))
  )
  const interpolated = [
    ...columns.map(values => interpArray(tickAxis, sampleTicks, values)),
    ...angleColumns.map(values => interpArray(tickAxis, sampleTicks, values)),
  ]
  for (let row = 0; row < tickAxis.length; row++) {
    for (let column = 0; column < VIEW_COLUMNS; column++) {
      let value = interpolated[column][row]
      if (column >= 3) value = wrapDegrees(value)
      result[row * VIEW_COLUMNS + column] = value
    }
  }
  return result
}

function matrixColumnOf(matrix: Matrix, column: number): Float64Array {
  const result = new Float64Array(matrix.rows)
  for (let row = 0; row < matrix.rows; row++)
    result[row] = matrix.data[row * matrix.columns + column]
  return result
}

function unwrapDegrees(values: number[]): number[] {
  const result: number[] = []
  let offset = 0
  for (let index = 0; index < values.length; index++) {
    let value = values[index] + offset
    if (index > 0) {
      while (value - result[index - 1] > 180) {
        offset -= 360
        value -= 360
      }
      while (result[index - 1] - value > 180) {
        offset += 360
        value += 360
      }
    }
    result.push(value)
  }
  return result
}

function wrapDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180
}

function matchChatSender(players: SessionPlayer[], sender: string): number | null {
  if (!sender) return null
  // SayText2 clips the first character of the sender name in the recorded sessions
  const player = players.find(
    candidate =>
      candidate.name === sender ||
      candidate.name.endsWith(sender) ||
      sender.endsWith(candidate.name)
  )
  return player ? player.slot : null
}

function describeGameEvent(
  name: string,
  values: Record<string, string | number | boolean>,
  playerName: string | null
): string {
  const who = playerName ?? 'someone'
  switch (name) {
    case 'portal_fired':
      return `${who} fired portal ${values.leftportal ? 1 : 2}`
    case 'player_landed':
      return `${who} landed`
    case 'player_death':
      return `${who} died`
    case 'player_use':
      return `${who} used entity ${values.entity ?? ''}`.trim()
    case 'player_drop':
      return `${who} dropped an object`
    case 'portal_player_portaled':
      return `${who} was portaled`
    case 'portal_player_ping':
      return `${who} pinged`
    case 'player_team':
      return `${who} joined team ${values.team === TEAM_BLUE ? 'blue' : values.team === TEAM_ORANGE ? 'orange' : values.team}`
    case 'player_spawn_blue':
      return 'blue bot spawned'
    case 'player_spawn_orange':
      return 'orange bot spawned'
    case 'player_long_fling':
      return `${who} flung`
    case 'touched_paint':
      return `${who} touched paint`
    case 'player_zoomed':
      return `${who} zoomed in`
    case 'player_unzoomed':
      return `${who} zoomed out`
    case 'map_transition':
      return 'map transition'
    default: {
      const details = Object.entries(values)
        .filter(([key]) => key !== 'userid')
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
      return playerName ? `${who}: ${name} ${details}`.trim() : `${name} ${details}`.trim()
    }
  }
}

function computeBounds(
  players: SessionPlayer[],
  portals: (SessionPortal | null)[],
  ...series: SessionEntitySeries[][]
): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const include = (state: Float32Array, columns: number, xColumn: number) => {
    const rows = state.length / columns
    for (let row = 0; row < rows; row++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = state[row * columns + xColumn + axis]
        if (Number.isNaN(value)) continue
        if (value < min[axis]) min[axis] = value
        if (value > max[axis]) max[axis] = value
      }
    }
  }
  for (const player of players) include(player.state, PlayerDescriptors.length, PlayerDescriptor.x)
  for (const portal of portals) if (portal) include(portal.state, PortalDescriptors.length, 1)
  for (const group of series) for (const entry of group) include(entry.state, entry.columns, 0)
  if (!Number.isFinite(min[0])) {
    return { min: [-1024, -1024, -256], max: [1024, 1024, 512] }
  }
  return {
    min: [min[0] - BOUNDS_PADDING, min[1] - BOUNDS_PADDING, min[2] - BOUNDS_PADDING],
    max: [max[0] + BOUNDS_PADDING, max[1] + BOUNDS_PADDING, max[2] + BOUNDS_PADDING],
  }
}

function sessionBytes(session: Portal2Session): number {
  let total = session.tickAxis.byteLength
  for (const player of session.players)
    total += player.state.byteLength + (player.view?.byteLength ?? 0)
  for (const portal of session.portals) if (portal) total += portal.state.byteLength
  for (const group of [session.cubes, session.floorButtons, session.doors, session.lasers]) {
    for (const entry of group) total += entry.state.byteLength
  }
  return total
}
