export type FitMode = 'contain' | 'cover'
export type StageAspect = 'free' | '16:9'

export type FadeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export interface PhotoItem {
  id: string
  filePath: string
  fileName: string
  excluded: boolean
  fit: FitMode | null
  fadeInMs: number | null
  holdMs: number | null
  fadeOutMs: number | null
  reloadToken?: number
}

export interface TimingConfig {
  fadeInMs: number
  holdMs: number
  fadeOutMs: number
  fadeInEase: FadeEasing
  fadeOutEase: FadeEasing
}

export const DEFAULT_TIMING: TimingConfig = {
  fadeInMs: 1500,
  holdMs: 5500,
  fadeOutMs: 1500,
  fadeInEase: 'linear',
  fadeOutEase: 'linear'
}

export interface MaskConfig {
  mode: 'none' | 'circle' | 'image'
  imagePath: string | null
  invert: boolean
  sizePercent: number
  offsetXPercent: number
  offsetYPercent: number
}

export const DEFAULT_MASK: MaskConfig = {
  mode: 'circle',
  imagePath: null,
  invert: false,
  sizePercent: 100,
  offsetXPercent: 0,
  offsetYPercent: 0
}

export const DEFAULT_FTB_DURATION_MS = 1500

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'blackout'

export interface SlideshowMaterial {
  id: string
  name: string
  photos: PhotoItem[]
  timing: TimingConfig
  fit: FitMode
}

export interface VideoMaterial {
  id: string
  name: string
  filePath: string
  volume: number
  fit: FitMode
  reloadToken?: number
}

export interface StillMaterial {
  id: string
  name: string
  fit: FitMode
  kind: 'image'
  filePath: string
  reloadToken?: number
}

export interface Materials {
  slideshows: SlideshowMaterial[]
  videos: VideoMaterial[]
  stills: StillMaterial[]
}

export interface LocalBgmTrack {
  id: string
  name: string
  filePath: string
  reloadToken?: number
}

export interface LocalBgmPlaylist {
  id: string
  name: string
  tracks: LocalBgmTrack[]
}

export interface LocalBgmState {
  playlists: LocalBgmPlaylist[]
  outputDeviceId: string | null
  crossfadeMode: 'crossfade' | 'gap'
  fadeMs: number
}

export const DEFAULT_LOCAL_BGM: LocalBgmState = {
  playlists: [],
  outputDeviceId: null,
  crossfadeMode: 'crossfade',
  fadeMs: 2000
}

export type CueBgm =
  | { mode: 'continue' }
  | { mode: 'play'; source: 'spotify'; uri: string; fadeMs: number }
  | { mode: 'play'; source: 'local'; playlistId: string; fadeMs: number }
  | { mode: 'stop'; fadeMs: number }

export type Cue =
  | {
      id: string
      label: string
      materialType: 'slideshow'
      materialId: string
      endBehavior: 'loop' | 'advance' | 'toStandby' | 'hold' | 'toBlack'
      bgm?: CueBgm
    }
  | {
      id: string
      label: string
      materialType: 'video'
      materialId: string
      endBehavior: 'advance' | 'toStandby' | 'hold' | 'toBlack'
      fadeInMs: number
      fadeOutMs: number
      bgm?: CueBgm
    }
  | {
      id: string
      label: string
      materialType: 'still'
      materialId: string
      endBehavior: 'hold'
      fadeInMs: number
      fadeOutMs: number
      bgm?: CueBgm
    }
  | {
      id: string
      label: string
      materialType: 'black'
      endBehavior: 'hold'
      fadeInMs: number
      fadeOutMs: number
      bgm?: CueBgm
    }

export type MaterialType = Exclude<Cue['materialType'], 'black'>

export type PreviewTarget =
  | { type: 'slideshow'; material: SlideshowMaterial }
  | { type: 'video'; material: VideoMaterial }
  | { type: 'still'; material: StillMaterial }

export type PendingTransition = { type: 'fireCue'; cueId: string } | { type: 'standby' }

export interface AppState {
  outputLocked: boolean
  materials: Materials
  localBgm: LocalBgmState
  cues: Cue[]
  standbyStillId: string | null
  audioOutputDeviceId: string | null
  masterVolume: number
  audioFallbackActive: boolean
  ftbDurationMs: number
  ftb: { startedAt: number; durationMs: number; direction: 'down' | 'up' } | null
  ftbHeld: boolean
  pendingTransition: PendingTransition | null
  editingSlideshowId: string | null
  activeCueId: string | null
  armedCueIndex: number
  mask: MaskConfig
  stageAspect: StageAspect
  status: PlaybackStatus
  baseIndex: number
  baseTimestamp: number | null
  pausedElapsedMs: number
}

