import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clampVideoFadeMs, videoFadeOpacity } from './videoFade.ts'

test('動画フェードを開始時と終端で linear に計算する', () => {
  assert.equal(videoFadeOpacity(0, 10, 2_000, 3_000, true), 0)
  assert.equal(videoFadeOpacity(1, 10, 2_000, 3_000, true), 0.5)
  assert.equal(videoFadeOpacity(8.5, 10, 2_000, 3_000, true), 0.5)
  assert.equal(videoFadeOpacity(10, 10, 2_000, 3_000, true), 0)
})

test('duration 未取得と hold ではフェードアウトを適用しない', () => {
  assert.equal(videoFadeOpacity(9, Number.NaN, 0, 3_000, true), 1)
  assert.equal(videoFadeOpacity(9, 10, 0, 3_000, false), 1)
})

test('動画フェード設定を 0〜10秒に clamp する', () => {
  assert.equal(clampVideoFadeMs(-100), 0)
  assert.equal(clampVideoFadeMs(12_000), 10_000)
})
