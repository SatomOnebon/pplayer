import { dialog, ipcMain } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
import { basename } from 'path'
import {
  IPC,
  type Cue,
  type FitMode,
  type LocalBgmState,
  type MaskConfig,
  type Materials,
  type PhotoItem,
  type ProjectFile,
  type ProjectLoadResult,
  type ProjectPhoto,
  type ProjectSaveResult,
  type ProjectState,
  type ProjectStateV1,
  type StageAspect,
  type TimingConfig
} from '../shared/types'
import { isFadeEasing } from '../shared/easing'
import {
  migrateBlackStillMaterials,
  migrateV1Project,
  migrateVideoFades,
  normalizeCueBgm,
  normalizeLocalBgm,
  type LegacyBlackStillMaterial
} from '../shared/migration'
import { normalizeFtbDurationMs } from '../shared/masterFtb'
import type { AppStateStore } from './state'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFitMode(value: unknown): value is FitMode {
  return value === 'contain' || value === 'cover'
}

function parseStageAspect(value: unknown): StageAspect | null {
  if (value === undefined) return 'free'
  return value === 'free' || value === '16:9' ? value : null
}

function parseMasterVolume(value: unknown): number | null {
  if (value === undefined) return 1
  return isFiniteNumber(value) && value >= 0 && value <= 1 ? value : null
}

function parseLocalBgm(value: unknown): LocalBgmState | null {
  if (value === undefined) return normalizeLocalBgm(undefined)
  if (!isRecord(value)) return null
  if (
    (value.playlists !== undefined &&
      (!Array.isArray(value.playlists) ||
        value.playlists.some(
          (playlist) =>
            !isRecord(playlist) ||
            typeof playlist.id !== 'string' ||
            typeof playlist.name !== 'string' ||
            !Array.isArray(playlist.tracks) ||
            playlist.tracks.some(
              (track) =>
                !isRecord(track) ||
                typeof track.id !== 'string' ||
                typeof track.name !== 'string' ||
                typeof track.filePath !== 'string'
            )
        ))) ||
    (value.outputDeviceId !== undefined &&
      value.outputDeviceId !== null &&
      typeof value.outputDeviceId !== 'string') ||
    (value.crossfadeMode !== undefined &&
      value.crossfadeMode !== 'crossfade' &&
      value.crossfadeMode !== 'gap') ||
    (value.fadeMs !== undefined && !isFiniteNumber(value.fadeMs))
  ) {
    return null
  }
  return normalizeLocalBgm(value)
}

function parseTiming(value: unknown): TimingConfig | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.fadeInMs) ||
    value.fadeInMs < 0 ||
    !isFiniteNumber(value.holdMs) ||
    value.holdMs < 0 ||
    !isFiniteNumber(value.fadeOutMs) ||
    value.fadeOutMs < 0
  )
    return null
  return {
    fadeInMs: value.fadeInMs,
    holdMs: value.holdMs,
    fadeOutMs: value.fadeOutMs,
    fadeInEase: isFadeEasing(value.fadeInEase) ? value.fadeInEase : 'linear',
    fadeOutEase: isFadeEasing(value.fadeOutEase) ? value.fadeOutEase : 'linear'
  }
}

function parseMask(value: unknown): MaskConfig | null {
  if (
    !isRecord(value) ||
    !['none', 'circle', 'image'].includes(String(value.mode)) ||
    (value.imagePath !== null && typeof value.imagePath !== 'string') ||
    !isFiniteNumber(value.sizePercent) ||
    !isFiniteNumber(value.offsetXPercent) ||
    !isFiniteNumber(value.offsetYPercent)
  )
    return null
  return {
    mode: value.mode as MaskConfig['mode'],
    imagePath: value.imagePath as string | null,
    invert: value.invert === true,
    sizePercent: value.sizePercent,
    offsetXPercent: value.offsetXPercent,
    offsetYPercent: value.offsetYPercent
  }
}

function parsePhoto(value: unknown): PhotoItem | null {
  if (!isRecord(value) || typeof value.filePath !== 'string' || typeof value.excluded !== 'boolean')
    return null
  const fit = value.fit ?? null
  const fields: unknown[] = [value.fadeInMs ?? null, value.holdMs ?? null, value.fadeOutMs ?? null]
  if (
    (fit !== null && !isFitMode(fit)) ||
    fields.some((item) => item !== null && (!isFiniteNumber(item) || item < 0))
  )
    return null
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    filePath: value.filePath,
    fileName: typeof value.fileName === 'string' ? value.fileName : basename(value.filePath),
    excluded: value.excluded,
    fit,
    fadeInMs: fields[0] as number | null,
    holdMs: fields[1] as number | null,
    fadeOutMs: fields[2] as number | null
  }
}

