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
  // Spotify 無効ビルド（PPLAYER_SKIP_VMP=1）ではタブ・パネルごと出さず、ローカル固定。
  const activeSource = __SPOTIFY_ENABLED__ ? source : 'local'
  return (
    <div className="bgm-panel">
      <div className="bgm-source-tabs" role="tablist" aria-label="BGM ソース">
        <button
          type="button"
          role="tab"
          aria-selected={activeSource === 'local'}
          className={activeSource === 'local' ? 'is-active' : undefined}
          onClick={() => setSource('local')}
        >
          ローカル
        </button>
        {__SPOTIFY_ENABLED__ && (
          <button
            type="button"
            role="tab"
            aria-selected={activeSource === 'spotify'}
            className={activeSource === 'spotify' ? 'is-active' : undefined}
            onClick={() => setSource('spotify')}
          >
            Spotify
          </button>
        )}
      </div>
      {activeSource === 'local' ? (
        <LocalBgmSettings localBgm={localBgm} send={send} />
      ) : (
        <SpotifyBgmSettings />
      )}
    </div>
  )
}
