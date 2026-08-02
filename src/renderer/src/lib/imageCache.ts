import { toMediaUrl } from '../../../shared/mediaUrl'

interface CacheEntry {
  promise: Promise<ImageBitmap>
  bitmap: ImageBitmap | null
  lastUsed: number
  refCount: number
}

export class ImageLoadError extends Error {
  constructor(readonly status: number) {
    super(`Image load failed: ${status}`)
  }
}

export class ImageCache {
  private readonly entries = new Map<string, CacheEntry>()
  private accessCounter = 0

  constructor(private readonly capacity = 8) {}

  load(filePath: string, reloadToken?: number): Promise<ImageBitmap> {
    return this.getOrCreateEntry(filePath, reloadToken).promise
  }

  async acquire(filePath: string, reloadToken?: number): Promise<ImageBitmap> {
    const entry = this.getOrCreateEntry(filePath, reloadToken)
    entry.refCount += 1
    try {
      return await entry.promise
    } catch (error: unknown) {
      entry.refCount -= 1
      this.evict()
      throw error
    }
  }

  release(filePath: string, reloadToken?: number): void {
    const entry = this.entries.get(this.cacheKey(filePath, reloadToken))
    if (!entry || entry.refCount <= 0) return
    entry.refCount -= 1
    this.evict()
  }

  private getOrCreateEntry(filePath: string, reloadToken?: number): CacheEntry {
    const key = this.cacheKey(filePath, reloadToken)
    const existing = this.entries.get(key)
    if (existing) {
      existing.lastUsed = ++this.accessCounter
      return existing
    }
    const entry: CacheEntry = {
      promise: Promise.resolve(null as unknown as ImageBitmap),
      bitmap: null,
      lastUsed: ++this.accessCounter,
      refCount: 0
    }
    entry.promise = fetch(toMediaUrl(filePath, reloadToken))
      .then((response) => {
        if (!response.ok) throw new ImageLoadError(response.status)
        return response.blob()
      })
      .then(createImageBitmap)
      .then((bitmap) => {
        entry.bitmap = bitmap
        this.evict()
        return bitmap
      })
      .catch((error: unknown) => {
        if (this.entries.get(key) === entry) this.entries.delete(key)
        throw error
      })
    this.entries.set(key, entry)
    this.evict()
    return entry
  }

  get(filePath: string, reloadToken?: number): ImageBitmap | null {
    const entry = this.entries.get(this.cacheKey(filePath, reloadToken))
    if (!entry) return null
    entry.lastUsed = ++this.accessCounter
    return entry.bitmap
  }

  preload(
    files: readonly { filePath: string; reloadToken?: number }[],
    currentIndex: number,
    loop: boolean
  ): void {
    if (currentIndex < 0 || currentIndex >= files.length) return
    const selected = [files[currentIndex]]
    const nextIndex = currentIndex + 1
    if (nextIndex < files.length) selected.push(files[nextIndex])
    else if (loop && files.length > 1) selected.push(files[0])
    for (const file of selected) {
      void this.load(file.filePath, file.reloadToken).catch(() => undefined)
    }
  }

  private cacheKey(filePath: string, reloadToken?: number): string {
    return `${filePath}|${reloadToken ?? 0}`
  }

  private evict(): void {
    while (this.entries.size > this.capacity) {
      let oldestPath: string | null = null
      let oldestUse = Infinity
      for (const [path, entry] of this.entries) {
        if (entry.bitmap === null || entry.refCount > 0) continue
        if (entry.lastUsed < oldestUse) {
          oldestPath = path
          oldestUse = entry.lastUsed
        }
      }
      if (oldestPath === null) return
      const removed = this.entries.get(oldestPath)
      this.entries.delete(oldestPath)
      const bitmap = removed?.bitmap
      if (bitmap) setTimeout(() => bitmap.close(), 0)
    }
  }
}

export const imageCache = new ImageCache()
