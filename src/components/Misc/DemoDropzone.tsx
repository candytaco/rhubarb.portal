import { useEventListener } from '@utils/hooks'
import { getState } from '@zus/store'
import { toggleUIPanelAction } from '@zus/actions'

/**
 * Tells whether a drag carries files rather than page content such as selected text.
 * @param event - The drag event to inspect
 * @returns Whether the drag carries files
 */
function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Opens the load panel as soon as files are dragged over the window so that the drop can land in
 * one of its slots. This is deliberately not a drop target itself, which leaves the panel's fields
 * free to take the drop; it only stops the browser from opening a file dropped outside them.
 */
export const DemoDropzone = () => {
  const handleDragEnter = (event: DragEvent) => {
    if (!isFileDrag(event)) return
    if (getState().ui.activePanels.includes('Load')) return

    toggleUIPanelAction('Settings', false)
    toggleUIPanelAction('About', false)
    toggleUIPanelAction('EventLog', false)
    toggleUIPanelAction('Bookmarks', false)
    toggleUIPanelAction('Setups', false)
    toggleUIPanelAction('Load', true)
  }

  // A file dropped anywhere but a panel field would otherwise navigate away from the viewer. The
  // fields stop propagation of their own drops, so these never see them.
  const ignoreDrag = (event: DragEvent) => {
    if (isFileDrag(event)) event.preventDefault()
  }

  useEventListener('dragenter', handleDragEnter, window)
  useEventListener('dragover', ignoreDrag, window)
  useEventListener('drop', ignoreDrag, window)

  return null
}
