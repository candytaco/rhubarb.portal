import { clamp } from 'lodash'

import type { Portal2Session } from '@components/Analyse/Data/Session'
import { RoleIcon } from '@components/UI/RoleIcon'
import { PLAYER_ROLE_NAMES } from '@constants/portal2'

import { getPortalFrame, PlayerFrame, portalColor } from '@utils/session'
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
 * One status card per bot: blue on the left, orange on the right, with health, held object and
 * the state of the bot's two portals
 */
export const PlayerStatuses = (props: PlayerStatusesProps) => {
  const isMobile = useIsMobile()
  const { session, players, tick } = props
  const focusedEntityId = useInstance(state => state?.focusedObject?.userData?.entityId)

  const sorted = [...players].sort(sortPlayersBySlot)
  const left = sorted.filter(player => player.player.role !== 'orange')
  const right = sorted.filter(player => player.player.role === 'orange')

  if (isMobile) {
    return (
      <div className="absolute inset-x-0 bottom-0 flex h-8 items-stretch">
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
    <>
      <div className="absolute left-0 mx-[1.5px] flex flex-col items-start gap-[1.5px]">
        {left.map(player => (
          <StatusItem
            key={`status-item-${player.slot}`}
            session={session}
            player={player}
            alignment="left"
            focused={focusedEntityId === player.player.entityIndex}
            tick={tick}
          />
        ))}
      </div>

      <div className="absolute right-0 mx-[1.5px] flex flex-col items-end gap-[1.5px]">
        {right.map(player => (
          <StatusItem
            key={`status-item-${player.slot}`}
            session={session}
            player={player}
            alignment="right"
            focused={focusedEntityId === player.player.entityIndex}
            tick={tick}
          />
        ))}
      </div>
    </>
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
      <span className="max-w-[6rem] truncate">{player.player.name}</span>
      <span className={cn('font-bold', percentage < 40 && player.alive && 'text-pp-health-low')}>
        {player.alive ? player.health : 'Dead'}
      </span>
    </div>
  )
}

//
// ─── STATUS ITEM ────────────────────────────────────────────────────────────────
//

const STATUS_ITEM_WIDTH = 'w-56'
const STATUS_ITEM_HEIGHT = 'h-9'

export interface StatusItemProps {
  session: Portal2Session
  player: PlayerFrame
  alignment: 'left' | 'right'
  focused?: boolean
  tick: number
}

export const StatusItem = (props: StatusItemProps) => {
  const { session, player, alignment, focused, tick } = props
  const role = player.player.role
  const { percentage } = parseHealth(player.health)

  const portals = session.portals
    .filter(portal => portal && portal.playerSlot === player.slot)
    .map(portal => getPortalFrame(session, portal!.slot, tick))

  const onClickItem = async () => {
    await jumpToPlayerPOVCamera(player.player.entityIndex)
    focusMainCanvas()
  }

  return (
    <div
      className={cn(
        'flex cursor-pointer items-center bg-pp-panel/40 text-[0.9rem] font-semibold',
        'overflow-hidden rounded-xl transition-all',
        STATUS_ITEM_WIDTH,
        STATUS_ITEM_HEIGHT,
        alignment === 'left' && 'flex-row',
        alignment === 'right' && 'flex-row-reverse',
        focused && 'z-10 outline outline-[3px] outline-white',
        focused && alignment === 'left' && 'translate-x-3',
        focused && alignment === 'right' && '-translate-x-3',
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

      <div
        className={cn(
          'relative flex h-full w-full items-center overflow-hidden',
          player.alive && role === 'blue' && 'bg-pp-role-blue/40',
          player.alive && role === 'orange' && 'bg-pp-role-orange/40',
          alignment === 'left' && 'flex-row',
          alignment === 'right' && 'flex-row-reverse'
        )}
      >
        {/* Health fill */}
        <div
          className={cn(
            'absolute h-full',
            role === 'blue' && 'bg-pp-role-blue',
            role === 'orange' && 'bg-pp-role-orange',
            role === 'unknown' && 'bg-white/40'
          )}
          style={{ width: `${clamp(percentage, 0, 100)}%` }}
        />

        {/* Name */}
        <div className="relative overflow-hidden text-ellipsis whitespace-nowrap px-2">
          {player.player.name}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Portal indicators */}
        <div
          className={cn(
            'relative flex items-center gap-1 px-1',
            alignment === 'right' && 'flex-row-reverse'
          )}
        >
          {portals.map((portal, index) => (
            <div
              key={`portal-indicator-${player.slot}-${index}`}
              className={cn(
                'h-4 w-2.5 rounded-full border border-white/40 transition-all',
                !portal?.activated && 'opacity-30'
              )}
              style={{
                backgroundColor: portal?.activated
                  ? portal.color
                  : portalColor(role, (index + 1) as 1 | 2),
              }}
              title={`Portal ${index + 1}${portal?.activated ? '' : ' (not placed)'}`}
            />
          ))}
          {player.isHoldingSomething && (
            <div
              className="ml-1 h-3 w-3 rotate-45 border border-white/70 bg-[#ffd66b]/80"
              title="Holding an object"
            />
          )}
        </div>

        {/* Health */}
        <div
          className={cn(
            'relative w-8 flex-shrink-0 text-center text-[1.1rem] font-bold text-white',
            percentage < 40 && player.alive && 'text-pp-health-low'
          )}
        >
          {player.alive ? (
            player.health
          ) : (
            <span className="text-xs text-white opacity-70">Dead</span>
          )}
        </div>

        {/* Spacer */}
        <div className="w-1.5" />
      </div>
    </div>
  )
}
