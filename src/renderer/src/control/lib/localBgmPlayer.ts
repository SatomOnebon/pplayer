import { toMediaUrl } from '../../../../shared/mediaUrl'
import type { LocalBgmPlaylist } from '../../../../shared/types'

export interface LocalBgmSnapshot {
  playing: boolean
  paused: boolean
  currentPlaylistId: string | null
  trackIndex: number
  trackName: string | null
  volume: number
  error: string | null
}

const decks = [new Audio(), new Audio()] as const
const listeners = new Set<() => void>()
let snapshot: LocalBgmSnapshot = {
  playing: false,
  paused: true,
  currentPlaylistId: null,
  trackIndex: 0,
  trackName: null,
  volume: 0.5,
  error: null
}
let activeDeck: 0 | 1 = 0
let targetVolume = snapshot.volume
let currentPlaylist: LocalBgmPlaylist | null = null
let currentIndex = 0
let fadeToken = 0
let outputDeviceId: string | null = null
let crossfadeMode: 'crossfade' | 'gap' = 'crossfade'
let fadeMs = 2000
let automaticTransition = false

function update(changes: Partial<LocalBgmSnapshot>): void {
  const next = { ...snapshot, ...changes }
  if (
    (Object.keys(next) as Array<keyof LocalBgmSnapshot>).every((key) => next[key] === snapshot[key])
  )
    return
  snapshot = next
  listeners.forEach((listener) => listener())
}

function reportError(message: string): void {
  update({ error: message })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function rampVolume(
  deck: HTMLAudioElement,
  to: number,
  ms: number,
  token: number
): Promise<void> {
  if (fadeToken !== token) return
  const target = Math.min(1, Math.max(0, to))
  const from = deck.volume
  if (ms <= 0) {
    deck.volume = target
    return
  }
  const startedAt = performance.now()
  while (fadeToken === token) {
    const progress = Math.min(1, (performance.now() - startedAt) / ms)
    deck.volume = from + (target - from) * progress
    if (progress >= 1) return
    await wait(Math.min(50, ms))
  }
}

async function startDeck(deck: HTMLAudioElement, index: number, token: number): Promise<boolean> {
  const track = currentPlaylist?.tracks[index]
  if (!track || fadeToken !== token) return false
  deck.src = toMediaUrl(track.filePath, track.reloadToken)
  deck.load()
  try {
    await deck.play()
    return fadeToken === token
  } catch {
    if (fadeToken === token) reportError(`「${track.name}」を再生できませんでした`)
    return false
  }
}

async function transition(index: number): Promise<void> {
  const playlist = currentPlaylist
  const track = playlist?.tracks[index]
  if (!playlist || !track) return
  const token = ++fadeToken
  automaticTransition = true
  currentIndex = index
  update({
    currentPlaylistId: playlist.id,
    trackIndex: index,
    trackName: track.name,
    error: null
  })

  try {
    if (crossfadeMode === 'gap') {
      const deck = decks[activeDeck]
      await rampVolume(deck, 0, fadeMs, token)
      if (fadeToken !== token) return
      deck.pause()
      deck.currentTime = 0
      deck.volume = 0
      if (!(await startDeck(deck, index, token))) return
      update({ playing: true, paused: false })
      await rampVolume(deck, targetVolume, fadeMs, token)
      return
    }

    const oldDeck = decks[activeDeck]
    const nextDeckIndex: 0 | 1 = activeDeck === 0 ? 1 : 0
    const nextDeck = decks[nextDeckIndex]
    nextDeck.pause()
    nextDeck.volume = 0
    if (!(await startDeck(nextDeck, index, token))) return
    update({ playing: true, paused: false })
    await Promise.all([
      rampVolume(oldDeck, 0, fadeMs, token),
      rampVolume(nextDeck, targetVolume, fadeMs, token)
    ])
    if (fadeToken !== token) return
    oldDeck.pause()
    oldDeck.removeAttribute('src')
    oldDeck.load()
    activeDeck = nextDeckIndex
  } finally {
    if (fadeToken === token) automaticTransition = false
  }
}

function nextIndex(): number | null {
  const length = currentPlaylist?.tracks.length ?? 0
  return length > 0 ? (currentIndex + 1) % length : null
}

decks.forEach((deck, deckIndex) => {
  deck.addEventListener('ended', () => {
    if (crossfadeMode !== 'gap' || deckIndex !== activeDeck || automaticTransition) return
    const index = nextIndex()
    if (index !== null) void transition(index)
  })
  deck.addEventListener('timeupdate', () => {
    if (
      crossfadeMode !== 'crossfade' ||
      deckIndex !== activeDeck ||
      automaticTransition ||
      !Number.isFinite(deck.duration) ||
      deck.duration - deck.currentTime > fadeMs / 1000
    )
      return
    const index = nextIndex()
    if (index !== null) void transition(index)
  })
  deck.addEventListener('error', () => {
    if (deckIndex === activeDeck || automaticTransition) reportError('音源を読み込めませんでした')
  })
})

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): LocalBgmSnapshot {
  return snapshot
}

