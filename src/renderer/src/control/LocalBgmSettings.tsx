import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LocalBgmState, PlaybackCommand } from '../../../shared/types'
import * as localBgmPlayer from './lib/localBgmPlayer'
import * as spotifyPlayer from './lib/spotifyPlayer'
import { useT } from '../i18n/LocaleProvider'

export function LocalBgmSettings({
  localBgm,
  send,
  variant
}: {
  localBgm: LocalBgmState
  send: (command: PlaybackCommand) => void
  variant: 'strip' | 'settings'
}): React.JSX.Element {
  const t = useT()
  const snapshot = useSyncExternalStore(localBgmPlayer.subscribe, localBgmPlayer.getSnapshot)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(
    () => localBgm.playlists[0]?.id ?? ''
  )
  const selectedPlaylist = localBgm.playlists.find((item) => item.id === selectedPlaylistId)

  useEffect(() => {
    if (!selectedPlaylistId || !localBgm.playlists.some((item) => item.id === selectedPlaylistId)) {
      setSelectedPlaylistId(localBgm.playlists[0]?.id ?? '')
    }
  }, [localBgm.playlists, selectedPlaylistId])

  const playSelected = (): void => {
    if (!selectedPlaylist) return
    void spotifyPlayer.transitionToBgm({ mode: 'stop', fadeMs: localBgm.fadeMs })
    localBgmPlayer.playPlaylist(selectedPlaylist)
  }

  const setCrossfade = (mode: 'crossfade' | 'gap', fadeMs: number): void => {
    send({ type: 'setLocalBgmCrossfade', mode, fadeMs })
  }

  return (
    <section className="panel remote-panel">
      <div className="panel-heading compact">
        <div>
          <h2>{t('bgm.localHeading')}</h2>
          <span>{t('bgm.localDescription')}</span>
        </div>
      </div>
      {variant === 'strip' &&
        (localBgm.playlists.length === 0 ? (
          <p className="local-bgm-empty">{t('bgm.createPlaylistHint')}</p>
        ) : (
          <>
            <label className="audio-device-field">
              <span>{t('bgm.playlist')}</span>
              <select
                value={selectedPlaylistId}
                onChange={(event) => setSelectedPlaylistId(event.target.value)}
              >
                {localBgm.playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="spotify-transport">
              <button
                type="button"
                disabled={!selectedPlaylist || selectedPlaylist.tracks.length === 0}
                onClick={playSelected}
              >
                {t('common.playWithIcon')}
              </button>
              <button
                type="button"
                disabled={!snapshot.playing}
                onClick={localBgmPlayer.previousTrack}
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={!snapshot.playing}
                onClick={localBgmPlayer.togglePlay}
              >
                {snapshot.paused ? t('common.play') : t('common.pause')}
              </button>
              <button type="button" disabled={!snapshot.playing} onClick={localBgmPlayer.nextTrack}>
                {t('common.next')}
              </button>
            </div>
            <div className="spotify-now-playing">
              <span>{t('bgm.currentTrack')}</span>
              <strong>{snapshot.trackName ?? '—'}</strong>
            </div>
            <label className="spotify-volume">
              <span>{t('bgm.volume', { percent: Math.round(snapshot.volume * 100) })}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(snapshot.volume * 100)}
                onChange={(event) => localBgmPlayer.setVolume(Number(event.target.value) / 100)}
              />
            </label>
          </>
        ))}
      {variant === 'settings' && (
        <div className="local-bgm-crossfade">
          <label>
            <span>{t('bgm.betweenTracks')}</span>
            <select
              value={localBgm.crossfadeMode}
              onChange={(event) =>
                setCrossfade(event.target.value as 'crossfade' | 'gap', localBgm.fadeMs)
              }
            >
              <option value="crossfade">{t('bgm.crossfade')}</option>
              <option value="gap">{t('bgm.fadeGap')}</option>
            </select>
          </label>
          <label>
            <span>{t('bgm.fadeSeconds')}</span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={localBgm.fadeMs / 1000}
              onChange={(event) =>
                setCrossfade(
                  localBgm.crossfadeMode,
                  Math.min(10_000, Math.max(0, Number(event.target.value) * 1000))
                )
              }
            />
          </label>
        </div>
      )}
      {snapshot.errorKey && (
        <p className="remote-error" role="alert">
          {t(snapshot.errorKey, snapshot.errorParams)}
        </p>
      )}
    </section>
  )
}
