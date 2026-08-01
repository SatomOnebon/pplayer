interface SpotifyWebPlaybackTrack {
  name: string
  artists: Array<{ name: string }>
}

interface SpotifyWebPlaybackState {
  paused: boolean
  loading: boolean
  track_window: {
    current_track: SpotifyWebPlaybackTrack
  }
}

interface SpotifyWebPlaybackError {
  message: string
}

interface SpotifyWebPlaybackPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  activateElement(): Promise<void>
  pause(): Promise<void>
  togglePlay(): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
  setVolume(volume: number): Promise<void>
  addListener(event: 'ready' | 'not_ready', callback: (value: { device_id: string }) => void): void
  addListener(
    event: 'player_state_changed',
    callback: (state: SpotifyWebPlaybackState | null) => void
  ): void
  addListener(
    event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
    callback: (error: SpotifyWebPlaybackError) => void
  ): void
}

interface SpotifyWebPlaybackPlayerConstructor {
  new (options: {
    name: string
    getOAuthToken: (callback: (token: string) => void) => void
    volume: number
  }): SpotifyWebPlaybackPlayer
}

interface Window {
  Spotify?: {
    Player: SpotifyWebPlaybackPlayerConstructor
  }
  onSpotifyWebPlaybackSDKReady?: () => void
}
