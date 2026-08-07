import {
  app,
  BrowserWindow,
  components,
  dialog,
  ipcMain,
  nativeImage,
  net,
  protocol,
  shell
} from 'electron'
import { createReadStream } from 'fs'
import { readdir, realpath, stat } from 'fs/promises'
import { Readable } from 'stream'
import { basename, extname, isAbsolute, join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindows, getDisplayBounds, setDisplayFullScreen } from './windows'
import { AppStateStore } from './state'
import { parseMediaUrl, parseThumbSize } from '../shared/mediaUrl'
import { IPC, type PhotoItem } from '../shared/types'
import { getEditingSlideshow } from '../shared/migration'
import { registerExportIpc } from './export'
import { registerProjectIpc } from './project'
import { isPlaybackCommand } from './validation'
import { parseByteRange } from '../shared/byteRange'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './globalShortcuts'
import { RemoteActions } from './remoteActions'
import { registerRemoteIpc, RemoteController } from './remote'
import { PowerBlockerController, registerPowerIpc } from './powerBlocker'
import { registerSpotifyIpc, SpotifyController } from './spotify'
import { LanguageController, mt, registerLanguageIpc } from './language'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

const languageController = new LanguageController()
const stateStore = new AppStateStore()
const remoteActions = new RemoteActions(stateStore)
const remoteController = new RemoteController(stateStore, remoteActions, (enabled) => {
  if (enabled) return registerGlobalShortcuts(stateStore, remoteActions)
  unregisterGlobalShortcuts()
  return []
})
const powerBlocker = new PowerBlockerController()
const spotifyController = new SpotifyController()
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])
const THUMBNAIL_CACHE_LIMIT = 300
const thumbnailCache = new Map<string, Buffer>()

function cacheThumbnail(key: string, buffer: Buffer): void {
  thumbnailCache.delete(key)
  thumbnailCache.set(key, buffer)
  if (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    const oldestKey = thumbnailCache.keys().next().value
    if (oldestKey !== undefined) thumbnailCache.delete(oldestKey)
  }
}

async function createThumbnail(filePath: string, size: number): Promise<Buffer | null> {
  // サムネイル生成は画像（写真・静止画）専用。動画・音声に対して
  // nativeImage.createThumbnailFromPath を呼ぶと、大きな動画などで
  // メインプロセスがネイティブクラッシュする（例: 数GB の mp4）。
  // 動画キューはフォールバックラベル（「動画」）を表示するため問題ない。
  if (!isPhotoPath(filePath)) return null

  const fileStat = await stat(filePath)
  const cacheKey = `${filePath}|${size}|${fileStat.mtimeMs}`
  const cached = thumbnailCache.get(cacheKey)
  if (cached) {
    thumbnailCache.delete(cacheKey)
    thumbnailCache.set(cacheKey, cached)
    return cached
  }

  const source = nativeImage.createFromPath(filePath)
  if (!source.isEmpty()) {
    const { width, height } = source.getSize()
    const resized =
      width >= height
        ? source.resize({ width: size, quality: 'good' })
        : source.resize({ height: size, quality: 'good' })
    const buffer = resized.toPNG()
    cacheThumbnail(cacheKey, buffer)
    return buffer
  }

  try {
    const thumbnail = await nativeImage.createThumbnailFromPath(filePath, {
      width: size,
      height: size
    })
    if (!thumbnail.isEmpty()) {
      const buffer = thumbnail.toPNG()
      cacheThumbnail(cacheKey, buffer)
      return buffer
    }
  } catch {
    // Some image formats or platforms do not support the native thumbnail path.
  }

  return null
}

function isPhotoPath(filePath: string): boolean {
  return PHOTO_EXTENSIONS.has(extname(filePath).toLocaleLowerCase())
}

