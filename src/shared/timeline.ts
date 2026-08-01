import { applyFadeEasing } from './easing'
import type { PhotoItem, TimingConfig } from './types'

export interface TimelineCycle {
  fadeInMs: number
  holdMs: number
  fadeOutMs: number
  fadeInEase: TimingConfig['fadeInEase']
  fadeOutEase: TimingConfig['fadeOutEase']
}

export type TimelinePhase = 'fadeIn' | 'hold' | 'fadeOut' | 'black'

export interface TimelineResult {
  photoOffset: number
  phase: TimelinePhase
  opacity: number
  finished: boolean
}

const BLACK_RESULT: TimelineResult = {
  photoOffset: 0,
  phase: 'black',
  opacity: 0,
  finished: true
}

export function computeTimeline(
  elapsedMs: number,
  cycles: ReadonlyArray<TimelineCycle>,
  loop: boolean
): TimelineResult {
  if (cycles.length === 0) return BLACK_RESULT
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return { ...BLACK_RESULT, finished: false }
  }

  const normalizedCycles = cycles.map((cycle) => ({
    fadeInMs: Math.max(0, cycle.fadeInMs),
    holdMs: Math.max(0, cycle.holdMs),
    fadeOutMs: Math.max(0, cycle.fadeOutMs),
    fadeInEase: cycle.fadeInEase,
    fadeOutEase: cycle.fadeOutEase
  }))
  const durations = normalizedCycles.map((cycle) => cycle.fadeInMs + cycle.holdMs + cycle.fadeOutMs)
  const totalMs = durations.reduce((total, duration) => total + duration, 0)
  if (totalMs <= 0) return BLACK_RESULT
  if (!loop && elapsedMs >= totalMs) return BLACK_RESULT

  let remainingMs = loop ? elapsedMs % totalMs : elapsedMs
  let photoOffset = 0
  while (
    photoOffset < durations.length - 1 &&
    (durations[photoOffset] <= 0 || remainingMs >= durations[photoOffset])
  ) {
    remainingMs -= durations[photoOffset]
    photoOffset += 1
  }

  const { fadeInMs, holdMs, fadeOutMs, fadeInEase, fadeOutEase } = normalizedCycles[photoOffset]
  const cycleMs = durations[photoOffset]
  const cycleElapsedMs = remainingMs

  if (cycleElapsedMs < fadeInMs) {
    return {
      photoOffset,
      phase: 'fadeIn',
      opacity:
        fadeInMs === 0 ? 1 : applyFadeEasing(cycleElapsedMs / fadeInMs, fadeInEase),
      finished: false
    }
  }

  if (cycleElapsedMs < fadeInMs + holdMs) {
    return { photoOffset, phase: 'hold', opacity: 1, finished: false }
  }

  if (cycleElapsedMs < cycleMs) {
    const fadeOutElapsedMs = cycleElapsedMs - fadeInMs - holdMs
    return {
      photoOffset,
      phase: 'fadeOut',
      opacity:
        fadeOutMs === 0
          ? 0
          : 1 - applyFadeEasing(fadeOutElapsedMs / fadeOutMs, fadeOutEase),
      finished: false
    }
  }

  return { photoOffset, phase: 'black', opacity: 0, finished: false }
}

export function buildCycles(
  photos: ReadonlyArray<PhotoItem>,
  timing: TimingConfig,
  baseIndex: number,
  loop: boolean
): TimelineCycle[] {
  if (photos.length === 0) return []
  const start = Math.min(Math.max(0, Math.trunc(baseIndex)), photos.length - 1)
  const orderedPhotos = loop
    ? [...photos.slice(start), ...photos.slice(0, start)]
    : photos.slice(start)
  return orderedPhotos.map((photo) => ({
    fadeInMs: photo.fadeInMs ?? timing.fadeInMs,
    holdMs: photo.holdMs ?? timing.holdMs,
    fadeOutMs: photo.fadeOutMs ?? timing.fadeOutMs,
    fadeInEase: timing.fadeInEase,
    fadeOutEase: timing.fadeOutEase
  }))
}

export function cycleDuration(cycle: TimelineCycle): number {
  return Math.max(0, cycle.fadeInMs) + Math.max(0, cycle.holdMs) + Math.max(0, cycle.fadeOutMs)
}

export function resolvePhotoIndex(
  baseIndex: number,
  photoOffset: number,
  photoCount: number,
  loop: boolean
): number | null {
  if (photoCount <= 0 || baseIndex < 0 || baseIndex >= photoCount || photoOffset < 0) {
    return null
  }

  const index = baseIndex + photoOffset
  if (!loop && index >= photoCount) return null
  return index % photoCount
}
