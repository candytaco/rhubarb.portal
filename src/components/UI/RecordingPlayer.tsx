import { useEffect, useState } from 'react'

import type { SessionRecording } from '@constants/types'
import { useInstance, useStore } from '@zus/store'

/** While playing, a gap this large means the playhead was moved rather than the recording drifting */
const MAX_PLAYING_GAP_SECONDS = 1
/** While paused, the recording sits this closely to the demo clock */
const MAX_PAUSED_GAP_SECONDS = 0.05

export interface RecordingPlayerProps {
  recording: SessionRecording
  /** whether the demo clock follows this recording rather than the other slot's */
  isClock: boolean
}

/**
 * Seeks a recording onto the demo clock. While playing only a gap large enough to be the playhead
 * having moved is corrected, since steady drift is taken out of the demo clock instead; while
 * paused the recording tracks the demo clock closely so that scrubbing lands on the right frame.
 * @param video - The video element, or null before it mounts
 * @param targetSeconds - Where the recording should be to match the demo clock
 * @param playing - Whether playback is running
 */
function seekOntoDemoClock(
  video: HTMLVideoElement | null,
  targetSeconds: number,
  playing: boolean
): void {
  if (!video) return

  const tolerance = playing ? MAX_PLAYING_GAP_SECONDS : MAX_PAUSED_GAP_SECONDS
  if (Math.abs(video.currentTime - targetSeconds) > tolerance) {
    video.currentTime = targetSeconds
  }
}

/**
 * One player's screen recording, played at its own natural rate and followed by the demo clock.
 * The video is muted so that it can start without a click of its own.
 * @param props - The recording to play and whether the demo clock follows it
 */
export const RecordingPlayer = (props: RecordingPlayerProps) => {
  const { recording, isClock } = props

  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [failed, setFailed] = useState(false)

  const playing = useStore(state => state.playback.playing)
  const speed = useStore(state => state.playback.speed)
  const tick = useStore(state => state.playback.tick)
  const intervalPerTick = useStore(state => state.playback.intervalPerTick)

  const targetSeconds = Math.max(0, tick * intervalPerTick + recording.offsetSeconds)

  useEffect(() => {
    setFailed(false)
  }, [recording.url])

  // The playback loop trims the demo clock towards whichever recording is registered here
  useEffect(() => {
    if (!video || !isClock) return

    useInstance.getState().setRecordingClock({ video, offsetSeconds: recording.offsetSeconds })
    return () => useInstance.getState().setRecordingClock(null)
  }, [video, isClock, recording.offsetSeconds])

  useEffect(() => {
    seekOntoDemoClock(video, targetSeconds, playing)
  }, [video, targetSeconds, playing])

  useEffect(() => {
    if (!video) return

    video.playbackRate = speed
    if (playing) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [video, playing, speed])

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs opacity-60">
        {recording.name} cannot be played in this browser
      </div>
    )
  }

  return (
    <video
      ref={setVideo}
      src={recording.url}
      className="h-full w-full object-contain"
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={() => seekOntoDemoClock(video, targetSeconds, playing)}
      onError={() => setFailed(true)}
    />
  )
}
