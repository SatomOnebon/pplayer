import { useCallback, useEffect, useRef } from 'react'
import type { FitMode, MaskConfig, PlaybackCommand, StageAspect } from '../../../shared/types'
import { fileName } from './utils'

type MaskNumberField = 'sizePercent' | 'offsetXPercent' | 'offsetYPercent'

export function MaskSettings({
  fit,
  mask,
  stageAspect,
  ftbDurationMs,
  send
}: {
  fit: FitMode
  mask: MaskConfig
  stageAspect: StageAspect
  ftbDurationMs: number
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const maskFrameRef = useRef<number | null>(null)
  const pendingMaskRef = useRef<MaskConfig | null>(null)
  useEffect(
    () => () => {
      if (maskFrameRef.current !== null) cancelAnimationFrame(maskFrameRef.current)
    },
    []
  )
  const queueMask = useCallback(
    (nextMask: MaskConfig): void => {
      pendingMaskRef.current = nextMask
      if (maskFrameRef.current !== null) return
      maskFrameRef.current = requestAnimationFrame(() => {
        maskFrameRef.current = null
        if (pendingMaskRef.current) send({ type: 'setMask', mask: pendingMaskRef.current })
      })
    },
    [send]
  )
  const updateMaskNumber = (field: MaskNumberField, value: string): void => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    const limits = field === 'sizePercent' ? [10, 200] : [-50, 50]
    const clamped = Math.min(limits[1], Math.max(limits[0], parsed))
    queueMask({ ...mask, [field]: clamped })
  }

  return (
    <section className="panel settings-panel mask-panel" aria-labelledby="mask-heading">
      <div className="panel-heading compact">
        <div>
          <h2 id="mask-heading">マスク</h2>
          <span>出力とプレビューに即時反映</span>
        </div>
      </div>
      <div
        className="segmented-control fit-segmented-control"
        role="radiogroup"
        aria-label="出力ステージ"
      >
        <span className="segmented-control-title">出力ステージ</span>
        <label className={stageAspect === 'free' ? 'selected' : ''}>
          <input
            type="radio"
            name="stage-aspect"
            checked={stageAspect === 'free'}
            onChange={() => send({ type: 'setStageAspect', stageAspect: 'free' })}
          />
          画面に合わせる
        </label>
        <label className={stageAspect === '16:9' ? 'selected' : ''}>
          <input
            type="radio"
            name="stage-aspect"
            checked={stageAspect === '16:9'}
            onChange={() => send({ type: 'setStageAspect', stageAspect: '16:9' })}
          />
          16:9 固定
        </label>
      </div>
      <label className="ftb-duration-field">
        <span>FTB 時間(秒)</span>
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={ftbDurationMs / 1000}
          onChange={(event) => {
            const seconds = Number(event.target.value)
            if (Number.isFinite(seconds) && seconds >= 0.1) {
              send({ type: 'setFtbDuration', durationMs: seconds * 1000 })
            }
          }}
        />
      </label>
      <div
        className="segmented-control fit-segmented-control"
        role="radiogroup"
        aria-label="写真の配置"
      >
        <span className="segmented-control-title">写真の配置</span>
        <label className={fit === 'contain' ? 'selected' : ''}>
          <input
            type="radio"
            name="fit-mode"
            checked={fit === 'contain'}
            onChange={() => send({ type: 'setFit', fit: 'contain' })}
          />
          全体表示 (contain)
        </label>
        <label className={fit === 'cover' ? 'selected' : ''}>
          <input
            type="radio"
            name="fit-mode"
            checked={fit === 'cover'}
            onChange={() => send({ type: 'setFit', fit: 'cover' })}
          />
          画面を埋める (cover)
        </label>
      </div>
      <div className="segmented-control" role="radiogroup" aria-label="マスクモード">
        {(
          [
            ['none', 'なし'],
            ['circle', '○ 円形'],
            ['image', '▧ カスタム画像']
          ] as const
        ).map(([mode, label]) => (
          <label key={mode} className={mask.mode === mode ? 'selected' : ''}>
            <input
              type="radio"
              name="mask-mode"
              checked={mask.mode === mode}
              onChange={() => queueMask({ ...mask, mode })}
            />
            {label}
          </label>
        ))}
      </div>
      {mask.mode === 'image' && (
        <div className="mask-file">
          <button type="button" onClick={() => void window.api.chooseMaskImage()}>
            マスク画像を選択
          </button>
          <span title={mask.imagePath ?? undefined}>{fileName(mask.imagePath)}</span>
        </div>
      )}
      {mask.mode !== 'none' && (
        <>
          <label className="mask-invert">
            <input
              type="checkbox"
              checked={mask.invert}
              onChange={(event) => queueMask({ ...mask, invert: event.target.checked })}
            />
            マスクを反転
          </label>
          {(
            [
              ['sizePercent', 'サイズ', 10, 200, 1],
              ['offsetXPercent', '中心 X', -50, 50, 0.5],
              ['offsetYPercent', '中心 Y', -50, 50, 0.5]
            ] as const
          ).map(([field, label, min, max, step]) => (
            <label className="range-field" key={field}>
              <span>{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={mask[field]}
                onChange={(event) => updateMaskNumber(field, event.target.value)}
              />
              <span className="input-with-unit compact-input">
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={mask[field]}
                  onChange={(event) => updateMaskNumber(field, event.target.value)}
                />
                <span>%</span>
              </span>
            </label>
          ))}
          <button
            className="reset-button"
            type="button"
            onClick={() =>
              queueMask({ ...mask, sizePercent: 100, offsetXPercent: 0, offsetYPercent: 0 })
            }
          >
            位置をリセット
          </button>
        </>
      )}
    </section>
  )
}
