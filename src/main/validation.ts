import type {
  ExportConfig,
  FitMode,
  MaskConfig,
  PhotoItem,
  PlaybackCommand,
  TimingConfig
} from '../shared/types'
import { isFadeEasing } from '../shared/easing'
import { normalizeCueBgm } from '../shared/migration'
import type { TimelineCycle } from '../shared/timeline'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value)
}

function isFitMode(value: unknown): value is FitMode {
  return value === 'contain' || value === 'cover'
}

function isTimingConfig(value: unknown): value is TimingConfig {
  return (
    isRecord(value) &&
    isFiniteNumber(value.fadeInMs) &&
    isFiniteNumber(value.holdMs) &&
    isFiniteNumber(value.fadeOutMs) &&
    isFadeEasing(value.fadeInEase) &&
    isFadeEasing(value.fadeOutEase)
  )
}

function isPhotoTiming(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableNonNegativeNumber(value.fadeInMs) &&
    isNullableNonNegativeNumber(value.holdMs) &&
    isNullableNonNegativeNumber(value.fadeOutMs)
  )
}

function isMaskConfig(value: unknown): value is MaskConfig {
  return (
    isRecord(value) &&
    (value.mode === 'none' || value.mode === 'circle' || value.mode === 'image') &&
    (value.imagePath === null || typeof value.imagePath === 'string') &&
    typeof value.invert === 'boolean' &&
    isFiniteNumber(value.sizePercent) &&
    isFiniteNumber(value.offsetXPercent) &&
    isFiniteNumber(value.offsetYPercent)
  )
}

function isPhotoItem(value: unknown): value is PhotoItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.filePath === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.excluded === 'boolean' &&
    (value.fit === null || isFitMode(value.fit)) &&
    isNullableNonNegativeNumber(value.fadeInMs) &&
    isNullableNonNegativeNumber(value.holdMs) &&
    isNullableNonNegativeNumber(value.fadeOutMs)
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

type PlaybackCommandType = PlaybackCommand['type']
type PlaybackCommandValidator = (value: Record<string, unknown>) => boolean

