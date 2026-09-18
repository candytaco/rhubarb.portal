import { StickerDefinition, StickerRole } from './types'

export const STICKER_ROLES: StickerRole[] = ['blue', 'orange']

export function isSameStickerDefinition(
  left?: StickerDefinition,
  right?: StickerDefinition
): boolean {
  if (!left || !right || left.kind !== right.kind) return false

  if (left.kind === 'player' && right.kind === 'player') {
    return left.role === right.role
  }

  return left.kind === 'symbol' && right.kind === 'symbol' && left.symbol === right.symbol
}
