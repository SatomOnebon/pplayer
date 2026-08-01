import { useEffect, useRef, useState } from 'react'
import { buildCycles } from '../../../shared/timeline'
import type { ExportConfig, ExportProgress, PlaybackCommand } from '../../../shared/types'
import type { EditingAppState } from '../../../shared/migration'
import { buildMaskCanvas, drawFrame } from '../lib/compositor'
import { imageCache } from '../lib/imageCache'

type ResolutionPreset = '1080p' | '2160p' | 'custom'

export function ExportPanel({
  state,
  send
}: {
  state: EditingAppState
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const [slideshowId, setSlideshowId] = useState(state.editingSlideshowId ?? '')
  const [resolution, setResolution] = useState<ResolutionPreset>('1080p')
  const [customWidth, setCustomWidth] = useState('1920')
  const [customHeight, setCustomHeight] = useState('1080')
  const [exportFps, setExportFps] = useState(30)
  const [exportCodec, setExportCodec] = useState<ExportConfig['codec']>('hevc10')
  const [exportPath, setExportPath] = useState('')
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [exporting, setExporting] = useState(false)
  const exportCancelledRef = useRef(false)
  const slideshow =
    state.materials.slideshows.find((item) => item.id === slideshowId) ??
    state.materials.slideshows.find((item) => item.id === state.editingSlideshowId) ??
    state.materials.slideshows[0]
  const effectiveSlideshowId = slideshow?.id ?? ''
  const playablePhotoCount = slideshow?.photos.filter((photo) => !photo.excluded).length ?? 0
  useEffect(
    () =>
      window.api.onExportProgress((progress) => {
        setExportProgress(progress)
        if (['done', 'error', 'cancelled'].includes(progress.stage)) setExporting(false)
      }),
    []
  )
  const exportDimensions = (): { width: number; height: number } => {
    if (resolution === '1080p') return { width: 1920, height: 1080 }
    if (resolution === '2160p') return { width: 3840, height: 2160 }
    const even = (value: string): number => {
      const integer = Math.max(2, Math.round(Number(value) || 2))
      return integer % 2 === 0 ? integer : integer - 1
    }
    return { width: even(customWidth), height: even(customHeight) }
  }
  const startExport = async (): Promise<void> => {
    if (!slideshow) return
    const photos = slideshow.photos
      .filter((photo) => !photo.excluded)
      .map((photo) => ({ ...photo }))
    if (photos.length === 0 || !exportPath || exporting) return
    const timing = { ...slideshow.timing }
    const cycles = buildCycles(photos, timing, 0, false)
    const mask = { ...state.mask }
    const fit = slideshow.fit
    const dimensions = exportDimensions()
    const config: ExportConfig = {
      ...dimensions,
      fps: exportFps,
      codec: exportCodec,
      outputPath: exportPath
    }
    exportCancelledRef.current = false
    setExporting(true)
    setExportProgress({ stage: 'composing', current: 0, total: photos.length, percent: 0 })
    if (state.status === 'playing') send({ type: 'pause' })
    let acquiredMaskPath: string | null = null
    try {
      const maskImage =
        mask.mode === 'image' && mask.imagePath
          ? await imageCache.acquire((acquiredMaskPath = mask.imagePath))
          : null
      if (exportCancelledRef.current) return
      const maskCanvas = buildMaskCanvas(mask, maskImage, dimensions.width, dimensions.height)
      const canvas = new OffscreenCanvas(dimensions.width, dimensions.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('書き出し用 Canvas を作成できません')
      for (let index = 0; index < photos.length; index += 1) {
        if (exportCancelledRef.current) return
        const photoPath = photos[index].filePath
        const photo = await imageCache.acquire(photoPath)
        try {
          if (exportCancelledRef.current) return
          drawFrame(
            context,
            photo,
            photos[index].fit ?? fit,
            maskCanvas,
            1,
            dimensions.width,
            dimensions.height
          )
          const buffer = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
          if (exportCancelledRef.current) return
          await window.api.exportWriteFrame(index, buffer, photos.length)
        } finally {
          imageCache.release(photoPath)
        }
      }
      if (!exportCancelledRef.current) await window.api.exportStart(config, cycles)
    } catch (error: unknown) {
      if (!exportCancelledRef.current) {
        await window.api.exportCancel().catch(() => undefined)
        setExportProgress({
          stage: 'error',
          current: 0,
          total: photos.length,
          percent: 0,
          message: error instanceof Error ? error.message : String(error)
        })
        setExporting(false)
      }
    } finally {
      if (acquiredMaskPath) imageCache.release(acquiredMaskPath)
    }
  }
  const cancelExport = async (): Promise<void> => {
    exportCancelledRef.current = true
    await window.api.exportCancel()
    setExportProgress({ stage: 'cancelled', current: 0, total: 0, percent: 0 })
    setExporting(false)
  }
  return (
    <section className="panel export-panel" aria-labelledby="export-heading">
      <div className="panel-heading compact">
        <div>
          <h2 id="export-heading">MP4 書き出し</h2>
          <span>高画質プリレンダー</span>
        </div>
      </div>
      <div className="export-controls">
        <label>
          <span>対象スライドショー</span>
          <select
            value={effectiveSlideshowId}
            disabled={exporting}
            onChange={(event) => setSlideshowId(event.target.value)}
          >
            {state.materials.slideshows.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>形式</span>
          <select
            value={exportCodec}
            disabled={exporting}
            onChange={(event) => setExportCodec(event.target.value as ExportConfig['codec'])}
          >
            <option value="hevc10">HEVC 10bit(推奨・グラデーション高画質)</option>
            <option value="h264">H.264(互換性重視)</option>
          </select>
        </label>
        <label>
          <span>解像度</span>
          <select
            value={resolution}
            disabled={exporting}
            onChange={(event) => setResolution(event.target.value as ResolutionPreset)}
          >
            <option value="1080p">1920 × 1080</option>
            <option value="2160p">3840 × 2160</option>
            <option value="custom">カスタム</option>
          </select>
        </label>
        {resolution === 'custom' && (
          <div className="custom-resolution">
            <label>
              <span>幅</span>
              <input
                type="number"
                min="2"
                value={customWidth}
                disabled={exporting}
                onChange={(event) => setCustomWidth(event.target.value)}
              />
            </label>
            <span>×</span>
            <label>
              <span>高さ</span>
              <input
                type="number"
                min="2"
                value={customHeight}
                disabled={exporting}
                onChange={(event) => setCustomHeight(event.target.value)}
              />
            </label>
          </div>
        )}
        <label>
          <span>fps</span>
          <select
            value={exportFps}
            disabled={exporting}
            onChange={(event) => setExportFps(Number(event.target.value))}
          >
            {[24, 25, 29.97, 30, 59.94, 60].map((fps) => (
              <option key={fps} value={fps}>
                {fps}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={exporting}
          onClick={() =>
            void window.api.chooseExportPath().then((path) => {
              if (path) setExportPath(path)
            })
          }
        >
          書き出し先を選択
        </button>
        <span className="export-path" title={exportPath}>
          {exportPath || '未選択'}
        </span>
        <button
          className="primary-button"
          type="button"
          disabled={exporting || playablePhotoCount === 0 || !exportPath}
          onClick={() => void startExport()}
        >
          書き出し開始
        </button>
        {exporting && (
          <button type="button" className="danger" onClick={() => void cancelExport()}>
            キャンセル
          </button>
        )}
      </div>
      <p className="export-codec-note">
        HEVC は Mac / QuickTime でそのまま再生可。古い機器で再生する場合のみ H.264
        を選んでください。
      </p>
      {exportProgress && (
        <div className="export-progress">
          <progress max="100" value={exportProgress.percent} />
          <div>
            <span>
              {exportProgress.stage === 'composing'
                ? `画像を合成中 ${exportProgress.current} / ${exportProgress.total}`
                : exportProgress.stage === 'encoding'
                  ? '動画をエンコード中'
                  : exportProgress.stage === 'done'
                    ? '書き出し完了'
                    : exportProgress.stage === 'cancelled'
                      ? 'キャンセルしました'
                      : 'エラー'}
            </span>
            <strong>{Math.round(exportProgress.percent)}%</strong>
          </div>
          {exportProgress.message && <pre>{exportProgress.message}</pre>}
          {exportProgress.stage === 'done' && exportProgress.outputPath && (
            <button
              type="button"
              onClick={() => void window.api.revealExport(exportProgress.outputPath!)}
            >
              Finder で表示
            </button>
          )}
        </div>
      )}
    </section>
  )
}
