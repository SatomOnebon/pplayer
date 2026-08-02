import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PlaybackCanvas } from './lib/PlaybackCanvas'
import { useAppState } from './useAppState'
import { LocaleProvider } from './i18n/LocaleProvider'
import './styles.css'

export function Display(): React.JSX.Element {
  const state = useAppState()

  return (
    <main className="display">
      <PlaybackCanvas state={state} muted={false} notifyMediaEnded aria-label="本番表示" />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <Display />
    </LocaleProvider>
  </StrictMode>
)
