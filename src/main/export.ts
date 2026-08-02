import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { mkdir, rm, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import ffmpegStatic from 'ffmpeg-static'
import { cycleDuration, type TimelineCycle } from '../shared/timeline'
import { ffmpegClipOpacityExpr } from '../shared/easing'
import { IPC, type ExportConfig, type ExportProgress } from '../shared/types'
import { isExportConfig, isFiniteNumber, isTimelineCycles } from './validation'
import { mt } from './language'

function broadcast(progress: ExportProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.exportProgress, progress)
  }
}

function evenDimension(value: number): number {
  const integer = Math.max(2, Math.round(value))
  return integer % 2 === 0 ? integer : integer - 1
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3)
}

function ffmpegRate(fps: number): string {
  if (fps === 29.97) return '30000/1001'
  if (fps === 59.94) return '60000/1001'
  return String(fps)
}

function ffmpegClipOpacity16Expr(opacity: string): string {
  return `min(65535\\,max(0\\,(${opacity})*65535))`
}

export function buildFfmpegArgs(
  config: ExportConfig,
  cycles: ReadonlyArray<TimelineCycle>,
  tempDirectory: string
): string[] {
  const width = evenDimension(config.width)
  const height = evenDimension(config.height)
  const args: string[] = []

  for (let index = 0; index < cycles.length; index += 1) {
    args.push(
      '-loop',
      '1',
      '-t',
      seconds(cycleDuration(cycles[index])),
      '-i',
      join(tempDirectory, `frame-${index.toString().padStart(4, '0')}.png`)
    )
  }

  const rate = ffmpegRate(config.fps)
  const streams: string[] = []
  for (let index = 0; index < cycles.length; index += 1) {
    const timing = cycles[index]
    const baseFilters = [
      `scale=${width}:${height}`,
      'setsar=1',
      `fps=${rate}`,
      'format=gbrp16le'
    ].join(',')
    if (timing.fadeInMs === 0 && timing.fadeOutMs === 0) {
      streams.push(`[${index}:v]${baseFilters}[v${index}]`)
      continue
    }
    const opacity16 = ffmpegClipOpacity16Expr(ffmpegClipOpacityExpr(timing))
    const duration = seconds(cycleDuration(timing))
    const rampFilters = [
      `color=c=white:s=1x1:r=${rate}:d=${duration}`,
      'format=gbrp16le',
      `geq=r='${opacity16}':g='${opacity16}':b='${opacity16}'`,
      `scale=${width}:${height}:flags=neighbor`
    ].join(',')
    streams.push(`[${index}:v]${baseFilters}[base${index}]`)
    streams.push(`${rampFilters}[ramp${index}]`)
    streams.push(`[base${index}][ramp${index}]blend=all_mode=multiply:shortest=1[v${index}]`)
  }
  const inputs = cycles.map((_, index) => `[v${index}]`).join('')
  const finalConversion =
    config.codec === 'hevc10'
      ? 'format=yuv420p10le'
      : `scale=${width}:${height}:sws_dither=ed:flags=+accurate_rnd+full_chroma_int,format=yuv420p`
  streams.push(`${inputs}concat=n=${cycles.length}:v=1:a=0,${finalConversion}[outv]`)

  args.push('-filter_complex', streams.join(';'), '-map', '[outv]')
  if (config.codec === 'hevc10') {
    args.push(
      '-c:v',
      'libx265',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-tag:v',
      'hvc1',
      '-movflags',
      '+faststart'
    )
  } else {
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-movflags', '+faststart')
  }
  args.push('-y', config.outputPath)
  return args
}

class ExportManager {
  private readonly tempDirectory = join(app.getPath('temp'), 'pplayer-export')
  private process: ChildProcessWithoutNullStreams | null = null
  private composing = false
  private cancelled = false
  private outputPath: string | null = null
  private stderrLines: string[] = []

  async writeFrame(index: number, frame: ArrayBuffer, total: number): Promise<void> {
    if (!Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 1) {
      throw new Error(mt('main.export.invalidFrameNumber'))
    }
    if (this.process) throw new Error(mt('main.export.frameDuringEncoding'))
    if (index === 0) {
      if (this.composing) throw new Error(mt('main.export.alreadyRunning'))
      await rm(this.tempDirectory, { recursive: true, force: true })
      await mkdir(this.tempDirectory, { recursive: true })
      this.composing = true
      this.cancelled = false
      this.outputPath = null
    }
    if (!this.composing || this.cancelled) throw new Error(mt('main.export.cancelled'))

    await writeFile(
      join(this.tempDirectory, `frame-${index.toString().padStart(4, '0')}.png`),
      Buffer.from(frame)
    )
    if (this.cancelled) throw new Error(mt('main.export.cancelled'))
    const current = index + 1
    broadcast({
      stage: 'composing',
      current,
      total,
      percent: (current / total) * 30
    })
  }

