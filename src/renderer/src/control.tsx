import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import { createRoot } from 'react-dom/client'
import { buildCycles, cycleDuration } from '../../shared/timeline'
import type {
  DisplayBounds,
  MaterialType,
  PlaybackCommand,
  PreviewTarget,
  SpotifySettingsState
} from '../../shared/types'
import { AudioSettings } from './control/AudioSettings'
import { BgmPanel } from './control/BgmPanel'
import { CueListPanel } from './control/CueListPanel'
import { ExportPanel } from './control/ExportPanel'
import { MaskSettings } from './control/MaskSettings'
import { DisplaySleepSettings } from './control/DisplaySleepSettings'
import { LanguageSettings } from './control/LanguageSettings'
import { LocalBgmLibrary } from './control/LocalBgmLibrary'
import { MaterialLibrary } from './control/MaterialLibrary'
import { MaterialPreviewModal } from './control/MaterialPreviewModal'
import { PhotoListPanel } from './control/PhotoListPanel'
import { TimingSettings } from './control/TimingSettings'
import { TransportPanel } from './control/TransportPanel'
import { RemoteSettings } from './control/RemoteSettings'
import { useKeyboardShortcuts } from './control/useKeyboardShortcuts'
import * as spotifyPlayer from './control/lib/spotifyPlayer'
import * as localBgmPlayer from './control/lib/localBgmPlayer'
import { getActiveBgmSource } from './control/lib/bgmSource'
import { PlaybackCanvas } from './lib/PlaybackCanvas'
import { resolvePlaybackFrame } from './lib/playbackFrame'
import { useAppState } from './useAppState'
import { LocaleProvider, useT } from './i18n/LocaleProvider'
import './styles.css'

