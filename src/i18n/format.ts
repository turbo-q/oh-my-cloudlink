import { dateLocaleTag, translate, type Locale } from './index'

export function formatEtaLocalized(locale: Locale, seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return translate(locale, 'format.etaCalculating')
  }
  if (seconds < 1) return translate(locale, 'format.etaAlmostDone')
  const s = Math.round(seconds)
  if (s < 60) return translate(locale, 'format.etaSeconds', { s })
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) {
    return rem > 0
      ? translate(locale, 'format.etaMinutesSeconds', { m, s: rem })
      : translate(locale, 'format.etaMinutes', { m })
  }
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0
    ? translate(locale, 'format.etaHoursMinutes', { h, m: remM })
    : translate(locale, 'format.etaHours', { h })
}

export function formatDateLocalized(locale: Locale, iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(dateLocaleTag(locale), {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}
