import { useMemo } from 'react'

import * as THREE from 'three'

import type { PortalFrame } from '@utils/session'
import { angleVectorsFromSourceAnglesDeg } from '@utils/geometry'
import { PORTAL_HALF_HEIGHT, PORTAL_HALF_WIDTH } from '@constants/portal2'

export interface PortalsProps {
  portals: PortalFrame[]
  /** portal entity indices something went through recently, for a highlight */
  highlighted?: Set<number>
}

/**
 * The placed portals: an elliptical ring and a translucent surface at the placement origin,
 * oriented by the portal's absolute angles, coloured by the firing bot and portal number
 */
export const Portals = ({ portals, highlighted }: PortalsProps) => {
  return (
    <group name="portals">
      {portals.map(frame => (
        <Portal
          key={`portal-${frame.portal.slot}`}
          frame={frame}
          highlighted={highlighted?.has(frame.entityIndex) ?? false}
        />
      ))}
    </group>
  )
}

const Portal = ({ frame, highlighted }: { frame: PortalFrame; highlighted: boolean }) => {
  const quaternion = useMemo(
    () => portalQuaternion(frame.angles),
    [frame.angles.x, frame.angles.y, frame.angles.z]
  )

  if (!frame.activated) return null

  const scale = highlighted ? 1.12 : 1

  return (
    <group
      name="portal"
      position={[frame.position.x, frame.position.y, frame.position.z]}
      quaternion={quaternion}
      userData={{ entityIndex: frame.entityIndex, slot: frame.portal.slot }}
    >
      {/* the ring sits 1 unit off the wall to avoid z-fighting with the map */}
      <group
        position={[0, 0, 1]}
        scale={[PORTAL_HALF_WIDTH * scale, PORTAL_HALF_HEIGHT * scale, 1]}
      >
        <mesh renderOrder={5}>
          <torusGeometry args={[1, 0.07, 10, 64]} />
          <meshBasicMaterial color={frame.color} toneMapped={false} />
        </mesh>

        <mesh renderOrder={4}>
          <circleGeometry args={[0.95, 48]} />
          <meshBasicMaterial
            color={frame.color}
            transparent
            opacity={highlighted ? 0.55 : 0.3}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Orientation of a portal from its absolute angles: the ring lies in the plane spanned by the
 * right and up vectors and its local +Z points along the portal's forward (out of the wall)
 */
export function portalQuaternion(angles: { x: number; y: number; z: number }): THREE.Quaternion {
  const { forward, right, up } = angleVectorsFromSourceAnglesDeg({
    pitch: angles.x,
    yaw: angles.y,
    roll: angles.z,
  })
  const basis = new THREE.Matrix4().makeBasis(right, up, forward)
  return new THREE.Quaternion().setFromRotationMatrix(basis)
}
