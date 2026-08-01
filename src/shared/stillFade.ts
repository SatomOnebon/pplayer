import type { AppState, PendingTransition } from './types'
import { clampVideoFadeMs } from './videoFade'

export function stillFadeInOpacity(
  baseTimestamp: number | null,
  fadeInMs: number,
  now = Date.now()
): number {
  if (baseTimestamp === null) return 1
  const duration = clampVideoFadeMs(fadeInMs)
  if (duration === 0) return 1
  return Math.max(0, Math.min(1, (now - baseTimestamp) / duration))
}

export function beginStillExit(
  state: AppState,
  pendingTransition: PendingTransition,
  now = Date.now()
): {
  ftb: NonNullable<AppState['ftb']>
  pendingTransition: PendingTransition
} | null {
  const cue = state.cues.find((item) => item.id === state.activeCueId)
  if ((cue?.materialType !== 'still' && cue?.materialType !== 'black') || cue.fadeOutMs <= 0)
    return null
  return {
    ftb: { startedAt: now, durationMs: clampVideoFadeMs(cue.fadeOutMs), direction: 'down' },
    pendingTransition
  }
}
