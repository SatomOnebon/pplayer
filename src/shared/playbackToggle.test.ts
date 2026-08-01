import assert from 'node:assert/strict'
import test from 'node:test'
import { isPlaybackCommand } from '../main/validation'
import { resolvePlayPauseCommand } from './playbackToggle'

test('playPause は実行中キューの playing と paused を相互に切り替える', () => {
  assert.deepEqual(resolvePlayPauseCommand({ activeCueId: 'cue-1', status: 'playing' }), {
    type: 'pause'
  })
  assert.deepEqual(resolvePlayPauseCommand({ activeCueId: 'cue-1', status: 'paused' }), {
    type: 'play'
  })
})

test('playPause は FTB held 相当の paused を既存 play 処理へ委譲する', () => {
  assert.deepEqual(resolvePlayPauseCommand({ activeCueId: 'cue-1', status: 'paused' }), {
    type: 'play'
  })
})

test('playPause は実行中でない状態では no-op にする', () => {
  assert.equal(resolvePlayPauseCommand({ activeCueId: null, status: 'playing' }), null)
  assert.equal(resolvePlayPauseCommand({ activeCueId: 'cue-1', status: 'idle' }), null)
  assert.equal(resolvePlayPauseCommand({ activeCueId: 'cue-1', status: 'blackout' }), null)
})

test('playPause コマンドを validation が受理する', () => {
  assert.equal(isPlaybackCommand({ type: 'playPause' }), true)
})
