import { useState } from 'react'
import type { LocalBgmState, PlaybackCommand } from '../../../shared/types'

export function LocalBgmLibrary({
  localBgm,
  send,
  onMessage
}: {
  localBgm: LocalBgmState
  send: (command: PlaybackCommand) => void
  onMessage: (message: string) => void
}): React.JSX.Element {
  const [removeKey, setRemoveKey] = useState<string | null>(null)

  return (
    <section className="material-section">
      <div className="material-section-heading">
        <h3>ローカルBGM</h3>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt(
              'プレイリスト名',
              `プレイリスト${localBgm.playlists.length + 1}`
            )
            if (name?.trim()) send({ type: 'addLocalBgmPlaylist', name })
          }}
        >
          ＋ プレイリスト作成
        </button>
      </div>
      {localBgm.playlists.length === 0 && (
        <p className="material-empty">ローカルBGMプレイリストはありません</p>
      )}
      {localBgm.playlists.map((playlist) => (
        <article className="material-card" key={playlist.id}>
          <div className="material-card-copy">
            <strong>{playlist.name}</strong>
            <span>{playlist.tracks.length}曲</span>
            {playlist.tracks.map((track) => (
              <span key={track.id} title={track.filePath}>
                {track.name}{' '}
                <button
                  type="button"
                  onClick={() =>
                    send({
                      type: 'removeLocalBgmTrack',
                      playlistId: playlist.id,
                      trackId: track.id
                    })
                  }
                >
                  削除
                </button>
              </span>
            ))}
          </div>
          <div className="material-actions">
            <button
              type="button"
              onClick={() => {
                const name = window.prompt('プレイリスト名', playlist.name)
                if (name?.trim())
                  send({ type: 'renameLocalBgmPlaylist', playlistId: playlist.id, name })
              }}
            >
              ✎ 名前
            </button>
            <button
              type="button"
              onClick={() =>
                void window.api.chooseAudio().then((tracks) => {
                  if (tracks.length === 0) return
                  send({ type: 'addLocalBgmTracks', playlistId: playlist.id, tracks })
                  onMessage(`${tracks.length}曲を追加しました`)
                })
              }
            >
              ＋ 音声を追加
            </button>
            <button
              type="button"
              onClick={() => {
                send({ type: 'reloadLocalBgmPlaylist', playlistId: playlist.id })
                onMessage('プレイリストを再読み込みしました')
              }}
            >
              ↻ リロード
            </button>
            <button
              type="button"
              className={removeKey === `bgm:${playlist.id}` ? 'danger confirming' : ''}
              onClick={() => {
                const key = `bgm:${playlist.id}`
                if (removeKey === key) {
                  send({ type: 'removeLocalBgmPlaylist', playlistId: playlist.id })
                  setRemoveKey(null)
                } else setRemoveKey(key)
              }}
            >
              {removeKey === `bgm:${playlist.id}` ? '削除?' : '削除'}
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}
