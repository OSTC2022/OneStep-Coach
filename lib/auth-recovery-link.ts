import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getAppSmtpConfig,
  sendPasswordResetEmailViaSmtp,
} from '@/lib/mail/password-reset-mailer'
import { getRecoveryEmailRedirectUrl, getSiteUrl } from '@/lib/site-url'

export function extractAuthActionLink(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const props = record.properties
  if (props && typeof props === 'object') {
    const link = (props as Record<string, unknown>).action_link
    if (typeof link === 'string' && link.length > 0) return link
  }
  const direct = record.action_link
  if (typeof direct === 'string' && direct.length > 0) return direct
  return null
}

export function formatRecoveryEmailError(message?: string): string {
  const lower = message?.toLowerCase() ?? ''
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return '이메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
  }
  if (lower.includes('invalid') && lower.includes('redirect')) {
    return (
      'Redirect URL이 Supabase에 등록되지 않았습니다. Authentication → URL Configuration에 ' +
      '/auth/callback/hash 를 추가해주세요.'
    )
  }
  if (
    lower.includes('application-specific password required') ||
    lower.includes('invalidsecondfactor') ||
    lower.includes('534')
  ) {
    return (
      'Gmail 앱 비밀번호가 필요합니다. myaccount.google.com/apppasswords 에서 ' +
      '16자리 앱 비밀번호를 새로 만들고 SMTP_PASS에 넣으세요. (Gmail 로그인 비밀번호는 사용 불가)'
    )
  }
  if (
    lower.includes('badcredentials') ||
    lower.includes('username and password not accepted') ||
    lower.includes('535')
  ) {
    return (
      'Gmail 로그인이 거부되었습니다. SMTP_PASS에 앱 비밀번호 16자리(영문만)를 넣었는지 확인하세요.'
    )
  }
  if (
    lower.includes('error sending recovery email') ||
    lower.includes('sending recovery') ||
    lower.includes('smtp') ||
    lower.includes('authentication failed') ||
    lower.includes('invalid login')
  ) {
    return (
      '메일 발송에 실패했습니다. .env.local의 Gmail SMTP 설정을 확인해주세요. ' +
      '(SMTP_USER=전체이메일, SMTP_PASS=Gmail 앱 비밀번호 16자리)'
    )
  }
  if (lower.includes('smtp env not configured')) {
    return (
      '.env.local에 Gmail SMTP 설정이 없습니다. SMTP_HOST, SMTP_USER, SMTP_PASS를 추가하고 npm run dev를 재시작하세요.'
    )
  }
  if (message) {
    return `메일 발송에 실패했습니다. (${message})`
  }
  return '메일 발송에 실패했습니다. Supabase SMTP 설정을 확인해주세요.'
}

export async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  try {
    const admin = createAdminClient()
    let page = 1

    while (page <= 10) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      })
      if (error || !data.users.length) break

      const found = data.users.find(
        (user) => user.email?.toLowerCase() === email.toLowerCase(),
      )
      if (found?.email) {
        return { id: found.id, email: found.email }
      }

      if (!data.nextPage) break
      page = data.nextPage
    }
  } catch {
    return null
  }

  return null
}

export async function generatePasswordRecoveryLink(
  email: string,
): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const siteUrl = getSiteUrl()
    const redirectTo = getRecoveryEmailRedirectUrl(siteUrl)

    for (const type of ['recovery', 'magiclink'] as const) {
      const { data, error } = await admin.auth.admin.generateLink({
        type,
        email,
        options: { redirectTo },
      })
      if (error) continue
      const link = extractAuthActionLink(data)
      if (link) return link
    }
  } catch {
    return null
  }

  return null
}

export async function sendPasswordRecoveryEmail(
  email: string,
): Promise<{ sent: boolean; error?: string; via?: 'app-smtp' | 'supabase' }> {
  const smtpConfig = getAppSmtpConfig()
  if (!smtpConfig) {
    return {
      sent: false,
      error:
        'SMTP env not configured — .env.local에 SMTP_HOST, SMTP_USER, SMTP_PASS를 추가하고 dev 서버를 재시작하세요.',
    }
  }

  const resetLink = await generatePasswordRecoveryLink(email)
  if (!resetLink) {
    return {
      sent: false,
      error:
        '재설정 링크를 만들 수 없습니다. SUPABASE_SERVICE_ROLE_KEY와 Redirect URL을 확인해주세요.',
    }
  }

  const smtpResult = await sendPasswordResetEmailViaSmtp(email, resetLink)
  if (smtpResult.sent) {
    return { sent: true, via: 'app-smtp' }
  }
  return { sent: false, error: smtpResult.error }
}