function parseV1(value: Record<string, unknown>): ProjectStateV1 {
  if (!Array.isArray(value.photos)) throw new Error('写真リストの形式が正しくありません')
  const photos = value.photos.map((photo) => {
    const parsed = parsePhoto(photo)
    if (!parsed) throw new Error('写真リストに不正な項目があります')
    const { filePath, excluded, fit, fadeInMs, holdMs, fadeOutMs } = parsed
    return { filePath, excluded, fit, fadeInMs, holdMs, fadeOutMs } satisfies ProjectPhoto
  })
  const timing = parseTiming(value.timing)
  const mask = parseMask(value.mask)
  if (!timing || !mask || !isFitMode(value.fit) || typeof value.loop !== 'boolean') {
    throw new Error('設定の形式が正しくありません')
  }
  return { photos, timing, mask, fit: value.fit, loop: value.loop }
}

function parseCue(value: unknown): Cue | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string')
    return null
  const bgm = normalizeCueBgm(value.bgm)
  const bgmFields = bgm ? { bgm } : {}
  if (
    value.materialType === 'black' &&
    value.materialId === undefined &&
    value.endBehavior === 'hold'
  ) {
    return {
      id: value.id,
      label: value.label,
      materialType: 'black',
      endBehavior: 'hold',
      fadeInMs:
        isFiniteNumber(value.fadeInMs) && value.fadeInMs >= 0
          ? Math.min(10_000, value.fadeInMs)
          : 0,
      fadeOutMs:
        isFiniteNumber(value.fadeOutMs) && value.fadeOutMs >= 0
          ? Math.min(10_000, value.fadeOutMs)
          : 0,
      ...bgmFields
    }
  }
  if (typeof value.materialId !== 'string') return null
  if (
    value.materialType === 'slideshow' &&
    ['loop', 'advance', 'toStandby', 'hold', 'toBlack'].includes(String(value.endBehavior))
  )
    return {
      ...value,
      materialType: 'slideshow',
      endBehavior: value.endBehavior,
      ...bgmFields
    } as Cue
  if (
    value.materialType === 'video' &&
    ['advance', 'toStandby', 'hold', 'toBlack'].includes(String(value.endBehavior))
  )
    return {
      ...value,
      materialType: 'video',
      endBehavior: value.endBehavior,
      fadeInMs: isFiniteNumber(value.fadeInMs) && value.fadeInMs >= 0 ? value.fadeInMs : undefined,
      fadeOutMs:
        isFiniteNumber(value.fadeOutMs) && value.fadeOutMs >= 0 ? value.fadeOutMs : undefined,
      ...bgmFields
    } as Cue
  if (value.materialType === 'still' && value.endBehavior === 'hold') {
    return {
      id: value.id,
      label: value.label,
      materialType: 'still',
      materialId: value.materialId,
      endBehavior: 'hold',
      fadeInMs:
        isFiniteNumber(value.fadeInMs) && value.fadeInMs >= 0
          ? Math.min(10_000, value.fadeInMs)
          : 0,
      fadeOutMs:
        isFiniteNumber(value.fadeOutMs) && value.fadeOutMs >= 0
          ? Math.min(10_000, value.fadeOutMs)
          : 0,
      ...bgmFields
    }
  }
  return null
}

type ParsedMaterials = Omit<Materials, 'stills'> & {
  stills: Array<Materials['stills'][number] | LegacyBlackStillMaterial>
}

