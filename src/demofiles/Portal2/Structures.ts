// Port of gallantlab/DemoFiles Portal2/Structures.py

import { Buttons } from '../DemoParser/UserCommands.ts'
import type { PropertyValue } from '../DemoParser/Entities.ts'
import type { Vector3Tuple } from '../DemoParser/BitBuffer.ts'

// chat text and console command marking a scanner pulse
export const TTL = 'TTL'
export const TTLCommand = 'say TTL'
// console command marking the start of a level transition
export const LevelTransition = 'end_level_transition'
// server commands marking the start and the end of a level transition
export const LevelTransitionCommands = ['end_level_transition', 'stop_transition_videos_fadeout']
// world coordinate offset of cell 0 in the cell coordinate encoding
export const MaxCoordinateInteger = 16384

/** Player commands in the game */
export const Portal2Commands = {
  MoveLeft: 0,
  MoveRight: 1,
  Forward: 2,
  Back: 3,
  Crouch: 4,
  Jump: 5,
  Portal1Fire: 6,
  Portal2Fire: 7,
  Use: 8,
} as const

export type Portal2Command = (typeof Portal2Commands)[keyof typeof Portal2Commands]

export const Portal2CommandList: Portal2Command[] = Object.values(Portal2Commands).sort(
  (left, right) => left - right
)

export const GameCommandValues: Record<Portal2Command, string> = {
  [Portal2Commands.MoveLeft]: 'moveleft',
  [Portal2Commands.MoveRight]: 'moveright',
  [Portal2Commands.Forward]: 'forward',
  [Portal2Commands.Back]: 'back',
  [Portal2Commands.Crouch]: 'duck',
  [Portal2Commands.Jump]: 'jump',
  [Portal2Commands.Portal1Fire]: 'attack',
  [Portal2Commands.Portal2Fire]: 'attack2',
  [Portal2Commands.Use]: 'use',
}

// button bit carried by each command in UserCmd frames
export const GameCommandButtons: Record<Portal2Command, number> = {
  [Portal2Commands.MoveLeft]: Buttons.MoveLeft,
  [Portal2Commands.MoveRight]: Buttons.MoveRight,
  [Portal2Commands.Forward]: Buttons.Forward,
  [Portal2Commands.Back]: Buttons.Back,
  [Portal2Commands.Crouch]: Buttons.Duck,
  [Portal2Commands.Jump]: Buttons.Jump,
  [Portal2Commands.Portal1Fire]: Buttons.Attack,
  [Portal2Commands.Portal2Fire]: Buttons.Attack2,
  [Portal2Commands.Use]: Buttons.Use,
}

/** Server class names of the players and the portals they fire */
export const PlayerServerClasses = {
  Player: 'CPortal_Player',
  Portal: 'CProp_Portal',
} as const

/** Server class names of the test chamber elements the players interact with */
export const PuzzleElementServerClasses = {
  WeightedCube: 'CPropWeightedCube',
  FloorButton: 'CPropFloorButton',
  PedestalButton: 'CPropButton',
  SlidingDoor: 'CBaseDoor',
  RotatingDoor: 'CPropDoorRotating',
} as const

/** Server class names of the test chamber hazards */
export const HazardServerClasses = {
  Laser: 'CPortalLaser',
  FloorTurret: 'CNPC_Portal_FloorTurret',
  LightBridge: 'CProjectedWallEntity',
} as const

/** Server class names of the game rules proxies */
export const GameRulesServerClasses = {
  CooperativeGameRules: 'CPortalMPGameRulesProxy',
} as const

/** Network property names shared by every entity */
export const EntityProperties = {
  Origin: 'm_vecOrigin',
  Rotation: 'm_angRotation',
  CellBits: 'm_cellbits',
  CellX: 'm_cellX',
  CellY: 'm_cellY',
  CellZ: 'm_cellZ',
  OwnerEntity: 'm_hOwnerEntity',
  MoveParent: 'moveparent',
  ModelIndex: 'm_nModelIndex',
} as const

