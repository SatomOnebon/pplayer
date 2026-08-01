import { useEffect, useState } from 'react'
import type { RemoteSettingsState } from '../../../shared/types'
import { STREAM_DECK_SHORTCUTS, REGISTERED_SHORTCUT_COUNT } from '../../../shared/shortcuts'

export function RemoteSettings(): React.JSX.Element {
  const [settings, setSettings] = useState<RemoteSettingsState | null>(null)
  const [portInput, setPortInput] = useState('8722')

  useEffect(() => {
    const update = (next: RemoteSettingsState): void => {
      setSettings(next)
      setPortInput(String(next.port))
    }
    const unsubscribe = window.api.onRemoteSettingsChanged(update)
    void window.api.getRemoteSettings().then(update)
    return unsubscribe
  }, [])

  if (!settings) return <section className="panel remote-panel">設定を読み込んでいます…</section>

  const example = `http://127.0.0.1:${settings.port}/api/go?token=${settings.token}`
  const savePort = (): void => {
    const port = Number(portInput)
    if (Number.isInteger(port) && port >= 1 && port <= 65535 && port !== settings.port) {
      void window.api.setRemoteSettings({ port }).then(setSettings)
    } else {
      setPortInput(String(settings.port))
    }
  }

  return (
    <section className="panel remote-panel">
      <div className="panel-heading compact">
        <div>
          <h2>リモート制御</h2>
          <span>Stream Deck / Companion</span>
        </div>
      </div>
      <label className="remote-toggle">
        <input
          type="checkbox"
          checked={settings.globalShortcutsEnabled}
          onChange={(event) =>
            void window.api
              .setRemoteSettings({ globalShortcutsEnabled: event.target.checked })
              .then(setSettings)
          }
        />
        グローバルショートカット（Stream Deck 用）
      </label>
      <table className="remote-shortcuts">
        <tbody>
          {STREAM_DECK_SHORTCUTS.map(([key, action]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="remote-note">
        BGM 操作（B / N / V）は現在再生中のソース（ローカル / Spotify）に適用されます。
      </p>
      {settings.failedShortcuts.length > 0 && (
        <div className="remote-error" role="alert">
          <strong>
            {settings.failedShortcuts.length === REGISTERED_SHORTCUT_COUNT
              ? 'すべてのショートカットが登録できませんでした'
              : '一部のショートカットが登録できませんでした'}
          </strong>
          <span>
            以下のショートカットは他のアプリと競合していて使えません:{' '}
            {settings.failedShortcuts.join(', ')}
          </span>
        </div>
      )}
      <div className="remote-http">
        <label className="remote-toggle">
          <input
            type="checkbox"
            checked={settings.httpEnabled}
            onChange={(event) =>
              void window.api
                .setRemoteSettings({ httpEnabled: event.target.checked })
                .then(setSettings)
            }
          />
          ローカル HTTP API
        </label>
        <label className="remote-field">
          <span>ポート</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={portInput}
            onChange={(event) => setPortInput(event.target.value)}
            onBlur={savePort}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </label>
        <div className="remote-token-row">
          <label className="remote-field">
            <span>トークン</span>
            <input type="text" readOnly value={settings.token} onFocus={(e) => e.target.select()} />
          </label>
          <button
            type="button"
            onClick={() => void window.api.regenerateRemoteToken().then(setSettings)}
          >
            再生成
          </button>
        </div>
        <label className="remote-field remote-example">
          <span>使用例</span>
          <input type="text" readOnly value={example} onFocus={(e) => e.target.select()} />
        </label>
        {settings.listenError && (
          <p className="remote-error" role="alert">
            {settings.listenError}
          </p>
        )}
      </div>
    </section>
  )
}
