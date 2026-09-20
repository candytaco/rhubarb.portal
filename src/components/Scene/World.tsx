import { useRef, useState, useEffect } from 'react'

import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { GLTF, GLTFLoader } from 'three/examples/jsm/Addons.js'

import mapChunkingConfig from '@constants/mapChunking.json'
import { MapVisibilityMetadata } from '@constants/types'
import {
  addDownloadAction,
  removeDownloadAction,
  setMapAssetsAvailableAction,
  updateDownloadAction,
} from '@zus/actions'
import { getState, useInstance, useStore } from '@zus/store'
import { getMapModelUrls, getMapVisibilityUrl } from '@utils/game'
import {
  MAP_TUNNEL_END_MARGIN,
  MAP_TUNNEL_MAX_TARGETS,
  MAP_TUNNEL_RADIUS,
  PLAYER_HEIGHT,
} from '@constants/portal2'

const INVISIBLE_TOOL_MATERIALS = new Set([
  'toolsnodraw',
  'toolsclip',
  'toolsplayerclip',
  'toolsinvisible',
  'toolsinvisibleladder',
  'toolstrigger',
  'toolsareaportal',
  'toolsblockbullets',
  'toolshint',
  'toolsskip',
  'toolsfog',
  'toolsskybox',
])

// Entity prefixes that are game-logic helpers and should never be rendered.
// These may appear in older GLB files that were exported before the VMF filter
// was updated to strip them.
const INVISIBLE_NODE_PREFIXES = ['team_control_point']

function isInvisibleToolMaterial(materialName: string): boolean {
  const name = materialName.toLowerCase()
  const baseName = name.includes('/') ? name.split('/').pop()! : name
  return INVISIBLE_TOOL_MATERIALS.has(baseName)
}

function isInvisibleEntityNode(nodeName: string): boolean {
  const name = nodeName.toLowerCase()
  return INVISIBLE_NODE_PREFIXES.some(prefix => name.startsWith(prefix))
}

const MAP_WIREFRAME_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#333333',
  opacity: 0.1,
  transparent: true,
  wireframe: true,
})

const MAP_UNTEXTURED_MATERIAL = new THREE.MeshStandardMaterial({
  color: 'white',
})
const MAP_CHUNKING_ENABLED = mapChunkingConfig.enabled

// Uniforms shared by every map material, so one update per frame reaches all of them
const mapTunnelUniforms = {
  uTunnelCount: { value: 0 },
  uTunnelTargets: {
    value: Array.from({ length: MAP_TUNNEL_MAX_TARGETS }, () => new THREE.Vector3()),
  },
  uTunnelRadius: { value: MAP_TUNNEL_RADIUS },
  uTunnelEndMargin: { value: MAP_TUNNEL_END_MARGIN },
}

/**
 * Patch a map material so fragments inside a bot's view tunnel are discarded: within the tunnel
 * radius of the line from the camera to the bot, and nearer to the camera than the bot. The
 * camera position comes from the cameraPosition uniform three.js gives every material.
 * @param material - Map material to patch; patched once, later calls are no-ops
 */
function applyMapTunnel(material: THREE.Material) {
  if (material.userData.mapTunnel) return
  material.userData.mapTunnel = true

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, mapTunnelUniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTunnelWorldPosition;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTunnelWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTunnelWorldPosition;
uniform int uTunnelCount;
uniform vec3 uTunnelTargets[${MAP_TUNNEL_MAX_TARGETS}];
uniform float uTunnelRadius;
uniform float uTunnelEndMargin;`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
for (int tunnelIndex = 0; tunnelIndex < ${MAP_TUNNEL_MAX_TARGETS}; tunnelIndex++) {
  if (tunnelIndex >= uTunnelCount) break;
  vec3 tunnelVector = uTunnelTargets[tunnelIndex] - cameraPosition;
  float tunnelLength = length(tunnelVector);
  vec3 tunnelAxis = tunnelVector / tunnelLength;
  vec3 fromCamera = vTunnelWorldPosition - cameraPosition;
  float along = dot(fromCamera, tunnelAxis);
  if (along > 0.0 && along < tunnelLength - uTunnelEndMargin) {
    vec3 radial = fromCamera - tunnelAxis * along;
    if (dot(radial, radial) < uTunnelRadius * uTunnelRadius) discard;
  }
}`
      )
  }
  material.customProgramCacheKey = () => 'mapTunnel'
  material.needsUpdate = true
}

applyMapTunnel(MAP_WIREFRAME_MATERIAL)
applyMapTunnel(MAP_UNTEXTURED_MATERIAL)

