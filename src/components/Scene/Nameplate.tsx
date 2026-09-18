import { clamp } from 'lodash'

import { RoleIcon } from '@components/UI/RoleIcon'
import type { PlayerRole } from '@constants/portal2'

import { parseHealth } from '@utils/players'
import { cn } from '@utils/styling'

export interface NameplateProps {
  health: number
  role: PlayerRole
  name: string
  settings: { enabled: boolean; showName: boolean; showHealth: boolean; showRole: boolean }
}

export const Nameplate = (props: NameplateProps) => {
  const { health, role, name, settings } = props

  const { percentage } = parseHealth(health)

  if (!settings.enabled) return null

  return (
    <div className="pointer-events-none bottom-0 flex select-none flex-col items-center text-center">
      {settings.showName && (
        <div
          className={cn(
            'max-w-40 overflow-hidden text-ellipsis whitespace-nowrap px-[0.1rem] text-[0.9rem] font-bold leading-none',
            '[text-shadow:0_0_2px_#000000,0_0_2px_#000000,0_0_2px_#000000,0_0_2px_#000000]'
          )}
        >
          {name}
        </div>
      )}

      {settings.showHealth && (
        <div className="relative mt-1 h-[6px] w-20 overflow-hidden bg-[#8f7b89]">
          <div
            className={cn(
              'absolute inset-0 right-auto',
              role === 'blue' && 'bg-pp-role-blue',
              role === 'orange' && 'bg-pp-role-orange',
              role === 'unknown' && 'bg-white/70'
            )}
            style={{ width: `${clamp(percentage, 0, 100)}%` }}
          />
        </div>
      )}

      {settings.showRole && (
        <div className="mt-1 rounded-full border-[3px] border-black/20">
          <RoleIcon role={role} size={16} />
        </div>
      )}
    </div>
  )
}
