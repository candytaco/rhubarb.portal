import * as THREE from 'three'
import { first, last } from 'lodash'

import { objCoordsToVector3 } from './geometry'

type VectorLike = { x: number; y: number; z: number }

export interface MapBoundaries {
  boundaryMin: VectorLike
  boundaryMax: VectorLike
  cameraOffset?: VectorLike
  rtsCenter?: VectorLike
}

export const DEFAULT_MAP_BOUNDARIES: MapBoundaries = {
  boundaryMin: { x: -1024, y: -1024, z: -256 },
  boundaryMax: { x: 1024, y: 1024, z: 512 },
}

/**
 * Get all Actors in the scene
 */
export function getSceneActors(scene: THREE.Scene): THREE.Object3D[] {
  const actors: THREE.Object3D[] = []

  scene.traverse(child => {
    if (child.name === 'actor') actors.push(child)
  })

  return actors
}

/**
 * Get a specific Actor in the scene
 */
export function getSceneActor(
  scene: THREE.Scene,
  position: 'first' | 'last'
): THREE.Object3D | undefined
export function getSceneActor(scene: THREE.Scene, entityId: number): THREE.Object3D | undefined
export function getSceneActor(scene: THREE.Scene, value: any): THREE.Object3D | undefined {
  if (typeof value === 'string') {
    switch (value) {
      case 'first':
        return first(getSceneActors(scene))

      case 'last':
        return last(getSceneActors(scene))
    }
  }

  if (typeof value === 'number') {
    return getSceneActors(scene).find(child => child.userData.entityId === value)
  }

  return undefined
}

/**
 * Scene bounds in raw Source coordinates. The scene is not translated: the map model and every
 * recorded position share the game's coordinate system.
 */
export function parseMapBoundaries(boundaries: MapBoundaries) {
  const min = objCoordsToVector3(boundaries.boundaryMin)
  const max = objCoordsToVector3(boundaries.boundaryMax)
  const center = min.clone().add(max).multiplyScalar(0.5)
  const extent = Math.max(max.x - min.x, max.y - min.y)
  const distance = THREE.MathUtils.clamp(extent * 0.6, 600, 3000)

  return {
    min,
    max,
    center,
    defaultCameraOffset: boundaries.cameraOffset
      ? objCoordsToVector3(boundaries.cameraOffset)
      : new THREE.Vector3(0, -distance, distance * 0.8),
    defaultRtsCenter: boundaries.rtsCenter ? objCoordsToVector3(boundaries.rtsCenter) : center,
  }
}

export function translatePointBetweenBoundaryMins(
  point: VectorLike,
  fromBoundaryMin?: VectorLike | null,
  toBoundaryMin?: VectorLike | null
) {
  if (!fromBoundaryMin || !toBoundaryMin) {
    return { x: point.x, y: point.y, z: point.z }
  }

  return {
    x: point.x + fromBoundaryMin.x - toBoundaryMin.x,
    y: point.y + fromBoundaryMin.y - toBoundaryMin.y,
    z: point.z + fromBoundaryMin.z - toBoundaryMin.z,
  }
}
