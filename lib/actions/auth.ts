'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Member, Profile, ProfileRole, User, UserRole } from '@/lib/types'
import {
  appRoleToProfileRole,
  getDefaultDashboardPath,
  profileRoleToAppRole,
  type AppRole,
} from '@/lib/roles'

function toAppUser(profile: Profile): User {
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profileRoleToAppRole(profile.role) as UserRole,
    created_at: profile.created_at,
  }
}

export async function signIn(
  _prevState: { error?: string } | null,
  formData: FormData,
) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    const message =
      error.message === 'Invalid login credentials'
        ? '이메일 또는 비밀번호가 올바르지 않습니다.'
        : error.message
    return { error: message }
  }

  const profile = await getCurrentProfile()
  const path = getDefaultDashboardPath(
    profileRoleToAppRole(profile?.role ?? 'member'),
  )
  redirect(path)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .eq('id', authUser.id)
    .single()

  if (profile) return profile as Profile

  // Fallback: legacy users table before migration
  const { data: legacy } = await supabase
    .from('users')
    .select('id, email, full_name, role, created_at')
    .eq('id', authUser.id)
    .single()

  if (legacy) {
    return {
      ...legacy,
      role: appRoleToProfileRole(legacy.role as AppRole),
    } as Profile
  }

  return null
}

export async function getCurrentUser(): Promise<User | null> {
  const profile = await getCurrentProfile()
  if (!profile) return null
  return toAppUser(profile)
}

export async function getUserRole(): Promise<UserRole | null> {
  const user = await getCurrentUser()
  return user?.role ?? null
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  return user
}

export async function requireRole(allowedRoles: UserRole[]): Promise<User> {
  const user = await requireAuth()
  if (!allowedRoles.includes(user.role)) redirect('/unauthorized')
  return user
}

export async function getMemberForCurrentUser(): Promise<Member | null> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return null

  const { data } = await supabase
    .from('members')
    .select('*, primary_instructor:instructors(*)')
    .or(`auth_user_id.eq.${authUser.id},user_id.eq.${authUser.id}`)
    .maybeSingle()

  return (data as Member | null) ?? null
}

export async function linkMemberToAuthUser(
  memberId: string,
  authUserId: string,
): Promise<{ error?: string }> {
  await requireRole(['admin'])

  const supabase = await createClient()

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'member' satisfies ProfileRole })
    .eq('id', authUserId)

  if (profileError) {
    console.error('linkMemberToAuthUser profile:', profileError)
  }

  const { error } = await supabase
    .from('members')
    .update({
      auth_user_id: authUserId,
      user_id: authUserId,
    })
    .eq('id', memberId)

  if (error) {
    return { error: error.message }
  }

  return {}
}

export async function setPasswordAfterInvite(
  _prevState: { error?: string } | null,
  formData: FormData,
) {
  const password = formData.get('password') as string
  const passwordConfirm = formData.get('password_confirm') as string

  if (!password || password.length < 8) {
    return { error: '비밀번호는 8자 이상이어야 합니다.' }
  }
  if (password !== passwordConfirm) {
    return { error: '비밀번호가 일치하지 않습니다.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard/my')
}

export async function createMemberAuthAccount(
  memberId: string,
  email: string,
  password: string,
  fullName: string,
): Promise<{ userId?: string; error?: string }> {
  await requireRole(['admin'])

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: 'member',
      },
    },
  })

  if (error || !data.user) {
    return { error: error?.message ?? '계정 생성에 실패했습니다.' }
  }

  const linkResult = await linkMemberToAuthUser(memberId, data.user.id)
  if (linkResult.error) return { error: linkResult.error }

  return { userId: data.user.id }
}

export async function createAdminUser(
  email: string,
  password: string,
  fullName: string,
) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: 'admin',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { data }
}
