import 'server-only'

export class GoogleCalendarApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`Google Calendar API ${status}: ${body}`)
    this.name = 'GoogleCalendarApiError'
    this.status = status
    this.body = body
  }
}

export function isGoogleCalendarSyncTokenGone(error: unknown): boolean {
  return error instanceof GoogleCalendarApiError && error.status === 410
}

export function isGoogleCalendarInvalidSyncQuery(error: unknown): boolean {
  if (!(error instanceof GoogleCalendarApiError)) return false
  if (error.status === 410) return true
  if (
    error.status === 400 &&
    (error.body.includes('orderBy') ||
      error.body.includes('requested ordering is not available'))
  ) {
    return true
  }
  return false
}

export function isGoogleCalendarInsufficientScope(error: unknown): boolean {
  return error instanceof GoogleCalendarApiError && error.status === 403
}

export function formatGoogleCalendarSyncError(error: unknown): string {
  if (error instanceof GoogleCalendarApiError) {
    if (error.status === 403) {
      return 'Google 캘린더 쓰기 권한이 없습니다. 설정에서 Google 계정을 연결 해제 후 다시 연결해 주세요.'
    }
    if (error.status === 410) {
      return 'Google 캘린더 동기화 조건이 맞지 않아 다시 전체 동기화를 시도합니다.'
    }
    if (
      error.status === 400 &&
      (error.body.includes('orderBy') ||
        error.body.includes('requested ordering is not available'))
    ) {
      return 'Google 캘린더 동기화 조건이 맞지 않아 다시 전체 동기화를 시도합니다.'
    }
    if (error.status === 401 || error.status === 403) {
      return 'Google 캘린더 연결이 만료되었습니다. 설정에서 Google 계정을 다시 연결해주세요.'
    }
    return 'Google 캘린더와 통신 중 오류가 발생했습니다. 잠시 후 「지금 동기화」를 다시 눌러주세요.'
  }

  if (error instanceof Error) {
    const message = error.message.trim()
    const lower = message.toLowerCase()
    if (lower.includes('orderby') || lower.includes('requested ordering')) {
      return 'Google 캘린더 동기화 조건이 맞지 않아 다시 전체 동기화를 시도합니다.'
    }
    if (lower.includes('410') || lower.includes('full sync')) {
      return '반복 일정 동기화 설정을 복구했습니다. 다시 동기화해주세요.'
    }
    if (message.length > 0 && message.length <= 120 && !message.startsWith('Google Calendar API')) {
      return message
    }
  }

  return 'Google 캘린더 동기화에 실패했습니다. 잠시 후 다시 시도해주세요.'
}
