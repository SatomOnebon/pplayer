import type { FadeEasing } from './types'

export const FADE_EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const

export function isFadeEasing(value: unknown): value is FadeEasing {
  return typeof value === 'string' && (FADE_EASINGS as readonly string[]).includes(value)
}

/** t in [0,1]。live 再生・書き出し export で共通のフェード数学。 */
export function applyFadeEasing(t: number, easing: FadeEasing): number {
  const x = Math.min(1, Math.max(0, t))
  switch (easing) {
    case 'linear':
      return x
    case 'easeIn':
      return x * x * x
    case 'easeOut':
      return Math.sin((x * Math.PI) / 2)
    case 'easeInOut':
      return 0.5 - 0.5 * Math.cos(x * Math.PI)
  }
}

export function ffmpegEaseExpr(tExpr: string, easing: FadeEasing): string {
  const t = `min(1\\,max(0\\,${tExpr}))`
  switch (easing) {
    case 'linear':
      return t
    case 'easeIn':
      return `pow(${t}\\,3)`
    case 'easeOut':
      return `sin(${t}*PI/2)`
    case 'easeInOut':
      return `(0.5-0.5*cos(${t}*PI))`
  }
}

export interface FfmpegClipOpacityCycle {
  fadeInMs: number
  holdMs: number
  fadeOutMs: number
  fadeInEase: FadeEasing
  fadeOutEase: FadeEasing
}

function cycleSeconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}

export function ffmpegClipOpacityExpr(cycle: FfmpegClipOpacityCycle): string {
  const { fadeInMs, holdMs, fadeOutMs, fadeInEase, fadeOutEase } = cycle

  if (fadeInMs === 0 && fadeOutMs === 0) {
    return '1'
  }

  const fadeInSec = cycleSeconds(fadeInMs)
  const fadeOutStart = cycleSeconds(fadeInMs + holdMs)
  const fadeOutSec = cycleSeconds(fadeOutMs)
  const fadeOutEnd = cycleSeconds(fadeInMs + holdMs + fadeOutMs)

  const fadeInOpacity =
    fadeInMs > 0 ? ffmpegEaseExpr(`T/${fadeInSec}`, fadeInEase) : null
  const fadeOutEaseExpr =
    fadeOutMs > 0 ? ffmpegEaseExpr(`(T-${fadeOutStart})/${fadeOutSec}`, fadeOutEase) : null

  if (fadeInMs > 0 && fadeOutMs > 0) {
    return `if(lt(T\\,${fadeInSec})\\,${fadeInOpacity}\\,if(lt(T\\,${fadeOutStart})\\,1\\,if(lt(T\\,${fadeOutEnd})\\,1-${fadeOutEaseExpr}\\,0)))`
  }

  if (fadeInMs > 0) {
    return `if(lt(T\\,${fadeInSec})\\,${fadeInOpacity}\\,1)`
  }

  return `if(lt(T\\,${fadeOutStart})\\,1\\,if(lt(T\\,${fadeOutEnd})\\,1-${fadeOutEaseExpr}\\,0))`
}
