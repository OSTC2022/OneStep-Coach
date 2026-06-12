'use server'

import { requireRole } from '@/lib/actions/auth'
import {
  getCenterSettingsCached,
  normalizeCenterSettingsRow,
} from '@/lib/data/center-settings-read'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { CenterSettings } from '@/lib/types'

const CENTER_SETTINGS_ID = 'default'

const CENTER_SETTINGS_SELECT =
  'id, name, kakao_id, instagram_id, blog_url, center_phone, naver_place_url, center_address, business_hours, show_instructor_contact, updated_at'

function normalizeOptionalString(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function settingsClient() {
  try {
    return createAdminClient()
  } catch {
    return createClient()
  }
}

export async function getCenterSettings(): Promise<CenterSettings> {
  return getCenterSettingsCached()
}

export async function updateCenterSettings(formData: {
  name?: string
  kakao_id?: string
  instagram_id?: string
  blog_url?: string
  center_phone?: string
  naver_place_url?: string
  center_address?: string
  business_hours?: string
  show_instructor_contact?: boolean
}): Promise<{ data?: CenterSettings; error?: string }> {
  await requireRole(['admin'])
  const supabase = await settingsClient()

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (formData.name !== undefined) {
    updateData.name = formData.name.trim() || '센터'
  }
  if (formData.kakao_id !== undefined) {
    updateData.kakao_id = normalizeOptionalString(formData.kakao_id)
  }
  if (formData.instagram_id !== undefined) {
    updateData.instagram_id = normalizeOptionalString(formData.instagram_id)
  }
  if (formData.blog_url !== undefined) {
    updateData.blog_url = normalizeOptionalString(formData.blog_url)
  }
  if (formData.center_phone !== undefined) {
    updateData.center_phone = normalizeOptionalString(formData.center_phone)
  }
  if (formData.naver_place_url !== undefined) {
    updateData.naver_place_url = normalizeOptionalString(formData.naver_place_url)
  }
  if (formData.center_address !== undefined) {
    updateData.center_address = normalizeOptionalString(formData.center_address)
  }
  if (formData.business_hours !== undefined) {
    updateData.business_hours = normalizeOptionalString(formData.business_hours)
  }
  if (formData.show_instructor_contact !== undefined) {
    updateData.show_instructor_contact = formData.show_instructor_contact
  }

  const current = await getCenterSettings()
  const payload = {
    id: CENTER_SETTINGS_ID,
    name: (updateData.name as string | undefined) ?? current.name,
    kakao_id: (updateData.kakao_id as string | null | undefined) ?? current.kakao_id,
    instagram_id:
      (updateData.instagram_id as string | null | undefined) ?? current.instagram_id,
    blog_url: (updateData.blog_url as string | null | undefined) ?? current.blog_url,
    center_phone:
      (updateData.center_phone as string | null | undefined) ?? current.center_phone ?? null,
    naver_place_url:
      (updateData.naver_place_url as string | null | undefined) ??
      current.naver_place_url ??
      null,
    center_address:
      (updateData.center_address as string | null | undefined) ??
      current.center_address ??
      null,
    business_hours:
      (updateData.business_hours as string | null | undefined) ??
      current.business_hours ??
      null,
    show_instructor_contact:
      (updateData.show_instructor_contact as boolean | undefined) ??
      current.show_instructor_contact ??
      false,
    updated_at: updateData.updated_at,
  }

  const { data, error } = await supabase
    .from('center_settings')
    .upsert(payload)
    .select(CENTER_SETTINGS_SELECT)
    .single()

  if (error) {
    const legacyPayload = {
      id: CENTER_SETTINGS_ID,
      name: payload.name,
      kakao_id: payload.kakao_id,
      instagram_id: payload.instagram_id,
      blog_url: payload.blog_url,
      updated_at: payload.updated_at,
    }
    const legacyResult = await supabase
      .from('center_settings')
      .upsert(legacyPayload)
      .select('id, name, kakao_id, instagram_id, blog_url, updated_at')
      .single()

    if (legacyResult.error) {
      console.error('Error updating center settings:', legacyResult.error)
      return { error: legacyResult.error.message }
    }

    revalidateTag('center-settings')
    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/my')
    revalidatePath('/dashboard/members')
    return {
      data: normalizeCenterSettingsRow(
        legacyResult.data as Record<string, unknown>,
      ),
      error:
        '연락처·위치 필드는 supabase/add-center-contact-fields.sql 실행 후 저장됩니다.',
    }
  }

  revalidateTag('center-settings')
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/members')
  return { data: normalizeCenterSettingsRow(data as Record<string, unknown>) }
}
