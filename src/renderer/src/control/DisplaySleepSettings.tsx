import { useEffect, useState } from 'react'
import type { PowerSettingsState } from '../../../shared/types'

export function DisplaySleepSettings(): React.JSX.Element {
  const [settings, setSettings] = useState<PowerSettingsState | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onPowerSettingsChanged(setSettings)
    void window.api.getPowerSettings().then(setSettings)
    return unsubscribe
  }, [])

  if (!settings) return <section className="panel">設定を読み込んでいます…</section>

  const statusClass = settings.preventDisplaySleep
    ? settings.active
      ? 'is-active'
      : 'is-pending'
    : ''
  const statusText = settings.preventDisplaySleep
    ? settings.active
      ? '● 抑制中（画面は消灯しません）'
      : '▲ 抑制を要求中（まだ確立していません）'
    : '○ 通常（スリープ有効）'

  return (
    <section className="panel">
      <div className="panel-heading compact">
        <div>
          <h2>ディスプレイ / スリープ</h2>
          <span>本番中の画面消灯・スクリーンセーバーを抑制</span>
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
        スクリーンセーバー / ディスプレイスリープを抑制
      </label>
      <p className={`power-status ${statusClass}`}>{statusText}</p>
    </section>
  )
}
