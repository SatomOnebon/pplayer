import type { CueBgm } from '../../../../shared/types'
import { setActiveBgmSource } from './bgmSource'

export interface SpotifyPlayerSnapshot {
  ready: boolean
  active: boolean
  paused: boolean
  trackName: string | null
  artistName: string | null
  volume: number
  errorKey: string | null
  errorParams?: Record<string, string | number>
}

const initialSnapshot: SpotifyPlayerSnapshot = {
  ready: false,
  active: false,
  paused: true,
  trackName: null,
  artistName: null,
  volume: 0.5,
  errorKey: null
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
let masterGain = 1
let activeRampToken: number | null = null
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

function reportError(key: string, params?: Record<string, string | number>): void {
  update({ errorKey: key, errorParams: params })
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
          reportError('spotify.error.authInfo')
          callback('')
        }
      })
    },
    volume: snapshot.volume * masterGain
  })
  player = nextPlayer
  actualVolume = snapshot.volume * masterGain

  nextPlayer.addListener('ready', ({ device_id }) => {
    if (player !== nextPlayer) return
    deviceId = device_id
    update({ ready: true, errorKey: null, errorParams: undefined })
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
      errorKey: null,
      errorParams: undefined
    })
  })
  nextPlayer.addListener('initialization_error', () => reportError('spotify.error.initialize'))
  nextPlayer.addListener('authentication_error', () => reportError('spotify.error.authentication'))
  nextPlayer.addListener('account_error', () => reportError('spotify.error.premiumRequired'))
  nextPlayer.addListener('playback_error', () => reportError('spotify.error.playback'))
  void nextPlayer
    .connect()
    .then((connected) => {
      if (!connected) reportError('spotify.error.connect')
    })
    .catch(() => reportError('spotify.error.connect'))
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
  update({ errorKey: null, errorParams: undefined })

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
  script.onerror = () => reportError('spotify.error.sdkLoad')
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
  actualVolume = initialSnapshot.volume * masterGain
  snapshot = initialSnapshot
  listeners.forEach((listener) => listener())
}

export async function playContext(contextUri: string, token?: number): Promise<void> {
  const accessToken = await window.api.getSpotifyAccessToken()
  if (!accessToken || !deviceId) {
    reportError('spotify.error.deviceNotReady')
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
      setActiveBgmSource('spotify')
      update({ errorKey: null, errorParams: undefined })
    }
  } catch {
    reportError('spotify.error.playlistPlay')
  }
}

export function activate(): void {
  void player?.activateElement().catch(() => undefined)
}

export function togglePlay(): void {
  run(player ? () => player!.togglePlay() : undefined, 'spotify.error.togglePlay')
}

export function nextTrack(): void {
  run(player ? () => player!.nextTrack() : undefined, 'spotify.error.nextTrack')
}

export function previousTrack(): void {
  run(player ? () => player!.previousTrack() : undefined, 'spotify.error.previousTrack')
}

export function setVolume(volume: number): void {
  const normalized = Math.min(1, Math.max(0, volume))
  fadeToken += 1
  const effectiveVolume = normalized * masterGain
  actualVolume = effectiveVolume
  update({ volume: normalized })
  run(player ? () => player!.setVolume(effectiveVolume) : undefined, 'spotify.error.volume')
}

export function setMasterGain(gain: number): void {
  masterGain = Math.min(1, Math.max(0, gain))
  if (activeRampToken !== null) return
  const effectiveVolume = snapshot.volume * masterGain
  actualVolume = effectiveVolume
  run(player ? () => player!.setVolume(effectiveVolume) : undefined, 'spotify.error.volume')
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function rampVolume(to: number, ms: number, token: number): Promise<void> {
  const activePlayer = player
  if (!activePlayer || fadeToken !== token) return
  const target = Math.min(1, Math.max(0, to))
  const from = actualVolume
  activeRampToken = token
  try {
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
  } finally {
    if (activeRampToken === token) {
      activeRampToken = null
      // フェードイン（target>0）完了後のみ、フェード中に変わった master ゲインへ収束させる。
      // フェードアウト（target===0）では 0 のまま維持する（再適用するとフルへ戻り、後続のフェードインを潰す）。
      if (target > 0 && fadeToken === token && player) {
        const effective = snapshot.volume * masterGain
        actualVolume = effective
        void player.setVolume(effective)
      }
    }
  }
}

export async function transitionToBgm(bgm: CueBgm): Promise<void> {
  if (bgm.mode === 'continue') return
  if (bgm.mode === 'play' && bgm.source !== 'spotify') return
  if (bgm.mode === 'stop' && (!player || !deviceId)) return
  if (!player) ensureStarted()
  if (!player || !deviceId) {
    reportError('spotify.error.deviceNotReadyReconnect')
    return
  }
  const token = ++fadeToken

  if (bgm.mode === 'play') {
    if (currentContextUri === bgm.uri) {
      if (snapshot.paused) {
        try {
          await player.togglePlay()
        } catch {
          reportError('spotify.error.togglePlay')
          return
        }
        if (fadeToken !== token) return
      }
      setActiveBgmSource('spotify')
      await rampVolume(snapshot.volume * masterGain, 0, token)
      return
    }
    activate()
    if (!snapshot.paused) await rampVolume(0, bgm.fadeMs, token)
    else await rampVolume(0, 0, token)
    if (fadeToken !== token) return
    await playContext(bgm.uri, token)
    if (fadeToken !== token || currentContextUri !== bgm.uri) return
    await rampVolume(snapshot.volume * masterGain, bgm.fadeMs, token)
    return
  }

  if (!snapshot.paused) await rampVolume(0, bgm.fadeMs, token)
  if (fadeToken !== token) return
  try {
    await player.pause()
  } catch {
    reportError('spotify.error.stop')
  } finally {
    if (fadeToken === token) currentContextUri = null
  }
}
