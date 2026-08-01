import { useEffect } from 'react'
import type { Cue, PlaybackCommand } from '../../../shared/types'

export function useKeyboardShortcuts(
  activeCueType: Cue['materialType'] | undefined,
  send: (command: PlaybackCommand) => void,
  closePreview: () => void
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (
        event.repeat ||
        (target instanceof HTMLElement &&
          (target.matches('input, textarea, select') || target.isContentEditable))
      ) {
        return
      }
      if (event.code === 'Escape') {
        closePreview()
        send({ type: 'stopToStandby' })
      } else if (event.code === 'Space') {
        event.preventDefault()
        send({ type: 'go' })
      } else if (event.code === 'ArrowRight' && activeCueType === 'slideshow') {
        event.preventDefault()
        send({ type: 'next' })
      } else if (event.code === 'ArrowLeft' && activeCueType === 'slideshow') {
        event.preventDefault()
        send({ type: 'prev' })
      } else if (event.code === 'KeyB') {
        event.preventDefault()
        send({ type: 'toggleBlackout' })
      } else if (event.code === 'KeyF') {
        event.preventDefault()
        send({ type: 'masterFtb' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeCueType, closePreview, send])
}
