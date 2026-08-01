import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC, type DisplayBounds, type SpotifyControlAction } from '../shared/types'

let controlWindow: BrowserWindow | null = null
let displayWindow: BrowserWindow | null = null
let pendingWindowedBounds: Electron.Rectangle | null = null
let quitting = false
let screenListenersRegistered = false
let displayPlacementTimer: ReturnType<typeof setTimeout> | null = null
let fullScreenTransitionTimer: ReturnType<typeof setTimeout> | null = null
let fullScreenTransitionBusy = false
let pendingDisplayPlacement = false
let lastKnownDisplayId: number | null = null

const DISPLAY_PLACEMENT_DEBOUNCE_MS = 500
const FULL_SCREEN_TRANSITION_TIMEOUT_MS = 2_000

app.on('before-quit', () => {
  quitting = true
})

function rendererUrl(entry: 'control.html' | 'display.html'): string | null {
  const developmentUrl = process.env['ELECTRON_RENDERER_URL']
  if (!is.dev || !developmentUrl) return null
  return new URL(
    entry,
    developmentUrl.endsWith('/') ? developmentUrl : `${developmentUrl}/`
  ).toString()
}

function loadRenderer(window: BrowserWindow, entry: 'control.html' | 'display.html'): void {
  const url = rendererUrl(entry)
  if (url) {
    void window.loadURL(url)
  } else {
    void window.loadFile(join(__dirname, `../renderer/${entry}`))
  }
}

function commonWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
  }
}

export function getDisplayBounds(): DisplayBounds {
  if (!displayWindow || displayWindow.isDestroyed()) {
    return { width: 960, height: 540, isFullScreen: false }
  }
  const [width, height] = displayWindow.getContentSize()
  return { width, height, isFullScreen: displayWindow.isFullScreen() }
}

function sendDisplayBounds(): void {
  if (!controlWindow || controlWindow.isDestroyed()) return
  controlWindow.webContents.send(IPC.displayBoundsChanged, getDisplayBounds())
}

export function sendSpotifyControl(action: SpotifyControlAction): void {
  if (!controlWindow || controlWindow.isDestroyed()) return
  controlWindow.webContents.send(IPC.spotifyControl, action)
}

export function setDisplayFullScreen(flag: boolean): void {
  if (!displayWindow || displayWindow.isDestroyed()) return
  if (displayWindow.isFullScreen() === flag) return

  if (flag) {
    pendingWindowedBounds = null
    beginFullScreenTransition()
    displayWindow.setFullScreen(true)
    return
  }

  const targetDisplay = screen.getDisplayMatching(displayWindow.getBounds())
  const width = 960
  const height = 540
  pendingWindowedBounds = {
    x: targetDisplay.workArea.x + Math.round((targetDisplay.workArea.width - width) / 2),
    y: targetDisplay.workArea.y + Math.round((targetDisplay.workArea.height - height) / 2),
    width,
    height
  }
  beginFullScreenTransition()
  displayWindow.setFullScreen(false)
  if (!displayWindow.isFullScreen()) applyPendingWindowedBounds()
}

function beginFullScreenTransition(): void {
  fullScreenTransitionBusy = true
  if (fullScreenTransitionTimer) clearTimeout(fullScreenTransitionTimer)
  fullScreenTransitionTimer = setTimeout(
    finishFullScreenTransition,
    FULL_SCREEN_TRANSITION_TIMEOUT_MS
  )
}

function finishFullScreenTransition(): void {
  if (fullScreenTransitionTimer) {
    clearTimeout(fullScreenTransitionTimer)
    fullScreenTransitionTimer = null
  }
  fullScreenTransitionBusy = false
  if (!pendingDisplayPlacement) return
  pendingDisplayPlacement = false
  placeDisplayWindow()
}

function applyPendingWindowedBounds(): void {
  if (!displayWindow || displayWindow.isDestroyed() || !pendingWindowedBounds) return
  displayWindow.setBounds(pendingWindowedBounds)
  pendingWindowedBounds = null
  sendDisplayBounds()
}

