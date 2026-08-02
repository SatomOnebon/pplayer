import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent
} from 'react'
import { toThumbUrl } from '../../../shared/mediaUrl'
import type { FitMode, PhotoItem, PlaybackCommand, TimingConfig } from '../../../shared/types'
import { MaterialPreview } from './MaterialPreview'
import { seconds } from './utils'
import { useT } from '../i18n/LocaleProvider'

interface PhotoTiming {
  fadeInMs: number | null
  holdMs: number | null
  fadeOutMs: number | null
}

function buildPlayableIndexes(photos: PhotoItem[]): number[] {
  let next = 0
  return photos.map((photo) => {
    const index = next
    if (!photo.excluded) next += 1
    return index
  })
}

function PhotoTimingInputs({
  photo,
  defaultTiming,
  send
}: {
  photo: PhotoItem
  defaultTiming: TimingConfig
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const t = useT()
  const timing: PhotoTiming = photo
  const [draft, setDraft] = useState<Record<keyof PhotoTiming, string>>({
    fadeInMs: timing.fadeInMs === null ? '' : seconds(timing.fadeInMs),
    holdMs: timing.holdMs === null ? '' : seconds(timing.holdMs),
    fadeOutMs: timing.fadeOutMs === null ? '' : seconds(timing.fadeOutMs)
  })
  const commit = (field: keyof PhotoTiming): void => {
    const value = draft[field].trim() === '' ? null : Number(draft[field])
    if (value !== null && !Number.isFinite(value)) {
      setDraft((current) => ({
        ...current,
        [field]: timing[field] === null ? '' : seconds(timing[field]!)
      }))
      return
    }
    const minimum = field === 'holdMs' ? 0.1 : 0
    send({
      type: 'setPhotoTiming',
      id: photo.id,
      timing: {
        ...timing,
        [field]: value === null ? null : Math.round(Math.max(minimum, value) * 1000)
      }
    })
  }
  return (
    <div
      className="photo-timing-controls"
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
    >
      {(
        [
          ['fadeInMs', 'photo.fadeIn', 0],
          ['holdMs', 'photo.hold', 0.1],
          ['fadeOutMs', 'photo.fadeOut', 0]
        ] as const
      ).map(([field, labelKey, minimum]) => (
        <label key={field}>
          <span>{t(labelKey)}</span>
          <input
            type="number"
            min={minimum}
            step="0.1"
            value={draft[field]}
            placeholder={seconds(defaultTiming[field])}
            aria-label={t('photo.timingSeconds', { label: t(labelKey) })}
            onChange={(event) =>
              setDraft((current) => ({ ...current, [field]: event.target.value }))
            }
            onBlur={() => commit(field)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </label>
      ))}
      <label>
        <span>{t('material.fit')}</span>
        <select
          value={photo.fit ?? ''}
          aria-label={t('photo.fitPerPhoto')}
          onChange={(event) =>
            send({
              type: 'setPhotoFit',
              id: photo.id,
              fit: event.currentTarget.value === '' ? null : (event.currentTarget.value as FitMode)
            })
          }
          onKeyDown={(event) => event.stopPropagation()}
        >
          <option value="">{t('common.default')}</option>
          <option value="contain">{t('mask.fitContainDetailed')}</option>
          <option value="cover">{t('material.fitCoverDetailed')}</option>
        </select>
      </label>
    </div>
  )
}

interface PhotoRowProps {
  photo: PhotoItem
  listIndex: number
  playableIndex: number
  isCurrent: boolean
  isDragTarget: boolean
  dropAfter: boolean
  isDragging: boolean
  isSelected: boolean
  isRemoveConfirming: boolean
  defaultTiming: TimingConfig
  send: (command: PlaybackCommand) => void
  onDragStart: (event: DragEvent<HTMLLIElement>, id: string) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLLIElement>, id: string) => void
  onDrop: (event: DragEvent<HTMLLIElement>, id: string) => void
  onSelectionClick: (event: MouseEvent<HTMLInputElement>, id: string) => void
  onPreview: (id: string) => void
  onRemoveClick: (id: string) => void
}

const PhotoRow = memo(function PhotoRow(props: PhotoRowProps): React.JSX.Element {
  const t = useT()
  const { photo } = props
  const targetClass = props.isDragTarget ? (props.dropAfter ? 'drop-after' : 'drop-before') : ''
  return (
    <li
      className={[
        'photo-row',
        photo.excluded ? 'excluded' : '',
        props.isCurrent ? 'current' : '',
        props.isSelected ? 'selected' : '',
        props.isDragging ? 'dragging' : '',
        targetClass
      ].join(' ')}
      draggable
      onDragStart={(event) => props.onDragStart(event, photo.id)}
      onDragEnd={props.onDragEnd}
      onDragOver={(event) => props.onDragOver(event, photo.id)}
      onDrop={(event) => props.onDrop(event, photo.id)}
      onClick={() => props.onPreview(photo.id)}
      onDoubleClick={() => {
        if (!photo.excluded) props.send({ type: 'jump', index: props.playableIndex })
      }}
      title={t('photo.rowHint')}
      aria-current={props.isCurrent ? 'true' : undefined}
    >
      <span className="drag-handle" aria-hidden="true">
        ⠿
      </span>
      <input
        className="photo-select-checkbox"
        type="checkbox"
        checked={props.isSelected}
        aria-label={t('photo.selectPhoto', { name: photo.fileName })}
        onClick={(event) => {
          event.stopPropagation()
          props.onSelectionClick(event, photo.id)
        }}
        onDragStart={(event) => event.preventDefault()}
        onChange={() => undefined}
      />
      <span className="row-number">{props.listIndex + 1}</span>
      <img
        src={toThumbUrl(photo.filePath, 128, photo.reloadToken)}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
      />
      <span className="photo-name" title={photo.fileName}>
        {photo.fileName}
      </span>
      <PhotoTimingInputs
        key={`${photo.id}:${photo.fadeInMs ?? 'default'}:${photo.holdMs ?? 'default'}:${photo.fadeOutMs ?? 'default'}`}
        photo={photo}
        defaultTiming={props.defaultTiming}
        send={props.send}
      />
      <div className="photo-row-actions">
        <label className="exclude-control" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={photo.excluded}
            onChange={(event) =>
              props.send({
                type: 'setExcluded',
                id: photo.id,
                excluded: event.currentTarget.checked
              })
            }
          />
          {t('photo.exclude')}
        </label>
        <button
          className={`remove-photo-button ${props.isRemoveConfirming ? 'confirming' : ''}`}
          type="button"
          data-remove-photo-id={photo.id}
          aria-label={
            props.isRemoveConfirming
              ? t('photo.deletePhoto', { name: photo.fileName })
              : t('photo.confirmPhotoDelete', { name: photo.fileName })
          }
          onClick={(event) => {
            event.stopPropagation()
            props.onRemoveClick(photo.id)
          }}
        >
          {props.isRemoveConfirming ? t('common.confirmDelete') : '✕'}
        </button>
      </div>
    </li>
  )
})

export function PhotoListPanel({
  photos,
  timing,
  currentPhotoIndex,
  previewPhotoId,
  setPreviewPhotoId,
  send,
  showPhotoAddResult,
  inlineMessage
}: {
  photos: PhotoItem[]
  timing: TimingConfig
  currentPhotoIndex: number | null
  previewPhotoId: string | null
  setPreviewPhotoId: (id: string | null) => void
  send: (command: PlaybackCommand) => void
  showPhotoAddResult: (count: number | undefined) => void
  inlineMessage: string | null
}): React.JSX.Element {
  const t = useT()
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null)
  const [isFileDragActive, setIsFileDragActive] = useState(false)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [isBulkRemoveConfirming, setIsBulkRemoveConfirming] = useState(false)
  const photosRef = useRef(photos)
  const draggedIdRef = useRef<string | null>(null)
  const dropTargetRef = useRef<{ id: string; after: boolean } | null>(null)
  const removeConfirmIdRef = useRef<string | null>(null)
  const selectionAnchorIdRef = useRef<string | null>(null)
  useEffect(() => {
    photosRef.current = photos
    draggedIdRef.current = draggedId
    dropTargetRef.current = dropTarget
    removeConfirmIdRef.current = removeConfirmId
  }, [draggedId, dropTarget, photos, removeConfirmId])
  const existingIds = useMemo(() => new Set(photos.map((photo) => photo.id)), [photos])
  const validSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => existingIds.has(id))),
    [existingIds, selectedIds]
  )
  const playableIndexes = useMemo(() => buildPlayableIndexes(photos), [photos])
  useEffect(() => {
    if (selectionAnchorIdRef.current && !existingIds.has(selectionAnchorIdRef.current))
      selectionAnchorIdRef.current = null
  }, [existingIds])
  useEffect(() => {
    if (removeConfirmId === null) return
    const timer = window.setTimeout(() => setRemoveConfirmId(null), 3000)
    const cancel = (event: PointerEvent): void => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest<HTMLElement>('[data-remove-photo-id]')?.dataset.removePhotoId ===
          removeConfirmId
      )
        return
      setRemoveConfirmId(null)
    }
    document.addEventListener('pointerdown', cancel)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', cancel)
    }
  }, [removeConfirmId])
  useEffect(() => {
    if (!isBulkRemoveConfirming) return
    const timer = window.setTimeout(() => setIsBulkRemoveConfirming(false), 3000)
    const cancel = (event: PointerEvent): void => {
      if (event.target instanceof Element && event.target.closest('[data-bulk-remove]')) return
      setIsBulkRemoveConfirming(false)
    }
    document.addEventListener('pointerdown', cancel)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', cancel)
    }
  }, [isBulkRemoveConfirming])
  const onDragStart = useCallback((event: DragEvent<HTMLLIElement>, id: string) => {
    setDraggedId(id)
    draggedIdRef.current = id
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }, [])
  const onDrop = useCallback(
    (event: DragEvent<HTMLLIElement>, targetId: string) => {
      if (event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      const dragged = draggedIdRef.current
      const target = dropTargetRef.current
      if (!dragged || dragged === targetId || !target) return setDropTarget(null)
      const ids = photosRef.current.map((photo) => photo.id).filter((id) => id !== dragged)
      ids.splice(ids.indexOf(targetId) + (target.after ? 1 : 0), 0, dragged)
      send({ type: 'reorderPhotos', photoIds: ids })
      setDraggedId(null)
      setDropTarget(null)
    },
    [send]
  )
  const onSelectionClick = useCallback((event: MouseEvent<HTMLInputElement>, id: string) => {
    const checked = event.currentTarget.checked
    const anchorId = selectionAnchorIdRef.current
    setSelectedIds((current) => {
      const currentPhotos = photosRef.current
      const next = new Set(
        [...current].filter((item) => currentPhotos.some((photo) => photo.id === item))
      )
      const clickedIndex = currentPhotos.findIndex((photo) => photo.id === id)
      const anchorIndex = anchorId ? currentPhotos.findIndex((photo) => photo.id === anchorId) : -1
      const ids =
        event.shiftKey && anchorIndex >= 0
          ? currentPhotos
              .slice(Math.min(anchorIndex, clickedIndex), Math.max(anchorIndex, clickedIndex) + 1)
              .map((photo) => photo.id)
          : [id]
      ids.forEach((item) => (checked ? next.add(item) : next.delete(item)))
      return next
    })
    selectionAnchorIdRef.current = id
    setIsBulkRemoveConfirming(false)
  }, [])
  const selectedCount = validSelectedIds.size
  const allSelected = photos.length > 0 && selectedCount === photos.length
  const previewIndex = photos.findIndex((photo) => photo.id === previewPhotoId)
  const excludedCount = photos.filter((photo) => photo.excluded).length
  return (
    <section
      className={`panel photo-panel ${isFileDragActive ? 'file-drag-active' : ''}`}
      aria-labelledby="photo-heading"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          setIsFileDragActive(true)
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setIsFileDragActive(true)
        }
      }}
      onDragLeave={(event) => {
        if (
          event.dataTransfer.types.includes('Files') &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        )
          setIsFileDragActive(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        setIsFileDragActive(false)
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => window.api.getFilePath(file))
          .filter(Boolean)
        void window.api.addPhotoPaths(paths).then(showPhotoAddResult)
      }}
    >
      <div className="panel-heading">
        <div className="photo-heading-copy">
          <h2 id="photo-heading">{t('photo.heading')}</h2>
          <span>
            {t('photo.total', { count: photos.length })}
            {excludedCount > 0 ? t('photo.excludedCount', { count: excludedCount }) : ''}
          </span>
          <label className="select-all-control">
            <input
              ref={(input) => {
                if (input) input.indeterminate = selectedCount > 0 && !allSelected
              }}
              type="checkbox"
              checked={allSelected}
              aria-label={t('photo.selectAllAria')}
              onChange={() => {
                setSelectedIds(allSelected ? new Set() : new Set(photos.map((photo) => photo.id)))
                selectionAnchorIdRef.current = null
                setIsBulkRemoveConfirming(false)
              }}
            />
            {t('photo.selectAll')}
          </label>
          {selectedCount > 0 && (
            <span className="selected-count">
              {t('photo.selectedCount', { count: selectedCount })}
            </span>
          )}
          {selectedCount > 0 && (
            <button
              className={`bulk-remove-button ${isBulkRemoveConfirming ? 'confirming' : ''}`}
              type="button"
              data-bulk-remove
              onClick={() => {
                if (!isBulkRemoveConfirming) return setIsBulkRemoveConfirming(true)
                send({ type: 'removePhotos', ids: [...validSelectedIds] })
                setIsBulkRemoveConfirming(false)
                setSelectedIds(new Set())
                selectionAnchorIdRef.current = null
              }}
            >
              {isBulkRemoveConfirming
                ? t('photo.confirmBulkDelete', { count: selectedCount })
                : t('photo.deleteSelection')}
            </button>
          )}
        </div>
        <div className="photo-add-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => void window.api.choosePhotos().then(showPhotoAddResult)}
          >
            {t('photo.add')}
          </button>
          <button
            type="button"
            onClick={() => void window.api.choosePhotosFolder().then(showPhotoAddResult)}
          >
            {t('photo.addFolder')}
          </button>
        </div>
      </div>
      {inlineMessage && (
        <div className="photo-add-message" role="status">
          {inlineMessage}
        </div>
      )}
      {photos.length === 0 ? (
        <div className="empty-state">
          <strong>{t('photo.empty')}</strong>
          <span>{t('photo.emptyHint')}</span>
        </div>
      ) : (
        <ol
          className="photo-list"
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDropTarget(null)
          }}
        >
          {photos.map((photo, listIndex) => (
            <PhotoRow
              key={photo.id}
              photo={photo}
              listIndex={listIndex}
              playableIndex={playableIndexes[listIndex]}
              isCurrent={
                !photo.excluded &&
                currentPhotoIndex !== null &&
                playableIndexes[listIndex] === currentPhotoIndex
              }
              isDragTarget={dropTarget?.id === photo.id}
              dropAfter={dropTarget?.id === photo.id && dropTarget.after}
              isDragging={draggedId === photo.id}
              isSelected={validSelectedIds.has(photo.id)}
              isRemoveConfirming={removeConfirmId === photo.id}
              defaultTiming={timing}
              send={send}
              onDragStart={onDragStart}
              onDragEnd={() => {
                setDraggedId(null)
                setDropTarget(null)
              }}
              onDragOver={(event, id) => {
                if (event.dataTransfer.types.includes('Files')) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                const bounds = event.currentTarget.getBoundingClientRect()
                setDropTarget({ id, after: event.clientY > bounds.top + bounds.height / 2 })
              }}
              onDrop={onDrop}
              onSelectionClick={onSelectionClick}
              onPreview={setPreviewPhotoId}
              onRemoveClick={(id) => {
                if (removeConfirmIdRef.current === id) {
                  removeConfirmIdRef.current = null
                  setRemoveConfirmId(null)
                  send({ type: 'removePhoto', id })
                } else {
                  removeConfirmIdRef.current = id
                  setRemoveConfirmId(id)
                }
              }}
            />
          ))}
        </ol>
      )}
      {previewIndex >= 0 && (
        <MaterialPreview
          key={photos[previewIndex].id}
          photo={photos[previewIndex]}
          listIndex={previewIndex}
          playableIndex={playableIndexes[previewIndex]}
          send={send}
          onClose={() => setPreviewPhotoId(null)}
        />
      )}
    </section>
  )
}
