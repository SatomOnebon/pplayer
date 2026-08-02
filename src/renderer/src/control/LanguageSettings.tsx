import type { Locale } from '../../../shared/types'
import { LOCALES } from '../../../shared/i18n'
import { useLocale, useT } from '../i18n/LocaleProvider'

const supportedLocales: readonly string[] = LOCALES

function isLocale(value: string): value is Locale {
  return supportedLocales.includes(value)
}

export function LanguageSettings(): React.JSX.Element {
  const t = useT()
  const locale = useLocale()

  return (
    <section className="panel remote-panel">
      <div className="panel-heading compact">
        <div>
          <h2>{t('language.heading')}</h2>
        </div>
      </div>
      <label className="remote-toggle">
        {t('language.label')}
        <select
          value={locale}
          onChange={(event) => {
            const value = event.target.value
            if (isLocale(value)) void window.api.setLanguage(value)
          }}
        >
          <option value="ja">{t('language.ja')}</option>
          <option value="en">{t('language.en')}</option>
        </select>
      </label>
    </section>
  )
}
