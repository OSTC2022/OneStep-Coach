'use server'

import { getCurrentUser, requireRole } from '@/lib/actions/auth'
import { getCenterSettingsCached } from '@/lib/data/center-settings-read'
import {
  migrateLegacyPortalRoulettePrizes,
  normalizePortalRoulettePrizeMonthKey,
  normalizePortalRoulettePrizeText,
  parsePortalRoulettePrizesStore,
  resolvePortalRoulettePrizesForMonth,
  upsertPortalRoulettePrizesStore,
  type PortalRoulettePrizes,
} from '@/lib/running-league/portal-roulette-prizes'
import type { PortalRouletteMode } from '@/lib/running-league/portal-roulette'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'

const CENTER_SETTINGS_ID = 'default'

async function prizesClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function isMissingPrizesColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('adult_running_portal_roulette_prizes')
}

async function loadPrizesStore() {
  const supabase = await prizesClient()
  const { data, error } = await supabase
    .from('center_settings')
    .select('adult_running_portal_roulette_prizes')
    .eq('id', CENTER_SETTINGS_ID)
    .maybeSingle()

  if (error) {
    if (isMissingPrizesColumnError(error)) {
      return parsePortalRoulettePrizesStore(null)
    }
    console.error('loadPrizesStore', error)
    return parsePortalRoulettePrizesStore(null)
  }

  const store = parsePortalRoulettePrizesStore(
    (data as { adult_running_portal_roulette_prizes?: unknown } | null)
      ?.adult_running_portal_roulette_prizes,
  )

  // 구형 단일 경품은 이번 달(현재 월)로만 한 번 이전 — 다른 달에는 표시하지 않음
  const migrated = migrateLegacyPortalRoulettePrizes(
    store,
    normalizePortalRoulettePrizeMonthKey(null),
  )
  if (migrated) {
    const saved = await savePrizesByMonth(migrated)
    if (saved.ok) {
      return { byMonth: migrated, legacy: null }
    }
  }

  return store
}

async function savePrizesByMonth(
  byMonth: Record<string, PortalRoulettePrizes>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await prizesClient()
  const { data: updated, error: updateError } = await supabase
    .from('center_settings')
    .update({
      adult_running_portal_roulette_prizes: byMonth,
      updated_at: new Date().toISOString(),
    })
    .eq('id', CENTER_SETTINGS_ID)
    .select('id')
    .maybeSingle()

  if (updateError) {
    if (isMissingPrizesColumnError(updateError)) {
      return {
        ok: false,
        error:
          '경품 설정 컬럼이 없습니다. supabase/add-adult-running-portal-roulette-prizes.sql을 실행해주세요.',
      }
    }
    console.error('savePrizesByMonth.update', updateError)
    return { ok: false, error: updateError.message || '경품 저장에 실패했습니다.' }
  }

  if (!updated) {
    const center = await getCenterSettingsCached()
    const { error: insertError } = await supabase.from('center_settings').upsert({
      id: CENTER_SETTINGS_ID,
      name: center.name,
      kakao_id: center.kakao_id,
      instagram_id: center.instagram_id,
      blog_url: center.blog_url,
      center_phone: center.center_phone ?? null,
      naver_place_url: center.naver_place_url ?? null,
      center_address: center.center_address ?? null,
      business_hours: center.business_hours ?? null,
      show_instructor_contact: center.show_instructor_contact ?? false,
      adult_running_portal_roulette_prizes: byMonth,
      updated_at: new Date().toISOString(),
    })

    if (insertError) {
      if (isMissingPrizesColumnError(insertError)) {
        return {
          ok: false,
          error:
            '경품 설정 컬럼이 없습니다. supabase/add-adult-running-portal-roulette-prizes.sql을 실행해주세요.',
        }
      }
      console.error('savePrizesByMonth.upsert', insertError)
      return { ok: false, error: insertError.message || '경품 저장에 실패했습니다.' }
    }
  }

  return { ok: true }
}

export async function canEditPortalRoulettePrizes(): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  return user.role === 'admin' || user.role === 'instructor'
}

export async function getPortalRoulettePrizes(
  monthKey?: string | null,
): Promise<PortalRoulettePrizes> {
  const key = normalizePortalRoulettePrizeMonthKey(monthKey)
  const store = await loadPrizesStore()
  return resolvePortalRoulettePrizesForMonth(store, key)
}

export async function updatePortalRoulettePrize(input: {
  mode: PortalRouletteMode
  text: string
  monthKey?: string | null
}): Promise<{ ok: true; prizes: PortalRoulettePrizes; monthKey: string } | { ok: false; error: string }> {
  await requireRole(['admin', 'instructor'])

  const monthKey = normalizePortalRoulettePrizeMonthKey(input.monthKey)
  const mode =
    input.mode === 'attendance'
      ? 'attendance'
      : input.mode === 'beat_rival'
        ? 'beat_rival'
        : 'mileage'
  const text = normalizePortalRoulettePrizeText(input.text)

  const store = await loadPrizesStore()
  const current = resolvePortalRoulettePrizesForMonth(store, monthKey)
  const nextMonthPrizes: PortalRoulettePrizes = {
    ...current,
    [mode]: text,
  }
  const byMonth = upsertPortalRoulettePrizesStore({
    store,
    monthKey,
    prizes: nextMonthPrizes,
  })

  const saved = await savePrizesByMonth(byMonth)
  if (!saved.ok) return saved

  updateTag('center-settings')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  revalidatePath('/dashboard/running-portal/manage')
  return { ok: true, prizes: nextMonthPrizes, monthKey }
}