/** Network property names of the player entities */
export const PlayerProperties = {
  LocalOrigin: 'portallocaldata.m_vecOrigin',
  LocalOriginHeight: 'portallocaldata.m_vecOrigin[2]',
  NonLocalOrigin: 'portalnonlocaldata.m_vecOrigin',
  NonLocalOriginHeight: 'portalnonlocaldata.m_vecOrigin[2]',
  EyePitch: 'm_angEyeAngles[0]',
  EyeYaw: 'm_angEyeAngles[1]',
  AttachedObject: 'm_hAttachedObject',
  HeldObjectPortal: 'm_hHeldObjectPortal',
  IsHoldingSomething: 'm_bIsHoldingSomething',
  HeldObjectOnOppositeSideOfPortal: 'm_bHeldObjectOnOppositeSideOfPortal',
  PortalEnvironment: 'm_hPortalEnvironment',
  Health: 'm_iHealth',
  LifeState: 'm_lifeState',
  Team: 'm_iTeamNum',
  Flags: 'm_fFlags',
  Ducked: 'm_Local.m_bDucked',
  ZoomedIn: 'm_PortalLocal.m_bZoomedIn',
  VelocityX: 'localdata.m_vecVelocity[0]',
  VelocityY: 'localdata.m_vecVelocity[1]',
  VelocityZ: 'localdata.m_vecVelocity[2]',
  EntityPortalledMessageCount: 'portallocaldata.m_iEntityPortalledNetworkMessageCount',
} as const

// player properties the server sends only to the player they describe, and only to the other players
export const OwnPlayerOnlyProperties: ReadonlySet<string> = new Set([
  PlayerProperties.LocalOrigin,
  PlayerProperties.LocalOriginHeight,
  PlayerProperties.Ducked,
  PlayerProperties.ZoomedIn,
  PlayerProperties.VelocityX,
  PlayerProperties.VelocityY,
  PlayerProperties.VelocityZ,
  PlayerProperties.EntityPortalledMessageCount,
])
export const OtherPlayerOnlyProperties: ReadonlySet<string> = new Set([
  PlayerProperties.NonLocalOrigin,
  PlayerProperties.NonLocalOriginHeight,
])

/** Fields of one slot of the ring buffer of entity-portalled messages the server keeps on each player for that player's client */
export const EntityPortalledMessageFields = {
  Entity: 'm_hEntity',
  Portal: 'm_hPortal',
  Time: 'm_fTime',
  ForcedDuck: 'm_bForcedDuck',
  MessageNumber: 'm_iMessageCount',
} as const

export const EntityPortalledMessageFieldList = Object.values(EntityPortalledMessageFields)

// slots in the ring buffer; message n occupies slot n modulo this
export const NumEntityPortalledMessageSlots = 32

/** Flattened network property name of one field of one ring buffer slot */
export function entityPortalledMessageProperty(slot: number, field: string): string {
  return `${slot.toString().padStart(3, '0')}.${field}`
}

/** Network property names of the portal entities */
export const PortalProperties = {
  PlacementOrigin: 'm_ptOrigin',
  AbsoluteAngles: 'm_qAbsAngle',
  LinkedPortal: 'm_hLinkedPortal',
  Activated: 'm_bActivated',
  IsPortal2: 'm_bIsPortal2',
  HalfWidth: 'm_fNetworkHalfWidth',
  HalfHeight: 'm_fNetworkHalfHeight',
  FiredByPlayer: 'm_hFiredByPlayer',
  PlacementAttemptParity: 'm_nPlacementAttemptParity',
} as const

/** Network property names of the test chamber elements */
export const PuzzleElementProperties = {
  Awake: 'm_bAwake',
  ButtonState: 'm_bButtonState',
  FinalDestination: 'm_vecFinalDest',
  MovementType: 'm_movementType',
} as const

