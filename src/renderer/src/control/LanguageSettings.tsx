import type { Locale } from '../../../shared/types'
import { useLocale, useT } from '../i18n/LocaleProvider'

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
          onChange={(event) => void window.api.setLanguage(event.target.value as Locale)}
        >
          <option value="ja">{t('language.ja')}</option>
          <option value="en">{t('language.en')}</option>
        </select>
      </label>
    </section>
  )
}
