import type {
  GoogleCalendarSyncRunStats,
  GoogleCalendarSyncStatusValue,
} from '@/lib/google-calendar/types'

export type GoogleCalendarSyncDetail = {
  run?: GoogleCalendarSyncRunStats
  succeeded?: string[]
  failed?: { name: string; error?: string }[]
}

export function parseGoogleCalendarSyncDetail(
  raw: string | null | undefined,
): GoogleCalendarSyncDetail {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as GoogleCalendarSyncDetail
  } catch {
    return {}
  }
}

export function buildGoogleCalendarSyncDetail(
  partial: GoogleCalendarSyncDetail,
): string {
  return JSON.stringify(partial)
}

export function emptyRunStats(): GoogleCalendarSyncRunStats {
  return {
    processed: 0,
    created: 0,
    updated: 0,
    pendingMember: 0,
    cancelled: 0,
    skipped: 0,
  }
}

export function syncStatusLabelKo(
  status: GoogleCalendarSyncStatusValue | null,
  isSyncing: boolean,
): string {
  if (isSyncing || status === 'syncing') return '동기화 중'
  switch (status) {
    case 'success':
      return '성공'
    case 'partial_success':
      return '부분 성공'
    case 'failure':
      return '실패'
    default:
      return '대기'
  }
}
