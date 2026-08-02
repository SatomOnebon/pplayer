import { useState } from 'react'
import type { LocalBgmState, PlaybackCommand } from '../../../shared/types'
import { useT } from '../i18n/LocaleProvider'

export function LocalBgmLibrary({
  localBgm,
  send,
  onMessage
}: {
  localBgm: LocalBgmState
  send: (command: PlaybackCommand) => void
  onMessage: (message: string) => void
}): React.JSX.Element {
  const t = useT()
  const [removeKey, setRemoveKey] = useState<string | null>(null)

  return (
    <section className="material-section">
      <div className="material-section-heading">
        <h3>{t('bgm.localHeading')}</h3>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt(
              t('bgm.playlistName'),
              t('bgm.defaultPlaylistName', { index: localBgm.playlists.length + 1 })
            )
            if (name?.trim()) send({ type: 'addLocalBgmPlaylist', name })
          }}
        >
          {t('bgm.createPlaylist')}
        </button>
      </div>
      {localBgm.playlists.length === 0 && (
        <p className="material-empty">{t('bgm.noLocalPlaylists')}</p>
      )}
      {localBgm.playlists.map((playlist) => (
        <article className="material-card" key={playlist.id}>
          <div className="material-card-copy">
            <strong>{playlist.name}</strong>
            <span>{t('bgm.trackCount', { count: playlist.tracks.length })}</span>
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
                  {t('common.delete')}
                </button>
              </span>
            ))}
          </div>
          <div className="material-actions">
            <button
              type="button"
              onClick={() => {
                const name = window.prompt(t('bgm.playlistName'), playlist.name)
                if (name?.trim())
                  send({ type: 'renameLocalBgmPlaylist', playlistId: playlist.id, name })
              }}
            >
              {t('common.rename')}
            </button>
            <button
              type="button"
              onClick={() =>
                void window.api.chooseAudio().then((tracks) => {
                  if (tracks.length === 0) return
                  send({ type: 'addLocalBgmTracks', playlistId: playlist.id, tracks })
                  onMessage(t('bgm.addedTracks', { count: tracks.length }))
                })
              }
            >
              {t('bgm.addAudio')}
            </button>
            <button
              type="button"
              onClick={() => {
                send({ type: 'reloadLocalBgmPlaylist', playlistId: playlist.id })
                onMessage(t('bgm.reloadedPlaylist'))
              }}
            >
              {t('common.reload')}
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
              {removeKey === `bgm:${playlist.id}` ? t('common.confirmDelete') : t('common.delete')}
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}
