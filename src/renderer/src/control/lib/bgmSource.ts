let active: 'local' | 'spotify' | null = null

export function setActiveBgmSource(source: 'local' | 'spotify'): void {
  active = source
}

export function getActiveBgmSource(): 'local' | 'spotify' | null {
  return active
}
