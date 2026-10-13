import {
  decodeRoadrunScheduleHtml,
  parseRoadrunScheduleHtml,
} from '@/lib/running-league/marathon-catalog-parse'
import type { MarathonCatalogItem } from '@/lib/running-league/marathon-catalog-2026'

/** 한 해 일정이 통째로 오므로, 이보다 적으면 페이지 파싱 실패로 본다. */
const MIN_PARSED_EVENTS = 20

export async function fetchLatestMarathonCatalog(year: number): Promise<MarathonCatalogItem[]> {
  const url = `http://www.roadrun.co.kr/schedule/list.php?syear_key=${year}`
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SportsCenterMarathonRefresh/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20000),
  })

  if (!response.ok) {
    throw new Error(`마라톤온라인 응답 오류 (${response.status})`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  const html = decodeRoadrunScheduleHtml(bytes)
  const parsed = parseRoadrunScheduleHtml(html, year)
  if (parsed.length < MIN_PARSED_EVENTS) {
    throw new Error('마라톤온라인에서 대회 목록을 읽지 못했습니다.')
  }

  return parsed
}
