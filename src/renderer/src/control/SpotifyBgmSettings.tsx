import { useEffect, useState, useSyncExternalStore } from 'react'
import { normalizeSpotifyContextUri } from '../../../shared/spotifyUri'
import type { SpotifyPlaylist, SpotifySettingsState } from '../../../shared/types'
import * as localBgmPlayer from './lib/localBgmPlayer'
import * as spotifyPlayer from './lib/spotifyPlayer'
import { setActiveBgmSource } from './lib/bgmSource'

export function SpotifyBgmSettings(): React.JSX.Element {
  const [settings, setSettings] = useState<SpotifySettingsState | null>(null)
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [directContext, setDirectContext] = useState('')
  const [directContextError, setDirectContextError] = useState<string | null>(null)
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
    setPlaylistError(null)
    void window.api
      .getSpotifyPlaylists()
      .then(setPlaylists)
      .catch(() => setPlaylistError('プレイリストを取得できませんでした'))
  }

  const setDirectContextUri = (): void => {
    const uri = normalizeSpotifyContextUri(directContext)
    if (!uri) {
      setDirectContextError(
        'Spotify のプレイリスト、アルバム、またはアーティストのURL/URIを入力してください'
      )
      return
    }
    setDirectContextError(null)
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

  if (!settings) return <section className="panel remote-panel">設定を読み込んでいます…</section>

  const hasDirectSelection =
    settings.lastPlaylistUri !== null &&
    !playlists.some((playlist) => playlist.uri === settings.lastPlaylistUri)

  return (
    <section className="panel remote-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Spotify BGM</h2>
          <span>映像とは独立したBGMトランスポート</span>
        </div>
      </div>
      {!settings.connected ? (
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
          <p className="spotify-client-note">
            Spotify Developer Dashboard で自分のアプリを登録し、Redirect URI に
            http://127.0.0.1:8723/callback を追加して Client ID を入力してください
          </p>
          <div className="spotify-actions">
            <button
              type="button"
              disabled={settings.authorizing || !clientId.trim()}
              title={!clientId.trim() ? '先に Client ID を入力' : undefined}
              onClick={() => void authorize()}
            >
              Spotify と連携
            </button>
          </div>
          {settings.authorizing && (
            <p className="power-status is-pending">▲ 連携中…（ブラウザで許可してください）</p>
          )}
          {settings.error && (
            <p className="remote-error" role="alert">
              {settings.error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className={`power-status ${snapshot.ready ? 'is-active' : 'is-pending'}`}>
            {snapshot.ready ? '● BGM 準備完了' : '▲ デバイス準備中…'}
          </p>
          <label className="audio-device-field">
            <span>プレイリスト</span>
            <select
              value={settings.lastPlaylistUri ?? ''}
              onChange={(event) =>
                void window.api
                  .setSpotifySettings({ lastPlaylistUri: event.target.value || null })
                  .then(setSettings)
              }
            >
              <option value="">選択してください</option>
              {hasDirectSelection && (
                <option value={settings.lastPlaylistUri ?? ''}>
                  （直接指定）{settings.lastPlaylistUri}
                </option>
              )}
              {playlists.map((playlist) => (
                <option key={playlist.uri} value={playlist.uri}>
                  {playlist.name}
                </option>
              ))}
            </select>
          </label>
          <div className="remote-token-row">
            <label className="remote-field">
              <span>またはURL/URIを直接指定</span>
              <input
                type="text"
                value={directContext}
                placeholder="https://open.spotify.com/playlist/... または spotify:playlist:..."
                onChange={(event) => {
                  setDirectContext(event.target.value)
                  setDirectContextError(null)
                }}
              />
            </label>
            <button type="button" onClick={setDirectContextUri}>
              セット
            </button>
          </div>
          {directContextError && (
            <p className="remote-error" role="alert">
              {directContextError}
            </p>
          )}
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
              ▶ 再生
            </button>
            <button type="button" disabled={!snapshot.ready} onClick={spotifyPlayer.previousTrack}>
              前へ
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
              {snapshot.paused ? '再生' : '一時停止'}
            </button>
            <button type="button" disabled={!snapshot.ready} onClick={spotifyPlayer.nextTrack}>
              次へ
            </button>
          </div>
          <div className="spotify-now-playing">
            <span>現在の曲</span>
            <strong>{snapshot.trackName ?? '—'}</strong>
            <small>{snapshot.artistName ?? '—'}</small>
          </div>
          <label className="spotify-volume">
            <span>音量 {Math.round(snapshot.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(snapshot.volume * 100)}
              onChange={(event) => spotifyPlayer.setVolume(Number(event.target.value) / 100)}
            />
          </label>
          <div className="spotify-actions">
            <button type="button" onClick={loadPlaylists}>
              再読み込み
            </button>
            <button
              type="button"
              onClick={() => void window.api.deauthorizeSpotify().then(setSettings)}
            >
              連携解除
            </button>
          </div>
          {(settings.error || playlistError || snapshot.error) && (
            <p className="remote-error" role="alert">
              {settings.error ?? playlistError ?? snapshot.error}
            </p>
          )}
        </>
      )}
    </section>
  )
}
