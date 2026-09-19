import { Component, createRef, useRef, useEffect, useState, useCallback, Suspense } from 'react'

// THREE related imports
import * as THREE from 'three'
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { EffectComposer, Outline, Selection } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

// Scene items
// @ts-ignore
import { SpectatorControls } from '@components/Controls/SpectatorControls'
import { CanvasKeyHandler } from '@components/Scene/CanvasKeyHandler'
import { Lights } from '@components/Scene/Lights'
import { Actors, ActorProps } from '@components/Scene/Actors'
import { Portals } from '@components/Scene/Portals'
import { PuzzleElements } from '@components/Scene/PuzzleElements'
import { World } from '@components/Scene/World'
import { Skybox } from '@components/Scene/Skybox'
import { Stickers } from '@components/Scene/Stickers'
import type { Portal2Session } from './Analyse/Data/Session'

// UI Panels
import { AboutPanel } from '@components/UI/AboutPanel'
import { SettingsPanel } from '@components/UI/SettingsPanel'
import { PlaybackPanel } from '@components/UI/PlaybackPanel'
import { EventFeed } from '@components/UI/EventFeed'
import { ChatHud } from '@components/UI/ChatHud'
import { FocusedPlayer } from '@components/UI/FocusedPlayer'
import { EventLogPanel } from '@components/UI/EventLogPanel'
import { BookmarksPanel } from '@components/UI/BookmarksPanel'
import { SetupsPanel } from '@components/UI/SetupsPanel'
import { FpsCounter } from '@components/UI/FpsCounter'
import { Crosshair } from '@components/UI/Crosshair'
import { MoveSpeedNotice } from '@components/UI/MoveSpeedNotice'
import { MapOffsetDebugPanel } from '@components/UI/MapOffsetDebugPanel'

import { motion } from 'framer-motion'
import { AiFillFastForwardIcon } from '@components/Misc/Icons'

// Actions & utils
import { useStore, getState, useInstance } from '@zus/store'
import {
  changeControlsModeAction,
  forceShowPanelAction,
  goToTickAction,
  playbackJumpAction,
  setSceneRtsCenterAction,
} from '@zus/actions'
import { isPerfLoggingEnabled, readJsHeapMemoryMb } from '@utils/misc'
import { useIsMobile } from '@utils/hooks'
import { cn } from '@utils/styling'
import { getPlayerFrames, getPortalFrames, PlayerFrame, PortalFrame } from '@utils/session'
import { ControlsMode, DrawingTool, SavedSetupCamera } from '@constants/types'
import { getWorldIntersectionFromScreen } from '@utils/raycast'

//
// ─── THREE SETTINGS & ELEMENTS ──────────────────────────────────────────────────
//

// Modify default UP axis to be consistent with game coordinates
THREE.Object3D.DEFAULT_UP.set(0, 0, 1)
THREE.Cache.enabled = true

// Basic controls for our scene
extend({ SpectatorControls })

const SPECTATOR_CAMERA_OFFSET = new THREE.Vector3(0, 45, 150)
const ENABLE_DEBUG_MAP_OFFSET = false
const MARKER_COLOR = '#37ff5f'
// portal rings stay highlighted this many axis rows after something went through them
const TRAVERSAL_HIGHLIGHT_ROWS = 45

const roundOffset = (x: number, y: number, z: number) => ({
  x: Math.round(x),
  y: Math.round(y),
  z: Math.round(z),
})

const getFocusedViewTransform = (focusedObject?: THREE.Object3D) => {
  if (!focusedObject) return null

  const focusAnchor =
    focusedObject.getObjectByName('povCamera') ?? focusedObject.getObjectByName('playerAim')

  if (!focusAnchor) return null

  focusAnchor.updateWorldMatrix(true, false)

  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const direction = new THREE.Vector3()

  focusAnchor.getWorldPosition(position)
  focusAnchor.getWorldQuaternion(quaternion)
  direction.set(0, 0, -1).applyQuaternion(quaternion).normalize()

  return { position, quaternion, direction }
}

