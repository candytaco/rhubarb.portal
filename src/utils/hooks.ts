import { useRef, useEffect, useState } from 'react'

/**
 * Hook for easily adding element event listeners which will gracefully cleanup
 * itself when necessary and also update itself if {handler} dependencies change
 *
 * Reference: https://usehooks.com/useEventListener/
 */
export function useEventListener(
  eventName: string,
  handler: (...args: any[]) => any,
  element: HTMLElement | Document | (Window & typeof globalThis) = window
) {
  // Create a ref that stores handler
  const savedHandler = useRef<any>()

  // Update ref.current value if handler changes.
  // This allows our effect below to always get latest handler
  // without us needing to pass it in effect deps array
  // and potentially cause effect to re-run every render
  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(
    () => {
      // Make sure element supports addEventListener
      const isSupported = element && element.addEventListener
      if (!isSupported) return

      // Create event listener that calls handler function stored in ref
      const eventListener = (event: any) => savedHandler.current(event)

      // Add event listener
      element.addEventListener(eventName, eventListener)

      // Remove event listener on cleanup
      return () => {
        element.removeEventListener(eventName, eventListener)
      }
    },
    [eventName, element] // Re-run if eventName or element changes
  )
}

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint)
  useEventListener('resize', () => setIsMobile(window.innerWidth < breakpoint), window)
  return isMobile
}

export function usePointerLock() {
  const [isPointerLocked, setIsPointerLocked] = useState(false)

  useEventListener(
    'pointerlockchange',
    () => setIsPointerLocked(!!document.pointerLockElement),
    document
  )

  return {
    isPointerLocked,
  }
}

/** Frame gaps outside this range are a dropped frame or a stall rather than the true frame time */
const MIN_FRAME_SECONDS = 1 / 240
const MAX_FRAME_SECONDS = 1 / 10
/** Frame gaps collected before the frame rate is taken as measured */
const FRAME_RATE_SAMPLES = 5

/**
 * Measures a video's frame rate from the frames it presents, since no element property reports it.
 * A paused video presents nothing, so with {measure} set it is briefly played to produce frames and
 * then returned to where it was.
 * @param video    the video element to measure, or null before it mounts
 * @param measure  whether a paused video may be played briefly to take the measurement
 * @returns Frames per second, or null while it is still unknown
 */
export function useVideoFrameRate(
  video: HTMLVideoElement | null,
  measure: boolean = false
): number | null {
  const [frameRate, setFrameRate] = useState<number | null>(null)

  useEffect(() => {
    setFrameRate(null)
  }, [video])

  useEffect(() => {
    if (!video || frameRate !== null) return
    if (typeof video.requestVideoFrameCallback !== 'function') return

    let cancelled = false
    let handle = 0
    let previous: { mediaTime: number; presentedFrames: number } | null = null
    const gaps: number[] = []

    // A paused video is nudged into playing so that it presents the frames the measurement needs
    const nudged = measure && video.paused
    const resumeSeconds = video.currentTime
    const restore = () => {
      if (!nudged) return
      video.pause()
      video.currentTime = resumeSeconds
    }

    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (cancelled) return

      if (previous) {
        const frames = metadata.presentedFrames - previous.presentedFrames
        const elapsed = metadata.mediaTime - previous.mediaTime
        if (frames === 1 && elapsed > MIN_FRAME_SECONDS && elapsed < MAX_FRAME_SECONDS) {
          gaps.push(elapsed)
        }
      }
      previous = { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames }

      if (gaps.length >= FRAME_RATE_SAMPLES) {
        const sorted = [...gaps].sort((left, right) => left - right)
        const median = sorted[Math.floor(sorted.length / 2)]
        restore()
        setFrameRate(Math.round((1 / median) * 1000) / 1000)
        return
      }

      handle = video.requestVideoFrameCallback(onFrame)
    }

    handle = video.requestVideoFrameCallback(onFrame)
    if (nudged) video.play().catch(() => {})

    return () => {
      cancelled = true
      if (handle) video.cancelVideoFrameCallback(handle)
      restore()
    }
  }, [video, frameRate, measure])

  return frameRate
}
