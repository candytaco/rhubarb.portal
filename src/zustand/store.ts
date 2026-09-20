import { create } from 'zustand'
import { redux } from 'zustand/middleware'
import CanvasDraw from 'react-canvas-draw'
import { isMobile } from 'react-device-detect'
import * as THREE from 'three'

import type { Portal2Session } from '@components/Analyse/Data/Session'
import { DEFAULT_MAP } from '@constants/portal2'

import { DEFAULT_MAP_BOUNDARIES, parseMapBoundaries } from '@utils/scene'

import {
  ControlsMode,
  CrosshairStyle,
  Download,
  DrawingActivation,
  ParserStatus,
  SavedSetup,
  SavedSetupCamera,
  SceneMode,
  SessionRecording,
  UIPanelType,
} from '@constants/types'
import { DrawingState, createInitialDrawingState } from './drawing'
import rootReducer from './reducer'

// This "Instance Store" is meant to be used for larger objects that are problematic
// to keep in the "Standard Store". (e.g. the parsed session, three.js objects)
// We wanna keep easily accessible references to these important objects because they're
// used a lot throughout.

// three.js is fundamentally not that well suited for React based apps (often easier to
// directly manipulate the objects instead), and react-three-fiber hooks are a bit too
// restrictive (hard to pass values/references around).

export type InstanceState = {
  mapOffsetDebug: {
    cameraOffset: { x: number; y: number; z: number }
  }
  mapCenterPickerActive: boolean
  threeScene: THREE.Scene
  session?: Portal2Session
  /** one uploaded screen recording per player slot, null where the slot has none */
  recordings: (SessionRecording | null)[]
  /** whether the recording alignment controls are open, which holds the demo paused */
  aligningRecordings: boolean
  /** the map whose model has finished downloading, null while one is still loading */
  readyMapModel: string | null
  /** the screen recording the demo clock follows, with what its own time means on that clock */
  recordingClock: { video: HTMLVideoElement; offsetSeconds: number } | null
  focusedObject?: THREE.Object3D
  lastFocusedPOV?: THREE.Object3D
  drawingCanvas?: CanvasDraw
  frameProgress: number
  /** move speed last set by scrolling the free camera, with the time it was set */
  moveSpeedNotice: { value: number; shownAt: number } | null
  runtimePerf: {
    renderCalls: number
    renderTriangles: number
    visibleChunkCount: number
    currentCluster: number | null
  }
  setupCameraBridge?: {
    capture: () => SavedSetupCamera | null
    apply: (camera: SavedSetupCamera) => void
  }
  setThreeScene: (threeScene: THREE.Scene) => void
  setSession: (session: Portal2Session | undefined) => void
  setRecording: (slot: number, recording: SessionRecording | null) => void
  setAligningRecordings: (aligningRecordings: boolean) => void
  setReadyMapModel: (readyMapModel: string | null) => void
  setRecordingClock: (
    recordingClock: { video: HTMLVideoElement; offsetSeconds: number } | null
  ) => void
  setDrawingCanvas: (drawingCanvas: CanvasDraw) => void
  setFocusedObject: (focusedObject?: THREE.Object3D) => void
  setLastFocusedPOV: (lastFocusedPOV?: THREE.Object3D) => void
  setFrameProgress: (frameProgress: number) => void
  setMoveSpeedNotice: (moveSpeedNotice: { value: number; shownAt: number } | null) => void
  setMapCenterPickerActive: (mapCenterPickerActive: boolean) => void
  setMapOffsetDebug: (mapOffsetDebug: { cameraOffset: { x: number; y: number; z: number } }) => void
  setRuntimePerf: (
    runtimePerf: Partial<{
      renderCalls: number
      renderTriangles: number
      visibleChunkCount: number
      currentCluster: number | null
    }>
  ) => void
  setSetupCameraBridge: (setupCameraBridge?: {
    capture: () => SavedSetupCamera | null
    apply: (camera: SavedSetupCamera) => void
  }) => void
}

const sameOffsetVector = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
) => a.x === b.x && a.y === b.y && a.z === b.z

const useInstance = create<InstanceState>()(set => ({
  mapOffsetDebug: {
    cameraOffset: { x: 0, y: 0, z: 0 },
  },
  mapCenterPickerActive: false,
  threeScene: new THREE.Scene(),
  session: undefined,
  recordings: [null, null],
  aligningRecordings: false,
  readyMapModel: null,
  recordingClock: null,
  focusedObject: undefined,
  lastFocusedPOV: undefined,
  drawingCanvas: undefined,
  frameProgress: 0,
  moveSpeedNotice: null,
  runtimePerf: {
    renderCalls: 0,
    renderTriangles: 0,
    visibleChunkCount: 0,
    currentCluster: null,
  },
  setupCameraBridge: undefined,
  setThreeScene: (threeScene: THREE.Scene) => set({ threeScene }),
  setSession: (session: Portal2Session | undefined) => set({ session }),
  setRecordingClock: recordingClock => set({ recordingClock }),
  setAligningRecordings: (aligningRecordings: boolean) => set({ aligningRecordings }),
  setReadyMapModel: (readyMapModel: string | null) => set({ readyMapModel }),
  setRecording: (slot: number, recording: SessionRecording | null) =>
    set(state => ({
      recordings: state.recordings.map((existing, index) =>
        index === slot ? recording : existing
      ),
    })),
  setDrawingCanvas: (drawingCanvas: CanvasDraw) => set({ drawingCanvas }),
  setFocusedObject: (focusedObject?: THREE.Object3D) => set({ focusedObject }),
  setLastFocusedPOV: (lastFocusedPOV?: THREE.Object3D) => set({ lastFocusedPOV }),
  setFrameProgress: (frameProgress: number) => set({ frameProgress }),
  setMoveSpeedNotice: moveSpeedNotice => set({ moveSpeedNotice }),
  setMapCenterPickerActive: (mapCenterPickerActive: boolean) => set({ mapCenterPickerActive }),
  setMapOffsetDebug: mapOffsetDebug =>
    set(state => {
      if (sameOffsetVector(state.mapOffsetDebug.cameraOffset, mapOffsetDebug.cameraOffset)) {
        return state
      }

      return { mapOffsetDebug }
    }),
  setRuntimePerf: runtimePerf =>
    set(state => ({
      runtimePerf: {
        ...state.runtimePerf,
        ...runtimePerf,
      },
    })),
  setSetupCameraBridge: setupCameraBridge => set({ setupCameraBridge }),
}))

