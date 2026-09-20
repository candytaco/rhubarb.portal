import { useEffect, useState } from 'react'

import { useInstance, useStore } from '@zus/store'
import { toggleRecordingAlignmentAction } from '@zus/actions'
import { RoleIcon } from '@components/UI/RoleIcon'
import { PlayerStatuses } from '@components/UI/PlayerStatuses'
import { RecordingControls } from '@components/UI/RecordingControls'
import { useRecordingSync } from '@components/UI/RecordingPlayer'
import { PLAYER_ROLE_COLORS, PLAYER_ROLE_NAMES } from '@constants/portal2'
import { getDurationFromTicks } from '@utils/parser'
import { getPlayerFrames } from '@utils/session'
import { cn } from '@utils/styling'

/**
 * One player's screen recording slot: the uploaded video driven by the demo clock once the load
 * panel has been given one, and until then a placeholder naming the player
 * (specs/portal2-coop-replacement.md section 7).
 */
export interface RecordingPlaceholderProps {
  slot: number
  /** whether the alignment controls are showing */
  aligning: boolean
  /** demo time of the first scanner pulse, null when the demo has none */
  firstTTLSeconds: number | null
  /** demo time of the last scanner pulse, null when the demo has none */
  lastTTLSeconds: number | null
}

export const RecordingPlaceholder = (props: RecordingPlaceholderProps) => {
  const { slot, aligning, firstTTLSeconds, lastTTLSeconds } = props

  const session = useInstance(state => state.session)
  const recordings = useInstance(state => state.recordings)
  const recording = recordings[slot]
  // the demo clock follows the lowest slot that has a recording
  const isClock = recordings.findIndex(entry => entry !== null) === slot
  const player = session?.players[slot]
  const role = player?.role ?? 'unknown'
  const label = player ? PLAYER_ROLE_NAMES[role] : `Player ${slot + 1}`
  const color = PLAYER_ROLE_COLORS[role]

  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  // only a render trigger: the recording's length is read straight off the element
  const [, setMetadataCount] = useState(0)
  const [failed, setFailed] = useState(false)

  const { gap, seekOntoDemoClock } = useRecordingSync({
    video,
    recording,
    aligning,
    isClock,
    firstTTLSeconds,
    lastTTLSeconds,
  })

  useEffect(() => {
    setFailed(false)
  }, [recording?.url])

  const onMetadata = () => setMetadataCount(count => count + 1)

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-pp-panel/60 p-4 text-center',
          !recording && 'border-dashed'
        )}
        data-recording-slot={slot}
      >
        <div className="absolute inset-x-0 top-0 z-10 h-1" style={{ backgroundColor: color }} />

        {recording && !failed && (
          <video
            ref={setVideo}
            src={recording.url}
            className="absolute inset-0 h-full w-full object-contain"
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={() => {
              onMetadata()
              seekOntoDemoClock()
            }}
            onDurationChange={onMetadata}
            onError={() => setFailed(true)}
          />
        )}

        {recording && !failed && gap !== null && (
          <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/70 text-xs">
            No video at this point
          </div>
        )}

        {recording && failed && (
          <div className="text-xs opacity-60">
            {recording.name} cannot be played in this browser
          </div>
        )}

        {!recording && (
          <>
            <div className="text-[0.65rem] uppercase tracking-[0.2em] opacity-50">
              Screen recording
            </div>

            <div className="mt-2 flex items-center gap-2 text-lg font-bold">
              <RoleIcon role={role} size={20} />
              <span>{label}</span>
            </div>

            {!player && <div className="mt-1 text-xs opacity-50">No demo loaded</div>}

            <div className="mt-4 max-w-[18rem] text-xs opacity-40">
              Video playback synced to the demo clock will appear here
            </div>
          </>
        )}
      </div>

      {recording && aligning && video && (
        <RecordingControls
          slot={slot}
          recording={recording}
          video={video}
          firstTTLSeconds={firstTTLSeconds}
          lastTTLSeconds={lastTTLSeconds}
        />
      )}
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
 * Vertical drag handle on the sidebar's inner edge, reporting the sidebar width the pointer
 * implies. Hidden below the breakpoint where the sidebar becomes a row under the viewer.
 * @param props - Callback given the new sidebar width in pixels
 */
const SidebarResizeHandle = ({ onResize }: { onResize: (width: number) => void }) => {
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    onResize(window.innerWidth - event.clientX)
  }

  const endDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
  }

  return (
    <div
      className={cn(
        'absolute inset-y-0 left-0 z-20 hidden w-2 cursor-col-resize select-none lg:block',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-white/15 after:transition-colors',
        dragging ? 'after:bg-white/60' : 'hover:after:bg-white/40'
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDragging}
      onPointerCancel={endDragging}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    />
  )
}

export interface SessionSidebarProps {
  onResize: (width: number) => void
}

/**
 * The right hand column: two screen recording placeholders and the session details, with a handle
 * on its inner edge that resizes it
 * @param props - Callback given the new sidebar width in pixels
 */
export const SessionSidebar = ({ onResize }: SessionSidebarProps) => {
  const session = useInstance(state => state.session)
  const recordings = useInstance(state => state.recordings)
  const tick = useStore(state => state.playback.tick)
  const aligning = useInstance(state => state.aligningRecordings)

  const pulseRows = session && session.ttlRows.length > 0 ? session.ttlRows : null
  const firstTTLSeconds = pulseRows && session ? pulseRows[0] * session.intervalPerTick : null
  const lastTTLSeconds =
    pulseRows && session ? pulseRows[pulseRows.length - 1] * session.intervalPerTick : null

  return (
    <aside
      className={cn(
        'relative flex min-h-0 flex-1 flex-col border-t border-white/10 bg-black/40',
        'lg:h-screen lg:flex-none lg:border-l lg:border-t-0'
      )}
    >
      <SidebarResizeHandle onResize={onResize} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {session && (
          <PlayerStatuses session={session} players={getPlayerFrames(session, tick)} tick={tick} />
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="text-[0.65rem] uppercase tracking-[0.2em] opacity-50">Recordings</div>

          {recordings.some(entry => entry !== null) && (
            <button
              type="button"
              className={cn(
                'rounded-md border px-2 py-0.5 text-xs transition-colors',
                aligning
                  ? 'border-white bg-white text-black'
                  : 'border-white/20 hover:border-white/60'
              )}
              onClick={() => toggleRecordingAlignmentAction()}
            >
              Align videos
            </button>
          )}
        </div>

        <RecordingPlaceholder
          slot={0}
          aligning={aligning}
          firstTTLSeconds={firstTTLSeconds}
          lastTTLSeconds={lastTTLSeconds}
        />
        <RecordingPlaceholder
          slot={1}
          aligning={aligning}
          firstTTLSeconds={firstTTLSeconds}
          lastTTLSeconds={lastTTLSeconds}
        />
        <SessionDetails />
      </div>
    </aside>
  )
}
