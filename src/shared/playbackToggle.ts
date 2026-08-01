import type { AppState, PlaybackCommand } from './types'

export function resolvePlayPauseCommand(
  state: Pick<AppState, 'activeCueId' | 'status'>
): Extract<PlaybackCommand, { type: 'play' | 'pause' }> | null {
  if (state.activeCueId === null) return null
  if (state.status === 'playing') return { type: 'pause' }
  if (state.status === 'paused') return { type: 'play' }
  return null
}
