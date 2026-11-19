'use server'

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type MemberEventComment = {
  id: string
  parentId: string | null
  authorName: string
  body: string
  createdAt: string
  canDelete: boolean
  isMine: boolean
  replies: MemberEventComment[]
}

export type MemberEventPost = {
  id: string
  authorName: string
  title: string
  body: string
  createdAt: string
  isNotice: boolean
  adminCanDelete: boolean
  isMine: boolean
  comments: MemberEventComment[]
}

const TITLE_MAX = 80
const BODY_MAX = 2000
const COMMENT_MAX = 500
const MISSING_TABLE_HINT =
  '이벤트 게시판 테이블이 없습니다. Supabase SQL Editor에서 supabase/add-member-event-posts.sql 을 실행해주세요.'
const MISSING_PASSWORD_HINT =
  '게시글 비밀번호 칸이 없습니다. Supabase SQL Editor에서 supabase/add-member-event-posts.sql 을 다시 실행해주세요.'
const MISSING_COMMENT_HINT =
  '댓글 테이블이 없습니다. Supabase SQL Editor에서 supabase/add-member-event-posts.sql 을 다시 실행해주세요.'
const MISSING_REPLY_HINT =
  '대댓글 칸이 없습니다. Supabase SQL Editor에서 supabase/add-member-event-posts.sql 을 다시 실행해주세요.'
const MISSING_NOTICE_HINT =
  '공지 칸이 없습니다. Supabase SQL Editor에서 supabase/add-member-event-posts-notice.sql 을 실행해주세요.'

function isMissingTable(message: string) {
  return message.includes('member_event_posts') && (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('Could not find')
  ) && !message.includes('password_hash') && !message.includes('member_event_comments') && !message.includes('is_notice')
}

function isMissingCommentTable(message: string) {
  return message.includes('member_event_comments') && (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('Could not find')
  )
}

function isMissingPasswordColumn(message: string) {
  return message.includes('password_hash')
}

function isMissingReplyColumn(message: string) {
  return message.includes('parent_id')
}

function isMissingNoticeColumn(message: string) {
  return message.includes('is_notice')
}

function boardError(message: string) {
  if (isMissingNoticeColumn(message)) return MISSING_NOTICE_HINT
  if (isMissingReplyColumn(message)) return MISSING_REPLY_HINT
  if (isMissingCommentTable(message)) return MISSING_COMMENT_HINT
  if (isMissingPasswordColumn(message)) return MISSING_PASSWORD_HINT
  if (isMissingTable(message)) return MISSING_TABLE_HINT
  return message
}

function canPinNotice(role: string | null | undefined) {
  return role === 'admin' || role === 'instructor'
}

function hashPostPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

function passwordMatches(password: string, stored: string | null) {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const next = scryptSync(password, salt, 32)
  const prev = Buffer.from(hash, 'hex')
  if (next.length !== prev.length) return false
  return timingSafeEqual(next, prev)
}

function isFourCharPassword(value: string) {
  return /^\S{4}$/.test(value)
}

async function boardClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function mapPost(
  row: Record<string, unknown>,
  adminCanDelete: boolean,
  comments: MemberEventComment[],
  viewerId: string,
): MemberEventPost {
  return {
    id: String(row.id),
    authorName: String(row.author_name ?? '회원'),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    createdAt: String(row.created_at),
    isNotice: Boolean(row.is_notice),
    adminCanDelete,
    isMine: row.author_user_id === viewerId,
    comments,
  }
}

