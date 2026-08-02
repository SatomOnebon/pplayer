import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { t as tFn } from '../../../shared/i18n'
import type { Locale } from '../../../shared/types'

export type Translate = (key: string, params?: Record<string, string | number>) => string

interface LocaleContextValue {
  locale: Locale
  t: Translate
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>('ja')

  useEffect(() => {
    const off = window.api.onLanguageChanged(setLocale)
    void window.api.getLanguage().then(setLocale)
    return off
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const translate = useCallback<Translate>((key, params) => tFn(locale, key, params), [locale])
  const value = useMemo(() => ({ locale, t: translate }), [locale, translate])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

function useLocaleContext(): LocaleContextValue {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('LocaleProvider is required')
  return value
}

export function useT(): Translate {
  return useLocaleContext().t
}

export function useLocale(): Locale {
  return useLocaleContext().locale
}
