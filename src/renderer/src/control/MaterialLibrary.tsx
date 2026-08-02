import { useState } from 'react'
import { toThumbUrl } from '../../../shared/mediaUrl'
import type { FitMode, Materials, MaterialType, PlaybackCommand } from '../../../shared/types'
import { Thumb } from './Thumb'
import { useT } from '../i18n/LocaleProvider'

export function MaterialLibrary({
  materials,
  standbyStillId,
  send,
  onEdit,
  onPreview,
  onMessage
}: {
  materials: Materials
  standbyStillId: string | null
  send: (command: PlaybackCommand) => void
  onEdit: (id: string) => void
  onPreview: (type: MaterialType, id: string) => void
  onMessage: (message: string) => void
}): React.JSX.Element {
  const t = useT()
  const [removeKey, setRemoveKey] = useState<string | null>(null)
  const rename = (type: MaterialType, id: string, current: string): void => {
    const name = window.prompt(t('material.name'), current)
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
        {t('common.rename')}
      </button>
      <button type="button" onClick={() => onPreview(type, id)}>
        {t('material.preview')}
      </button>
      <button type="button" onClick={() => addCue(type, id, name)}>
        {t('material.addToCue')}
      </button>
      <button
        type="button"
        onClick={() => {
          send({ type: 'reloadMaterial', materialType: type, materialId: id })
          onMessage(t('material.reloaded'))
        }}
      >
        {t('common.reload')}
      </button>
      <button
        type="button"
        className={removeKey === `${type}:${id}` ? 'danger confirming' : ''}
        onClick={() => remove(type, id)}
      >
        {removeKey === `${type}:${id}` ? t('common.confirmDelete') : t('common.delete')}
      </button>
    </div>
  )
  const fitSelect = (type: 'video' | 'still', id: string, fit: FitMode): React.JSX.Element => (
    <label className="material-fit-control">
      <span>{t('material.fit')}</span>
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
        <option value="contain">{t('material.fitContain')}</option>
        <option value="cover">{t('material.fitCover')}</option>
      </select>
    </label>
  )
  return (
    <div className="material-library">
      <section className="material-section">
        <div className="material-section-heading">
          <h3>{t('material.slideshow')}</h3>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt(
                t('material.slideshowName'),
                t('material.defaultSlideshowName', { index: materials.slideshows.length + 1 })
              )
              if (name?.trim()) send({ type: 'addSlideshow', name })
            }}
          >
            {t('material.newSlideshow')}
          </button>
        </div>
        {materials.slideshows.map((item) => {
          const photo = item.photos.find((candidate) => !candidate.excluded)
          return (
            <article className="material-card" key={item.id}>
              <Thumb src={photo ? toThumbUrl(photo.filePath, 128, photo.reloadToken) : null} />
              <div className="material-card-copy">
                <strong>{item.name}</strong>
                <span>{t('photo.count', { count: item.photos.length })}</span>
              </div>
              <button className="primary-button" type="button" onClick={() => onEdit(item.id)}>
                {t('common.edit')}
              </button>
              {actions('slideshow', item.id, item.name)}
            </article>
          )
        })}
      </section>
      <section className="material-section">
        <div className="material-section-heading">
          <h3>{t('material.video')}</h3>
          <button
            type="button"
            onClick={() =>
              void window.api
                .chooseVideo()
                .then((added) => added && onMessage(t('material.videoAdded')))
            }
          >
            {t('material.addVideo')}
          </button>
        </div>
        {materials.videos.length === 0 && (
          <p className="material-empty">{t('material.noVideos')}</p>
        )}
        {materials.videos.map((item) => (
          <article className="material-card" key={item.id}>
            <Thumb
              src={toThumbUrl(item.filePath, 128, item.reloadToken)}
              fallbackLabel={t('material.video')}
            />
            <div className="material-card-copy">
              <strong>{item.name}</strong>
              <span title={item.filePath}>{item.filePath.split('/').pop()}</span>
            </div>
            <label className="volume-control">
              <span>{t('material.volume', { percent: Math.round(item.volume * 100) })}</span>
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
          <h3>{t('material.still')}</h3>
          <button
            type="button"
            onClick={() =>
              void window.api
                .chooseStill()
                .then((added) => added && onMessage(t('material.stillAdded')))
            }
          >
            {t('material.addStill')}
          </button>
        </div>
        {materials.stills.length === 0 && (
          <p className="material-empty">{t('material.noStills')}</p>
        )}
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
              {standbyStillId === item.id ? t('material.standbyActive') : t('material.setStandby')}
            </button>
            {fitSelect('still', item.id, item.fit)}
            {actions('still', item.id, item.name)}
          </article>
        ))}
      </section>
    </div>
  )
}
