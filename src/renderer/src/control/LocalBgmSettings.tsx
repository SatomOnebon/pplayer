import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LocalBgmState, PlaybackCommand } from '../../../shared/types'
import * as localBgmPlayer from './lib/localBgmPlayer'
import * as spotifyPlayer from './lib/spotifyPlayer'

export function LocalBgmSettings({
  localBgm,
  send
}: {
  localBgm: LocalBgmState
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
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

  useEffect(() => {
    localBgmPlayer.setCrossfade(localBgm.crossfadeMode, localBgm.fadeMs)
  }, [localBgm.crossfadeMode, localBgm.fadeMs])

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
          <h2>ローカル BGM</h2>
          <span>端末内の音源を再生</span>
        </div>
      </div>
      {localBgm.playlists.length === 0 ? (
        <p className="local-bgm-empty">上のライブラリでプレイリストを作成してください</p>
      ) : (
        <>
          <label className="audio-device-field">
            <span>プレイリスト</span>
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
              ▶ 再生
            </button>
            <button
              type="button"
              disabled={!snapshot.playing}
              onClick={localBgmPlayer.previousTrack}
            >
              前へ
            </button>
            <button type="button" disabled={!snapshot.playing} onClick={localBgmPlayer.togglePlay}>
              {snapshot.paused ? '再生' : '一時停止'}
            </button>
            <button type="button" disabled={!snapshot.playing} onClick={localBgmPlayer.nextTrack}>
              次へ
            </button>
          </div>
          <div className="spotify-now-playing">
            <span>現在の曲</span>
            <strong>{snapshot.trackName ?? '—'}</strong>
          </div>
          <label className="spotify-volume">
            <span>BGM 音量 {Math.round(snapshot.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(snapshot.volume * 100)}
              onChange={(event) => localBgmPlayer.setVolume(Number(event.target.value) / 100)}
            />
          </label>
        </>
      )}
      <div className="local-bgm-crossfade">
        <label>
          <span>曲間</span>
          <select
            value={localBgm.crossfadeMode}
            onChange={(event) =>
              setCrossfade(event.target.value as 'crossfade' | 'gap', localBgm.fadeMs)
            }
          >
            <option value="crossfade">クロスフェード</option>
            <option value="gap">フェードアウト→イン</option>
          </select>
        </label>
        <label>
          <span>フェード秒</span>
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
      {snapshot.error && (
        <p className="remote-error" role="alert">
          {snapshot.error}
        </p>
      )}
    </section>
  )
}
