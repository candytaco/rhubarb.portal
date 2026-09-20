import { useEffect, useRef } from 'react'

import type { SessionRecording } from '@constants/types'
import {
  demoSecondsToRecordingTime,
  getRecordingOffsetSeconds,
  readVideoDuration,
} from '@utils/recordings'
import { useInstance, useStore } from '@zus/store'

/** While playing, a gap this large means the playhead was moved rather than the recording drifting */
const MAX_PLAYING_GAP_SECONDS = 1
/** While paused, the recording sits this closely to the demo clock */
const MAX_PAUSED_GAP_SECONDS = 0.05

export interface RecordingSyncOptions {
  video: HTMLVideoElement | null
  recording: SessionRecording | null
  /** whether the alignment controls have the recording, which detaches it from the demo clock */
  aligning: boolean
  /** whether the demo clock follows this recording rather than the other slot's */
  isClock: boolean
  /** demo time of the first scanner pulse, null when the demo has none */
  firstTTLSeconds: number | null
  /** demo time of the last scanner pulse, null when the demo has none */
  lastTTLSeconds: number | null
}

export interface RecordingSyncState {
  /** which side of the recording the demo clock has run off, null while it is inside it */
  gap: 'before' | 'after' | null
  /** puts the recording back on the demo clock, for once it has metadata */
  seekOntoDemoClock: () => void
}

/**
 * Keeps one screen recording on the demo clock and registers it as the recording the playback loop
 * trims towards. Where the demo clock falls outside the recording it is held on the nearest end
 * frame instead. While the alignment controls have it the recording is left alone, and on leaving
 * them it is put back onto the frame the demo is showing.
 * @param options - The video element, its recording, the alignment mode and the demo's pulse times
 * @returns Whether the demo clock is off either end of the recording, and a callback that reseeks it
 */
export function useRecordingSync(options: RecordingSyncOptions): RecordingSyncState {
  const { video, recording, aligning, isClock, firstTTLSeconds, lastTTLSeconds } = options

  const playing = useStore(state => state.playback.playing)
  const speed = useStore(state => state.playback.speed)
  const tick = useStore(state => state.playback.tick)
  const intervalPerTick = useStore(state => state.playback.intervalPerTick)

  const wasAligning = useRef(aligning)

  // Read from the element rather than kept in state: the metadata may already have loaded by the
  // time the handlers are attached, in which case no event arrives to record it
  const durationSeconds = video ? readVideoDuration(video) : 0

  const offsetSeconds = recording
    ? getRecordingOffsetSeconds(recording, firstTTLSeconds, lastTTLSeconds)
    : 0
  const targetSeconds = demoSecondsToRecordingTime(tick * intervalPerTick, offsetSeconds)

  let gap: 'before' | 'after' | null = null
  if (recording && !aligning) {
    if (targetSeconds < 0) gap = 'before'
    else if (durationSeconds > 0 && targetSeconds > durationSeconds) gap = 'after'
  }

  /**
   * Puts the recording where the demo clock says it should be.
   * @param force - Whether to seek even when the recording is already close, as on leaving alignment
   */
  const seekOntoDemoClock = (force: boolean) => {
    if (!video || !recording || aligning) return

    const heldSeconds = gap === 'before' ? 0 : gap === 'after' ? durationSeconds : targetSeconds
    const tolerance = playing && gap === null ? MAX_PLAYING_GAP_SECONDS : MAX_PAUSED_GAP_SECONDS

    if (force || Math.abs(video.currentTime - heldSeconds) > tolerance) {
      video.currentTime = heldSeconds
    }
  }

  // The playback loop trims the demo clock towards whichever recording is registered here
  useEffect(() => {
    if (!video || !isClock || aligning) return

    useInstance.getState().setRecordingClock({ video, offsetSeconds })
    return () => useInstance.getState().setRecordingClock(null)
  }, [video, isClock, aligning, offsetSeconds])

  useEffect(() => {
    const leftAlignment = wasAligning.current && !aligning
    wasAligning.current = aligning

    seekOntoDemoClock(leftAlignment)
  }, [video, targetSeconds, playing, aligning, gap, durationSeconds])

  useEffect(() => {
    if (!video || aligning) return

    // Off either end of the recording there is nothing to play, so the held frame stays put
    if (gap !== null) {
      video.pause()
      return
    }

    video.playbackRate = speed
    if (playing) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [video, playing, speed, aligning, gap])

  return { gap, seekOntoDemoClock: () => seekOntoDemoClock(false) }
}
