import { useEffect, useState } from 'react'
import type { AppState } from '../../shared/types'
import { selectEditingAppState, type EditingAppState } from '../../shared/migration'

export function useAppState(): EditingAppState | null {
  const [state, setState] = useState<EditingAppState | null>(null)

  useEffect(() => {
    let active = true
    void window.api.getState().then((initialState) => {
      if (active) setState(selectEditingAppState(initialState))
    })
    const unsubscribe = window.api.onStateChanged((nextState: AppState) => {
      setState(selectEditingAppState(nextState))
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return state
}
