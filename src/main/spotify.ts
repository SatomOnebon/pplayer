import { BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import Store from 'electron-store'
import { createHash, randomBytes } from 'crypto'
import { createServer, type Server, type ServerResponse } from 'http'
import {
  IPC,
  type SpotifyPlaylist,
  type SpotifySettings,
  type SpotifySettingsState,
  type SpotifySettingsUpdate
} from '../shared/types'

const PORT = 8723
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`
const SCOPES =
  'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative'
const AUTH_TIMEOUT_MS = 5 * 60 * 1000

interface SpotifyStore {
  settings: SpotifySettings
  auth: { refreshToken: string | null }
}

interface TokenResponse {
  accessToken: string
  expiresIn: number
  refreshToken: string | null
}

export class SpotifyController {
  private readonly persistence = new Store<SpotifyStore>({
    name: 'spotify',
    defaults: {
      settings: { lastPlaylistUri: null, clientId: '' },
      auth: { refreshToken: null }
    }
  })
  private settings: SpotifySettings
  private refreshToken: string | null
  private accessCache: { token: string; expiresAt: number } | null = null
  private refreshInFlight: Promise<string | null> | null = null
  private authorizing = false
  private error: string | null = null
  private pkceVerifier: string | null = null
  private authState: string | null = null
  private authServer: Server | null = null
  private authTimeout: ReturnType<typeof setTimeout> | null = null

  constructor() {
    const saved = this.persistence.get('settings')
    this.settings = {
      lastPlaylistUri:
        typeof saved.lastPlaylistUri === 'string' || saved.lastPlaylistUri === null
          ? saved.lastPlaylistUri
          : null,
      clientId: typeof saved.clientId === 'string' ? saved.clientId : ''
    }
    this.refreshToken = null
    this.persistSettings()
  }

  getState(): SpotifySettingsState {
    return {
      ...this.settings,
      connected: this.refreshToken !== null,
      authorizing: this.authorizing,
      error: this.error
    }
  }

  update(update: SpotifySettingsUpdate): SpotifySettingsState {
    if (typeof update.lastPlaylistUri === 'string' || update.lastPlaylistUri === null) {
      this.settings.lastPlaylistUri = update.lastPlaylistUri
    }
    if (typeof update.clientId === 'string' && update.clientId !== this.settings.clientId) {
      this.settings.clientId = update.clientId
      this.refreshToken = null
      this.accessCache = null
      this.persistAuth()
    }
    this.persistSettings()
    this.broadcast()
    return this.getState()
  }

  start(): void {
    this.refreshToken = this.restoreRefreshToken()
    this.broadcast()
  }

  stop(): void {
    this.clearAuthorizationResources()
    this.authorizing = false
  }

  async authorize(): Promise<SpotifySettingsState> {
    if (!this.settings.clientId) {
      this.error = 'Spotify の Client ID を設定してください'
      this.broadcast()
      return this.getState()
    }
    if (this.authorizing) return this.getState()

    this.authorizing = true
    this.error = null
    this.broadcast()
    await this.closeAuthServer()

    const verifier = base64Url(randomBytes(48))
    this.pkceVerifier = verifier
    this.authState = base64Url(randomBytes(16))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())

    try {
      await this.startAuthServer()
      this.authTimeout = setTimeout(() => {
        this.failAuthorization('認可がタイムアウトしました')
      }, AUTH_TIMEOUT_MS)

      const authUrl =
        'https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
          client_id: this.settings.clientId,
          response_type: 'code',
          redirect_uri: REDIRECT_URI,
          code_challenge_method: 'S256',
          code_challenge: challenge,
          scope: SCOPES,
          state: this.authState
        }).toString()
      await shell.openExternal(authUrl)
    } catch (error: unknown) {
      console.warn('Spotify 認可を開始できませんでした', error)
      this.failAuthorization('Spotify 認可を開始できませんでした')
    }

    return this.getState()
  }

  async deauthorize(): Promise<SpotifySettingsState> {
    this.clearAuthorizationResources()
    this.authorizing = false
    this.refreshToken = null
    this.accessCache = null
    this.error = null
    this.persistAuth()
    this.broadcast()
    return this.getState()
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.refreshToken) return null
    if (this.accessCache && this.accessCache.expiresAt - Date.now() > 60_000) {
      return this.accessCache.token
    }
    if (this.refreshInFlight) return this.refreshInFlight

    const refresh = this.performRefresh()
    this.refreshInFlight = refresh
    try {
      return await refresh
    } finally {
      if (this.refreshInFlight === refresh) this.refreshInFlight = null
    }
  }

  private async performRefresh(): Promise<string | null> {
    if (!this.refreshToken) return null

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.settings.clientId
        })
      })
      const body: unknown = await response.json()
      const token = parseTokenResponse(body)
      if (!response.ok || !token) {
        console.warn('Spotify アクセストークンの更新に失敗しました', response.status)
        if (response.status === 400 && parseOAuthError(body) === 'invalid_grant') {
          this.disconnectAfterTokenFailure()
        }
        return null
      }
      this.setAccessToken(token)
      return token.accessToken
    } catch (error: unknown) {
      console.warn('Spotify アクセストークンの更新に失敗しました', error)
      return null
    }
  }

  async getPlaylists(): Promise<SpotifyPlaylist[]> {
    const token = await this.getAccessToken()
    if (!token) return []

    try {
      const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) return []
      return parsePlaylists(await response.json())
    } catch {
      return []
    }
  }

  private async startAuthServer(): Promise<void> {
    const server = createServer((request, response) => {
      void this.handleAuthRequest(request.url, response)
    })
    this.authServer = server
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(PORT, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
  }

  private async handleAuthRequest(
    requestUrl: string | undefined,
    response: ServerResponse
  ): Promise<void> {
    const url = new URL(requestUrl ?? '/', `http://127.0.0.1:${PORT}`)
    if (url.pathname !== '/callback') {
      response.writeHead(404)
      response.end('not found')
      return
    }

    const oauthError = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (oauthError || !code || !this.pkceVerifier || !this.authState || state !== this.authState) {
      sendHtml(response, 'Spotify 認証に失敗しました。アプリに戻ってください。')
      this.failAuthorization('Spotify 認証がキャンセルされたか、認可コードを取得できませんでした')
      return
    }

    try {
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: this.settings.clientId,
          code_verifier: this.pkceVerifier
        })
      })
      const body: unknown = await tokenResponse.json()
      const token = parseTokenResponse(body)
      if (!tokenResponse.ok || !token || !token.refreshToken) {
        throw new Error(`token endpoint: ${tokenResponse.status}`)
      }
      this.refreshToken = token.refreshToken
      this.setAccessToken(token)
      this.authorizing = false
      this.error = null
      // persistAuth は safeStorage 不可時に this.error を立てる（M4）。error=null の後に呼ぶ。
      this.persistAuth()
      this.clearAuthorizationResources()
      this.broadcast()
      sendHtml(response, '認証が完了しました。アプリに戻ってください。')
    } catch (error: unknown) {
      console.warn('Spotify トークン交換に失敗しました', error)
      sendHtml(response, 'Spotify 認証に失敗しました。アプリに戻ってください。')
      this.failAuthorization('Spotify のトークン交換に失敗しました')
    }
  }

  private setAccessToken(token: TokenResponse): void {
    this.accessCache = {
      token: token.accessToken,
      expiresAt: Date.now() + token.expiresIn * 1000
    }
    if (token.refreshToken && token.refreshToken !== this.refreshToken) {
      this.refreshToken = token.refreshToken
      this.persistAuth()
    }
  }

  private disconnectAfterTokenFailure(): void {
    this.refreshToken = null
    this.accessCache = null
    this.persistAuth()
    this.broadcast()
  }

  private restoreRefreshToken(): string | null {
    const encrypted = this.persistence.get('auth').refreshToken
    if (!encrypted) return null
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('暗号化ストレージを利用できないため Spotify 認証情報を復元できません')
      return null
    }
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch (error: unknown) {
      console.warn('Spotify 認証情報の復号に失敗しました', error)
      return null
    }
  }

  private persistSettings(): void {
    this.persistence.set('settings', this.settings)
  }

  private persistAuth(): void {
    if (!this.refreshToken) {
      this.persistence.set('auth', { refreshToken: null })
      return
    }
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('暗号化ストレージを利用できないため Spotify 認証情報を保存しません')
      this.error =
        '認証は成功しましたが、この環境では暗号化保存できないため再起動後に連携が無効になります'
      return
    }
    try {
      const encrypted = safeStorage.encryptString(this.refreshToken).toString('base64')
      this.persistence.set('auth', { refreshToken: encrypted })
    } catch (error: unknown) {
      console.warn('Spotify 認証情報の保存に失敗しました', error)
    }
  }

  private broadcast(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC.spotifySettingsChanged, this.getState())
      }
    }
  }

  private failAuthorization(message: string): void {
    this.authorizing = false
    this.error = message
    this.clearAuthorizationResources()
    this.broadcast()
  }

  private clearAuthorizationResources(): void {
    if (this.authTimeout) clearTimeout(this.authTimeout)
    this.authTimeout = null
    this.pkceVerifier = null
    this.authState = null
    void this.closeAuthServer()
  }

  private async closeAuthServer(): Promise<void> {
    const server = this.authServer
    if (!server) return
    this.authServer = null
    await new Promise<void>((resolve) => {
      try {
        server.close(() => resolve())
      } catch {
        resolve()
      }
    })
  }
}

