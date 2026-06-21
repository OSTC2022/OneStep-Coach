import {
  preloadScreenshotOcrWorker,
  recognizeRunningScreenshotText,
} from '@/lib/running-league/screenshot-ocr'

export type RunningScreenshotParseResult = {
  distanceKm: number | null
  loggedAt: string | null
  rawText: string
}

export { preloadScreenshotOcrWorker }

function parseKmToken(token: string): number | null {
  const normalized = token.replace(',', '.').trim()
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0 || value > 200) return null
  return Math.round(value * 100) / 100
}

export function parseDistanceFromOcrText(text: string): number | null {
  const normalized = text.replace(/\s+/g, ' ')

  const labeledPatterns = [
    /(?:거리|distance|총\s*거리|운동\s*거리)[^\d]{0,24}(\d{1,2}[,.]\d{1,2})/i,
    /(?:거리|distance)[^\d]{0,12}(\d{1,2})\s*(?:km|KM|킬로)/i,
  ]

  for (const pattern of labeledPatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const km = parseKmToken(match[1])
      if (km != null) return km
    }
  }

  const matches: number[] = []
  const distancePattern =
    /(\d{1,2}[,.]\d{1,2})\s*(?:km|KM|킬로미터|킬로|키로)|(?:km|KM)\s*(\d{1,2}[,.]\d{1,2})/gi

  let match: RegExpExecArray | null
  while ((match = distancePattern.exec(normalized)) !== null) {
    const token = match[1] ?? match[2]
    const km = parseKmToken(token)
    if (km != null) matches.push(km)
  }

  if (matches.length === 0) {
    const looseNumber = normalized.match(/(\d{1,2}[,.]\d{2})/)
    if (looseNumber?.[1]) {
      const km = parseKmToken(looseNumber[1])
      if (km != null && km >= 1) return km
    }
    return null
  }

  return Math.max(...matches)
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function parseDateFromOcrText(text: string, today = new Date()): string | null {
  const normalized = text.replace(/\s+/g, ' ')

  const isoLike = normalized.match(
    /(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/,
  )
  if (isoLike) {
    return `${isoLike[1]}-${pad2(Number(isoLike[2]))}-${pad2(Number(isoLike[3]))}`
  }

  const monthDay = normalized.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (monthDay) {
    return `${today.getFullYear()}-${pad2(Number(monthDay[1]))}-${pad2(Number(monthDay[2]))}`
  }

  return null
}

export async function extractRunningDataFromScreenshot(
  file: File,
): Promise<RunningScreenshotParseResult> {
  let rawText = ''
  let distanceKm: number | null = null

  rawText = await recognizeRunningScreenshotText(file, (partialText) => {
    const parsed = parseDistanceFromOcrText(partialText)
    if (parsed != null) {
      distanceKm = parsed
      return partialText
    }
    return null
  })

  if (distanceKm == null) {
    distanceKm = parseDistanceFromOcrText(rawText)
  }

  return {
    distanceKm,
    loggedAt: parseDateFromOcrText(rawText),
    rawText,
  }
}
