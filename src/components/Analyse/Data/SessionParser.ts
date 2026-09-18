// Main-thread client of the parse worker

import type { Portal2Session } from './Session'
import type { ParseWorkerRequest, ParseWorkerResponse } from './ParseWorker'

export interface DemoFileInput {
  name: string
  buffer: ArrayBuffer
}

export type ParseProgressCallback = (progress: number, stage: string) => void

/**
 * Parses one or two demo files in a Web Worker and resolves with the session
 */
export function parseSession(
  files: DemoFileInput[],
  onProgress: ParseProgressCallback
): Promise<Portal2Session> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ParseWorker.ts', import.meta.url), { type: 'module' })
    const request: ParseWorkerRequest = { files }

    worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
      const data = event.data
      if ('error' in data) {
        worker.terminate()
        reject(new Error(data.error))
        return
      }
      if ('progress' in data) {
        onProgress(data.progress, data.stage)
        return
      }
      worker.terminate()
      resolve(data.session)
    }

    worker.onerror = event => {
      worker.terminate()
      reject(
        event.error instanceof Error
          ? event.error
          : new Error(event.message || 'Parse worker failed')
      )
    }

    worker.postMessage(
      request,
      files.map(file => file.buffer)
    )
  })
}
