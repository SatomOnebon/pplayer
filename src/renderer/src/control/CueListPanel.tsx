import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { toThumbUrl } from '../../../shared/mediaUrl'
import { normalizeSpotifyContextUri } from '../../../shared/spotifyUri'
import type {
  Cue,
  CueBgm,
  LocalBgmPlaylist,
  Materials,
  PlaybackCommand,
  SpotifyPlaylist,
  SpotifySettingsState
} from '../../../shared/types'
import { Thumb } from './Thumb'
import { useT, type Translate } from '../i18n/LocaleProvider'

const TYPE_LABEL_KEYS = {
  slideshow: 'material.slideshowShort',
  video: 'material.video',
  still: 'material.still',
  black: 'material.black'
} as const
const BEHAVIOR_LABEL_KEYS = {
  loop: 'cue.behavior.loop',
  advance: 'cue.behavior.advance',
  toStandby: 'cue.behavior.toStandby',
  hold: 'cue.behavior.hold',
  toBlack: 'cue.behavior.toBlack'
} as const

function materialOptions(
  materials: Materials,
  blackName: string
): Array<{
  type: Cue['materialType']
  id: string
  name: string
}> {
  return [
    { type: 'black' as const, id: '', name: blackName },
    ...materials.slideshows.map((item) => ({ type: 'slideshow' as const, ...item })),
    ...materials.videos.map((item) => ({ type: 'video' as const, ...item })),
    ...materials.stills.map((item) => ({ type: 'still' as const, ...item }))
  ]
}

function cueThumbnailSource(cue: Cue, materials: Materials): string | null {
  if (cue.materialType === 'black') return null
  if (cue.materialType === 'slideshow') {
    const material = materials.slideshows.find((item) => item.id === cue.materialId)
    const photo = material?.photos.find((item) => !item.excluded)
    return photo ? toThumbUrl(photo.filePath, 128, photo.reloadToken) : null
  }
  const collection = cue.materialType === 'video' ? materials.videos : materials.stills
  const material = collection.find((item) => item.id === cue.materialId)
  return material ? toThumbUrl(material.filePath, 128, material.reloadToken) : null
}

function cueBgmSummary(cue: Cue, localPlaylists: LocalBgmPlaylist[], t: Translate): string {
  const bgm = cue.bgm
  if (!bgm || bgm.mode === 'continue') return t('cue.bgm.continue')
  if (bgm.mode === 'stop') return t('cue.bgm.stopSummary')
  if (bgm.source === 'spotify') return t('cue.bgm.spotifySummary')
  const playlist = localPlaylists.find((item) => item.id === bgm.playlistId)
  return t('cue.bgm.localSummary', { name: playlist?.name ?? t('bgm.local') })
}

