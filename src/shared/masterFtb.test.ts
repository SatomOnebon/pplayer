import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  beginMasterFtb,
  discardsPendingTransition,
  exitsFtbHeld,
  holdMasterFtb,
  interruptsMasterFtb,
  masterFtbOpacity,
  normalizeFtbDurationMs,
  resumeMasterFtb,
  toggleBlackoutState
} from './masterFtb.ts'

test('FTB は方向・開始時刻・設定時間を保持する', () => {
  assert.deepEqual(beginMasterFtb('down', 1_549, 10_000), {
    startedAt: 10_000,
    durationMs: 1_500,
    direction: 'down'
  })
  assert.deepEqual(beginMasterFtb('up', 3_000, 20_000), {
    startedAt: 20_000,
    durationMs: 3_000,
    direction: 'up'
  })
})

test('FTB ダウン→held→アップでマスター不透明度が往復する', () => {
  const down = { startedAt: 1_000, durationMs: 1_500, direction: 'down' as const }
  assert.equal(masterFtbOpacity(down, false, 1_000), 1)
  assert.equal(masterFtbOpacity(down, false, 1_750), 0.5)
  assert.equal(masterFtbOpacity(down, false, 2_500), 0)
  assert.equal(masterFtbOpacity(null, true, 3_000), 0)

  const up = { startedAt: 3_000, durationMs: 1_500, direction: 'up' as const }
  assert.equal(masterFtbOpacity(up, false, 3_000), 0)
  assert.equal(masterFtbOpacity(up, false, 3_750), 0.5)
  assert.equal(masterFtbOpacity(up, false, 4_500), 1)
  assert.equal(masterFtbOpacity(null, false, 5_000), 1)
})

test('FTB 時間は 100ms 刻みに正規化する', () => {
  assert.equal(normalizeFtbDurationMs(1_549), 1_500)
  assert.equal(normalizeFtbDurationMs(1_550), 1_600)
  assert.equal(normalizeFtbDurationMs(0), 100)
  assert.equal(normalizeFtbDurationMs(Number.NaN), 1_500)
})

test('FTB 中は B・Esc の停止操作・GO・fireCue がランプを中断する', () => {
  assert.equal(interruptsMasterFtb({ type: 'toggleBlackout' }), true)
  assert.equal(interruptsMasterFtb({ type: 'stopToStandby' }), true)
  assert.equal(interruptsMasterFtb({ type: 'go' }), true)
  assert.equal(interruptsMasterFtb({ type: 'fireCue', id: 'cue-1' }), true)
  assert.equal(interruptsMasterFtb({ type: 'masterFtb' }), false)
  assert.equal(interruptsMasterFtb({ type: 'pause' }), false)
})

test('FTB ダウン完了で位置を退避し、アップ開始で同じ位置から再開する', () => {
  const held = holdMasterFtb(
    { status: 'playing', baseTimestamp: 10_000, pausedElapsedMs: 0 },
    12_500
  )
  assert.deepEqual(held, {
    status: 'paused',
    baseTimestamp: null,
    pausedElapsedMs: 2_500,
    ftbHeld: true
  })
  assert.deepEqual(resumeMasterFtb(held.pausedElapsedMs, 'playing', 20_000), {
    status: 'playing',
    baseTimestamp: 17_500,
    ftbHeld: false
  })
})

test('held 中の GO と Esc は held を解除する', () => {
  assert.equal(exitsFtbHeld({ type: 'go' }), true)
  assert.equal(exitsFtbHeld({ type: 'stopToStandby' }), true)
  assert.equal(exitsFtbHeld({ type: 'pause' }), false)
})

test('退出フェード中は F/B だけが保留遷移を破棄する', () => {
  assert.equal(discardsPendingTransition({ type: 'masterFtb' }), true)
  assert.equal(discardsPendingTransition({ type: 'toggleBlackout' }), true)
  assert.equal(discardsPendingTransition({ type: 'go' }), false)
  assert.equal(discardsPendingTransition({ type: 'fireCue', id: 'cue-1' }), false)
  assert.equal(discardsPendingTransition({ type: 'stopToStandby' }), false)
})

test('blackout トグルは slideshow の経過位置を退避して復元する', () => {
  const down = toggleBlackoutState(
    { status: 'playing', baseTimestamp: 5_000, pausedElapsedMs: 0 },
    'idle',
    8_200
  )
  assert.deepEqual(down, {
    state: { status: 'blackout', baseTimestamp: null, pausedElapsedMs: 3_200 },
    previousStatus: 'playing'
  })
  const up = toggleBlackoutState(down.state, down.previousStatus, 15_000)
  assert.deepEqual(up.state, {
    status: 'playing',
    baseTimestamp: 11_800,
    pausedElapsedMs: 3_200
  })
})

test('blackout トグルは still の表示位置も退避して復元する', () => {
  const down = toggleBlackoutState(
    { status: 'idle', baseTimestamp: 2_000, pausedElapsedMs: 0 },
    'idle',
    2_600
  )
  assert.deepEqual(down.state, {
    status: 'blackout',
    baseTimestamp: null,
    pausedElapsedMs: 600
  })
  assert.equal(
    toggleBlackoutState(down.state, down.previousStatus, 9_000).state.baseTimestamp,
    8_400
  )
})
