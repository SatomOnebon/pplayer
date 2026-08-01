import { useState } from 'react'
import { toThumbUrl } from '../../../shared/mediaUrl'
import type { PhotoItem, PlaybackCommand } from '../../../shared/types'

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
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)

  return (
    <div className="material-preview" aria-label="素材プレビュー">
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
            リスト {listIndex + 1}番 {' · '}
            {dimensions ? `${dimensions.width}×${dimensions.height}px` : 'サイズを取得中…'}
          </span>
        </div>
        <div className="material-preview-actions">
          <button
            type="button"
            disabled={photo.excluded}
            title={photo.excluded ? '除外中の写真は再生できません' : undefined}
            onClick={() => send({ type: 'jump', index: playableIndex })}
          >
            ここから再生
          </button>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
