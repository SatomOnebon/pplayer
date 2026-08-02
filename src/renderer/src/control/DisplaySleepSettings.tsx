import { useEffect, useState } from 'react'
import type { PowerSettingsState } from '../../../shared/types'
import { useT } from '../i18n/LocaleProvider'

export function DisplaySleepSettings(): React.JSX.Element {
  const t = useT()
  const [settings, setSettings] = useState<PowerSettingsState | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onPowerSettingsChanged(setSettings)
    void window.api.getPowerSettings().then(setSettings)
    return unsubscribe
  }, [])

  if (!settings) return <section className="panel">{t('common.loadingSettings')}</section>

  const statusClass = settings.preventDisplaySleep
    ? settings.active
      ? 'is-active'
      : 'is-pending'
    : ''
  const statusText = settings.preventDisplaySleep
    ? settings.active
      ? t('sleep.status.active')
      : t('sleep.status.pending')
    : t('sleep.status.normal')

  return (
    <section className="panel">
      <div className="panel-heading compact">
        <div>
          <h2>{t('sleep.heading')}</h2>
          <span>{t('sleep.description')}</span>
        </div>
      </div>
      <label className="remote-toggle">
        <input
          type="checkbox"
          checked={settings.preventDisplaySleep}
          onChange={(event) =>
            void window.api
              .setPowerSettings({ preventDisplaySleep: event.target.checked })
              .then(setSettings)
          }
        />
        {t('sleep.prevent')}
      </label>
      <p className={`power-status ${statusClass}`}>{statusText}</p>
    </section>
  )
}
