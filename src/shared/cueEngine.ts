import type { Cue } from './types'

export type SlideshowCompletion =
  | { type: 'loop' }
  | { type: 'fire'; cueId: string }
  | { type: 'standby' }
  | { type: 'hold' }
  | { type: 'blackout' }

export function resolveSlideshowCompletion(cues: Cue[], activeCueId: string): SlideshowCompletion {
  const index = cues.findIndex((cue) => cue.id === activeCueId)
  const cue = cues[index]
  if (!cue || cue.materialType !== 'slideshow') return { type: 'standby' }
  if (cue.endBehavior === 'loop') return { type: 'loop' }
  if (cue.endBehavior === 'toStandby') return { type: 'standby' }
  if (cue.endBehavior === 'hold') return { type: 'hold' }
  if (cue.endBehavior === 'toBlack') return { type: 'blackout' }
  const nextCue = cues[index + 1]
  return nextCue ? { type: 'fire', cueId: nextCue.id } : { type: 'standby' }
}
