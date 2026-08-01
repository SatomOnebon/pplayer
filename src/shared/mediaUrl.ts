const MEDIA_ORIGIN = 'media://local'

export function toMediaUrl(filePath: string, reloadToken?: number): string {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
  const version =
    reloadToken && reloadToken > 0 ? `?v=${encodeURIComponent(String(reloadToken))}` : ''
  return `${MEDIA_ORIGIN}/${encodedPath}${version}`
}

export function toThumbUrl(filePath: string, size = 256, reloadToken?: number): string {
  const version =
    reloadToken && reloadToken > 0 ? `&v=${encodeURIComponent(String(reloadToken))}` : ''
  return `${toMediaUrl(filePath)}?thumb=${encodeURIComponent(String(size))}${version}`
}

export function parseMediaUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'media:' || parsed.hostname !== 'local') return null
    return parsed.pathname
      .slice(1)
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/')
  } catch {
    return null
  }
}

export function parseThumbSize(url: string): number | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'media:' || parsed.hostname !== 'local') return null
    const value = parsed.searchParams.get('thumb')
    if (value === null || !/^\d+$/.test(value)) return null
    const size = Number(value)
    return Number.isSafeInteger(size) && size > 0 ? size : null
  } catch {
    return null
  }
}
