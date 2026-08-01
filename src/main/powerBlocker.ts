import { BrowserWindow, ipcMain, powerSaveBlocker } from 'electron'
import Store from 'electron-store'
import { IPC, type PowerSettings, type PowerSettingsState } from '../shared/types'

export class PowerBlockerController {
  private readonly persistence = new Store<{ settings: PowerSettings }>({
    name: 'power',
    defaults: { settings: { preventDisplaySleep: true } }
  })
  private blockerId: number | null = null
  private settings: PowerSettings

  constructor() {
    const saved = this.persistence.get('settings')
    this.settings = {
      preventDisplaySleep: saved.preventDisplaySleep !== false
    }
    this.persist()
  }

  start(): void {
    this.applyBlocker()
    this.broadcast()
  }

  getState(): PowerSettingsState {
    return {
      ...this.settings,
      active: this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)
    }
  }

  setEnabled(enabled: boolean): PowerSettingsState {
    this.settings.preventDisplaySleep = enabled
    this.persist()
    this.applyBlocker()
    this.broadcast()
    return this.getState()
  }

  stop(): void {
    if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) {
      powerSaveBlocker.stop(this.blockerId)
    }
    this.blockerId = null
  }

  private applyBlocker(): void {
    if (this.settings.preventDisplaySleep) {
      if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) {
        return
      }
      if (this.blockerId !== null) {
        try {
          powerSaveBlocker.stop(this.blockerId)
        } catch {
          // stale ID の破棄失敗は、新しい抑制の確立を妨げない
        }
        this.blockerId = null
      }
      this.blockerId = powerSaveBlocker.start('prevent-display-sleep')
      return
    }

    if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) {
      powerSaveBlocker.stop(this.blockerId)
    }
    this.blockerId = null
  }

  private persist(): void {
    this.persistence.set('settings', this.settings)
  }

  private broadcast(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC.powerSettingsChanged, this.getState())
      }
    }
  }
}

export function registerPowerIpc(controller: PowerBlockerController): void {
  ipcMain.handle(IPC.getPowerSettings, () => controller.getState())
  ipcMain.handle(IPC.setPowerSettings, (_event, value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return controller.getState()
    }
    const settings = value as Record<string, unknown>
    if (typeof settings.preventDisplaySleep === 'boolean') {
      return controller.setEnabled(settings.preventDisplaySleep)
    }
    return controller.getState()
  })
}
