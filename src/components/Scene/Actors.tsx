import { useRef, useEffect, Suspense } from 'react'

import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Select } from '@react-three/postprocessing'
import { Html, useGLTF, Clone } from '@react-three/drei'

import { Nameplate } from '@components/Scene/Nameplate'
import type { PlayerFrame, Vector } from '@utils/session'

import { useInstance, useStore } from '@zus/store'
import {
  BOT_MODEL_FILES,
  EYE_HEIGHT_STANDING,
  PLAYER_ROLE_NAMES,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_ROLE_COLORS,
  type PlayerRole,
} from '@constants/portal2'
import {
  objCoordsToVector3,
  cameraQuaternionFromSourceAnglesDeg,
  yawQuaternionFromDegrees,
  smoothingAlpha,
  createStaleFrameGuard,
  guardedLerpProgress,
} from '@utils/geometry'
import { getAsset } from '@utils/misc'

// Bot collision hull, for camera framing and nameplates
export const ActorDimensions = new THREE.Vector3(
  PLAYER_RADIUS * 2,
  PLAYER_RADIUS * 2,
  PLAYER_HEIGHT
)

const RENDER_POSITION_SMOOTH_SECONDS = 0.04
const RENDER_ROTATION_SMOOTH_SECONDS = 0.03
const TELEPORT_LERP_DISTANCE = 512

//
// ─── PLAYER MODEL ───────────────────────────────────────────────────────────────
//

export interface PlayerModelProps {
  role: PlayerRole
  visible?: boolean
}

/**
 * glTF bot model when one is available under public/models/players, otherwise a placeholder
 * capsule in the role colour. The cloud environment cannot export the bot models, see
 * specs/portal2-coop-replacement.md section 5.
 */
export const PlayerModel = (props: PlayerModelProps) => {
  const modelFile = BOT_MODEL_FILES[props.role]

  if (modelFile) {
    return (
      <Suspense fallback={<PlaceholderBot role={props.role} visible={props.visible} />}>
        <GltfBot url={getAsset(modelFile)} visible={props.visible} />
      </Suspense>
    )
  }

  return <PlaceholderBot role={props.role} visible={props.visible} />
}

const GltfBot = ({ url, visible }: { url: string; visible?: boolean }) => {
  const gltf = useGLTF(url, true, false)

  return (
    <group visible={visible} rotation={[Math.PI * 0.5, Math.PI * 0.5, 0]}>
      <Select enabled={!!gltf.scene}>
        <Clone object={gltf.scene} />
      </Select>
    </group>
  )
}

