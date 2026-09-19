import type { Portal2Session, SessionPortal } from '@components/Analyse/Data/Session'
import { RoleIcon } from '@components/UI/RoleIcon'
import { TTLFlash } from '@components/UI/TTLFlash'
import { PLAYER_ROLE_NAMES } from '@constants/portal2'

import { getPortalFrame, PlayerFrame } from '@utils/session'
import { sortPlayersBySlot, parseHealth } from '@utils/players'
import { focusMainCanvas } from '@utils/misc'
import { cn } from '@utils/styling'
import { useIsMobile } from '@utils/hooks'

import { useInstance } from '@zus/store'
import { jumpToPlayerPOVCamera } from '@zus/actions'

//
// ─── PLAYER STATUSES ────────────────────────────────────────────────────────────
//

export interface PlayerStatusesProps {
  session: Portal2Session
  players: PlayerFrame[]
  tick: number
}

/**
 * The TTL marker followed by one status card per bot, in a row above the screen recordings, with
 * the held object and the state of the bot's two portals
 */
export const PlayerStatuses = (props: PlayerStatusesProps) => {
  const isMobile = useIsMobile()
  const { session, players, tick } = props
  const focusedEntityId = useInstance(state => state?.focusedObject?.userData?.entityId)

  const sorted = [...players].sort(sortPlayersBySlot)

  if (isMobile) {
    return (
      <div className="flex items-stretch gap-[1.5px]">
        <TTLFlash session={session} tick={tick} />
        {sorted.map(player => (
          <MobileStatusItem
            key={`mobile-status-${player.slot}`}
            player={player}
            focused={focusedEntityId === player.player.entityIndex}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-stretch gap-[1.5px]">
      <TTLFlash session={session} tick={tick} />
      {sorted.map(player => (
        <StatusItem
          key={`status-item-${player.slot}`}
          session={session}
          player={player}
          focused={focusedEntityId === player.player.entityIndex}
          tick={tick}
        />
      ))}
    </div>
  )
}

//
// ─── MOBILE STATUS ITEM ─────────────────────────────────────────────────────────
//

interface MobileStatusItemProps {
  player: PlayerFrame
  focused?: boolean
}

const MobileStatusItem = ({ player, focused }: MobileStatusItemProps) => {
  const { percentage } = parseHealth(player.health)

  const onClickItem = async () => {
    await jumpToPlayerPOVCamera(player.player.entityIndex)
    focusMainCanvas()
  }

  return (
    <div
      className={cn(
        'flex flex-1 cursor-pointer items-center justify-center gap-1 text-xs font-semibold',
        player.player.role === 'blue' && 'bg-pp-role-blue/40',
        player.player.role === 'orange' && 'bg-pp-role-orange/40',
        !player.alive && 'opacity-40',
        focused && 'outline outline-1 outline-white'
      )}
      onClick={onClickItem}
    >
      <RoleIcon role={player.player.role} size={16} />
      <span className="max-w-[6rem] truncate">{PLAYER_ROLE_NAMES[player.player.role]}</span>
      <span className={cn('font-bold', percentage < 40 && player.alive && 'text-pp-health-low')}>
        {player.alive ? player.health : 'Dead'}
      </span>
    </div>
  )
}

//
// ─── STATUS ITEM ────────────────────────────────────────────────────────────────
//

const STATUS_ITEM_WIDTH = 'min-w-0 flex-1'
const STATUS_ITEM_HEIGHT = 'h-9'

export interface StatusItemProps {
  session: Portal2Session
  player: PlayerFrame
  focused?: boolean
  tick: number
}

export const StatusItem = (props: StatusItemProps) => {
  const { session, player, focused, tick } = props
  const role = player.player.role

  const portals = session.portals.filter(
    (portal): portal is SessionPortal => portal !== null && portal.playerSlot === player.slot
  )

  const onClickItem = async () => {
    await jumpToPlayerPOVCamera(player.player.entityIndex)
    focusMainCanvas()
  }

  return (
    <div
      className={cn(
        'flex cursor-pointer flex-row items-center bg-pp-panel/40 text-[0.9rem] font-semibold',
        'overflow-hidden rounded-xl transition-all',
        STATUS_ITEM_WIDTH,
        STATUS_ITEM_HEIGHT,
        focused && 'z-10 outline outline-[3px] outline-white',
        !player.alive && 'opacity-60'
      )}
      onClick={onClickItem}
      title={PLAYER_ROLE_NAMES[role]}
    >
      {/* Role icon */}
      <div
        className={cn(
          'flex aspect-square shrink-0 items-center justify-center bg-pp-panel/20',
          STATUS_ITEM_HEIGHT
        )}
      >
        <RoleIcon role={role} size={22} />
      </div>

      {/* Name */}
      <div className="overflow-hidden text-ellipsis whitespace-nowrap px-2">
        {PLAYER_ROLE_NAMES[role]}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Portal indicators */}
      <div className="flex items-center gap-1 px-1.5">
        {portals.map(portal => {
          const frame = getPortalFrame(session, portal.slot, tick)
          const placed = frame?.activated === true
          return (
            <div
              key={`portal-indicator-${player.slot}-${portal.portalNumber}`}
              className={cn(
                'rounded-md border px-2 py-0.5 text-xs font-bold leading-4 transition-all',
                placed
                  ? 'border-white/60 text-white [text-shadow:0_0_2px_#000000]'
                  : 'border-white/15 bg-white/10 text-white/35'
              )}
              style={placed ? { backgroundColor: frame.color } : undefined}
              title={`Portal ${portal.portalNumber}${placed ? '' : ' (not placed)'}`}
            >
              Portal {portal.portalNumber}
            </div>
          )
        })}
        {player.isHoldingSomething && (
          <div
            className="ml-1 h-3 w-3 rotate-45 border border-white/70 bg-[#ffd66b]/80"
            title="Holding an object"
          />
        )}
      </div>
    </div>
  )
}