function CueBgmControl({
  cue,
  spotifyPlaylists,
  localPlaylists,
  setCueBgm
}: {
  cue: Cue
  spotifyPlaylists: SpotifyPlaylist[]
  localPlaylists: LocalBgmPlaylist[]
  setCueBgm: (cueId: string, bgm: CueBgm) => void
}): React.JSX.Element {
  const t = useT()
  const bgm = cue.bgm
  const [selectedMode, setSelectedMode] = useState<CueBgm['mode'] | null>(null)
  const initialSource = bgm?.mode === 'play' ? bgm.source : 'local'
  const [source, setSource] = useState<'local' | 'spotify'>(initialSource)
  const [uriDraft, setUriDraft] = useState(
    bgm?.mode === 'play' && bgm.source === 'spotify' ? bgm.uri : ''
  )
  const [fadeMs, setFadeMs] = useState(bgm && bgm.mode !== 'continue' ? bgm.fadeMs : 2_000)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const mode = selectedMode ?? bgm?.mode ?? 'continue'
  const normalizedDraft = normalizeSpotifyContextUri(uriDraft)

  const commitPlay = (value: string, nextFadeMs = fadeMs): void => {
    const uri = normalizeSpotifyContextUri(value)
    if (!uri) {
      setErrorKey('cue.bgm.invalidUri')
      return
    }
    setErrorKey(null)
    setUriDraft(uri)
    setCueBgm(cue.id, { mode: 'play', source: 'spotify', uri, fadeMs: nextFadeMs })
  }

  return (
    <div className="cue-bgm" onClick={(event) => event.stopPropagation()}>
      <label>
        <span>BGM</span>
        <select
          value={mode}
          onChange={(event) => {
            const nextMode = event.target.value as CueBgm['mode']
            setSelectedMode(nextMode)
            setErrorKey(null)
            if (nextMode === 'continue') setCueBgm(cue.id, { mode: 'continue' })
            else if (nextMode === 'stop') setCueBgm(cue.id, { mode: 'stop', fadeMs })
            else if (source === 'local') {
              const playlist = localPlaylists[0]
              if (playlist) {
                setCueBgm(cue.id, {
                  mode: 'play',
                  source: 'local',
                  playlistId: playlist.id,
                  fadeMs
                })
              } else {
                setErrorKey('cue.bgm.noLocalPlaylist')
              }
            }
          }}
        >
          <option value="continue">{t('cue.bgm.continue')}</option>
          <option value="play">{t('common.play')}</option>
          <option value="stop">{t('common.stop')}</option>
        </select>
      </label>
      {mode === 'play' && (
        <>
          <label>
            <span>{t('bgm.source')}</span>
            <select
              value={source}
              onChange={(event) => {
                const nextSource = event.target.value as 'local' | 'spotify'
                setSource(nextSource)
                setErrorKey(null)
                if (nextSource === 'local') {
                  const playlistId =
                    bgm?.mode === 'play' && bgm.source === 'local'
                      ? bgm.playlistId
                      : localPlaylists[0]?.id
                  if (playlistId)
                    setCueBgm(cue.id, {
                      mode: 'play',
                      source: 'local',
                      playlistId,
                      fadeMs
                    })
                } else if (normalizedDraft) commitPlay(normalizedDraft)
              }}
            >
              <option value="local">{t('bgm.local')}</option>
              <option value="spotify">Spotify</option>
            </select>
          </label>
          {source === 'local' && (
            <label>
              <span>{t('bgm.playlist')}</span>
              <select
                value={bgm?.mode === 'play' && bgm.source === 'local' ? bgm.playlistId : ''}
                onChange={(event) => {
                  if (event.target.value)
                    setCueBgm(cue.id, {
                      mode: 'play',
                      source: 'local',
                      playlistId: event.target.value,
                      fadeMs
                    })
                }}
              >
                <option value="">{t('common.select')}</option>
                {localPlaylists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {source === 'spotify' && (
            <>
              {spotifyPlaylists.length > 0 && (
                <label>
                  <span>{t('bgm.playlist')}</span>
                  <select
                    value={
                      normalizedDraft &&
                      spotifyPlaylists.some((playlist) => playlist.uri === normalizedDraft)
                        ? normalizedDraft
                        : ''
                    }
                    onChange={(event) => event.target.value && commitPlay(event.target.value)}
                  >
                    <option value="">{t('common.select')}</option>
                    {spotifyPlaylists.map((playlist) => (
                      <option key={playlist.uri} value={playlist.uri}>
                        {playlist.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="cue-bgm-uri">
                <span>URL/URI</span>
                <input
                  type="text"
                  value={uriDraft}
                  onChange={(event) => {
                    setUriDraft(event.target.value)
                    setErrorKey(null)
                  }}
                />
              </label>
              <button type="button" onClick={() => commitPlay(uriDraft)}>
                {t('common.set')}
              </button>
            </>
          )}
        </>
      )}
      {mode !== 'continue' && (
        <label>
          <span>{t('cue.bgm.fadeSeconds')}</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={fadeMs / 1_000}
            onChange={(event) => {
              const nextFadeMs = Math.round(Number(event.target.value) * 1_000)
              setFadeMs(nextFadeMs)
              if (mode === 'stop') setCueBgm(cue.id, { mode: 'stop', fadeMs: nextFadeMs })
              else if (source === 'spotify' && normalizedDraft)
                commitPlay(normalizedDraft, nextFadeMs)
              else if (bgm?.mode === 'play' && bgm.source === 'local')
                setCueBgm(cue.id, { ...bgm, fadeMs: nextFadeMs })
            }}
          />
        </label>
      )}
      {errorKey && <small className="remote-error">{t(errorKey)}</small>}
    </div>
  )
}

export function CueListPanel({
  cues,
  materials,
  localPlaylists,
  activeCueId,
  armedCueIndex,
  outputLocked,
  send
}: {
  cues: Cue[]
  materials: Materials
  localPlaylists: LocalBgmPlaylist[]
  activeCueId: string | null
  armedCueIndex: number
  outputLocked: boolean
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const t = useT()
  const options = useMemo(
    () => materialOptions(materials, t('material.blackScreen')),
    [materials, t]
  )
  const [selectedMaterial, setSelectedMaterial] = useState('black:')
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [expandedCues, setExpandedCues] = useState<Set<string>>(new Set())
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [spotifySettings, setSpotifySettings] = useState<SpotifySettingsState | null>(null)
  const draggedId = useRef<string | null>(null)
  const armedCue = cues[armedCueIndex]

  useEffect(() => {
    const unsubscribe = window.api.onSpotifySettingsChanged(setSpotifySettings)
    void window.api.getSpotifySettings().then(setSpotifySettings)
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!spotifySettings?.connected) {
      setPlaylists([])
      return
    }
    void window.api
      .getSpotifyPlaylists()
      .then(setPlaylists)
      .catch(() => setPlaylists([]))
  }, [spotifySettings?.connected])

  useEffect(() => {
    const cueIds = new Set(cues.map((cue) => cue.id))
    setExpandedCues((current) => {
      if ([...current].every((id) => cueIds.has(id))) return current
      return new Set([...current].filter((id) => cueIds.has(id)))
    })
  }, [cues])

  const setCueBgm = (cueId: string, bgm: CueBgm): void => {
    send({ type: 'setCueBgm', cueId, bgm })
  }

  const toggleExpand = (id: string): void => {
    setExpandedCues((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addCue = (): void => {
    const material = options.find((item) => `${item.type}:${item.id}` === selectedMaterial)
    if (!material) return
    send(
      material.type === 'black'
        ? {
            type: 'addCue',
            label: material.name,
            materialType: 'black',
            endBehavior: 'hold'
          }
        : {
            type: 'addCue',
            label: material.name,
            materialType: material.type,
            materialId: material.id,
            endBehavior:
              material.type === 'slideshow'
                ? 'loop'
                : material.type === 'video'
                  ? 'advance'
                  : 'hold'
          }
    )
  }
  const dropCue = (event: DragEvent<HTMLLIElement>, targetId: string): void => {
    event.preventDefault()
    const sourceId = draggedId.current
    if (!sourceId || sourceId === targetId) return
    const ordered = cues.map((cue) => cue.id)
    const sourceIndex = ordered.indexOf(sourceId)
    const targetIndex = ordered.indexOf(targetId)
    ordered.splice(sourceIndex, 1)
    ordered.splice(targetIndex, 0, sourceId)
    send({ type: 'reorderCues', cueIds: ordered })
    draggedId.current = null
  }

  return (
    <section className="panel cue-panel" aria-labelledby="cue-heading">
      <div className="cue-primary-actions">
        <button
          className="cue-go-button"
          type="button"
          disabled={outputLocked || !armedCue}
          onClick={() => send({ type: 'go' })}
        >
          <strong>GO</strong>
          <span>
            {armedCue
              ? t('cue.armed', { index: armedCueIndex + 1, name: armedCue.label })
              : t('cue.none')}
          </span>
        </button>
        <button
          type="button"
          disabled={outputLocked}
          onClick={() => send({ type: 'stopToStandby' })}
        >
          {t('cue.stopToStandby')}
        </button>
      </div>
      <div className="panel-heading compact">
        <div>
          <h2 id="cue-heading">{t('cue.heading')}</h2>
          <span>{t('cue.instructions')}</span>
        </div>
      </div>
      <ol className="cue-rows">
        {cues.map((cue, index) => {
          const isActive = cue.id === activeCueId
          const isArmed = index === armedCueIndex
          const isExpanded = expandedCues.has(cue.id)
          return (
            <li
              key={cue.id}
              className={`cue-row${isExpanded ? ' has-details' : ''}${isActive ? ' is-active' : ''}${isArmed ? ' is-armed' : ''}`}
              draggable
              title={t('cue.rowHint')}
              onClick={() => send({ type: 'armCue', id: cue.id })}
              onDoubleClick={() => {
                if (!outputLocked) send({ type: 'fireCue', id: cue.id })
              }}
              onDragStart={() => {
                draggedId.current = cue.id
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropCue(event, cue.id)}
            >
              <span className="cue-drag" aria-hidden="true">
                ⠿
              </span>
              <span className="cue-number">{index + 1}</span>
              <div className="cue-thumb">
                <Thumb
                  src={cueThumbnailSource(cue, materials)}
                  fallbackLabel={cue.materialType === 'video' ? t('material.video') : undefined}
                />
              </div>
              <div className="cue-copy">
                <strong>{cue.label}</strong>
                <div className="cue-markers">
                  <span className={`material-badge type-${cue.materialType}`}>
                    {t(TYPE_LABEL_KEYS[cue.materialType])}
                  </span>
                  {isActive && <span className="running-marker">{t('status.playing')}</span>}
                  {isArmed && <span className="armed-marker">{t('cue.nextMarker')}</span>}
                  {!isExpanded && (
                    <span className="cue-bgm-summary">{cueBgmSummary(cue, localPlaylists, t)}</span>
                  )}
                </div>
              </div>
              {cue.materialType === 'still' || cue.materialType === 'black' ? (
                <span className="fixed-behavior">{t('cue.fixedDisplay')}</span>
              ) : (
                <select
                  value={cue.endBehavior}
                  aria-label={t('cue.endBehaviorAria', { name: cue.label })}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    send({
                      type: 'setCueEndBehavior',
                      cueId: cue.id,
                      endBehavior: event.target.value as Cue['endBehavior']
                    })
                  }
                >
                  {(cue.materialType === 'slideshow'
                    ? (['loop', 'advance', 'toStandby', 'hold', 'toBlack'] as const)
                    : (['advance', 'toStandby', 'hold', 'toBlack'] as const)
                  ).map((behavior) => (
                    <option key={behavior} value={behavior}>
                      {t(BEHAVIOR_LABEL_KEYS[behavior])}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="icon-button cue-expand"
                type="button"
                aria-expanded={isExpanded}
                aria-label={t(isExpanded ? 'cue.closeEditAria' : 'cue.openEditAria', {
                  name: cue.label
                })}
                title={t(isExpanded ? 'cue.closeEdit' : 'cue.openEdit')}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleExpand(cue.id)
                }}
              >
                {isExpanded ? '⌃' : '⌄'}
              </button>
              <button
                className={`cue-remove ${removeConfirmId === cue.id ? 'danger confirming' : 'icon-button'}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (removeConfirmId === cue.id) {
                    send({ type: 'removeCue', cueId: cue.id })
                    setRemoveConfirmId(null)
                  } else {
                    setRemoveConfirmId(cue.id)
                  }
                }}
              >
                {removeConfirmId === cue.id ? t('common.confirmDelete') : '✕'}
              </button>
              {isExpanded && (
                <>
                  <div className="cue-rename" onClick={(event) => event.stopPropagation()}>
                    <label>
                      <span>{t('cue.name')}</span>
                      <input
                        type="text"
                        defaultValue={cue.label}
                        key={cue.label}
                        aria-label={t('cue.nameAria', { name: cue.label })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                        }}
                        onBlur={(event) => {
                          const label = event.currentTarget.value.trim()
                          if (!label || label === cue.label) {
                            event.currentTarget.value = cue.label
                            return
                          }
                          send({ type: 'renameCue', cueId: cue.id, label })
                        }}
                      />
                    </label>
                  </div>
                  {(cue.materialType === 'video' ||
                    cue.materialType === 'still' ||
                    cue.materialType === 'black') && (
                    <div className="cue-video-fades" onClick={(event) => event.stopPropagation()}>
                      {(
                        [
                          ['fadeInMs', 'cue.fadeInSeconds'],
                          ['fadeOutMs', 'cue.fadeOutSeconds']
                        ] as const
                      ).map(([field, labelKey]) => {
                        const disabled =
                          cue.materialType === 'video' &&
                          field === 'fadeOutMs' &&
                          cue.endBehavior === 'hold'
                        return (
                          <label key={field}>
                            <span>{t(labelKey)}</span>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="0.1"
                              value={cue[field] / 1_000}
                              disabled={disabled}
                              onChange={(event) =>
                                send({
                                  type: 'setCueFades',
                                  cueId: cue.id,
                                  fadeInMs:
                                    field === 'fadeInMs'
                                      ? Math.round(Number(event.currentTarget.value) * 1_000)
                                      : cue.fadeInMs,
                                  fadeOutMs:
                                    field === 'fadeOutMs'
                                      ? Math.round(Number(event.currentTarget.value) * 1_000)
                                      : cue.fadeOutMs
                                })
                              }
                            />
                          </label>
                        )
                      })}
                      {cue.materialType === 'video' && cue.endBehavior === 'hold' && (
                        <small>{t('cue.fadeOutDisabledOnHold')}</small>
                      )}
                    </div>
                  )}
                  <CueBgmControl
                    cue={cue}
                    spotifyPlaylists={playlists}
                    localPlaylists={localPlaylists}
                    setCueBgm={setCueBgm}
                  />
                </>
              )}
            </li>
          )
        })}
      </ol>
      <div className="cue-add">
        <label>
          <span>{t('cue.materialToAdd')}</span>
          <select
            value={selectedMaterial}
            onChange={(event) => setSelectedMaterial(event.target.value)}
          >
            <option value="black:">{t('material.blackScreen')}</option>
            {(['slideshow', 'video', 'still'] as const).map((type) => (
              <optgroup key={type} label={t(`material.${type}`)}>
                {options
                  .filter((item) => item.type === type)
                  .map((item) => (
                    <option key={item.id} value={`${item.type}:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" disabled={!selectedMaterial} onClick={addCue}>
          {t('cue.add')}
        </button>
      </div>
    </section>
  )
}