const PlaceholderBot = ({ role, visible }: { role: PlayerRole; visible?: boolean }) => {
  const color = PLAYER_ROLE_COLORS[role]
  const bodyLength = PLAYER_HEIGHT - PLAYER_RADIUS * 2 - 12

  return (
    <group visible={visible}>
      <Select enabled>
        {/* body capsule, standing along Z */}
        <mesh
          position={[0, 0, PLAYER_RADIUS + bodyLength * 0.5]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[PLAYER_RADIUS, bodyLength, 6, 16]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
        </mesh>

        {/* head */}
        <mesh position={[0, 0, PLAYER_HEIGHT - 8]}>
          <sphereGeometry args={[10, 16, 12]} />
          <meshStandardMaterial color="#e8e8e8" roughness={0.4} metalness={0.3} />
        </mesh>

        {/* optic, facing the body yaw (+X is Source forward) */}
        <mesh position={[9, 0, PLAYER_HEIGHT - 8]}>
          <sphereGeometry args={[4.5, 12, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
      </Select>
    </group>
  )
}

// ─── ACTORS ──────────────────────────────────────────────────────────────────

export interface ActorsProps {
  actors: ActorProps[]
}

export const Actors = (props: ActorsProps) => {
  const { actors = [] } = props

  return (
    <group name="actors">
      {actors.map(actor => (
        <Actor key={`actor-${actor.frame.slot}`} {...actor} />
      ))}
    </group>
  )
}

//
// ─── ACTOR ──────────────────────────────────────────────────────────────────────
//

export interface ActorProps {
  frame: PlayerFrame
  next: PlayerFrame | null
}

const ZERO: Vector = { x: 0, y: 0, z: 0 }

export const Actor = ({ frame, next }: ActorProps) => {
  const actorRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const playerAimRef = useRef<THREE.Group>(null)
  const lerpedPosition = useRef(new THREE.Vector3())
  const hasPositionInit = useRef(false)
  const staleGuard = useRef(createStaleFrameGuard(frame.position ?? ZERO))

  const playback = useStore(state => state.playback)
  const settings = useStore(state => state.settings)
  const focusedObject = useInstance(state => state.focusedObject)

  const { player, health, alive } = frame
  const isFocusedPOV = focusedObject?.userData?.entityId === player.entityIndex
  const reported = frame.position !== null

  const position = frame.position ?? ZERO
  const positionNext = next?.position ?? position
  const eye = frame.eyePosition ?? {
    x: position.x,
    y: position.y,
    z: position.z + EYE_HEIGHT_STANDING,
  }
  const eyeNext = next?.eyePosition ?? eye
  const viewAngles = frame.viewAngles
  const viewAnglesNext = next?.viewAngles ?? viewAngles

  const positionVec3 = objCoordsToVector3(position)
  const positionNextVec3 = objCoordsToVector3(positionNext)

  useFrame((_, delta) => {
    if (!actorRef.current || !bodyRef.current || !playerAimRef.current) return

    // Actor group is position-only; rotations are applied to children.
    actorRef.current.quaternion.identity()

    const frameProgress = useInstance.getState().frameProgress

    const setAim = (progress: number) => {
      const eyeOffset = new THREE.Vector3(
        eye.x - position.x + (eyeNext.x - positionNext.x - (eye.x - position.x)) * progress,
        eye.y - position.y + (eyeNext.y - positionNext.y - (eye.y - position.y)) * progress,
        eye.z - position.z + (eyeNext.z - positionNext.z - (eye.z - position.z)) * progress
      )
      playerAimRef.current!.position.copy(eyeOffset)
    }

    // Skip interpolation when disabled or paused
    if (settings.scene.interpolateFrames === false || playback.playing === false) {
      actorRef.current.position.set(position.x, position.y, position.z)
      hasPositionInit.current = true
      bodyRef.current.quaternion.copy(yawQuaternionFromDegrees(viewAngles.y))
      setAim(0)
      playerAimRef.current.quaternion.copy(
        cameraQuaternionFromSourceAnglesDeg({
          pitch: viewAngles.x,
          yaw: viewAngles.y,
          roll: viewAngles.z,
        })
      )
      guardedLerpProgress(staleGuard.current, frameProgress, position, false)
      return
    }

    const lerpProgress = guardedLerpProgress(
      staleGuard.current,
      frameProgress,
      position,
      playback.playing
    )
    const didTeleport = positionVec3.distanceTo(positionNextVec3) > TELEPORT_LERP_DISTANCE
    const wasInitialized = hasPositionInit.current
    const positionBlend = smoothingAlpha(delta, RENDER_POSITION_SMOOTH_SECONDS)
    const rotationBlend = smoothingAlpha(delta, RENDER_ROTATION_SMOOTH_SECONDS)

    // Position interpolation
    if (didTeleport) {
      lerpedPosition.current.copy(positionVec3)
    } else {
      lerpedPosition.current.copy(positionVec3).lerp(positionNextVec3, lerpProgress)
    }

    if (didTeleport || !wasInitialized) {
      actorRef.current.position.copy(lerpedPosition.current)
    } else {
      actorRef.current.position.lerp(lerpedPosition.current, positionBlend)
    }
    hasPositionInit.current = true
    setAim(didTeleport ? 0 : lerpProgress)

    // Body: yaw-only quaternion
    const bodyTarget = yawQuaternionFromDegrees(viewAngles.y)
      .clone()
      .slerp(yawQuaternionFromDegrees(viewAnglesNext.y), lerpProgress)
    if (didTeleport || !wasInitialized) {
      bodyRef.current.quaternion.copy(bodyTarget)
    } else {
      bodyRef.current.quaternion.slerp(bodyTarget, rotationBlend)
    }

    // Aim/camera: full view angles including the roll through portals
    const camTarget = cameraQuaternionFromSourceAnglesDeg({
      pitch: viewAngles.x,
      yaw: viewAngles.y,
      roll: viewAngles.z,
    })
      .clone()
      .slerp(
        cameraQuaternionFromSourceAnglesDeg({
          pitch: viewAnglesNext.x,
          yaw: viewAnglesNext.y,
          roll: viewAnglesNext.z,
        }),
        lerpProgress
      )
    if (didTeleport || !wasInitialized) {
      playerAimRef.current.quaternion.copy(camTarget)
    } else {
      playerAimRef.current.quaternion.slerp(camTarget, rotationBlend)
    }
  })

  return (
    <group
      name="actor"
      ref={actorRef}
      visible={reported}
      userData={{
        slot: player.slot,
        entityId: player.entityIndex,
        name: player.name,
        role: player.role,
      }}
    >
      {/* Bot model */}

      <group name="playerBody" ref={bodyRef}>
        <PlayerModel visible={alive && !isFocusedPOV} role={player.role} />
      </group>

      {/* Eye: POV camera */}

      <group ref={playerAimRef} name="playerAim" position={[0, 0, EYE_HEIGHT_STANDING]}>
        <POVCamera />
      </group>

      {/* Nameplate */}

      {settings.ui.nameplate.enabled && !isFocusedPOV && (
        <Html
          name="html"
          className="pointer-events-none select-none"
          style={{ bottom: 0, transform: 'translateX(-50%)', textAlign: 'center' }}
          position={[0, 0, PLAYER_HEIGHT * 0.95]}
        >
          {alive && reported && (
            <Nameplate
              name={PLAYER_ROLE_NAMES[player.role]}
              role={player.role}
              health={health}
              settings={settings.ui.nameplate}
            />
          )}
        </Html>
      )}
    </group>
  )
}

export const POVCamera = () => {
  const ref = useRef<THREE.PerspectiveCamera>(null)

  const settings = useStore(state => state.settings)
  const size = useThree(state => state.size)

  useEffect(() => {
    if (!ref.current) return
    ref.current.aspect = size.width / Math.max(size.height, 1)
    ref.current.updateProjectionMatrix()
  }, [settings, size])

  return (
    <perspectiveCamera
      name="povCamera"
      ref={ref}
      {...settings?.camera}
      position={[0, 0, 0]}
      rotation={[0, 0, 0]}
    />
  )
}
