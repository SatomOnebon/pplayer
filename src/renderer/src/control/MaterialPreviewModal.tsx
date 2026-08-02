import { useEffect, useMemo, useState } from 'react'
import { toMediaUrl } from '../../../shared/mediaUrl'
import type { PreviewTarget } from '../../../shared/types'
import { useT } from '../i18n/LocaleProvider'

export function MaterialPreviewModal({
  target,
  onClose
}: {
  target: PreviewTarget
  onClose: () => void
}): React.JSX.Element {
  const t = useT()
  const [photoIndex, setPhotoIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const photos = useMemo(
    () => (target.type === 'slideshow' ? target.material.photos.filter((p) => !p.excluded) : []),
    [target.material, target.type]
  )
  const slideshowHoldMs = target.type === 'slideshow' ? target.material.timing.holdMs : null

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    setPhotoIndex(0)
    setPlaying(true)
  }, [target.material.id, target.type])

  useEffect(() => {
    if (slideshowHoldMs === null || !playing || photos.length === 0) return
    const photo = photos[photoIndex]
    const timer = window.setTimeout(
      () => setPhotoIndex((current) => (current + 1) % photos.length),
      photo.holdMs ?? slideshowHoldMs
    )
    return () => window.clearTimeout(timer)
  }, [photoIndex, photos, playing, slideshowHoldMs])

  const previousPhoto = (): void =>
    setPhotoIndex((current) => (current - 1 + photos.length) % photos.length)
  const nextPhoto = (): void => setPhotoIndex((current) => (current + 1) % photos.length)

  return (
    <div
      className="material-preview-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="material-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-preview-title"
      >
        <header className="material-preview-modal-header">
          <div>
            <span>{t('preview.modalDescription')}</span>
            <h2 id="material-preview-title">{target.material.name}</h2>
          </div>
          <button
            type="button"
            className="material-preview-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="material-preview-modal-media">
          {target.type === 'video' && (
            <video
              src={toMediaUrl(target.material.filePath, target.material.reloadToken)}
              controls
              muted
              autoPlay
              playsInline
            />
          )}
          {target.type === 'still' && (
            <img
              src={toMediaUrl(target.material.filePath, target.material.reloadToken)}
              alt={target.material.name}
            />
          )}
          {target.type === 'slideshow' &&
            (photos.length > 0 ? (
              <img
                src={toMediaUrl(photos[photoIndex].filePath, photos[photoIndex].reloadToken)}
                alt={photos[photoIndex].fileName}
              />
            ) : (
              <p className="material-preview-empty">{t('photo.empty')}</p>
            ))}
        </div>

        {target.type === 'video' && (
          <div className="material-preview-modal-controls">
            <button
              type="button"
              onClick={() => void window.api.openExternalPlayer(target.material.filePath)}
            >
              {t('preview.openWithSound')}
            </button>
            <span>{t('preview.mutedHint')}</span>
          </div>
        )}
        {target.type === 'slideshow' && photos.length > 0 && (
          <div className="material-preview-modal-controls">
            <button type="button" onClick={() => setPlaying((value) => !value)}>
              {playing ? t('common.pauseWithIcon') : t('common.playWithIcon')}
            </button>
            <button type="button" onClick={previousPhoto}>
              {t('common.previousWithArrow')}
            </button>
            <button type="button" onClick={nextPhoto}>
              {t('common.nextWithArrow')}
            </button>
            <span>
              {t('preview.photoProgress', { current: photoIndex + 1, total: photos.length })}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
