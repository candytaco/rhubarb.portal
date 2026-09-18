// Read helpers over a Portal2Session for one axis row

import {
  CubeDescriptor,
  DoorDescriptor,
  FloorButtonDescriptor,
  LaserDescriptor,
  PlayerDescriptor,
  PlayerDescriptors,
  PortalDescriptor,
  PortalDescriptors,
} from '../demofiles/Portal2/Structures'
import type {
  Portal2Session,
  SessionEntitySeries,
  SessionPlayer,
  SessionPortal,
} from '@components/Analyse/Data/Session'
import { ViewColumn, VIEW_COLUMNS } from '@components/Analyse/Data/Session'
import {
  EYE_HEIGHT_STANDING,
  PLAYER_ROLE_COLORS,
  PORTAL_COLORS,
  type PlayerRole,
} from '@constants/portal2'

export interface Vector {
  x: number
  y: number
  z: number
}

export interface PlayerFrame {
  slot: number
  player: SessionPlayer
  /** feet origin, null when the player was not reported at this row */
  position: Vector | null
  /** eye position: from the CmdInfo view when the player recorded a demo, else origin plus eye height */
  eyePosition: Vector | null
  /** pitch, yaw, roll in degrees */
  viewAngles: Vector
  health: number
  alive: boolean
  team: number
  attachedObject: number | null
  isHoldingSomething: boolean
  portalEnvironment: number | null
  serverTick: number
}

export interface PortalFrame {
  portal: SessionPortal
  position: Vector
  angles: Vector
  activated: boolean
  entityIndex: number
  linkedPortal: number | null
  color: string
}

export interface EntityFrame {
  series: SessionEntitySeries
  position: Vector
  values: Float32Array
}

const PLAYER_COLUMNS = PlayerDescriptors.length
const PORTAL_COLUMNS = PortalDescriptors.length

export function clampRow(session: Portal2Session, row: number): number {
  return Math.max(0, Math.min(session.tickAxis.length - 1, row))
}

export function axisTick(session: Portal2Session, row: number): number {
  return session.tickAxis[clampRow(session, row)]
}

export function getPlayerFrame(
  session: Portal2Session,
  slot: number,
  row: number
): PlayerFrame | null {
  const player = session.players[slot]
  if (!player) return null
  row = clampRow(session, row)
  const base = row * PLAYER_COLUMNS
  const state = player.state
  const x = state[base + PlayerDescriptor.x]
  const position = Number.isNaN(x)
    ? null
    : { x, y: state[base + PlayerDescriptor.y], z: state[base + PlayerDescriptor.z] }

  let eyePosition: Vector | null = null
  let viewAngles: Vector = {
    x: nanToZero(state[base + PlayerDescriptor.pitch]),
    y: nanToZero(state[base + PlayerDescriptor.yaw]),
    z: 0,
  }
  if (player.view) {
    const viewBase = row * VIEW_COLUMNS
    const viewX = player.view[viewBase + ViewColumn.x]
    if (!Number.isNaN(viewX)) {
      eyePosition = {
        x: viewX,
        y: player.view[viewBase + ViewColumn.y],
        z: player.view[viewBase + ViewColumn.z],
      }
      viewAngles = {
        x: player.view[viewBase + ViewColumn.pitch],
        y: player.view[viewBase + ViewColumn.yaw],
        z: player.view[viewBase + ViewColumn.roll],
      }
    }
  }
  if (!eyePosition && position) {
    eyePosition = { x: position.x, y: position.y, z: position.z + EYE_HEIGHT_STANDING }
  }

  const health = state[base + PlayerDescriptor.health]
  const lifeState = state[base + PlayerDescriptor.lifeState]
  const attachedObject = state[base + PlayerDescriptor.attachedObject]
  const portalEnvironment = state[base + PlayerDescriptor.portalEnvironment]

  return {
    slot,
    player,
    position,
    eyePosition,
    viewAngles,
    health: Number.isNaN(health) ? 100 : health,
    alive: Number.isNaN(lifeState) ? true : lifeState === 0,
    team: nanToZero(state[base + PlayerDescriptor.team]),
    attachedObject: isEntityHandle(attachedObject) ? attachedObject : null,
    isHoldingSomething: state[base + PlayerDescriptor.isHoldingSomething] === 1,
    portalEnvironment: isEntityHandle(portalEnvironment) ? portalEnvironment : null,
    serverTick: nanToZero(state[base + PlayerDescriptor.serverTick]),
  }
}

