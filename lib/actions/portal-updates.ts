'use server'

import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type PortalFeedKeys = {
  viewerId: string | null
  board: string[]
  event: string[]
  weight: string[]
}

async function db() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

export async function listPortalFeed(): Promise<PortalFeedKeys> {
  const profile = await getDashboardProfile()
  if (!profile) return { viewerId: null, board: [], event: [], weight: [] }

  const supabase = await db()
  const board = new Set<string>()
  const event = new Set<string>()

  const posts = await supabase
    .from('member_event_posts')
    .select('id, author_user_id')
    .order('created_at', { ascending: false })
    .limit(50)
  if (!posts.error) {
    for (const row of posts.data ?? []) {
      if (row.author_user_id === profile.id) continue
      board.add(`post:${String(row.id)}`)
    }
  }

  const comments = await supabase
    .from('member_event_comments')
    .select('id, author_user_id')
    .order('created_at', { ascending: false })
    .limit(100)
  if (!comments.error) {
    for (const row of comments.data ?? []) {
      if (row.author_user_id === profile.id) continue
      board.add(`comment:${String(row.id)}`)
    }
  }

  const matches = await supabase
    .from('member_record_match_events')
    .select('id, created_by')
    .order('created_at', { ascending: false })
    .limit(30)
  if (!matches.error) {
    for (const row of matches.data ?? []) {
      if (row.created_by === profile.id) continue
      event.add(`match:${String(row.id)}`)
    }
  }

  return { viewerId: profile.id, board: [...board], event: [...event], weight: [] }
}