function sortBoardPosts(posts: MemberEventPost[]) {
  return [...posts].sort((a, b) => {
    if (a.isNotice !== b.isNotice) return a.isNotice ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export async function getMemberEventPosts(): Promise<{
  posts: MemberEventPost[]
  canPost: boolean
  canPinNotice: boolean
  error?: string
}> {
  const profile = await getDashboardProfile()
  if (!profile) {
    return { posts: [], canPost: false, canPinNotice: false, error: '로그인이 필요합니다.' }
  }

  const pinNotice = canPinNotice(profile.role)
  const supabase = await boardClient()
  let result = await supabase
    .from('member_event_posts')
    .select('id, author_user_id, author_name, title, body, created_at, is_notice')
    .order('created_at', { ascending: false })
    .limit(50)

  if (result.error && isMissingNoticeColumn(result.error.message)) {
    result = await supabase
      .from('member_event_posts')
      .select('id, author_user_id, author_name, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
  }

  if (result.error) {
    return {
      posts: [],
      canPost: true,
      canPinNotice: pinNotice,
      error: boardError(result.error.message),
    }
  }

  const adminCanDelete = profile.role === 'admin'
  const postRows = result.data ?? []
  const postIds = postRows.map((row) => String(row.id))
  const commentsByPost = new Map<string, MemberEventComment[]>()
  if (postIds.length > 0) {
    let commentResult = await supabase
      .from('member_event_comments')
      .select('id, post_id, parent_id, author_user_id, author_name, body, created_at')
      .in('post_id', postIds)
      .order('created_at', { ascending: true })
    if (commentResult.error && isMissingReplyColumn(commentResult.error.message)) {
      commentResult = await supabase
        .from('member_event_comments')
        .select('id, post_id, author_user_id, author_name, body, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })
    }

    if (commentResult.error && !isMissingCommentTable(commentResult.error.message)) {
      return {
        posts: [],
        canPost: true,
        canPinNotice: pinNotice,
        error: boardError(commentResult.error.message),
      }
    }

    const rowsByPost = new Map<string, Array<Record<string, unknown>>>()
    for (const row of commentResult.data ?? []) {
      const postId = String(row.post_id)
      const list = rowsByPost.get(postId) ?? []
      list.push(row as Record<string, unknown>)
      rowsByPost.set(postId, list)
    }
    for (const [postId, rows] of rowsByPost) {
      commentsByPost.set(postId, nestComments(rows, profile.id, adminCanDelete))
    }
  }

  return {
    posts: sortBoardPosts(
      postRows.map((row) =>
        mapPost(
          row as Record<string, unknown>,
          adminCanDelete,
          commentsByPost.get(String(row.id)) ?? [],
          profile.id,
        ),
      ),
    ),
    canPost: true,
    canPinNotice: pinNotice,
  }
}

export async function listRecentEventCommentIds(): Promise<{ ids: string[] }> {
  const profile = await getDashboardProfile()
  if (!profile) return { ids: [] }

  const supabase = await boardClient()
  const { data, error } = await supabase
    .from('member_event_comments')
    .select('id, author_user_id')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { ids: [] }
  return {
    ids: (data ?? [])
      .filter((row) => row.author_user_id !== profile.id)
      .map((row) => String(row.id)),
  }
}

function nestComments(
  rows: Array<Record<string, unknown>>,
  viewerId: string,
  adminCanDelete: boolean,
): MemberEventComment[] {
  const comments = new Map<string, MemberEventComment>()
  for (const row of rows) {
    const id = String(row.id)
    comments.set(id, {
      id,
      parentId: row.parent_id ? String(row.parent_id) : null,
      authorName: String(row.author_name ?? '회원'),
      body: String(row.body ?? ''),
      createdAt: String(row.created_at),
      canDelete: adminCanDelete || row.author_user_id === viewerId,
      isMine: row.author_user_id === viewerId,
      replies: [],
    })
  }

  const roots: MemberEventComment[] = []
  for (const comment of comments.values()) {
    const parent = comment.parentId ? comments.get(comment.parentId) : null
    if (parent && parent.id !== comment.id) parent.replies.push(comment)
    else roots.push(comment)
  }
  return roots
}

export async function createMemberEventComment(input: {
  postId: string
  body: string
  parentId?: string | null
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const body = input.body.trim()
  if (!input.postId) return { error: '글을 찾지 못했습니다.' }
  if (!body) return { error: '댓글을 입력해주세요.' }
  if (body.length > COMMENT_MAX) return { error: `댓글은 ${COMMENT_MAX}자까지 입력할 수 있습니다.` }

  const member = await getMemberForCurrentUser()
  const authorName = member?.name?.trim() || profile.full_name?.trim() || '회원'
  const supabase = await boardClient()
  let parentId: string | null = null
  if (input.parentId) {
    const parent = await supabase
      .from('member_event_comments')
      .select('id, post_id, parent_id')
      .eq('id', input.parentId)
      .maybeSingle()
    if (parent.error && isMissingReplyColumn(parent.error.message)) return { error: MISSING_REPLY_HINT }
    if (parent.error) return { error: boardError(parent.error.message) }
    if (!parent.data || String(parent.data.post_id) !== input.postId) {
      return { error: '답글을 달 댓글을 찾지 못했습니다.' }
    }
    parentId = parent.data.parent_id ? String(parent.data.parent_id) : String(parent.data.id)
  }

  const { error } = await supabase.from('member_event_comments').insert({
    post_id: input.postId,
    member_id: member?.id ?? null,
    author_user_id: profile.id,
    author_name: authorName,
    body,
    ...(parentId ? { parent_id: parentId } : {}),
  })

  if (error) return { error: boardError(error.message) }

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  return {}
}

export async function deleteMemberEventComment(commentId: string): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const supabase = await boardClient()
  const { data, error: readError } = await supabase
    .from('member_event_comments')
    .select('id, author_user_id')
    .eq('id', commentId)
    .maybeSingle()

  if (readError) return { error: boardError(readError.message) }
  if (!data) return { error: '댓글을 찾지 못했습니다.' }

  const isAdmin = profile.role === 'admin'
  if (!isAdmin && data.author_user_id !== profile.id) {
    return { error: '본인 댓글만 삭제할 수 있습니다.' }
  }

  const { error } = await supabase.from('member_event_comments').delete().eq('id', commentId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  return {}
}

export async function createMemberEventPost(input: {
  title: string
  body: string
  password: string
  isNotice?: boolean
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const title = input.title.trim()
  const body = input.body.trim()
  const password = input.password
  const isNotice = Boolean(input.isNotice) && canPinNotice(profile.role)
  if (!title) return { error: '제목을 입력해주세요.' }
  if (title.length > TITLE_MAX) return { error: `제목은 ${TITLE_MAX}자까지 입력할 수 있습니다.` }
  if (!body) return { error: '내용을 입력해주세요.' }
  if (body.length > BODY_MAX) return { error: `내용은 ${BODY_MAX}자까지 입력할 수 있습니다.` }
  if (!isFourCharPassword(password)) return { error: '비밀번호는 4자로 입력해주세요.' }
  if (input.isNotice && !canPinNotice(profile.role)) {
    return { error: '관리자 또는 강사만 공지를 등록할 수 있습니다.' }
  }

  const member = await getMemberForCurrentUser()
  const authorName = member?.name?.trim() || profile.full_name?.trim() || '회원'
  const supabase = await boardClient()
  const { error } = await supabase.from('member_event_posts').insert({
    member_id: member?.id ?? null,
    author_user_id: profile.id,
    author_name: authorName,
    title,
    body,
    password_hash: hashPostPassword(password),
    is_notice: isNotice,
  })

  if (error) {
    return { error: boardError(error.message) }
  }

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  return {}
}

export async function updateMemberEventPost(input: {
  postId: string
  title: string
  body: string
  isNotice?: boolean
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const title = input.title.trim()
  const body = input.body.trim()
  if (!input.postId) return { error: '글을 찾지 못했습니다.' }
  if (!title) return { error: '제목을 입력해주세요.' }
  if (title.length > TITLE_MAX) return { error: `제목은 ${TITLE_MAX}자까지 입력할 수 있습니다.` }
  if (!body) return { error: '내용을 입력해주세요.' }
  if (body.length > BODY_MAX) return { error: `내용은 ${BODY_MAX}자까지 입력할 수 있습니다.` }

  const supabase = await boardClient()
  const { data, error: readError } = await supabase
    .from('member_event_posts')
    .select('id, author_user_id, is_notice')
    .eq('id', input.postId)
    .maybeSingle()

  if (readError && !isMissingNoticeColumn(readError.message)) {
    return { error: boardError(readError.message) }
  }
  if (readError && isMissingNoticeColumn(readError.message)) {
    const fallback = await supabase
      .from('member_event_posts')
      .select('id, author_user_id')
      .eq('id', input.postId)
      .maybeSingle()
    if (fallback.error) return { error: boardError(fallback.error.message) }
    if (!fallback.data) return { error: '글을 찾지 못했습니다.' }
    if (fallback.data.author_user_id !== profile.id) {
      return { error: '본인 글만 수정할 수 있습니다.' }
    }
    if (input.isNotice) return { error: MISSING_NOTICE_HINT }
    const { error } = await supabase
      .from('member_event_posts')
      .update({
        title,
        body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.postId)
      .eq('author_user_id', profile.id)
    if (error) return { error: boardError(error.message) }
    revalidatePath('/dashboard/my')
    revalidatePath('/dashboard/running-portal')
    return {}
  }

  if (!data) return { error: '글을 찾지 못했습니다.' }
  if (data.author_user_id !== profile.id) {
    return { error: '본인 글만 수정할 수 있습니다.' }
  }

  const nextNotice =
    input.isNotice === undefined
      ? Boolean(data.is_notice)
      : Boolean(input.isNotice) && canPinNotice(profile.role)
  if (input.isNotice && !canPinNotice(profile.role)) {
    return { error: '관리자 또는 강사만 공지를 설정할 수 있습니다.' }
  }

  const { error } = await supabase
    .from('member_event_posts')
    .update({
      title,
      body,
      is_notice: nextNotice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.postId)
    .eq('author_user_id', profile.id)

  if (error) return { error: boardError(error.message) }

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  return {}
}

export async function deleteMemberEventPost(
  postId: string,
  password?: string,
): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const supabase = await boardClient()
  const { data, error: readError } = await supabase
    .from('member_event_posts')
    .select('id, password_hash')
    .eq('id', postId)
    .maybeSingle()

  if (readError) {
    return { error: boardError(readError.message) }
  }
  if (!data) return { error: '글을 찾지 못했습니다.' }

  const isAdmin = profile.role === 'admin'
  if (!isAdmin) {
    if (!isFourCharPassword(password ?? '')) return { error: '비밀번호 4자를 입력해주세요.' }
    if (!passwordMatches(password ?? '', (data.password_hash as string | null) ?? null)) {
      return { error: '비밀번호가 맞지 않습니다.' }
    }
  }

  const { error } = await supabase.from('member_event_posts').delete().eq('id', postId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  return {}
}
