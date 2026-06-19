export type GoogleCalendarSyncStatusValue =
  | 'syncing'
  | 'success'
  | 'partial_success'
  | 'failure'

export type GoogleCalendarSyncRunStats = {
  processed: number
  created: number
  updated: number
  pendingMember: number
  cancelled: number
  skipped: number
  deduped?: number
}

export type GoogleCalendarSyncRow = {
  id: string
  connected_email: string | null
  refresh_token: string | null
  calendar_id: string | null
  calendar_name: string | null
  sync_token: string | null
  watch_channel_id: string | null
  watch_resource_id: string | null
  watch_expiration: string | null
  calendar_id_2: string | null
  calendar_name_2: string | null
  sync_token_2: string | null
  watch_channel_id_2: string | null
  watch_resource_id_2: string | null
  watch_expiration_2: string | null
  sync_enabled: boolean
  last_synced_at: string | null
  last_sync_attempt_at: string | null
  last_sync_error: string | null
  sync_status: GoogleCalendarSyncStatusValue | null
  sync_status_detail: string | null
  pending_member_count: number
  updated_at: string
}

export type GoogleCalendarSyncStatus = {
  configured: boolean
  connected: boolean
  connectedEmail: string | null
  calendarName: string | null
  calendarNames: string[]
  syncEnabled: boolean
  lastSyncedAt: string | null
  lastSyncAttemptAt: string | null
  lastSyncError: string | null
  syncStatus: GoogleCalendarSyncStatusValue | null
  syncStatusDetail: string | null
  runStats: GoogleCalendarSyncRunStats | null
  isSyncing: boolean
  pendingMemberCount: number
  watchActive: boolean
  watchExpiresAt: string | null
}

export type GoogleCalendarEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  updated?: string
  recurrence?: string[]
  recurringEventId?: string
  iCalUID?: string
  extendedProperties?: {
    private?: Record<string, string>
    shared?: Record<string, string>
  }
  originalStartTime?: { dateTime?: string; date?: string; timeZone?: string }
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
}

export type GoogleCalendarListEntry = {
  id: string
  summary?: string
  primary?: boolean
}

export type GoogleCalendarSyncResult = {
  created: number
  updated: number
  linked: number
  cancelled: number
  pendingMember: number
  skipped: number
  syncStatus?: GoogleCalendarSyncStatusValue
  deduped?: number
}
