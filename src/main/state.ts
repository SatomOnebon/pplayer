import { BrowserWindow } from 'electron'
import Store from 'electron-store'
import {
  IPC,
  type AppState,
  type Cue,
  type PhotoItem,
  type PlaybackCommand,
  type PlaybackStatus,
  type PendingTransition,
  type ProjectState,
  type SlideshowMaterial
} from '../shared/types'
import { isFadeEasing } from '../shared/easing'
import { resolveSlideshowCompletion } from '../shared/cueEngine'
import { cueStartState } from '../shared/cueStart'
import {
  getEditingSlideshow,
  migrateBlackStillMaterials,
  migrateV1State,
  migrateVideoFades,
  normalizeLocalBgm,
  normalizeCueBgm,
  type V1SavedState
} from '../shared/migration'
import { buildCycles, computeTimeline, cycleDuration, resolvePhotoIndex } from '../shared/timeline'
import { clampVideoFadeMs } from '../shared/videoFade'
import { beginStillExit } from '../shared/stillFade'
import { resolvePlayPauseCommand } from '../shared/playbackToggle'
import {
  beginMasterFtb,
  discardsPendingTransition,
  exitsFtbHeld,
  holdMasterFtb,
  interruptsMasterFtb,
  normalizeFtbDurationMs,
  resumeMasterFtb,
  toggleBlackoutState
} from '../shared/masterFtb'

interface PlaybackAnchor {
  currentId: string
  currentIndex: number
  cycleElapsedMs: number
  playablePhotos: PhotoItem[]
}

const INITIAL_STATE = migrateV1State({})
const LOCKED_COMMANDS = new Set<PlaybackCommand['type']>([
  'go',
  'fireCue',
  'jump',
  'next',
  'prev',
  'playPause',
  'toggleBlackout',
  'masterFtb',
  'stopToStandby'
])
type SavedAppState = Omit<AppState, 'outputLocked'>
const { outputLocked: _initialOutputLocked, ...INITIAL_SAVED_STATE } = INITIAL_STATE

function createEmptySlideshow(): SlideshowMaterial {
  return {
    id: crypto.randomUUID(),
    name: 'スライドショー1',
    photos: [],
    timing: { ...INITIAL_STATE.materials.slideshows[0].timing },
    fit: 'contain'
  }
}

function playableCount(state: AppState): number {
  return (getActiveSlideshow(state)?.photos ?? []).filter((photo) => !photo.excluded).length
}

function getActiveCue(state: AppState): Cue | null {
  return state.cues.find((cue) => cue.id === state.activeCueId) ?? null
}

function getActiveSlideshow(state: AppState): SlideshowMaterial | null {
  const cue = getActiveCue(state)
  if (!cue || cue.materialType !== 'slideshow') return null
  return state.materials.slideshows.find((material) => material.id === cue.materialId) ?? null
}

function restoreV2State(saved: SavedAppState): AppState {
  const migrated = migrateBlackStillMaterials(saved)
  return migrateVideoFades({
    ...migrated,
    outputLocked: false,
    stageAspect: saved.stageAspect === '16:9' ? '16:9' : 'free',
    localBgm: normalizeLocalBgm(saved.localBgm),
    materials: {
      ...migrated.materials,
      videos: migrated.materials.videos.map((material) => ({
        ...material,
        fit: material.fit === 'cover' ? 'cover' : 'contain'
      })),
      stills: migrated.materials.stills.map((material) => ({
        id: material.id,
        name: material.name,
        kind: 'image' as const,
        filePath: material.filePath,
        fit: material.fit === 'cover' ? 'cover' : 'contain'
      }))
    },
    cues: migrated.cues.map((cue) => {
      const bgm = normalizeCueBgm(cue.bgm)
      return bgm ? { ...cue, bgm } : { ...cue, bgm: undefined }
    }),
    activeCueId: null,
    audioFallbackActive: false,
    masterVolume:
      typeof saved.masterVolume === 'number' && Number.isFinite(saved.masterVolume)
        ? Math.min(1, Math.max(0, saved.masterVolume))
        : 1,
    ftbDurationMs: normalizeFtbDurationMs(saved.ftbDurationMs),
    ftb: null,
    ftbHeld: false,
    pendingTransition: null,
    armedCueIndex: Math.min(
      Math.max(0, Math.trunc(saved.armedCueIndex ?? 0)),
      Math.max(0, migrated.cues.length - 1)
    ),
    status: 'idle',
    baseTimestamp: null,
    pausedElapsedMs: 0
  })
}

export class AppStateStore {
  private readonly persistence = new Store<{ appState: SavedAppState | V1SavedState }>({
    defaults: { appState: INITIAL_SAVED_STATE }
  })

  private state: AppState
  private previousStatus: Exclude<PlaybackStatus, 'blackout'> = 'idle'
  private finishTimer: ReturnType<typeof setTimeout> | null = null
  private ftbTimer: ReturnType<typeof setTimeout> | null = null
  private ftbResumeStatus: Exclude<PlaybackStatus, 'blackout'> = 'idle'