export function registerSpotifyIpc(controller: SpotifyController): void {
  ipcMain.handle(IPC.getSpotifySettings, () => controller.getState())
  ipcMain.handle(IPC.setSpotifySettings, (_event, update: unknown) =>
    isSpotifySettingsUpdate(update) ? controller.update(update) : controller.getState()
  )
  ipcMain.handle(IPC.authorizeSpotify, () => controller.authorize())
  ipcMain.handle(IPC.deauthorizeSpotify, () => controller.deauthorize())
  ipcMain.handle(IPC.getSpotifyAccessToken, () => controller.getAccessToken())
  ipcMain.handle(IPC.getSpotifyPlaylists, () => controller.getPlaylists())
}

function isSpotifySettingsUpdate(value: unknown): value is SpotifySettingsUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const update = value as Record<string, unknown>
  return (
    (update.lastPlaylistUri === undefined ||
      update.lastPlaylistUri === null ||
      typeof update.lastPlaylistUri === 'string') &&
    (update.clientId === undefined || typeof update.clientId === 'string')
  )
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function parseTokenResponse(value: unknown): TokenResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const token = value as Record<string, unknown>
  if (
    typeof token.access_token !== 'string' ||
    typeof token.expires_in !== 'number' ||
    !Number.isFinite(token.expires_in)
  ) {
    return null
  }
  return {
    accessToken: token.access_token,
    expiresIn: token.expires_in,
    refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : null
  }
}

function parseOAuthError(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const error = (value as Record<string, unknown>).error
  return typeof error === 'string' ? error : null
}

function parsePlaylists(value: unknown): SpotifyPlaylist[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const items = (value as Record<string, unknown>).items
  if (!Array.isArray(items)) return []

  const playlists: SpotifyPlaylist[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const playlist = item as Record<string, unknown>
    if (typeof playlist.uri !== 'string' || typeof playlist.name !== 'string') continue
    const images = Array.isArray(playlist.images) ? playlist.images : []
    const firstImage = images[0]
    const image =
      typeof firstImage === 'object' &&
      firstImage !== null &&
      !Array.isArray(firstImage) &&
      typeof (firstImage as Record<string, unknown>).url === 'string'
        ? ((firstImage as Record<string, unknown>).url as string)
        : null
    playlists.push({ uri: playlist.uri, name: playlist.name, image })
  }
  return playlists
}

function sendHtml(response: ServerResponse, message: string): void {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(`<h1>${message}</h1>`)
}
