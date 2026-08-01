import type { CueBgm } from '../../../../shared/types'

export interface SpotifyPlayerSnapshot {
  ready: boolean
  active: boolean
  paused: boolean
  trackName: string | null
  artistName: string | null
  volume: number
  error: string | null
}

const initialSnapshot: SpotifyPlayerSnapshot = {
  ready: false,
  active: false,
  paused: true,
  trackName: null,
  artistName: null,
  volume: 0.5,
  error: null
}

let snapshot = initialSnapshot
let player: SpotifyWebPlaybackPlayer | null = null
let deviceId: string | null = null
let started = false
let generation = 0
let scriptRequested = false
let currentContextUri: string | null = null
let fadeToken = 0
let actualVolume = initialSnapshot.volume
const listeners = new Set<() => void>()

function update(changes: Partial<SpotifyPlayerSnapshot>): void {
  const next = { ...snapshot, ...changes }
  if (
    (Object.keys(next) as Array<keyof SpotifyPlayerSnapshot>).every(
      (key) => next[key] === snapshot[key]
    )
  ) {
    return
  }
  snapshot = next
  listeners.forEach((listener) => listener())
}

function reportError(message: string): void {
  update({ error: message })
}

function run(command: (() => Promise<void>) | undefined, message: string): void {
  if (!command) return
  void command().catch(() => reportError(message))
}

function createPlayer(expectedGeneration: number): void {
  if (!started || expectedGeneration !== generation || player || !window.Spotify) return

  const nextPlayer = new window.Spotify.Player({
    name: 'pplayer',
    getOAuthToken: (callback) => {
      void window.api.getSpotifyAccessToken().then((token) => {
        if (token) callback(token)
        else {
          reportError('Spotify の認証情報を取得できませんでした')
          callback('')
        }
      })
    },
    volume: snapshot.volume
  })
  player = nextPlayer

  nextPlayer.addListener('ready', ({ device_id }) => {
    if (player !== nextPlayer) return
    deviceId = device_id
    update({ ready: true, error: null })
  })
  nextPlayer.addListener('not_ready', ({ device_id }) => {
    if (player !== nextPlayer || deviceId !== device_id) return
    deviceId = null
    update({ ready: false, active: false })
  })
  nextPlayer.addListener('player_state_changed', (state) => {
    if (player !== nextPlayer) return
    if (!state) {
      update({ active: false })
      return
    }
    const track = state.track_window.current_track
    update({
      active: !state.loading,
      paused: state.paused,
      trackName: track.name,
      artistName: track.artists.map((artist) => artist.name).join(', '),
      error: null
    })
  })
  nextPlayer.addListener('initialization_error', () =>
    reportError('Spotify プレイヤーを初期化できませんでした')
  )
  nextPlayer.addListener('authentication_error', () =>
    reportError('Spotify の認証に失敗しました。再度連携してください')
  )
  nextPlayer.addListener('account_error', () => reportError('Premium アカウントが必要です'))
  nextPlayer.addListener('playback_error', () =>
    reportError('Spotify の再生中にエラーが発生しました')
  )
  void nextPlayer
    .connect()
    .then((connected) => {
      if (!connected) reportError('Spotify プレイヤーに接続できませんでした')
    })
    .catch(() => reportError('Spotify プレイヤーに接続できませんでした'))
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): SpotifyPlayerSnapshot {
  return snapshot
}

export function ensureStarted(): void {
  if (started) return
  started = true
  const expectedGeneration = ++generation
  update({ error: null })

  if (window.Spotify) {
    createPlayer(expectedGeneration)
    return
  }
  window.onSpotifyWebPlaybackSDKReady = () => createPlayer(expectedGeneration)
  if (scriptRequested) return
  scriptRequested = true
  const script = document.createElement('script')
  script.src = 'https://sdk.scdn.co/spotify-player.js'
  script.async = true
  script.onerror = () => reportError('Spotify SDK を読み込めませんでした')
  document.head.appendChild(script)
}

export function stopPlayer(): void {
  started = false
  generation += 1
  player?.disconnect()
  player = null
  deviceId = null
  currentContextUri = null
  fadeToken += 1
  actualVolume = initialSnapshot.volume
  snapshot = initialSnapshot
  listeners.forEach((listener) => listener())
}

export async function playContext(contextUri: string, token?: number): Promise<void> {
  const accessToken = await window.api.getSpotifyAccessToken()
  if (!accessToken || !deviceId) {
    reportError('Spotify デバイスの準備が完了していません')
    return
  }
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ context_uri: contextUri })
      }
    )
    if (!response.ok) throw new Error(String(response.status))
    if (token === undefined || token === fadeToken) {
      currentContextUri = contextUri
      update({ error: null })
    }
  } catch {
    reportError('選択したプレイリストを再生できませんでした')
  }
}

export function activate(): void {
  void player?.activateElement().catch(() => undefined)
}

export function togglePlay(): void {
  run(player ? () => player!.togglePlay() : undefined, '再生状態を変更できませんでした')
}

export function nextTrack(): void {
  run(player ? () => player!.nextTrack() : undefined, '次の曲へ移動できませんでした')
}

export function previousTrack(): void {
  run(player ? () => player!.previousTrack() : undefined, '前の曲へ移動できませんでした')
}

export function setVolume(volume: number): void {
  const normalized = Math.min(1, Math.max(0, volume))
  fadeToken += 1
  actualVolume = normalized
  update({ volume: normalized })
  run(player ? () => player!.setVolume(normalized) : undefined, '音量を変更できませんでした')
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function rampVolume(to: number, ms: number, token: number): Promise<void> {
  const activePlayer = player
  if (!activePlayer || fadeToken !== token) return
  const target = Math.min(1, Math.max(0, to))
  const from = actualVolume
  if (ms <= 0) {
    await activePlayer.setVolume(target)
    if (fadeToken === token) actualVolume = target
    return
  }

  const startedAt = performance.now()
  while (fadeToken === token) {
    const progress = Math.min(1, (performance.now() - startedAt) / ms)
    const volume = from + (target - from) * progress
    await activePlayer.setVolume(volume)
    if (fadeToken !== token) return
    actualVolume = volume
    if (progress >= 1) return
    await wait(Math.min(50, ms))
  }
}

export async function transitionToBgm(bgm: CueBgm): Promise<void> {
  if (bgm.mode === 'continue') return
  if (!player) ensureStarted()
  if (!player || !deviceId) {
    reportError('Spotify デバイスの準備が完了していません（連携状態を確認してください）')
    return
  }
  const token = ++fadeToken

  if (bgm.mode === 'play') {
    if (currentContextUri === bgm.uri) {
      if (snapshot.paused) {
        try {
          await player.togglePlay()
        } catch {
          reportError('再生状態を変更できませんでした')
          return
        }
        if (fadeToken !== token) return
      }
      await rampVolume(snapshot.volume, 0, token)
      return
    }
    activate()
    if (!snapshot.paused) await rampVolume(0, bgm.fadeMs, token)
    else await rampVolume(0, 0, token)
    if (fadeToken !== token) return
    await playContext(bgm.uri, token)
    if (fadeToken !== token || currentContextUri !== bgm.uri) return
    await rampVolume(snapshot.volume, bgm.fadeMs, token)
    return
  }

  if (!snapshot.paused) await rampVolume(0, bgm.fadeMs, token)
  if (fadeToken !== token) return
  try {
    await player.pause()
  } catch {
    reportError('Spotify の再生を停止できませんでした')
  } finally {
    if (fadeToken === token) currentContextUri = null
  }
}
