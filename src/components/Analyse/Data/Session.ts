// The viewer-facing result of parsing one or two Portal 2 co-op demos: plain objects of typed
// arrays that transfer out of the parse worker without copying. Every series has one row per
// entry of tickAxis; unset values are NaN.

import type { PlayerRole } from '@constants/portal2'

export type SessionKind = 'single' | 'coop'

export interface SessionDemoInfo {
  fileName: string
  mapName: string
  clientName: string
  serverName: string
  numTicks: number
  numFrames: number
  playbackTime: number
  localPlayerEntityIndex: number | null
  syncTick: number
  levelTransitionTicks: number[]
}

export interface SessionPlayer {
  slot: number
  entityIndex: number
  name: string
  userId: number | null
  steamId: string | null
  role: PlayerRole
  /** index into session.demos of the demo this player recorded, when one of the demos is theirs */
  demoIndex: number | null
  /** [ticks x PlayerDescriptorCount] row-major, columns as PlayerDescriptor */
  state: Float32Array
  /** [ticks x 6]: eye x, y, z, pitch, yaw, roll from the CmdInfo blocks of the player's own demo */
  view: Float32Array | null
}

export interface SessionPortal {
  slot: number
  playerSlot: number
  portalNumber: 1 | 2
  /** [ticks x PortalDescriptorCount] row-major, columns as PortalDescriptor */
  state: Float32Array
}

export interface SessionEntitySeries {
  key: string
  entityIndex: number
  serial: number
  columns: number
  /** [ticks x columns] row-major */
  state: Float32Array
}

export type SessionEventType =
  | 'game'
  | 'chat'
  | 'console'
  | 'pause'
  | 'unpause'
  | 'level_transition'
  | 'ttl'
  | 'portal_traversal'
  | 'portal_placement_failure'
  | 'map_completed'

export interface SessionEvent {
  /** row of tickAxis */
  row: number
  /** tick label on the session axis */
  tick: number
  /** demo the event was read from */
  demoIndex: number
  type: SessionEventType
  /** game event name for game events, otherwise the type */
  name: string
  playerSlot: number | null
  text: string
  data?: Record<string, string | number | boolean>
}

export interface SessionChatMessage {
  row: number
  tick: number
  demoIndex: number
  playerSlot: number | null
  sender: string
  text: string
}

export interface SessionBounds {
  min: [number, number, number]
  max: [number, number, number]
}

export interface SessionPerformance {
  parseMs: number
  entityMs: number
  seriesMs: number
  totalBytes: number
}

export interface Portal2Session {
  kind: SessionKind
  map: string
  skyName: string
  intervalPerTick: number
  tickAxis: Int32Array
  players: SessionPlayer[]
  portals: (SessionPortal | null)[]
  cubes: SessionEntitySeries[]
  floorButtons: SessionEntitySeries[]
  doors: SessionEntitySeries[]
  lasers: SessionEntitySeries[]
  events: SessionEvent[]
  chat: SessionChatMessage[]
  ttlRows: Int32Array
  pauseIntervals: [number, number][]
  levelTransitionRows: Int32Array
  bounds: SessionBounds
  demos: SessionDemoInfo[]
  perf: SessionPerformance
}

/** Columns of SessionPlayer.view */
export const ViewColumn = {
  x: 0,
  y: 1,
  z: 2,
  pitch: 3,
  yaw: 4,
  roll: 5,
} as const
export const VIEW_COLUMNS = 6

/** Every typed array buffer of a session, for postMessage transfer lists */
export function sessionTransferables(session: Portal2Session): ArrayBufferLike[] {
  const buffers: ArrayBufferLike[] = [
    session.tickAxis.buffer,
    session.ttlRows.buffer,
    session.levelTransitionRows.buffer,
  ]
  for (const player of session.players) {
    buffers.push(player.state.buffer)
    if (player.view) buffers.push(player.view.buffer)
  }
  for (const portal of session.portals) {
    if (portal) buffers.push(portal.state.buffer)
  }
  for (const series of [
    ...session.cubes,
    ...session.floorButtons,
    ...session.doors,
    ...session.lasers,
  ]) {
    buffers.push(series.state.buffer)
  }
  return Array.from(new Set(buffers))
}
