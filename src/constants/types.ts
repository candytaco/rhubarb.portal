import type { PlayerRole } from './portal2'

export const SceneMode = {
  WIREFRAME: 'wireframe',
  UNTEXTURED: 'untextured',
  TEXTURED: 'textured',
} as const

export type SceneMode = (typeof SceneMode)[keyof typeof SceneMode]

export const ParserStatus = {
  INIT: 'init',
  LOADING: 'loading',
  DONE: 'done',
} as const

export type ParserStatus = (typeof ParserStatus)[keyof typeof ParserStatus]

export const ControlsMode = {
  POV: 'pov',
  SPECTATOR: 'spectator',
} as const

export type ControlsMode = (typeof ControlsMode)[keyof typeof ControlsMode]

export const DrawingActivation = {
  TOGGLE: 'toggle',
  HOLD: 'hold',
} as const

export type DrawingActivation = (typeof DrawingActivation)[keyof typeof DrawingActivation]

export const DrawingTool = {
  BRUSH: 'brush',
  STICKERS: 'stickers',
} as const

export type DrawingTool = (typeof DrawingTool)[keyof typeof DrawingTool]

/** The two co-op bots a sticker can stand for */
export type StickerRole = Exclude<PlayerRole, 'unknown'>

export const StickerSymbol = {
  A: 'a',
  B: 'b',
  C: 'c',
  GREEN_TICK: 'green-tick',
  RED_X: 'red-x',
} as const

export type StickerSymbol = (typeof StickerSymbol)[keyof typeof StickerSymbol]

export type PlayerStickerDefinition = {
  kind: 'player'
  role: StickerRole
}

export type SymbolStickerDefinition = {
  kind: 'symbol'
  symbol: StickerSymbol
}

export type StickerDefinition = PlayerStickerDefinition | SymbolStickerDefinition

export type StickerAnnotation = StickerDefinition & {
  id: string
  position: [number, number, number]
}

export const UIPanelType = {
  LOAD: 'Load',
  ABOUT: 'About',
  SETTINGS: 'Settings',
  EVENT_LOG: 'EventLog',
  BOOKMARKS: 'Bookmarks',
  SETUPS: 'Setups',
} as const

export type UIPanelType = (typeof UIPanelType)[keyof typeof UIPanelType]

/** Which of the demo's outer scanner pulses a recording is lined up against */
export type RecordingPulse = 'first' | 'last'

/** One player's uploaded screen recording, played against the demo clock */
export type SessionRecording = {
  name: string
  /** object URL of the uploaded file */
  url: string
  /** the pulse the recording is lined up against and its time in the recording, null until marked */
  alignment: { pulse: RecordingPulse; seconds: number } | null
}

// Version 1 setups carried TF2 class stickers and are dropped on load
export const SETUP_STORAGE_VERSION = 2 as const

export type SetupSpectatorCamera = {
  mode: 'spectator'
  position: [number, number, number]
  quaternion: [number, number, number, number]
}

export type SavedSetupCamera = SetupSpectatorCamera

export type SavedSetup = {
  id: string
  version: typeof SETUP_STORAGE_VERSION
  name: string
  map: string
  camera: SavedSetupCamera
  stickers: StickerAnnotation[]
  createdAt: number
  updatedAt: number
}

export const CrosshairStyle = {
  NONE: 'none',
  CROSSHAIR: 'crosshair',
  CROSS: 'cross',
  CIRCLE: 'circle',
  DOT: 'dot',
} as const

export type CrosshairStyle = (typeof CrosshairStyle)[keyof typeof CrosshairStyle]

export type Download = {
  type: 'map' | 'demo'
  status: 'loading' | 'success' | 'error'
  name: string
  url: string
  progress: number
  size?: number
}

export type MapVisibilityMetadata = {
  version: 2
  transform: 'gltf-to-source:x,-z,y'
  chunkNames: string[]
  chunkBounds: { min: [number, number, number]; max: [number, number, number] }[]
  planes: [number, number, number, number][]
  nodes: [number, number, number][]
  leafClusters: number[]
  visibleChunksByCluster: number[][]
}