  constructor() {
    const saved = this.persistence.get('appState')
    this.state = 'materials' in saved ? restoreV2State(saved) : migrateV1State(saved)
    if (this.state.materials.slideshows.length === 0) {
      this.state.materials.slideshows.push(createEmptySlideshow())
    }
    if (!getEditingSlideshow(this.state)) {
      this.state.editingSlideshowId = this.state.materials.slideshows[0]?.id ?? null
    }
    this.normalizeBaseIndex()
    this.persistState()
  }

  getState(): AppState {
    return structuredClone(this.state)
  }

  getAllowedMediaPaths(): Set<string> {
    const paths = [
      ...this.state.materials.slideshows.flatMap((material) =>
        material.photos.map((photo) => photo.filePath)
      ),
      ...this.state.materials.videos.map((material) => material.filePath),
      ...this.state.materials.stills.flatMap((material) =>
        material.kind === 'image' ? [material.filePath] : []
      ),
      ...this.state.localBgm.playlists.flatMap((playlist) =>
        playlist.tracks.map((track) => track.filePath)
      )
    ]
    if (this.state.mask.imagePath) paths.push(this.state.mask.imagePath)
    return new Set(paths)
  }

  replaceProjectState(project: ProjectState): void {
    this.cancelFtb()
    this.state = {
      ...this.state,
      ...project,
      activeCueId: null,
      audioFallbackActive: false,
      ftbDurationMs: normalizeFtbDurationMs(project.ftbDurationMs),
      ftb: null,
      ftbHeld: false,
      pendingTransition: null,
      armedCueIndex: 0,
      status: 'idle',
      baseIndex: 0,
      baseTimestamp: null,
      pausedElapsedMs: 0
    }
    if (this.state.materials.slideshows.length === 0) {
      this.state.materials.slideshows.push(createEmptySlideshow())
    }
    if (!getEditingSlideshow(this.state)) {
      this.state.editingSlideshowId = this.state.materials.slideshows[0].id
    }
    this.previousStatus = 'idle'
    this.commit()
  }

