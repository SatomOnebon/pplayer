import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildCycles, computeTimeline, resolvePhotoIndex, type TimelineCycle } from './timeline.ts'

const standardCycle: TimelineCycle = {
  fadeInMs: 1_500,
  holdMs: 5_500,
  fadeOutMs: 1_500,
  fadeInEase: 'linear',
  fadeOutEase: 'linear'
}

describe('computeTimeline', () => {
  test('fadeIn、hold、fadeOut の境界で phase と opacity を計算する', () => {
    assert.deepEqual(computeTimeline(0, [standardCycle], false), {
      photoOffset: 0,
      phase: 'fadeIn',
      opacity: 0,
      finished: false
    })
    assert.equal(computeTimeline(750, [standardCycle], false).opacity, 0.5)
    assert.deepEqual(computeTimeline(1_500, [standardCycle], false), {
      photoOffset: 0,
      phase: 'hold',
      opacity: 1,
      finished: false
    })
    assert.deepEqual(computeTimeline(7_000, [standardCycle], false), {
      photoOffset: 0,
      phase: 'fadeOut',
      opacity: 1,
      finished: false
    })
    assert.equal(computeTimeline(7_750, [standardCycle], false).opacity, 0.5)
    assert.ok(
      Math.abs(computeTimeline(8_499, [standardCycle], false).opacity - 1 / 1_500) < Number.EPSILON
    )
  })

  test('easeIn fadeIn の中間点で cubic 曲線の opacity を返す', () => {
    const cycle: TimelineCycle = {
      ...standardCycle,
      fadeInEase: 'easeIn'
    }
    assert.equal(computeTimeline(750, [cycle], false).opacity, 0.125)
  })

  test('easeOut fadeOut の中間点で qsin 曲線の opacity を返す', () => {
    const cycle: TimelineCycle = {
      ...standardCycle,
      fadeOutEase: 'easeOut'
    }
    const opacity = computeTimeline(7_750, [cycle], false).opacity
    assert.ok(Math.abs(opacity - (1 - Math.sin(Math.PI / 4))) < 1e-10)
  })

  test('非 loop は終端で finished、loop は先頭へ戻る', () => {
    assert.deepEqual(computeTimeline(8_500, [standardCycle], false), {
      photoOffset: 0,
      phase: 'black',
      opacity: 0,
      finished: true
    })
    assert.deepEqual(computeTimeline(8_500, [standardCycle], true), {
      photoOffset: 0,
      phase: 'fadeIn',
      opacity: 0,
      finished: false
    })
  })

  test('fadeIn と fadeOut が 0ms の cycle を処理する', () => {
    const cycle: TimelineCycle = {
      fadeInMs: 0,
      holdMs: 1_000,
      fadeOutMs: 0,
      fadeInEase: 'linear',
      fadeOutEase: 'linear'
    }

    assert.deepEqual(computeTimeline(0, [cycle], false), {
      photoOffset: 0,
      phase: 'hold',
      opacity: 1,
      finished: false
    })
    assert.deepEqual(computeTimeline(1_000, [cycle], false), {
      photoOffset: 0,
      phase: 'black',
      opacity: 0,
      finished: true
    })
  })

  test('cycle 長が異なる場合も経過時間に対応する photoOffset を返す', () => {
    const cycles: TimelineCycle[] = [
      {
        fadeInMs: 100,
        holdMs: 200,
        fadeOutMs: 100,
        fadeInEase: 'linear',
        fadeOutEase: 'linear'
      },
      {
        fadeInMs: 200,
        holdMs: 600,
        fadeOutMs: 200,
        fadeInEase: 'linear',
        fadeOutEase: 'linear'
      }
    ]

    assert.equal(computeTimeline(399, cycles, false).photoOffset, 0)
    assert.deepEqual(computeTimeline(400, cycles, false), {
      photoOffset: 1,
      phase: 'fadeIn',
      opacity: 0,
      finished: false
    })
    assert.equal(computeTimeline(900, cycles, false).photoOffset, 1)
  })

  test('空配列と合計 cycle 長 0 は finished の black を返す', () => {
    assert.deepEqual(computeTimeline(0, [], false), {
      photoOffset: 0,
      phase: 'black',
      opacity: 0,
      finished: true
    })
    assert.deepEqual(
      computeTimeline(
        0,
        [{ fadeInMs: 0, holdMs: 0, fadeOutMs: 0, fadeInEase: 'linear', fadeOutEase: 'linear' }],
        true
      ),
      {
        photoOffset: 0,
        phase: 'black',
        opacity: 0,
        finished: true
      }
    )
  })

  test('負の elapsed は未完了の black を返す', () => {
    assert.deepEqual(computeTimeline(-1, [standardCycle], false), {
      photoOffset: 0,
      phase: 'black',
      opacity: 0,
      finished: false
    })
  })

  test('loop 時は elapsed を全 cycle の合計時間で剰余する', () => {
    const cycles: TimelineCycle[] = [
      {
        fadeInMs: 500,
        holdMs: 500,
        fadeOutMs: 500,
        fadeInEase: 'linear',
        fadeOutEase: 'linear'
      },
      {
        fadeInMs: 250,
        holdMs: 500,
        fadeOutMs: 250,
        fadeInEase: 'linear',
        fadeOutEase: 'linear'
      }
    ]

    assert.deepEqual(computeTimeline(3_500, cycles, true), computeTimeline(1_000, cycles, true))
  })
})

describe('buildCycles', () => {
  const timing = {
    fadeInMs: 1_500,
    holdMs: 5_500,
    fadeOutMs: 1_500,
    fadeInEase: 'linear' as const,
    fadeOutEase: 'linear' as const
  }
  const photos = [
    {
      id: 'a',
      filePath: '/a.jpg',
      fileName: 'a.jpg',
      excluded: false,
      fit: null,
      fadeInMs: null,
      holdMs: 2_000,
      fadeOutMs: null
    },
    {
      id: 'b',
      filePath: '/b.jpg',
      fileName: 'b.jpg',
      excluded: false,
      fit: null,
      fadeInMs: 300,
      holdMs: null,
      fadeOutMs: 400
    },
    {
      id: 'c',
      filePath: '/c.jpg',
      fileName: 'c.jpg',
      excluded: false,
      fit: null,
      fadeInMs: null,
      holdMs: null,
      fadeOutMs: null
    }
  ]

  test('写真ごとの override を適用し、非 loop は baseIndex 以降を返す', () => {
    assert.deepEqual(buildCycles(photos, timing, 1, false), [
      { fadeInMs: 300, holdMs: 5_500, fadeOutMs: 400, fadeInEase: 'linear', fadeOutEase: 'linear' },
      standardCycle
    ])
  })

  test('loop は baseIndex を先頭として末尾から先頭へ回転する', () => {
    assert.deepEqual(buildCycles(photos, timing, 2, true), [
      standardCycle,
      { fadeInMs: 1_500, holdMs: 2_000, fadeOutMs: 1_500, fadeInEase: 'linear', fadeOutEase: 'linear' },
      { fadeInMs: 300, holdMs: 5_500, fadeOutMs: 400, fadeInEase: 'linear', fadeOutEase: 'linear' }
    ])
  })
})

describe('resolvePhotoIndex', () => {
  test('非 loop の終端を越える photoOffset は null を返す', () => {
    assert.equal(resolvePhotoIndex(2, 1, 4, false), 3)
    assert.equal(resolvePhotoIndex(2, 2, 4, false), null)
  })
})