export function Control(): React.JSX.Element {
  const t = useT()
  const state = useAppState()
  const [viewMode, setViewMode] = useState<'show' | 'setup'>(() =>
    localStorage.getItem('pplayer.viewMode') === 'setup' ? 'setup' : 'show'
  )
  const [setupSection, setSetupSection] = useState<
    'materials' | 'bgm' | 'stage' | 'audio' | 'export' | 'remote' | 'display'
  >('materials')
  const [displayBounds, setDisplayBounds] = useState<DisplayBounds>({
    width: 960,
    height: 540,
    isFullScreen: false
  })
  const [now, setNow] = useState(0)
  const [centerView, setCenterView] = useState<'materials' | 'editor'>('materials')
  const [inlineMessage, setInlineMessage] = useState<string | null>(null)
  const [previewPhotoId, setPreviewPhotoId] = useState<string | null>(null)
  const [previewTarget, setPreviewTarget] = useState<{ type: MaterialType; id: string } | null>(
    null
  )
  const [spotifySettings, setSpotifySettings] = useState<SpotifySettingsState | null>(null)
  const messageTimer = useRef<number | null>(null)
  const prevCueIdRef = useRef<string | null | undefined>(undefined)
  const send = useCallback((command: PlaybackCommand): void => window.api.sendCommand(command), [])
  const changeViewMode = useCallback((next: 'show' | 'setup'): void => {
    setViewMode(next)
    localStorage.setItem('pplayer.viewMode', next)
  }, [])
  const activeCue = state?.cues.find((cue) => cue.id === state.activeCueId)
  useKeyboardShortcuts(activeCue?.materialType, send, () => setPreviewPhotoId(null))

  useEffect(() => {
    document.title = t('app.controlTitle')
  }, [t])

  useEffect(() => {
    const unsubscribe = window.api.onSpotifySettingsChanged(setSpotifySettings)
    void window.api.getSpotifySettings().then(setSpotifySettings)
    return unsubscribe
  }, [])

  useEffect(
    () =>
      window.api.onSpotifyControl((action) => {
        const local = localBgmPlayer.getSnapshot()
        const spotify = spotifyPlayer.getSnapshot()
        const localSession = Boolean(local.trackName)
        const spotifySession = spotify.active || Boolean(spotify.trackName)
        const localPlaying = localSession && !local.paused
        const spotifyPlaying = spotifySession && !spotify.paused
        let source = getActiveBgmSource()
        if (localPlaying !== spotifyPlaying) source = localPlaying ? 'local' : 'spotify'
        else if (!source || (source === 'local' ? !localSession : !spotifySession)) {
          source = localSession ? 'local' : spotifySession ? 'spotify' : 'local'
        }
        const target = source === 'spotify' ? spotifyPlayer : localBgmPlayer
        if (action === 'playPause') target.togglePlay()
        else if (action === 'next') target.nextTrack()
        else target.previousTrack()
      }),
    []
  )

  useEffect(() => {
    if (spotifySettings?.connected) spotifyPlayer.ensureStarted()
    else if (spotifySettings) spotifyPlayer.stopPlayer()
  }, [spotifySettings?.connected])

  useEffect(() => {
    if (!state) return
    localBgmPlayer.setMasterGain(state.masterVolume)
    spotifyPlayer.setMasterGain(state.masterVolume)
  }, [state?.masterVolume])

  useEffect(() => {
    if (!state) return
    localBgmPlayer.setOutputDevice(state.audioOutputDeviceId)
  }, [state?.audioOutputDeviceId])

  useEffect(() => {
    if (!state) return
    localBgmPlayer.setCrossfade(state.localBgm.crossfadeMode, state.localBgm.fadeMs)
  }, [state?.localBgm.crossfadeMode, state?.localBgm.fadeMs])

  useEffect(() => {
    if (!state) return
    const id = state.activeCueId
    if (prevCueIdRef.current === undefined) {
      prevCueIdRef.current = id
      return
    }
    if (id === prevCueIdRef.current) return
    prevCueIdRef.current = id
    const cue = state.cues.find((item) => item.id === id)
    const bgm = cue?.bgm
    if (!bgm || bgm.mode === 'continue') return
    if (bgm.mode === 'stop') {
      void spotifyPlayer.transitionToBgm(bgm)
      void localBgmPlayer.stopWithFade(bgm.fadeMs)
    } else if (bgm.source === 'local') {
      const playlist = state.localBgm.playlists.find((item) => item.id === bgm.playlistId)
      void spotifyPlayer.transitionToBgm({ mode: 'stop', fadeMs: bgm.fadeMs })
      if (playlist?.tracks.length) void localBgmPlayer.transitionToPlaylist(playlist, bgm.fadeMs)
      else void localBgmPlayer.stopWithFade(bgm.fadeMs)
    } else {
      void localBgmPlayer.stopWithFade(bgm.fadeMs)
      void spotifyPlayer.transitionToBgm(bgm)
    }
  }, [state?.activeCueId, state?.localBgm.playlists])

  useEffect(() => {
    const update = (bounds: DisplayBounds): void => {
      if (bounds.width > 0 && bounds.height > 0) setDisplayBounds(bounds)
    }
    const unsubscribe = window.api.onDisplayBoundsChanged(update)
    void window.api.getDisplayBounds().then(update)
    return unsubscribe
  }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const preventFileDrop = (event: globalThis.DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', preventFileDrop)
    window.addEventListener('drop', preventFileDrop)
    return () => {
      window.removeEventListener('dragover', preventFileDrop)
      window.removeEventListener('drop', preventFileDrop)
    }
  }, [])
  useEffect(
    () => () => {
      if (messageTimer.current !== null) window.clearTimeout(messageTimer.current)
    },
    []
  )

  const showMessage = useCallback((message: string): void => {
    if (messageTimer.current !== null) window.clearTimeout(messageTimer.current)
    setInlineMessage(message)
    messageTimer.current = window.setTimeout(() => setInlineMessage(null), 3000)
  }, [])
  const saveProject = useCallback(async (): Promise<void> => {
    const result = await window.api.saveProject()
    if (result) showMessage('error' in result ? result.error : t('project.saved'))
  }, [showMessage, t])
  const loadProject = useCallback(async (): Promise<void> => {
    const result = await window.api.loadProject()
    if (!result) return
    showMessage('error' in result ? result.error : t('project.loaded', { count: result.loaded }))
  }, [showMessage, t])
  const frame = useMemo(() => (state ? resolvePlaybackFrame(state, now) : null), [now, state])

  if (!state || !frame) {
    return (
      <main className="control-app loading">
        <p>{t('common.loadingState')}</p>
      </main>
    )
  }

  const activeSlideshow =
    activeCue?.materialType === 'slideshow'
      ? state.materials.slideshows.find((item) => item.id === activeCue.materialId)
      : undefined
  const playbackCycles = activeSlideshow
    ? buildCycles(
        frame.playablePhotos,
        activeSlideshow.timing,
        state.baseIndex,
        activeCue?.endBehavior === 'loop'
      )
    : []
  const totalDurationMs = activeSlideshow
    ? buildCycles(frame.playablePhotos, activeSlideshow.timing, 0, false).reduce(
        (total, cycle) => total + cycleDuration(cycle),
        0
      )
    : 0
  const playbackDurationMs = playbackCycles.reduce(
    (total, cycle) => total + cycleDuration(cycle),
    0
  )
  const elapsed =
    activeCue?.materialType === 'slideshow' &&
    activeCue.endBehavior === 'loop' &&
    playbackDurationMs > 0
      ? frame.elapsedMs % playbackDurationMs
      : frame.elapsedMs
  const elapsedBefore = playbackCycles
    .slice(0, frame.timeline.photoOffset)
    .reduce((total, cycle) => total + cycleDuration(cycle), 0)
  const currentCycle = playbackCycles[frame.timeline.photoOffset]
  const cycleRemainingMs = currentCycle
    ? Math.max(0, cycleDuration(currentCycle) - (elapsed - elapsedBefore))
    : 0
  const editing = state.materials.slideshows.find((item) => item.id === state.editingSlideshowId)
  let resolvedPreviewTarget: PreviewTarget | null = null
  if (previewTarget?.type === 'slideshow') {
    const material = state.materials.slideshows.find((item) => item.id === previewTarget.id)
    if (material) resolvedPreviewTarget = { type: 'slideshow', material }
  } else if (previewTarget?.type === 'video') {
    const material = state.materials.videos.find((item) => item.id === previewTarget.id)
    if (material) resolvedPreviewTarget = { type: 'video', material }
  } else if (previewTarget?.type === 'still') {
    const material = state.materials.stills.find((item) => item.id === previewTarget.id)
    if (material) resolvedPreviewTarget = { type: 'still', material }
  }
  const materialContent = (
    <section className="center-column">
      {centerView === 'materials' ? (
        <section className="panel material-panel">
          <div className="panel-heading">
            <div>
              <h2>{t('material.libraryHeading')}</h2>
              <span>{t('material.libraryDescription')}</span>
            </div>
          </div>
          <MaterialLibrary
            materials={state.materials}
            standbyStillId={state.standbyStillId}
            send={send}
            onMessage={showMessage}
            onPreview={(type, id) => setPreviewTarget({ type, id })}
            onEdit={(id) => {
              send({ type: 'setEditingSlideshow', materialId: id })
              changeViewMode('setup')
              setSetupSection('materials')
              setCenterView('editor')
            }}
          />
        </section>
      ) : editing ? (
        <div className="slideshow-editor">
          <div className="editor-toolbar">
            <button type="button" onClick={() => setCenterView('materials')}>
              {t('material.backToLibrary')}
            </button>
            <div>
              <span>{t('material.editing')}</span>
              <strong>{editing.name}</strong>
            </div>
          </div>
          <PhotoListPanel
            photos={editing.photos}
            timing={editing.timing}
            currentPhotoIndex={activeSlideshow?.id === editing.id ? frame.photoIndex : null}
            previewPhotoId={previewPhotoId}
            setPreviewPhotoId={setPreviewPhotoId}
            send={send}
            showPhotoAddResult={(count) => {
              if (count !== undefined)
                showMessage(count ? t('photo.added', { count }) : t('photo.noImagesToAdd'))
            }}
            inlineMessage={inlineMessage}
          />
          <TimingSettings
            timing={editing.timing}
            cycleMs={editing.timing.fadeInMs + editing.timing.holdMs + editing.timing.fadeOutMs}
            send={send}
          />
        </div>
      ) : null}
    </section>
  )

  return (
    <main className="control-app">
      <header className="app-header">
        <div className="app-brand">
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>
        <div className="header-center">
          <div className="modeswitch" role="tablist" aria-label={t('mode.label')}>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'show'}
              onClick={() => changeViewMode('show')}
            >
              {t('mode.show')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'setup'}
              onClick={() => changeViewMode('setup')}
            >
              {t('mode.setup')}
            </button>
          </div>
          {inlineMessage && (
            <span className="global-message" role="status">
              {inlineMessage}
            </span>
          )}
        </div>
        <div className="header-actions">
          {viewMode === 'show' ? (
            <>
              <span className={`status-badge status-${state.status}`}>
                {state.status === 'playing'
                  ? t('status.playing')
                  : state.status === 'paused'
                    ? t('status.paused')
                    : state.status === 'blackout'
                      ? t('status.blackout')
                      : t('status.standby')}
              </span>
              <button
                type="button"
                className={`output-lock-button${state.outputLocked ? ' is-locked' : ''}`}
                aria-pressed={state.outputLocked}
                onClick={() => send({ type: 'setOutputLock', locked: !state.outputLocked })}
              >
                {state.outputLocked
                  ? `🔒 ${t('header.outputLockRelease')}`
                  : `🔓 ${t('header.outputLock')}`}
              </button>
              {state.outputLocked && (
                <span className="output-lock-badge" role="status">
                  🔒 {t('header.outputLockBadge')}
                </span>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={() => void saveProject()}>
                {t('header.save')}
              </button>
              <button type="button" onClick={() => void loadProject()}>
                {t('header.load')}
              </button>
            </>
          )}
        </div>
      </header>
      {viewMode === 'show' ? (
        <div className="show-layout">
          <CueListPanel
            cues={state.cues}
            materials={state.materials}
            localPlaylists={state.localBgm.playlists}
            activeCueId={state.activeCueId}
            armedCueIndex={state.armedCueIndex}
            outputLocked={state.outputLocked}
            send={send}
          />
          <div className="show-center">
            <section className="panel preview-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>{t('preview.mirror')}</h2>
                  <span>
                    {displayBounds.width}×{displayBounds.height}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => window.api.setDisplayFullScreen(!displayBounds.isFullScreen)}
                >
                  {displayBounds.isFullScreen
                    ? t('preview.exitFullscreen')
                    : t('preview.fullscreen')}
                </button>
              </div>
              <div
                className="preview-frame"
                style={
                  {
                    '--preview-aspect': `${displayBounds.width} / ${displayBounds.height}`
                  } as CSSProperties
                }
              >
                <PlaybackCanvas state={state} muted aria-label={t('a11y.mirrorPreview')} />
                {state.status === 'blackout' && (
                  <span className="preview-label">{t('status.blackoutUpper')}</span>
                )}
              </div>
            </section>
            <TransportPanel
              state={state}
              frame={frame}
              currentNumber={frame.photoIndex === null ? 0 : frame.photoIndex + 1}
              cycleRemainingMs={cycleRemainingMs}
              totalDurationMs={totalDurationMs}
              outputLocked={state.outputLocked}
              send={send}
            />
          </div>
          <aside className="show-bgm" aria-label={t('a11y.bgmControls')}>
            <BgmPanel localBgm={state.localBgm} send={send} variant="strip" />
          </aside>
        </div>
      ) : (
        <div className="setup-layout">
          <nav className="setnav" role="tablist" aria-label={t('setup.navLabel')}>
            <button
              type="button"
              role="tab"
              aria-selected={setupSection === 'materials'}
              onClick={() => setSetupSection('materials')}
            >
              {t('setup.nav.materials')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupSection === 'bgm'}
              onClick={() => setSetupSection('bgm')}
            >
              {t('setup.nav.bgm')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupSection === 'stage'}
              onClick={() => setSetupSection('stage')}
            >
              {t('setup.nav.stage')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupSection === 'audio'}
              onClick={() => setSetupSection('audio')}
            >
              {t('setup.nav.audio')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupSection === 'export'}
              onClick={() => setSetupSection('export')}
            >
              {t('setup.nav.export')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupSection === 'remote'}
              onClick={() => setSetupSection('remote')}
            >
              {t('setup.nav.remote')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={setupSection === 'display'}
              onClick={() => setSetupSection('display')}
            >
              {t('setup.nav.display')}
            </button>
          </nav>
          <section className="setbody">
            {setupSection === 'materials' && materialContent}
            {setupSection === 'bgm' && (
              <>
                <LocalBgmLibrary localBgm={state.localBgm} send={send} onMessage={showMessage} />
                <BgmPanel localBgm={state.localBgm} send={send} variant="settings" />
              </>
            )}
            {setupSection === 'stage' && (
              <>
                <MaskSettings
                  fit={editing?.fit ?? 'contain'}
                  mask={state.mask}
                  stageAspect={state.stageAspect}
                  ftbDurationMs={state.ftbDurationMs}
                  send={send}
                />
                <DisplaySleepSettings />
              </>
            )}
            {setupSection === 'audio' && (
              <AudioSettings deviceId={state.audioOutputDeviceId} send={send} />
            )}
            {setupSection === 'export' && <ExportPanel state={state} send={send} />}
            {setupSection === 'remote' && <RemoteSettings />}
            {setupSection === 'display' && <LanguageSettings />}
          </section>
        </div>
      )}
      {resolvedPreviewTarget && (
        <MaterialPreviewModal
          target={resolvedPreviewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <Control />
    </LocaleProvider>
  </StrictMode>
)