  apply(command: PlaybackCommand): void {
    if (this.state.outputLocked && LOCKED_COMMANDS.has(command.type)) return
    if (command.type === 'playPause') {
      const resolved = resolvePlayPauseCommand(this.state)
      if (resolved) this.apply(resolved)
      return
    }
    const now = Date.now()
    if (this.state.pendingTransition !== null && discardsPendingTransition(command)) {
      const effectiveStatus =
        this.state.status === 'blackout' ? this.previousStatus : this.state.status
      this.cancelFtb()
      if (command.type === 'masterFtb') {
        this.ftbResumeStatus = effectiveStatus
        Object.assign(this.state, holdMasterFtb(this.state, now))
      } else {
        const toggled = toggleBlackoutState(this.state, this.previousStatus, now)
        Object.assign(this.state, toggled.state)
        this.previousStatus = toggled.previousStatus
      }
      this.commit()
      return
    }
    if (command.type === 'play' && this.state.ftbHeld) {
      Object.assign(
        this.state,
        resumeMasterFtb(this.state.pausedElapsedMs, this.ftbResumeStatus, now)
      )
      const ftb = beginMasterFtb('up', this.state.ftbDurationMs, now)
      this.state.ftb = ftb
      this.scheduleFtbCompletion(ftb.durationMs)
      this.commit()
      return
    }
    if (
      command.type === 'masterFtb' &&
      this.state.ftb?.direction === 'down' &&
      this.state.pendingTransition === null
    ) {
      this.completeFtb(false)
      this.commit()
      return
    }
    const interruptedPendingTransition =
      this.state.pendingTransition !== null && this.isCueTransitionCommand(command)
    if (interruptedPendingTransition) {
      this.cancelFtb()
    }
    if (this.state.ftb && interruptsMasterFtb(command)) {
      this.completeFtb(false)
    }
    if (this.state.ftbHeld && exitsFtbHeld(command)) {
      this.state.ftbHeld = false
    }
    const pending = interruptedPendingTransition ? null : this.pendingTransitionFor(command)
    if (pending) {
      const exit = beginStillExit(this.state, pending, now)
      if (exit) {
        Object.assign(this.state, exit)
        this.scheduleFtbCompletion(exit.ftb.durationMs)
        this.commit()
        return
      }
    }
    const effectiveStatus =
      this.state.status === 'blackout' ? this.previousStatus : this.state.status

    switch (command.type) {
      case 'setOutputLock':
        this.state.outputLocked = command.locked
        break
      case 'go':
        this.fireCueAt(this.state.armedCueIndex, now)
        break
      case 'fireCue':
        this.fireCueById(command.id, now)
        break
      case 'stopToStandby':
        this.stopToStandby()
        break
      case 'armCue': {
        const index = this.state.cues.findIndex((cue) => cue.id === command.id)
        if (index >= 0) this.state.armedCueIndex = index
        break
      }
      case 'play':
        if (getActiveCue(this.state)?.materialType === 'video') {
          this.setEffectiveStatus('playing')
        } else if (playableCount(this.state) > 0) {
          this.state.baseTimestamp = now - this.state.pausedElapsedMs
          this.setEffectiveStatus('playing')
        }
        break
      case 'pause':
        if (effectiveStatus === 'playing') {
          if (this.state.baseTimestamp !== null) {
            this.state.pausedElapsedMs = Math.max(0, now - this.state.baseTimestamp)
          }
          this.state.baseTimestamp = null
          this.setEffectiveStatus('paused')
        }
        break
      case 'next':
        this.move(1, effectiveStatus, now)
        break
      case 'prev':
        this.move(-1, effectiveStatus, now)
        break
      case 'jump':
        this.jump(command.index, effectiveStatus, now)
        break
      case 'toggleBlackout':
        {
          const toggled = toggleBlackoutState(this.state, this.previousStatus, now)
          Object.assign(this.state, toggled.state)
          this.previousStatus = toggled.previousStatus
        }
        break
      case 'masterFtb':
        if (this.state.ftbHeld) {
          Object.assign(
            this.state,
            resumeMasterFtb(this.state.pausedElapsedMs, this.ftbResumeStatus, now)
          )
          const ftb = beginMasterFtb('up', this.state.ftbDurationMs, now)
          this.state.ftb = ftb
          this.scheduleFtbCompletion(ftb.durationMs)
        } else if (!this.state.ftb) {
          this.ftbResumeStatus = effectiveStatus
          const ftb = beginMasterFtb('down', this.state.ftbDurationMs, now)
          this.state.ftb = ftb
          this.scheduleFtbCompletion(ftb.durationMs)
        }
        break
      case 'setFtbDuration':
        this.state.ftbDurationMs = normalizeFtbDurationMs(command.durationMs)
        break
      case 'setMasterVolume':
        this.state.masterVolume = Math.min(1, Math.max(0, command.volume))
        break
      case 'setFit':
        this.editingSlideshow().fit = command.fit
        break
      case 'setTiming':
        this.editingSlideshow().timing = {
          fadeInMs: Math.max(0, Math.round(command.timing.fadeInMs / 100) * 100),
          holdMs: Math.max(100, Math.round(command.timing.holdMs / 100) * 100),
          fadeOutMs: Math.max(0, Math.round(command.timing.fadeOutMs / 100) * 100),
          fadeInEase: isFadeEasing(command.timing.fadeInEase)
            ? command.timing.fadeInEase
            : 'linear',
          fadeOutEase: isFadeEasing(command.timing.fadeOutEase)
            ? command.timing.fadeOutEase
            : 'linear'
        }
        break
      case 'setMask':
        this.state.mask = command.mask
        break
      case 'setStageAspect':
        this.state.stageAspect = command.stageAspect
        break
      case 'setPhotos':
        {
          const anchor = this.capturePlaybackAnchor(now)
          this.editingSlideshow().photos = command.photos
          this.restorePlaybackAnchor(anchor, effectiveStatus, now)
        }
        break
      case 'reorderPhotos':
        {
          const anchor = this.capturePlaybackAnchor(now)
          this.reorder(command.photoIds)
          this.restorePlaybackAnchor(anchor, effectiveStatus, now)
        }
        break
      case 'setExcluded':
        {
          const anchor = this.capturePlaybackAnchor(now)
          this.editingSlideshow().photos = this.editingSlideshow().photos.map((photo) =>
            photo.id === command.id ? { ...photo, excluded: command.excluded } : photo
          )
          this.restorePlaybackAnchor(anchor, effectiveStatus, now)
        }
        break
      case 'setPhotoFit':
        this.editingSlideshow().photos = this.editingSlideshow().photos.map((photo) =>
          photo.id === command.id ? { ...photo, fit: command.fit } : photo
        )
        break
      case 'setPhotoTiming':
        this.editingSlideshow().photos = this.editingSlideshow().photos.map((photo) =>
          photo.id === command.id
            ? {
                ...photo,
                fadeInMs:
                  command.timing.fadeInMs === null
                    ? null
                    : Math.max(0, Math.round(command.timing.fadeInMs / 100) * 100),
                holdMs:
                  command.timing.holdMs === null
                    ? null
                    : Math.max(100, Math.round(command.timing.holdMs / 100) * 100),
                fadeOutMs:
                  command.timing.fadeOutMs === null
                    ? null
                    : Math.max(0, Math.round(command.timing.fadeOutMs / 100) * 100)
              }
            : photo
        )
        break
      case 'removePhoto':
        {
          const anchor = this.capturePlaybackAnchor(now)
          this.editingSlideshow().photos = this.editingSlideshow().photos.filter(
            (photo) => photo.id !== command.id
          )
          this.restorePlaybackAnchor(anchor, effectiveStatus, now)
        }
        break
      case 'removePhotos': {
        const anchor = this.capturePlaybackAnchor(now)
        const removedIds = new Set(command.ids)
        this.editingSlideshow().photos = this.editingSlideshow().photos.filter(
          (photo) => !removedIds.has(photo.id)
        )
        this.restorePlaybackAnchor(anchor, effectiveStatus, now)
        break
      }
      case 'addSlideshow': {
        const material: SlideshowMaterial = {
          id: crypto.randomUUID(),
          name: command.name,
          photos: [],
          timing: { ...INITIAL_STATE.materials.slideshows[0].timing },
          fit: 'contain'
        }
        this.state.materials.slideshows.push(material)
        this.state.editingSlideshowId = material.id
        break
      }
      case 'addLocalBgmPlaylist':
        this.state.localBgm.playlists.push({
          id: crypto.randomUUID(),
          name: command.name,
          tracks: []
        })
        break
      case 'renameLocalBgmPlaylist': {
        const playlist = this.state.localBgm.playlists.find(
          (item) => item.id === command.playlistId
        )
        if (playlist) playlist.name = command.name
        break
      }
      case 'removeLocalBgmPlaylist':
        if (this.state.localBgm.playlists.some((item) => item.id === command.playlistId)) {
          this.state.localBgm.playlists = this.state.localBgm.playlists.filter(
            (item) => item.id !== command.playlistId
          )
          this.state.cues.forEach((cue) => {
            if (
              cue.bgm?.mode === 'play' &&
              cue.bgm.source === 'local' &&
              cue.bgm.playlistId === command.playlistId
            ) {
              cue.bgm = { mode: 'continue' }
            }
          })
        }
        break
      case 'addLocalBgmTracks': {
        const playlist = this.state.localBgm.playlists.find(
          (item) => item.id === command.playlistId
        )
        if (playlist) {
          playlist.tracks.push(
            ...command.tracks.map((track) => ({ ...track, id: crypto.randomUUID() }))
          )
        }
        break
      }
      case 'removeLocalBgmTrack': {
        const playlist = this.state.localBgm.playlists.find(
          (item) => item.id === command.playlistId
        )
        if (playlist?.tracks.some((track) => track.id === command.trackId)) {
          playlist.tracks = playlist.tracks.filter((track) => track.id !== command.trackId)
        }
        break
      }
      case 'reorderLocalBgmTracks': {
        const playlist = this.state.localBgm.playlists.find(
          (item) => item.id === command.playlistId
        )
        if (playlist) playlist.tracks = this.reorderByIds(playlist.tracks, command.trackIds)
        break
      }
      case 'reloadLocalBgmPlaylist':
        this.state.localBgm.playlists = this.state.localBgm.playlists.map((playlist) =>
          playlist.id === command.playlistId
            ? {
                ...playlist,
                tracks: playlist.tracks.map((track) => ({
                  ...track,
                  reloadToken: (track.reloadToken ?? 0) + 1
                }))
              }
            : playlist
        )
        break
      case 'setLocalBgmCrossfade':
        this.state.localBgm.crossfadeMode =
          command.mode === 'crossfade' || command.mode === 'gap'
            ? command.mode
            : this.state.localBgm.crossfadeMode
        this.state.localBgm.fadeMs = Math.min(10_000, Math.max(0, command.fadeMs))
        break
      case 'setEditingSlideshow':
        if (
          this.state.materials.slideshows.some((material) => material.id === command.materialId)
        ) {
          this.state.editingSlideshowId = command.materialId
        }
        break
      case 'renameMaterial':
        this.materialsOfType(command.materialType).forEach((material) => {
          if (material.id === command.materialId) material.name = command.name
        })
        break
      case 'removeMaterial':
        this.removeMaterial(command.materialType, command.materialId)
        break
      case 'reloadMaterial':
        if (command.materialType === 'slideshow') {
          this.state.materials.slideshows = this.state.materials.slideshows.map((material) =>
            material.id === command.materialId
              ? {
                  ...material,
                  photos: material.photos.map((photo) => ({
                    ...photo,
                    reloadToken: (photo.reloadToken ?? 0) + 1
                  }))
                }
              : material
          )
        } else if (command.materialType === 'video') {
          this.state.materials.videos = this.state.materials.videos.map((material) =>
            material.id === command.materialId
              ? { ...material, reloadToken: (material.reloadToken ?? 0) + 1 }
              : material
          )
        } else {
          this.state.materials.stills = this.state.materials.stills.map((material) =>
            material.id === command.materialId
              ? { ...material, reloadToken: (material.reloadToken ?? 0) + 1 }
              : material
          )
        }
        break
      case 'addVideoMaterial':
        this.state.materials.videos.push({
          id: crypto.randomUUID(),
          name: command.name,
          filePath: command.filePath,
          volume: Math.min(1, Math.max(0, command.volume)),
          fit: 'contain'
        })
        break
      case 'setVideoVolume': {
        const material = this.state.materials.videos.find((item) => item.id === command.materialId)
        if (material) material.volume = Math.min(1, Math.max(0, command.volume))
        break
      }
      case 'setCueFades': {
        const cue = this.state.cues.find((item) => item.id === command.cueId)
        if (
          cue?.materialType === 'video' ||
          cue?.materialType === 'still' ||
          cue?.materialType === 'black'
        ) {
          cue.fadeInMs = clampVideoFadeMs(command.fadeInMs)
          cue.fadeOutMs = clampVideoFadeMs(command.fadeOutMs)
        }
        break
      }
      case 'setCueBgm': {
        const bgm = normalizeCueBgm(command.bgm)
        if (bgm) {
          this.state.cues = this.state.cues.map((cue) =>
            cue.id === command.cueId ? { ...cue, bgm } : cue
          )
        }
        break
      }
      case 'setMaterialFit': {
        const materials =
          command.materialType === 'video'
            ? this.state.materials.videos
            : this.state.materials.stills
        const material = materials.find((item) => item.id === command.materialId)
        if (material) material.fit = command.fit
        break
      }
      case 'addStillMaterial':
        this.state.materials.stills.push({
          id: crypto.randomUUID(),
          name: command.name,
          kind: 'image',
          filePath: command.filePath,
          fit: 'contain'
        })
        break
      case 'setStandbyStill':
        this.state.standbyStillId =
          command.materialId === null ||
          this.state.materials.stills.some((material) => material.id === command.materialId)
            ? command.materialId
            : this.state.standbyStillId
        break
      case 'addCue': {
        const cue = this.createCue(command)
        if (cue) this.state.cues.push(cue)
        break
      }
      case 'removeCue':
        if (this.state.activeCueId === command.cueId) this.stopToStandby()
        this.state.cues = this.state.cues.filter((cue) => cue.id !== command.cueId)
        this.normalizeArmedCueIndex()
        break
      case 'renameCue':
        this.state.cues = this.state.cues.map((cue) =>
          cue.id === command.cueId ? { ...cue, label: command.label.trim() || cue.label } : cue
        )
        break
      case 'reorderCues':
        this.state.cues = this.reorderByIds(this.state.cues, command.cueIds)
        this.normalizeArmedCueIndex()
        break
      case 'setCueEndBehavior':
        this.state.cues = this.state.cues.map((cue) =>
          cue.id === command.cueId
            ? (this.createCue({ ...cue, endBehavior: command.endBehavior }, cue.id) ?? cue)
            : cue
        )
        break
      case 'setAudioOutputDevice':
        this.state.audioOutputDeviceId = command.deviceId
        break
    }

    this.commit()
  }

