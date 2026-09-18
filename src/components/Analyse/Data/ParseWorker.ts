// Parse worker: receives one or two demo files, builds the Portal2Session and posts it back
// with its typed arrays transferred.

import { buildSession } from './SessionBuilder'
import { sessionTransferables } from './Session'

declare function postMessage(message: any, transfer?: any[]): void

export interface ParseWorkerRequest {
  files: { name: string; buffer: ArrayBuffer }[]
}

export type ParseWorkerResponse =
  | { progress: number; stage: string }
  | { error: string }
  | { session: import('./Session').Portal2Session }

onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  try {
    const inputs = event.data.files.map(file => ({ fileName: file.name, buffer: file.buffer }))
    const session = buildSession(inputs, (fraction, stage) => {
      postMessage({ progress: Math.round(fraction * 1000) / 10, stage })
    })
    postMessage({ session }, sessionTransferables(session))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(error)
    postMessage({ error: message })
  }
}
