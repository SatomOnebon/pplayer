import { timingSafeEqual } from 'node:crypto'
import type { AppState, PlaybackCommand, SpotifyControlAction } from '../shared/types'
import { mt } from './language'

export type RemoteRoute =
  | { type: 'command'; command: PlaybackCommand }
  | { type: 'spotify'; action: SpotifyControlAction }
  | { type: 'status' }
  | { type: 'notFound'; error: string }
  | { type: 'badRequest'; error: string }

export function tokenFromRequest(authorization: string | undefined, url: URL): string | null {
  const match = authorization?.match(/^Bearer (.+)$/i)
  return match?.[1] ?? url.searchParams.get('token')
}

export function parseRemoteRequestUrl(requestUrl: string | undefined, port: number): URL | null {
  try {
    return new URL(requestUrl ?? '/', `http://127.0.0.1:${port}`)
  } catch {
    return null
  }
}

export function isAuthorizedRequest(
  expectedToken: string,
  authorization: string | undefined,
  url: URL
): boolean {
  if (expectedToken.length === 0) return false
  const suppliedToken = tokenFromRequest(authorization, url)
  if (suppliedToken === null) return false
  const expected = Buffer.from(expectedToken)
  const supplied = Buffer.from(suppliedToken)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

export function cueNumberToIndex(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  return Number(value) - 1
}

export function routeRemoteRequest(url: URL, state: AppState): RemoteRoute {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const fixed: Record<string, PlaybackCommand> = {
    '/api/go': { type: 'go' },
    '/api/standby': { type: 'stopToStandby' },
    '/api/blackout': { type: 'toggleBlackout' },
    '/api/ftb': { type: 'masterFtb' },
    '/api/next': { type: 'next' },
    '/api/prev': { type: 'prev' },
    '/api/play': { type: 'play' },
    '/api/pause': { type: 'pause' },
    '/api/playpause': { type: 'playPause' }
  }
  if (path === '/api/status') return { type: 'status' }
  const spotify: Record<string, SpotifyControlAction> = {
    '/api/spotify/playpause': 'playPause',
    '/api/spotify/next': 'next',
    '/api/spotify/prev': 'previous'
  }
  if (spotify[path]) return { type: 'spotify', action: spotify[path] }
  if (fixed[path]) return { type: 'command', command: fixed[path] }

  const cueMatch = path.match(/^\/api\/cue\/(fire|arm)\/([^/]+)$/)
  if (cueMatch) {
    const index = cueNumberToIndex(cueMatch[2])
    const cue = index === null ? undefined : state.cues[index]
    if (!cue) return { type: 'notFound', error: mt('main.remote.cueNotFound') }
    return {
      type: 'command',
      command: { type: cueMatch[1] === 'fire' ? 'fireCue' : 'armCue', id: cue.id }
    }
  }

  if (path === '/api/volume/up' || path === '/api/volume/down') {
    const delta = path.endsWith('/up') ? 0.05 : -0.05
    const volume = Math.round((state.masterVolume + delta) * 100) / 100
    return {
      type: 'command',
      command: {
        type: 'setMasterVolume',
        volume: Math.min(1, Math.max(0, volume))
      }
    }
  }
  if (path === '/api/volume/set') {
    const raw = url.searchParams.get('value')
    if (raw === null || raw.trim() === '' || !Number.isFinite(Number(raw))) {
      return { type: 'badRequest', error: mt('main.remote.volumeNotNumeric') }
    }
    const value = Number(raw)
    if (value < 0 || value > 100) {
      return { type: 'badRequest', error: mt('main.remote.volumeOutOfRange') }
    }
    return { type: 'command', command: { type: 'setMasterVolume', volume: value / 100 } }
  }
  if (path === '/api/volume/mute') {
    return { type: 'command', command: { type: 'setMasterVolume', volume: 0 } }
  }
  return { type: 'notFound', error: mt('main.remote.endpointNotFound') }
}

export function remoteStatus(state: AppState): {
  status: AppState['status']
  ftbHeld: boolean
  activeCueIndex: number | null
  activeCueLabel: string | null
  armedCueIndex: number | null
  armedCueLabel: string | null
  masterVolume: number
  cueCount: number
} {
  const activeCueIndex = state.cues.findIndex((cue) => cue.id === state.activeCueId)
  const armed = state.cues[state.armedCueIndex]
  return {
    status: state.status,
    ftbHeld: state.ftbHeld,
    activeCueIndex: activeCueIndex < 0 ? null : activeCueIndex + 1,
    activeCueLabel: activeCueIndex < 0 ? null : state.cues[activeCueIndex].label,
    armedCueIndex: armed ? state.armedCueIndex + 1 : null,
    armedCueLabel: armed?.label ?? null,
    masterVolume: Math.round(state.masterVolume * 100),
    cueCount: state.cues.length
  }
}
