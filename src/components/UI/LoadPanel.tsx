import { useState } from 'react'
import { useDropzone } from 'react-dropzone'

import { TogglePanel, TogglePanelButton } from '@components/UI/Shared/TogglePanel'
import { HiArrowUpTrayIcon } from '@components/Misc/Icons'
import { UIPanelType } from '@constants/types'
import { cn } from '@utils/styling'
import { useStore } from '@zus/store'
import { loadSessionFilesAction, toggleUIPanelAction } from '@zus/actions'

const DEMO_ACCEPT = '.dem'
const RECORDING_ACCEPT = ['video/*', '.mp4', '.webm', '.mkv', '.mov', '.avi']
const PLAYER_SLOTS = [0, 1]
const EMPTY_SLOTS: (File | null)[] = [null, null]

export interface FileDropFieldProps {
  label: string
  hint: string
  accept: string | string[]
  file: File | null
  onChange: (file: File | null) => void
}

/**
 * One labelled drag-and-drop field holding a single file, with a button that opens the file
 * picker and another that empties the field.
 * @param props - Label, placeholder hint, accepted types, the held file and its change handler
 */
export const FileDropField = (props: FileDropFieldProps) => {
  const { label, hint, accept, file, onChange } = props

  const { getRootProps, getInputProps, open, isDragActive, fileRejections } = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: false,
    maxFiles: 1,
    accept,
    onDrop: (accepted: File[]) => {
      if (accepted.length > 0) onChange(accepted[0])
    },
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex flex-col rounded-2xl border border-dashed p-3 transition-colors',
        isDragActive ? 'border-white bg-white/10' : 'border-white/25 bg-black/20'
      )}
    >
      <input {...getInputProps()} />

      <div className="text-[0.65rem] uppercase tracking-[0.2em] opacity-50">{label}</div>

      <div className="mt-1 truncate text-sm" title={file ? file.name : undefined}>
        {file ? file.name : <span className="opacity-40">{hint}</span>}
      </div>

      {fileRejections.length > 0 && !file && (
        <div className="mt-1 text-xs text-pp-health-low">That file type is not accepted</div>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs">
        <button
          type="button"
          className="rounded-full border border-dashed px-3 py-1 transition-all hover:border-solid hover:bg-white hover:text-black"
          onClick={open}
        >
          Choose file
        </button>

        {file && (
          <button
            type="button"
            className="rounded-full px-2 py-1 opacity-50 transition-all hover:opacity-100"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Copies a per-slot file list with one slot replaced.
 * @param files - The current file for each player slot
 * @param slot - Slot to replace
 * @param file - File to put in that slot, or null to empty it
 * @returns The new per-slot file list
 */
function replaceSlot(files: (File | null)[], slot: number, file: File | null): (File | null)[] {
  return files.map((existing, index) => (index === slot ? file : existing))
}

/**
 * Panel that takes both players' demos and screen recordings, one drag-and-drop field each, and
 * loads them together when the Load button is pressed
 */
export const LoadPanel = () => {
  const isOpen = useStore(state => state.ui.activePanels.includes(UIPanelType.LOAD))

  const [demoFiles, setDemoFiles] = useState<(File | null)[]>(EMPTY_SLOTS)
  const [recordingFiles, setRecordingFiles] = useState<(File | null)[]>(EMPTY_SLOTS)

  const hasAnyFile = [...demoFiles, ...recordingFiles].some(file => file !== null)

  const toggleUIPanel = () => {
    toggleUIPanelAction(UIPanelType.SETTINGS, false)
    toggleUIPanelAction(UIPanelType.ABOUT, false)
    toggleUIPanelAction(UIPanelType.EVENT_LOG, false)
    toggleUIPanelAction(UIPanelType.BOOKMARKS, false)
    toggleUIPanelAction(UIPanelType.SETUPS, false)
    toggleUIPanelAction(UIPanelType.LOAD)
  }

  const onClickLoad = async () => {
    const loaded = await loadSessionFilesAction(demoFiles, recordingFiles)
    if (!loaded) return

    setDemoFiles(EMPTY_SLOTS)
    setRecordingFiles(EMPTY_SLOTS)
  }

  return (
    <div className="flex items-start">
      <TogglePanelButton onClick={toggleUIPanel}>
        <HiArrowUpTrayIcon />
      </TogglePanelButton>

      <TogglePanel showCloseButton isOpen={isOpen} onClickClose={toggleUIPanel}>
        <div className="max-h-[75vh] w-[34rem] max-w-full overflow-auto p-8">
          <div className="text-xl font-bold">Load a session</div>

          <p className="mt-1 text-sm opacity-60">
            Each player&apos;s demo and screen recording. Fields left empty keep what is already
            loaded.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PLAYER_SLOTS.map(slot => (
              <div key={`load-slot-${slot}`} className="flex flex-col gap-2">
                <div className="text-xs font-black uppercase opacity-60">Player {slot + 1}</div>

                <FileDropField
                  label="Demo"
                  hint="Drop a .dem file"
                  accept={DEMO_ACCEPT}
                  file={demoFiles[slot]}
                  onChange={file => setDemoFiles(files => replaceSlot(files, slot, file))}
                />

                <FileDropField
                  label="Screen recording"
                  hint="Drop a video file"
                  accept={RECORDING_ACCEPT}
                  file={recordingFiles[slot]}
                  onChange={file => setRecordingFiles(files => replaceSlot(files, slot, file))}
                />
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end">
            <button
              type="button"
              disabled={!hasAnyFile}
              className={cn(
                'rounded-full px-5 py-1.5 text-sm font-medium tracking-wide transition-all',
                hasAnyFile
                  ? 'cursor-pointer bg-pp-accent-tertiary hover:bg-white hover:text-pp-accent-tertiary'
                  : 'cursor-not-allowed bg-white/10 opacity-40'
              )}
              onClick={onClickLoad}
            >
              Load
            </button>
          </div>
        </div>
      </TogglePanel>
    </div>
  )
}
