export const MAX_VIDEO_FADE_MS = 10_000

export function clampVideoFadeMs(value: number): number {
  return Math.min(MAX_VIDEO_FADE_MS, Math.max(0, value))
}

export function videoFadeOpacity(
  currentTimeSeconds: number,
  durationSeconds: number,
  fadeInMs: number,
  fadeOutMs: number,
  applyFadeOut: boolean
): number {
  const currentMs = Math.max(0, currentTimeSeconds * 1_000)
  const fadeIn = clampVideoFadeMs(fadeInMs)
  const fadeOut = clampVideoFadeMs(fadeOutMs)
  const inOpacity = fadeIn === 0 ? 1 : Math.min(1, currentMs / fadeIn)

  if (!applyFadeOut || !Number.isFinite(durationSeconds)) return inOpacity

  const remainingMs = Math.max(0, durationSeconds * 1_000 - currentMs)
  const outOpacity = fadeOut === 0 ? 1 : Math.min(1, remainingMs / fadeOut)
  return Math.min(inOpacity, outOpacity)
}