// This component is messy af but whatever yolo
const Controls = () => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const spectatorRef = useRef<any>()
  const pendingSetupCameraRef = useRef<SavedSetupCamera | null>(null)
  const skipSpectatorAutoEnableRef = useRef(false)
  const { gl, scene, set } = useThree()

  const settings = useStore(state => state.settings)
  const controlsMode = useStore(state => state.scene.controls.mode)
  const bounds = useStore(state => state.scene.bounds)
  const drawingEnabled = useStore(state => state.drawing.enabled)
  const drawingTool = useStore(state => state.drawing.tool)
  const focusedObject = useInstance(state => state.focusedObject)
  const lastFocusedPOV = useInstance(state => state.lastFocusedPOV)
  const isStickersToolActive = drawingEnabled && drawingTool === DrawingTool.STICKERS

  // Keep a reference of our scene in the store's instances for easy access
  useEffect(() => {
    useInstance.getState().setThreeScene(scene)
  }, [scene])

  // Update the default camera when necessary
  useEffect(() => {
    let nextCamera = focusedObject?.getObjectByName('povCamera') ?? (scene as any)?.camera

    if (nextCamera) {
      set({ camera: nextCamera as THREE.PerspectiveCamera })
    }
  }, [focusedObject]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update controls & camera position when necessary
  useEffect(() => {
    if (!cameraRef.current) return

    // Depending on whether there was a previous focused object, we either:
    // - reposition our Controls where that object was
    // - reposition our Controls to the center of the scene
    const focusedView = getFocusedViewTransform(lastFocusedPOV)
    const newPos = focusedView?.position ?? bounds.defaultRtsCenter
    let cameraOffset = bounds.defaultCameraOffset

    if (focusedView && controlsMode === 'spectator') {
      cameraOffset = SPECTATOR_CAMERA_OFFSET.clone().applyQuaternion(focusedView.quaternion)
    }

    cameraRef.current.position.copy(newPos).add(cameraOffset)
    cameraRef.current.near = 10
    cameraRef.current.far = settings.ui.viewDistance || 15000

    if (controlsMode === 'spectator' && spectatorRef.current) {
      // Ground-grab panning measures its drag distance against the map floor
      spectatorRef.current.groundZ = bounds.min.z

      if (focusedView) {
        cameraRef.current.quaternion.copy(focusedView.quaternion)
      } else {
        cameraRef.current.lookAt(bounds.defaultRtsCenter)
      }

      spectatorRef.current.listen()
      if (skipSpectatorAutoEnableRef.current) {
        spectatorRef.current.disable()
        skipSpectatorAutoEnableRef.current = false
      } else {
        spectatorRef.current.enable()
      }
    }
  }, [cameraRef.current, lastFocusedPOV, bounds, controlsMode])

  useEffect(() => {
    if (!cameraRef.current) return
    cameraRef.current.far = settings.ui.viewDistance || 15000
    cameraRef.current.updateProjectionMatrix()
  }, [settings.ui.viewDistance])

  useEffect(() => {
    if (!spectatorRef.current) return

    spectatorRef.current.allowInput = !isStickersToolActive

    if (isStickersToolActive && spectatorRef.current.isEnabled()) {
      spectatorRef.current.disable()
      return
    }

    // The controls hold no input of their own while disabled, so leaving the stickers tool has to
    // hand the free camera back
    if (!isStickersToolActive && controlsMode === ControlsMode.SPECTATOR) {
      spectatorRef.current.enable()
    }
  }, [controlsMode, isStickersToolActive])

  // Scrolling the free camera's move speed reports the new value for the on-screen notice
  const reportMoveSpeed = useCallback((moveSpeed: number) => {
    useInstance.getState().setMoveSpeedNotice({ value: moveSpeed, shownAt: performance.now() })
  }, [])

  const captureSetupCamera = useCallback((): SavedSetupCamera | null => {
    if (!cameraRef.current) return null

    if (controlsMode === ControlsMode.SPECTATOR) {
      return {
        mode: 'spectator',
        position: vector3ToTuple(cameraRef.current.position),
        quaternion: quaternionToTuple(cameraRef.current.quaternion),
      }
    }

    const focusedView = getFocusedViewTransform(focusedObject)
    if (!focusedView) {
      return {
        mode: 'spectator',
        position: vector3ToTuple(cameraRef.current.position),
        quaternion: quaternionToTuple(cameraRef.current.quaternion),
      }
    }

    return {
      mode: 'spectator',
      position: vector3ToTuple(focusedView.position),
      quaternion: quaternionToTuple(focusedView.quaternion),
    }
  }, [controlsMode, focusedObject])

  const tryApplyPendingSetupCamera = useCallback(() => {
    if (!pendingSetupCameraRef.current || !cameraRef.current) return false

    const pendingCamera = pendingSetupCameraRef.current

    if (controlsMode !== ControlsMode.SPECTATOR) return false

    // Disabling restores the XYZ rotation order so the saved quaternion applies cleanly; enabling
    // again reorders it and hands the camera back
    spectatorRef.current?.disable()
    cameraRef.current.position.set(...pendingCamera.position)
    cameraRef.current.quaternion.set(...pendingCamera.quaternion)
    cameraRef.current.updateMatrixWorld()
    spectatorRef.current?.enable()
    pendingSetupCameraRef.current = null
    return true
  }, [controlsMode])

  const applySetupCamera = useCallback(
    (camera: SavedSetupCamera) => {
      pendingSetupCameraRef.current = camera
      skipSpectatorAutoEnableRef.current = true

      if (controlsMode !== ControlsMode.SPECTATOR) {
        changeControlsModeAction(ControlsMode.SPECTATOR)
        return
      }

      tryApplyPendingSetupCamera()
    },
    [controlsMode, tryApplyPendingSetupCamera]
  )

  useEffect(() => {
    useInstance.getState().setSetupCameraBridge({
      capture: captureSetupCamera,
      apply: applySetupCamera,
    })

    return () => {
      useInstance.getState().setSetupCameraBridge(undefined)
    }
  }, [applySetupCamera, captureSetupCamera])

  useEffect(() => {
    tryApplyPendingSetupCamera()
  }, [bounds, controlsMode, tryApplyPendingSetupCamera])

  useFrame(() => {
    if (spectatorRef.current) spectatorRef.current.update()

    if (ENABLE_DEBUG_MAP_OFFSET && controlsMode === 'spectator' && cameraRef.current) {
      useInstance.getState().setMapOffsetDebug({
        cameraOffset: roundOffset(
          cameraRef.current.position.x - bounds.defaultRtsCenter.x,
          cameraRef.current.position.y - bounds.defaultRtsCenter.y,
          cameraRef.current.position.z - bounds.defaultRtsCenter.z
        ),
      })
    }
  })

  return (
    <>
      <PerspectiveCamera
        ref={cameraRef}
        name="freeCamera"
        attach="camera"
        makeDefault
        {...settings.camera}
      />

      {controlsMode === 'spectator' && cameraRef.current && (
        // @ts-ignore
        <spectatorControls
          ref={spectatorRef}
          name="spectator"
          attach="controls"
          args={[cameraRef.current, gl.domElement]}
          lookSpeed={settings.controls.lookSpeed}
          moveSpeed={settings.controls.moveSpeed}
          onMoveSpeedChange={reportMoveSpeed}
        />
      )}
    </>
  )
}

