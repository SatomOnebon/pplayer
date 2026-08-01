import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type AppState,
  type DisplayBounds,
  type ExportConfig,
  type ExportProgress,
  type PlaybackCommand,
  type PowerSettings,
  type PowerSettingsState,
  type ProjectLoadResult,
  type ProjectSaveResult,
  type RemoteSettingsState,
  type RemoteSettingsUpdate,
  type SpotifyPlaylist,
  type SpotifyControlAction,
  type SpotifySettingsState,
  type SpotifySettingsUpdate
} from '../shared/types'
import type { TimelineCycle } from '../shared/timeline'

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke(IPC.getState),
  sendCommand: (command: PlaybackCommand): void => ipcRenderer.send(IPC.command, command),
  onStateChanged: (callback: (state: AppState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState): void => callback(state)
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.stateChanged, listener)
  },
  getDisplayBounds: (): Promise<DisplayBounds> => ipcRenderer.invoke(IPC.getDisplayBounds),
  setDisplayFullScreen: (flag: boolean): void => ipcRenderer.send(IPC.setDisplayFullScreen, flag),
  onDisplayBoundsChanged: (callback: (bounds: DisplayBounds) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, bounds: DisplayBounds): void =>
      callback(bounds)
    ipcRenderer.on(IPC.displayBoundsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.displayBoundsChanged, listener)
  },
  choosePhotos: (): Promise<number | undefined> => ipcRenderer.invoke(IPC.choosePhotos),
  addPhotoPaths: (paths: string[]): Promise<number> => ipcRenderer.invoke(IPC.addPhotoPaths, paths),
  choosePhotosFolder: (): Promise<number | undefined> => ipcRenderer.invoke(IPC.choosePhotosFolder),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  chooseMaskImage: (): Promise<void> => ipcRenderer.invoke(IPC.chooseMaskImage),
  chooseVideo: (): Promise<boolean> => ipcRenderer.invoke(IPC.chooseVideo),
  chooseAudio: (): Promise<{ name: string; filePath: string }[]> =>
    ipcRenderer.invoke(IPC.chooseAudio),
  chooseStill: (): Promise<boolean> => ipcRenderer.invoke(IPC.chooseStill),
  openExternalPlayer: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.openExternalPlayer, filePath),
  notifyMediaEnded: (activeCueId: string): void => ipcRenderer.send(IPC.mediaEnded, activeCueId),
  notifyAudioFallback: (activeCueId: string): void =>
    ipcRenderer.send(IPC.audioFallback, activeCueId),
  saveProject: (): Promise<ProjectSaveResult | undefined> => ipcRenderer.invoke(IPC.projectSave),
  loadProject: (): Promise<ProjectLoadResult | undefined> => ipcRenderer.invoke(IPC.projectLoad),
  chooseExportPath: (): Promise<string | undefined> => ipcRenderer.invoke(IPC.chooseExportPath),
  exportWriteFrame: (index: number, frame: ArrayBuffer, total: number): Promise<void> =>
    ipcRenderer.invoke(IPC.exportWriteFrame, index, frame, total),
  exportStart: (config: ExportConfig, cycles: ReadonlyArray<TimelineCycle>): Promise<void> =>
    ipcRenderer.invoke(IPC.exportStart, config, cycles),
  exportCancel: (): Promise<void> => ipcRenderer.invoke(IPC.exportCancel),
  revealExport: (outputPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.exportReveal, outputPath),
  onExportProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ExportProgress): void =>
      callback(progress)
    ipcRenderer.on(IPC.exportProgress, listener)
    return () => ipcRenderer.removeListener(IPC.exportProgress, listener)
  },
  getRemoteSettings: (): Promise<RemoteSettingsState> => ipcRenderer.invoke(IPC.getRemoteSettings),
  setRemoteSettings: (update: RemoteSettingsUpdate): Promise<RemoteSettingsState> =>
    ipcRenderer.invoke(IPC.setRemoteSettings, update),
  regenerateRemoteToken: (): Promise<RemoteSettingsState> =>
    ipcRenderer.invoke(IPC.regenerateRemoteToken),
  onRemoteSettingsChanged: (callback: (settings: RemoteSettingsState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: RemoteSettingsState): void =>
      callback(settings)
    ipcRenderer.on(IPC.remoteSettingsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.remoteSettingsChanged, listener)
  },
  getPowerSettings: (): Promise<PowerSettingsState> => ipcRenderer.invoke(IPC.getPowerSettings),
  setPowerSettings: (settings: PowerSettings): Promise<PowerSettingsState> =>
    ipcRenderer.invoke(IPC.setPowerSettings, settings),
  onPowerSettingsChanged: (callback: (settings: PowerSettingsState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: PowerSettingsState): void =>
      callback(settings)
    ipcRenderer.on(IPC.powerSettingsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.powerSettingsChanged, listener)
  },
  getSpotifySettings: (): Promise<SpotifySettingsState> =>
    ipcRenderer.invoke(IPC.getSpotifySettings),
  setSpotifySettings: (update: SpotifySettingsUpdate): Promise<SpotifySettingsState> =>
    ipcRenderer.invoke(IPC.setSpotifySettings, update),
  authorizeSpotify: (): Promise<SpotifySettingsState> => ipcRenderer.invoke(IPC.authorizeSpotify),
  deauthorizeSpotify: (): Promise<SpotifySettingsState> =>
    ipcRenderer.invoke(IPC.deauthorizeSpotify),
  getSpotifyAccessToken: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.getSpotifyAccessToken),
  getSpotifyPlaylists: (): Promise<SpotifyPlaylist[]> =>
    ipcRenderer.invoke(IPC.getSpotifyPlaylists),
  onSpotifyControl: (callback: (action: SpotifyControlAction) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: SpotifyControlAction): void =>
      callback(action)
    ipcRenderer.on(IPC.spotifyControl, listener)
    return () => ipcRenderer.removeListener(IPC.spotifyControl, listener)
  },
  onSpotifySettingsChanged: (callback: (settings: SpotifySettingsState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: SpotifySettingsState): void =>
      callback(settings)
    ipcRenderer.on(IPC.spotifySettingsChanged, listener)
    return () => ipcRenderer.removeListener(IPC.spotifySettingsChanged, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