function parseMaterials(value: unknown): ParsedMaterials | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.slideshows) ||
    !Array.isArray(value.videos) ||
    !Array.isArray(value.stills)
  )
    return null
  const slideshows = value.slideshows.map((raw) => {
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      typeof raw.name !== 'string' ||
      !Array.isArray(raw.photos)
    )
      return null
    const photos = raw.photos.map(parsePhoto)
    const timing = parseTiming(raw.timing)
    if (photos.some((photo) => !photo) || !timing || !isFitMode(raw.fit)) return null
    return {
      id: raw.id,
      name: raw.name,
      photos: photos as PhotoItem[],
      timing,
      fit: raw.fit
    }
  })
  const videos = value.videos.map((raw) =>
    isRecord(raw) &&
    typeof raw.id === 'string' &&
    typeof raw.name === 'string' &&
    typeof raw.filePath === 'string' &&
    isFiniteNumber(raw.volume) &&
    raw.volume >= 0 &&
    raw.volume <= 1 &&
    (raw.fit === undefined || isFitMode(raw.fit))
      ? {
          id: raw.id,
          name: raw.name,
          filePath: raw.filePath,
          volume: raw.volume,
          // Kept temporarily so migrateVideoFades can upgrade old v2 files.
          fadeInMs:
            isFiniteNumber(raw.fadeInMs) && raw.fadeInMs >= 0
              ? Math.min(10_000, raw.fadeInMs)
              : undefined,
          fadeOutMs:
            isFiniteNumber(raw.fadeOutMs) && raw.fadeOutMs >= 0
              ? Math.min(10_000, raw.fadeOutMs)
              : undefined,
          fit: raw.fit ?? 'contain'
        }
      : null
  )
  const stills = value.stills.map((raw) =>
    isRecord(raw) &&
    typeof raw.id === 'string' &&
    typeof raw.name === 'string' &&
    (raw.kind === undefined || raw.kind === 'image' || raw.kind === 'black') &&
    (raw.kind === undefined || raw.kind === 'image' ? typeof raw.filePath === 'string' : true) &&
    (raw.fit === undefined || isFitMode(raw.fit))
      ? raw.kind === 'black'
        ? {
            id: raw.id,
            name: raw.name,
            kind: 'black' as const,
            fit: raw.fit ?? 'contain'
          }
        : {
            id: raw.id,
            name: raw.name,
            kind: 'image' as const,
            filePath: raw.filePath as string,
            fit: raw.fit ?? 'contain'
          }
      : null
  )
  if ([...slideshows, ...videos, ...stills].some((item) => !item)) return null
  return {
    slideshows: slideshows as Materials['slideshows'],
    videos: videos as Materials['videos'],
    stills: stills as ParsedMaterials['stills']
  }
}

