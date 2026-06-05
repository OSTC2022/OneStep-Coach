'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, requireAuth } from '@/lib/actions/auth'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import type { UserRole } from '@/lib/types'

function toLegacyUsersRole(role: UserRole) {
  if (role === 'admin') return 'admin'
  if (role === 'instructor') return 'instructor'
  return 'member'
}

export async function updateMyProfile(input: {
  full_name: string
}): Promise<{ error?: string }> {
  const user = await requireAuth()
  const fullName = input.full_name.trim()

  if (!fullName) {
    return { error: '이름을 입력해주세요.' }
  }

  if (fullName.length > 40) {
    return { error: '이름은 40자 이내로 입력해주세요.' }
  }

  const supabase = await createClient()
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (profileError) {
    return { error: profileError.message }
  }

  await supabase.from('users').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: fullName,
      role: toLegacyUsersRole(user.role),
    },
    { onConflict: 'id' },
  )

  try {
    const admin = createAdminClient()
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        full_name: fullName,
        role: user.role,
      },
    })

    if (isProtectedAdminAccount(user.email)) {
      await admin.from('profiles').update({ role: 'admin' }).eq('id', user.id)
      await admin.from('users').upsert(
        {
          id: user.id,
          email: user.email,
          full_name: fullName,
          role: 'admin',
        },
        { onConflict: 'id' },
      )
    }
  } catch {
    /* service role 없으면 profiles만 갱신 */
  }

  revalidatePath('/dashboard', 'layout')
  return {}
}

export async function getMyProfileSettings() {
  const user = await getCurrentUser()
  if (!user) return null
  return {
    full_name: user.full_name ?? '',
    email: user.email,
    role: user.role,
  }
}