/** Network property names of the test chamber hazards */
export const HazardProperties = {
  LaserStartPoint: 'm_vStartPoint',
  LaserEndPoint: 'm_vEndPoint',
  LaserOn: 'm_bLaserOn',
  // One light bridge segment: a bridge that passes through a portal continues as a child entity
  BridgeStartPoint: 'm_vecStartPoint',
  BridgeEndPoint: 'm_vecEndPoint',
  BridgeWidth: 'm_flWidth',
  BridgeIsHorizontal: 'm_bIsHorizontal',
} as const

/** Network property names of the game rules proxies */
export const GameRulesProperties = {
  CooperativeSectionIndex: 'portalmp_gamerules_data.m_nCoopSectionIndex',
  NumPortalsPlaced: 'portalmp_gamerules_data.m_nNumPortalsPlaced',
} as const

/** Descriptor sources read from the entity history record rather than from a network property */
export const HistoryFields = {
  Origin: 'origin',
  ServerTick: 'serverTick',
  EntityIndex: 'entityIndex',
} as const

// entity properties recorded per tick for each tracked server class
export const TrackedClassProperties: Record<string, string[]> = {
  [PlayerServerClasses.Player]: [
    PlayerProperties.LocalOrigin,
    PlayerProperties.LocalOriginHeight,
    PlayerProperties.NonLocalOrigin,
    PlayerProperties.NonLocalOriginHeight,
    PlayerProperties.EyePitch,
    PlayerProperties.EyeYaw,
    PlayerProperties.AttachedObject,
    PlayerProperties.HeldObjectPortal,
    PlayerProperties.IsHoldingSomething,
    PlayerProperties.HeldObjectOnOppositeSideOfPortal,
    PlayerProperties.PortalEnvironment,
    PlayerProperties.Health,
    PlayerProperties.LifeState,
    PlayerProperties.Team,
    PlayerProperties.Flags,
    PlayerProperties.Ducked,
    PlayerProperties.ZoomedIn,
    PlayerProperties.VelocityX,
    PlayerProperties.VelocityY,
    PlayerProperties.VelocityZ,
  ],
  [PlayerServerClasses.Portal]: [
    EntityProperties.Origin,
    EntityProperties.Rotation,
    PortalProperties.PlacementOrigin,
    PortalProperties.AbsoluteAngles,
    PortalProperties.LinkedPortal,
    PortalProperties.Activated,
    PortalProperties.IsPortal2,
    PortalProperties.HalfWidth,
    PortalProperties.HalfHeight,
    PortalProperties.FiredByPlayer,
    PortalProperties.PlacementAttemptParity,
  ],
  [PuzzleElementServerClasses.WeightedCube]: [
    EntityProperties.Origin,
    EntityProperties.Rotation,
    PuzzleElementProperties.Awake,
    EntityProperties.OwnerEntity,
    EntityProperties.MoveParent,
    EntityProperties.ModelIndex,
  ],
  [PuzzleElementServerClasses.FloorButton]: [
    EntityProperties.Origin,
    EntityProperties.Rotation,
    PuzzleElementProperties.ButtonState,
  ],
  [PuzzleElementServerClasses.PedestalButton]: [EntityProperties.Origin, EntityProperties.Rotation],
  [PuzzleElementServerClasses.SlidingDoor]: [
    EntityProperties.Origin,
    EntityProperties.Rotation,
    PuzzleElementProperties.FinalDestination,
    PuzzleElementProperties.MovementType,
  ],
  [PuzzleElementServerClasses.RotatingDoor]: [EntityProperties.Origin, EntityProperties.Rotation],
  [HazardServerClasses.Laser]: [
    EntityProperties.Origin,
    HazardProperties.LaserStartPoint,
    HazardProperties.LaserEndPoint,
    HazardProperties.LaserOn,
  ],
  [HazardServerClasses.FloorTurret]: [EntityProperties.Origin, EntityProperties.Rotation],
  [HazardServerClasses.LightBridge]: [
    EntityProperties.Origin,
    EntityProperties.Rotation,
    HazardProperties.BridgeStartPoint,
    HazardProperties.BridgeEndPoint,
    HazardProperties.BridgeWidth,
    HazardProperties.BridgeIsHorizontal,
  ],
  [GameRulesServerClasses.CooperativeGameRules]: [
    GameRulesProperties.CooperativeSectionIndex,
    GameRulesProperties.NumPortalsPlaced,
  ],
}

