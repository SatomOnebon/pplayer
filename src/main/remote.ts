import { BrowserWindow, ipcMain } from 'electron'
import Store from 'electron-store'
import { randomBytes } from 'crypto'
import { createServer, type Server, type ServerResponse } from 'http'
import {
  IPC,
  type RemoteSettings,
  type RemoteSettingsState,
  type RemoteSettingsUpdate
} from '../shared/types'
import type { AppStateStore } from './state'
import { RemoteActions } from './remoteActions'
import {
  isAuthorizedRequest,
  parseRemoteRequestUrl,
  remoteStatus,
  routeRemoteRequest
} from './remoteRouting'
import { sendSpotifyControl } from './windows'

const DEFAULT_SETTINGS: RemoteSettings = {
  globalShortcutsEnabled: true,
  httpEnabled: false,
  port: 8722,
  token: ''
}

export class RemoteController {
  private readonly persistence = new Store<{ settings: RemoteSettings }>({
    name: 'remote',
    defaults: { settings: DEFAULT_SETTINGS }
  })
  private settings: RemoteSettings
  private listenError: string | null = null
  private failedShortcuts: string[] = []
  private server: Server | null = null
  private serverGeneration = 0
  private restartChain: Promise<void> = Promise.resolve()

  constructor(
    private readonly stateStore: AppStateStore,
    private readonly actions: RemoteActions,
    private readonly onShortcutSettingChanged: (enabled: boolean) => string[]
  ) {
    const saved = this.persistence.get('settings')
    this.settings = {
      globalShortcutsEnabled: saved.globalShortcutsEnabled !== false,
      httpEnabled: saved.httpEnabled === true,
      port: validPort(saved.port) ? saved.port : 8722,
      token: saved.token || generateToken()
    }
    this.persist()
  }

  getState(): RemoteSettingsState {
    return {
      ...this.settings,
      listenError: this.listenError,
      failedShortcuts: this.failedShortcuts
    }
  }

  start(): void {
    this.failedShortcuts = this.onShortcutSettingChanged(this.settings.globalShortcutsEnabled)
    this.restartServer()
  }

  update(update: RemoteSettingsUpdate): RemoteSettingsState {
    if (typeof update.globalShortcutsEnabled === 'boolean') {
      this.settings.globalShortcutsEnabled = update.globalShortcutsEnabled
      this.failedShortcuts = this.onShortcutSettingChanged(update.globalShortcutsEnabled)
    }
    if (typeof update.httpEnabled === 'boolean') this.settings.httpEnabled = update.httpEnabled
    if (update.port !== undefined && validPort(update.port)) this.settings.port = update.port
    this.persist()
    this.restartServer()
    this.broadcast()
    return this.getState()
  }

  regenerateToken(): RemoteSettingsState {
    this.settings.token = generateToken()
    this.persist()
    this.broadcast()
    return this.getState()
  }

  stop(): void {
    const generation = ++this.serverGeneration
    this.restartChain = this.restartChain
      .then(() => this.stopServer(generation))
      .catch((error: unknown) => console.warn('HTTP API の停止に失敗しました', error))
  }

  private restartServer(): void {
    const generation = ++this.serverGeneration
    this.restartChain = this.restartChain
      .then(() => this.performRestart(generation))
      .catch((error: unknown) => {
        if (generation !== this.serverGeneration) return
        this.listenError = `HTTP API の再起動に失敗しました: ${errorMessage(error)}`
        console.warn(this.listenError)
        this.broadcast()
      })
  }

  private async performRestart(generation: number): Promise<void> {
    await this.closeCurrentServer()
    if (generation !== this.serverGeneration) return
    this.listenError = null
    if (!this.settings.httpEnabled) return
    const server = createServer((request, response) => {
      this.handleRequest(request.method, request.url, request.headers.authorization, response)
    })
    this.server = server
    server.once('error', (error) => {
      if (this.server !== server || generation !== this.serverGeneration) return
      this.server = null
      this.listenError = `HTTP API を開始できません: ${error.message}`
      console.warn(this.listenError)
      this.broadcast()
    })
    server.listen(this.settings.port, '127.0.0.1', () => {
      if (this.server !== server) return
      this.listenError = null
      this.broadcast()
    })
  }

  private async stopServer(generation: number): Promise<void> {
    await this.closeCurrentServer()
    if (generation === this.serverGeneration) this.listenError = null
  }

  private async closeCurrentServer(): Promise<void> {
    const server = this.server
    if (!server) return
    await new Promise<void>((resolve) => {
      try {
        server.close(() => resolve())
      } catch {
        resolve()
      }
    })
    if (this.server === server) this.server = null
  }

  private handleRequest(
    method: string | undefined,
    requestUrl: string | undefined,
    authorization: string | undefined,
    response: ServerResponse
  ): void {
    try {
      if (method !== 'GET' && method !== 'POST') {
        sendJson(response, 405, { ok: false, error: 'GET または POST を使用してください' })
        return
      }
      const url = parseRemoteRequestUrl(requestUrl, this.settings.port)
      if (!url) {
        sendJson(response, 400, { ok: false, error: 'リクエスト URL が不正です' })
        return
      }
      if (!isAuthorizedRequest(this.settings.token, authorization, url)) {
        sendJson(response, 401, { ok: false, error: '認証に失敗しました' })
        return
      }
      const route = routeRemoteRequest(url, this.stateStore.getState())
      if (route.type === 'notFound') {
        sendJson(response, 404, { ok: false, error: route.error })
        return
      }
      if (route.type === 'badRequest') {
        sendJson(response, 400, { ok: false, error: route.error })
        return
      }
      if (route.type === 'status') {
        sendJson(response, 200, remoteStatus(this.stateStore.getState()))
        return
      }
      if (route.type === 'spotify') {
        sendSpotifyControl(route.action)
        sendJson(response, 200, { ok: true })
        return
      }
      this.actions.apply(route.command, url.pathname === '/api/volume/mute')
      sendJson(response, 200, { ok: true })
    } catch {
      try {
        sendJson(response, 500, { ok: false, error: 'サーバ内部エラー' })
      } catch {
        // 切断済みソケットへの書き込み失敗はリクエスト内に閉じ込める。
      }
    }
  }

  private persist(): void {
    this.persistence.set('settings', this.settings)
  }

  private broadcast(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC.remoteSettingsChanged, this.getState())
      }
    }
  }
}

export function registerRemoteIpc(controller: RemoteController): void {
  ipcMain.handle(IPC.getRemoteSettings, () => controller.getState())
  ipcMain.handle(IPC.setRemoteSettings, (_event, update: unknown) => {
    if (!isRemoteSettingsUpdate(update)) return controller.getState()
    return controller.update(update)
  })
  ipcMain.handle(IPC.regenerateRemoteToken, () => controller.regenerateToken())
}

function generateToken(): string {
  return randomBytes(24).toString('hex')
}

function validPort(port: unknown): port is number {
  return Number.isInteger(port) && Number(port) >= 1 && Number(port) <= 65535
}

function isRemoteSettingsUpdate(value: unknown): value is RemoteSettingsUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const update = value as Record<string, unknown>
  return (
    (update.globalShortcutsEnabled === undefined ||
      typeof update.globalShortcutsEnabled === 'boolean') &&
    (update.httpEnabled === undefined || typeof update.httpEnabled === 'boolean') &&
    (update.port === undefined || validPort(update.port))
  )
}

function sendJson(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
