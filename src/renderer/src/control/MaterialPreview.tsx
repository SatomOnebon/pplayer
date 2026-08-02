import { useState } from 'react'
import { toThumbUrl } from '../../../shared/mediaUrl'
import type { PhotoItem, PlaybackCommand } from '../../../shared/types'
import { useT } from '../i18n/LocaleProvider'

export function MaterialPreview({
  photo,
  listIndex,
  playableIndex,
  send,
  onClose
}: {
  photo: PhotoItem
  listIndex: number
  playableIndex: number
  send: (command: PlaybackCommand) => void
  onClose: () => void
}): React.JSX.Element {
  const t = useT()
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)

  return (
    <div className="material-preview" aria-label={t('preview.material')}>
      <img
        src={toThumbUrl(photo.filePath, 1024, photo.reloadToken)}
        alt={photo.fileName}
        draggable={false}
        onLoad={(event) => {
          setDimensions({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight
          })
        }}
      />
      <div className="material-preview-details">
        <div className="material-preview-copy">
          <strong title={photo.fileName}>{photo.fileName}</strong>
          <span>
            {t('preview.listPosition', { index: listIndex + 1 })} {' · '}
            {dimensions ? `${dimensions.width}×${dimensions.height}px` : t('preview.loadingSize')}
          </span>
        </div>
        <div className="material-preview-actions">
          <button
            type="button"
            disabled={photo.excluded}
            title={photo.excluded ? t('preview.excludedDisabled') : undefined}
            onClick={() => send({ type: 'jump', index: playableIndex })}
          >
            {t('preview.playFromHere')}
          </button>
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
