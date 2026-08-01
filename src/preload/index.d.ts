import type {
  AppState,
  DisplayBounds,
  ExportConfig,
  ExportProgress,
  PlaybackCommand,
  PowerSettings,
  PowerSettingsState,
  ProjectLoadResult,
  ProjectSaveResult,
  RemoteSettingsState,
  RemoteSettingsUpdate,
  SpotifyPlaylist,
  SpotifyControlAction,
  SpotifySettingsState,
  SpotifySettingsUpdate
} from '../shared/types'
import type { TimelineCycle } from '../shared/timeline'

export interface PPlayerAPI {
  getState(): Promise<AppState>
  sendCommand(command: PlaybackCommand): void
  onStateChanged(callback: (state: AppState) => void): () => void
  getDisplayBounds(): Promise<DisplayBounds>
  setDisplayFullScreen(flag: boolean): void
  onDisplayBoundsChanged(callback: (bounds: DisplayBounds) => void): () => void
  choosePhotos(): Promise<number | undefined>
  addPhotoPaths(paths: string[]): Promise<number>
  choosePhotosFolder(): Promise<number | undefined>
  getFilePath(file: File): string
  chooseMaskImage(): Promise<void>
  chooseVideo(): Promise<boolean>
  chooseAudio(): Promise<{ name: string; filePath: string }[]>
  chooseStill(): Promise<boolean>
  openExternalPlayer(filePath: string): Promise<string>
  notifyMediaEnded(activeCueId: string): void
  notifyAudioFallback(activeCueId: string): void
  saveProject(): Promise<ProjectSaveResult | undefined>
  loadProject(): Promise<ProjectLoadResult | undefined>
  chooseExportPath(): Promise<string | undefined>
  exportWriteFrame(index: number, frame: ArrayBuffer, total: number): Promise<void>
  exportStart(config: ExportConfig, cycles: ReadonlyArray<TimelineCycle>): Promise<void>
  exportCancel(): Promise<void>
  revealExport(outputPath: string): Promise<void>
  onExportProgress(callback: (progress: ExportProgress) => void): () => void
  getRemoteSettings(): Promise<RemoteSettingsState>
  setRemoteSettings(update: RemoteSettingsUpdate): Promise<RemoteSettingsState>
  regenerateRemoteToken(): Promise<RemoteSettingsState>
  onRemoteSettingsChanged(callback: (settings: RemoteSettingsState) => void): () => void
  getPowerSettings(): Promise<PowerSettingsState>
  setPowerSettings(settings: PowerSettings): Promise<PowerSettingsState>
  onPowerSettingsChanged(callback: (settings: PowerSettingsState) => void): () => void
  getSpotifySettings(): Promise<SpotifySettingsState>
  setSpotifySettings(update: SpotifySettingsUpdate): Promise<SpotifySettingsState>
  authorizeSpotify(): Promise<SpotifySettingsState>
  deauthorizeSpotify(): Promise<SpotifySettingsState>
  getSpotifyAccessToken(): Promise<string | null>
  getSpotifyPlaylists(): Promise<SpotifyPlaylist[]>
  onSpotifyControl(callback: (action: SpotifyControlAction) => void): () => void
  onSpotifySettingsChanged(callback: (settings: SpotifySettingsState) => void): () => void
}

declare global {
  interface Window {
    api: PPlayerAPI
  }
}
