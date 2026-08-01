import type { Cue, PlaybackStatus } from './types'

export interface CueStartState {
  baseTimestamp: number | null
  status: Exclude<PlaybackStatus, 'blackout'>
}

export function cueStartState(cue: Cue, now: number): CueStartState {
  if (cue.materialType === 'video') return { baseTimestamp: null, status: 'playing' }
  if (cue.materialType === 'slideshow') return { baseTimestamp: now, status: 'playing' }
  return { baseTimestamp: now, status: 'idle' }
}