/**
 * Per-tick record of one entity's tracked properties
 */
export class EntityHistory {
  readonly entityIndex: number
  readonly serial: number // handle serial number, which distinguishes entities that reused the slot
  readonly className: string
  readonly propertyNames: string[]
  ticks: number[] = []
  serverTicks: number[] = []
  origins: (Vector3Tuple | null)[] = []
  values: Record<string, PropertyValue[]>

  constructor(entityIndex: number, serial: number, className: string, propertyNames: string[]) {
    this.entityIndex = entityIndex
    this.serial = serial
    this.className = className
    this.propertyNames = propertyNames
    this.values = {}
    for (const name of propertyNames) this.values[name] = []
  }

  /** Values of one scalar property as an array with one row per recorded tick, NaN where unset */
  array(propertyName: string): Float64Array {
    const values = this.values[propertyName] ?? []
    const result = new Float64Array(values.length)
    for (let index = 0; index < values.length; index++) {
      result[index] = propertyValueToNumber(values[index])
    }
    return result
  }

  /** Ticks at which a property took a new value, starting with the first recorded value */
  changes(propertyName: string): [number, PropertyValue][] {
    const changes: [number, PropertyValue][] = []
    const values = this.values[propertyName] ?? []
    let last: PropertyValue | undefined = undefined
    let first = true
    for (let index = 0; index < this.ticks.length; index++) {
      const value = values[index]
      if (first || !samePropertyValue(value, last as PropertyValue)) {
        changes.push([this.ticks[index], value])
        last = value
        first = false
      }
    }
    return changes
  }
}

/** Scalar view of a property value: numbers as is, booleans as 0/1, everything else NaN */
export function propertyValueToNumber(value: PropertyValue | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  return NaN
}

function samePropertyValue(left: PropertyValue, right: PropertyValue): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index])
  }
  return false
}

/**
 * One entity-portalled message: an entity passing through a portal
 */
export class PortalTraversal {
  tick: number // demo tick of the Packet frame that delivered the message
  serverTick: number
  time: number | null // server time of the traversal
  entityIndex: number | null // entity that passed through
  enteredPortal: number | null // entity index of the portal it entered
  exitPortal: number | null // entity index of the portal it came out of, when the portal's link was known
  forcedDuck: boolean
  messageNumber: number // running number of the message in the recording client's stream

  constructor(
    tick: number,
    serverTick: number,
    time: number | null,
    entityIndex: number | null,
    enteredPortal: number | null,
    exitPortal: number | null,
    forcedDuck: boolean,
    messageNumber: number
  ) {
    this.tick = tick
    this.serverTick = serverTick
    this.time = time
    this.entityIndex = entityIndex
    this.enteredPortal = enteredPortal
    this.exitPortal = exitPortal
    this.forcedDuck = forcedDuck
    this.messageNumber = messageNumber
  }
}

/** Columns of the portal traversal matrix */
export const PortalTraversalParameters = {
  tick: 0,
  serverTick: 1,
  time: 2,
  entityIndex: 3,
  enteredPortal: 4,
  exitPortal: 5,
  forcedDuck: 6,
} as const
export const PortalTraversalParameterCount = 7

/** Columns of the portal proximity interval matrix */
export const PortalProximityParameters = {
  startTick: 0,
  endTick: 1,
  entityIndex: 2,
  portalSlot: 3,
} as const
export const PortalProximityParameterCount = 4

