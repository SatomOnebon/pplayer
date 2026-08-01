import { useState } from 'react'
import { FADE_EASINGS } from '../../../shared/easing'
import type { FadeEasing, PlaybackCommand, TimingConfig } from '../../../shared/types'
import { seconds } from './utils'

type TimingMsField = 'fadeInMs' | 'holdMs' | 'fadeOutMs'

const EASING_LABELS: Record<FadeEasing, string> = {
  linear: 'リニア',
  easeIn: 'イーズイン',
  easeOut: 'イーズアウト',
  easeInOut: 'イーズインアウト'
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
          <h2 id="timing-heading">タイミング</h2>
          <span>入力後 Enter またはフォーカス移動で確定</span>
        </div>
      </div>
      <div className="timing-fields">
        {(
          [
            ['fadeInMs', 'フェードイン', 0],
            ['holdMs', '表示', 0.1],
            ['fadeOutMs', 'フェードアウト', 0]
          ] as const
        ).map(([field, label, minimum]) => (
          <label key={field}>
            <span>{label}</span>
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
              <span>秒</span>
            </span>
          </label>
        ))}
        <label className="timing-ease-field">
          <span>フェードインの曲線</span>
          <select
            value={timing.fadeInEase}
            onChange={(event) => setEasing('fadeInEase', event.target.value as FadeEasing)}
          >
            {FADE_EASINGS.map((ease) => (
              <option key={ease} value={ease}>
                {EASING_LABELS[ease]}
              </option>
            ))}
          </select>
        </label>
        <label className="timing-ease-field">
          <span>フェードアウトの曲線</span>
          <select
            value={timing.fadeOutEase}
            onChange={(event) => setEasing('fadeOutEase', event.target.value as FadeEasing)}
          >
            {FADE_EASINGS.map((ease) => (
              <option key={ease} value={ease}>
                {EASING_LABELS[ease]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="setting-summary">
        <span>1枚あたり</span>
        <strong>{seconds(cycleMs)}秒</strong>
      </div>
    </section>
  )
}
