import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'

/** 로그인 입력(이메일·로그인 ID·이름) → Supabase Auth 이메일 */
export async function resolveLoginAuthEmail(
  loginInput: string,
): Promise<{ email: string; error?: string }> {
  const trimmed = loginInput.trim()
  if (!trimmed) {
    return { email: '', error: '이메일 또는 로그인 ID를 입력해주세요.' }
  }

  const normalized = trimmed.toLowerCase()
  if (trimmed.includes('@')) {
    return { email: normalized }
  }

  try {
    const admin = createServiceRoleClient()

    const { data: byEmail } = await admin
      .from('profiles')
      .select('email')
      .eq('email', normalized)
      .maybeSingle()

    if (byEmail?.email) {
      return { email: byEmail.email.toLowerCase() }
    }

    const { data: byName } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('full_name', trimmed)

    const nameMatches = (byName ?? []).filter((row) => row.email)
    if (nameMatches.length === 1) {
      return { email: nameMatches[0].email!.toLowerCase() }
    }
    if (nameMatches.length > 1) {
      return {
        email: normalized,
        error:
          '같은 이름의 계정이 여러 개입니다. 발급된 로그인 ID(이메일)로 로그인해주세요.',
      }
    }

    const { data: byPrefix } = await admin
      .from('profiles')
      .select('email')
      .ilike('email', `${normalized}@%`)

    const prefixMatches = (byPrefix ?? []).filter((row) => row.email)
    if (prefixMatches.length === 1) {
      return { email: prefixMatches[0].email!.toLowerCase() }
    }
    if (prefixMatches.length > 1) {
      return {
        email: normalized,
        error:
          '입력하신 ID와 일치하는 계정이 여러 개입니다. 전체 이메일 주소로 로그인해주세요.',
      }
    }
  } catch {
    /* service role 없으면 입력값 그대로 시도 */
  }

  return { email: normalized }
}
