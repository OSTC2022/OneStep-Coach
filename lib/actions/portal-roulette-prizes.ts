'use server'

import { getCurrentUser, requireRole } from '@/lib/actions/auth'
import { getCenterSettingsCached } from '@/lib/data/center-settings-read'
import {
  EMPTY_PORTAL_ROULETTE_PRIZES,
  normalizePortalRoulettePrizeText,
  parsePortalRoulettePrizes,
  type PortalRoulettePrizes,
} from '@/lib/running-league/portal-roulette-prizes'
import type { PortalRouletteMode } from '@/lib/running-league/portal-roulette'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'

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

export async function canEditPortalRoulettePrizes(): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  return user.role === 'admin' || user.role === 'instructor'
}

export async function getPortalRoulettePrizes(): Promise<PortalRoulettePrizes> {
  const supabase = await prizesClient()
  const { data, error } = await supabase
    .from('center_settings')
    .select('adult_running_portal_roulette_prizes')
    .eq('id', CENTER_SETTINGS_ID)
    .maybeSingle()

  if (error) {
    if (isMissingPrizesColumnError(error)) {
      return { ...EMPTY_PORTAL_ROULETTE_PRIZES }
    }
    console.error('getPortalRoulettePrizes', error)
    return { ...EMPTY_PORTAL_ROULETTE_PRIZES }
  }

  return parsePortalRoulettePrizes(
    (data as { adult_running_portal_roulette_prizes?: unknown } | null)
      ?.adult_running_portal_roulette_prizes,
  )
}

export async function updatePortalRoulettePrize(input: {
  mode: PortalRouletteMode
  text: string
}): Promise<{ ok: true; prizes: PortalRoulettePrizes } | { ok: false; error: string }> {
  await requireRole(['admin', 'instructor'])

  const mode =
    input.mode === 'attendance'
      ? 'attendance'
      : input.mode === 'beat_rival'
        ? 'beat_rival'
        : 'mileage'
  const text = normalizePortalRoulettePrizeText(input.text)
  const current = await getPortalRoulettePrizes()
  const next: PortalRoulettePrizes = {
    ...current,
    [mode]: text,
  }

  const supabase = await prizesClient()
  const { data: updated, error: updateError } = await supabase
    .from('center_settings')
    .update({
      adult_running_portal_roulette_prizes: next,
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
    console.error('updatePortalRoulettePrize.update', updateError)
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
      adult_running_portal_roulette_prizes: next,
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
      console.error('updatePortalRoulettePrize.upsert', insertError)
      return { ok: false, error: insertError.message || '경품 저장에 실패했습니다.' }
    }
  }

  revalidateTag('center-settings')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  revalidatePath('/dashboard/running-portal/manage')
  return { ok: true, prizes: next }
}
