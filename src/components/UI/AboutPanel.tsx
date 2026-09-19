import React, { useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'

import { TogglePanel, TogglePanelButton } from '@components/UI/Shared/TogglePanel'
import { TiInfoLargeIcon } from '@components/Misc/Icons'

import { useStore } from '@zus/store'
import {
  toggleUIPanelAction,
  parseDemoAction,
  onUploadDemoAction,
  goToTickAction,
  loadEmptySceneMapAction,
  addDownloadAction,
  updateDownloadAction,
} from '@zus/actions'
import { getAsset } from '@utils/misc'
import { PORTAL2_COOP_MAPS } from '@constants/portal2'

//
// ─── ABOUT PANEL ────────────────────────────────────────────────────────────────
//

const GITHUB_URL = 'https://github.com/candytaco/rhubarb.portal'
const DEMOFILES_URL = 'https://github.com/gallantlab/DemoFiles'
const SAMPLE_DEMOS = ['test player 1.dem', 'test player 2.dem']

export const AboutPanel = () => {
  const isOpen = useStore(state => state.ui.activePanels.includes('About'))
  const loadedMap = useStore(state => state.scene.map)

  const {
    open: openFileBrowser,
    getInputProps,
    acceptedFiles,
  } = useDropzone({
    noClick: true,
    noKeyboard: true,
    maxFiles: 2,
    multiple: true,
  })

  const toggleUIPanel = () => {
    toggleUIPanelAction('Settings', false)
    toggleUIPanelAction('EventLog', false)
    toggleUIPanelAction('Bookmarks', false)
    toggleUIPanelAction('Setups', false)
    toggleUIPanelAction('About')
  }

  const onClickDropSelectFile = async () => {
    openFileBrowser()
  }

  const onClickSampleDemo = async () => {
    const sampleDemoFiles = await Promise.all(
      SAMPLE_DEMOS.map(async name => {
        const url = getAsset(`/samples/${encodeURIComponent(name)}`)

        await addDownloadAction({ type: 'demo', url, name })

        const fileBuffer: ArrayBuffer = await axios
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

        return { name, buffer: fileBuffer }
      })
    )

    await parseDemoAction(sampleDemoFiles)
    goToTickAction(600)
  }

  const onClickMapName = async (mapName: string) => {
    loadEmptySceneMapAction(mapName)
  }

  useEffect(() => {
    if (acceptedFiles.length > 0) onUploadDemoAction(acceptedFiles)
  }, [acceptedFiles, onUploadDemoAction])

  return (
    <div className="flex items-start">
      <TogglePanelButton onClick={toggleUIPanel}>
        <TiInfoLargeIcon />
      </TogglePanelButton>

      <TogglePanel showCloseButton isOpen={isOpen} onClickClose={toggleUIPanel}>
        <div className="max-h-[75vh] overflow-auto px-8 pb-12 pt-8">
          <div className="flex items-center">
            {/* Logo */}

            <img src="/logo192.png" alt="rhubarb.portal" className="mr-4 h-16 w-16" />

            <div className="w-full">
              {/* Title */}

              <div className="inline-block text-3xl font-bold leading-none tracking-tight">
                rhubarb<span className="opacity-70">.portal</span>
              </div>

              {/* External URLs */}

              <div className="flex text-xs">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener referrer"
                  className="inline-block text-left underline opacity-60 transition-all hover:underline hover:opacity-100"
                >
                  Github
                </a>
                <div className="mx-1 opacity-60">/</div>
                <a
                  href={DEMOFILES_URL}
                  target="_blank"
                  rel="noopener referrer"
                  className="inline-block text-left underline opacity-60 transition-all hover:underline hover:opacity-100"
                >
                  DemoFiles parser
                </a>
              </div>
            </div>
          </div>

          {/* Description */}

          <div className="mt-5">
            <p>Replay Portal 2 co-op demos in your browser.</p>
            <p className="mt-2 text-sm opacity-70">
              Drop one player&apos;s <code>.dem</code> file, or both players&apos; demos of the same
              session. Two demos are merged on the server clock, so both bots, their portals and the
              chamber elements come from whichever demo saw them.
            </p>
          </div>

          {/* Main CTAs */}

          <div className="mt-8 flex items-center justify-center text-sm">
            <input {...getInputProps()} />
            <button
              className="rounded-full border border-dashed px-3.5 py-1 transition-all hover:border-solid hover:bg-black hover:invert"
              onClick={onClickDropSelectFile}
            >
              Drop/select <code>.dem</code> file(s)
            </button>

            <div className="mx-2">/</div>

            <button
              className="flex cursor-pointer items-center rounded-full bg-pp-accent-tertiary px-3.5 py-1 font-medium tracking-wide transition-all hover:bg-white hover:text-pp-accent-tertiary"
              onClick={onClickSampleDemo}
            >
              Load sample demos
            </button>
            {/* Spacer to make button look more balanced */}
            <div className="w-4" />
          </div>

          {/* Controls */}

          <p className="mb-2 mt-10 text-xs font-black uppercase opacity-60">Controls</p>

          <div className="grid grid-cols-[auto,1fr] gap-y-1">
            {[
              ['Left Mouse', 'Pan camera in the ground plane'],
              ['Right Mouse', 'Rotate camera'],
              ['Middle Mouse', 'Pan camera up, down, left and right'],
              ['WASD', 'Move camera in the ground plane'],
              ['E / Q', 'Move camera up / down'],
              ['Scroll', 'Movement speed while a movement key is held'],
              ['1 / 2', 'Bot POV / free camera'],
              ['F', 'Drawing tools'],
            ].map(([key, value]) => (
              <React.Fragment key={`controls-${value}`}>
                <div className="flex items-center">
                  <b className="flex-shrink-0">{key}</b>
                  <div className="mx-2 h-px w-full min-w-3 bg-white/10" />
                </div>
                <span>{value}</span>
              </React.Fragment>
            ))}
          </div>

          {/* Maps */}

          <p className="mb-2 mt-10 text-xs font-black uppercase opacity-60">Co-op maps</p>

          <p className="mb-3 text-xs opacity-60">
            Map geometry is served from <code>public/models/maps/&lt;map&gt;/</code> once converted;
            maps without assets show the recorded positions over a grid.
          </p>

          <div className="grid grid-cols-2 gap-y-1 text-sm">
            {PORTAL2_COOP_MAPS.map(mapName => (
              <div key={`map-${mapName}`} className="flex justify-start">
                <div
                  className={`cursor-pointer hover:underline ${mapName === loadedMap ? 'font-bold' : ''}`}
                  onClick={onClickMapName.bind(this, mapName)}
                >
                  <span className="opacity-50">&bull;</span>
                  &nbsp;&nbsp;{mapName}
                </div>
              </div>
            ))}
          </div>
        </div>
      </TogglePanel>
    </div>
  )
}
