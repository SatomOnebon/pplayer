import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cueStartState } from './cueStart.ts'

test('black キューを発火すると静止画と同じ固定表示状態になる', () => {
  assert.deepEqual(
    cueStartState(
      {
        id: 'black-cue',
        label: '黒画面',
        materialType: 'black',
        endBehavior: 'hold',
        fadeInMs: 500,
        fadeOutMs: 800
      },
      12_345
    ),
    { baseTimestamp: 12_345, status: 'idle' }
  )
})
