import { useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Slider from '@radix-ui/react-slider'
import { motion } from 'framer-motion'

import {
  IoArrowForwardSharpIcon,
  AiFillStepForwardIcon,
  AiFillFastForwardIcon,
  IoMdPauseIcon,
  IoMdPlayIcon,
  BsBookmarkIcon,
  BsBookmarkFillIcon,
  StickerToolIcon,
} from '@components/Misc/Icons'
import { EventHistoryText } from './EventHistoryText'
import { StickerPalette } from './StickerPalette'

import { useInstance, useStore } from '@zus/store'
import {
  changePlaySpeedAction,
  goToTickAction,
  setStickersPanelOpenAction,
  toggleBookmarkAction,
  togglePlaybackAction,
} from '@zus/actions'
import { focusMainCanvas } from '@utils/misc'
import { cn } from '@utils/styling'
import { getDurationFromTicks } from '@utils/parser'
import { useIsMobile } from '@utils/hooks'

export const PLAYBACK_SPEED_OPTIONS = [
  { label: '3×', value: 3 },
  { label: '2×', value: 2 },
  { label: '1×', value: 1 },
  { label: '0.5×', value: 0.5 },
  { label: '0.1×', value: 0.1 },
]

interface PlaybackActionProps {
  content: React.ReactNode
  icon: React.ReactNode
  onClick?: () => void
  /**
   * Radix doesn't display tooltips on mobile, so we need a way to force show it
   * https://github.com/radix-ui/primitives/issues/1573
   */
  mobileTooltipBypass?: boolean
}

const PlaybackAction = (props: PlaybackActionProps) => {
  const [open, setOpen] = useState(false)

  let bypassProps = { root: {}, trigger: {} }

  if (props.mobileTooltipBypass) {
    bypassProps = {
      root: { open, onOpenChange: setOpen },
      trigger: {
        onClick: () => setOpen(prevOpen => !prevOpen),
        onFocus: () => setTimeout(() => setOpen(true), 0),
        onBlur: () => setOpen(false),
      },
    }
  }

  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root {...bypassProps.root}>
        <Tooltip.Trigger asChild {...bypassProps.trigger}>
          <div
            className={cn(
              'cursor-pointer opacity-80',
              'transform transition-all hover:scale-125 hover:opacity-100 active:scale-110 active:opacity-100'
            )}
            onClick={props.onClick}
          >
            {props.icon}
          </div>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content sideOffset={5}>
            <div className="rounded-lg bg-pp-panel/90 px-4 py-3">{props.content}</div>
            <Tooltip.Arrow className="fill-pp-panel/90" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export const PlaybackPanel = () => {
  const session = useInstance(state => state.session)
  const playback = useStore(state => state.playback)
  const bookmarks = useStore(state => state.bookmarks)
  const showTtlMarkers = useStore(state => state.settings.ui.showTtlMarkers)
  const lastEventHistory = useStore(state => state.eventHistory)?.[0]
  const stickerDragActive = useStore(state => state.drawing.stickerDrag.active)
  const stickersOpen = useStore(state => state.drawing.stickersPanelOpen)
  const { playing, speed, tick, maxTicks, forceShowPanel, intervalPerTick } = playback
  const isBookmarked = bookmarks.includes(tick)
  const isMobile = useIsMobile()
  const tickRate = 1 / (intervalPerTick || 1 / 60)

  // the label of the current row on the session clock: demo tick for one demo, server tick for two
  const axisLabel = (row: number) => {
    if (!session) return row
    const clamped = Math.max(0, Math.min(session.tickAxis.length - 1, row))
    return session.tickAxis[clamped]
  }
  const rowForLabel = (label: number) => {
    if (!session) return label
    return label - session.tickAxis[0]
  }
  const toPercent = (row: number) => `${((row - 1) / Math.max(maxTicks - 1, 1)) * 100}%`

  const togglePlayback = () => {
    togglePlaybackAction()
    focusMainCanvas()
  }

  const changePlaySpeed = (speed: number) => {
    changePlaySpeedAction(speed)
    focusMainCanvas()
  }

  const goToTick = (tick: number) => {
    goToTickAction(tick)
    focusMainCanvas()
  }

  const toggleStickers = () => {
    setStickersPanelOpenAction(!stickersOpen)
  }

  return (
    <div className={cn('group relative m-4 max-w-full rounded-2xl px-6 py-2')}>
      {lastEventHistory && (
        <div className={cn('transition-all', playing ? '-mb-16 delay-700 group-hover:mb-0' : '')}>
          <motion.div
            className="pointer-events-none inline-block rounded-3xl bg-black/70 p-2"
            initial={{ opacity: 1, y: 4 }}
            animate={{ opacity: 0, y: 0 }}
            transition={{ duration: 0.6 }}
            key={`${lastEventHistory.type}.${lastEventHistory.timestamp}`}
          >
            <EventHistoryText {...lastEventHistory} />
          </motion.div>
        </div>
      )}

      <div className="relative mt-4 flex justify-center">
        {!isMobile && (
          <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-4 -translate-x-1/2">
            <motion.div
              className="pointer-events-auto"
              initial={false}
              animate={
                stickersOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.96 }
              }
              transition={{ duration: 0.18 }}
            >
              {stickersOpen ? <StickerPalette /> : null}
            </motion.div>
          </div>
        )}

        <div
          className={cn(
            'z-20 flex items-center justify-center rounded-full px-5 py-3 transition-all duration-500',
            isMobile ? 'gap-3' : 'gap-6',
            playing && !forceShowPanel && !stickersOpen
              ? 'scale-90 opacity-0 delay-700'
              : 'bg-black/70 delay-0',
            'group-hover:scale-100 group-hover:bg-black/70 group-hover:opacity-100 group-hover:delay-0'
          )}
        >
          {/* Jump to tick action */}

          {!isMobile && (
            <PlaybackAction
              mobileTooltipBypass
              icon={
                <div className="-mr-1 flex min-w-11 select-none flex-col items-center text-center">
                  <div className="text-xs leading-none">
                    {session?.kind === 'coop' ? 'SERVER TICK' : 'TICK'}
                  </div>
                  <div className="font-bold leading-none">{axisLabel(tick)}</div>
                </div>
              }
              content={
                <div className="text-center">
                  <div>Jump to tick</div>
                  <form
                    className="relative mt-2 text-black"
                    onSubmit={(e: React.ChangeEvent<HTMLFormElement>) => {
                      e.preventDefault()
                      const tickEl = e.target.elements.namedItem('tick') as HTMLInputElement
                      const newTick = Number(tickEl.value)
                      if (isNaN(newTick)) return
                      goToTick(rowForLabel(newTick))
                    }}
                  >
                    <input
                      type="number"
                      name="tick"
                      className="w-28 rounded bg-white py-1 pl-2 pr-7"
                      placeholder="0"
                    />
                    <button
                      type="submit"
                      className="absolute bottom-0 right-0 top-0 ml-2 flex aspect-square items-center justify-center"
                    >
                      <IoArrowForwardSharpIcon />
                    </button>
                  </form>

                  <div className="mt-2 flex justify-between text-xs opacity-80">
                    <div>Last tick</div>
                    <div className="font-bold">{axisLabel(maxTicks)}</div>
                  </div>
                </div>
              }
            />
          )}

          {/* Jump to start action */}

          <PlaybackAction
            icon={<AiFillFastForwardIcon width="1.75rem" height="1.75rem" className="rotate-180" />}
            content={<div>Jump to start</div>}
            onClick={goToTick.bind(null, 1)}
          />

          {/* Seek back action */}

          <PlaybackAction
            icon={<AiFillStepForwardIcon width="1.75rem" height="1.75rem" className="rotate-180" />}
            content={
              <div className="grid grid-cols-[auto,auto] gap-x-4 gap-y-1">
                <div className="col-span-2 text-center">Seek back</div>
                <div>1 tick</div>
                <kbd>,</kbd>
                <div>50 ticks</div>
                <kbd>←</kbd>
              </div>
            }
            onClick={goToTick.bind(null, tick - 50)}
          />

          {/* Toggle play / pause action */}

          <PlaybackAction
            icon={
              playing ? (
                <IoMdPauseIcon width="1.75rem" height="1.75rem" />
              ) : (
                <IoMdPlayIcon width="1.75rem" height="1.75rem" />
              )
            }
            content={
              <div>
                Play / Pause <kbd className="ml-2">Space</kbd>
              </div>
            }
            onClick={togglePlayback}
          />

          {/* Seek forward action */}

          <PlaybackAction
            icon={<AiFillStepForwardIcon width="1.75rem" height="1.75rem" />}
            content={
              <div className="grid grid-cols-[auto,auto] gap-x-4 gap-y-1">
                <div className="col-span-2 text-center">Seek forward</div>
                <div>1 tick</div>
                <kbd>.</kbd>
                <div>50 ticks</div>
                <kbd>→</kbd>
              </div>
            }
            onClick={goToTick.bind(null, tick + 50)}
          />

          {/* Jump to end action */}

          <PlaybackAction
            icon={<AiFillFastForwardIcon width="1.75rem" height="1.75rem" />}
            content={<div>Jump to end</div>}
            onClick={goToTick.bind(null, maxTicks)}
          />

          {/* Change play speed action */}

          {!isMobile && (
            <PlaybackAction
              mobileTooltipBypass
              icon={
                <div className="select-none rounded-3xl bg-white/90 px-2 text-sm text-black">
                  {speed}×
                </div>
              }
              content={
                <>
                  <div className="text-center">Playback speed</div>

                  <div
                    className="mt-2 grid gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${PLAYBACK_SPEED_OPTIONS.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {[...PLAYBACK_SPEED_OPTIONS].reverse().map(({ label, value }) => (
                      <button
                        key={`play-speed-option-${label}`}
                        className={cn(
                          'flex-1 rounded border border-transparent px-2 py-1 text-center',
                          'hover:border-white',
                          value === speed && 'bg-white text-black'
                        )}
                        onClick={() => changePlaySpeed(Number(value))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-[auto,auto] gap-x-4 gap-y-1">
                    <div className="flex justify-start">
                      Increase <kbd className="ml-2">↑</kbd>
                    </div>

                    <div className="flex justify-end">
                      Decrease <kbd className="ml-2">↓</kbd>
                    </div>
                  </div>
                </>
              }
            />
          )}

          {/* Toggle bookmark action */}

          <PlaybackAction
            icon={
              isBookmarked ? (
                <BsBookmarkFillIcon width="1.25rem" height="1.25rem" className="text-amber-400" />
              ) : (
                <BsBookmarkIcon width="1.25rem" height="1.25rem" />
              )
            }
            content={
              <div>
                Toggle bookmark <kbd className="ml-2">B</kbd>
              </div>
            }
            onClick={() => {
              toggleBookmarkAction()
              focusMainCanvas()
            }}
          />

          {/* Sticker toggle */}

          {!isMobile && (
            <PlaybackAction
              icon={
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition-all',
                    (stickersOpen || stickerDragActive) && 'bg-white text-black opacity-100'
                  )}
                >
                  <StickerToolIcon width="1.7rem" height="1.7rem" />
                </div>
              }
              content={
                <div>
                  Toggle stickers <kbd className="ml-2">G</kbd>
                </div>
              }
              onClick={toggleStickers}
            />
          )}
        </div>
      </div>

      <div className="-ml-[5%] mt-3 w-[110%]">
        {/* Timeline slider */}

        <div className="relative">
          {/* Pause intervals, shaded behind the track */}
          {session?.pauseIntervals.map(([start, end], index) => (
            <div
              key={`pause-interval-${index}`}
              className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-sm bg-white/15"
              style={{
                left: toPercent(start),
                width: `${((end - start) / Math.max(maxTicks - 1, 1)) * 100}%`,
              }}
              title="Game paused"
            />
          ))}

          <Slider.Root
            className="relative flex w-full cursor-pointer select-none items-center"
            min={1}
            max={maxTicks}
            value={[tick]}
            step={1}
            onValueChange={([value]) => goToTick(value)}
          >
            <Slider.Track
              className={cn('relative grow rounded-full bg-pp-panel/30', isMobile ? 'h-3' : 'h-2')}
            >
              <Slider.Range className="absolute h-full rounded-full bg-white" />
            </Slider.Track>
          </Slider.Root>

          {/* Scanner pulses (TTL chat markers) */}
          {showTtlMarkers &&
            session &&
            Array.from(session.ttlRows).map(row => (
              <div
                key={`ttl-marker-${row}`}
                className="pointer-events-none absolute top-full mt-0.5 h-1.5 w-px bg-emerald-300/70"
                style={{ left: toPercent(row) }}
              />
            ))}

          {/* Level transitions */}
          {session &&
            Array.from(session.levelTransitionRows).map(row => (
              <div
                key={`transition-marker-${row}`}
                className="absolute top-1/2 h-4 w-1 -translate-y-1/2 cursor-pointer rounded-sm bg-white/80 hover:bg-white"
                style={{ left: toPercent(row) }}
                title="Level transition"
                onClick={() => goToTick(Math.max(1, row))}
              />
            ))}

          {/* Bookmark markers */}
          {bookmarks.map(bookmarkTick => (
            <div
              key={`bookmark-marker-${bookmarkTick}`}
              className="absolute top-1/2 h-3 w-1 -translate-y-1/2 cursor-pointer rounded-sm bg-amber-400 hover:bg-amber-300"
              style={{ left: toPercent(bookmarkTick) }}
              onClick={() => goToTick(bookmarkTick)}
            />
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between">
          {/* Session summary */}

          <div className="flex items-center gap-3 text-sm">
            {session ? (
              <>
                <div className="text-outline">
                  {session.kind === 'coop' ? 'Two demos merged' : 'One demo'}
                </div>
                {session.ttlRows.length > 0 && showTtlMarkers && (
                  <div className="text-outline text-emerald-300/90">
                    {session.ttlRows.length} scanner pulses
                  </div>
                )}
                {session.levelTransitionRows.length > 0 && (
                  <div className="text-outline opacity-80">
                    {session.levelTransitionRows.length} level transitions
                  </div>
                )}
              </>
            ) : (
              <div className="text-outline opacity-70">No demo loaded</div>
            )}
          </div>

          {/* Duration (Current Time / Total Time) */}

          <div className="text-outline text-sm">
            {getDurationFromTicks(tick, tickRate).formatted} /{' '}
            {getDurationFromTicks(maxTicks, tickRate).formatted}
          </div>
        </div>
      </div>
    </div>
  )
}
