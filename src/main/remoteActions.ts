import type { PlaybackCommand } from '../shared/types'
import type { AppStateStore } from './state'

export class RemoteActions {
  private previousVolume = 1

  constructor(private readonly stateStore: AppStateStore) {}

  apply(command: PlaybackCommand, muteToggle = false): void {
    if (!muteToggle) {
      this.stateStore.apply(command)
      return
    }
    const volume = this.stateStore.getState().masterVolume
    if (volume > 0) {
      this.previousVolume = volume
      this.stateStore.apply({ type: 'setMasterVolume', volume: 0 })
    } else {
      this.stateStore.apply({
        type: 'setMasterVolume',
        volume: this.previousVolume > 0 ? this.previousVolume : 1
      })
    }
  }
}
