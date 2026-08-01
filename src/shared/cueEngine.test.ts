import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSlideshowCompletion } from './cueEngine.ts'
import type { Cue } from './types.ts'

const cues: Cue[] = [
  {
    id: 'loop',
    label: 'loop',
    materialType: 'slideshow',
    materialId: 's1',
    endBehavior: 'loop'
  },
  {
    id: 'advance',
    label: 'advance',
    materialType: 'slideshow',
    materialId: 's1',
    endBehavior: 'advance'
  },
  {
    id: 'standby',
    label: 'standby',
    materialType: 'slideshow',
    materialId: 's1',
    endBehavior: 'toStandby'
  },
  {
    id: 'hold',
    label: 'hold',
    materialType: 'slideshow',
    materialId: 's1',
    endBehavior: 'hold'
  },
  {
    id: 'blackout',
    label: 'blackout',
    materialType: 'slideshow',
    materialId: 's1',
    endBehavior: 'toBlack'
  }
]

test('スライドショー終了時に loop / 次キュー / 蓋絵 / 静止 / ブラックアウトへ遷移する', () => {
  assert.deepEqual(resolveSlideshowCompletion(cues, 'loop'), { type: 'loop' })
  assert.deepEqual(resolveSlideshowCompletion(cues, 'advance'), {
    type: 'fire',
    cueId: 'standby'
  })
  assert.deepEqual(resolveSlideshowCompletion(cues, 'standby'), { type: 'standby' })
  assert.deepEqual(resolveSlideshowCompletion(cues, 'hold'), { type: 'hold' })
  assert.deepEqual(resolveSlideshowCompletion(cues, 'blackout'), { type: 'blackout' })
})

test('末尾の advance は蓋絵へ遷移する', () => {
  assert.deepEqual(resolveSlideshowCompletion([{ ...cues[1], id: 'last' }], 'last'), {
    type: 'standby'
  })
})
