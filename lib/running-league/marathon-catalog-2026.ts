/** 올해 주요 국내 마라톤 추천 카탈로그
 * 출처: 마라톤온라인 대회일정 (marathon.pe.kr → roadrun.co.kr/schedule)
 */

import catalogData from '@/lib/running-league/marathon-catalog-2026-data.json'
import { isMarathonRegistrationOpenActive } from '@/lib/running-league/marathon-schedule'

export type MarathonCatalogItem = {
  key: string
  title: string
  event_date: string
  region: string
  location_label: string
  registration_url: string
  notes: string
  /** 인지도 높은 메이저 */
  is_featured: boolean
  /** 마라톤온라인 「접수중」 표시 (스냅샷) */
  registration_open: boolean
  /** 신청 마감일 (있으면 이 날짜 지나면 신청가능 라벨 숨김) */
  registration_end_date?: string | null
}

export const MARATHON_CATALOG_SOURCE = {
  label: '마라톤온라인 대회일정',
  href: 'http://www.marathon.pe.kr/schedule_index.html',
  dataHref: 'http://www.roadrun.co.kr/schedule/list.php?syear_key=2026',
} as const

/** 마라톤온라인 지역 필터와 맞춤 */
export const MARATHON_REGIONS = [
  '전체',
  '서울',
  '경기',
  '인천',
  '강원',
  '충북',
  '충남',
  '대전',
  '세종',
  '전북',
  '전남',
  '광주',
  '경북',
  '대구',
  '경남',
  '부산',
  '울산',
  '제주',
  '해외',
] as const

export type MarathonRegionFilter = (typeof MARATHON_REGIONS)[number]

export const MARATHON_CATALOG_2026 = catalogData as MarathonCatalogItem[]

export const MARATHON_CATALOG_PAGE_SIZE = 10

export function listMarathonCatalogYear(year = new Date().getFullYear()): MarathonCatalogItem[] {
  return MARATHON_CATALOG_2026.filter((item) => item.event_date.startsWith(`${year}-`)).sort(
    (a, b) =>
      a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title, 'ko'),
  )
}

export function catalogRegistrationOpenActive(item: MarathonCatalogItem): boolean {
  return isMarathonRegistrationOpenActive({
    registration_open: item.registration_open,
    event_date: item.event_date,
    registration_end_date: item.registration_end_date,
  })
}

export function filterMarathonCatalog(
  items: MarathonCatalogItem[],
  options: {
    region?: string
    monthKey?: string | null
    featuredOnly?: boolean
    registrationOpenOnly?: boolean
  },
): MarathonCatalogItem[] {
  const region = options.region?.trim()
  const monthKey = options.monthKey?.trim()
  return items.filter((item) => {
    if (region && region !== '전체' && item.region !== region) return false
    if (monthKey && monthKey !== 'all' && !item.event_date.startsWith(monthKey)) return false
    if (options.featuredOnly && !item.is_featured) return false
    if (options.registrationOpenOnly && !catalogRegistrationOpenActive(item)) return false
    return true
  })
}
