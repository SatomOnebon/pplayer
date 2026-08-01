import assert from 'node:assert/strict'
import test from 'node:test'
import { beginStillExit, stillFadeInOpacity } from './stillFade.ts'
import { migrateV1State } from './migration.ts'

test('静止画の入場 opacity を基準時刻から線形補間する', () => {
  assert.equal(stillFadeInOpacity(1_000, 2_000, 1_000), 0)
  assert.equal(stillFadeInOpacity(1_000, 2_000, 2_000), 0.5)
  assert.equal(stillFadeInOpacity(1_000, 2_000, 3_500), 1)
  assert.equal(stillFadeInOpacity(1_000, 0, 1_000), 1)
})

test('静止画退出フェードは遷移を保留し、ランプ情報と遷移先を保持する', () => {
  const state = migrateV1State({})
  state.materials.stills.push({
    id: 'still-1',
    name: '蓋',
    kind: 'image',
    filePath: '/still.png',
    fit: 'contain'
  })
  state.cues.push({
    id: 'still-cue',
    label: '静止画',
    materialType: 'still',
    materialId: 'still-1',
    endBehavior: 'hold',
    fadeInMs: 300,
    fadeOutMs: 1_200
  })
  state.activeCueId = 'still-cue'

  assert.deepEqual(beginStillExit(state, { type: 'fireCue', cueId: state.cues[0].id }, 5_000), {
    ftb: { startedAt: 5_000, durationMs: 1_200, direction: 'down' },
    pendingTransition: { type: 'fireCue', cueId: state.cues[0].id }
  })
})
