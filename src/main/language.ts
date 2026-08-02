import { app, BrowserWindow, ipcMain } from 'electron'
import Store from 'electron-store'
import { LOCALES } from '../shared/i18n'
import { IPC, type Locale } from '../shared/types'

export class LanguageController {
  private readonly persistence = new Store<{ language: Locale | null }>({
    name: 'language',
    defaults: { language: null }
  })
  private language: Locale

  constructor() {
    const saved = this.persistence.get('language')
    this.language = saved ?? 'ja'
  }

  start(): void {
    if (this.persistence.get('language') === null) {
      this.language = /^en/i.test(app.getLocale()) ? 'en' : 'ja'
      this.persistence.set('language', this.language)
    }
    this.broadcast()
  }

  getLanguage(): Locale {
    return this.language
  }

  setLanguage(next: Locale): Locale {
    if (!LOCALES.includes(next)) return this.language
    this.language = next
    this.persistence.set('language', this.language)
    this.broadcast()
    return this.language
  }

  private broadcast(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC.languageChanged, this.language)
      }
    }
  }
}

export function registerLanguageIpc(controller: LanguageController): void {
  ipcMain.handle(IPC.getLanguage, () => controller.getLanguage())
  ipcMain.handle(IPC.setLanguage, (_event, value: unknown) => {
    if (value === 'ja' || value === 'en') return controller.setLanguage(value)
    return controller.getLanguage()
  })
}