/** Positions of the portals in the portal lists, by firing player and portal kind */
export const PortalSlot = {
  Player1Portal1: 0,
  Player1Portal2: 1,
  Player2Portal1: 2,
  Player2Portal2: 3,
} as const

/**
 * Description of one column of an entity time series
 */
export class EntityDescriptionParameters {
  name: string
  source: string // network property, or a HistoryFields entry
  component: number | null // index into a vector-valued property, or null for scalars
  continuous: boolean // interpolate linearly between samples rather than holding the last value
  isHandle: boolean // values are entity handles, recorded as entity indices

  constructor(
    name: string,
    source: string,
    component: number | null = null,
    continuous: boolean = true,
    isHandle: boolean = false
  ) {
    this.name = name
    this.source = source
    this.component = component
    this.continuous = continuous
    this.isHandle = isHandle
  }
}

const describe = (
  name: string,
  source: string,
  options: { component?: number; continuous?: boolean; isHandle?: boolean } = {}
) =>
  new EntityDescriptionParameters(
    name,
    source,
    options.component ?? null,
    options.continuous ?? true,
    options.isHandle ?? false
  )

/** Column index map of a descriptor list, checked against the list order */
function indexEnum<Name extends string>(
  descriptors: EntityDescriptionParameters[],
  names: readonly Name[]
): Record<Name, number> {
  if (names.length !== descriptors.length) {
    throw new Error(
      `Descriptor index has ${names.length} names for ${descriptors.length} descriptors`
    )
  }
  const result = {} as Record<Name, number>
  names.forEach((name, index) => {
    if (descriptors[index].name !== name) {
      throw new Error(`Descriptor ${index} is ${descriptors[index].name}, expected ${name}`)
    }
    result[name] = index
  })
  return result
}

export const OriginDescriptors = [
  describe('x', HistoryFields.Origin, { component: 0 }),
  describe('y', HistoryFields.Origin, { component: 1 }),
  describe('z', HistoryFields.Origin, { component: 2 }),
]

export const PlayerDescriptors = [
  ...OriginDescriptors,
  describe('pitch', PlayerProperties.EyePitch),
  describe('yaw', PlayerProperties.EyeYaw),
  describe('attachedObject', PlayerProperties.AttachedObject, { continuous: false }),
  describe('isHoldingSomething', PlayerProperties.IsHoldingSomething, { continuous: false }),
  describe('health', PlayerProperties.Health, { continuous: false }),
  describe('lifeState', PlayerProperties.LifeState, { continuous: false }),
  describe('team', PlayerProperties.Team, { continuous: false }),
  describe('portalEnvironment', PlayerProperties.PortalEnvironment, {
    continuous: false,
    isHandle: true,
  }),
  describe('serverTick', HistoryFields.ServerTick),
]
export const PlayerDescriptor = indexEnum(PlayerDescriptors, [
  'x',
  'y',
  'z',
  'pitch',
  'yaw',
  'attachedObject',
  'isHoldingSomething',
  'health',
  'lifeState',
  'team',
  'portalEnvironment',
  'serverTick',
] as const)

export const PortalDescriptors = [
  describe('entityIndex', HistoryFields.EntityIndex, { continuous: false }),
  describe('x', PortalProperties.PlacementOrigin, { component: 0 }),
  describe('y', PortalProperties.PlacementOrigin, { component: 1 }),
  describe('z', PortalProperties.PlacementOrigin, { component: 2 }),
  describe('pitch', PortalProperties.AbsoluteAngles, { component: 0 }),
  describe('yaw', PortalProperties.AbsoluteAngles, { component: 1 }),
  describe('roll', PortalProperties.AbsoluteAngles, { component: 2 }),
  describe('activated', PortalProperties.Activated, { continuous: false }),
  describe('isPortal2', PortalProperties.IsPortal2, { continuous: false }),
  describe('firedByPlayer', PortalProperties.FiredByPlayer, { continuous: false, isHandle: true }),
  describe('linkedPortal', PortalProperties.LinkedPortal, { continuous: false, isHandle: true }),
  describe('serverTick', HistoryFields.ServerTick),
]
export const PortalDescriptor = indexEnum(PortalDescriptors, [
  'entityIndex',
  'x',
  'y',
  'z',
  'pitch',
  'yaw',
  'roll',
  'activated',
  'isPortal2',
  'firedByPlayer',
  'linkedPortal',
  'serverTick',
] as const)

