import { useEffect, useState } from 'react'

import type { SessionRecording } from '@constants/types'
import { useVideoFrameRate } from '@utils/hooks'
import {
  formatVideoTimestamp,
  parseVideoTimestamp,
  readVideoDuration,
  stepRecordingFrames,
} from '@utils/recordings'
import { cn } from '@utils/styling'
import { setRecordingAlignmentAction } from '@zus/actions'

const BUTTON_CLASS =
  'rounded-md border border-white/20 px-2 py-0.5 transition-colors hover:border-white/60 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/20'

/** Video events after which the readout is stale and has to be sampled again */
const VIDEO_TIME_EVENTS = [
  'seeked',
  'timeupdate',
  'play',
  'pause',
  'durationchange',
  'loadedmetadata',
]

export interface RecordingControlsProps {
  slot: number
  recording: SessionRecording
  video: HTMLVideoElement
  /** demo time of the first scanner pulse, null when the demo has none */
  firstTTLSeconds: number | null
  /** demo time of the last scanner pulse, null when the demo has none */
  lastTTLSeconds: number | null
}

/**
 * Play, scrub and frame-step controls for one screen recording while it is being lined up with the
 * demo, with the buttons that mark which recording time one of the demo's outer scanner pulses falls
 * on. Either pulse can be the one point used, so marking one replaces the other. The recording
 * moves on its own here, detached from the demo clock.
 * @param props - The slot, its recording, the video element and whether the demo has pulses
 */
export const RecordingControls = (props: RecordingControlsProps) => {
  const { slot, recording, video, firstTTLSeconds, lastTTLSeconds } = props

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [draftTimestamp, setDraftTimestamp] = useState<string | null>(null)

  const frameRate = useVideoFrameRate(video, true)

  useEffect(() => {
    const sampleVideo = () => {
      setCurrentTime(video.currentTime)
      setDuration(readVideoDuration(video))
      setPlaying(!video.paused)
    }

    sampleVideo()
    for (const name of VIDEO_TIME_EVENTS) video.addEventListener(name, sampleVideo)
    return () => {
      for (const name of VIDEO_TIME_EVENTS) video.removeEventListener(name, sampleVideo)
    }
  }, [video])

  // Wheel events over the recording step it a frame at a time, and must not scroll the sidebar
  useEffect(() => {
    if (frameRate === null) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      stepRecordingFrames(video, event.deltaY > 0 ? 1 : -1, frameRate)
    }

    video.addEventListener('wheel', onWheel, { passive: false })
    return () => video.removeEventListener('wheel', onWheel)
  }, [video, frameRate])

  const togglePlaying = () => {
    if (video.paused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  const seekTo = (seconds: number) => {
    video.pause()
    video.currentTime = seconds
  }

  const commitTimestamp = () => {
    if (draftTimestamp === null) return

    const seconds = parseVideoTimestamp(draftTimestamp, frameRate)
    if (seconds !== null) seekTo(seconds)
    setDraftTimestamp(null)
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-pp-panel/60 p-2 text-xs">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={cn(BUTTON_CLASS, 'w-8')}
          onClick={togglePlaying}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={frameRate === null}
          onClick={() => frameRate !== null && stepRecordingFrames(video, -1, frameRate)}
          title="Previous frame"
        >
          ◀
        </button>

        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={frameRate === null}
          onClick={() => frameRate !== null && stepRecordingFrames(video, 1, frameRate)}
          title="Next frame"
        >
          ▶
        </button>

        <div className="flex-1" />

        <input
          className="w-[5.5rem] rounded-md bg-black/40 px-1.5 py-0.5 text-center font-mono disabled:opacity-50"
          value={draftTimestamp ?? formatVideoTimestamp(currentTime, frameRate)}
          disabled={frameRate === null}
          title="Minutes, seconds and frame; edit to jump"
          onChange={event => setDraftTimestamp(event.target.value)}
          onBlur={commitTimestamp}
          onKeyDown={event => {
            if (event.key === 'Enter') commitTimestamp()
            if (event.key === 'Escape') setDraftTimestamp(null)
          }}
        />
      </div>

      <input
        type="range"
        className="w-full accent-white"
        min={0}
        max={duration}
        step={frameRate === null ? 'any' : 1 / frameRate}
        value={Math.min(currentTime, duration)}
        disabled={duration === 0}
        onChange={event => seekTo(Number(event.target.value))}
      />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={cn(
            BUTTON_CLASS,
            'flex-1',
            recording.alignment?.pulse === 'first' && 'border-white bg-white text-black'
          )}
          disabled={firstTTLSeconds === null}
          onClick={() => setRecordingAlignmentAction(slot, 'first', video.currentTime)}
        >
          Set as first TTL
        </button>

        <button
          type="button"
          className={cn(
            BUTTON_CLASS,
            'flex-1',
            recording.alignment?.pulse === 'last' && 'border-white bg-white text-black'
          )}
          disabled={lastTTLSeconds === null}
          onClick={() => setRecordingAlignmentAction(slot, 'last', video.currentTime)}
        >
          Set as last TTL
        </button>
      </div>

      <div className="flex gap-3 font-mono opacity-60">
        <span>
          {recording.alignment === null
            ? 'not aligned'
            : `aligned to ${recording.alignment.pulse} TTL at ${formatVideoTimestamp(recording.alignment.seconds, frameRate)}`}
        </span>
        <div className="flex-1" />
        <span>{frameRate === null ? 'measuring fps' : `${frameRate} fps`}</span>
      </div>
    </div>
  )
}
