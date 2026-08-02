'use server'

import { requireRole } from '@/lib/actions/auth'
import {
  getCenterSettingsCached,
  readAdultRunningPortalHeaderStyle,
  readAdultRunningPortalRankingCaptionStyle,
} from '@/lib/data/center-settings-read'
import { ensureCenterPortalRankingLeague } from '@/lib/running-league/center-portal-ranking-league'
import {
  DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL,
  DEFAULT_ADULT_RUNNING_PORTAL_TITLE,
} from '@/lib/running-league/adult-running-portal-defaults'
import { resolvePortalRankingCycleStartDate } from '@/lib/running-league/portal-ranking-cycle'
import type {
  AdultRunningPortalHeaderStyle,
  PortalTextStyleConfig,
} from '@/lib/running-league/adult-running-portal-styles'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { updateRunningLeagueBeatRivalMember } from '@/lib/actions/running-league'
import { revalidatePath, revalidateTag } from 'next/cache'

const CENTER_SETTINGS_ID = 'default'

export type AdultRunningPortalDisplaySettings = {
  leagueLabel: string
  portalTitle: string
  notice: string | null
  beatRivalMemberId: string | null
  rankingReferenceDate: string | null
  rankingCycleStartDate: string
  rankingCaption: string | null
  headerStyle: AdultRunningPortalHeaderStyle
  rankingCaptionStyle: PortalTextStyleConfig
}

export type AdultRunningPortalAdminSettings = AdultRunningPortalDisplaySettings & {
  leagueId: string | null
  adultMemberOptions: Array<{ id: string; name: string }>
}

async function settingsClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function mapDisplayFromCenter(
  center: Awaited<ReturnType<typeof getCenterSettingsCached>>,
  beatRivalMemberId: string | null,
): AdultRunningPortalDisplaySettings {
  return {
    leagueLabel:
      center.adult_running_portal_league_label?.trim() || DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL,
    portalTitle: center.adult_running_portal_title?.trim() || DEFAULT_ADULT_RUNNING_PORTAL_TITLE,
    notice: center.adult_running_portal_notice?.trim() || null,
    beatRivalMemberId,
    rankingReferenceDate: center.adult_running_portal_ranking_reference_date ?? null,
    rankingCycleStartDate: resolvePortalRankingCycleStartDate(
      center.adult_running_portal_ranking_cycle_start_date,
    ),
    rankingCaption: center.adult_running_portal_ranking_caption?.trim() || null,
    headerStyle: readAdultRunningPortalHeaderStyle(center),
    rankingCaptionStyle: readAdultRunningPortalRankingCaptionStyle(center),
  }
}

async function resolvePortalRankingCycleStartDateFromSettings(): Promise<string> {
  const center = await getCenterSettingsCached()
  // 읽기 시 DB에 당월 1일을 쓰지 않음 — 월 경계에서 출석·룰렛 기간이 점프하는 것을 방지
  return resolvePortalRankingCycleStartDate(
    center.adult_running_portal_ranking_cycle_start_date,
  )
}

export async function getAdultRunningPortalDisplaySettings(): Promise<AdultRunningPortalDisplaySettings> {
  const [center, league, cycleStartDate] = await Promise.all([
    getCenterSettingsCached(),
    ensureCenterPortalRankingLeague().catch(() => null),
    resolvePortalRankingCycleStartDateFromSettings(),
  ])

  const display = mapDisplayFromCenter(center, league?.beat_rival_member_id ?? null)
  return { ...display, rankingCycleStartDate: cycleStartDate }
}

export async function getAdultRunningPortalAdminSettings(
  participantOptions: Array<{ member_id: string; member?: { name?: string | null } | null }> = [],
): Promise<AdultRunningPortalAdminSettings> {
  await requireRole(['admin'])

  const [center, league, cycleStartDate] = await Promise.all([
    getCenterSettingsCached(),
    ensureCenterPortalRankingLeague().catch(() => null),
    resolvePortalRankingCycleStartDateFromSettings(),
  ])

  const adultMemberOptions = participantOptions
    .map((row) => ({
      id: row.member_id,
      name: row.member?.name?.trim() || '회원',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return {
    ...mapDisplayFromCenter(center, league?.beat_rival_member_id ?? null),
    rankingCycleStartDate: cycleStartDate,
    leagueId: league?.id ?? null,
    adultMemberOptions,
  }
}

export async function updateAdultRunningPortalSettings(input: {
  leagueLabel: string
  portalTitle: string
  notice?: string | null
  beatRivalMemberId?: string | null
  leagueId?: string | null
  rankingReferenceDate?: string | null
  rankingCaption?: string | null
  headerStyle?: AdultRunningPortalHeaderStyle
  rankingCaptionStyle?: PortalTextStyleConfig
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const supabase = await settingsClient()

  const leagueLabel = input.leagueLabel.trim() || DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL
  const portalTitle = input.portalTitle.trim() || DEFAULT_ADULT_RUNNING_PORTAL_TITLE
  const notice = input.notice?.trim() ? input.notice.trim() : null
  const rankingCaption = input.rankingCaption?.trim() ? input.rankingCaption.trim() : null
  const rankingReferenceDate = input.rankingReferenceDate?.trim()
    ? input.rankingReferenceDate.trim().slice(0, 10)
    : null

  const current = await getCenterSettingsCached()
  const headerStyle = input.headerStyle ?? readAdultRunningPortalHeaderStyle(current)
  const rankingCaptionStyle =
    input.rankingCaptionStyle ?? readAdultRunningPortalRankingCaptionStyle(current)

  const { error } = await supabase.from('center_settings').upsert({
    id: CENTER_SETTINGS_ID,
    name: current.name,
    kakao_id: current.kakao_id,
    instagram_id: current.instagram_id,
    blog_url: current.blog_url,
    center_phone: current.center_phone ?? null,
    naver_place_url: current.naver_place_url ?? null,
    center_address: current.center_address ?? null,
    business_hours: current.business_hours ?? null,
    show_instructor_contact: current.show_instructor_contact ?? false,
    adult_running_portal_league_label: leagueLabel,
    adult_running_portal_title: portalTitle,
    adult_running_portal_notice: notice,
    adult_running_portal_ranking_reference_date: rankingReferenceDate,
    adult_running_portal_ranking_caption: rankingCaption,
    adult_running_portal_header_style: headerStyle,
    adult_running_portal_ranking_caption_style: rankingCaptionStyle,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    if (error.code === '42703' || error.message.includes('adult_running_portal_')) {
      return {
        ok: false,
        error:
          '포털 설정 컬럼이 없습니다. supabase/add-adult-running-portal-settings.sql을 실행해주세요.',
      }
    }
    return { ok: false, error: error.message }
  }

  if (input.leagueId) {
    const rivalResult = await updateRunningLeagueBeatRivalMember(
      input.leagueId,
      input.beatRivalMemberId ?? null,
    )
    if (!rivalResult.ok) {
      return rivalResult
    }
  }

  revalidateTag('center-settings')
  revalidatePath('/dashboard/settings/adult-running-portal')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/my/running-league')
  return { ok: true }
}