function placeDisplayWindow(): void {
  if (!displayWindow || displayWindow.isDestroyed()) return
  if (fullScreenTransitionBusy) {
    pendingDisplayPlacement = true
    return
  }

  const primary = screen.getPrimaryDisplay()
  const external = screen.getAllDisplays().find((candidate) => candidate.id !== primary.id)
  const currentDisplay = screen.getDisplayMatching(displayWindow.getBounds())
  const isFullScreen = displayWindow.isFullScreen()

  if (external) {
    if (currentDisplay.id === external.id && isFullScreen) {
      lastKnownDisplayId = currentDisplay.id
      return
    }

    pendingWindowedBounds = null
    if (isFullScreen) {
      pendingDisplayPlacement = true
      beginFullScreenTransition()
      displayWindow.setFullScreen(false)
      return
    }

    displayWindow.setBounds(external.bounds)
    lastKnownDisplayId = external.id
    beginFullScreenTransition()
    displayWindow.setFullScreen(true)
    sendDisplayBounds()
    return
  }

  if (currentDisplay.id === primary.id && !isFullScreen) {
    lastKnownDisplayId = currentDisplay.id
    return
  }

  const width = 960
  const height = 540
  pendingWindowedBounds = {
    x: primary.workArea.x + Math.round((primary.workArea.width - width) / 2),
    y: primary.workArea.y + Math.round((primary.workArea.height - height) / 2),
    width,
    height
  }
  if (isFullScreen) {
    beginFullScreenTransition()
    displayWindow.setFullScreen(false)
    return
  }
  applyPendingWindowedBounds()
  lastKnownDisplayId = primary.id
  sendDisplayBounds()
}

function scheduleDisplayPlacement(): void {
  if (displayPlacementTimer) clearTimeout(displayPlacementTimer)
  displayPlacementTimer = setTimeout(() => {
    displayPlacementTimer = null
    placeDisplayWindow()
  }, DISPLAY_PLACEMENT_DEBOUNCE_MS)
}

function scheduleDisplayPlacementForMetricsChange(): void {
  if (!displayWindow || displayWindow.isDestroyed()) return
  const primary = screen.getPrimaryDisplay()
  const displays = screen.getAllDisplays()
  const target = displays.find((candidate) => candidate.id !== primary.id) ?? primary
  const current = screen.getDisplayMatching(displayWindow.getBounds())
  const previousDisplayWasRemoved =
    lastKnownDisplayId !== null &&
    !displays.some((candidate) => candidate.id === lastKnownDisplayId)
  if (previousDisplayWasRemoved || current.id !== target.id) scheduleDisplayPlacement()
}

function registerScreenListeners(): void {
  if (screenListenersRegistered) return
  screenListenersRegistered = true
  screen.on('display-added', scheduleDisplayPlacement)
  screen.on('display-removed', scheduleDisplayPlacement)
  screen.on('display-metrics-changed', scheduleDisplayPlacementForMetricsChange)
}

export function createWindows(): void {
  quitting = false
  registerScreenListeners()
  controlWindow = new BrowserWindow({
    title: 'pplayer — 操作',
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: commonWebPreferences()
  })
  controlWindow.once('ready-to-show', () => controlWindow?.show())
  controlWindow.on('closed', () => {
    controlWindow = null
    quitting = true
    app.quit()
  })
  loadRenderer(controlWindow, 'control.html')

  displayWindow = new BrowserWindow({
    title: 'pplayer — 表示',
    width: 960,
    height: 540,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: commonWebPreferences()
  })
  displayWindow.once('ready-to-show', () => {
    placeDisplayWindow()
    displayWindow?.show()
  })
  displayWindow.on('resize', sendDisplayBounds)
  displayWindow.on('enter-full-screen', () => {
    sendDisplayBounds()
    finishFullScreenTransition()
  })
  displayWindow.on('leave-full-screen', () => {
    if (pendingWindowedBounds) {
      applyPendingWindowedBounds()
    } else {
      sendDisplayBounds()
    }
    finishFullScreenTransition()
  })
  displayWindow.on('close', (event) => {
    if (!quitting) event.preventDefault()
  })
  displayWindow.on('closed', () => {
    displayWindow = null
    pendingDisplayPlacement = false
    fullScreenTransitionBusy = false
    lastKnownDisplayId = null
    if (displayPlacementTimer) {
      clearTimeout(displayPlacementTimer)
      displayPlacementTimer = null
    }
    if (fullScreenTransitionTimer) {
      clearTimeout(fullScreenTransitionTimer)
      fullScreenTransitionTimer = null
    }
  })
  loadRenderer(displayWindow, 'display.html')
}