export function setOutputDevice(id: string | null): void {
  outputDeviceId = id
  decks.forEach((deck) => {
    if ('setSinkId' in deck) {
      void deck
        .setSinkId(outputDeviceId ?? '')
        .catch((error: unknown) => console.warn('BGM の出力デバイスを変更できませんでした', error))
    }
  })
}

export function setCrossfade(mode: 'crossfade' | 'gap', durationMs: number): void {
  crossfadeMode = mode
  fadeMs = Math.min(10_000, Math.max(0, durationMs))
}

export function playPlaylist(playlist: LocalBgmPlaylist, index = 0): void {
  if (playlist.tracks.length === 0) {
    reportError('このプレイリストに曲がありません')
    return
  }
  currentPlaylist = playlist
  const normalizedIndex =
    ((index % playlist.tracks.length) + playlist.tracks.length) % playlist.tracks.length
  void transition(normalizedIndex)
}

export async function transitionToPlaylist(
  playlist: LocalBgmPlaylist,
  transitionFadeMs: number
): Promise<void> {
  const previousFadeMs = fadeMs
  fadeMs = Math.min(10_000, Math.max(0, transitionFadeMs))
  if (playlist.tracks.length === 0) {
    reportError('このプレイリストに曲がありません')
    fadeMs = previousFadeMs
    return
  }
  currentPlaylist = playlist
  await transition(0)
  fadeMs = previousFadeMs
}

export function togglePlay(): void {
  const playableDecks = decks.filter((deck) => Boolean(deck.src))
  if (playableDecks.length === 0) return
  if (snapshot.paused) {
    void Promise.all(playableDecks.map((deck) => deck.play())).then(
      () => update({ playing: true, paused: false, error: null }),
      () => reportError('再生を再開できませんでした')
    )
  } else {
    playableDecks.forEach((deck) => deck.pause())
    update({ playing: true, paused: true })
  }
}

export function nextTrack(): void {
  const index = nextIndex()
  if (index !== null) void transition(index)
}

export function previousTrack(): void {
  const length = currentPlaylist?.tracks.length ?? 0
  if (length > 0) void transition((currentIndex - 1 + length) % length)
}

export function setVolume(volume: number): void {
  targetVolume = Math.min(1, Math.max(0, volume))
  fadeToken += 1
  automaticTransition = false
  decks[activeDeck].volume = targetVolume
  update({ volume: targetVolume })
}

export function stop(): void {
  fadeToken += 1
  automaticTransition = false
  decks.forEach((deck) => {
    deck.pause()
    deck.removeAttribute('src')
    deck.load()
    deck.volume = targetVolume
  })
  currentPlaylist = null
  currentIndex = 0
  update({
    playing: false,
    paused: true,
    currentPlaylistId: null,
    trackIndex: 0,
    trackName: null,
    error: null
  })
}

export async function stopWithFade(transitionFadeMs: number): Promise<void> {
  const token = ++fadeToken
  automaticTransition = true
  const durationMs = Math.min(10_000, Math.max(0, transitionFadeMs))
  await Promise.all(
    decks.filter((deck) => Boolean(deck.src)).map((deck) => rampVolume(deck, 0, durationMs, token))
  )
  if (fadeToken !== token) return
  stop()
}