  handleMediaEnded(activeCueId: string): void {
    if (this.state.ftb || this.state.ftbHeld) return
    if (this.state.activeCueId !== activeCueId) return
    const index = this.state.cues.findIndex((cue) => cue.id === activeCueId)
    const cue = this.state.cues[index]
    if (!cue || cue.materialType !== 'video') return

    if (cue.endBehavior === 'advance') {
      if (index + 1 < this.state.cues.length) {
        this.fireCueAt(index + 1, Date.now())
      } else {
        this.stopToStandby()
      }
    } else if (cue.endBehavior === 'toStandby') {
      this.stopToStandby()
    } else if (cue.endBehavior === 'hold') {
      this.setEffectiveStatus('paused')
      this.state.baseTimestamp = null
    } else {
      this.stopToBlackout()
    }
    this.commit()
  }

  handleAudioFallback(activeCueId: string): void {
    const cue = getActiveCue(this.state)
    if (cue?.id !== activeCueId || cue.materialType !== 'video') return
    if (this.state.audioFallbackActive) return
    this.state.audioFallbackActive = true
    this.commit()
  }

  private setEffectiveStatus(status: Exclude<PlaybackStatus, 'blackout'>): void {
    if (this.state.status === 'blackout') {
      this.previousStatus = status
    } else {
      this.state.status = status
    }
  }

