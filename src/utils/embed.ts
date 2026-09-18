import axios from 'axios'

import {
  addDownloadAction,
  removeDownloadAction,
  updateDownloadAction,
  parseDemoAction,
} from '@zus/actions'
import type { DemoFileInput } from '@components/Analyse/Data/SessionParser'

//
// ─── LOADING DEMOS FROM THE URL ─────────────────────────────────────────────────
//
// Lets a session be opened by link instead of only by drag-and-drop:
//
//   /?demoUrl=https://…/player1.dem                     one demo
//   /?demoUrl=https://…/player1.dem&demoUrl2=https://…/player2.dem   both players' demos
//   …&tick=1000                                         optional axis row to seek to once loaded
//
// The demos are fetched by the visitor's browser.
//

// ?demoUrl= is attacker-controllable, so the hosts it may point at are restricted to the page's
// own origin plus this list. Nothing here can reach a private network (it's a browser fetch, not
// server-side), but an unrestricted version would turn any viewer link into "fetch this arbitrary
// URL with the viewer as the referrer". Extend this when demos are hosted elsewhere.
const ALLOWED_DEMO_HOSTS: RegExp[] = []

const isAllowedDemoUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (parsed.origin === window.location.origin) return true
    return ALLOWED_DEMO_HOSTS.some(pattern => pattern.test(parsed.hostname))
  } catch {
    return false
  }
}

export type UrlDemoStatus =
  | { state: 'idle' }
  | { state: 'resolving' }
  | { state: 'error'; message: string }

type UrlDemoStatusListener = (status: UrlDemoStatus) => void

let urlDemoStatus: UrlDemoStatus = { state: 'idle' }
const listeners = new Set<UrlDemoStatusListener>()

export const getUrlDemoStatus = () => urlDemoStatus

export const subscribeToUrlDemoStatus = (listener: UrlDemoStatusListener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const setUrlDemoStatus = (status: UrlDemoStatus) => {
  urlDemoStatus = status
  listeners.forEach(listener => listener(status))
}

export interface UrlDemoRequest {
  urls: string[]
  names: string[]
  tick: number
}

const reportUrlDemoError = (error: unknown) => {
  console.error('[url-demo] failed to load demo', error)

  setUrlDemoStatus({
    state: 'error',
    message:
      error instanceof Error && error.message
        ? error.message
        : 'Could not load this demo. It may have been removed.',
  })
}

/**
 * Phase 1: work out WHAT to load, without downloading it yet. Resolves to null when no demo was
 * requested, so the normal drag-and-drop flow is untouched.
 */
export const resolveUrlDemoAction = async (): Promise<UrlDemoRequest | null> => {
  const params = new URLSearchParams(window.location.search)
  const urls = [params.get('demoUrl'), params.get('demoUrl2')].filter(
    (url): url is string => typeof url === 'string' && url.length > 0
  )

  if (urls.length === 0) return null

  const tick = Number(params.get('tick')) || 0

  try {
    setUrlDemoStatus({ state: 'resolving' })

    for (const url of urls) {
      if (!isAllowedDemoUrl(url)) throw new Error('That demo host is not allowed')
    }

    setUrlDemoStatus({ state: 'idle' })

    return {
      urls,
      names: urls.map(url => decodeURIComponent(url.split('/').pop() ?? 'demo.dem')),
      tick,
    }
  } catch (error) {
    reportUrlDemoError(error)
    return null
  }
}

/**
 * Phase 2: download and parse. Must run after the viewer has mounted, so the download progress
 * overlay is on screen. Returns the tick to seek to, which the caller applies once the scene is up.
 */
export const loadUrlDemoAction = async (
  request: UrlDemoRequest
): Promise<{ tick: number } | null> => {
  try {
    const inputs: DemoFileInput[] = []

    for (let index = 0; index < request.urls.length; index++) {
      const url = request.urls[index]
      await addDownloadAction({ type: 'demo', url, name: request.names[index] })

      const buffer: ArrayBuffer = await axios
        .get(url, {
          responseType: 'arraybuffer',
          onDownloadProgress: event => {
            updateDownloadAction(url, {
              progress: event.progress ? event.progress * 100 : 0,
              size: event.total,
            })
          },
        })
        .then(res => res.data)

      // Compressed responses carry no total, so the progress callback cannot reach 100%: clear the
      // entry once the bytes are in. The parse progress overlay takes over from here.
      removeDownloadAction(url)
      inputs.push({ name: request.names[index], buffer })
    }

    await parseDemoAction(inputs)

    return { tick: request.tick }
  } catch (error) {
    request.urls.forEach(url => removeDownloadAction(url))
    reportUrlDemoError(error)
    return null
  }
}