// This "Standard Store" is pretty much just a typical Redux store. Note that we are using
// redux middleware on top of zustand because the project was previously using Redux. It was
// decided to shift towards zustand because of annoying React context conflict stuff.

// Note that we also have Redux devtools enabled. This is another reason we need to separate
// into the separate "Instance Store" - because those large objects cause Redux devtools to
// crap itself and annihilates performance.

export type StoreState = {
  parser: {
    status: ParserStatus
    progress: number
    stage: string
    error?: Error
  }
  scene: {
    map: string
    /** whether the map has converted assets; false renders the fallback grid */
    mapAssetsAvailable: boolean | null
    bounds: {
      min: THREE.Vector3
      max: THREE.Vector3
      center: THREE.Vector3
      defaultCameraOffset: THREE.Vector3
      defaultRtsCenter: THREE.Vector3
    }
    controls: {
      mode: ControlsMode
    }
  }
  playback: {
    playing: boolean
    speed: number
    tick: number
    maxTicks: number
    forceShowPanel: boolean
    intervalPerTick: number
  }
  drawing: DrawingState
  settings: {
    scene: {
      mode: SceneMode
      interpolateFrames: boolean
      rtsCenters: Record<string, { x: number; y: number; z: number }>
      showPortals: boolean
      showPuzzleElements: boolean
      showLasers: boolean
      showTrails: boolean
    }
    camera: {
      position: [number, number, number]
      near: number
      far: number
      fov: number
    }
    controls: {
      lookSpeed: number
      moveSpeed: number
    }
    drawing: {
      activation: DrawingActivation
      autoClear: boolean
    }
    ui: {
      nameplate: {
        enabled: boolean
        showName: boolean
        showHealth: boolean
        showRole: boolean
      }
      crosshair: {
        style: CrosshairStyle
        size: number
        opacity: number
        color: string
      }
      playerOutlines: boolean
      showStats: boolean
      showSkybox: boolean
      showMapTunnels: boolean
      showTtlMarkers: boolean
      showConsoleEvents: boolean
      viewDistance: number
      eventSeekBuffer: number
    }
  }
  bookmarks: number[]
  ui: {
    activePanels: UIPanelType[]
  }
  eventHistory: {
    type: string
    value?: string
    timestamp: number
  }[]
  downloads: Map<string, Download>
  setups: {
    items: SavedSetup[]
    draftName: string
    pendingSharedSetup?: SavedSetup
  }
}

export const initialState: StoreState = {
  parser: {
    status: ParserStatus.INIT,
    progress: 0,
    stage: '',
    error: undefined,
  },

  scene: {
    map: DEFAULT_MAP,
    mapAssetsAvailable: null,
    bounds: parseMapBoundaries(DEFAULT_MAP_BOUNDARIES),
    controls: {
      mode: ControlsMode.SPECTATOR,
    },
  },

  playback: {
    playing: false,
    speed: 1,
    tick: 1,
    maxTicks: 3000,
    forceShowPanel: false,
    intervalPerTick: 1 / 60,
  },

  drawing: createInitialDrawingState(),

  settings: {
    scene: {
      mode: isMobile ? SceneMode.UNTEXTURED : SceneMode.TEXTURED,
      interpolateFrames: true,
      rtsCenters: {},
      showPortals: true,
      showPuzzleElements: true,
      showLasers: true,
      showTrails: false,
    },
    camera: {
      position: [0, -400, 200] as [number, number, number],
      near: 0.1,
      far: 15000,
      fov: 90,
    },
    controls: {
      // Spectator camera settings
      lookSpeed: 3,
      moveSpeed: 5,
    },
    drawing: {
      activation: DrawingActivation.TOGGLE,
      autoClear: true,
    },
    ui: {
      nameplate: {
        enabled: true,
        showName: true,
        showHealth: true,
        showRole: true,
      },
      crosshair: {
        style: 'crosshair' as CrosshairStyle,
        size: 16,
        opacity: 0.8,
        color: '#ffffff',
      },
      playerOutlines: false,
      showStats: true,
      showSkybox: true,
      showMapTunnels: true,
      showTtlMarkers: true,
      showConsoleEvents: false,
      viewDistance: 15000,
      eventSeekBuffer: 2,
    },
  },

  bookmarks: [],

  ui: {
    activePanels: [UIPanelType.ABOUT],
  },

  eventHistory: [],

  downloads: new Map(),

  setups: {
    items: [],
    draftName: '',
    pendingSharedSetup: undefined,
  },
}

export type StoreAction = {
  type: string
  payload?: any
}

// TODO: why tf is this erroring? check after TS upgrade
const useStore = create(redux<StoreState, StoreAction>(rootReducer as any, initialState))

// Export these functions at first level because they will be used very frequently
// and are essentially the Redux equivalents (makes migration/adoption easier)
const { dispatch, getState } = useStore

export { useStore, dispatch, getState, useInstance }
