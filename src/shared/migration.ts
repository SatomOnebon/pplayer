import {
  DEFAULT_MASK,
  DEFAULT_FTB_DURATION_MS,
  DEFAULT_TIMING,
  DEFAULT_LOCAL_BGM,
  type AppState,
  type CueBgm,
  type FitMode,
  type MaskConfig,
  type LocalBgmState,
  type PhotoItem,
  type ProjectPhoto,
  type ProjectState,
  type ProjectStateV1,
  type SlideshowMaterial,
  type TimingConfig
} from './types'
import { normalizeSpotifyContextUri } from './spotifyUri'
import { clampVideoFadeMs } from './videoFade'

export function normalizeCueBgm(value: unknown): CueBgm | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const bgm = value as Record<string, unknown>
  if (bgm.mode === 'continue') return { mode: 'continue' }
  if (
    bgm.mode === 'play' &&
    typeof bgm.uri === 'string' &&
    typeof bgm.fadeMs === 'number' &&
    Number.isFinite(bgm.fadeMs)
  ) {
    const uri = normalizeSpotifyContextUri(bgm.uri)
    if (!uri) return undefined
    return { mode: 'play', uri, fadeMs: Math.min(10_000, Math.max(0, bgm.fadeMs)) }
  }
  if (bgm.mode === 'stop' && typeof bgm.fadeMs === 'number' && Number.isFinite(bgm.fadeMs)) {
    return { mode: 'stop', fadeMs: Math.min(10_000, Math.max(0, bgm.fadeMs)) }
  }
  return undefined
}

export function normalizeLocalBgm(value: unknown): LocalBgmState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return structuredClone(DEFAULT_LOCAL_BGM)
  }
  const raw = value as Record<string, unknown>
  const playlists = Array.isArray(raw.playlists)
    ? raw.playlists.flatMap((playlist) => {
        if (
          typeof playlist !== 'object' ||
          playlist === null ||
          Array.isArray(playlist) ||
          typeof (playlist as Record<string, unknown>).id !== 'string' ||
          typeof (playlist as Record<string, unknown>).name !== 'string' ||
          !Array.isArray((playlist as Record<string, unknown>).tracks)
        )
          return []
        const item = playlist as Record<string, unknown>
        const tracks = (item.tracks as unknown[]).flatMap((track) => {
          if (
            typeof track !== 'object' ||
            track === null ||
            Array.isArray(track) ||
            typeof (track as Record<string, unknown>).id !== 'string' ||
            typeof (track as Record<string, unknown>).name !== 'string' ||
            typeof (track as Record<string, unknown>).filePath !== 'string'
          )
            return []
          const value = track as Record<string, unknown>
          return [
            {
              id: value.id as string,
              name: value.name as string,
              filePath: value.filePath as string
            }
          ]
        })
        return [{ id: item.id as string, name: item.name as string, tracks }]
      })
    : []
  return {
    playlists,
    outputDeviceId:
      raw.outputDeviceId === null || typeof raw.outputDeviceId === 'string'
        ? raw.outputDeviceId
        : null,
    crossfadeMode: raw.crossfadeMode === 'gap' ? 'gap' : 'crossfade',
    fadeMs:
      typeof raw.fadeMs === 'number' && Number.isFinite(raw.fadeMs)
        ? Math.min(10_000, Math.max(0, raw.fadeMs))
        : DEFAULT_LOCAL_BGM.fadeMs
  }
}

type LegacyVideoMaterial = AppState['materials']['videos'][number] & {
  fadeInMs?: number
  fadeOutMs?: number
}

type LegacyCue = AppState['cues'][number] & {
  fadeInMs?: number
  fadeOutMs?: number
}

export interface LegacyBlackStillMaterial {
  id: string
  name: string
  kind: 'black'
  fit: FitMode
}

type LegacyBlackState = {
  materials: Omit<AppState['materials'], 'stills'> & {
    stills: Array<AppState['materials']['stills'][number] | LegacyBlackStillMaterial>
  }
  cues: AppState['cues']
  standbyStillId: string | null
}

export function migrateBlackStillMaterials<T extends LegacyBlackState>(
  saved: T
): Omit<T, 'materials' | 'cues'> & {
  materials: AppState['materials']
  cues: AppState['cues']
} {
  const blackIds = new Set(
    saved.materials.stills
      .filter((material): material is LegacyBlackStillMaterial => material.kind === 'black')
      .map((material) => material.id)
  )
  const cues = saved.cues.map((cue) =>
    cue.materialType === 'still' && blackIds.has(cue.materialId)
      ? {
          id: cue.id,
          label: cue.label,
          materialType: 'black' as const,
          endBehavior: 'hold' as const,
          fadeInMs: clampVideoFadeMs(cue.fadeInMs),
          fadeOutMs: clampVideoFadeMs(cue.fadeOutMs)
        }
      : cue
  )
  return {
    ...saved,
    materials: {
      ...saved.materials,
      stills: saved.materials.stills.filter(
        (material): material is AppState['materials']['stills'][number] => material.kind === 'image'
      )
    },
    cues,
    standbyStillId:
      saved.standbyStillId !== null && blackIds.has(saved.standbyStillId)
        ? null
        : saved.standbyStillId
  }
}

export function migrateVideoFades<
  T extends { materials: AppState['materials']; cues: AppState['cues'] }
