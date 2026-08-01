import { useCallback, useEffect, useRef } from 'react'
import type { PlaybackCommand } from '../../../shared/types'
import type { EditingAppState } from '../../../shared/migration'
import type { PlaybackFrame } from '../lib/playbackFrame'
import { formatDuration, seconds } from './utils'

const PHASE_LABELS = {
  fadeIn: 'フェードイン',
  hold: '表示',
  fadeOut: 'フェードアウト',
  black: '—'
} as const

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
        再生操作
      </h2>
      <div className="transport-buttons">
        <button
          type="button"
          disabled={outputLocked || !slideshowActive}
          title="前の写真（←）"
          onClick={() => send({ type: 'prev' })}
        >
          ◀ 前へ
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
          {state.status === 'playing' ? 'Ⅱ 一時停止' : '▶ 再生'}
        </button>
        <button
          type="button"
          disabled={outputLocked || !slideshowActive}
          title="次の写真（→）"
          onClick={() => send({ type: 'next' })}
        >
          次へ ▶
        </button>
        <button
          className={state.status === 'blackout' ? 'active danger' : ''}
          type="button"
          disabled={outputLocked}
          title="ブラックアウト（B）"
          onClick={() => send({ type: 'toggleBlackout' })}
        >
          ● ブラックアウト
        </button>
        <button
          className={`ftb-button${state.ftbHeld ? ' active' : ''}`}
          type="button"
          disabled={outputLocked}
          title={
            state.ftbHeld ? 'FTB を解除して停止位置から再開(F)' : '黒へフェードして一時停止(F)'
          }
          onClick={() => send({ type: 'masterFtb' })}
        >
          {state.ftbHeld ? 'FTB 解除' : 'FTB'}
        </button>
      </div>
      <div className="cue-status">
        <span>実行中: {activeCue?.label ?? '蓋絵 / 待機'}</span>
      </div>
      <div className="master-volume-control">
        <label htmlFor="master-volume">
          <span>マスター音量</span>
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
        {masterVolumePercent === 0 && <small>ミュート中</small>}
      </div>
      {state.audioFallbackActive && (
        <p className="audio-fallback-warning" role="alert">
          ⚠ 音声を出力できないため消音で再生中
        </p>
      )}
      {state.status === 'blackout' && (
        <small className="blackout-hint">B キーでブラックアウト解除</small>
      )}
      {(state.ftb || state.ftbHeld) && (
        <small className="ftb-hint">{state.ftbHeld ? 'FTB 保持中' : 'FTB 実行中'}</small>
      )}
      {slideshowActive && (
        <div className="progress-grid">
          <div>
            <span>進行</span>
            <strong>
              {currentNumber} / 全{frame.playablePhotos.length}枚
            </strong>
          </div>
          <div>
            <span>フェーズ</span>
            <strong>{PHASE_LABELS[frame.timeline.phase]}</strong>
          </div>
          <div>
            <span>この写真の残り</span>
            <strong>{seconds(cycleRemainingMs)}秒</strong>
          </div>
          <div>
            <span>全体所要時間</span>
            <strong>{formatDuration(totalDurationMs)}</strong>
          </div>
        </div>
      )}
    </section>
  )
}
