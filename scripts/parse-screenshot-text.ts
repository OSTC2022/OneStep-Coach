import { readFileSync } from 'node:fs'
import { buildExtractionFromRaw, parseRunningMetricsFromText } from '../lib/running-league/screenshot-extraction'

const text = readFileSync(0, 'utf8')
const ex = buildExtractionFromRaw(parseRunningMetricsFromText(text), 'ocr')
console.log(
  JSON.stringify({
    distance_km: ex.distance_km,
    duration: ex.duration,
    pace: ex.pace,
    heart_rate: ex.heart_rate,
    calories: ex.calories,
  }),
)