>(saved: T): T {
  const legacyVideos = saved.materials.videos as LegacyVideoMaterial[]
  const fadesByMaterialId = new Map(
    legacyVideos.map((material) => [
      material.id,
      {
        fadeInMs: clampVideoFadeMs(material.fadeInMs ?? 0),
        fadeOutMs: clampVideoFadeMs(material.fadeOutMs ?? 0)
      }
    ])
  )
  const videos = legacyVideos.map((material) => ({
    id: material.id,
    name: material.name,
    filePath: material.filePath,
    volume: material.volume,
    fit: material.fit
  }))
  const cues = (saved.cues as LegacyCue[]).map((cue) => {
    if (cue.materialType === 'still' || cue.materialType === 'black') {
      return {
        ...cue,
        fadeInMs: clampVideoFadeMs(cue.fadeInMs ?? 0),
        fadeOutMs: clampVideoFadeMs(cue.fadeOutMs ?? 0)
      }
    }
    if (cue.materialType !== 'video') return cue
    const fallback = fadesByMaterialId.get(cue.materialId)
    return {
      ...cue,
      fadeInMs: clampVideoFadeMs(cue.fadeInMs ?? fallback?.fadeInMs ?? 0),
      fadeOutMs: clampVideoFadeMs(cue.fadeOutMs ?? fallback?.fadeOutMs ?? 0)
    }
  })
  return { ...saved, materials: { ...saved.materials, videos }, cues } as T
}

export interface V1SavedState {
  photos?: Array<PhotoItem | ProjectPhoto>
  timing?: Partial<TimingConfig>
  mask?: Partial<MaskConfig>
  fit?: FitMode
  loop?: boolean
  status?: AppState['status']
  baseIndex?: number
}

export type IdFactory = () => string

const defaultIdFactory: IdFactory = () => crypto.randomUUID()

function restorePhotos(photos: V1SavedState['photos'] = [], idFactory: IdFactory): PhotoItem[] {
  return photos.map((photo) => ({
    id: 'id' in photo && typeof photo.id === 'string' ? photo.id : idFactory(),
    filePath: photo.filePath,
    fileName:
      'fileName' in photo && typeof photo.fileName === 'string'
        ? photo.fileName
        : photo.filePath.split(/[\\/]/).pop() || photo.filePath,
    excluded: photo.excluded,
    fit: photo.fit ?? null,
    fadeInMs: photo.fadeInMs ?? null,
    holdMs: photo.holdMs ?? null,
    fadeOutMs: photo.fadeOutMs ?? null
  }))
}

export function migrateV1State(
  saved: V1SavedState,
  idFactory: IdFactory = defaultIdFactory
): AppState {
  const slideshowId = idFactory()
  const photos = restorePhotos(saved.photos, idFactory)
  const playableCount = photos.filter((photo) => !photo.excluded).length
  return {
    outputLocked: false,
    materials: {
      slideshows: [
        {
          id: slideshowId,
          name: 'スライドショー1',
          photos,
          timing: { ...DEFAULT_TIMING, ...saved.timing },
          fit: saved.fit ?? 'contain'
        }
      ],
      videos: [],
      stills: []
    },
    localBgm: structuredClone(DEFAULT_LOCAL_BGM),
    cues: [
      {
        id: idFactory(),
        label: 'スライドショー1',
        materialType: 'slideshow',
        materialId: slideshowId,
        endBehavior: 'loop'
      }
    ],
    standbyStillId: null,
    audioOutputDeviceId: null,
    masterVolume: 1,
    audioFallbackActive: false,
    ftbDurationMs: DEFAULT_FTB_DURATION_MS,
    ftb: null,
    ftbHeld: false,
    pendingTransition: null,
    editingSlideshowId: slideshowId,
    activeCueId: null,
    armedCueIndex: 0,
    mask: { ...DEFAULT_MASK, ...saved.mask, invert: saved.mask?.invert === true },
    stageAspect: 'free',
    status: 'idle',
    baseIndex:
      playableCount === 0
        ? 0
        : Math.min(Math.max(0, Math.trunc(saved.baseIndex ?? 0)), playableCount - 1),
    baseTimestamp: null,
    pausedElapsedMs: 0
  }
}

export function migrateV1Project(
  saved: ProjectStateV1,
  idFactory: IdFactory = defaultIdFactory
): ProjectState {
  const migrated = migrateV1State(saved, idFactory)
  return {
    materials: migrated.materials,
    localBgm: migrated.localBgm,
    cues: migrated.cues,
    standbyStillId: migrated.standbyStillId,
    audioOutputDeviceId: migrated.audioOutputDeviceId,
    masterVolume: migrated.masterVolume,
    ftbDurationMs: migrated.ftbDurationMs,
    mask: migrated.mask,
    stageAspect: migrated.stageAspect,
    editingSlideshowId: migrated.editingSlideshowId
  }
}

export function getEditingSlideshow(state: AppState): SlideshowMaterial | null {
  return (
    state.materials.slideshows.find((material) => material.id === state.editingSlideshowId) ?? null
  )
}

export type EditingAppState = AppState &
  Pick<import('./types').SlideshowMaterial, 'photos' | 'timing' | 'fit'>

export function selectEditingAppState(state: AppState): EditingAppState | null {
  const material = getEditingSlideshow(state)
  return material ? { ...state, ...material } : null
}
