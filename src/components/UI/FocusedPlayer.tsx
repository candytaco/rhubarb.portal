import { RoleIcon } from '@components/UI/RoleIcon'
import { PLAYER_ROLE_NAMES } from '@constants/portal2'

import { useStore, useInstance } from '@zus/store'

import type { PlayerFrame } from '@utils/session'
import { parseHealth } from '@utils/players'
import { cn } from '@utils/styling'

export interface FocusedPlayerProps {
  players: PlayerFrame[]
}

/**
 * Name and health of the bot whose eyes the POV camera looks through
 */
export const FocusedPlayer = (props: FocusedPlayerProps) => {
  const controlsMode = useStore(state => state.scene.controls.mode)
  const focusedObject = useInstance(state => state.focusedObject)

  if (controlsMode !== 'pov' || !focusedObject) return null

  const { players } = props
  const focused = players.find(
    player => player.player.entityIndex === focusedObject?.userData?.entityId
  )

  if (!focused) return null

  const role = focused.player.role
  const { percentage } = parseHealth(focused.health)

  return (
    <div className="flex w-auto flex-col items-center">
      <div className="mb-4 text-3xl">
        {!focused.alive && (
          <div className="animate-pulse text-xl font-black text-[#fbff09] [text-shadow:0_0_3px_#000000]">
            {focused.player.name} is down
          </div>
        )}
      </div>

      <div className="flex items-center">
        <div className="relative mr-3 flex w-[15px] justify-end text-right font-black text-white [text-shadow:0_0_3px_#000000]">
          {focused.alive ? (
            <div
              className={cn('text-[2.5rem] leading-10', percentage < 40 && 'text-pp-health-low')}
            >
              {focused.health}
            </div>
          ) : (
            <div className="text-xl opacity-60">Dead</div>
          )}
        </div>

        <div
          className={cn(
            'flex max-w-[260px] flex-col overflow-hidden rounded-xl bg-pp-panel/70',
            !focused.alive && 'opacity-60'
          )}
        >
          <div className="flex flex-1 items-center px-4 py-2">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap">
              {focused.player.name}
            </div>
            <div className="pl-2 text-xs opacity-60">{PLAYER_ROLE_NAMES[role]}</div>
            <div className="pl-2">
              <RoleIcon role={role} size={20} />
            </div>
          </div>

          <div
            className={cn(
              'h-1 w-full',
              role === 'blue' && 'bg-pp-role-blue',
              role === 'orange' && 'bg-pp-role-orange',
              role === 'unknown' && 'bg-white/50'
            )}
          />
        </div>
      </div>
    </div>
  )
}
