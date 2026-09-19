import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import { useInstance } from '@zus/store'

const HIDE_DELAY_MS = 1000

/**
 * Free camera move speed, shown in the middle of the viewport while the wheel adjusts it and
 * fading out after a second without scrolling
 */
export const MoveSpeedNotice = () => {
  const notice = useInstance(state => state.moveSpeedNotice)
  const [showing, setShowing] = useState(false)

  useEffect(() => {
    if (!notice) return
    setShowing(true)
    const timeout = setTimeout(() => setShowing(false), HIDE_DELAY_MS)
    return () => clearTimeout(timeout)
  }, [notice])

  if (!notice) return null

  return (
    <motion.div
      className="rounded-2xl bg-pp-panel/80 px-5 py-3 text-center"
      animate={{ opacity: showing ? 1 : 0 }}
      transition={{ duration: showing ? 0.1 : 0.4 }}
      initial={false}
    >
      <div className="text-xs font-black uppercase opacity-60">Move speed</div>
      <div className="text-2xl font-bold">{formatMoveSpeed(notice.value)}</div>
    </motion.div>
  )
}

/**
 * Formats a move speed for the notice: one decimal below 10, whole units above.
 * @param value - Move speed in world units per second
 * @returns The formatted speed
 */
function formatMoveSpeed(value: number): string {
  return value >= 10 ? Math.round(value).toString() : value.toFixed(1)
}