  async start(config: ExportConfig, cycles: ReadonlyArray<TimelineCycle>): Promise<void> {
    if (this.process || !this.composing) throw new Error(mt('main.export.cannotStart'))
    if (this.cancelled) throw new Error(mt('main.export.cancelled'))
    if (cycles.length < 1) throw new Error(mt('main.export.noPhotos'))

    const normalizedConfig: ExportConfig = {
      width: evenDimension(config.width),
      height: evenDimension(config.height),
      fps: config.fps,
      codec: config.codec,
      outputPath: config.outputPath
    }
    if (![24, 25, 29.97, 30, 59.94, 60].includes(normalizedConfig.fps)) {
      throw new Error(mt('main.export.invalidFps'))
    }
    if (!['hevc10', 'h264'].includes(normalizedConfig.codec)) {
      throw new Error(mt('main.export.invalidCodec'))
    }
    if (!normalizedConfig.outputPath) throw new Error(mt('main.export.noOutputPath'))

    const executable = ffmpegStatic?.replace('app.asar', 'app.asar.unpacked')
    if (!executable) throw new Error(mt('main.export.ffmpegNotFound'))
    this.composing = false
    this.outputPath = normalizedConfig.outputPath
    this.stderrLines = []
    const args = buildFfmpegArgs(normalizedConfig, cycles, this.tempDirectory)
    const totalSeconds = cycles.reduce((total, cycle) => total + cycleDuration(cycle), 0) / 1000

    await new Promise<void>((resolve) => {
      const child = spawn(executable, args)
      this.process = child
      let pending = ''

      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        pending += chunk
        const lines = pending.split(/\r?\n|\r/)
        pending = lines.pop() ?? ''
        for (const line of lines) this.consumeStderr(line, totalSeconds, cycles.length)
      })
      child.on('error', (error) => {
        this.stderrLines.push(error.message)
      })
      child.on('close', (code) => {
        if (pending) this.consumeStderr(pending, totalSeconds, cycles.length)
        this.process = null
        const wasCancelled = this.cancelled
        const outputPath = this.outputPath
        void this.finish(code, wasCancelled, outputPath).finally(resolve)
      })
    })
  }

  async cancel(): Promise<void> {
    if (!this.composing && !this.process) return
    this.cancelled = true
    this.composing = false
    if (this.process) {
      this.process.kill('SIGTERM')
      return
    }
    await this.cleanup()
    broadcast({ stage: 'cancelled', current: 0, total: 0, percent: 0 })
  }

  private consumeStderr(line: string, totalSeconds: number, total: number): void {
    if (line.trim()) {
      this.stderrLines.push(line)
      if (this.stderrLines.length > 12) this.stderrLines.shift()
    }
    const match = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!match || totalSeconds <= 0) return
    const elapsed = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    const ratio = Math.min(1, Math.max(0, elapsed / totalSeconds))
    broadcast({
      stage: 'encoding',
      current: Math.min(total, Math.floor(ratio * total)),
      total,
      percent: 30 + ratio * 70
    })
  }

  private async finish(
    code: number | null,
    wasCancelled: boolean,
    outputPath: string | null
  ): Promise<void> {
    if (wasCancelled) {
      if (outputPath) await unlink(outputPath).catch(() => undefined)
      broadcast({ stage: 'cancelled', current: 0, total: 0, percent: 0 })
    } else if (code === 0 && outputPath) {
      broadcast({
        stage: 'done',
        current: 1,
        total: 1,
        percent: 100,
        outputPath
      })
    } else {
      if (outputPath) await unlink(outputPath).catch(() => undefined)
      broadcast({
        stage: 'error',
        current: 0,
        total: 0,
        percent: 0,
        message:
          this.stderrLines.slice(-8).join('\n') ||
          mt('main.export.ffmpegExitCode', { code: String(code) })
      })
    }
    await this.cleanup()
    this.cancelled = false
    this.outputPath = null
  }

  private async cleanup(): Promise<void> {
    await rm(this.tempDirectory, { recursive: true, force: true })
  }
}

export function registerExportIpc(): void {
  const manager = new ExportManager()
  ipcMain.handle(
    IPC.exportWriteFrame,
    (_event, index: unknown, frame: unknown, total: unknown): Promise<void> | string => {
      if (
        !isFiniteNumber(index) ||
        !Number.isInteger(index) ||
        index < 0 ||
        !(frame instanceof ArrayBuffer) ||
        !isFiniteNumber(total) ||
        !Number.isInteger(total) ||
        total < 1
      ) {
        return mt('main.export.invalidFrame')
      }
      return manager.writeFrame(index, frame, total)
    }
  )
  ipcMain.handle(
    IPC.exportStart,
    (_event, config: unknown, cycles: unknown): Promise<void> | string => {
      if (!isExportConfig(config) || !isTimelineCycles(cycles)) {
        return mt('main.export.invalidConfig')
      }
      return manager.start(config, cycles)
    }
  )
  ipcMain.handle(IPC.exportCancel, () => manager.cancel())
  ipcMain.handle(IPC.exportReveal, (_event, outputPath: unknown) => {
    if (typeof outputPath === 'string' && outputPath) shell.showItemInFolder(outputPath)
  })
}
