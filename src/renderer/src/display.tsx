import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { PlaybackCanvas } from './lib/PlaybackCanvas'
import { useAppState } from './useAppState'
import { LocaleProvider, useT } from './i18n/LocaleProvider'
import './styles.css'

export function Display(): React.JSX.Element {
  const t = useT()
  const state = useAppState()

  useEffect(() => {
    document.title = t('app.displayTitle')
  }, [t])

  return (
    <main className="display">
      <PlaybackCanvas state={state} muted={false} notifyMediaEnded aria-label={t('a11y.display')} />
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