export function parseProject(value: unknown): ProjectState {
  if (!isRecord(value) || value.app !== 'pplayer')
    throw new Error('pplayer のプロジェクトファイルではありません')
  if (value.version === 1) return migrateV1Project(parseV1(value))
  if (value.version !== 2) throw new Error('対応していないプロジェクトバージョンです')
  const parsedMaterials = parseMaterials(value.materials)
  const mask = parseMask(value.mask)
  const stageAspect = parseStageAspect(value.stageAspect)
  const masterVolume = parseMasterVolume(value.masterVolume)
  const localBgm = parseLocalBgm(value.localBgm)
  const cues = Array.isArray(value.cues) ? value.cues.map(parseCue) : []
  if (
    !parsedMaterials ||
    !mask ||
    !stageAspect ||
    masterVolume === null ||
    localBgm === null ||
    cues.some((cue) => !cue) ||
    (value.standbyStillId !== null && typeof value.standbyStillId !== 'string') ||
    (value.audioOutputDeviceId !== null && typeof value.audioOutputDeviceId !== 'string') ||
    (value.editingSlideshowId !== undefined &&
      value.editingSlideshowId !== null &&
      typeof value.editingSlideshowId !== 'string')
  )
    throw new Error('version 2 の設定形式が正しくありません')
  const migrated = migrateBlackStillMaterials({
    materials: parsedMaterials,
    cues: cues as Cue[],
    standbyStillId: value.standbyStillId
  })
  const materials = migrated.materials
  const materialIds = new Set([
    ...materials.slideshows.map((item) => `slideshow:${item.id}`),
    ...materials.videos.map((item) => `video:${item.id}`),
    ...materials.stills.map((item) => `still:${item.id}`)
  ])
  if (
    migrated.cues.some(
      (cue) =>
        cue.materialType !== 'black' && !materialIds.has(`${cue.materialType}:${cue.materialId}`)
    )
  ) {
    throw new Error('存在しない素材を参照するキューがあります')
  }
  if (
    migrated.standbyStillId !== null &&
    !materials.stills.some((material) => material.id === migrated.standbyStillId)
  ) {
    throw new Error('蓋絵が存在しない静止画素材を参照しています')
  }
  const editingSlideshowId =
    typeof value.editingSlideshowId === 'string' &&
    materials.slideshows.some((material) => material.id === value.editingSlideshowId)
      ? value.editingSlideshowId
      : (materials.slideshows[0]?.id ?? null)
  return migrateVideoFades({
    materials,
    localBgm,
    cues: migrated.cues,
    standbyStillId: migrated.standbyStillId,
    audioOutputDeviceId: value.audioOutputDeviceId,
    masterVolume,
    ftbDurationMs: normalizeFtbDurationMs(value.ftbDurationMs),
    mask,
    stageAspect,
    editingSlideshowId
  })
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

export function registerProjectIpc(stateStore: AppStateStore): void {
  ipcMain.handle(
    IPC.projectSave,
    async (_event, ...args: unknown[]): Promise<ProjectSaveResult | undefined> => {
      if (args.length > 0) return { error: '不正なプロジェクト保存リクエストです' }
      const result = await dialog.showSaveDialog({
        title: 'プロジェクトを保存',
        defaultPath: 'slideshow.pplayer',
        filters: [
          { name: 'pplayer プロジェクト', extensions: ['pplayer'] },
          { name: 'JSON', extensions: ['json'] }
        ]
      })
      if (result.canceled || !result.filePath) return undefined
      try {
        const {
          materials,
          localBgm,
          cues,
          standbyStillId,
          audioOutputDeviceId,
          masterVolume,
          ftbDurationMs,
          mask,
          stageAspect,
          editingSlideshowId
        } = stateStore.getState()
        const persistentMaterials: Materials = {
          slideshows: materials.slideshows.map((material) => ({
            ...material,
            photos: material.photos.map(({ reloadToken: _reloadToken, ...photo }) => photo)
          })),
          videos: materials.videos.map(({ reloadToken: _reloadToken, ...material }) => material),
          stills: materials.stills.map(({ reloadToken: _reloadToken, ...material }) => material)
        }
        const project: ProjectFile = {
          app: 'pplayer',
          version: 2,
          materials: persistentMaterials,
          localBgm: {
            ...localBgm,
            playlists: localBgm.playlists.map((playlist) => ({
              ...playlist,
              tracks: playlist.tracks.map(({ reloadToken: _reloadToken, ...track }) => track)
            }))
          },
          cues,
          standbyStillId,
          audioOutputDeviceId,
          masterVolume,
          ftbDurationMs,
          mask,
          stageAspect,
          editingSlideshowId
        }
        await writeFile(result.filePath, `${JSON.stringify(project, null, 2)}\n`, 'utf8')
        return { saved: true }
      } catch (error) {
        return {
          error: `プロジェクトを保存できませんでした: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
  )

  ipcMain.handle(
    IPC.projectLoad,
    async (_event, ...args: unknown[]): Promise<ProjectLoadResult | undefined> => {
      if (args.length > 0) return { error: '不正なプロジェクト読み込みリクエストです' }
      const result = await dialog.showOpenDialog({
        title: 'プロジェクトを読み込み',
        properties: ['openFile'],
        filters: [
          { name: 'pplayer プロジェクト', extensions: ['pplayer'] },
          { name: 'JSON', extensions: ['json'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) return undefined
      try {
        const project = parseProject(JSON.parse(await readFile(result.filePaths[0], 'utf8')))
        let missing = 0
        const materials = {
          slideshows: await Promise.all(
            project.materials.slideshows.map(async (material) => ({
              ...material,
              photos: (
                await Promise.all(
                  material.photos.map(async (photo) => {
                    if (await isFile(photo.filePath)) return photo
                    missing += 1
                    return null
                  })
                )
              ).filter((photo): photo is PhotoItem => photo !== null)
            }))
          ),
          videos: project.materials.videos,
          stills: project.materials.stills
        }
        const loaded = materials.slideshows.reduce(
          (total, material) => total + material.photos.length,
          0
        )
        const mask =
          project.mask.mode === 'image' &&
          (!project.mask.imagePath || !(await isFile(project.mask.imagePath)))
            ? { ...project.mask, mode: 'circle' as const, imagePath: null }
            : project.mask
        stateStore.replaceProjectState({ ...project, materials, mask })
        return { loaded, missing }
      } catch (error) {
        const detail =
          error instanceof SyntaxError
            ? 'JSONが壊れています'
            : error instanceof Error
              ? error.message
              : String(error)
        return { error: `プロジェクトを読み込めませんでした: ${detail}` }
      }
    }
  )
}