const PerfProbe = ({ enabled }: { enabled: boolean }) => {
  const { gl } = useThree()

  useFrame(() => {
    if (!enabled) return

    useInstance.getState().setRuntimePerf({
      renderCalls: gl.info.render.calls,
      renderTriangles: gl.info.render.triangles,
    })
  })

  return null
}

const MapCenterMarker = () => {
  const center = useStore(state => state.scene.bounds.defaultRtsCenter)
  const pickerActive = useInstance(state => state.mapCenterPickerActive)

  return (
    <group position={[center.x, center.y, center.z + 3]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={20}>
        <torusGeometry args={[44, 5, 16, 64]} />
        <meshBasicMaterial
          color={MARKER_COLOR}
          transparent
          opacity={pickerActive ? 1 : 0.85}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      <mesh renderOrder={20}>
        <boxGeometry args={[54, 8, 4]} />
        <meshBasicMaterial
          color={MARKER_COLOR}
          transparent
          opacity={pickerActive ? 1 : 0.85}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      <mesh rotation={[0, 0, Math.PI / 2]} renderOrder={20}>
        <boxGeometry args={[54, 8, 4]} />
        <meshBasicMaterial
          color={MARKER_COLOR}
          transparent
          opacity={pickerActive ? 1 : 0.85}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// Double-tap seek overlay for mobile (YouTube-style)
const DOUBLE_TAP_SEEK_TICKS = 50
const DOUBLE_TAP_TIMEOUT = 300

const DoubleTapSeek = () => {
  const isMobile = useIsMobile()
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null)
  const [ripple, setRipple] = useState<{ side: 'left' | 'right'; key: number } | null>(null)

  const handleTap = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    // Only respond to single-finger taps
    if (e.touches.length > 1) return

    const touch = e.changedTouches[0]
    const rect = e.currentTarget.getBoundingClientRect()
    const side = touch.clientX < rect.left + rect.width / 2 ? 'left' : 'right'
    const now = Date.now()

    if (
      lastTapRef.current &&
      lastTapRef.current.side === side &&
      now - lastTapRef.current.time < DOUBLE_TAP_TIMEOUT
    ) {
      // Double tap detected
      e.preventDefault()
      if (side === 'right') {
        playbackJumpAction('seekForward')
      } else {
        playbackJumpAction('seekBackward')
      }
      setRipple({ side, key: now })
      lastTapRef.current = null
    } else {
      lastTapRef.current = { time: now, side }
    }
  }, [])

  if (!isMobile) return null

  return (
    <div
      className="ui-layer pointer-events-auto z-10"
      onTouchEnd={handleTap}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Ripple feedback */}
      {ripple && (
        <div
          className={cn(
            'absolute inset-y-0 flex items-center justify-center',
            ripple.side === 'left' ? 'left-0 w-1/2' : 'right-0 w-1/2'
          )}
        >
          <motion.div
            key={ripple.key}
            className="flex flex-col items-center gap-1 rounded-full bg-black/30 px-6 py-4"
            initial={{ opacity: 0.9, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.6 }}
          >
            <AiFillFastForwardIcon
              width="2rem"
              height="2rem"
              className={ripple.side === 'left' ? 'rotate-180' : ''}
            />
            <span className="text-sm font-bold">
              {ripple.side === 'left' ? '-' : '+'}
              {DOUBLE_TAP_SEEK_TICKS} ticks
            </span>
          </motion.div>
        </div>
      )}
    </div>
  )
}

