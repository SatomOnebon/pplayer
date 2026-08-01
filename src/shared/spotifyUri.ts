export function normalizeSpotifyContextUri(value: string): string | null {
  const trimmed = value.trim()
  if (/^spotify:(playlist|album|artist):[^:\s/]+$/.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null
    const match = url.pathname.match(/^\/(playlist|album|artist)\/([^/\s]+)\/?$/)
    return match ? `spotify:${match[1]}:${match[2]}` : null
  } catch {
    return null
  }
}
