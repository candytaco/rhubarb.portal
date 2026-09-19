import { useEffect } from 'react'
import { motion } from 'framer-motion'

import { IoArrowForwardSharpIcon } from '@components/Misc/Icons'
import { GlobalKeyHandler } from '@components/Misc/GlobalKeyHandler'
import { DemoDropzone } from '@components/Misc/DemoDropzone'
import { UrlDemoNotice } from '@components/Misc/UrlDemoNotice'
import { DemoDrawing } from '@components/Misc/DemoDrawing'
import { DemoViewer } from '@components/DemoViewer'
import { SessionSidebar } from '@components/UI/SessionSidebar'
import { POVCameraTipPanel, SpectatorCameraTipPanel } from '@components/UI/CameraTipPanels'

import { useStore, useInstance } from '@zus/store'
import { applySetupAction } from '@zus/actions'
import { useIsMobile } from '@utils/hooks'

/**
 * Page layout: the 3D viewer takes the left two thirds of a widescreen page and the right third
 * holds the two players' screen recording placeholders. Below 1024px the column stacks under
 * the viewer. Every overlay is positioned relative to the viewer cell, not the window.
 */
const ViewerPage = () => {
  const parser = useStore(state => state.parser)
  const session = useInstance(state => state.session)
  const loadedMap = useStore(state => state.scene.map)
  const setupCameraBridge = useInstance(state => state.setupCameraBridge)
  const pendingSharedSetup = useStore(state => state.setups.pendingSharedSetup)
  const isMobile = useIsMobile()

  const loadingDownloads = useStore(state =>
    Array.from(state.downloads.values()).filter(({ status }) => status === 'loading')
  )

  //
  // ─── LIFECYCLE ──────────────────────────────────────────────────────────────────
  //

  useEffect(() => {
    if (!pendingSharedSetup || !setupCameraBridge) return
    applySetupAction(pendingSharedSetup, { fromShared: true })
  }, [pendingSharedSetup, setupCameraBridge])

  //
  // ─── RENDER ─────────────────────────────────────────────────────────────────────
  //

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden antialiased lg:grid lg:grid-cols-[2fr_1fr] lg:grid-rows-1">
      <GlobalKeyHandler />

      {/* Viewer cell: the canvas plus every overlay */}
      <div className="relative h-[60vh] min-h-0 flex-none lg:h-screen">
        <DemoViewer session={session} map={loadedMap} />

        {/* Downloads overlay */}
        {loadingDownloads.length > 0 && (
          <div className="ui-layer m-4 items-start justify-center">
            <div className="flex flex-col gap-2">
              {loadingDownloads.map(download => (
                <motion.div
                  key={download.url}
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="pointer-events-none relative overflow-hidden rounded-lg bg-pp-panel/80 px-4 py-3"
                >
                  <div
                    className="absolute inset-0 right-[unset] bg-white/30"
                    style={{ width: `${download.progress.toFixed(1)}%` }}
                  />

                  <div className="flex items-center">
                    <div className="animate-bounce">
                      <IoArrowForwardSharpIcon className="mr-2 rotate-90" />
                    </div>

                    <div>
                      <div className="text-xs uppercase opacity-50">
                        Downloading {download.type}
                        {download.size && `- ${(download.size / (1024 * 1024)).toFixed(2)}MB`}
                      </div>

                      <div>
                        {download.name} ... {download.progress.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Parsing demo overlay */}
        <div className="ui-layer top-20 items-start justify-center">
          <motion.div
            className="pointer-events-none inline-flex rounded-lg bg-pp-panel/80 px-5 py-2"
            animate={parser.status === 'loading' ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            initial={false}
          >
            <div>
              {parser.stage || 'Parsing demo'} ... {parser.progress}%
            </div>
          </motion.div>
        </div>

        {/* Status for demos requested via the URL */}
        <UrlDemoNotice />

        {/* Camera tip panels overlays - hidden on mobile (keyboard shortcuts not relevant) */}
        {!isMobile && (
          <div className="ui-layer pointer-events-none bottom-0 right-0 items-end justify-end overflow-hidden p-4 [&>div]:pointer-events-none">
            <POVCameraTipPanel />
            <SpectatorCameraTipPanel />
          </div>
        )}

        {/* Drawing overlay */}
        <div className="ui-layer">
          <DemoDrawing />
        </div>

        {/* Dropzone overlay */}
        {parser.status !== 'loading' && (
          <div className="ui-layer">
            <DemoDropzone />
          </div>
        )}
      </div>

      {/* Right column: screen recording placeholders and session details */}
      <SessionSidebar />
    </div>
  )
}

export { ViewerPage }
