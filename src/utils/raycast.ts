import * as THREE from 'three'

export function getWorldIntersectionFromScreen({
  camera,
  domElement,
  scene,
  screenX,
  screenY,
}: {
  camera: THREE.Camera
  domElement: HTMLCanvasElement
  scene: THREE.Scene
  screenX: number
  screenY: number
}): THREE.Vector3 | null {
  const rect = domElement.getBoundingClientRect()
  if (screenX < rect.left || screenX > rect.right || screenY < rect.top || screenY > rect.bottom) {
    return null
  }

  // the converted map, or the fallback ground shown while a map has no assets
  const targets = ['world', 'worldFallback']
    .map(name => scene.getObjectByName(name))
    .filter((object): object is THREE.Object3D => object !== undefined)
  if (targets.length === 0) return null

  const pointer = new THREE.Vector2(
    ((screenX - rect.left) / rect.width) * 2 - 1,
    -((screenY - rect.top) / rect.height) * 2 + 1
  )

  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(pointer, camera)

  const intersections = raycaster.intersectObjects(targets, true)
  const hit = intersections.find(intersection => intersection.object.visible)

  return hit ? hit.point.clone() : null
}
