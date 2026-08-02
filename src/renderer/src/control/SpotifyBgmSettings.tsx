import { useEffect, useState, useSyncExternalStore } from 'react'
import { normalizeSpotifyContextUri } from '../../../shared/spotifyUri'
import type { SpotifyPlaylist, SpotifySettingsState } from '../../../shared/types'
import * as localBgmPlayer from './lib/localBgmPlayer'
import * as spotifyPlayer from './lib/spotifyPlayer'
import { setActiveBgmSource } from './lib/bgmSource'
import { useT } from '../i18n/LocaleProvider'

export function SpotifyBgmSettings({
  variant
}: {
  variant: 'strip' | 'settings'
}): React.JSX.Element {
  const t = useT()
  const [settings, setSettings] = useState<SpotifySettingsState | null>(null)
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [playlistErrorKey, setPlaylistErrorKey] = useState<string | null>(null)
  const [directContext, setDirectContext] = useState('')
  const [directContextErrorKey, setDirectContextErrorKey] = useState<string | null>(null)
  const [clientId, setClientId] = useState('')
  const snapshot = useSyncExternalStore(spotifyPlayer.subscribe, spotifyPlayer.getSnapshot)

  useEffect(() => {
    const unsubscribe = window.api.onSpotifySettingsChanged(setSettings)
    void window.api.getSpotifySettings().then(setSettings)
    return unsubscribe
  }, [])

  useEffect(() => {
    if (settings?.connected) spotifyPlayer.ensureStarted()
    else if (settings) spotifyPlayer.stopPlayer()
  }, [settings?.connected])

  useEffect(() => {
    if (settings) setClientId(settings.clientId)
  }, [settings?.clientId])

  const loadPlaylists = (): void => {
    setPlaylistErrorKey(null)
    void window.api
      .getSpotifyPlaylists()
      .then(setPlaylists)
      .catch(() => setPlaylistErrorKey('spotify.error.playlistsLoad'))
  }

  const setDirectContextUri = (): void => {
    const uri = normalizeSpotifyContextUri(directContext)
    if (!uri) {
      setDirectContextErrorKey('spotify.invalidContext')
      return
    }
    setDirectContextErrorKey(null)
    void window.api.setSpotifySettings({ lastPlaylistUri: uri }).then(setSettings)
  }

  const saveClientId = async (): Promise<SpotifySettingsState> => {
    const value = clientId.trim()
    setClientId(value)
    const nextSettings = await window.api.setSpotifySettings({ clientId: value })
    setSettings(nextSettings)
    return nextSettings
  }

  const authorize = async (): Promise<void> => {
    await saveClientId()
    setSettings(await window.api.authorizeSpotify())
  }

  useEffect(() => {
    if (settings?.connected) loadPlaylists()
  }, [settings?.connected])

  if (!settings)
    return <section className="panel remote-panel">{t('common.loadingSettings')}</section>

  const hasDirectSelection =
    settings.lastPlaylistUri !== null &&
    !playlists.some((playlist) => playlist.uri === settings.lastPlaylistUri)

  return (
    <section className="panel remote-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Spotify BGM</h2>
          <span>{t('spotify.description')}</span>
        </div>
      </div>
      {!settings.connected ? (
        variant === 'strip' ? (
          <p className="spotify-client-note">{t('spotify.connectInSetup')}</p>
        ) : (
          <>
            <label className="remote-field">
              <span>Client ID</span>
              <input
                type="text"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                onBlur={() => void saveClientId()}
                disabled={settings.authorizing}
              />
            </label>
            <p className="spotify-client-note">{t('spotify.clientIdHelp')}</p>
            <div className="spotify-actions">
              <button
                type="button"
                disabled={settings.authorizing || !clientId.trim()}
                title={!clientId.trim() ? t('spotify.enterClientIdFirst') : undefined}
                onClick={() => void authorize()}
              >
                {t('spotify.connect')}
              </button>
            </div>
            {settings.authorizing && (
              <p className="power-status is-pending">{t('spotify.authorizing')}</p>
            )}
          </>
        )
      ) : (
        <>
          <p className={`power-status ${snapshot.ready ? 'is-active' : 'is-pending'}`}>
            {snapshot.ready ? t('spotify.ready') : t('spotify.devicePending')}
          </p>
          {variant === 'strip' ? (
            <>
              <label className="audio-device-field">
                <span>{t('bgm.playlist')}</span>
                <select
                  value={settings.lastPlaylistUri ?? ''}
                  onChange={(event) =>
                    void window.api
                      .setSpotifySettings({ lastPlaylistUri: event.target.value || null })
                      .then(setSettings)
                  }
                >
                  <option value="">{t('common.selectPlease')}</option>
                  {hasDirectSelection && (
                    <option value={settings.lastPlaylistUri ?? ''}>
                      {t('spotify.directSelection', { uri: settings.lastPlaylistUri ?? '' })}
                    </option>
                  )}
                  {playlists.map((playlist) => (
                    <option key={playlist.uri} value={playlist.uri}>
                      {playlist.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="spotify-transport">
                <button
                  type="button"
                  disabled={!snapshot.ready || !settings.lastPlaylistUri}
                  onClick={() => {
                    if (settings.lastPlaylistUri) {
                      void localBgmPlayer.stopWithFade(2_000)
                      spotifyPlayer.activate()
                      void spotifyPlayer.playContext(settings.lastPlaylistUri)
                    }
                  }}
                >
                  {t('common.playWithIcon')}
                </button>
                <button
                  type="button"
                  disabled={!snapshot.ready}
                  onClick={spotifyPlayer.previousTrack}
                >
                  {t('common.previous')}
                </button>
                <button
                  type="button"
                  disabled={!snapshot.ready}
                  onClick={() => {
                    if (snapshot.paused) {
                      void localBgmPlayer.stopWithFade(2_000)
                      setActiveBgmSource('spotify')
                    }
                    spotifyPlayer.togglePlay()
                  }}
                >
                  {snapshot.paused ? t('common.play') : t('common.pause')}
                </button>
                <button type="button" disabled={!snapshot.ready} onClick={spotifyPlayer.nextTrack}>
                  {t('common.next')}
                </button>
              </div>
              <div className="spotify-now-playing">
                <span>{t('bgm.currentTrack')}</span>
                <strong>{snapshot.trackName ?? '—'}</strong>
                <small>{snapshot.artistName ?? '—'}</small>
              </div>
              <label className="spotify-volume">
                <span>{t('bgm.volume', { percent: Math.round(snapshot.volume * 100) })}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(snapshot.volume * 100)}
                  onChange={(event) => spotifyPlayer.setVolume(Number(event.target.value) / 100)}
                />
              </label>
            </>
          ) : (
            <>
              <div className="remote-token-row">
                <label className="remote-field">
                  <span>{t('spotify.directUrl')}</span>
                  <input
                    type="text"
                    value={directContext}
                    placeholder={t('spotify.urlPlaceholder')}
                    onChange={(event) => {
                      setDirectContext(event.target.value)
                      setDirectContextErrorKey(null)
                    }}
                  />
                </label>
                <button type="button" onClick={setDirectContextUri}>
                  {t('common.set')}
                </button>
              </div>
              {directContextErrorKey && (
                <p className="remote-error" role="alert">
                  {t(directContextErrorKey)}
                </p>
              )}
              <div className="spotify-actions">
                <button type="button" onClick={loadPlaylists}>
                  {t('common.reloadPlain')}
                </button>
                <button
                  type="button"
                  onClick={() => void window.api.deauthorizeSpotify().then(setSettings)}
                >
                  {t('spotify.disconnect')}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {(settings.error || playlistErrorKey || snapshot.errorKey) && (
        <p className="remote-error" role="alert">
          {settings.error ??
            (playlistErrorKey ? t(playlistErrorKey) : null) ??
            (snapshot.errorKey ? t(snapshot.errorKey, snapshot.errorParams) : null)}
        </p>
      )}
    </section>
  )
}
