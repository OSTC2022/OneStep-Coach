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
  sync_enabled: boolean
  last_synced_at: string | null
  last_sync_error: string | null
  pending_member_count: number
  updated_at: string
}

export type GoogleCalendarSyncStatus = {
  configured: boolean
  connected: boolean
  connectedEmail: string | null
  calendarName: string | null
  syncEnabled: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
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
  recurringEventId?: string
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
}
