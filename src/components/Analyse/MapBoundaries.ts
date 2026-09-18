import { MapBoundaries } from '@utils/scene'

/**
 * Per-map camera overrides: a default RTS orbit centre and camera offset, in raw Source
 * coordinates. Session bounds supply everything else. No co-op map has an entry yet; add one
 * once a map has assets and a preferred overview camera.
 */
export const OVERWRITE_MAP_BOUNDARIES: { [mapName: string]: Partial<MapBoundaries> } = {}

export function getMapBoundariesKey(map: string): string | null {
  return OVERWRITE_MAP_BOUNDARIES[map] ? map : null
}

export function getMapBoundaries(map: string): Partial<MapBoundaries> | null {
  const key = getMapBoundariesKey(map)
  return key ? OVERWRITE_MAP_BOUNDARIES[key] : null
}
