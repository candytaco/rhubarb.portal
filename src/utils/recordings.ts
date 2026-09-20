// How a screen recording's own clock lines up with the demo clock, and the timestamp format the
// alignment controls read and write.

import type { SessionRecording } from '@constants/types'

/**
 * Works out how far a recording's own clock sits from the demo clock, from the single point the user
 * lined up against whichever of the demo's outer scanner pulses they chose.
 * @param recording        the recording and the point marked on it
 * @param firstTTLSeconds  demo time of the first scanner pulse, null when the demo has none
 * @param lastTTLSeconds   demo time of the last scanner pulse, null when the demo has none
 * @returns Seconds to add to a demo time to reach the matching point in the recording
 */
export function getRecordingOffsetSeconds(
  recording: SessionRecording,
  firstTTLSeconds: number | null,
  lastTTLSeconds: number | null
): number {
  const alignment = recording.alignment
  if (alignment === null) return 0

  const pulseSeconds = alignment.pulse === 'first' ? firstTTLSeconds : lastTTLSeconds
  if (pulseSeconds === null) return 0

  return alignment.seconds - pulseSeconds
}

/**
 * Converts a point on the demo clock to the matching point in a recording, which falls outside the
 * recording where the demo covers time the recording does not.
 * @param demoSeconds    point on the demo clock
 * @param offsetSeconds  the recording's offset from the demo clock
 * @returns The recording time, which may be negative or past the recording's end
 */
export function demoSecondsToRecordingTime(demoSeconds: number, offsetSeconds: number): number {
  return demoSeconds + offsetSeconds
}

/**
 * Reads a video's length, which is not a number until its metadata has loaded.
 * @param video  the video element to read
 * @returns The length in seconds, or 0 while it is unknown
 */
export function readVideoDuration(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) ? video.duration : 0
}

/**
 * Converts a point in a recording to the matching point on the demo clock.
 * @param recordingSeconds  point in the recording
 * @param offsetSeconds     the recording's offset from the demo clock
 * @returns The demo clock time in seconds
 */
export function recordingTimeToDemoSeconds(
  recordingSeconds: number,
  offsetSeconds: number
): number {
  return recordingSeconds - offsetSeconds
}

/**
 * Moves a recording by whole frames, pausing it so that the new position holds.
 * @param video      the video element to move
 * @param frames     how many frames to move, negative to go back
 * @param frameRate  the recording's measured frames per second
 */
export function stepRecordingFrames(
  video: HTMLVideoElement,
  frames: number,
  frameRate: number
): void {
  video.pause()

  const duration = Number.isFinite(video.duration) ? video.duration : Infinity
  const stepped = video.currentTime + frames / frameRate
  video.currentTime = Math.min(Math.max(0, stepped), duration)
}

/**
 * Formats a recording time as minutes, seconds and frame within the second.
 * @param seconds    time in the recording
 * @param frameRate  the recording's measured frames per second, null while unknown
 * @returns The timestamp as MM:SS:FF, with the frame shown as -- until the frame rate is known
 */
export function formatVideoTimestamp(seconds: number, frameRate: number | null): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const wholeSeconds = Math.floor(safeSeconds % 60)
  const pad = (part: number) => String(part).padStart(2, '0')

  if (frameRate === null) return `${pad(minutes)}:${pad(wholeSeconds)}:--`

  const frame = Math.floor((safeSeconds % 1) * frameRate)
  return `${pad(minutes)}:${pad(wholeSeconds)}:${pad(frame)}`
}

/**
 * Reads a MM:SS:FF timestamp back into a time in seconds.
 * @param text       the timestamp to read
 * @param frameRate  the recording's measured frames per second, null while unknown
 * @returns The time in seconds, or null when the text is not a timestamp
 */
export function parseVideoTimestamp(text: string, frameRate: number | null): number | null {
  if (frameRate === null) return null

  const parts = text.trim().split(':')
  if (parts.length !== 3) return null

  const numbers = parts.map(part => Number(part))
  if (numbers.some(value => !Number.isFinite(value) || value < 0)) return null

  const [minutes, wholeSeconds, frame] = numbers
  return minutes * 60 + wholeSeconds + frame / frameRate
}
