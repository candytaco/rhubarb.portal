import type { Portal2Session } from '@components/Analyse/Data/Session'

const TTL_FLASH_SECONDS = 0.5

export interface TTLFlashProps {
  session: Portal2Session
  tick: number
}

/**
 * Green TTL square that lights up on each scanner pulse and fades out over the following half
 * second, driven by the playback tick so scrubbing shows the same state
 */
export const TTLFlash = ({ session, tick }: TTLFlashProps) => {
  const pulseRow = findLatestRowAtOrBefore(session.ttlRows, tick)
  const ageSeconds = pulseRow === null ? Infinity : (tick - pulseRow) * session.intervalPerTick
  const opacity = ageSeconds < TTL_FLASH_SECONDS ? 1 - ageSeconds / TTL_FLASH_SECONDS : 0

  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-400 text-xs font-black text-black"
      style={{ opacity }}
      title="Scanner pulse"
    >
      TTL
    </div>
  )
}

/**
 * Finds the last row in an ascending row list that is at or before a tick.
 * @param rows - Ascending axis rows
 * @param tick - Axis row to search up to
 * @returns The matching row, or null when every row is after the tick
 */
function findLatestRowAtOrBefore(rows: Int32Array, tick: number): number | null {
  let low = 0
  let high = rows.length - 1
  let found: number | null = null
  while (low <= high) {
    const middle = (low + high) >> 1
    if (rows[middle] <= tick) {
      found = rows[middle]
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}