export interface DisplayBounds {
  width: number
  height: number
  isFullScreen: boolean
}

export interface RemoteSettings {
  globalShortcutsEnabled: boolean
  httpEnabled: boolean
  port: number
  token: string
}

export interface RemoteSettingsState extends RemoteSettings {
  listenError: string | null
  failedShortcuts: string[]
}

export interface PowerSettings {
  preventDisplaySleep: boolean
}

export interface PowerSettingsState extends PowerSettings {
  active: boolean
}

export interface SpotifyPlaylist {
  uri: string
  name: string
  image: string | null
}

export type SpotifyControlAction = 'playPause' | 'next' | 'previous'

export interface SpotifySettings {
  lastPlaylistUri: string | null
  clientId: string
}

export interface SpotifySettingsState extends SpotifySettings {
  connected: boolean
  authorizing: boolean
  error: string | null
}

export type SpotifySettingsUpdate = Partial<Pick<SpotifySettings, 'lastPlaylistUri' | 'clientId'>>

export type RemoteSettingsUpdate = Partial<
  Pick<RemoteSettings, 'globalShortcutsEnabled' | 'httpEnabled' | 'port'>
>

export interface ProjectPhoto {
  filePath: string
  excluded: boolean
  fit: FitMode | null
  fadeInMs: number | null
  holdMs: number | null
  fadeOutMs: number | null
}

export interface ProjectStateV1 {
  photos: ProjectPhoto[]
  timing: TimingConfig
  mask: MaskConfig
  fit: FitMode
  loop: boolean
}

export interface ProjectFileV1 extends ProjectStateV1 {
  app: 'pplayer'
  version: 1
}

export interface ProjectState {
  materials: Materials
  localBgm: LocalBgmState
  cues: Cue[]
  standbyStillId: string | null
  audioOutputDeviceId: string | null
  masterVolume: number
  ftbDurationMs: number
  mask: MaskConfig
  stageAspect: StageAspect
  editingSlideshowId: string | null
}

export interface ProjectFile extends ProjectState {
  app: 'pplayer'
  version: 2
}

export type ProjectSaveResult = { saved: true } | { error: string }

export type ProjectLoadResult = { loaded: number; missing: number } | { error: string }

export interface ExportConfig {
  width: number
  height: number
  fps: number
  codec: 'hevc10' | 'h264'
  outputPath: string
}

export interface ExportProgress {
  stage: 'composing' | 'encoding' | 'done' | 'error' | 'cancelled'
  current: number
  total: number
  percent: number
  message?: string
  outputPath?: string
}

export const IPC = {
  getState: 'app:get-state',
  stateChanged: 'app:state-changed',
  getDisplayBounds: 'display:get-bounds',
  displayBoundsChanged: 'display:bounds-changed',
  setDisplayFullScreen: 'display:set-fullscreen',
  command: 'app:command',
  choosePhotos: 'app:choose-photos',
  addPhotoPaths: 'photos:add-paths',
  choosePhotosFolder: 'photos:choose-folder',
  chooseMaskImage: 'app:choose-mask-image',
  chooseVideo: 'app:choose-video',
  chooseAudio: 'app:choose-audio',
  chooseStill: 'app:choose-still',
  openExternalPlayer: 'app:open-external-player',
  mediaEnded: 'cue:media-ended',
  audioFallback: 'cue:audio-fallback',
  projectSave: 'project:save',
  projectLoad: 'project:load',
  chooseExportPath: 'export:choose-path',
  exportWriteFrame: 'export:write-frame',
  exportStart: 'export:start',
  exportCancel: 'export:cancel',
  exportReveal: 'export:reveal',
  exportProgress: 'export:progress',
  getRemoteSettings: 'remote:get-settings',
  setRemoteSettings: 'remote:set-settings',
  regenerateRemoteToken: 'remote:regenerate-token',
  remoteSettingsChanged: 'remote:settings-changed',
  getPowerSettings: 'power:get-settings',
  setPowerSettings: 'power:set-settings',
  powerSettingsChanged: 'power:settings-changed',
  getSpotifySettings: 'spotify:get-settings',
  setSpotifySettings: 'spotify:set-settings',
  spotifySettingsChanged: 'spotify:settings-changed',
  authorizeSpotify: 'spotify:authorize',
  deauthorizeSpotify: 'spotify:deauthorize',
  getSpotifyAccessToken: 'spotify:get-access-token',
  getSpotifyPlaylists: 'spotify:get-playlists',
  spotifyControl: 'spotify:control'
} as const

