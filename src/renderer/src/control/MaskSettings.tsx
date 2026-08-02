import { useCallback, useEffect, useRef } from 'react'
import type { FitMode, MaskConfig, PlaybackCommand, StageAspect } from '../../../shared/types'
import { fileName } from './utils'
import { useLocale, useT } from '../i18n/LocaleProvider'

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
  const t = useT()
  const locale = useLocale()
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
          <h2 id="mask-heading">{t('mask.heading')}</h2>
          <span>{t('mask.description')}</span>
        </div>
      </div>
      <div
        className="segmented-control fit-segmented-control"
        role="radiogroup"
        aria-label={t('mask.outputStage')}
      >
        <span className="segmented-control-title">{t('mask.outputStage')}</span>
        <label className={stageAspect === 'free' ? 'selected' : ''}>
          <input
            type="radio"
            name="stage-aspect"
            checked={stageAspect === 'free'}
            onChange={() => send({ type: 'setStageAspect', stageAspect: 'free' })}
          />
          {t('mask.stageFitScreen')}
        </label>
        <label className={stageAspect === '16:9' ? 'selected' : ''}>
          <input
            type="radio"
            name="stage-aspect"
            checked={stageAspect === '16:9'}
            onChange={() => send({ type: 'setStageAspect', stageAspect: '16:9' })}
          />
          {t('mask.stageFixed')}
        </label>
      </div>
      <label className="ftb-duration-field">
        <span>{t('mask.ftbDuration')}</span>
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
        aria-label={t('mask.photoFit')}
      >
        <span className="segmented-control-title">{t('mask.photoFit')}</span>
        <label className={fit === 'contain' ? 'selected' : ''}>
          <input
            type="radio"
            name="fit-mode"
            checked={fit === 'contain'}
            onChange={() => send({ type: 'setFit', fit: 'contain' })}
          />
          {t('mask.fitContainDetailed')}
        </label>
        <label className={fit === 'cover' ? 'selected' : ''}>
          <input
            type="radio"
            name="fit-mode"
            checked={fit === 'cover'}
            onChange={() => send({ type: 'setFit', fit: 'cover' })}
          />
          {t('mask.fitCoverDetailed')}
        </label>
      </div>
      <div className="segmented-control" role="radiogroup" aria-label={t('mask.modeLabel')}>
        {(
          [
            ['none', 'mask.mode.none'],
            ['circle', 'mask.mode.circle'],
            ['image', 'mask.mode.image']
          ] as const
        ).map(([mode, labelKey]) => (
          <label key={mode} className={mask.mode === mode ? 'selected' : ''}>
            <input
              type="radio"
              name="mask-mode"
              checked={mask.mode === mode}
              onChange={() => queueMask({ ...mask, mode })}
            />
            {t(labelKey)}
          </label>
        ))}
      </div>
      {mask.mode === 'image' && (
        <div className="mask-file">
          <button type="button" onClick={() => void window.api.chooseMaskImage()}>
            {t('mask.chooseImage')}
          </button>
          <span title={mask.imagePath ?? undefined}>{fileName(mask.imagePath, locale)}</span>
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
            {t('mask.invert')}
          </label>
          {(
            [
              ['sizePercent', 'mask.size', 10, 200, 1],
              ['offsetXPercent', 'mask.centerX', -50, 50, 0.5],
              ['offsetYPercent', 'mask.centerY', -50, 50, 0.5]
            ] as const
          ).map(([field, labelKey, min, max, step]) => (
            <label className="range-field" key={field}>
              <span>{t(labelKey)}</span>
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
            {t('mask.resetPosition')}
          </button>
        </>
      )}
    </section>
  )
}