// FocusedPlayer wrapper - adjusts positioning for mobile
const FocusedPlayerLayer = (props: { players: PlayerFrame[] }) => {
  const isMobile = useIsMobile()
  return (
    <div
      className={cn(
        'ui-layer items-end justify-center',
        isMobile ? 'bottom-[12vh]' : 'bottom-[20vh]'
      )}
    >
      <FocusedPlayer {...props} />
    </div>
  )
}

// Panel toolbar - functional component so we can use useIsMobile hook
const PanelToolbar = ({ hasSession }: { hasSession: boolean }) => {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="ui-layer m-3 items-start justify-start">
        <div className="flex items-center">
          <SettingsPanel />
          <AboutPanel />
          <SetupsPanel />
          {hasSession && <EventLogPanel />}
          {hasSession && <BookmarksPanel />}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="ui-layer m-4 items-start justify-start">
        <SettingsPanel />
      </div>

      <div className="ui-layer justift-start m-4 mt-16 items-start">
        <AboutPanel />
      </div>

      <div className="ui-layer justift-start m-4 mt-28 items-start">
        <SetupsPanel />
      </div>

      {hasSession && (
        <div className="ui-layer m-4 mt-40 items-start justify-start">
          <EventLogPanel />
        </div>
      )}

      {hasSession && (
        <div className="ui-layer m-4 mt-52 items-start justify-start">
          <BookmarksPanel />
        </div>
      )}
    </>
  )
}

// Notice shown while a map has no converted assets
const MapAssetsNotice = ({ map }: { map: string }) => {
  const available = useStore(state => state.scene.mapAssetsAvailable)
  const isMobile = useIsMobile()

  if (available !== false) return null

  return (
    <div
      className={cn(
        'ui-layer pointer-events-none items-start justify-center',
        isMobile ? 'mt-14' : 'mt-4'
      )}
    >
      <div className="rounded-lg bg-pp-panel/70 px-4 py-2 text-center text-xs">
        <span className="font-bold">{map}</span>
        <span className="opacity-70">
          {' '}
          has no converted map assets yet, showing recorded positions over a grid
        </span>
      </div>
    </div>
  )
}

//
// ─── COMPONENT ──────────────────────────────────────────────────────────────────
//
type DemoViewerProps = {
  session?: Portal2Session
  map: string
}

class DemoViewer extends Component<DemoViewerProps> {
  playbackSub = function () {}
  settingsSub = function () {}
  canvasRef = createRef<HTMLCanvasElement>()
  uiLayers = createRef<HTMLDivElement>()

  // Perf logging
  perfLoggingEnabled = isPerfLoggingEnabled()
  perfLogTimer = 0

  // Timing variables for animation loop
  elapsedTime = 0
  lastTimestamp = 0
  lastTouchPos = { x: 0, y: 0 }

