import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateV1State } from './migration'
import type { AppState } from './types'
import {
  cueNumberToIndex,
  isAuthorizedRequest,
  parseRemoteRequestUrl,
  remoteStatus,
  routeRemoteRequest,
  tokenFromRequest
} from '../main/remoteRouting'

function stateWithCues(): AppState {
  const state = migrateV1State({}, () => 'generated-id')
  state.cues = [
    { ...state.cues[0], id: 'cue-1', label: 'オープニング' },
    { ...state.cues[0], id: 'cue-2', label: '本編' }
  ]
  state.armedCueIndex = 1
  state.activeCueId = 'cue-1'
  state.masterVolume = 0.65
  return state
}

test('Bearer と query のトークンを読み取る', () => {
  assert.equal(tokenFromRequest('Bearer secret', new URL('http://localhost/api/go')), 'secret')
  assert.equal(
    tokenFromRequest(undefined, new URL('http://localhost/api/go?token=query-secret')),
    'query-secret'
  )
  assert.equal(tokenFromRequest(undefined, new URL('http://localhost/api/go')), null)
  assert.equal(
    isAuthorizedRequest('secret', 'Bearer secret', new URL('http://localhost/api/go')),
    true
  )
  assert.equal(
    isAuthorizedRequest('secret', 'Bearer wrong', new URL('http://localhost/api/go')),
    false
  )
})

test('リモートリクエスト URL を例外なしで解析する', () => {
  assert.equal(parseRemoteRequestUrl('http://[', 8722), null)
  assert.equal(
    parseRemoteRequestUrl('/api/status?token=x', 8722)?.href,
    'http://127.0.0.1:8722/api/status?token=x'
  )
  assert.equal(parseRemoteRequestUrl(undefined, 8722)?.href, 'http://127.0.0.1:8722/')
})

test('キュー番号を1始まりから0始まりへ変換する', () => {
  assert.equal(cueNumberToIndex('1'), 0)
  assert.equal(cueNumberToIndex('10'), 9)
  assert.equal(cueNumberToIndex('0'), null)
  assert.equal(cueNumberToIndex('1.5'), null)
})

test('キュー直接発火とアームを PlaybackCommand に変換する', () => {
  const state = stateWithCues()
  assert.deepEqual(routeRemoteRequest(new URL('http://localhost/api/cue/fire/2'), state), {
    type: 'command',
    command: { type: 'fireCue', id: 'cue-2' }
  })
  assert.deepEqual(routeRemoteRequest(new URL('http://localhost/api/cue/arm/1'), state), {
    type: 'command',
    command: { type: 'armCue', id: 'cue-1' }
  })
  assert.equal(
    routeRemoteRequest(new URL('http://localhost/api/cue/fire/3'), state).type,
    'notFound'
  )
})

test('playpause をトグル用 PlaybackCommand に変換する', () => {
  assert.deepEqual(routeRemoteRequest(new URL('http://localhost/api/playpause'), stateWithCues()), {
    type: 'command',
    command: { type: 'playPause' }
  })
})

test('音量を5%刻み・0〜100指定で PlaybackCommand に変換する', () => {
  const state = stateWithCues()
  assert.deepEqual(routeRemoteRequest(new URL('http://localhost/api/volume/up'), state), {
    type: 'command',
    command: { type: 'setMasterVolume', volume: 0.7 }
  })
  assert.deepEqual(routeRemoteRequest(new URL('http://localhost/api/volume/set?value=25'), state), {
    type: 'command',
    command: { type: 'setMasterVolume', volume: 0.25 }
  })
  assert.equal(
    routeRemoteRequest(new URL('http://localhost/api/volume/set?value=101'), state).type,
    'badRequest'
  )
})

test('Companion 用ステータスはキュー番号を1始まりで返す', () => {
  assert.deepEqual(remoteStatus(stateWithCues()), {
    status: 'idle',
    ftbHeld: false,
    activeCueIndex: 1,
    activeCueLabel: 'オープニング',
    armedCueIndex: 2,
    armedCueLabel: '本編',
    masterVolume: 65,
    cueCount: 2
  })
})