const playbackCommandValidators = {
  setOutputLock: (value) => typeof value.locked === 'boolean',
  go: () => true,
  fireCue: (value) => typeof value.id === 'string',
  stopToStandby: () => true,
  armCue: (value) => typeof value.id === 'string',
  play: () => true,
  pause: () => true,
  playPause: () => true,
  next: () => true,
  prev: () => true,
  jump: (value) => isFiniteNumber(value.index),
  toggleBlackout: () => true,
  masterFtb: () => true,
  setFtbDuration: (value) => isFiniteNumber(value.durationMs) && value.durationMs >= 100,
  setMasterVolume: (value) =>
    isFiniteNumber(value.volume) && value.volume >= 0 && value.volume <= 1,
  setFit: (value) => isFitMode(value.fit),
  setTiming: (value) => isTimingConfig(value.timing),
  setMask: (value) => isMaskConfig(value.mask),
  setStageAspect: (value) => value.stageAspect === 'free' || value.stageAspect === '16:9',
  setPhotos: (value) => Array.isArray(value.photos) && value.photos.every(isPhotoItem),
  reorderPhotos: (value) => isStringArray(value.photoIds),
  setExcluded: (value) => typeof value.id === 'string' && typeof value.excluded === 'boolean',
  setPhotoFit: (value) =>
    typeof value.id === 'string' && (value.fit === null || isFitMode(value.fit)),
  setPhotoTiming: (value) => typeof value.id === 'string' && isPhotoTiming(value.timing),
  removePhoto: (value) => typeof value.id === 'string',
  removePhotos: (value) => isStringArray(value.ids),
  addSlideshow: (value) => typeof value.name === 'string',
  addLocalBgmPlaylist: (value) => typeof value.name === 'string',
  renameLocalBgmPlaylist: (value) =>
    typeof value.playlistId === 'string' && typeof value.name === 'string',
  removeLocalBgmPlaylist: (value) => typeof value.playlistId === 'string',
  addLocalBgmTracks: (value) =>
    typeof value.playlistId === 'string' &&
    Array.isArray(value.tracks) &&
    value.tracks.every(
      (track) =>
        isRecord(track) && typeof track.name === 'string' && typeof track.filePath === 'string'
    ),
  removeLocalBgmTrack: (value) =>
    typeof value.playlistId === 'string' && typeof value.trackId === 'string',
  reorderLocalBgmTracks: (value) =>
    typeof value.playlistId === 'string' && isStringArray(value.trackIds),
  reloadLocalBgmPlaylist: (value) => typeof value.playlistId === 'string',
  setBgmOutputDevice: (value) => value.deviceId === null || typeof value.deviceId === 'string',
  setLocalBgmCrossfade: (value) =>
    (value.mode === 'crossfade' || value.mode === 'gap') && isFiniteNumber(value.fadeMs),
  setEditingSlideshow: (value) => typeof value.materialId === 'string',
  renameMaterial: (value) =>
    ['slideshow', 'video', 'still'].includes(String(value.materialType)) &&
    typeof value.materialId === 'string' &&
    typeof value.name === 'string',
  removeMaterial: (value) =>
    ['slideshow', 'video', 'still'].includes(String(value.materialType)) &&
    typeof value.materialId === 'string',
  reloadMaterial: (value) =>
    ['slideshow', 'video', 'still'].includes(String(value.materialType)) &&
    typeof value.materialId === 'string',
  addVideoMaterial: (value) =>
    typeof value.name === 'string' &&
    typeof value.filePath === 'string' &&
    isFiniteNumber(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 1,
  setVideoVolume: (value) =>
    typeof value.materialId === 'string' &&
    isFiniteNumber(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 1,
  setCueFades: (value) =>
    typeof value.cueId === 'string' &&
    isFiniteNumber(value.fadeInMs) &&
    value.fadeInMs >= 0 &&
    value.fadeInMs <= 10_000 &&
    isFiniteNumber(value.fadeOutMs) &&
    value.fadeOutMs >= 0 &&
    value.fadeOutMs <= 10_000,
  setCueBgm: (value) => typeof value.cueId === 'string' && normalizeCueBgm(value.bgm) !== undefined,
  setMaterialFit: (value) =>
    (value.materialType === 'video' || value.materialType === 'still') &&
    typeof value.materialId === 'string' &&
    isFitMode(value.fit),
  addStillMaterial: (value) => typeof value.name === 'string' && typeof value.filePath === 'string',
  setStandbyStill: (value) => value.materialId === null || typeof value.materialId === 'string',
  addCue: (value) =>
    typeof value.label === 'string' &&
    ((value.materialType === 'black' &&
      value.materialId === undefined &&
      value.endBehavior === 'hold') ||
      (['slideshow', 'video', 'still'].includes(String(value.materialType)) &&
        typeof value.materialId === 'string' &&
        ['loop', 'advance', 'toStandby', 'hold', 'toBlack'].includes(String(value.endBehavior)))),
  removeCue: (value) => typeof value.cueId === 'string',
  renameCue: (value) => typeof value.cueId === 'string' && typeof value.label === 'string',
  reorderCues: (value) => isStringArray(value.cueIds),
  setCueEndBehavior: (value) =>
    typeof value.cueId === 'string' &&
    ['loop', 'advance', 'toStandby', 'hold', 'toBlack'].includes(String(value.endBehavior)),
  setAudioOutputDevice: (value) => value.deviceId === null || typeof value.deviceId === 'string'
} satisfies Record<PlaybackCommandType, PlaybackCommandValidator>

function isPlaybackCommandType(value: string): value is PlaybackCommandType {
  return Object.prototype.hasOwnProperty.call(playbackCommandValidators, value)
}

export function isPlaybackCommand(value: unknown): value is PlaybackCommand {
  if (!isRecord(value) || typeof value.type !== 'string' || !isPlaybackCommandType(value.type)) {
    return false
  }

  return playbackCommandValidators[value.type](value)
}

export function isExportConfig(value: unknown): value is ExportConfig {
  return (
    isRecord(value) &&
    isFiniteNumber(value.width) &&
    value.width > 0 &&
    isFiniteNumber(value.height) &&
    value.height > 0 &&
    isFiniteNumber(value.fps) &&
    [24, 25, 29.97, 30, 59.94, 60].includes(value.fps) &&
    (value.codec === 'hevc10' || value.codec === 'h264') &&
    typeof value.outputPath === 'string' &&
    value.outputPath.length > 0
  )
}

export function isTimelineCycles(value: unknown): value is TimelineCycle[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (cycle) =>
        isRecord(cycle) &&
        isNonNegativeNumber(cycle.fadeInMs) &&
        isNonNegativeNumber(cycle.holdMs) &&
        isNonNegativeNumber(cycle.fadeOutMs) &&
        isFadeEasing(cycle.fadeInEase) &&
        isFadeEasing(cycle.fadeOutEase)
    )
  )
}