export interface WorldProps {
  map: string
  mode?: 'textured' | 'untextured' | 'wireframe'
}

export const World = (props: WorldProps) => {
  const ref = useRef<THREE.Group>(null)
  const cameraWorldPositionRef = useRef(new THREE.Vector3())
  const chunkRootsByNameRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const visibilityCullingEnabledRef = useRef(false)
  const currentClusterRef = useRef<number | null>(null)
  const mapLoadRequestIdRef = useRef(0)
  const visibilityRequestIdRef = useRef(0)
  const [mapModel, setMapModel] = useState<THREE.Group | null>()
  const [mapOverlay, setMapOverlay] = useState<THREE.Group | null>()
  const [mapVisibility, setMapVisibility] = useState<MapVisibilityMetadata | null>(null)
  const { map, mode } = props

  const bounds = useStore(state => state.scene.bounds)
  const mapAssetsAvailable = useStore(state => state.scene.mapAssetsAvailable)
  const showMapTunnels = useStore(state => state.settings.ui.showMapTunnels)

  // Briefly ensure the map is cleared when the map changes
  // to prevent lingering of the previous map
  useEffect(() => {
    setMapModel(null)
    setMapOverlay(null)
    useInstance.getState().setReadyMapModel(null)
    chunkRootsByNameRef.current = new Map()
    visibilityCullingEnabledRef.current = false
    currentClusterRef.current = null
    useInstance.getState().setRuntimePerf({
      visibleChunkCount: 0,
      currentCluster: null,
    })
    setMapVisibility(null)
  }, [map])

  useEffect(() => {
    if (!MAP_CHUNKING_ENABLED) {
      setMapVisibility(null)
      return
    }

    const visibilityUrl = getMapVisibilityUrl(map)
    if (!visibilityUrl) {
      setMapVisibility(null)
      return
    }

    const requestId = ++visibilityRequestIdRef.current

    fetch(visibilityUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load visibility metadata: ${response.status}`)
        }
        return response.json()
      })
      .then(data => {
        if (requestId !== visibilityRequestIdRef.current) return
        setMapVisibility(isMapVisibilityMetadata(data) ? data : null)
      })
      .catch(() => {
        if (requestId === visibilityRequestIdRef.current) {
          setMapVisibility(null)
        }
      })

    return () => {
      if (visibilityRequestIdRef.current === requestId) {
        visibilityRequestIdRef.current += 1
      }
    }
  }, [map])

  useEffect(() => {
    const requestId = ++mapLoadRequestIdRef.current

    // Maps without converted assets (see specs/portal2-coop-replacement.md section 5) render the
    // fallback grid instead of downloading a model that does not exist
    if (mapAssetsAvailable === false) {
      // nothing to download, so the scene is as ready as it will get
      useInstance.getState().setReadyMapModel(map)
      return
    }

    const mapModelFileUrls = getMapModelUrls(map)

    if (!mapModelFileUrls) {
      setMapAssetsAvailableAction(false)
      return
    }

    loadGLTF(mapModelFileUrls.textured, `${map} (textured)`)
      .then(gltf => {
        if (requestId === mapLoadRequestIdRef.current && gltf && gltf.scene) {
          setMapModel(gltf.scene)
          setMapAssetsAvailableAction(true)
          useInstance.getState().setReadyMapModel(map)
        }
      })
      .catch(error => {
        if (requestId !== mapLoadRequestIdRef.current) return
        console.warn(`No converted map assets for ${map}, showing the fallback grid`, error)
        setMapAssetsAvailableAction(false)
      })

    return () => {
      if (mapLoadRequestIdRef.current === requestId) {
        mapLoadRequestIdRef.current += 1
      }
    }
  }, [map, mode, mapAssetsAvailable])

  useEffect(() => {
    if (!mapModel || !MAP_CHUNKING_ENABLED) {
      chunkRootsByNameRef.current = new Map()
      visibilityCullingEnabledRef.current = false
      currentClusterRef.current = null
      useInstance.getState().setRuntimePerf({
        visibleChunkCount: 0,
        currentCluster: null,
      })
      return
    }

    const chunkRootsByName = collectChunkRoots(mapModel)
    chunkRootsByNameRef.current = chunkRootsByName
    currentClusterRef.current = null
    setChunkRootVisibility(chunkRootsByName, true)
    useInstance.getState().setRuntimePerf({
      visibleChunkCount: chunkRootsByName.size,
      currentCluster: null,
    })

    if (!mapVisibility) {
      visibilityCullingEnabledRef.current = false
      return
    }

    const missingChunkNames = mapVisibility.chunkNames.filter(
      chunkName => !chunkRootsByName.has(chunkName)
    )

    if (missingChunkNames.length > 0) {
      visibilityCullingEnabledRef.current = false
      setChunkRootVisibility(chunkRootsByName, true)
      console.warn(
        `Visibility culling disabled for ${map}: missing chunk roots ${missingChunkNames.join(', ')}`
      )
      return
    }

    visibilityCullingEnabledRef.current = true
  }, [map, mapModel, mapVisibility])

  useFrame(state => {
    const chunkRootsByName = chunkRootsByNameRef.current
    if (chunkRootsByName.size === 0) return

    if (!visibilityCullingEnabledRef.current || !mapVisibility || !ref.current) {
      if (currentClusterRef.current !== null) {
        setChunkRootVisibility(chunkRootsByName, true)
        currentClusterRef.current = null
        useInstance.getState().setRuntimePerf({
          visibleChunkCount: chunkRootsByName.size,
          currentCluster: null,
        })
      }
      return
    }

    const cameraWorldPosition = state.camera.getWorldPosition(cameraWorldPositionRef.current)
    const currentCluster = getClusterIndexForWorldPoint(
      cameraWorldPosition,
      ref.current,
      mapVisibility
    )

    if (currentCluster < 0) {
      if (currentClusterRef.current !== -1) {
        setChunkRootVisibility(chunkRootsByName, true)
        currentClusterRef.current = -1
        useInstance.getState().setRuntimePerf({
          visibleChunkCount: chunkRootsByName.size,
          currentCluster: -1,
        })
      }
      return
    }

    if (currentCluster === currentClusterRef.current) {
      return
    }

    const visibleChunkIndices = mapVisibility.visibleChunksByCluster[currentCluster]
    if (!Array.isArray(visibleChunkIndices) || visibleChunkIndices.length === 0) {
      setChunkRootVisibility(chunkRootsByName, true)
      currentClusterRef.current = -1
      useInstance.getState().setRuntimePerf({
        visibleChunkCount: chunkRootsByName.size,
        currentCluster: -1,
      })
      return
    }

    setChunkVisibilityForCluster(chunkRootsByName, mapVisibility.chunkNames, visibleChunkIndices)
    currentClusterRef.current = currentCluster
    useInstance.getState().setRuntimePerf({
      visibleChunkCount: visibleChunkIndices.length,
      currentCluster,
    })
  })

  // Aim each bot's view tunnel every frame; the tunnel ends at the bot's chest height
  useFrame(state => {
    if (!showMapTunnels) {
      mapTunnelUniforms.uTunnelCount.value = 0
      return
    }

    const actorsGroup = state.scene.getObjectByName('actors')
    const actors = actorsGroup ? actorsGroup.children.filter(child => child.name === 'actor') : []
    let count = 0

    for (const actor of actors) {
      if (count >= MAP_TUNNEL_MAX_TARGETS) break

      const target = mapTunnelUniforms.uTunnelTargets.value[count]
      actor.getWorldPosition(target)
      target.z += PLAYER_HEIGHT * 0.5
      count++
    }

    mapTunnelUniforms.uTunnelCount.value = count
  })

  // Update map overlay materials
  useEffect(() => {
    if (mapOverlay) {
      mapOverlay.traverse((child: THREE.Object3D) => {
        traverseMaterials(child, (material: any) => {
          applyMapTunnel(material)
          // if (material.map) material.map.encoding = THREE.sRGBEncoding
          // if (material.emissiveMap) material.emissiveMap.encoding = THREE.sRGBEncoding
          material.depthWrite = true
          material.needsUpdate = true

          material.polygonOffset = true
          material.polygonOffsetUnits = 1
          material.polygonOffsetFactor = -10
          material.vertexColors = false
        })
      })
    }
  }, [mapOverlay, mode])

  useEffect(() => {
    if (mapModel) {
      freezeStaticMapSubtree(mapModel)
    }

    if (mapOverlay) {
      freezeStaticMapSubtree(mapOverlay)
    }
  }, [mapModel, mapOverlay])

  // Update map model materials
  useEffect(() => {
    if (mapModel) {
      mapModel.traverse((child: THREE.Object3D) => {
        // Hide invisible game-logic entity nodes (e.g. team_control_point brushes)
        if (isInvisibleEntityNode(child.name)) {
          child.visible = false
          return
        }

        traverseMaterials(child, (material: any, node: any) => {
          // Hide invisible tool materials (nodraw, clip, trigger, etc.)
          if (isInvisibleToolMaterial(material.name)) {
            node.visible = false
            return
          }

          applyMapTunnel(material)

          // if (material.map) material.map.encoding = THREE.sRGBEncoding
          // if (material.emissiveMap) material.emissiveMap.encoding = THREE.sRGBEncoding
          material.depthWrite = true
          material.vertexColors = false
          material.needsUpdate = true

          if (mode === 'untextured') {
            node.material = MAP_UNTEXTURED_MATERIAL
          }

          if (mode === 'wireframe') {
            node.material = MAP_WIREFRAME_MATERIAL
          }
        })
      })
    }
  }, [mapModel, mode])

  // The scene uses raw game coordinates, so the converted map sits at the origin; only the glTF
  // Y-up to Source Z-up rotation applies
  return (
    <>
      <group ref={ref} name="world" rotation={[Math.PI / 2, 0, 0]}>
        {mapModel ? <primitive object={mapModel} /> : null}
        {mapOverlay ? <primitive object={mapOverlay} /> : null}
      </group>

      {mapAssetsAvailable === false && <FallbackGround bounds={bounds} />}
    </>
  )
}

const FALLBACK_GRID_COLOR = '#3a3f4a'
const FALLBACK_BOUNDS_COLOR = '#5a6170'

/**
 * Ground grid and bounds box shown while a map has no converted assets, sized to the recorded
 * positions. The ground plane is raycastable so stickers and the RTS centre picker still work.
 */
const FallbackGround = ({
  bounds,
}: {
  bounds: { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3 }
}) => {
  const sizeX = Math.max(bounds.max.x - bounds.min.x, 512)
  const sizeY = Math.max(bounds.max.y - bounds.min.y, 512)
  const sizeZ = Math.max(bounds.max.z - bounds.min.z, 128)
  const extent = Math.max(sizeX, sizeY)
  const divisions = Math.max(4, Math.round(extent / 128))
  const groundZ = bounds.min.z

  return (
    <group name="worldFallback">
      <gridHelper
        args={[extent, divisions, FALLBACK_BOUNDS_COLOR, FALLBACK_GRID_COLOR]}
        position={[bounds.center.x, bounds.center.y, groundZ]}
        rotation={[Math.PI / 2, 0, 0]}
      />

      <mesh position={[bounds.center.x, bounds.center.y, groundZ - 0.5]} receiveShadow>
        <planeGeometry args={[extent, extent]} />
        <meshStandardMaterial color="#1b1e25" transparent opacity={0.85} />
      </mesh>

      <mesh position={[bounds.center.x, bounds.center.y, groundZ + sizeZ * 0.5]}>
        <boxGeometry args={[sizeX, sizeY, sizeZ]} />
        <meshBasicMaterial color={FALLBACK_BOUNDS_COLOR} wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

function isMapVisibilityMetadata(data: unknown): data is MapVisibilityMetadata {
  if (!data || typeof data !== 'object') return false

  const candidate = data as Record<string, unknown>
  return (
    candidate.version === 2 &&
    candidate.transform === 'gltf-to-source:x,-z,y' &&
    Array.isArray(candidate.chunkNames) &&
    Array.isArray(candidate.chunkBounds) &&
    Array.isArray(candidate.planes) &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.leafClusters) &&
    Array.isArray(candidate.visibleChunksByCluster)
  )
}

function collectChunkRoots(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const chunkRootsByName = new Map<string, THREE.Object3D>()

  root.traverse(node => {
    if (/^chunk_\d+_\d+$/.test(node.name)) {
      chunkRootsByName.set(node.name, node)
    }
  })

  return chunkRootsByName
}

function setChunkRootVisibility(chunkRootsByName: Map<string, THREE.Object3D>, visible: boolean) {
  chunkRootsByName.forEach(chunkRoot => {
    chunkRoot.visible = visible
  })
}

function setChunkVisibilityForCluster(
  chunkRootsByName: Map<string, THREE.Object3D>,
  chunkNames: string[],
  visibleChunkIndices: number[]
) {
  const visibleChunkIndexSet = new Set(visibleChunkIndices)

  chunkNames.forEach((chunkName, chunkIndex) => {
    const chunkRoot = chunkRootsByName.get(chunkName)
    if (!chunkRoot) return
    chunkRoot.visible = visibleChunkIndexSet.has(chunkIndex)
  })
}

function freezeStaticMapSubtree(root: THREE.Object3D) {
  root.traverse(node => {
    node.matrixAutoUpdate = false

    if (node.type !== 'Mesh') return

    const mesh = node as THREE.Mesh
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox()
    }
    if (!mesh.geometry.boundingSphere) {
      mesh.geometry.computeBoundingSphere()
    }
    mesh.frustumCulled = true
  })

  root.updateMatrixWorld(true)
}

function getMapLocalPoint(
  worldPoint: THREE.Vector3,
  mapRoot: THREE.Object3D
): THREE.Vector3 | null {
  mapRoot.updateWorldMatrix(true, false)

  const inverseWorldMatrix = new THREE.Matrix4().copy(mapRoot.matrixWorld)
  if (inverseWorldMatrix.determinant() === 0) {
    return null
  }

  return worldPoint.clone().applyMatrix4(inverseWorldMatrix.invert())
}

function convertGltfPointToSource(point: THREE.Vector3): [number, number, number] {
  return [point.x, -point.z, point.y]
}

function getLeafIndexForSourcePoint(
  sourcePoint: [number, number, number],
  metadata: MapVisibilityMetadata
): number {
  let nodeIndex = 0

  while (Number.isInteger(nodeIndex) && nodeIndex >= 0) {
    if (nodeIndex >= metadata.nodes.length) return -1

    const [planeIndex, frontChild, backChild] = metadata.nodes[nodeIndex]
    const plane = metadata.planes[planeIndex]
    if (!plane) return -1

    const distance =
      sourcePoint[0] * plane[0] + sourcePoint[1] * plane[1] + sourcePoint[2] * plane[2] - plane[3]
    nodeIndex = distance >= 0 ? frontChild : backChild
  }

  const leafIndex = -nodeIndex - 1
  return leafIndex >= 0 && leafIndex < metadata.leafClusters.length ? leafIndex : -1
}

function getClusterIndexForLeaf(leafIndex: number, metadata: MapVisibilityMetadata): number {
  if (leafIndex < 0 || leafIndex >= metadata.leafClusters.length) {
    return -1
  }

  const clusterIndex = metadata.leafClusters[leafIndex]
  return Number.isInteger(clusterIndex) && clusterIndex >= 0 ? clusterIndex : -1
}

function getClusterIndexForWorldPoint(
  worldPoint: THREE.Vector3,
  mapRoot: THREE.Object3D | null,
  metadata: MapVisibilityMetadata | null
): number {
  if (!mapRoot || !metadata) {
    return -1
  }

  const mapLocalPoint = getMapLocalPoint(worldPoint, mapRoot)
  if (!mapLocalPoint) {
    return -1
  }

  const leafIndex = getLeafIndexForSourcePoint(convertGltfPointToSource(mapLocalPoint), metadata)
  return getClusterIndexForLeaf(leafIndex, metadata)
}

//
// ─── HELPERS ────────────────────────────────────────────────────────────────────
//

// Useful resource: https://github.com/donmccurdy/three-gltf-viewer/blob/master/src/viewer.js

function loadGLTF(url: string, name?: string) {
  return new Promise<GLTF>((resolve, reject) => {
    try {
      const gltfLoader = new GLTFLoader().setCrossOrigin('anonymous')

      const onLoad = (gltf: GLTF) => {
        resolve(gltf)
      }

      const onProgress = (xhr: ProgressEvent) => {
        // TODO: The lengthComputable seems to be false after being deployed to
        // Netlify. This may be due to some content headers needing to be set:
        // https://community.netlify.com/t/progressevent-total-is-0-for-asset-on-deployed-site-but-works-in-local-environment/3747

        const fileDownload = getState().downloads.get(url)
        if (!fileDownload) addDownloadAction({ type: 'map', name: name ?? url, url: url })

        if (xhr.lengthComputable) {
          const percentComplete = (xhr.loaded / xhr.total) * 100
          updateDownloadAction(url, { progress: percentComplete, size: xhr.total })
        }
      }

      const onError = (error: unknown) => {
        removeDownloadAction(url)
        reject(error)
      }

      gltfLoader.load(url, onLoad, onProgress, onError)
    } catch (error) {
      console.error(error)
      reject(error)
    }
  })
}

function traverseMaterials(
  object: THREE.Object3D,
  callback: (material: THREE.Material, node: THREE.Object3D) => void
) {
  object.traverse((node: THREE.Object3D) => {
    if (node.type === 'Mesh') {
      const m = node as THREE.Mesh
      const materials = Array.isArray(m.material) ? m.material : [m.material]

      materials.forEach((material: THREE.Material) => callback(material, node))
    }
  })
}
