import { useMemo, useState } from 'react'

import { TogglePanel, TogglePanelButton } from '@components/UI/Shared/TogglePanel'
import { HiListBulletIcon } from '@components/Misc/Icons'
import { RoleIcon } from '@components/UI/RoleIcon'
import type { SessionEvent, SessionEventType } from '@components/Analyse/Data/Session'
import { stripPlayerName } from '@components/UI/EventFeed'

import { useStore, useInstance } from '@zus/store'
import { toggleUIPanelAction, goToTickAction, jumpToPlayerPOVCamera } from '@zus/actions'
import { getDurationFromTicks } from '@utils/parser'
import { playerBySlot, roleColor } from '@utils/session'
import { PLAYER_ROLE_NAMES } from '@constants/portal2'
import { cn } from '@utils/styling'

type FilterKey = 'portals' | 'players' | 'chat' | 'console' | 'session' | 'other'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'portals', label: 'Portals' },
  { key: 'players', label: 'Players' },
  { key: 'chat', label: 'Chat' },
  { key: 'session', label: 'Session' },
  { key: 'console', label: 'Console' },
  { key: 'other', label: 'Other' },
]

const PORTAL_EVENTS = new Set(['portal_fired', 'portal_player_portaled', 'portal_enabled'])
const PLAYER_EVENTS = new Set([
  'player_death',
  'player_use',
  'player_drop',
  'player_landed',
  'player_long_fling',
  'player_touched_ground',
  'portal_player_touchedground',
  'touched_paint',
  'player_zoomed',
  'player_unzoomed',
  'bounce_count',
  'player_team',
  'player_spawn_blue',
  'player_spawn_orange',
])
const SESSION_TYPES = new Set<SessionEventType>([
  'pause',
  'unpause',
  'level_transition',
  'ttl',
  'map_completed',
])

function filterKeyOf(event: SessionEvent): FilterKey {
  if (event.type === 'chat') return 'chat'
  if (event.type === 'console') return 'console'
  if (event.type === 'portal_traversal' || event.type === 'portal_placement_failure')
    return 'portals'
  if (SESSION_TYPES.has(event.type)) return 'session'
  if (event.type === 'game') {
    if (PORTAL_EVENTS.has(event.name)) return 'portals'
    if (PLAYER_EVENTS.has(event.name)) return 'players'
  }
  return 'other'
}

/**
 * Every event of the session with text and category filters; clicking a row seeks to it
 */
export const EventLogPanel = () => {
  const isOpen = useStore(state => state.ui.activePanels.includes('EventLog'))
  const session = useInstance(state => state.session)
  const eventSeekBuffer = useStore(state => state.settings.ui.eventSeekBuffer)

  const [filterText, setFilterText] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    new Set<FilterKey>(['portals', 'players', 'chat', 'session'])
  )

  const tickRate = session?.intervalPerTick ? 1 / session.intervalPerTick : 60

  const toggleUIPanel = () => {
    toggleUIPanelAction('Settings', false)
    toggleUIPanelAction('About', false)
    toggleUIPanelAction('Load', false)
    toggleUIPanelAction('Bookmarks', false)
    toggleUIPanelAction('Setups', false)
    toggleUIPanelAction('EventLog')
  }

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters(previous => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const filteredEvents = useMemo(() => {
    if (!session) return []
    const query = filterText.trim().toLowerCase()
    return session.events.filter(event => {
      if (!activeFilters.has(filterKeyOf(event))) return false
      if (!query) return true
      const player = playerBySlot(session, event.playerSlot)
      return (
        event.text.toLowerCase().includes(query) ||
        event.name.toLowerCase().includes(query) ||
        (player?.name.toLowerCase().includes(query) ?? false)
      )
    })
  }, [session, filterText, activeFilters])

  const onSeek = (row: number, entityIndex?: number) => {
    const bufferRows = Math.round(eventSeekBuffer * tickRate)
    goToTickAction(Math.max(1, row - bufferRows))
    if (entityIndex !== undefined) jumpToPlayerPOVCamera(entityIndex)
  }

  return (
    <div className="flex items-start">
      <TogglePanelButton onClick={toggleUIPanel}>
        <HiListBulletIcon />
      </TogglePanelButton>

      <TogglePanel
        showCloseButton
        isOpen={isOpen}
        onClickClose={toggleUIPanel}
        className="w-[30rem] max-w-[90vw]"
      >
        <div className="flex max-h-[75vh] flex-col px-6 pb-6 pt-6">
          <div className="text-xl font-bold">Event log</div>

          <div className="mt-1 text-xs opacity-60">
            {filteredEvents.length} of {session?.events.length ?? 0} events
            {session?.kind === 'coop' ? ' · merged from both demos on the server clock' : ''}
          </div>

          <input
            type="text"
            className="mt-3 w-full rounded-lg bg-white/10 px-3 py-1.5 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
            placeholder="Filter by text or player"
            value={filterText}
            onChange={event => setFilterText(event.target.value)}
          />

          <div className="mt-2 flex flex-wrap gap-1">
            {FILTERS.map(filter => (
              <button
                key={`event-filter-${filter.key}`}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-xs transition-all',
                  activeFilters.has(filter.key)
                    ? 'border-white/60 bg-white/20'
                    : 'border-white/10 opacity-50 hover:opacity-80'
                )}
                onClick={() => toggleFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex-1 overflow-y-auto pr-1">
            {filteredEvents.map((event, index) => {
              const player = playerBySlot(session, event.playerSlot)
              const seconds = getDurationFromTicks(event.row, tickRate).formatted

              return (
                <div
                  key={`event-row-${index}-${event.row}`}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-sm hover:bg-white/10"
                  onClick={() => onSeek(event.row, player?.entityIndex)}
                >
                  <div className="w-14 shrink-0 text-xs tabular-nums opacity-50">{seconds}</div>

                  {player ? (
                    <div
                      className="flex shrink-0 items-center gap-1 font-bold"
                      style={{ color: roleColor(player.role) }}
                    >
                      <RoleIcon role={player.role} size={14} />
                      <span className="max-w-[7rem] truncate">
                        {PLAYER_ROLE_NAMES[player.role]}
                      </span>
                    </div>
                  ) : (
                    <div className="w-4 shrink-0" />
                  )}

                  <div className={cn('min-w-0 flex-1 truncate', event.type === 'chat' && 'italic')}>
                    {event.type === 'chat'
                      ? `“${event.text}”`
                      : stripPlayerName(
                          event.text,
                          player ? PLAYER_ROLE_NAMES[player.role] : undefined
                        )}
                  </div>

                  <div className="shrink-0 text-[0.65rem] uppercase tracking-wide opacity-40">
                    {event.type === 'game'
                      ? event.name.replace(/_/g, ' ')
                      : event.type.replace(/_/g, ' ')}
                  </div>
                </div>
              )
            })}

            {filteredEvents.length === 0 && (
              <div className="py-6 text-center text-sm opacity-50">No events match the filters</div>
            )}
          </div>
        </div>
      </TogglePanel>
    </div>
  )
}
