import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import { UrlDemoStatus, getUrlDemoStatus, subscribeToUrlDemoStatus } from '@utils/embed'

/**
 * Status overlay for demos requested via the URL (?demoUrl= / ?demoUrl2=).
 *
 * Kept out of the zustand store on purpose — nothing else needs to read this, and a plain
 * subscription keeps the feature self-contained.
 */
export const UrlDemoNotice = () => {
  const [status, setStatus] = useState<UrlDemoStatus>(getUrlDemoStatus)

  useEffect(() => subscribeToUrlDemoStatus(setStatus), [])

  if (status.state === 'idle') return null

  return (
    <div className="ui-layer top-20 items-start justify-center">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-md rounded-lg bg-pp-panel/90 px-5 py-3 text-center"
      >
        {status.state === 'resolving' && <div>Looking up demo ...</div>}

        {status.state === 'error' && (
          <>
            <div className="font-bold">Couldn't load this demo</div>
            <div className="mt-1 text-sm opacity-70">{status.message}</div>
            <div className="mt-2 text-xs opacity-50">
              You can still drag <code>.dem</code> files in to watch them.
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
