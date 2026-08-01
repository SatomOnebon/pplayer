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

const TYPE_LABEL = { slideshow: 'SS', video: '動画', still: '静止画', black: '黒' } as const
const BEHAVIOR_LABEL = {
  loop: 'ループ（手動で次へ）',
  advance: '終了後に次のキューへ',
  toStandby: '終了後に蓋絵へ',
  hold: '最後の絵で静止',
  toBlack: '終了後にブラックアウト'
} as const

function materialOptions(materials: Materials): Array<{
  type: Cue['materialType']
  id: string
  name: string
}> {
  return [
    { type: 'black' as const, id: '', name: '黒画面' },
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

function cueBgmSummary(cue: Cue, localPlaylists: LocalBgmPlaylist[]): string {
  const bgm = cue.bgm
  if (!bgm || bgm.mode === 'continue') return '継続'
  if (bgm.mode === 'stop') return 'BGM 停止'
  if (bgm.source === 'spotify') return '♪ Spotify'
  const playlist = localPlaylists.find((item) => item.id === bgm.playlistId)
  return `♪ ${playlist?.name ?? 'ローカル'}`
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
  const bgm = cue.bgm
  const [selectedMode, setSelectedMode] = useState<CueBgm['mode'] | null>(null)
  const initialSource = bgm?.mode === 'play' ? bgm.source : 'local'
  const [source, setSource] = useState<'local' | 'spotify'>(initialSource)
  const [uriDraft, setUriDraft] = useState(
    bgm?.mode === 'play' && bgm.source === 'spotify' ? bgm.uri : ''
  )
  const [fadeMs, setFadeMs] = useState(bgm && bgm.mode !== 'continue' ? bgm.fadeMs : 2_000)
  const [error, setError] = useState<string | null>(null)
  const mode = selectedMode ?? bgm?.mode ?? 'continue'
  const normalizedDraft = normalizeSpotifyContextUri(uriDraft)

  const commitPlay = (value: string, nextFadeMs = fadeMs): void => {
    const uri = normalizeSpotifyContextUri(value)
    if (!uri) {
      setError('URL/URIが不正です')
      return
    }
    setError(null)
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
            setError(null)
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
                setError('ローカルプレイリストがありません')
              }
            }
          }}
        >
          <option value="continue">継続</option>
          <option value="play">再生</option>
          <option value="stop">停止</option>
        </select>
      </label>
      {mode === 'play' && (
        <>
          <label>
            <span>ソース</span>
            <select
              value={source}
              onChange={(event) => {
                const nextSource = event.target.value as 'local' | 'spotify'
                setSource(nextSource)
                setError(null)
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
              <option value="local">ローカル</option>
              <option value="spotify">Spotify</option>
            </select>
          </label>
          {source === 'local' && (
            <label>
              <span>プレイリスト</span>
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
                <option value="">選択</option>
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
                  <span>プレイリスト</span>
                  <select
                    value={
                      normalizedDraft &&
                      spotifyPlaylists.some((playlist) => playlist.uri === normalizedDraft)
                        ? normalizedDraft
                        : ''
                    }
                    onChange={(event) => event.target.value && commitPlay(event.target.value)}
                  >
                    <option value="">選択</option>
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
                    setError(null)
                  }}
                />
              </label>
              <button type="button" onClick={() => commitPlay(uriDraft)}>
                セット
              </button>
            </>
          )}
        </>
      )}
      {mode !== 'continue' && (
        <label>
          <span>フェード (秒)</span>
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
      {error && <small className="remote-error">{error}</small>}
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
  const options = useMemo(() => materialOptions(materials), [materials])
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
            {armedCue ? `▸ ${armedCueIndex + 1}. ${armedCue.label}` : 'キューがありません'}
          </span>
        </button>
        <button
          type="button"
          disabled={outputLocked}
          onClick={() => send({ type: 'stopToStandby' })}
        >
          ■ 停止（蓋絵へ）
        </button>
      </div>
      <div className="panel-heading compact">
        <div>
          <h2 id="cue-heading">キューリスト</h2>
          <span>クリック: 次に設定 / ダブルクリック: 即時発火</span>
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
              title="シングルクリック: 次に GO するキュー / ダブルクリック: すぐ発火"
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
                  fallbackLabel={cue.materialType === 'video' ? '動画' : undefined}
                />
              </div>
              <div className="cue-copy">
                <strong>{cue.label}</strong>
                <div className="cue-markers">
                  <span className={`material-badge type-${cue.materialType}`}>
                    {TYPE_LABEL[cue.materialType]}
                  </span>
                  {isActive && <span className="running-marker">再生中</span>}
                  {isArmed && <span className="armed-marker">次</span>}
                  {!isExpanded && (
                    <span className="cue-bgm-summary">{cueBgmSummary(cue, localPlaylists)}</span>
                  )}
                </div>
              </div>
              {cue.materialType === 'still' || cue.materialType === 'black' ? (
                <span className="fixed-behavior">固定表示</span>
              ) : (
                <select
                  value={cue.endBehavior}
                  aria-label={`${cue.label}の終了動作`}
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
                      {BEHAVIOR_LABEL[behavior]}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="icon-button cue-expand"
                type="button"
                aria-expanded={isExpanded}
                aria-label={`${cue.label}の編集項目を${isExpanded ? '閉じる' : '開く'}`}
                title={isExpanded ? '編集を閉じる' : '編集を開く'}
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
                {removeConfirmId === cue.id ? '削除?' : '✕'}
              </button>
              {isExpanded && (
                <>
                  <div className="cue-rename" onClick={(event) => event.stopPropagation()}>
                    <label>
                      <span>キュー名</span>
                      <input
                        type="text"
                        defaultValue={cue.label}
                        key={cue.label}
                        aria-label={`${cue.label}の名前`}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                        }}
                        onBlur={(event) => {
                          const label = event.currentTarget.value.trim()
                          if (label && label !== cue.label)
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
                          ['fadeInMs', 'イン (秒)'],
                          ['fadeOutMs', 'アウト (秒)']
                        ] as const
                      ).map(([field, label]) => {
                        const disabled =
                          cue.materialType === 'video' &&
                          field === 'fadeOutMs' &&
                          cue.endBehavior === 'hold'
                        return (
                          <label key={field}>
                            <span>{label}</span>
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
                        <small>保持時はアウト無効</small>
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
          <span>追加する素材</span>
          <select
            value={selectedMaterial}
            onChange={(event) => setSelectedMaterial(event.target.value)}
          >
            <option value="black:">黒画面</option>
            {(['slideshow', 'video', 'still'] as const).map((type) => (
              <optgroup
                key={type}
                label={
                  type === 'slideshow' ? 'スライドショー' : type === 'video' ? '動画' : '静止画'
                }
              >
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
          ＋ キュー追加
        </button>
      </div>
    </section>
  )
}
