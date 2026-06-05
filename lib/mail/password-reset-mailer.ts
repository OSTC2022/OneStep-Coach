import 'server-only'

import nodemailer from 'nodemailer'

export type AppSmtpConfig = {
  host: string
  port: number
  user: string
  pass: string
  from: string
  fromName: string
}

export function getAppSmtpConfig(): AppSmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()

  if (!host || !user || !pass) return null

  const port = Number(process.env.SMTP_PORT ?? '465')
  const from = process.env.SMTP_FROM?.trim() || user
  const fromName = process.env.SMTP_FROM_NAME?.trim() || 'OneStep Coach'

  return {
    host,
    port: Number.isFinite(port) ? port : 465,
    user,
    pass,
    from,
    fromName,
  }
}

export async function sendPasswordResetEmailViaSmtp(
  to: string,
  resetLink: string,
): Promise<{ sent: boolean; error?: string }> {
  const config = getAppSmtpConfig()
  if (!config) {
    return { sent: false, error: 'SMTP env not configured' }
  }

  try {
    const secure = config.port === 465
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      ...(config.port === 587 ? { requireTLS: true } : {}),
    })

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.from}>`,
      to,
      subject: '[OneStep Coach] 비밀번호 재설정',
      text: [
        '비밀번호 재설정을 요청하셨습니다.',
        '아래 링크를 눌러 새 비밀번호를 설정해주세요.',
        '',
        resetLink,
        '',
        '본인이 요청하지 않았다면 이 메일을 무시하세요.',
        '링크는 한 번만 사용할 수 있으며 일정 시간 후 만료됩니다.',
      ].join('\n'),
      html: `
        <p>비밀번호 재설정을 요청하셨습니다.</p>
        <p><a href="${resetLink}">비밀번호 재설정하기</a></p>
        <p>버튼이 동작하지 않으면 아래 주소를 브라우저에 붙여넣으세요.</p>
        <p style="word-break:break-all;font-size:12px;color:#666;">${resetLink}</p>
        <p style="font-size:12px;color:#888;">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
      `,
    })

    return { sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown smtp error'
    console.error('sendPasswordResetEmailViaSmtp:', message)
    return { sent: false, error: message }
  }
}
