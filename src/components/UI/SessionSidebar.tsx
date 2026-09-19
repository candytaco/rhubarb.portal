import { useInstance, useStore } from '@zus/store'
import { RoleIcon } from '@components/UI/RoleIcon'
import { PlayerStatuses } from '@components/UI/PlayerStatuses'
import { PLAYER_ROLE_COLORS, PLAYER_ROLE_NAMES } from '@constants/portal2'
import { getDurationFromTicks } from '@utils/parser'
import { getPlayerFrames } from '@utils/session'
import { cn } from '@utils/styling'

/**
 * Placeholder for one player's screen recording. A later phase mounts a <video> here and drives
 * it from playback.tick with a per-recording offset (specs/portal2-coop-replacement.md section 7).
 */
export const RecordingPlaceholder = ({ slot }: { slot: number }) => {
  const session = useInstance(state => state.session)
  const player = session?.players[slot]
  const role = player?.role ?? 'unknown'
  const label = player ? PLAYER_ROLE_NAMES[role] : `Player ${slot + 1}`
  const color = PLAYER_ROLE_COLORS[role]

  return (
    <div
      className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/20 bg-pp-panel/60 p-4 text-center"
      data-recording-slot={slot}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />

      <div className="text-[0.65rem] uppercase tracking-[0.2em] opacity-50">Screen recording</div>

      <div className="mt-2 flex items-center gap-2 text-lg font-bold">
        <RoleIcon role={role} size={20} />
        <span>{label}</span>
      </div>

      {!player && <div className="mt-1 text-xs opacity-50">No demo loaded</div>}

      <div className="mt-4 max-w-[18rem] text-xs opacity-40">
        Video playback synced to the demo clock will appear here
      </div>
    </div>
  )
}

const SessionDetails = () => {
  const session = useInstance(state => state.session)
  const map = useStore(state => state.scene.map)
  const tick = useStore(state => state.playback.tick)

  if (!session) {
    return (
      <div className="rounded-2xl bg-pp-panel/60 p-4 text-xs opacity-70">
        <div className="mb-1 text-[0.65rem] uppercase tracking-[0.2em] opacity-60">Session</div>
        <div>
          Drop one <code>.dem</code> file, or both players&apos; demos of the same session, onto the
          viewer.
        </div>
        <div className="mt-2 opacity-70">Map: {map}</div>
      </div>
    )
  }

  const row = Math.max(0, Math.min(session.tickAxis.length - 1, tick))
  const axisLabel = session.kind === 'coop' ? 'server tick' : 'demo tick'

  return (
    <div className="rounded-2xl bg-pp-panel/60 p-4 text-xs">
      <div className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] opacity-60">Session</div>

      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
        <div className="opacity-50">Map</div>
        <div className="truncate font-semibold">{session.map}</div>

        <div className="opacity-50">Demos</div>
        <div>
          {session.demos.map((demo, index) => {
            const recorder = session.players.find(player => player.demoIndex === index)
            return (
              <div key={`demo-${index}`} className="truncate">
                {demo.fileName}
                {recorder && (
                  <span className="opacity-50"> ({PLAYER_ROLE_NAMES[recorder.role]})</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="opacity-50">Clock</div>
        <div>
          {axisLabel} {session.tickAxis[row]}
          <span className="opacity-50">
            {' '}
            / {session.tickAxis[session.tickAxis.length - 1]} ·{' '}
            {getDurationFromTicks(session.tickAxis.length, 1 / session.intervalPerTick).formatted}
          </span>
        </div>

        <div className="opacity-50">Events</div>
        <div>
          {session.events.length}
          <span className="opacity-50">
            {' '}
            · {session.ttlRows.length} scanner pulses · {session.pauseIntervals.length} pauses
          </span>
        </div>

        <div className="opacity-50">Players</div>
        <div className="flex flex-col gap-1">
          {session.players.map(player => (
            <div key={`player-${player.slot}`} className="flex items-center gap-2">
              <RoleIcon role={player.role} size={14} />
              <span className="font-semibold">{PLAYER_ROLE_NAMES[player.role]}</span>
              <span className="opacity-50">
                {player.demoIndex !== null
                  ? `recorded demo ${player.demoIndex + 1}`
                  : 'from entity state'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The right hand column: two screen recording placeholders and the session details
 */
export const SessionSidebar = () => {
  const session = useInstance(state => state.session)
  const tick = useStore(state => state.playback.tick)

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-white/10 bg-black/40 p-3',
        'lg:h-screen lg:flex-none lg:border-l lg:border-t-0'
      )}
    >
      {session && (
        <PlayerStatuses session={session} players={getPlayerFrames(session, tick)} tick={tick} />
      )}
      <div className="text-[0.65rem] uppercase tracking-[0.2em] opacity-50">Recordings</div>
      <RecordingPlaceholder slot={0} />
      <RecordingPlaceholder slot={1} />
      <SessionDetails />
    </aside>
  )
}
