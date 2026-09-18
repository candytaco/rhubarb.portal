import * as THREE from 'three'
import { Line } from '@react-three/drei'

import type { Portal2Session } from '@components/Analyse/Data/Session'
import { EntityColumns, getEntityFrames, getPlayerFrames } from '@utils/session'
import { CUBE_SIZE, FLOOR_BUTTON_RADIUS } from '@constants/portal2'

export interface PuzzleElementsProps {
  session: Portal2Session
  row: number
  showLasers: boolean
}

const CUBE_COLOR = '#d8d8d8'
const HELD_CUBE_COLOR = '#ffd66b'
const BUTTON_IDLE_COLOR = '#8a8a8a'
const BUTTON_PRESSED_COLOR = '#4ade80'
const DOOR_COLOR = '#b0b0b0'
const LASER_COLOR = '#ff3b3b'

/**
 * Weighted cubes, floor buttons, doors and lasers at the current axis row, as simple shapes
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

  return (
    <group name="puzzleElements">
      {cubes.map(frame => {
        const held = heldEntities.has(frame.series.entityIndex)
        return (
          <mesh
            key={`cube-${frame.series.key}`}
            name="cube"
            position={[frame.position.x, frame.position.y, frame.position.z]}
            userData={{ entityIndex: frame.series.entityIndex }}
          >
            <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
            <meshStandardMaterial
              color={held ? HELD_CUBE_COLOR : CUBE_COLOR}
              emissive={held ? HELD_CUBE_COLOR : '#000000'}
              emissiveIntensity={held ? 0.4 : 0}
              roughness={0.6}
            />
          </mesh>
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
    </group>
  )
}
