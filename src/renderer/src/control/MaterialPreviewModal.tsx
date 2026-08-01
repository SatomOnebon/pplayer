import { useEffect, useMemo, useState } from 'react'
import { toMediaUrl } from '../../../shared/mediaUrl'
import type { PreviewTarget } from '../../../shared/types'

export function MaterialPreviewModal({
  target,
  onClose
}: {
  target: PreviewTarget
  onClose: () => void
}): React.JSX.Element {
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
            <span>素材プレビュー（本番出力には表示されません）</span>
            <h2 id="material-preview-title">{target.material.name}</h2>
          </div>
          <button
            type="button"
            className="material-preview-close"
            aria-label="閉じる"
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
              <p className="material-preview-empty">写真がありません</p>
            ))}
        </div>

        {target.type === 'video' && (
          <div className="material-preview-modal-controls">
            <button
              type="button"
              onClick={() => void window.api.openExternalPlayer(target.material.filePath)}
            >
              🔊 音つきで開く（外部プレーヤー）
            </button>
            <span>
              アプリ内プレビューは無音です（会場への漏れ防止）。音は外部プレーヤーで確認できます。
            </span>
          </div>
        )}
        {target.type === 'slideshow' && photos.length > 0 && (
          <div className="material-preview-modal-controls">
            <button type="button" onClick={() => setPlaying((value) => !value)}>
              {playing ? '⏸ 一時停止' : '▶ 再生'}
            </button>
            <button type="button" onClick={previousPhoto}>
              ← 前へ
            </button>
            <button type="button" onClick={nextPhoto}>
              次へ →
            </button>
            <span>
              {photoIndex + 1} / 全{photos.length}枚
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
