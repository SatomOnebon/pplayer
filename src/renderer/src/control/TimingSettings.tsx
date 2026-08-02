import { useState } from 'react'
import { FADE_EASINGS } from '../../../shared/easing'
import type { FadeEasing, PlaybackCommand, TimingConfig } from '../../../shared/types'
import { seconds } from './utils'
import { useT } from '../i18n/LocaleProvider'

type TimingMsField = 'fadeInMs' | 'holdMs' | 'fadeOutMs'

const EASING_KEYS: Record<FadeEasing, string> = {
  linear: 'timing.easing.linear',
  easeIn: 'timing.easing.easeIn',
  easeOut: 'timing.easing.easeOut',
  easeInOut: 'timing.easing.easeInOut'
}

export function TimingSettings({
  timing,
  cycleMs,
  send
}: {
  timing: TimingConfig
  cycleMs: number
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const t = useT()
  const [timingDraft, setTimingDraft] = useState<Record<TimingMsField, string | null>>({
    fadeInMs: null,
    holdMs: null,
    fadeOutMs: null
  })

  const commitTiming = (field: TimingMsField): void => {
    const parsedSeconds = Number(timingDraft[field] ?? seconds(timing[field]))
    const minimum = field === 'holdMs' ? 0.1 : 0
    if (!Number.isFinite(parsedSeconds)) {
      setTimingDraft((draft) => ({ ...draft, [field]: null }))
      return
    }
    const value = Math.round(Math.max(minimum, parsedSeconds) * 10) / 10
    setTimingDraft((draft) => ({ ...draft, [field]: null }))
    send({ type: 'setTiming', timing: { ...timing, [field]: Math.round(value * 1000) } })
  }

  const setEasing = (field: 'fadeInEase' | 'fadeOutEase', value: FadeEasing): void => {
    send({ type: 'setTiming', timing: { ...timing, [field]: value } })
  }

  return (
    <section className="panel settings-panel" aria-labelledby="timing-heading">
      <div className="panel-heading compact">
        <div className="timing-heading-copy">
          <h2 id="timing-heading">{t('timing.heading')}</h2>
          <span>{t('timing.commitHint')}</span>
        </div>
      </div>
      <div className="timing-fields">
        {(
          [
            ['fadeInMs', 'timing.fadeIn', 0],
            ['holdMs', 'timing.hold', 0.1],
            ['fadeOutMs', 'timing.fadeOut', 0]
          ] as const
        ).map(([field, labelKey, minimum]) => (
          <label key={field}>
            <span>{t(labelKey)}</span>
            <span className="input-with-unit">
              <input
                type="number"
                min={minimum}
                step="0.1"
                value={timingDraft[field] ?? seconds(timing[field])}
                onChange={(event) =>
                  setTimingDraft((draft) => ({ ...draft, [field]: event.target.value }))
                }
                onBlur={() => commitTiming(field)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
              <span>{t('common.secondsUnit')}</span>
            </span>
          </label>
        ))}
        <label className="timing-ease-field">
          <span>{t('timing.fadeInCurve')}</span>
          <select
            value={timing.fadeInEase}
            onChange={(event) => setEasing('fadeInEase', event.target.value as FadeEasing)}
          >
            {FADE_EASINGS.map((ease) => (
              <option key={ease} value={ease}>
                {t(EASING_KEYS[ease])}
              </option>
            ))}
          </select>
        </label>
        <label className="timing-ease-field">
          <span>{t('timing.fadeOutCurve')}</span>
          <select
            value={timing.fadeOutEase}
            onChange={(event) => setEasing('fadeOutEase', event.target.value as FadeEasing)}
          >
            {FADE_EASINGS.map((ease) => (
              <option key={ease} value={ease}>
                {t(EASING_KEYS[ease])}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="setting-summary">
        <span>{t('timing.perPhoto')}</span>
        <strong>{t('time.seconds', { s: seconds(cycleMs) })}</strong>
      </div>
    </section>
  )
}
