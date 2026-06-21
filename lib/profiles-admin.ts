import 'server-only'

import type { createServiceRoleClient } from '@/lib/supabase/admin'
import { PROFILE_SELECT, USER_LEGACY_SELECT } from '@/lib/supabase-selects'
import {
  getEffectiveApprovalStatus,
  resolveApprovalStatus,
} from '@/lib/profile-approval'
import { appRoleToProfileRole, profileRoleToAppRole } from '@/lib/roles'
import type { ProfileApprovalStatus, ProfileRole } from '@/lib/types'
import type { AppRole } from '@/lib/roles'

export const PROFILE_SELECT_LEGACY = USER_LEGACY_SELECT

export type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: ProfileRole | string
  approval_status: ProfileApprovalStatus
  created_at: string
}

export function isMissingApprovalColumn(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes('approval_status') || m.includes('column') && m.includes('does not exist')
}

export async function upsertUserProfile(
  admin: ReturnType<typeof createServiceRoleClient>,
  row: {
    id: string
    email: string | null
    full_name: string | null
    role: ProfileRole
    approval_status?: ProfileApprovalStatus
  },
): Promise<{ error?: string }> {
  const updated_at = new Date().toISOString()
  const withApproval = {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    approval_status: row.approval_status ?? 'pending',
    updated_at,
  }

  let { error } = await admin.from('profiles').upsert(withApproval, { onConflict: 'id' })

  if (error && isMissingApprovalColumn(error.message)) {
    const { error: legacyError } = await admin.from('profiles').upsert(
      {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: row.role,
        updated_at,
      },
      { onConflict: 'id' },
    )
    error = legacyError
  }

  if (error) return { error: error.message }
  return {}
}

function normalizeProfileRole(
  raw: string | null | undefined,
  fallback: ProfileRole = 'member',
): ProfileRole {
  const role = profileRoleToAppRole(raw ?? fallback) as AppRole
  return appRoleToProfileRole(role)
}

/** profiles 목록 + 컬럼/프로필 누락 시 Auth 사용자 보완 */
export async function fetchAllProfiles(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<ProfileRow[]> {
  const ordered = { ascending: false as const }
  let { data, error } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .order('created_at', ordered)

  if (error && isMissingApprovalColumn(error.message)) {
    const legacy = await admin
      .from('profiles')
      .select(PROFILE_SELECT_LEGACY)
      .order('created_at', ordered)
    data = (legacy.data ?? []).map((row) => ({
      ...row,
      approval_status: null as unknown as ProfileApprovalStatus,
    }))
    error = legacy.error
  }

  const byId = new Map<string, ProfileRow & { dbApprovalStatus?: ProfileApprovalStatus | null }>()
  const metaApprovalByUserId = new Map<string, ProfileApprovalStatus | undefined>()

  for (const row of data ?? []) {
    const dbStatus = row.approval_status as ProfileApprovalStatus | null | undefined
    byId.set(row.id, {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role: row.role as ProfileRole,
      approval_status: 'pending',
      dbApprovalStatus: dbStatus ?? null,
      created_at: row.created_at,
    })
  }

  if (error) {
    console.error('fetchAllProfiles profiles:', error)
  }

  try {
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({
      perPage: 1000,
    })
    if (authError) {
      console.error('fetchAllProfiles listUsers:', authError)
      return [...byId.values()]
    }

    for (const authUser of authData.users) {
      const meta = authUser.user_metadata ?? {}
      const metaRole = meta.role as string | undefined
      const metaApproval = meta.approval_status as ProfileApprovalStatus | undefined
      metaApprovalByUserId.set(authUser.id, metaApproval)

      const existing = byId.get(authUser.id)
      if (existing) continue

      byId.set(authUser.id, {
        id: authUser.id,
        email: authUser.email ?? null,
        full_name: (meta.full_name as string | undefined) ?? authUser.email ?? null,
        role: normalizeProfileRole(metaRole),
        approval_status: 'pending',
        dbApprovalStatus: null,
        created_at: authUser.created_at,
      })
    }
  } catch (e) {
    console.error('fetchAllProfiles auth merge:', e)
  }

  for (const profile of byId.values()) {
    profile.approval_status = getEffectiveApprovalStatus(
      profile.email,
      profile.dbApprovalStatus,
      metaApprovalByUserId.get(profile.id),
    )
    delete profile.dbApprovalStatus
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

/** Auth·profiles 어디에만 있어도 DB profiles 행 보장 */
export async function ensureProfileRowForAdmin(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<{ error?: string; profile?: ProfileRow }> {
  const all = await fetchAllProfiles(admin)
  let profile = all.find((p) => p.id === userId)

  if (!profile) {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user) {
      return { error: '계정을 찾을 수 없습니다.' }
    }
    const meta = data.user.user_metadata ?? {}
    profile = {
      id: data.user.id,
      email: data.user.email ?? null,
      full_name:
        (meta.full_name as string | undefined) ?? data.user.email ?? null,
      role: normalizeProfileRole(meta.role as string | undefined),
      approval_status: resolveApprovalStatus(
        data.user.email,
        meta.approval_status as ProfileApprovalStatus | undefined,
      ),
      created_at: data.user.created_at,
    }
  }

  const upsert = await upsertUserProfile(admin, {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role as ProfileRole,
    approval_status: profile.approval_status,
  })
  if (upsert.error) return { error: upsert.error }

  return { profile }
}
