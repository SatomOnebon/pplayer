import { useState } from 'react'
import { toThumbUrl } from '../../../shared/mediaUrl'
import type {
  FitMode,
  LocalBgmState,
  Materials,
  MaterialType,
  PlaybackCommand
} from '../../../shared/types'
import { Thumb } from './Thumb'

export function MaterialLibrary({
  materials,
  localBgm,
  standbyStillId,
  send,
  onEdit,
  onPreview,
  onMessage
}: {
  materials: Materials
  localBgm: LocalBgmState
  standbyStillId: string | null
  send: (command: PlaybackCommand) => void
  onEdit: (id: string) => void
  onPreview: (type: MaterialType, id: string) => void
  onMessage: (message: string) => void
}): React.JSX.Element {
  const [removeKey, setRemoveKey] = useState<string | null>(null)
  const rename = (type: MaterialType, id: string, current: string): void => {
    const name = window.prompt('素材名', current)
    if (name?.trim()) send({ type: 'renameMaterial', materialType: type, materialId: id, name })
  }
  const addCue = (type: MaterialType, id: string, label: string): void =>
    send({
      type: 'addCue',
      label,
      materialType: type,
      materialId: id,
      endBehavior: type === 'slideshow' ? 'loop' : type === 'video' ? 'advance' : 'hold'
    })
  const remove = (type: MaterialType, id: string): void => {
    const key = `${type}:${id}`
    if (removeKey === key) {
      send({ type: 'removeMaterial', materialType: type, materialId: id })
      setRemoveKey(null)
    } else setRemoveKey(key)
  }
  const actions = (type: MaterialType, id: string, name: string): React.JSX.Element => (
    <div className="material-actions">
      <button type="button" onClick={() => rename(type, id, name)}>
        ✎ 名前
      </button>
      <button type="button" onClick={() => onPreview(type, id)}>
        ▷ プレビュー
      </button>
      <button type="button" onClick={() => addCue(type, id, name)}>
        ＋ キューに追加
      </button>
      <button
        type="button"
        onClick={() => {
          send({ type: 'reloadMaterial', materialType: type, materialId: id })
          onMessage('素材を再読み込みしました')
        }}
      >
        ↻ リロード
      </button>
      <button
        type="button"
        className={removeKey === `${type}:${id}` ? 'danger confirming' : ''}
        onClick={() => remove(type, id)}
      >
        {removeKey === `${type}:${id}` ? '削除?' : '削除'}
      </button>
    </div>
  )
  const fitSelect = (type: 'video' | 'still', id: string, fit: FitMode): React.JSX.Element => (
    <label className="material-fit-control">
      <span>配置</span>
      <select
        value={fit}
        onChange={(event) =>
          send({
            type: 'setMaterialFit',
            materialType: type,
            materialId: id,
            fit: event.currentTarget.value as FitMode
          })
        }
      >
        <option value="contain">全体表示</option>
        <option value="cover">埋める</option>
      </select>
    </label>
  )
  return (
    <div className="material-library">
      <section className="material-section">
        <div className="material-section-heading">
          <h3>スライドショー</h3>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt(
                'スライドショー名',
                `スライドショー${materials.slideshows.length + 1}`
              )
              if (name?.trim()) send({ type: 'addSlideshow', name })
            }}
          >
            ＋ 新規スライドショー
          </button>
        </div>
        {materials.slideshows.map((item) => {
          const photo = item.photos.find((candidate) => !candidate.excluded)
          return (
            <article className="material-card" key={item.id}>
              <Thumb src={photo ? toThumbUrl(photo.filePath, 128, photo.reloadToken) : null} />
              <div className="material-card-copy">
                <strong>{item.name}</strong>
                <span>{item.photos.length}枚</span>
              </div>
              <button className="primary-button" type="button" onClick={() => onEdit(item.id)}>
                編集
              </button>
              {actions('slideshow', item.id, item.name)}
            </article>
          )
        })}
      </section>
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
      <section className="material-section">
        <div className="material-section-heading">
          <h3>動画</h3>
          <button
            type="button"
            onClick={() =>
              void window.api
                .chooseVideo()
                .then((added) => added && onMessage('動画素材を追加しました'))
            }
          >
            ＋ 動画を追加
          </button>
        </div>
        {materials.videos.length === 0 && <p className="material-empty">動画素材はありません</p>}
        {materials.videos.map((item) => (
          <article className="material-card" key={item.id}>
            <Thumb src={toThumbUrl(item.filePath, 128, item.reloadToken)} fallbackLabel="動画" />
            <div className="material-card-copy">
              <strong>{item.name}</strong>
              <span title={item.filePath}>{item.filePath.split('/').pop()}</span>
            </div>
            <label className="volume-control">
              <span>音量 {Math.round(item.volume * 100)}%</span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(item.volume * 100)}
                onChange={(event) =>
                  send({
                    type: 'setVideoVolume',
                    materialId: item.id,
                    volume: Number(event.target.value) / 100
                  })
                }
              />
            </label>
            {fitSelect('video', item.id, item.fit)}
            {actions('video', item.id, item.name)}
          </article>
        ))}
      </section>
      <section className="material-section">
        <div className="material-section-heading">
          <h3>静止画</h3>
          <button
            type="button"
            onClick={() =>
              void window.api
                .chooseStill()
                .then((added) => added && onMessage('静止画素材を追加しました'))
            }
          >
            ＋ 静止画を追加
          </button>
        </div>
        {materials.stills.length === 0 && <p className="material-empty">静止画素材はありません</p>}
        {materials.stills.map((item) => (
          <article className="material-card" key={item.id}>
            <Thumb src={toThumbUrl(item.filePath, 128, item.reloadToken)} />
            <div className="material-card-copy">
              <strong>{item.name}</strong>
              <span title={item.filePath}>{item.filePath.split('/').pop()}</span>
            </div>
            <button
              className={standbyStillId === item.id ? 'standby-active' : ''}
              type="button"
              onClick={() =>
                send({
                  type: 'setStandbyStill',
                  materialId: standbyStillId === item.id ? null : item.id
                })
              }
            >
              {standbyStillId === item.id ? '✓ 蓋絵' : '蓋絵に設定'}
            </button>
            {fitSelect('still', item.id, item.fit)}
            {actions('still', item.id, item.name)}
          </article>
        ))}
      </section>
    </div>
  )
}
