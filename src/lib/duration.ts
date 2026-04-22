// Re-export from forgetting-curve to avoid duplication
export { parseDurationSec as parseDuration } from './forgetting-curve'

/** Convert seconds → "HH:MM:SS" */
export function secondsToHms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Null-safe wrapper: convert seconds → "HH:MM:SS" or null */
export function secondsToHmsNullable(sec: number | null): string | null {
  return sec === null ? null : secondsToHms(sec)
}

/** Parse "HH:MM:SS", "MM:SS", or "SS" → seconds (null on invalid) */
export function hmsToSeconds(hms: string): number | null {
  const parts = hms.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

/** Format seconds difference as HH:MM:SS (leading zero segments omitted) */
export function fmtDiff(sec: number): string {
  const abs = Math.abs(sec)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  const ss = String(s).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  if (h > 0) return `${h}:${mm}:${ss}`
  if (m >= 10) return `${mm}:${ss}`
  return `${m}:${ss}`
}
