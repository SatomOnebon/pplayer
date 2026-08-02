import { useEffect, useState } from 'react'
import type { RemoteSettingsState } from '../../../shared/types'
import { STREAM_DECK_SHORTCUTS, REGISTERED_SHORTCUT_COUNT } from '../../../shared/shortcuts'
import { useT } from '../i18n/LocaleProvider'

export function RemoteSettings(): React.JSX.Element {
  const t = useT()
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

  if (!settings)
    return <section className="panel remote-panel">{t('common.loadingSettings')}</section>

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
          <h2>{t('remote.heading')}</h2>
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
        {t('remote.globalShortcuts')}
      </label>
      <table className="remote-shortcuts">
        <tbody>
          {STREAM_DECK_SHORTCUTS.map(([key, actionKey]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>{t(actionKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="remote-note">{t('remote.bgmShortcutNote')}</p>
      {settings.failedShortcuts.length > 0 && (
        <div className="remote-error" role="alert">
          <strong>
            {settings.failedShortcuts.length === REGISTERED_SHORTCUT_COUNT
              ? t('remote.shortcutsFailedAll')
              : t('remote.shortcutsFailedSome')}
          </strong>
          <span>
            {t('remote.shortcutsConflict', { shortcuts: settings.failedShortcuts.join(', ') })}
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
          {t('remote.httpApi')}
        </label>
        <label className="remote-field">
          <span>{t('remote.port')}</span>
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
            <span>{t('remote.token')}</span>
            <input type="text" readOnly value={settings.token} onFocus={(e) => e.target.select()} />
          </label>
          <button
            type="button"
            onClick={() => void window.api.regenerateRemoteToken().then(setSettings)}
          >
            {t('remote.regenerate')}
          </button>
        </div>
        <label className="remote-field remote-example">
          <span>{t('remote.example')}</span>
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
