import { buildExtractionFromRaw, parseRunningMetricsFromText } from '../lib/running-league/screenshot-extraction'

const cases: Array<{ name: string; text: string; expect: Record<string, unknown> }> = [
  {
    name: 'apple-clean',
    text: "5.46KM 1:13:25 평균 심박수 108BPM 평균 페이스 13'26\"/KM 404CAL 4월 11일",
    expect: { distance_km: 5.46, duration: '1:13:25', pace: '13:26' },
  },
  {
    name: 'apple-ocr',
    text: "5.46KM 113:25 평균 심박수 108BPM 평균 페이스 13'26\"/km 404CAL 4월 11일 (수)",
    expect: { distance_km: 5.46, duration: '1:13:25', pace: '13:26' },
  },
  {
    name: 'nike-clean',
    text: '9.73 킬로미터 6\'19\'\' 1:01:28 593 139BPM 평균 페이스',
    expect: { distance_km: 9.73, duration: '1:01:28', pace: '6:19' },
  },
  {
    name: 'samsung-partial-no-km',
    text: '1:00:27 4:29 /km 154 bpm 714 칼로리 6월 23일 오전 11:05',
    expect: { distance_km: 13.48, duration: '1:00:27', pace: '4:29' },
  },
  {
    name: 'nike-ocr',
    text: '9.73 619" 1:01:28 593 39m 139 157',
    expect: { distance_km: 9.73, duration: '1:01:28', pace: '6:19' },
  },
]

let failed = 0
for (const { name, text, expect } of cases) {
  const raw = parseRunningMetricsFromText(text)
  const ex = buildExtractionFromRaw(raw, 'ocr')
  const got = {
    distance_km: ex.distance_km,
    duration: ex.duration,
    pace: ex.pace,
    heart_rate: ex.heart_rate,
    calories: ex.calories,
  }
  const ok =
    (expect.distance_km == null || ex.distance_km === expect.distance_km) &&
    (expect.duration == null || ex.duration === expect.duration) &&
    (expect.pace == null || ex.pace === expect.pace)
  console.log(ok ? 'OK' : 'FAIL', name, JSON.stringify(got))
  if (!ok) {
    console.log('  expected', expect)
    failed++
  }
}
process.exit(failed > 0 ? 1 : 0)
