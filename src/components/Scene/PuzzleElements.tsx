import { Suspense, useMemo } from 'react'

import * as THREE from 'three'
import { Line, useGLTF } from '@react-three/drei'

import type { Portal2Session } from '@components/Analyse/Data/Session'
import { EntityColumns, getEntityFrames, getPlayerFrames } from '@utils/session'
import { angleVectorsFromSourceAnglesDeg } from '@utils/geometry'
import { CUBE_SIZE, FLOOR_BUTTON_RADIUS } from '@constants/portal2'
import { getAsset } from '@utils/misc'

export interface PuzzleElementsProps {
  session: Portal2Session
  row: number
  showLasers: boolean
}

const CUBE_COLOR = '#d8d8d8'
const HELD_CUBE_COLOR = '#ffd66b'
// Every cube uses the standard cube model: the companion cube differs only by skin 1, which the
// model export does not carry.
const CUBE_MODEL_FILE = '/models/props/companion_cube.glb'
const BUTTON_IDLE_COLOR = '#8a8a8a'
const BUTTON_PRESSED_COLOR = '#4ade80'
const DOOR_COLOR = '#b0b0b0'
const LASER_COLOR = '#ff3b3b'
const BRIDGE_COLOR = '#9fd3ff'
const BRIDGE_WIDTH = 64

/**
 * Weighted cube model, tinted while a player holds it. Cube series carry no angles, so the model
 * keeps its spawn orientation with only the glTF Y-up to Source Z-up rotation applied.
 */
const CubeModel = ({ held }: { held: boolean }) => {
  const gltf = useGLTF(getAsset(CUBE_MODEL_FILE), true, false)

  const model = useMemo(() => {
    const scene = gltf.scene.clone(true)
    if (held) {
      scene.traverse(node => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const material = (mesh.material as THREE.MeshStandardMaterial).clone()
        material.emissive = new THREE.Color(HELD_CUBE_COLOR)
        material.emissiveIntensity = 0.4
        mesh.material = material
      })
    }
    return scene
  }, [gltf.scene, held])

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <primitive object={model} />
    </group>
  )
}

/** Untextured cube shown while the cube model is still loading */
const PlaceholderCube = ({ held }: { held: boolean }) => (
  <mesh>
    <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
    <meshStandardMaterial
      color={held ? HELD_CUBE_COLOR : CUBE_COLOR}
      emissive={held ? HELD_CUBE_COLOR : '#000000'}
      emissiveIntensity={held ? 0.4 : 0}
      roughness={0.6}
    />
  </mesh>
)

/**
 * Placement of one light bridge segment: a unit plane scaled to the segment length and width,
 * lying along the start-to-end line with the segment rotation's up vector as its normal.
 * @param values - The segment's BridgeDescriptor columns for the current row
 * @returns Centre, quaternion and scale for the plane, or null when the segment has no extent
 */
function bridgePlacement(values: Float32Array) {
  const columns = EntityColumns.bridge
  const start = new THREE.Vector3(
    values[columns.startX],
    values[columns.startY],
    values[columns.startZ]
  )
  const end = new THREE.Vector3(values[columns.endX], values[columns.endY], values[columns.endZ])
  if ([start.x, start.y, start.z, end.x, end.y, end.z].some(Number.isNaN)) return null

  const length = start.distanceTo(end)
  if (length < 1) return null

  const direction = end.clone().sub(start).divideScalar(length)
  const { up } = angleVectorsFromSourceAnglesDeg({
    pitch: values[columns.pitch] || 0,
    yaw: values[columns.yaw] || 0,
    roll: values[columns.roll] || 0,
  })
  // Width axis perpendicular to both the beam and its surface normal; a normal parallel to the
  // beam has no width axis, so any perpendicular direction serves
  const right = up.clone().cross(direction)
  if (right.lengthSq() < 1e-6) {
    right.set(0, 0, 1).cross(direction)
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0).cross(direction)
  }
  right.normalize()
  const normal = direction.clone().cross(right)

  const width = values[columns.width]
  return {
    center: start.clone().add(end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(direction, right, normal)
    ),
    scale: [length, Number.isNaN(width) ? BRIDGE_WIDTH : width, 1] as [number, number, number],
  }
}

