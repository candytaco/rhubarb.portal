import type { Portal2Session, SessionEvent } from '@components/Analyse/Data/Session'
import { RoleIcon } from '@components/UI/RoleIcon'
import { PLAYER_ROLE_NAMES } from '@constants/portal2'

import { jumpToPlayerPOVCamera } from '@zus/actions'
import { useInstance, useStore } from '@zus/store'
import { focusMainCanvas } from '@utils/misc'
import { playerBySlot, roleColor } from '@utils/session'
import { cn } from '@utils/styling'
import { useIsMobile } from '@utils/hooks'

const RELEVANT_EVENT_LINGER_ROWS = 200 // Keep an event in the feed for this many axis rows
const MAX_FEED_ITEMS = 6

// event types shown in the live feed; the event log panel shows everything
const FEED_TYPES = new Set<SessionEvent['type']>([
  'game',
  'chat',
  'portal_traversal',
  'portal_placement_failure',
  'pause',
  'unpause',
  'level_transition',
  'map_completed',
])
const FEED_GAME_EVENTS = new Set([
  'portal_fired',
  'player_death',
  'player_use',
  'player_drop',
  'portal_player_portaled',
  'player_long_fling',
  'player_team',
  'player_spawn_blue',
  'player_spawn_orange',
  'map_transition',
])

export interface EventFeedProps {
  session: Portal2Session
  tick: number
}

/**
 * Recent events of the session, replacing the killfeed
 */
export const EventFeed = ({ session, tick }: EventFeedProps) => {
  const focusedObject = useInstance(state => state.focusedObject)
  const showConsoleEvents = useStore(state => state.settings.ui.showConsoleEvents)
  const isMobile = useIsMobile()

  const relevant: SessionEvent[] = []
  for (let index = session.events.length - 1; index >= 0; index--) {
    const event = session.events[index]
    if (event.row > tick) continue
    if (tick - event.row > RELEVANT_EVENT_LINGER_ROWS) break
    if (!isFeedEvent(event, showConsoleEvents)) continue
    relevant.push(event)
    if (relevant.length >= (isMobile ? 3 : MAX_FEED_ITEMS)) break
  }
  relevant.reverse()

  return (
    <div className={cn('flex flex-col items-end text-right', isMobile && 'text-xs')}>
      {relevant.map(event => {
        const player = playerBySlot(session, event.playerSlot)
        const highlighted = !!player && focusedObject?.userData?.entityId === player.entityIndex

        return (
          <div
            key={`feed-${event.row}-${event.type}-${event.name}-${event.playerSlot}-${event.text}`}
            className={cn(
              'mb-2 flex items-center rounded-xl bg-pp-panel/70 px-4 py-2 font-bold',
              highlighted && 'bg-white/90 text-black'
            )}
          >
            {player && (
              <div
                className="mr-2 flex cursor-pointer items-center gap-1 hover:underline active:underline"
                style={{ color: highlighted ? undefined : roleColor(player.role) }}
                onClick={() => {
                  jumpToPlayerPOVCamera(player.entityIndex)
                  focusMainCanvas()
                }}
              >
                <RoleIcon role={player.role} size={14} />
                {PLAYER_ROLE_NAMES[player.role]}
              </div>
            )}

            <div className={cn('font-normal', event.type === 'chat' && 'italic')}>
              {event.type === 'chat'
                ? `“${event.text}”`
                : stripPlayerName(event.text, player ? PLAYER_ROLE_NAMES[player.role] : undefined)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function isFeedEvent(event: SessionEvent, showConsoleEvents: boolean): boolean {
  if (event.type === 'console') return showConsoleEvents
  if (!FEED_TYPES.has(event.type)) return false
  if (event.type === 'game') return FEED_GAME_EVENTS.has(event.name)
  return true
}

/** The event text without the leading player name, since the name is rendered separately */
export function stripPlayerName(text: string, name?: string): string {
  if (name && text.startsWith(name + ' ')) return text.slice(name.length + 1)
  if (name && text.startsWith(name + ':')) return text.slice(name.length + 1).trim()
  return text
}
