import type { PlayerFrame } from './session'

// Both bots have 100 health
export const PLAYER_MAX_HEALTH = 100

/*
 * Sort player frames by slot (blue bot first when the slots follow the entity order)
 */
export const sortPlayersBySlot = (a: PlayerFrame, b: PlayerFrame) => a.slot - b.slot

/*
 * Return health information for a player.
 */
export const parseHealth = (health: number) => {
  const current = health
  const max = PLAYER_MAX_HEALTH
  const ratio = current / max
  const percentage = ratio * 100

  return { current, max, ratio, percentage }
}
