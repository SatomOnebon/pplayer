import * as electron from 'electron'
import Store from 'electron-store'
import { LOCALES, t } from '../shared/i18n'
import { IPC, type Locale } from '../shared/types'

let currentLocale: Locale = 'ja'

export function mt(key: string, params?: Record<string, string | number>): string {
  return t(currentLocale, key, params)
}

export class LanguageController {
  private readonly persistence = new Store<{ language: Locale | null }>({
    name: 'language',
    defaults: { language: null }
  })
  private language: Locale

  constructor() {
    const saved = this.persistence.get('language')
    this.language = saved ?? 'ja'
    currentLocale = this.language
  }

  start(): void {
    if (this.persistence.get('language') === null) {
      this.language = /^en/i.test(electron.app.getLocale()) ? 'en' : 'ja'
      this.persistence.set('language', this.language)
    }
    currentLocale = this.language
    this.broadcast()
  }

  getLanguage(): Locale {
    return this.language
  }

  setLanguage(next: Locale): Locale {
    if (!LOCALES.includes(next)) return this.language
    this.language = next
    currentLocale = this.language
    this.persistence.set('language', this.language)
    this.broadcast()
    return this.language
  }

  private broadcast(): void {
    for (const window of electron.BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC.languageChanged, this.language)
      }
    }
  }
}

export function registerLanguageIpc(controller: LanguageController): void {
  electron.ipcMain.handle(IPC.getLanguage, () => controller.getLanguage())
  electron.ipcMain.handle(IPC.setLanguage, (_event, value: unknown) => {
    if (value === 'ja' || value === 'en') return controller.setLanguage(value)
    return controller.getLanguage()
  })
}