export const HeldObjectDescriptors = [
  describe('heldObject', PlayerProperties.AttachedObject, { continuous: false, isHandle: true }),
]

export const FloorButtonDescriptors = [
  ...OriginDescriptors,
  describe('buttonState', PuzzleElementProperties.ButtonState, { continuous: false }),
]
export const FloorButtonDescriptor = indexEnum(FloorButtonDescriptors, [
  'x',
  'y',
  'z',
  'buttonState',
] as const)

export const DoorDescriptors = [
  ...OriginDescriptors,
  describe('pitch', EntityProperties.Rotation, { component: 0 }),
  describe('yaw', EntityProperties.Rotation, { component: 1 }),
  describe('roll', EntityProperties.Rotation, { component: 2 }),
]
export const DoorDescriptor = indexEnum(DoorDescriptors, [
  'x',
  'y',
  'z',
  'pitch',
  'yaw',
  'roll',
] as const)

export const CubeDescriptors = OriginDescriptors
export const CubeDescriptor = indexEnum(CubeDescriptors, ['x', 'y', 'z'] as const)

// Added for the viewer: the Python tracks CPortalLaser but exposes it only as histories
export const LaserDescriptors = [
  ...OriginDescriptors,
  describe('startX', HazardProperties.LaserStartPoint, { component: 0 }),
  describe('startY', HazardProperties.LaserStartPoint, { component: 1 }),
  describe('startZ', HazardProperties.LaserStartPoint, { component: 2 }),
  describe('endX', HazardProperties.LaserEndPoint, { component: 0 }),
  describe('endY', HazardProperties.LaserEndPoint, { component: 1 }),
  describe('endZ', HazardProperties.LaserEndPoint, { component: 2 }),
  describe('on', HazardProperties.LaserOn, { continuous: false }),
]
export const LaserDescriptor = indexEnum(LaserDescriptors, [
  'x',
  'y',
  'z',
  'startX',
  'startY',
  'startZ',
  'endX',
  'endY',
  'endZ',
  'on',
] as const)

// Added for the viewer: one light bridge segment, whose surface spans the start-to-end line and the
// right vector of its rotation, with the rotation's up vector as the surface normal
export const BridgeDescriptors = [
  ...OriginDescriptors,
  describe('startX', HazardProperties.BridgeStartPoint, { component: 0 }),
  describe('startY', HazardProperties.BridgeStartPoint, { component: 1 }),
  describe('startZ', HazardProperties.BridgeStartPoint, { component: 2 }),
  describe('endX', HazardProperties.BridgeEndPoint, { component: 0 }),
  describe('endY', HazardProperties.BridgeEndPoint, { component: 1 }),
  describe('endZ', HazardProperties.BridgeEndPoint, { component: 2 }),
  describe('pitch', EntityProperties.Rotation, { component: 0 }),
  describe('yaw', EntityProperties.Rotation, { component: 1 }),
  describe('roll', EntityProperties.Rotation, { component: 2 }),
  describe('width', HazardProperties.BridgeWidth, { continuous: false }),
  describe('horizontal', HazardProperties.BridgeIsHorizontal, { continuous: false }),
]
export const BridgeDescriptor = indexEnum(BridgeDescriptors, [
  'x',
  'y',
  'z',
  'startX',
  'startY',
  'startZ',
  'endX',
  'endY',
  'endZ',
  'pitch',
  'yaw',
  'roll',
  'width',
  'horizontal',
] as const)