  state = {
    playback: getState().playback,
    settings: getState().settings,
  }

  //
  // ─── LIFECYCLE ──────────────────────────────────────────────────────────────────
  //

  componentDidMount() {
    this.animate(0)

    // These zustand subscribers are necessary because useStore.getState doesn't
    // update correctly in React class components. Unfortunately I've decided to
    // keep this component as a class component instead of converting to a functional
    // component -- because it seems to be SUPER PAINFUL trying to get the animate()
    // requestAnimationFrame stuff working correctly as a functional component
    // (it ends up annihilating the fps and some other buggy behaviour)
    this.playbackSub = useStore.subscribe(state => this.setState({ playback: state.playback }))
    this.settingsSub = useStore.subscribe(state => this.setState({ settings: state.settings }))

    // Force tabIndex (r3f seems to ignore it if provided in props) as this is how
    // we can ensure separation of Global and Canvas-only keyboard events when certain
    // elements are in focus (e.g. when menu is open, we don't want to trigger Canvas events)
    // https://github.com/pmndrs/react-three-fiber/issues/1238
    this.canvasRef.current?.setAttribute('tabindex', '0')
  }

  componentWillUnmount() {
    this.playbackSub()
    this.settingsSub()
  }

  //
  // ─── ANIMATION LOOP ─────────────────────────────────────────────────────────────
  //

  animate = async (timestamp: number) => {
    const { playback } = this.state

    const intervalPerTick = playback.intervalPerTick || 1 / 60
    const millisPerTick = 1000 * intervalPerTick * (1 / playback.speed)
    const frameDelta = timestamp - this.lastTimestamp

    this.elapsedTime += frameDelta

    if (playback.playing) {
      if (this.elapsedTime >= millisPerTick) {
        const ticksToAdvance = Math.floor(this.elapsedTime / millisPerTick)
        this.elapsedTime -= ticksToAdvance * millisPerTick
        goToTickAction(playback.tick + ticksToAdvance)
      }
      useInstance.getState().setFrameProgress(Math.min(this.elapsedTime / millisPerTick, 0.999))
    } else {
      useInstance.getState().setFrameProgress(0)
      this.elapsedTime = 0
    }

    if (this.perfLoggingEnabled) {
      this.perfLogTimer += frameDelta
      if (this.perfLogTimer >= 5000) {
        this.perfLogTimer = 0
        const heapMb = readJsHeapMemoryMb()
        const { runtimePerf } = useInstance.getState()
        console.log(
          `[Perf] tick=${playback.tick}` +
            ` calls=${runtimePerf.renderCalls}` +
            ` triangles=${runtimePerf.renderTriangles}` +
            ` visibleChunks=${runtimePerf.visibleChunkCount}` +
            ` cluster=${runtimePerf.currentCluster ?? 'all'}` +
            (heapMb !== undefined ? ` heap=${heapMb.toFixed(1)}MB` : '')
        )
      }
    }

    this.lastTimestamp = timestamp

    requestAnimationFrame(this.animate)
  }

  onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    this.lastTouchPos = { x: event.clientX, y: event.clientY }
  }

  onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointerMoved =
      Math.abs(event.clientX - this.lastTouchPos.x) >= 10 ||
      Math.abs(event.clientY - this.lastTouchPos.y) >= 10

    if (useInstance.getState().mapCenterPickerActive) {
      if (pointerMoved) {
        return
      }

      const scene = useInstance.getState().threeScene
      const camera = (scene as THREE.Scene & { camera?: THREE.Camera }).camera
      const domElement = event.currentTarget.querySelector('canvas')

      if (!camera || !domElement) {
        return
      }

      const point = getWorldIntersectionFromScreen({
        camera,
        domElement,
        scene,
        screenX: event.clientX,
        screenY: event.clientY,
      })

      if (point) {
        setSceneRtsCenterAction({ x: point.x, y: point.y, z: point.z })
      }

      return
    }

    if (getState().drawing.stickerDrag.active) {
      return
    }

    if (getState().drawing.enabled && getState().drawing.tool === DrawingTool.STICKERS) {
      return
    }

    if (!pointerMoved) {
      forceShowPanelAction()
    }
  }

  //
  // ─── RENDER ─────────────────────────────────────────────────────────────────────
  //

  render() {
    const { playback, settings } = this.state
    const { session, map } = this.props
    const INTERP_DELAY_TICKS = 2
    const renderTick = Math.max(1, playback.tick - INTERP_DELAY_TICKS)
    // Cap Retina/high-density DPR so fill-rate does not erase later draw-call wins.
    const canvasDpr =
      typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.25)

    let playersThisTick: PlayerFrame[] = []
    let actorsThisTick: ActorProps[] = []
    let portalsThisTick: PortalFrame[] = []
    let highlightedPortals: Set<number> | undefined

    if (session) {
      playersThisTick = getPlayerFrames(session, renderTick)
      const playersNextTick = getPlayerFrames(session, renderTick + 1)
      actorsThisTick = playersThisTick.map(frame => ({
        frame,
        next: playersNextTick.find(candidate => candidate.slot === frame.slot) ?? null,
      }))

      if (settings.scene.showPortals) {
        portalsThisTick = getPortalFrames(session, renderTick)
        highlightedPortals = new Set<number>()
        for (const event of session.events) {
          if (event.row > renderTick) break
          if (
            event.type === 'portal_traversal' &&
            renderTick - event.row <= TRAVERSAL_HIGHLIGHT_ROWS
          ) {
            const entered = Number(event.data?.enteredPortal ?? -1)
            const exited = Number(event.data?.exitPortal ?? -1)
            if (entered >= 0) highlightedPortals.add(entered)
            if (exited >= 0) highlightedPortals.add(exited)
          }
        }
      }
    }

    return (
      <div className="relative h-full w-full overflow-hidden">
        <Canvas
          ref={this.canvasRef}
          id="main-canvas"
          gl={{ alpha: true }}
          dpr={canvasDpr}
          onContextMenu={e => e.preventDefault()}
          onPointerDown={this.onPointerDown}
          onPointerUp={this.onPointerUp}
        >
          {/* Base scene elements */}

          <Lights map={map} />
          <Controls />
          <PerfProbe enabled={this.perfLoggingEnabled} />
          <CanvasKeyHandler />

          {/* World Map */}

          <Suspense fallback={null}>
            <World map={map} mode={settings.scene.mode} />
          </Suspense>

          {ENABLE_DEBUG_MAP_OFFSET && <MapCenterMarker />}

          <Stickers />

          {/* Skybox */}

          {settings.ui.showSkybox && <Skybox map={map} skyName={session?.skyName ?? ''} />}

          {/* Bots */}

          <Suspense fallback={null}>
            <Selection>
              <Actors actors={actorsThisTick} />

              <EffectComposer enabled={settings.ui.playerOutlines} autoClear={false}>
                <Outline
                  blendFunction={BlendFunction.SCREEN}
                  visibleEdgeColor={0xffffff}
                  hiddenEdgeColor={0xffffff}
                  xRay={true}
                />
              </EffectComposer>
            </Selection>
          </Suspense>

          {/* Portals and test chamber elements */}

          {session && settings.scene.showPortals && (
            <Portals portals={portalsThisTick} highlighted={highlightedPortals} />
          )}

          {session && settings.scene.showPuzzleElements && (
            <PuzzleElements
              session={session}
              row={renderTick}
              showLasers={settings.scene.showLasers}
            />
          )}
        </Canvas>

        {/* Normal React (non-THREE.js) UI elements */}

        {settings.ui.showStats && <FpsCounter />}

        <div className="ui-layer pointer-events-none items-center justify-center">
          <Crosshair />
        </div>

        <div className="ui-layer pointer-events-none items-center justify-center">
          <MoveSpeedNotice />
        </div>

        <div className="ui-layers" ref={this.uiLayers}>
          <DoubleTapSeek />

          <MapAssetsNotice map={map} />

          <div className="ui-layer mb-4 items-end justify-center text-center">
            <PlaybackPanel />
          </div>

          <div className="ui-layer m-4 items-start justify-end">
            <div className="flex flex-col items-end gap-2">
              {ENABLE_DEBUG_MAP_OFFSET && <MapOffsetDebugPanel />}
              {session && <EventFeed session={session} tick={playback.tick} />}
            </div>
          </div>

          {session && (
            <div className="ui-layer m-4 items-end justify-start">
              <ChatHud session={session} tick={playback.tick} />
            </div>
          )}

          {playersThisTick.length > 0 && <FocusedPlayerLayer players={playersThisTick} />}

          <PanelToolbar hasSession={!!session} />
        </div>
      </div>
    )
  }
}

export { DemoViewer }

function vector3ToTuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function quaternionToTuple(quaternion: THREE.Quaternion): [number, number, number, number] {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w]
}
