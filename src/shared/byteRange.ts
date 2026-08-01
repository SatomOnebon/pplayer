export type ByteRangeResult =
  | { type: 'none' }
  | { type: 'invalid' }
  | { type: 'range'; start: number; end: number; length: number; contentRange: string }

export function parseByteRange(rangeHeader: string | null, fileSize: number): ByteRangeResult {
  if (rangeHeader === null) return { type: 'none' }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return { type: 'invalid' }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match || (!match[1] && !match[2])) return { type: 'invalid' }

  let start: number
  let end: number
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { type: 'invalid' }
    start = Math.max(0, fileSize - suffixLength)
    end = fileSize - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : fileSize - 1
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= fileSize ||
      end < start
    ) {
      return { type: 'invalid' }
    }
    end = Math.min(end, fileSize - 1)
  }

  return {
    type: 'range',
    start,
    end,
    length: end - start + 1,
    contentRange: `bytes ${start}-${end}/${fileSize}`
  }
}
