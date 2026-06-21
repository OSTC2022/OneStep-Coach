import 'server-only'

import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { CenterSettings } from '@/lib/types'

const CENTER_SETTINGS_ID = 'default'

const CENTER_SETTINGS_SELECT =
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
    updated_at: String(data.updated_at ?? new Date().toISOString()),
  }
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