export type PlaybackCommand =
  | { type: 'setOutputLock'; locked: boolean }
  | { type: 'go' }
  | { type: 'fireCue'; id: string }
  | { type: 'stopToStandby' }
  | { type: 'armCue'; id: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'playPause' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'jump'; index: number }
  | { type: 'toggleBlackout' }
  | { type: 'masterFtb' }
  | { type: 'setFtbDuration'; durationMs: number }
  | { type: 'setMasterVolume'; volume: number }
  | { type: 'setFit'; fit: FitMode }
  | { type: 'setTiming'; timing: TimingConfig }
  | { type: 'setMask'; mask: MaskConfig }
  | { type: 'setStageAspect'; stageAspect: StageAspect }
  | { type: 'setPhotos'; photos: PhotoItem[] }
  | { type: 'reorderPhotos'; photoIds: string[] }
  | { type: 'setExcluded'; id: string; excluded: boolean }
  | { type: 'setPhotoFit'; id: string; fit: FitMode | null }
  | {
      type: 'setPhotoTiming'
      id: string
      timing: {
        fadeInMs: number | null
        holdMs: number | null
        fadeOutMs: number | null
      }
    }
  | { type: 'removePhoto'; id: string }
  | { type: 'removePhotos'; ids: string[] }
  | { type: 'addSlideshow'; name: string }
  | { type: 'addLocalBgmPlaylist'; name: string }
  | { type: 'renameLocalBgmPlaylist'; playlistId: string; name: string }
  | { type: 'removeLocalBgmPlaylist'; playlistId: string }
  | {
      type: 'addLocalBgmTracks'
      playlistId: string
      tracks: { name: string; filePath: string }[]
    }
  | { type: 'removeLocalBgmTrack'; playlistId: string; trackId: string }
  | { type: 'reorderLocalBgmTracks'; playlistId: string; trackIds: string[] }
  | { type: 'reloadLocalBgmPlaylist'; playlistId: string }
  | { type: 'setBgmOutputDevice'; deviceId: string | null }
  | { type: 'setLocalBgmCrossfade'; mode: 'crossfade' | 'gap'; fadeMs: number }
  | { type: 'setEditingSlideshow'; materialId: string }
  | {
      type: 'renameMaterial'
      materialType: 'slideshow' | 'video' | 'still'
      materialId: string
      name: string
    }
  | {
      type: 'removeMaterial'
      materialType: 'slideshow' | 'video' | 'still'
      materialId: string
    }
  | {
      type: 'reloadMaterial'
      materialType: 'slideshow' | 'video' | 'still'
      materialId: string
    }
  | { type: 'addVideoMaterial'; name: string; filePath: string; volume: number }
  | { type: 'setVideoVolume'; materialId: string; volume: number }
  | { type: 'setCueFades'; cueId: string; fadeInMs: number; fadeOutMs: number }
  | { type: 'setCueBgm'; cueId: string; bgm: CueBgm }
  | {
      type: 'setMaterialFit'
      materialType: 'video' | 'still'
      materialId: string
      fit: FitMode
    }
  | { type: 'addStillMaterial'; name: string; filePath: string }
  | { type: 'setStandbyStill'; materialId: string | null }
  | {
      type: 'addCue'
      label: string
      materialType: 'slideshow' | 'video' | 'still'
      materialId: string
      endBehavior: Cue['endBehavior']
    }
  | {
      type: 'addCue'
      label: string
      materialType: 'black'
      endBehavior: Cue['endBehavior']
    }
  | { type: 'removeCue'; cueId: string }
  | { type: 'renameCue'; cueId: string; label: string }
  | { type: 'reorderCues'; cueIds: string[] }
  | { type: 'setCueEndBehavior'; cueId: string; endBehavior: Cue['endBehavior'] }
  | { type: 'setAudioOutputDevice'; deviceId: string | null }
