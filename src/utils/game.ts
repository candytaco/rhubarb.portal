import { getAsset } from './misc'
import { MAP_SKYBOX_MAP } from '@constants/mappings'
import type { MapBoundaries } from '@utils/scene'

// Map assets live under public/models/maps/<map name>/; every co-op map maps to its own folder.

export const resolveMapFolderName = (loadedMapName: string): string => {
  return loadedMapName.toLowerCase()
}

interface MapModelTypes {
  overlay: string
  textured: string
}

export const getMapModelUrls = (loadedMapName: string): MapModelTypes | undefined => {
  if (!loadedMapName) return undefined
  const foldername = resolveMapFolderName(loadedMapName)
  return {
    overlay: getAsset(`/models/maps/${foldername}/overlay_compressed.glb`),
    textured: getAsset(`/models/maps/${foldername}/textured_compressed.glb`),
  }
}

export const getMapConversionUrl = (loadedMapName: string): string | undefined => {
  if (!loadedMapName) return undefined
  const foldername = resolveMapFolderName(loadedMapName)
  return getAsset(`/models/maps/${foldername}/conversion.json`)
}

export const getMapVisibilityUrl = (loadedMapName: string): string | undefined => {
  if (!loadedMapName) return undefined
  const foldername = resolveMapFolderName(loadedMapName)
  return getAsset(`/models/maps/${foldername}/visibility.json`)
}

interface MapSkyboxTypes {
  bk: string
  dn: string
  ft: string
  lf: string
  rt: string
  up: string
}

/**
 * World bounds from a map's conversion.json (derived from the BSP), or null when the map has no
 * converted assets
 */
export const fetchMapWorldBounds = async (
  loadedMapName: string
): Promise<Pick<MapBoundaries, 'boundaryMin' | 'boundaryMax'> | null> => {
  const conversionUrl = getMapConversionUrl(loadedMapName)
  if (!conversionUrl) return null

  try {
    const response = await fetch(conversionUrl)
    if (!response.ok) return null
    const meta = await response.json()
    if (meta?.worldBounds?.boundaryMin && meta?.worldBounds?.boundaryMax) {
      return meta.worldBounds
    }
    return null
  } catch {
    return null
  }
}

export const getMapSkyboxUrls = (loadedMapName: string): MapSkyboxTypes | undefined => {
  const skyboxname = MAP_SKYBOX_MAP[loadedMapName]
  if (!skyboxname) return undefined

  return {
    lf: getAsset(`/models/skybox/${skyboxname}/${skyboxname}_lf.png`),
    rt: getAsset(`/models/skybox/${skyboxname}/${skyboxname}_rt.png`),
    ft: getAsset(`/models/skybox/${skyboxname}/${skyboxname}_ft.png`),
    bk: getAsset(`/models/skybox/${skyboxname}/${skyboxname}_bk.png`),
    dn: getAsset(`/models/skybox/${skyboxname}/${skyboxname}_dn.png`),
    up: getAsset(`/models/skybox/${skyboxname}/${skyboxname}_up.png`),
  }
}
