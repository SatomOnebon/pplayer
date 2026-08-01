import { useEffect, useRef } from 'react'
import type { MaskConfig } from '../../../shared/types'
import type { EditingAppState } from '../../../shared/migration'
import { buildMaskCanvas, drawFrame, type MaskCanvas } from './compositor'
import { imageCache } from './imageCache'
import { resolvePlaybackFrame } from './playbackFrame'
import { toMediaUrl } from '../../../shared/mediaUrl'
import { videoFadeOpacity } from '../../../shared/videoFade'
import { masterFtbOpacity } from '../../../shared/masterFtb'

interface StageSurface {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  x: number
  y: number
}

function stageSize(width: number, height: number): { width: number; height: number } {
  if (width * 9 === height * 16) return { width, height }
  if (width / height > 16 / 9) return { width: Math.max(1, Math.floor((height * 16) / 9)), height }
  return { width, height: Math.max(1, Math.floor((width * 9) / 16)) }
}

interface PlaybackCanvasProps {
  state: EditingAppState | null
  className?: string
  muted: boolean
  notifyMediaEnded?: boolean
  'aria-label'?: string
}

export function PlaybackCanvas({
  state,
  className,
  muted,
  notifyMediaEnded = false,
  'aria-label': ariaLabel
}: PlaybackCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<EditingAppState | null>(null)
  const maskCanvasRef = useRef<MaskCanvas | null>(null)
  const stageSurfaceRef = useRef<StageSurface | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const watchdogCueRef = useRef<string | null>(null)
  const activeCue = state?.cues.find((cue) => cue.id === state.activeCueId)
  const videoMaterial =
    activeCue?.materialType === 'video'
      ? state?.materials.videos.find((material) => material.id === activeCue.materialId)
      : undefined
  const activeVideoCueId = activeCue?.materialType === 'video' ? activeCue.id : null
  const videoPath = videoMaterial?.filePath
  const videoReloadToken = videoMaterial?.reloadToken
  const videoVolume = videoMaterial?.volume
  const audioOutputDeviceId = state?.audioOutputDeviceId
  const status = state?.status
  const maskMode = state?.mask.mode
  const maskImagePath = state?.mask.imagePath
  const maskInvert = state?.mask.invert
  const maskSizePercent = state?.mask.sizePercent
  const maskOffsetXPercent = state?.mask.offsetXPercent
  const maskOffsetYPercent = state?.mask.offsetYPercent
  const stageAspect = state?.stageAspect

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    watchdogCueRef.current = null
  }, [activeVideoCueId])

  useEffect(() => {
    if (!activeVideoCueId || !videoPath) {
      videoRef.current = null
      return
    }

    const video = document.createElement('video')
    video.preload = 'auto'
    video.playsInline = true
    video.muted = muted
    video.crossOrigin = 'anonymous'
    video.src = toMediaUrl(videoPath, videoReloadToken)
    const handleEnded = (): void => {
      if (notifyMediaEnded) window.api.notifyMediaEnded(activeVideoCueId)
    }
    video.addEventListener('ended', handleEnded, { once: true })
    videoRef.current = video
    video.load()

    return () => {
      videoRef.current = null
      video.removeEventListener('ended', handleEnded)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [activeVideoCueId, muted, notifyMediaEnded, videoPath, videoReloadToken])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    video.muted = muted
    video.volume = Math.max(0, Math.min(1, videoVolume ?? 1))

    if (!muted && audioOutputDeviceId && 'setSinkId' in video) {
      void video.setSinkId(audioOutputDeviceId).catch((error: unknown) => {
        console.warn('音声出力デバイスを設定できなかったため既定デバイスを使用します', error)
      })
    }

    if (status === 'playing') {
      const startTime = video.currentTime
      void video
        .play()
        .then(() => {
          if (
            cancelled ||
            muted ||
            !notifyMediaEnded ||
            !activeVideoCueId ||
            watchdogCueRef.current === activeVideoCueId
          ) {
            return
          }
          watchdogCueRef.current = activeVideoCueId
          watchdogTimer = setTimeout(() => {
            if (
              !cancelled &&
              !video.paused &&
              video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              video.currentTime <= startTime
            ) {
              video.muted = true
              window.api.notifyAudioFallback(activeVideoCueId)
            }
          }, 1000)
        })
        .catch((error: unknown) => {
          console.warn('動画を再生できませんでした', error)
        })
    } else {
      video.pause()
    }

    return () => {
      cancelled = true
      if (watchdogTimer !== null) clearTimeout(watchdogTimer)
    }
  }, [
    activeVideoCueId,
    audioOutputDeviceId,
    muted,
    notifyMediaEnded,
    status,
    videoPath,
    videoVolume
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    if (
      !canvas ||
      maskMode === undefined ||
      maskImagePath === undefined ||
      maskInvert === undefined ||
      maskSizePercent === undefined ||
      maskOffsetXPercent === undefined ||
      maskOffsetYPercent === undefined ||
      stageAspect === undefined
    ) {
      return
    }
    const mask: MaskConfig = {
      mode: maskMode,
      imagePath: maskImagePath,
      invert: maskInvert,
      sizePercent: maskSizePercent,
      offsetXPercent: maskOffsetXPercent,
      offsetYPercent: maskOffsetYPercent
    }
    let cancelled = false
    let rebuildGeneration = 0
    let acquiredMaskPath: string | null = null

    const releaseMask = (): void => {
      if (acquiredMaskPath) {
        imageCache.release(acquiredMaskPath)
        acquiredMaskPath = null
      }
    }

    const rebuildMask = async (): Promise<void> => {
      const generation = ++rebuildGeneration
      const ratio = window.devicePixelRatio || 1
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const fixedStage = stageAspect === '16:9' && width * 9 !== height * 16
      const dimensions = fixedStage ? stageSize(width, height) : { width, height }
      let surface: StageSurface | null = null
      if (fixedStage) {
        const previous = stageSurfaceRef.current
        const offscreen =
          previous?.canvas.width === dimensions.width &&
          previous.canvas.height === dimensions.height
            ? previous.canvas
            : document.createElement('canvas')
        if (offscreen.width !== dimensions.width) offscreen.width = dimensions.width
        if (offscreen.height !== dimensions.height) offscreen.height = dimensions.height
        const offscreenContext = offscreen.getContext('2d')
        if (offscreenContext) {
          surface = {
            canvas: offscreen,
            context: offscreenContext,
            x: Math.floor((width - dimensions.width) / 2),
            y: Math.floor((height - dimensions.height) / 2)
          }
        }
      }

      releaseMask()

      let maskImage: ImageBitmap | null = null
      let pendingMaskPath: string | null = null
      if (mask.mode === 'image' && mask.imagePath) {
        pendingMaskPath = mask.imagePath
        try {
          maskImage = await imageCache.acquire(pendingMaskPath)
        } catch {
          maskImage = null
          pendingMaskPath = null
        }
      }
      if (cancelled || generation !== rebuildGeneration) {
        if (pendingMaskPath) imageCache.release(pendingMaskPath)
        return
      }
      acquiredMaskPath = pendingMaskPath
      maskCanvasRef.current = buildMaskCanvas(mask, maskImage, dimensions.width, dimensions.height)
      stageSurfaceRef.current = surface
    }

    void rebuildMask()
    const resizeObserver = new ResizeObserver(() => void rebuildMask())
    resizeObserver.observe(canvas)
    return () => {
      cancelled = true
      rebuildGeneration += 1
      resizeObserver.disconnect()
      releaseMask()
    }
  }, [
    maskMode,
    maskImagePath,
    maskInvert,
    maskSizePercent,
    maskOffsetXPercent,
    maskOffsetYPercent,
    stageAspect
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    let animationFrame = 0

    const render = (): void => {
      const currentState = stateRef.current
      const maskCanvas = maskCanvasRef.current
      const stageSurface = stageSurfaceRef.current
      let source: ImageBitmap | HTMLVideoElement | null = null
      let opacity = 0
      let fit = currentState?.fit ?? 'contain'

      if (currentState && maskCanvas) {
        const frame = resolvePlaybackFrame(currentState)
        const masterOpacity = masterFtbOpacity(currentState.ftb, currentState.ftbHeld)
        fit = frame.fit
        const currentCue = currentState.cues.find((cue) => cue.id === currentState.activeCueId)
        if (
          currentCue?.materialType === 'video' &&
          currentState.status !== 'blackout' &&
          videoRef.current &&
          videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          source = videoRef.current
          const material = currentState.materials.videos.find(
            (item) => item.id === currentCue.materialId
          )
          fit = material?.fit ?? 'contain'
          opacity = videoFadeOpacity(
            videoRef.current.currentTime,
            videoRef.current.duration,
            currentCue.fadeInMs,
            currentCue.fadeOutMs,
            currentCue.endBehavior !== 'hold'
          )
          videoRef.current.volume = Math.max(
            0,
            Math.min(
              1,
              (material?.volume ?? 1) * opacity * masterOpacity * currentState.masterVolume
            )
          )
        } else if (frame.photo && frame.photoIndex !== null) {
          source = imageCache.get(frame.photo.filePath, frame.photo.reloadToken)
          opacity = frame.timeline.opacity
          imageCache.preload(
            frame.playablePhotos,
            frame.photoIndex,
            currentState.cues.find((cue) => cue.id === currentState.activeCueId)?.endBehavior ===
              'loop'
          )
        }
        opacity *= masterOpacity
      }

      if (maskCanvas) {
        if (stageSurface) {
          drawFrame(
            stageSurface.context,
            source,
            fit,
            maskCanvas,
            opacity,
            stageSurface.canvas.width,
            stageSurface.canvas.height
          )
          context.fillStyle = '#000000'
          context.fillRect(0, 0, canvas.width, canvas.height)
          context.drawImage(stageSurface.canvas, stageSurface.x, stageSurface.y)
        } else {
          drawFrame(context, source, fit, maskCanvas, opacity, canvas.width, canvas.height)
        }
      } else {
        context.fillStyle = '#000000'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      animationFrame = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animationFrame)
  }, [])

  return <canvas ref={canvasRef} className={className} aria-label={ariaLabel} />
}