export function getPlayerFrames(session: Portal2Session, row: number): PlayerFrame[] {
  return session.players
    .map(player => getPlayerFrame(session, player.slot, row))
    .filter((frame): frame is PlayerFrame => frame !== null)
}

export function getPortalFrame(
  session: Portal2Session,
  slot: number,
  row: number
): PortalFrame | null {
  const portal = session.portals[slot]
  if (!portal) return null
  row = clampRow(session, row)
  const base = row * PORTAL_COLUMNS
  const state = portal.state
  const x = state[base + PortalDescriptor.x]
  if (Number.isNaN(x)) return null
  const activated = state[base + PortalDescriptor.activated]
  const linked = state[base + PortalDescriptor.linkedPortal]
  const role = session.players[portal.playerSlot]?.role ?? 'unknown'
  return {
    portal,
    position: { x, y: state[base + PortalDescriptor.y], z: state[base + PortalDescriptor.z] },
    angles: {
      x: nanToZero(state[base + PortalDescriptor.pitch]),
      y: nanToZero(state[base + PortalDescriptor.yaw]),
      z: nanToZero(state[base + PortalDescriptor.roll]),
    },
    activated: activated === 1,
    entityIndex: nanToZero(state[base + PortalDescriptor.entityIndex]),
    linkedPortal: isEntityHandle(linked) ? linked : null,
    color: portalColor(role, portal.portalNumber),
  }
}

export function getPortalFrames(session: Portal2Session, row: number): PortalFrame[] {
  const frames: PortalFrame[] = []
  session.portals.forEach((portal, slot) => {
    if (!portal) return
    const frame = getPortalFrame(session, slot, row)
    if (frame) frames.push(frame)
  })
  return frames
}

export function getEntityFrame(
  session: Portal2Session,
  series: SessionEntitySeries,
  row: number
): EntityFrame | null {
  row = clampRow(session, row)
  const base = row * series.columns
  const x = series.state[base]
  if (Number.isNaN(x)) return null
  return {
    series,
    position: { x, y: series.state[base + 1], z: series.state[base + 2] },
    values: series.state.subarray(base, base + series.columns),
  }
}

export function getEntityFrames(
  session: Portal2Session,
  group: SessionEntitySeries[],
  row: number
): EntityFrame[] {
  const frames: EntityFrame[] = []
  for (const series of group) {
    const frame = getEntityFrame(session, series, row)
    if (frame) frames.push(frame)
  }
  return frames
}

export const EntityColumns = {
  cube: CubeDescriptor,
  floorButton: FloorButtonDescriptor,
  door: DoorDescriptor,
  laser: LaserDescriptor,
}

export function portalColor(role: PlayerRole, portalNumber: 1 | 2): string {
  return PORTAL_COLORS[role][portalNumber - 1]
}

export function roleColor(role: PlayerRole): string {
  return PLAYER_ROLE_COLORS[role]
}

export function playerBySlot(
  session: Portal2Session | undefined,
  slot: number | null
): SessionPlayer | null {
  if (!session || slot === null) return null
  return session.players[slot] ?? null
}

function nanToZero(value: number): number {
  return Number.isNaN(value) ? 0 : value
}

function isEntityHandle(value: number): boolean {
  return !Number.isNaN(value) && value >= 0
}

/** Rows within a window before (and including) a row, newest last */
export function rowsInWindow(
  session: Portal2Session,
  row: number,
  windowRows: number
): [number, number] {
  const end = clampRow(session, row)
  return [Math.max(0, end - windowRows), end]
}
