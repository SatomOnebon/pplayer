import { t } from '../../../shared/i18n'
import type { Locale } from '../../../shared/types'

export function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1)
}

export function formatDuration(milliseconds: number, locale: Locale): string {
  if (milliseconds < 60_000) return t(locale, 'time.seconds', { s: seconds(milliseconds) })
  const totalSeconds = Math.round(milliseconds / 1000)
  return t(locale, 'time.minutesSeconds', {
    m: Math.floor(totalSeconds / 60),
    s: totalSeconds % 60
  })
}

export function fileName(path: string | null, locale: Locale): string {
  if (!path) return t(locale, 'common.notSelected')
  return path.split(/[\\/]/).pop() ?? path
}
