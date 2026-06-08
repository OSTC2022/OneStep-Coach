'use server'

import { requireRole } from '@/lib/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { CenterSettings } from '@/lib/types'

const CENTER_SETTINGS_ID = 'default'

const DEFAULT_CENTER_SETTINGS: CenterSettings = {
  id: CENTER_SETTINGS_ID,
  name: '센터',
  kakao_id: null,
  instagram_id: null,
  blog_url: null,
  updated_at: new Date().toISOString(),
}

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
  const supabase = await settingsClient()
  const { data, error } = await supabase
    .from('center_settings')
    .select('id, name, kakao_id, instagram_id, blog_url, updated_at')
    .eq('id', CENTER_SETTINGS_ID)
    .maybeSingle()

  if (error || !data) {
    return DEFAULT_CENTER_SETTINGS
  }

  return data as CenterSettings
}

export async function updateCenterSettings(formData: {
  name?: string
  kakao_id?: string
  instagram_id?: string
  blog_url?: string
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

  const { data, error } = await supabase
    .from('center_settings')
    .upsert({
      id: CENTER_SETTINGS_ID,
      name: (updateData.name as string | undefined) ?? '센터',
      kakao_id: (updateData.kakao_id as string | null | undefined) ?? null,
      instagram_id: (updateData.instagram_id as string | null | undefined) ?? null,
      blog_url: (updateData.blog_url as string | null | undefined) ?? null,
      updated_at: updateData.updated_at,
    })
    .select('id, name, kakao_id, instagram_id, blog_url, updated_at')
    .single()

  if (error) {
    console.error('Error updating center settings:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/members')
  return { data: data as CenterSettings }
}