  private editingSlideshow(): SlideshowMaterial {
    const material = getEditingSlideshow(this.state)
    if (!material) throw new Error('編集対象のスライドショー素材がありません')
    return material
  }

  private materialsOfType(type: 'slideshow' | 'video' | 'still'): Array<{
    id: string
    name: string
  }> {
    if (type === 'slideshow') return this.state.materials.slideshows
    if (type === 'video') return this.state.materials.videos
    return this.state.materials.stills
  }

  private removeMaterial(type: 'slideshow' | 'video' | 'still', id: string): void {
    if (type === 'slideshow') {
      if (this.state.materials.slideshows.length === 1) return
      this.state.materials.slideshows = this.state.materials.slideshows.filter(
        (item) => item.id !== id
      )
      if (this.state.editingSlideshowId === id) {
        this.state.editingSlideshowId = this.state.materials.slideshows[0]?.id ?? null
        this.resetPlayback()
      }
    } else if (type === 'video') {
      this.state.materials.videos = this.state.materials.videos.filter((item) => item.id !== id)
    } else {
      this.state.materials.stills = this.state.materials.stills.filter((item) => item.id !== id)
      if (this.state.standbyStillId === id) this.state.standbyStillId = null
    }

    const removesActiveCue = this.state.cues.some(
      (cue) =>
        cue.id === this.state.activeCueId && cue.materialType === type && cue.materialId === id
    )
    if (removesActiveCue) this.stopToStandby()
    this.state.cues = this.state.cues.filter(
      (cue) => cue.materialType !== type || cue.materialId !== id
    )
    this.normalizeArmedCueIndex()
  }

