import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  applyFadeEasing,
  ffmpegClipOpacityExpr,
  ffmpegEaseExpr,
  isFadeEasing
} from './easing.ts'

describe('applyFadeEasing', () => {
  test('linear は t をそのまま返す', () => {
    assert.equal(applyFadeEasing(0.5, 'linear'), 0.5)
  })

  test('easeIn は t^3 を返す', () => {
    assert.equal(applyFadeEasing(0.5, 'easeIn'), 0.125)
  })

  test('easeOut は sin 曲線を返す', () => {
    assert.ok(Math.abs(applyFadeEasing(0.5, 'easeOut') - Math.sin(Math.PI / 4)) < 1e-10)
  })

  test('easeInOut は cos 曲線を返す', () => {
    assert.ok(Math.abs(applyFadeEasing(0.5, 'easeInOut') - 0.5) < 1e-10)
  })

  test('範囲外の t は clamp する', () => {
    assert.equal(applyFadeEasing(-1, 'linear'), 0)
    assert.equal(applyFadeEasing(2, 'linear'), 1)
  })
})

describe('ffmpegEaseExpr', () => {
  test('linear は clamp 付き t を返す', () => {
    assert.match(ffmpegEaseExpr('T/1.5', 'linear'), /min\(1\\,max\(0\\,T\/1\.5\)\)/)
  })

  test('easeIn は pow を含む', () => {
    assert.match(ffmpegEaseExpr('t', 'easeIn'), /pow\(.*\\,3\)/)
  })

  test('easeOut は sin を含む', () => {
    assert.match(ffmpegEaseExpr('t', 'easeOut'), /sin\(.*PI\/2\)/)
  })

  test('easeInOut は cos を含む', () => {
    assert.match(ffmpegEaseExpr('t', 'easeInOut'), /0\.5-0\.5\*cos\(.*PI\)/)
  })
})

describe('ffmpegClipOpacityExpr', () => {
  test('fadeIn/fadeOut なしは 1', () => {
    assert.equal(
      ffmpegClipOpacityExpr({
        fadeInMs: 0,
        holdMs: 5500,
        fadeOutMs: 0,
        fadeInEase: 'linear',
        fadeOutEase: 'linear'
      }),
      '1'
    )
  })

  test('fadeIn easeIn なら pow を含む', () => {
    const expr = ffmpegClipOpacityExpr({
      fadeInMs: 1500,
      holdMs: 5500,
      fadeOutMs: 0,
      fadeInEase: 'easeIn',
      fadeOutEase: 'linear'
    })
    assert.match(expr, /pow\(.*\\,3\)/)
    assert.doesNotMatch(expr, /1-/)
  })

  test('fadeOut easeOut なら 1- と sin を含む', () => {
    const expr = ffmpegClipOpacityExpr({
      fadeInMs: 0,
      holdMs: 5500,
      fadeOutMs: 1500,
      fadeInEase: 'linear',
      fadeOutEase: 'easeOut'
    })
    assert.match(expr, /1-sin\(.*PI\/2\)/)
  })

  test('fadeIn/fadeOut 両方あるとき if(lt(T を含む', () => {
    const expr = ffmpegClipOpacityExpr({
      fadeInMs: 1500,
      holdMs: 5500,
      fadeOutMs: 1500,
      fadeInEase: 'easeInOut',
      fadeOutEase: 'easeInOut'
    })
    assert.match(expr, /if\(lt\(T\\,/)
    assert.match(expr, /0\.5-0\.5\*cos\(.*PI\)/)
    assert.match(expr, /1-\(0\.5-0\.5\*cos/)
  })
})

describe('export ramp filter shape', () => {
  test('curve= を含まず color/geq/blend を含む', () => {
    const opacity = ffmpegClipOpacityExpr({
      fadeInMs: 1500,
      holdMs: 5500,
      fadeOutMs: 1500,
      fadeInEase: 'easeIn',
      fadeOutEase: 'easeOut'
    })
    const opacity16 = `min(65535\\,max(0\\,(${opacity})*65535))`
    const ramp = `color=c=white:s=1x1:r=30:d=8.500,format=gbrp16le,geq=r='${opacity16}':g='${opacity16}':b='${opacity16}',scale=1920:1080:flags=neighbor`
    const blend = '[base0][ramp0]blend=all_mode=multiply:shortest=1[v0]'
    assert.doesNotMatch(ramp, /curve=/)
    assert.match(ramp, /color=c=white:s=1x1/)
    assert.match(ramp, /geq=/)
    assert.doesNotMatch(ramp, /r\(X\\,Y\)/)
    assert.match(blend, /blend=all_mode=multiply/)
    assert.match(ramp, /pow\(.*\\,3\)/)
    assert.match(ramp, /1-sin\(.*PI\/2\)/)
  })

  test('fadeIn/fadeOut なしは geq/blend 不要', () => {
    const opacity = ffmpegClipOpacityExpr({
      fadeInMs: 0,
      holdMs: 5500,
      fadeOutMs: 0,
      fadeInEase: 'linear',
      fadeOutEase: 'linear'
    })
    assert.equal(opacity, '1')
    const filter = 'scale=1920:1080,setsar=1,fps=30,format=gbrp16le'
    assert.doesNotMatch(filter, /geq=/)
    assert.doesNotMatch(filter, /blend=/)
  })
})

describe('isFadeEasing', () => {
  test('有効な easing のみ true', () => {
    assert.equal(isFadeEasing('linear'), true)
    assert.equal(isFadeEasing('easeInOut'), true)
    assert.equal(isFadeEasing('invalid'), false)
    assert.equal(isFadeEasing(null), false)
  })
})