function mediaContentType(filePath: string): string {
  switch (extname(filePath).toLocaleLowerCase()) {
    case '.mp4':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
    case '.aac':
      return 'audio/mp4'
    case '.wav':
      return 'audio/wav'
    case '.flac':
      return 'audio/flac'
    case '.ogg':
    case '.opus':
      return 'audio/ogg'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

async function collectPhotosFromDirectory(
  dirPath: string,
  visited: Set<string>,
  collected: string[]
): Promise<void> {
  let resolvedDir: string
  try {
    resolvedDir = await realpath(dirPath)
  } catch {
    return
  }
  if (visited.has(resolvedDir)) return
  visited.add(resolvedDir)

  let entries
  try {
    entries = await readdir(resolvedDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const entryPath = join(resolvedDir, entry.name)
    try {
      const entryStat = await stat(entryPath)
      if (entryStat.isFile() && isPhotoPath(entry.name)) {
        collected.push(entryPath)
      } else if (entryStat.isDirectory()) {
        await collectPhotosFromDirectory(entryPath, visited, collected)
      }
    } catch {
      // Unreadable entries are skipped without failing the whole import.
    }
  }
}

async function expandPhotoPaths(paths: string[]): Promise<string[]> {
  const expanded: string[] = []
  const visited = new Set<string>()

  for (const candidatePath of paths) {
    try {
      const candidateStat = await stat(candidatePath)
      if (candidateStat.isFile() && isPhotoPath(candidatePath)) {
        expanded.push(candidatePath)
      } else if (candidateStat.isDirectory()) {
        await collectPhotosFromDirectory(candidatePath, visited, expanded)
      }
    } catch {
      // A dropped path can disappear before the main process inspects it.
    }
  }

  return expanded.sort((left, right) => {
    const byName = basename(left).localeCompare(basename(right), undefined, { numeric: true })
    return byName || left.localeCompare(right, undefined, { numeric: true })
  })
}

async function addPhotoPaths(paths: string[]): Promise<number> {
  const existing = getEditingSlideshow(stateStore.getState())?.photos ?? []
  const knownPaths = new Set(existing.map((photo) => photo.filePath))
  const additions: PhotoItem[] = []

  for (const filePath of await expandPhotoPaths(paths)) {
    if (knownPaths.has(filePath)) continue
    knownPaths.add(filePath)
    additions.push({
      id: crypto.randomUUID(),
      filePath,
      fileName: basename(filePath),
      excluded: false,
      fit: null,
      fadeInMs: null,
      holdMs: null,
      fadeOutMs: null
    })
  }

  if (additions.length > 0) {
    stateStore.apply({ type: 'setPhotos', photos: [...existing, ...additions] })
  }
  return additions.length
}

function registerProtocol(): void {
  protocol.handle('media', async (request) => {
    const filePath = parseMediaUrl(request.url)
    if (filePath === null) {
      return new Response('Bad request', { status: 400 })
    }
    if (!stateStore.getAllowedMediaPaths().has(filePath)) {
      return new Response('Forbidden', { status: 403 })
    }
    const requestedThumbSize = parseThumbSize(request.url)
    if (requestedThumbSize !== null) {
      const size = Math.min(requestedThumbSize, 2048)
      try {
        const thumbnail = await createThumbnail(filePath, size)
        if (thumbnail) {
          return new Response(new Uint8Array(thumbnail), {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'image/png'
            }
          })
        }
      } catch {
        // Ignore thumbnail failures and fall through to the 404 below.
      }
      // サムネイル要求（?thumb）で生成できない素材（動画・音声・巨大ファイル等）は、
      // 元ファイル全体を返すと <img> に読み込んだレンダラーがクラッシュする。
      // 404 を返して <img> の onError → フォールバックラベル表示に委ねる。
      return new Response(null, {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' }
      })
    }
    const fileStat = await stat(filePath)
    const range = parseByteRange(request.headers.get('range'), fileStat.size)
    if (range.type === 'invalid') {
      return new Response(null, {
        status: 416,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${fileStat.size}`
        }
      })
    }
    if (range.type === 'range') {
      const stream = createReadStream(filePath, { start: range.start, end: range.end })
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes',
          'Content-Range': range.contentRange,
          'Content-Length': String(range.length),
          'Content-Type': mediaContentType(filePath)
        }
      })
    }

    const response = await net.fetch(pathToFileURL(filePath).toString())
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Accept-Ranges', 'bytes')
    return new Response(response.body, { status: response.status, headers })
  })
}

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => stateStore.getState())
  ipcMain.handle(IPC.getDisplayBounds, () => getDisplayBounds())
  ipcMain.on(IPC.setDisplayFullScreen, (_event, flag: unknown) => {
    if (typeof flag === 'boolean') setDisplayFullScreen(flag)
  })
  ipcMain.on(IPC.command, (_event, command: unknown) => {
    if (!isPlaybackCommand(command)) {
      console.warn('不正な PlaybackCommand を無視しました')
      return
    }
    stateStore.apply(command)
  })

  ipcMain.handle(IPC.choosePhotos, async () => {
    const result = await dialog.showOpenDialog({
      title: mt('dialog.choosePhotos'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: mt('dialog.filter.image'), extensions: ['jpg', 'jpeg', 'png'] }]
    })
    if (result.canceled) return undefined
    return addPhotoPaths(result.filePaths)
  })

  ipcMain.handle(IPC.addPhotoPaths, (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return 0
    return addPhotoPaths(
      paths.filter((candidate): candidate is string => {
        return typeof candidate === 'string' && isAbsolute(candidate)
      })
    )
  })

  ipcMain.handle(IPC.choosePhotosFolder, async () => {
    const result = await dialog.showOpenDialog({
      title: mt('dialog.choosePhotosFolder'),
      properties: ['openDirectory']
    })
    if (result.canceled) return undefined
    return addPhotoPaths(result.filePaths)
  })

  ipcMain.handle(IPC.chooseMaskImage, async () => {
    const result = await dialog.showOpenDialog({
      title: mt('dialog.chooseMaskImage'),
      properties: ['openFile'],
      filters: [{ name: mt('dialog.filter.pngImage'), extensions: ['png'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return
    stateStore.apply({
      type: 'setMask',
      mask: { ...stateStore.getState().mask, mode: 'image', imagePath: result.filePaths[0] }
    })
  })

  ipcMain.handle(IPC.chooseVideo, async () => {
    const result = await dialog.showOpenDialog({
      title: mt('dialog.chooseVideo'),
      properties: ['openFile'],
      filters: [{ name: mt('dialog.filter.video'), extensions: ['mp4', 'mov'] }]
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return false
    const name = basename(filePath, extname(filePath))
    stateStore.apply({ type: 'addVideoMaterial', name, filePath, volume: 1 })
    return true
  })

  ipcMain.handle(IPC.chooseAudio, async () => {
    const result = await dialog.showOpenDialog({
      title: mt('dialog.chooseAudio'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: mt('dialog.filter.audio'),
          extensions: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus']
        }
      ]
    })
    if (result.canceled) return []
    return result.filePaths.map((filePath) => ({
      name: basename(filePath, extname(filePath)),
      filePath
    }))
  })

  ipcMain.handle(IPC.chooseStill, async () => {
    const result = await dialog.showOpenDialog({
      title: mt('dialog.chooseStill'),
      properties: ['openFile'],
      filters: [{ name: mt('dialog.filter.image'), extensions: ['jpg', 'jpeg', 'png'] }]
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return false
    stateStore.apply({
      type: 'addStillMaterial',
      name: basename(filePath, extname(filePath)),
      filePath
    })
    return true
  })

  ipcMain.handle(IPC.openExternalPlayer, async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') return 'invalid path'
    if (!stateStore.getAllowedMediaPaths().has(filePath)) return 'not allowed'
    return shell.openPath(filePath)
  })

  ipcMain.on(IPC.mediaEnded, (_event, activeCueId: unknown) => {
    if (typeof activeCueId === 'string') stateStore.handleMediaEnded(activeCueId)
  })

  ipcMain.on(IPC.audioFallback, (_event, activeCueId: unknown) => {
    if (typeof activeCueId === 'string') stateStore.handleAudioFallback(activeCueId)
  })

  ipcMain.handle(IPC.chooseExportPath, async (_event, ...args: unknown[]) => {
    if (args.length > 0) return undefined
    const result = await dialog.showSaveDialog({
      title: mt('dialog.chooseExportPath'),
      defaultPath: 'slideshow.mp4',
      filters: [{ name: mt('dialog.filter.mp4Video'), extensions: ['mp4'] }]
    })
    return result.canceled ? undefined : result.filePath
  })

  registerProjectIpc(stateStore)
  registerExportIpc()
  registerRemoteIpc(remoteController)
  registerPowerIpc(powerBlocker)
  registerSpotifyIpc(spotifyController)
  registerLanguageIpc(languageController)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.onelab.pplayer')
  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  registerProtocol()
  registerIpc()
  try {
    await components.whenReady()
  } catch (error: unknown) {
    console.warn('Widevine components 準備失敗', error)
  }
  powerBlocker.start()
  languageController.start()
  createWindows()
  remoteController.start()
  spotifyController.start()

  app.on('activate', () => {
    if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length === 0) createWindows()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  remoteController.stop()
  powerBlocker.stop()
  spotifyController.stop()
  unregisterGlobalShortcuts()
})
