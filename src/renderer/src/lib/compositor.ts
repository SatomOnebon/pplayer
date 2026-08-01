import type { FitMode, MaskConfig } from '../../../shared/types'

export type MaskCanvas = OffscreenCanvas | HTMLCanvasElement

const normalizedMaskImages = new WeakMap<ImageBitmap, MaskCanvas>()
const frameCanvases = new Map<string, MaskCanvas>()
const maxFrameCanvasCacheEntries = 3

function createCanvas(width: number, height: number): MaskCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context2d(
  canvas: MaskCanvas
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context =
    canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context is not available')
  return context
}

function normalizeMaskImage(image: ImageBitmap): MaskCanvas {
  const cached = normalizedMaskImages.get(image)
  if (cached) return cached

  const canvas = createCanvas(image.width, image.height)
  const context = context2d(canvas)
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, image.width, image.height)
  let hasTransparency = false

  for (let index = 3; index < pixels.data.length; index += 4) {
    if (pixels.data[index] !== 255) {
      hasTransparency = true
      break
    }
  }

  if (!hasTransparency) {
    for (let index = 0; index < pixels.data.length; index += 4) {
      const luminance = Math.round(
        pixels.data[index] * 0.2126 +
          pixels.data[index + 1] * 0.7152 +
          pixels.data[index + 2] * 0.0722
      )
      pixels.data[index] = 255
      pixels.data[index + 1] = 255
      pixels.data[index + 2] = 255
      pixels.data[index + 3] = luminance
    }
    context.putImageData(pixels, 0, 0)
  }

  normalizedMaskImages.set(image, canvas)
  return canvas
}

function invertMaskCanvas(maskCanvas: MaskCanvas, width: number, height: number): MaskCanvas {
  const inverted = createCanvas(width, height)
  const context = context2d(inverted)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'destination-out'
  context.drawImage(maskCanvas, 0, 0)
  context.globalCompositeOperation = 'source-over'
  return inverted
}

export function buildMaskCanvas(
  mask: MaskConfig,
  maskImage: ImageBitmap | null,
  outWidth: number,
  outHeight: number
): MaskCanvas {
  const canvas = createCanvas(outWidth, outHeight)
  const context = context2d(canvas)
  if (mask.mode === 'none') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, outWidth, outHeight)
    return canvas
  }
  const height = outHeight * (mask.sizePercent / 100)
  const width =
    mask.mode === 'image' && maskImage ? height * (maskImage.width / maskImage.height) : height
  const centerX = outWidth / 2 + (mask.offsetXPercent / 100) * outWidth
  const centerY = outHeight / 2 + (mask.offsetYPercent / 100) * outHeight
  const bounds = { x: centerX - width / 2, y: centerY - height / 2, width, height }

  if (mask.mode === 'circle') {
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.arc(centerX, centerY, height / 2, 0, Math.PI * 2)
    context.fill()
  } else if (maskImage) {
    context.drawImage(normalizeMaskImage(maskImage), bounds.x, bounds.y, width, height)
  }

  return mask.invert ? invertMaskCanvas(canvas, outWidth, outHeight) : canvas
}

function reusableFrameCanvas(width: number, height: number): MaskCanvas {
  const key = `${width}x${height}`
  const cached = frameCanvases.get(key)
  if (cached) return cached

  const canvas = createCanvas(width, height)
  frameCanvases.set(key, canvas)

  if (frameCanvases.size > maxFrameCanvasCacheEntries) {
    const oldestKey = frameCanvases.keys().next().value
    if (oldestKey !== undefined) frameCanvases.delete(oldestKey)
  }

  return canvas
}

export function drawFrame(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: ImageBitmap | HTMLVideoElement | null,
  fit: FitMode,
  maskCanvas: MaskCanvas,
  opacity: number,
  outWidth: number,
  outHeight: number
): void {
  context.save()
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
  context.fillStyle = '#000000'
  context.fillRect(0, 0, outWidth, outHeight)
  context.restore()
  if (!source) return

  const temporary = reusableFrameCanvas(outWidth, outHeight)
  const temporaryContext = context2d(temporary)
  temporaryContext.clearRect(0, 0, outWidth, outHeight)
  temporaryContext.globalCompositeOperation = 'source-over'
  temporaryContext.globalAlpha = 1

  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return
  const scale =
    fit === 'contain'
      ? Math.min(outWidth / sourceWidth, outHeight / sourceHeight)
      : Math.max(outWidth / sourceWidth, outHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  temporaryContext.drawImage(
    source,
    (outWidth - width) / 2,
    (outHeight - height) / 2,
    width,
    height
  )
  temporaryContext.globalCompositeOperation = 'destination-in'
  temporaryContext.drawImage(maskCanvas, 0, 0)
  temporaryContext.globalCompositeOperation = 'source-over'

  context.save()
  context.globalAlpha = Math.max(0, Math.min(1, opacity))
  context.drawImage(temporary, 0, 0)
  context.restore()
}
