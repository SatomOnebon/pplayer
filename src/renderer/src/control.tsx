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
import { MaterialLibrary } from './control/MaterialLibrary'
import { MaterialPreviewModal } from './control/MaterialPreviewModal'
import { PhotoListPanel } from './control/PhotoListPanel'
import { TimingSettings } from './control/TimingSettings'
import { TransportPanel } from './control/TransportPanel'
import { RemoteSettings } from './control/RemoteSettings'
import { useKeyboardShortcuts } from './control/useKeyboardShortcuts'
import * as spotifyPlayer from './control/lib/spotifyPlayer'
import * as localBgmPlayer from './control/lib/localBgmPlayer'
import { PlaybackCanvas } from './lib/PlaybackCanvas'
import { resolvePlaybackFrame } from './lib/playbackFrame'
import { useAppState } from './useAppState'
import './styles.css'

export function Control(): React.JSX.Element {
  const state = useAppState()
  const [isThreeColumn, setIsThreeColumn] = useState(
    () => window.matchMedia('(min-width: 1600px)').matches
  )
  const [rightView, setRightView] = useState<'output' | 'materials'>('output')
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
  const activeCue = state?.cues.find((cue) => cue.id === state.activeCueId)
  useKeyboardShortcuts(activeCue?.materialType, send, () => setPreviewPhotoId(null))

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
        const localPlaying = !local.paused && Boolean(local.trackName)
        const spotifyPlaying = spotify.active && !spotify.paused && Boolean(spotify.trackName)
        const useLocal = localPlaying || !spotifyPlaying
        const target = useLocal ? localBgmPlayer : spotifyPlayer
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
      if (playlist) void localBgmPlayer.transitionToPlaylist(playlist, bgm.fadeMs)
    } else {
      void localBgmPlayer.stopWithFade(bgm.fadeMs)
      void spotifyPlayer.transitionToBgm(bgm)
    }
  }, [state?.activeCueId, state?.localBgm.playlists])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1600px)')
    const update = (event: MediaQueryListEvent): void => setIsThreeColumn(event.matches)
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])
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
    if (result) showMessage('error' in result ? result.error : 'プロジェクトを保存しました')
  }, [showMessage])
  const loadProject = useCallback(async (): Promise<void> => {
    const result = await window.api.loadProject()
    if (!result) return
    showMessage(
      'error' in result ? result.error : `プロジェクトを読み込みました（写真 ${result.loaded}枚）`
    )
  }, [showMessage])
  const frame = useMemo(() => (state ? resolvePlaybackFrame(state, now) : null), [now, state])

  if (!state || !frame) {
    return (
      <main className="control-app loading">
        <p>状態を読み込んでいます…</p>
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
              <h2>素材ライブラリ</h2>
              <span>素材を管理してキューへ登録</span>
            </div>
          </div>
          <MaterialLibrary
            materials={state.materials}
            localBgm={state.localBgm}
            standbyStillId={state.standbyStillId}
            send={send}
            onMessage={showMessage}
            onPreview={(type, id) => setPreviewTarget({ type, id })}
            onEdit={(id) => {
              send({ type: 'setEditingSlideshow', materialId: id })
              setCenterView('editor')
              setRightView('materials')
            }}
          />
        </section>
      ) : editing ? (
        <div className="slideshow-editor">
          <div className="editor-toolbar">
            <button type="button" onClick={() => setCenterView('materials')}>
              ‹ 素材に戻る
            </button>
            <div>
              <span>編集中</span>
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
                showMessage(count ? `${count}枚追加しました` : '追加できる画像がありませんでした')
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
        <div>
          <h1>pplayer</h1>
          <p>ライブ演出コントロール</p>
        </div>
        {inlineMessage && (
          <span className="global-message" role="status">
            {inlineMessage}
          </span>
        )}
        <div className="header-actions">
          <button type="button" onClick={() => void saveProject()}>
            保存
          </button>
          <button type="button" onClick={() => void loadProject()}>
            読み込み
          </button>
          <button
            type="button"
            className={`output-lock-button${state.outputLocked ? ' is-locked' : ''}`}
            aria-pressed={state.outputLocked}
            onClick={() => send({ type: 'setOutputLock', locked: !state.outputLocked })}
          >
            {state.outputLocked ? '🔒 ロック中（解除）' : '🔓 出力ロック'}
          </button>
          <span className={`status-badge status-${state.status}`}>
            {state.status === 'playing'
              ? '再生中'
              : state.status === 'paused'
                ? '一時停止'
                : state.status === 'blackout'
                  ? 'ブラックアウト'
                  : '待機'}
          </span>
          {state.outputLocked && (
            <span className="output-lock-badge" role="status">
              🔒 出力ロック中
            </span>
          )}
        </div>
      </header>
      <div className="workspace three-column-workspace">
        <CueListPanel
          cues={state.cues}
          materials={state.materials}
          localPlaylists={state.localBgm.playlists}
          activeCueId={state.activeCueId}
          armedCueIndex={state.armedCueIndex}
          outputLocked={state.outputLocked}
          send={send}
        />
        <div className="right-workspace">
          {isThreeColumn && materialContent}
          <div className="output-column">
            <section className="panel preview-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>ミラープレビュー</h2>
                  <span>
                    {displayBounds.width}×{displayBounds.height}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => window.api.setDisplayFullScreen(!displayBounds.isFullScreen)}
                >
                  {displayBounds.isFullScreen ? '解除' : '⛶ 全画面'}
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
                <PlaybackCanvas state={state} muted aria-label="本番画面のミラープレビュー" />
                {state.status === 'blackout' && <span className="preview-label">BLACKOUT</span>}
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
            {!isThreeColumn && (
              <div className="right-view-tabs" role="tablist" aria-label="右カラム表示">
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightView === 'output'}
                  className={rightView === 'output' ? 'is-active' : undefined}
                  onClick={() => setRightView('output')}
                >
                  出力・設定
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={rightView === 'materials'}
                  className={rightView === 'materials' ? 'is-active' : undefined}
                  onClick={() => setRightView('materials')}
                >
                  素材ライブラリ
                </button>
              </div>
            )}
            {!isThreeColumn && rightView === 'materials' && materialContent}
            {(isThreeColumn || rightView === 'output') && (
              <>
                <MaskSettings
                  fit={editing?.fit ?? 'contain'}
                  mask={state.mask}
                  stageAspect={state.stageAspect}
                  ftbDurationMs={state.ftbDurationMs}
                  send={send}
                />
                <DisplaySleepSettings />
                <ExportPanel state={state} send={send} />
                <AudioSettings deviceId={state.audioOutputDeviceId} send={send} />
                <BgmPanel localBgm={state.localBgm} send={send} />
                <RemoteSettings />
              </>
            )}
          </div>
        </div>
      </div>
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
    <Control />
  </StrictMode>
)