  private createCue(
    command: {
      label: string
      materialType: Cue['materialType']
      materialId?: string
      endBehavior: Cue['endBehavior']
      fadeInMs?: number
      fadeOutMs?: number
      bgm?: unknown
    },
    id: string = crypto.randomUUID()
  ): Cue | null {
    const bgm = normalizeCueBgm(command.bgm)
    const bgmFields = bgm ? { bgm } : {}
    if (
      command.materialType !== 'black' &&
      (typeof command.materialId !== 'string' ||
        !this.materialsOfType(command.materialType).some((item) => item.id === command.materialId))
    ) {
      return null
    }
    if (
      command.materialType === 'slideshow' &&
      ['loop', 'advance', 'toStandby', 'hold', 'toBlack'].includes(command.endBehavior)
    ) {
      return {
        id,
        label: command.label,
        materialType: 'slideshow',
        materialId: command.materialId as string,
        endBehavior: command.endBehavior as 'loop' | 'advance' | 'toStandby' | 'hold' | 'toBlack',
        ...bgmFields
      }
    }
    if (
      command.materialType === 'video' &&
      ['advance', 'toStandby', 'hold', 'toBlack'].includes(command.endBehavior)
    ) {
      return {
        id,
        label: command.label,
        materialType: 'video',
        materialId: command.materialId as string,
        endBehavior: command.endBehavior as 'advance' | 'toStandby' | 'hold' | 'toBlack',
        fadeInMs:
          'fadeInMs' in command && typeof command.fadeInMs === 'number'
            ? clampVideoFadeMs(command.fadeInMs)
            : 0,
        fadeOutMs:
          'fadeOutMs' in command && typeof command.fadeOutMs === 'number'
            ? clampVideoFadeMs(command.fadeOutMs)
            : 0,
        ...bgmFields
      }
    }
    if (command.materialType === 'still' && command.endBehavior === 'hold') {
      return {
        id,
        label: command.label,
        materialType: 'still',
        materialId: command.materialId as string,
        endBehavior: 'hold',
        fadeInMs:
          'fadeInMs' in command && typeof command.fadeInMs === 'number'
            ? clampVideoFadeMs(command.fadeInMs)
            : 0,
        fadeOutMs:
          'fadeOutMs' in command && typeof command.fadeOutMs === 'number'
            ? clampVideoFadeMs(command.fadeOutMs)
            : 0,
        ...bgmFields
      }
    }
    if (command.materialType === 'black' && command.endBehavior === 'hold') {
      return {
        id,
        label: command.label,
        materialType: 'black',
        endBehavior: 'hold',
        fadeInMs:
          'fadeInMs' in command && typeof command.fadeInMs === 'number'
            ? clampVideoFadeMs(command.fadeInMs)
            : 0,
        fadeOutMs:
          'fadeOutMs' in command && typeof command.fadeOutMs === 'number'
            ? clampVideoFadeMs(command.fadeOutMs)
            : 0,
        ...bgmFields
      }
    }
    return null
  }

