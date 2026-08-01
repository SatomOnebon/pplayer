import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, test } from 'node:test'
import ffmpegStatic from 'ffmpeg-static'

import { ffmpegClipOpacityExpr } from '../shared/easing.ts'

function opacity16Expr(opacity: string): string {
  return `min(65535\\,max(0\\,(${opacity})*65535))`
}

function rampBlendFilterGraph(
  opacity: string,
  width = 64,
  height = 64,
  rate: string | number = 30,
  duration = 8.5
): string {
  const opacity16 = opacity16Expr(opacity)
  return [
    `[0:v]scale=${width}:${height},setsar=1,fps=${rate},format=gbrp16le[base]`,
    `color=c=white:s=1x1:r=${rate}:d=${duration},format=gbrp16le,geq=r='${opacity16}':g='${opacity16}':b='${opacity16}',scale=${width}:${height}:flags=neighbor[ramp]`,
    `[base][ramp]blend=all_mode=multiply:shortest=1[out]`
  ].join(';')
}

describe('ffmpeg ramp opacity smoke', () => {
  test('1×1 color + geq + scale + blend が通る', () => {
    const executable = ffmpegStatic
    assert.ok(executable, 'ffmpeg-static が見つかりません')

    const opacity = ffmpegClipOpacityExpr({
      fadeInMs: 1500,
      holdMs: 5500,
      fadeOutMs: 1500,
      fadeInEase: 'easeIn',
      fadeOutEase: 'easeOut'
    })
    const filterComplex = rampBlendFilterGraph(opacity)
    const result = spawnSync(
      executable,
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=64x64:d=8.5',
        '-filter_complex',
        filterComplex,
        '-map',
        '[out]',
        '-f',
        'null',
        '-'
      ],
      { encoding: 'utf8' }
    )

    assert.equal(
      result.status,
      0,
      result.stderr || result.stdout || 'ffmpeg が失敗しました'
    )
  })

  test('fadeIn/fadeOut なし (opacity=1) は geq なしの base のみ通る', () => {
    const executable = ffmpegStatic
    assert.ok(executable)

    const opacity = ffmpegClipOpacityExpr({
      fadeInMs: 0,
      holdMs: 1000,
      fadeOutMs: 0,
      fadeInEase: 'linear',
      fadeOutEase: 'linear'
    })
    assert.equal(opacity, '1')
    const result = spawnSync(
      executable,
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=64x64:d=1',
        '-vf',
        'scale=64:64,setsar=1,fps=30,format=gbrp16le',
        '-f',
        'null',
        '-'
      ],
      { encoding: 'utf8' }
    )

    assert.equal(result.status, 0, result.stderr || 'ffmpeg が失敗しました')
  })

  test('分数 fps (29.97) の color r= が通る', () => {
    const executable = ffmpegStatic
    assert.ok(executable)

    const opacity = ffmpegClipOpacityExpr({
      fadeInMs: 1500,
      holdMs: 0,
      fadeOutMs: 0,
      fadeInEase: 'linear',
      fadeOutEase: 'linear'
    })
    const filterComplex = rampBlendFilterGraph(opacity, 64, 64, '30000/1001', 1.5)
    const result = spawnSync(
      executable,
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=64x64:d=1.5',
        '-filter_complex',
        filterComplex,
        '-map',
        '[out]',
        '-f',
        'null',
        '-'
      ],
      { encoding: 'utf8' }
    )

    assert.equal(result.status, 0, result.stderr || 'ffmpeg が失敗しました')
  })
})
