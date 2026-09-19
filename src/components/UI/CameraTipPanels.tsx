import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import { useStore } from '@zus/store'
import { ControlsMode } from '@constants/types'

export const useShowTimeout = (
  controlsMode: ControlsMode,
  { forceShow }: { forceShow?: boolean } = {}
) => {
  const activeControlsMode = useStore(state => state.scene.controls.mode)
  const [showing, setShowing] = useState(false)

  useEffect(() => {
    let timeout: NodeJS.Timeout
    if (activeControlsMode === controlsMode) {
      setShowing(true)
      timeout = setTimeout(() => setShowing(false), 2000)
    }
    return () => timeout && clearTimeout(timeout)
  }, [activeControlsMode, forceShow])

  return { showing: activeControlsMode === controlsMode && (showing || forceShow) }
}

export const POVCameraTipPanel = () => {
  const { showing } = useShowTimeout('pov')

  return (
    <motion.div
      className="absolute w-72 rounded-3xl bg-pp-panel/80 p-6"
      animate={showing ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      initial={false}
    >
      <div className="mb-1 flex">
        <strong>POV Camera</strong>
      </div>

      <motion.div>
        <div className="mb-1 flex">
          <span>Next player</span>
          <div className="flex-1" />
          <kbd>1</kbd>
        </div>

        <div className="flex">
          <span>Previous player</span>
          <div className="flex-1" />
          <kbd>Shift + 1</kbd>
        </div>
      </motion.div>
    </motion.div>
  )
}

export const SpectatorCameraTipPanel = () => {
  const { showing } = useShowTimeout('spectator')

  return (
    <motion.div
      className="w-72 rounded-3xl bg-pp-panel/80 p-6"
      animate={showing ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      initial={false}
    >
      <div className="mb-1 flex">
        <strong>Free Camera</strong>
      </div>

      <motion.div>
        <div className="mb-1 flex">
          <span>Pan</span>
          <div className="flex-1" />
          <kbd>LMB</kbd>
        </div>

        <div className="mb-1 flex">
          <span>Rotate</span>
          <div className="flex-1" />
          <kbd>RMB</kbd>
        </div>

        <div className="mb-1 flex">
          <span>Pan up/down</span>
          <div className="flex-1" />
          <kbd>MMB</kbd>
        </div>

        <div className="mb-1 flex">
          <span>Movement</span>
          <div className="flex-1" />
          <kbd className="ml-1">W</kbd>
          <kbd className="ml-1">A</kbd>
          <kbd className="ml-1">S</kbd>
          <kbd className="ml-1">D</kbd>
        </div>

        <div className="mb-1 flex">
          <span>Up / down</span>
          <div className="flex-1" />
          <kbd className="ml-1">E</kbd>
          <kbd className="ml-1">Q</kbd>
        </div>

        <div className="mb-1 flex">
          <span>Boost</span>
          <div className="flex-1" />
          <kbd>Shift</kbd>
        </div>

        <div className="flex">
          <span>Move speed</span>
          <div className="flex-1" />
          <kbd>Scroll</kbd>
        </div>
      </motion.div>
    </motion.div>
  )
}
