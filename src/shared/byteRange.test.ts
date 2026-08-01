import assert from 'node:assert/strict'
import test from 'node:test'
import { parseByteRange } from './byteRange.ts'

test('Range ヘッダをファイル範囲と Content-Range に変換する', () => {
  assert.deepEqual(parseByteRange('bytes=100-199', 1000), {
    type: 'range',
    start: 100,
    end: 199,
    length: 100,
    contentRange: 'bytes 100-199/1000'
  })
  assert.deepEqual(parseByteRange('bytes=900-', 1000), {
    type: 'range',
    start: 900,
    end: 999,
    length: 100,
    contentRange: 'bytes 900-999/1000'
  })
  assert.deepEqual(parseByteRange('bytes=-50', 1000), {
    type: 'range',
    start: 950,
    end: 999,
    length: 50,
    contentRange: 'bytes 950-999/1000'
  })
  assert.deepEqual(parseByteRange('bytes=1000-', 1000), { type: 'invalid' })
  assert.deepEqual(parseByteRange(null, 1000), { type: 'none' })
})
