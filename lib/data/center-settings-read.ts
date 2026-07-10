import 'server-only'

import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL,
  DEFAULT_ADULT_RUNNING_PORTAL_TITLE,
} from '@/lib/running-league/adult-running-portal-defaults'
import {
  parseAdultRunningPortalHeaderStyle,
  parsePortalTextStyleConfig,
  type AdultRunningPortalHeaderStyle,
  type PortalTextStyleConfig,
} from '@/lib/running-league/adult-running-portal-styles'
import type { CenterSettings } from '@/lib/types'

export type { AdultRunningPortalHeaderStyle, PortalTextStyleConfig }

const CENTER_SETTINGS_ID = 'default'

const CENTER_SETTINGS_SELECT =
  'id, name, kakao_id, instagram_id, blog_url, center_phone, naver_place_url, center_address, business_hours, show_instructor_contact, adult_running_portal_league_label, adult_running_portal_title, adult_running_portal_notice, adult_running_portal_ranking_reference_date, adult_running_portal_ranking_cycle_start_date, adult_running_portal_ranking_caption, adult_running_portal_header_style, adult_running_portal_ranking_caption_style, updated_at'

const CENTER_SETTINGS_SELECT_LEGACY =
  'id, name, kakao_id, instagram_id, blog_url, center_phone, naver_place_url, center_address, business_hours, show_instructor_contact, updated_at'

export const DEFAULT_CENTER_SETTINGS: CenterSettings = {
  id: CENTER_SETTINGS_ID,
  name: '센터',
  kakao_id: 'onesteptc',
  instagram_id: null,
  blog_url: null,
  center_phone: null,
  naver_place_url: null,
  center_address: null,
  business_hours: null,
  show_instructor_contact: false,
  adult_running_portal_league_label: DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL,
  adult_running_portal_title: DEFAULT_ADULT_RUNNING_PORTAL_TITLE,
  adult_running_portal_notice: null,
  adult_running_portal_ranking_reference_date: null,
  adult_running_portal_ranking_cycle_start_date: null,
  adult_running_portal_ranking_caption: null,
  adult_running_portal_header_style: null,
  adult_running_portal_ranking_caption_style: null,
  updated_at: new Date().toISOString(),
}

export function normalizeCenterSettingsRow(data: Record<string, unknown>): CenterSettings {
  return {
    id: String(data.id ?? CENTER_SETTINGS_ID),
    name: String(data.name ?? '센터'),
    kakao_id: (data.kakao_id as string | null) ?? null,
    instagram_id: (data.instagram_id as string | null) ?? null,
    blog_url: (data.blog_url as string | null) ?? null,
    center_phone: (data.center_phone as string | null) ?? null,
    naver_place_url: (data.naver_place_url as string | null) ?? null,
    center_address: (data.center_address as string | null) ?? null,
    business_hours: (data.business_hours as string | null) ?? null,
    show_instructor_contact: Boolean(data.show_instructor_contact),
    adult_running_portal_league_label:
      (data.adult_running_portal_league_label as string | null)?.trim() ||
      DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL,
    adult_running_portal_title:
      (data.adult_running_portal_title as string | null)?.trim() || DEFAULT_ADULT_RUNNING_PORTAL_TITLE,
    adult_running_portal_notice:
      (data.adult_running_portal_notice as string | null)?.trim() || null,
    adult_running_portal_ranking_reference_date:
      (data.adult_running_portal_ranking_reference_date as string | null) ?? null,
    adult_running_portal_ranking_cycle_start_date:
      (data.adult_running_portal_ranking_cycle_start_date as string | null) ?? null,
    adult_running_portal_ranking_caption:
      (data.adult_running_portal_ranking_caption as string | null)?.trim() || null,
    adult_running_portal_header_style:
      (data.adult_running_portal_header_style as Record<string, unknown> | null) ?? null,
    adult_running_portal_ranking_caption_style:
      (data.adult_running_portal_ranking_caption_style as Record<string, unknown> | null) ?? null,
    updated_at: String(data.updated_at ?? new Date().toISOString()),
  }
}

export function readAdultRunningPortalHeaderStyle(
  center: Pick<CenterSettings, 'adult_running_portal_header_style'>,
): AdultRunningPortalHeaderStyle {
  return parseAdultRunningPortalHeaderStyle(center.adult_running_portal_header_style)
}

export function readAdultRunningPortalRankingCaptionStyle(
  center: Pick<CenterSettings, 'adult_running_portal_ranking_caption_style'>,
): PortalTextStyleConfig {
  return parsePortalTextStyleConfig(center.adult_running_portal_ranking_caption_style)
}

function isMissingPortalSettingsColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('adult_running_portal_')
}

async function fetchCenterSettingsUncached(): Promise<CenterSettings> {
  try {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('center_settings')
      .select(CENTER_SETTINGS_SELECT)
      .eq('id', CENTER_SETTINGS_ID)
      .maybeSingle()

    if (error) {
      if (isMissingPortalSettingsColumnError(error)) {
        const { data: legacy, error: legacyError } = await supabase
          .from('center_settings')
          .select(CENTER_SETTINGS_SELECT_LEGACY)
          .eq('id', CENTER_SETTINGS_ID)
          .maybeSingle()

        if (legacyError || !legacy) {
          return DEFAULT_CENTER_SETTINGS
        }

        return normalizeCenterSettingsRow(legacy as Record<string, unknown>)
      }

      const { data: legacy, error: legacyError } = await supabase
        .from('center_settings')
        .select('id, name, kakao_id, instagram_id, blog_url, updated_at')
        .eq('id', CENTER_SETTINGS_ID)
        .maybeSingle()

      if (legacyError || !legacy) {
        return DEFAULT_CENTER_SETTINGS
      }

      return normalizeCenterSettingsRow(legacy as Record<string, unknown>)
    }

    if (!data) {
      return DEFAULT_CENTER_SETTINGS
    }

    return normalizeCenterSettingsRow(data as Record<string, unknown>)
  } catch {
    return DEFAULT_CENTER_SETTINGS
  }
}

/** 센터 설정 — 페이지마다 DB 조회하지 않도록 캐시 (저장 시 tag 무효화) */
export const getCenterSettingsCached = unstable_cache(
  fetchCenterSettingsUncached,
  ['center-settings-default'],
  { revalidate: 300, tags: ['center-settings'] },
)