/**
 * Weighted cubes, floor buttons, doors, lasers and light bridges at the current axis row, as
 * simple shapes
 */
export const PuzzleElements = ({ session, row, showLasers }: PuzzleElementsProps) => {
  const heldEntities = new Set(
    getPlayerFrames(session, row)
      .map(frame => frame.attachedObject)
      .filter((entity): entity is number => entity !== null)
  )

  const cubes = getEntityFrames(session, session.cubes, row)
  const buttons = getEntityFrames(session, session.floorButtons, row)
  const doors = getEntityFrames(session, session.doors, row)
  const lasers = showLasers ? getEntityFrames(session, session.lasers, row) : []
  const bridges = getEntityFrames(session, session.bridges, row)

  return (
    <group name="puzzleElements">
      {cubes.map(frame => {
        const held = heldEntities.has(frame.series.entityIndex)
        return (
          <group
            key={`cube-${frame.series.key}`}
            name="cube"
            position={[frame.position.x, frame.position.y, frame.position.z]}
            userData={{ entityIndex: frame.series.entityIndex }}
          >
            <Suspense fallback={<PlaceholderCube held={held} />}>
              <CubeModel held={held} />
            </Suspense>
          </group>
        )
      })}

      {buttons.map(frame => {
        const pressed = frame.values[EntityColumns.floorButton.buttonState] === 1
        return (
          <mesh
            key={`button-${frame.series.key}`}
            name="floorButton"
            position={[frame.position.x, frame.position.y, frame.position.z + (pressed ? 2 : 5)]}
            rotation={[Math.PI / 2, 0, 0]}
            userData={{ entityIndex: frame.series.entityIndex }}
          >
            <cylinderGeometry
              args={[FLOOR_BUTTON_RADIUS, FLOOR_BUTTON_RADIUS, pressed ? 4 : 10, 32]}
            />
            <meshStandardMaterial
              color={pressed ? BUTTON_PRESSED_COLOR : BUTTON_IDLE_COLOR}
              emissive={pressed ? BUTTON_PRESSED_COLOR : '#000000'}
              emissiveIntensity={pressed ? 0.5 : 0}
            />
          </mesh>
        )
      })}

      {doors.map(frame => {
        const yaw = frame.values[EntityColumns.door.yaw]
        return (
          <mesh
            key={`door-${frame.series.key}`}
            name="door"
            position={[frame.position.x, frame.position.y, frame.position.z + 64]}
            rotation={[0, 0, THREE.MathUtils.degToRad(Number.isNaN(yaw) ? 0 : yaw)]}
            userData={{ entityIndex: frame.series.entityIndex }}
          >
            <boxGeometry args={[8, 96, 128]} />
            <meshStandardMaterial color={DOOR_COLOR} transparent opacity={0.6} />
          </mesh>
        )
      })}

      {lasers.map(frame => {
        const on = frame.values[EntityColumns.laser.on] === 1
        const start = [
          frame.values[EntityColumns.laser.startX],
          frame.values[EntityColumns.laser.startY],
          frame.values[EntityColumns.laser.startZ],
        ]
        const end = [
          frame.values[EntityColumns.laser.endX],
          frame.values[EntityColumns.laser.endY],
          frame.values[EntityColumns.laser.endZ],
        ]
        if (!on || start.some(Number.isNaN) || end.some(Number.isNaN)) return null
        return (
          <Line
            key={`laser-${frame.series.key}`}
            name="laser"
            points={[start as [number, number, number], end as [number, number, number]]}
            color={LASER_COLOR}
            lineWidth={2}
            transparent
            opacity={0.9}
          />
        )
      })}

      {bridges.map(frame => {
        const placement = bridgePlacement(frame.values)
        if (!placement) return null
        return (
          <mesh
            key={`bridge-${frame.series.key}`}
            name="lightBridge"
            position={placement.center}
            quaternion={placement.quaternion}
            scale={placement.scale}
            userData={{ entityIndex: frame.series.entityIndex }}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              color={BRIDGE_COLOR}
              transparent
              opacity={0.35}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )
      })}
    </group>
  )
}
