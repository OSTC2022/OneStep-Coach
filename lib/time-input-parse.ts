/** Parse one time token to HH:mm (24h). */
export function parseSingleTimeToken(raw: string): string | null {
  const t = raw.trim().replace(/\s/g, '')
  if (!t) return null

  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(t)
  if (colon) {
    const h = Number(colon[1])
    const m = Number(colon[2])
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    return null
  }

  if (/^\d{3,4}$/.test(t)) {
    const padded = t.padStart(4, '0')
    const h = Number(padded.slice(0, 2))
    const m = Number(padded.slice(2))
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }

  return null
}

/** Parse "18:00~19:30" or a single "18:00". */
export function parseTimeRangeInput(raw: string): { start: string; end: string } | null {
  const t = raw.trim()
  if (!t) return null

  const parts = t.split(/\s*[~～\-–—]\s*/).filter(Boolean)
  if (parts.length >= 2) {
    const start = parseSingleTimeToken(parts[0])
    const end = parseSingleTimeToken(parts[1])
    if (start && end) return { start, end }
    return null
  }

  const single = parseSingleTimeToken(t)
  if (single) return { start: single, end: '' }
  return null
}

export function formatTimeRangeDisplay(start: string, end: string): string {
  if (start && end) return `${start}~${end}`
  return start || end
}