  private reorderByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
    const byId = new Map(items.map((item) => [item.id, item]))
    return [
      ...ids.flatMap((id) => {
        const item = byId.get(id)
        if (!item) return []
        byId.delete(id)
        return [item]
      }),
      ...byId.values()
    ]
  }

  private resetPlayback(): void {
    this.cancelFtb()
    this.state.activeCueId = null
    this.state.audioFallbackActive = false
    this.state.status = 'idle'
    this.previousStatus = 'idle'
    this.state.baseIndex = 0
    this.state.baseTimestamp = null
    this.state.pausedElapsedMs = 0
  }

  private move(delta: number, status: Exclude<PlaybackStatus, 'blackout'>, now: number): void {
    const count = playableCount(this.state)
    if (count === 0) return
    this.state.baseIndex = (this.state.baseIndex + delta + count) % count
    this.restartCurrentPhoto(status, now)
  }

  private jump(index: number, status: Exclude<PlaybackStatus, 'blackout'>, now: number): void {
    const count = playableCount(this.state)
    if (count === 0) return
    this.state.baseIndex = Math.min(Math.max(0, Math.trunc(index)), count - 1)
    this.restartCurrentPhoto(status, now)
  }

  private restartCurrentPhoto(status: Exclude<PlaybackStatus, 'blackout'>, now: number): void {
    this.state.pausedElapsedMs = 0
    this.state.baseTimestamp = status === 'playing' && this.state.status !== 'blackout' ? now : null
  }

  private capturePlaybackAnchor(now: number): PlaybackAnchor | null {
    if (this.state.status === 'idle') return null
    const activeSlideshow = getActiveSlideshow(this.state)
    if (!activeSlideshow || activeSlideshow.id !== this.state.editingSlideshowId) return null

    const playablePhotos = activeSlideshow.photos.filter((photo) => !photo.excluded)
    const elapsedMs =
      this.state.status === 'playing' && this.state.baseTimestamp !== null
        ? Math.max(0, now - this.state.baseTimestamp)
        : this.state.pausedElapsedMs
    const cycles = buildCycles(
      playablePhotos,
      activeSlideshow.timing,
      this.state.baseIndex,
      this.activeSlideshowLoops()
    )
    const timeline = computeTimeline(elapsedMs, cycles, this.activeSlideshowLoops())
    if (timeline.finished) return null
    const totalDurationMs = cycles.reduce((total, cycle) => total + cycleDuration(cycle), 0)
    const normalizedElapsedMs =
      this.activeSlideshowLoops() && totalDurationMs > 0 ? elapsedMs % totalDurationMs : elapsedMs
    const elapsedBeforeCurrentCycleMs = cycles
      .slice(0, timeline.photoOffset)
      .reduce((total, cycle) => total + cycleDuration(cycle), 0)
    const cycleElapsedMs = Math.max(0, normalizedElapsedMs - elapsedBeforeCurrentCycleMs)
    const currentIndex = resolvePhotoIndex(
      this.state.baseIndex,
      timeline.photoOffset,
      playablePhotos.length,
      this.activeSlideshowLoops()
    )
    if (currentIndex === null) return null
    const currentPhoto = playablePhotos[currentIndex]
    if (!currentPhoto) return null
    return { currentId: currentPhoto.id, currentIndex, cycleElapsedMs, playablePhotos }
  }

  private restorePlaybackAnchor(
    anchor: PlaybackAnchor | null,
    status: Exclude<PlaybackStatus, 'blackout'>,
    now: number
  ): void {
    const playablePhotos = this.editingSlideshow().photos.filter((photo) => !photo.excluded)
    if (playablePhotos.length === 0 || anchor === null) {
      this.normalizeBaseIndex()
      return
    }

    let newIndex = playablePhotos.findIndex((photo) => photo.id === anchor.currentId)

    if (newIndex < 0) {
      const newIds = new Set(playablePhotos.map((photo) => photo.id))
      const successor = anchor.playablePhotos
        .slice(anchor.currentIndex + 1)
        .find((photo) => newIds.has(photo.id))
      newIndex = successor ? playablePhotos.findIndex((photo) => photo.id === successor.id) : 0
      this.state.baseIndex = newIndex
      this.restartCurrentPhoto(status, now)
      return
    }

    this.state.baseIndex = newIndex
    this.state.pausedElapsedMs = anchor.cycleElapsedMs
    this.state.baseTimestamp =
      status === 'playing' && this.state.status !== 'blackout' ? now - anchor.cycleElapsedMs : null
  }

  private normalizeBaseIndex(): void {
    const count = playableCount(this.state)
    this.state.baseIndex = count === 0 ? 0 : Math.min(this.state.baseIndex, count - 1)
    if (count === 0) {
      this.state.baseTimestamp = null
      this.state.pausedElapsedMs = 0
      this.setEffectiveStatus('idle')
    }
  }

  private activeSlideshowLoops(): boolean {
    const cue = getActiveCue(this.state)
    return cue?.materialType === 'slideshow' && cue.endBehavior === 'loop'
  }

  private normalizeArmedCueIndex(): void {
    this.state.armedCueIndex =
      this.state.cues.length === 0
        ? 0
        : Math.min(Math.max(0, this.state.armedCueIndex), this.state.cues.length - 1)
  }

  private fireCueById(id: string, now: number): void {
    const index = this.state.cues.findIndex((cue) => cue.id === id)
    if (index >= 0) this.fireCueAt(index, now)
  }

  private fireCueAt(index: number, now: number): void {
    const cue = this.state.cues[index]
    if (!cue) return
    this.state.activeCueId = cue.id
    this.state.audioFallbackActive = false
    this.state.armedCueIndex = Math.min(index + 1, this.state.cues.length - 1)
    this.state.baseIndex = 0
    this.state.pausedElapsedMs = 0
    const { baseTimestamp, status } = cueStartState(cue, now)
    this.state.baseTimestamp = baseTimestamp
    this.previousStatus = status
    this.state.status = status
  }

  private stopToStandby(): void {
    this.state.activeCueId = null
    this.state.audioFallbackActive = false
    this.state.baseIndex = 0
    this.state.baseTimestamp = null
    this.state.pausedElapsedMs = 0
    this.previousStatus = 'idle'
    this.state.status = 'idle'
  }

  private stopToBlackout(): void {
    this.state.activeCueId = null
    this.state.audioFallbackActive = false
    this.state.baseIndex = 0
    this.state.baseTimestamp = null
    this.state.pausedElapsedMs = 0
    this.previousStatus = 'idle'
    this.state.status = 'blackout'
  }

  private reorder(photoIds: string[]): void {
    const byId = new Map(this.editingSlideshow().photos.map((photo) => [photo.id, photo]))
    const ordered = photoIds.flatMap((id) => {
      const photo = byId.get(id)
      if (!photo) return []
      byId.delete(id)
      return [photo]
    })
    this.editingSlideshow().photos = [...ordered, ...byId.values()]
  }

  private commit(): void {
    this.persistState()
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC.stateChanged, this.getState())
    }
    this.scheduleFinish()
  }

  private persistState(): void {
    const { outputLocked: _outputLocked, ...savedState } = this.state
    this.persistence.set('appState', savedState)
  }

  private scheduleFinish(): void {
    if (this.finishTimer) {
      clearTimeout(this.finishTimer)
      this.finishTimer = null
    }

    if (this.state.ftb) return
    const effectiveStatus =
      this.state.status === 'blackout' ? this.previousStatus : this.state.status
    const slideshow = getActiveSlideshow(this.state)
    if (!slideshow) return
    const playablePhotos = slideshow.photos.filter((photo) => !photo.excluded)
    const cycles = buildCycles(playablePhotos, slideshow.timing, this.state.baseIndex, false)
    const duration = cycles.reduce((total, cycle) => total + cycleDuration(cycle), 0)
    const activeCue = getActiveCue(this.state)
    const finishAt =
      activeCue?.materialType === 'slideshow' && activeCue.endBehavior === 'hold'
        ? duration - Math.max(0, cycles.at(-1)?.fadeOutMs ?? 0)
        : duration
    if (
      this.state.status === 'blackout' ||
      effectiveStatus !== 'playing' ||
      this.activeSlideshowLoops() ||
      this.state.baseTimestamp === null ||
      playablePhotos.length === 0 ||
      finishAt <= 0
    ) {
      return
    }

    const elapsed = Math.max(0, Date.now() - this.state.baseTimestamp)
    const remaining = finishAt - elapsed
    if (remaining <= 0) {
      this.finishPlayback()
      return
    }
    this.finishTimer = setTimeout(() => this.finishPlayback(), remaining)
  }

  private finishPlayback(): void {
    this.finishTimer = null
    const activeCueId = this.state.activeCueId
    if (!activeCueId) return
    const completion = resolveSlideshowCompletion(this.state.cues, activeCueId)
    if (completion.type === 'loop') {
      this.state.baseIndex = 0
      this.state.baseTimestamp = Date.now()
      this.state.pausedElapsedMs = 0
    } else if (completion.type === 'fire') {
      this.fireCueById(completion.cueId, Date.now())
    } else if (completion.type === 'standby') {
      this.stopToStandby()
    } else if (completion.type === 'hold') {
      const slideshow = getActiveSlideshow(this.state)
      const playablePhotos = slideshow?.photos.filter((photo) => !photo.excluded) ?? []
      const cycles = slideshow
        ? buildCycles(playablePhotos, slideshow.timing, this.state.baseIndex, false)
        : []
      const lastCycle = cycles.at(-1)
      const fadeOutStart =
        cycles.reduce((total, cycle) => total + cycleDuration(cycle), 0) -
        Math.max(0, lastCycle?.fadeOutMs ?? 0)
      const holdStart = fadeOutStart - Math.max(0, lastCycle?.holdMs ?? 0)
      this.state.pausedElapsedMs = Math.max(holdStart, fadeOutStart - 1)
      this.state.baseTimestamp = null
      this.setEffectiveStatus('paused')
    } else {
      this.stopToBlackout()
    }
    this.commit()
  }

  private scheduleFtbCompletion(durationMs: number): void {
    if (this.ftbTimer) clearTimeout(this.ftbTimer)
    this.ftbTimer = setTimeout(() => this.completeFtb(true), durationMs)
  }

  private cancelFtb(): void {
    if (this.ftbTimer) clearTimeout(this.ftbTimer)
    this.ftbTimer = null
    this.state.ftb = null
    this.state.pendingTransition = null
  }

  private completeFtb(commit: boolean): void {
    if (!this.state.ftb) return
    const direction = this.state.ftb.direction
    const pending = this.state.pendingTransition
    this.cancelFtb()
    if (pending?.type === 'fireCue') {
      this.fireCueById(pending.cueId, Date.now())
    } else if (pending?.type === 'standby') {
      this.stopToStandby()
    } else if (direction === 'down') {
      Object.assign(this.state, holdMasterFtb(this.state, Date.now()))
    }
    if (commit) this.commit()
  }

  private isCueTransitionCommand(command: PlaybackCommand): boolean {
    return command.type === 'go' || command.type === 'fireCue' || command.type === 'stopToStandby'
  }

  private pendingTransitionFor(command: PlaybackCommand): PendingTransition | null {
    if (command.type === 'stopToStandby') return { type: 'standby' }
    if (command.type === 'go') {
      const cue = this.state.cues[this.state.armedCueIndex]
      return cue && cue.id !== this.state.activeCueId ? { type: 'fireCue', cueId: cue.id } : null
    }
    if (command.type === 'fireCue' && command.id !== this.state.activeCueId) {
      return this.state.cues.some((cue) => cue.id === command.id)
        ? { type: 'fireCue', cueId: command.id }
        : null
    }
    return null
  }
}
