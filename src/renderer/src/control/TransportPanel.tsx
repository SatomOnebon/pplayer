import { useCallback, useEffect, useRef } from 'react'
import type { PlaybackCommand } from '../../../shared/types'
import type { EditingAppState } from '../../../shared/migration'
import type { PlaybackFrame } from '../lib/playbackFrame'
import { useT } from '../i18n/LocaleProvider'
import { formatDuration, seconds } from './utils'

export function TransportPanel({
  state,
  frame,
  currentNumber,
  cycleRemainingMs,
  totalDurationMs,
  outputLocked,
  send
}: {
  state: EditingAppState
  frame: PlaybackFrame
  currentNumber: number
  cycleRemainingMs: number
  totalDurationMs: number
  outputLocked: boolean
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const t = useT()
  const volumeFrameRef = useRef<number | null>(null)
  const pendingVolumeRef = useRef<number | null>(null)
  const activeCue = state.cues.find((cue) => cue.id === state.activeCueId)
  const slideshowActive = activeCue?.materialType === 'slideshow'
  useEffect(
    () => () => {
      if (volumeFrameRef.current !== null) cancelAnimationFrame(volumeFrameRef.current)
    },
    []
  )
  const queueMasterVolume = useCallback(
    (volume: number): void => {
      pendingVolumeRef.current = volume
      if (volumeFrameRef.current !== null) return
      volumeFrameRef.current = requestAnimationFrame(() => {
        volumeFrameRef.current = null
        if (pendingVolumeRef.current !== null) {
          send({ type: 'setMasterVolume', volume: pendingVolumeRef.current })
        }
      })
    },
    [send]
  )
  const masterVolumePercent = Math.round(state.masterVolume * 100)

  return (
    <section className="panel transport-panel" aria-labelledby="transport-heading">
      <h2 id="transport-heading" className="visually-hidden">
        {t('transport.heading')}
      </h2>
      <div className="transport-buttons">
        <button
          type="button"
          disabled={outputLocked || !slideshowActive}
          title={t('transport.previousTitle')}
          onClick={() => send({ type: 'prev' })}
        >
          {t('transport.previous')}
        </button>
        <button
          className="play-button"
          type="button"
          disabled={
            outputLocked ||
            !activeCue ||
            activeCue.materialType === 'still' ||
            activeCue.materialType === 'black'
          }
          onClick={() => send({ type: 'playPause' })}
        >
          {state.status === 'playing' ? t('transport.pause') : t('transport.play')}
        </button>
        <button
          type="button"
          disabled={outputLocked || !slideshowActive}
          title={t('transport.nextTitle')}
          onClick={() => send({ type: 'next' })}
        >
          {t('transport.next')}
        </button>
        <button
          className={state.status === 'blackout' ? 'active danger' : ''}
          type="button"
          disabled={outputLocked}
          title={t('transport.blackoutTitle')}
          onClick={() => send({ type: 'toggleBlackout' })}
        >
          {t('transport.blackout')}
        </button>
        <button
          className={`ftb-button${state.ftbHeld ? ' active' : ''}`}
          type="button"
          disabled={outputLocked}
          title={state.ftbHeld ? t('transport.ftbReleaseTitle') : t('transport.ftbTitle')}
          onClick={() => send({ type: 'masterFtb' })}
        >
          {state.ftbHeld ? t('transport.ftbRelease') : t('transport.ftb')}
        </button>
      </div>
      <div className="cue-status">
        <span>
          {t('transport.activeCue', {
            name: activeCue?.label ?? t('transport.standby')
          })}
        </span>
      </div>
      <div className="master-volume-control">
        <label htmlFor="master-volume">
          <span>{t('transport.masterVolume')}</span>
          <strong>{masterVolumePercent}%</strong>
        </label>
        <input
          id="master-volume"
          type="range"
          min="0"
          max="100"
          step="1"
          value={masterVolumePercent}
          onChange={(event) => queueMasterVolume(Number(event.target.value) / 100)}
        />
        <small className="master-volume-hint">{t('transport.masterVolumeHint')}</small>
        {masterVolumePercent === 0 && <small>{t('transport.muted')}</small>}
      </div>
      {state.audioFallbackActive && (
        <p className="audio-fallback-warning" role="alert">
          {t('transport.audioFallback')}
        </p>
      )}
      {state.status === 'blackout' && (
        <small className="blackout-hint">{t('transport.blackoutHint')}</small>
      )}
      {(state.ftb || state.ftbHeld) && (
        <small className="ftb-hint">
          {state.ftbHeld ? t('transport.ftbHeld') : t('transport.ftbRunning')}
        </small>
      )}
      {slideshowActive && (
        <div className="progress-grid">
          <div>
            <span>{t('transport.progressLabel')}</span>
            <strong>
              {t('transport.progress', {
                current: currentNumber,
                total: frame.playablePhotos.length
              })}
            </strong>
          </div>
          <div>
            <span>{t('transport.phaseLabel')}</span>
            <strong>{t(`transport.phase.${frame.timeline.phase}`)}</strong>
          </div>
          <div>
            <span>{t('transport.remainingLabel')}</span>
            <strong>{t('transport.seconds', { seconds: seconds(cycleRemainingMs) })}</strong>
          </div>
          <div>
            <span>{t('transport.totalDuration')}</span>
            <strong>{formatDuration(totalDurationMs)}</strong>
          </div>
        </div>
      )}
    </section>
  )
}
