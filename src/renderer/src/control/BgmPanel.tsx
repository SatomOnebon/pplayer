import { useState } from 'react'
import type { LocalBgmState, PlaybackCommand } from '../../../shared/types'
import { LocalBgmSettings } from './LocalBgmSettings'
import { SpotifyBgmSettings } from './SpotifyBgmSettings'

export function BgmPanel({
  localBgm,
  send
}: {
  localBgm: LocalBgmState
  send: (command: PlaybackCommand) => void
}): React.JSX.Element {
  const [source, setSource] = useState<'local' | 'spotify'>('local')
  return (
    <div className="bgm-panel">
      <div className="bgm-source-tabs" role="tablist" aria-label="BGM ソース">
        <button
          type="button"
          role="tab"
          aria-selected={source === 'local'}
          className={source === 'local' ? 'is-active' : undefined}
          onClick={() => setSource('local')}
        >
          ローカル
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === 'spotify'}
          className={source === 'spotify' ? 'is-active' : undefined}
          onClick={() => setSource('spotify')}
        >
          Spotify
        </button>
      </div>
      {source === 'local' ? (
        <LocalBgmSettings localBgm={localBgm} send={send} />
      ) : (
        <SpotifyBgmSettings />
      )}
    </div>
  )
}
