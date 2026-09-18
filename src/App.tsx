import React from 'react'

import { ViewerPage } from '@pages/ViewerPage'
import {
  bootstrapSharedSetupFromHashAction,
  goToTickAction,
  loadEmptySceneMapAction,
  loadSetupsAction,
  loadSettingsAction,
} from '@zus/actions'
import { getState } from '@zus/store'
import { loadUrlDemoAction, resolveUrlDemoAction } from '@utils/embed'

class App extends React.Component {
  state = {
    isReady: false,
  }

  //
  // ─── LIFECYCLE ──────────────────────────────────────────────────────────────────
  //

  async componentDidMount() {
    await loadSettingsAction()
    await loadSetupsAction()
    const sharedSetup = await bootstrapSharedSetupFromHashAction()

    // Demos may be requested by URL (?demoUrl= / ?demoUrl2=), see @utils/embed. The map is only
    // known once a demo is parsed, so the scene boots into the default or shared setup map first.
    const urlDemo = await resolveUrlDemoAction()

    await loadEmptySceneMapAction(sharedSetup?.map ?? getState().scene.map)

    this.setState({ isReady: true })

    // Only once the viewer is mounted: the download progress overlay lives there.
    if (urlDemo) {
      const loaded = await loadUrlDemoAction(urlDemo)
      if (loaded?.tick) goToTickAction(loaded.tick)
    }

    // Completely disable right clicks cause it's kinda annoying
    // when interacting with UI elements
    window.addEventListener('contextmenu', event => {
      event.preventDefault()
    })
  }

  //
  // ─── RENDER ─────────────────────────────────────────────────────────────────────
  //

  render() {
    return this.state.isReady ? <ViewerPage /> : null
  }
}

export default App
