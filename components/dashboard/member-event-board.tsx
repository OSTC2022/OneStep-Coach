'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  createMemberEventComment,
  createMemberEventPost,
  deleteMemberEventComment,
  deleteMemberEventPost,
  getMemberEventPosts,
  updateMemberEventPost,
  type MemberEventComment,
  type MemberEventPost,
} from '@/lib/actions/member-event-posts'
import { EventNewMark } from '@/components/dashboard/event-new-mark'
import { useMarkPortalItemsRead } from '@/components/dashboard/portal-seen'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

function formatPostedAt(value: string) {
  try {
    return format(parseISO(value), 'M.d (EEE) HH:mm', { locale: ko })
  } catch {
    return value
  }
}

function formatBoardDate(value: string) {
  try {
    return format(parseISO(value), 'yy.MM.dd')
  } catch {
    return value
  }
}

function formatBoardTime(value: string) {
  try {
    return format(parseISO(value), 'HH:mm')
  } catch {
    return value
  }
}

function formatCommentAt(value: string) {
  try {
    return format(parseISO(value), 'M.d HH:mm')
  } catch {
    return value
  }
}

function countComments(comments: MemberEventPost['comments']): number {
  return comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0)
}

function otherCommentIds(comments: MemberEventPost['comments']): string[] {
  return comments.flatMap((comment) => [
    ...(comment.isMine ? [] : [`comment:${comment.id}`]),
    ...comment.replies.filter((reply) => !reply.isMine).map((reply) => `comment:${reply.id}`),
  ])
}

function CommentLine({
  comment,
  fresh,
  onReply,
  onDelete,
}: {
  comment: MemberEventComment
  fresh: boolean
  onReply: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-start gap-2">
      <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
        {fresh ? <span className="mr-1 inline-flex align-middle"><EventNewMark label="새 댓글" /></span> : null}
        <span className="font-semibold text-lime-100">{comment.authorName}</span>
        <span className="text-zinc-500"> : </span>
        <span className="break-words">{comment.body}</span>
        <time
          dateTime={comment.createdAt}
          className="ml-1.5 whitespace-nowrap text-[10px] text-zinc-500"
        >
          {formatCommentAt(comment.createdAt)}
        </time>
      </p>
      <button
        type="button"
        onClick={onReply}
        className="shrink-0 text-[11px] text-zinc-500 hover:text-foreground"
      >
        답글
      </button>
      {comment.canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 text-[11px] text-zinc-500 hover:text-foreground"
        >
          삭제
        </button>
      ) : null}
    </div>
  )
}

function CommentThread({
  comment,
  freshIds,
  replyTargetId,
  drafts,
  savingId,
  onToggleReply,
  onDraft,
  onSubmit,
  onDelete,
}: {
  comment: MemberEventComment
  freshIds: string[]
  replyTargetId: string | null
  drafts: Record<string, string>
  savingId: string | null
  onToggleReply: (commentId: string) => void
  onDraft: (key: string, value: string) => void
  onSubmit: (event: FormEvent, parentId: string) => void
  onDelete: (commentId: string) => void
}) {
  const replyOpen = replyTargetId === comment.id
  return (
    <li>
      <CommentLine
        comment={comment}
        fresh={freshIds.includes(`comment:${comment.id}`)}
        onReply={() => onToggleReply(comment.id)}
        onDelete={() => onDelete(comment.id)}
      />
      {comment.replies.length > 0 ? (
        <ul className="mt-1 space-y-1 border-l border-primary/20 pl-3">
          {comment.replies.map((reply) => (
            <li key={reply.id}>
              <CommentLine
                comment={reply}
                fresh={freshIds.includes(`comment:${reply.id}`)}
                onReply={() => onToggleReply(comment.id)}
                onDelete={() => onDelete(reply.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {replyOpen ? (
        <form className="mt-1 flex gap-2 pl-3" onSubmit={(event) => onSubmit(event, comment.id)}>
          <label className="sr-only" htmlFor={`event-reply-${comment.id}`}>
            답글
          </label>
          <input
            id={`event-reply-${comment.id}`}
            value={drafts[comment.id] ?? ''}
            maxLength={500}
            onChange={(event) => onDraft(comment.id, event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
            placeholder="답글"
            required
          />
          <button
            type="submit"
            disabled={savingId === comment.id}
            className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {savingId === comment.id ? '등록 중…' : '등록'}
          </button>
        </form>
      ) : null}
    </li>
  )
}

export function MemberEventBoard() {
  const [posts, setPosts] = useState<MemberEventPost[]>([])
  const [canPost, setCanPost] = useState(false)
  const [canPinNotice, setCanPinNotice] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [password, setPassword] = useState('')
  const [isNotice, setIsNotice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editIsNotice, setEditIsNotice] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [deletePostId, setDeletePostId] = useState<string | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null)
  const readableIds = posts.flatMap((post) => [
    ...(post.isMine ? [] : [`post:${post.id}`]),
    ...otherCommentIds(post.comments),
  ])
  const freshIds = useMarkPortalItemsRead(loading || error ? [] : readableIds)

  async function reload() {
    const result = await getMemberEventPosts()
    setPosts(result.posts)
    setCanPost(result.canPost)
    setCanPinNotice(result.canPinNotice)
    setError(result.error ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!/^\S{4}$/.test(password)) {
      toast.error('비밀번호는 4자로 입력해주세요.')
      return
    }
    setSaving(true)
    const result = await createMemberEventPost({
      title,
      body,
      password,
      isNotice: canPinNotice ? isNotice : false,
    })
    setSaving(false)
    if (result.error) {
      toast.error('글을 올리지 못했습니다', { description: result.error })
      return
    }
    setTitle('')
    setBody('')
    setPassword('')
    setIsNotice(false)
    setComposerOpen(false)
    toast.success(isNotice ? '공지를 올렸습니다.' : '글을 올렸습니다.')
    await reload()
  }

  function startEdit(post: MemberEventPost) {
    setEditingPostId(post.id)
    setEditTitle(post.title)
    setEditBody(post.body)
    setEditIsNotice(post.isNotice)
    setDeletePostId(null)
    setDeletePassword('')
  }

  function cancelEdit() {
    setEditingPostId(null)
    setEditTitle('')
    setEditBody('')
    setEditIsNotice(false)
  }

  async function handleUpdate(event: FormEvent, postId: string) {
    event.preventDefault()
    if (editSaving) return
    setEditSaving(true)
    const result = await updateMemberEventPost({
      postId,
      title: editTitle,
      body: editBody,
      isNotice: canPinNotice ? editIsNotice : undefined,
    })
    setEditSaving(false)
    if (result.error) {
      toast.error('글을 수정하지 못했습니다', { description: result.error })
      return
    }
    cancelEdit()
    toast.success('글을 수정했습니다.')
    await reload()
  }

  async function handleDelete(postId: string, withPassword?: string) {
    const result = await deleteMemberEventPost(postId, withPassword)
    if (result.error) {
      toast.error('글을 삭제하지 못했습니다', { description: result.error })
      return
    }
    setPosts((current) => current.filter((post) => post.id !== postId))
    setDeletePostId(null)
    setDeletePassword('')
    if (editingPostId === postId) cancelEdit()
    toast.success('글을 삭제했습니다.')
  }

  async function handleComment(event: FormEvent, postId: string, parentId?: string) {
    event.preventDefault()
    if (savingCommentId) return
    const draftKey = parentId ?? postId
    const body = commentDrafts[draftKey] ?? ''
    setSavingCommentId(draftKey)
    const result = await createMemberEventComment({ postId, body, parentId })
    setSavingCommentId(null)
    if (result.error) {
      toast.error(parentId ? '답글을 달지 못했습니다' : '댓글을 달지 못했습니다', { description: result.error })
      return
    }
    setCommentDrafts((current) => ({ ...current, [draftKey]: '' }))
    if (parentId) setReplyTargetId(null)
    toast.success(parentId ? '답글을 달았습니다.' : '댓글을 달았습니다.')
    await reload()
  }

  async function handleDeleteComment(postId: string, commentId: string) {
    const result = await deleteMemberEventComment(commentId)
    if (result.error) {
      toast.error('댓글을 삭제하지 못했습니다', { description: result.error })
      return
    }
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: post.comments
                .filter((comment) => comment.id !== commentId)
                .map((comment) => ({
                  ...comment,
                  replies: comment.replies.filter((reply) => reply.id !== commentId),
                })),
            }
          : post,
      ),
    )
    toast.success('댓글을 삭제했습니다.')
  }

  return (
    <div className="space-y-3 px-2 py-2 sm:px-3">
      <div className="flex items-center justify-end gap-2">
        {canPost ? (
          <button
            type="button"
            onClick={() => setComposerOpen((open) => !open)}
            className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
            aria-expanded={composerOpen}
          >
            {composerOpen ? '닫기' : '글 올리기'}
          </button>
        ) : null}
      </div>

      {composerOpen ? (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2">
          <label className="block text-xs font-medium text-foreground" htmlFor="event-post-title">
            제목
          </label>
          <input
            id="event-post-title"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            className="h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
            placeholder="제목"
            required
          />
          <label className="block text-xs font-medium text-foreground" htmlFor="event-post-body">
            내용
          </label>
          <textarea
            id="event-post-body"
            value={body}
            maxLength={2000}
            rows={4}
            onChange={(event) => setBody(event.target.value)}
            className="w-full resize-y rounded-lg border border-border/80 bg-black/40 px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
            placeholder="회원들과 나눌 내용을 적어 주세요"
            required
          />
          <label className="block text-xs font-medium text-foreground" htmlFor="event-post-password">
            비밀번호 4자
          </label>
          <input
            id="event-post-password"
            type="password"
            value={password}
            maxLength={4}
            minLength={4}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value.slice(0, 4))}
            className="h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base tracking-[0.3em] text-foreground outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:border-primary/70"
            placeholder="4자"
            required
          />
          {canPinNotice ? (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="event-post-notice"
                checked={isNotice}
                onCheckedChange={(checked) => setIsNotice(checked === true)}
              />
              <Label htmlFor="event-post-notice" className="text-xs font-medium text-foreground">
                공지
              </Label>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? '올리는 중…' : isNotice ? '공지 등록' : '게시'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">글을 불러오는 중…</p>
      ) : error ? (
        <p className="text-sm leading-relaxed text-amber-200">{error}</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 올라온 글이 없습니다.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-primary/20 bg-black/30">
          <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_4.75rem] gap-2 border-b border-primary/15 px-3 py-2 text-[11px] font-medium text-muted-foreground sm:grid">
            <span className="text-center">번호</span>
            <span>제목</span>
            <span className="text-center">작성자</span>
            <span className="text-right">작성일</span>
          </div>
          <ul className="divide-y divide-primary/15">
          {posts.map((post) => {
            const postIsNew = freshIds.includes(`post:${post.id}`)
            const postHasNewComment = otherCommentIds(post.comments).some((id) =>
              freshIds.includes(id),
            )
            const isOpen = openPostId === post.id
            const commentCount = countComments(post.comments)
            const regularPosts = posts.filter((item) => !item.isNotice)
            const postNumber = post.isNotice
              ? null
              : regularPosts.length - regularPosts.findIndex((item) => item.id === post.id)
            return (
              <li
                key={post.id}
                className={post.isNotice ? 'bg-amber-500/5' : undefined}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenPostId((current) => (current === post.id ? null : post.id))
                  }
                  className="grid w-full grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left hover:bg-white/5 sm:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_4.75rem]"
                  aria-expanded={isOpen}
                >
                  <span
                    className={
                      post.isNotice
                        ? 'text-center text-[10px] font-semibold text-amber-300'
                        : 'text-center text-xs tabular-nums text-muted-foreground'
                    }
                  >
                    {post.isNotice ? '공지' : postNumber}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {post.isNotice ? (
                      <span className="shrink-0 rounded border border-amber-400/40 bg-amber-500/15 px-1 py-0.5 text-[10px] font-semibold text-amber-200">
                        공지
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {post.title}
                    </span>
                    {commentCount > 0 ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-primary/80">
                        ({commentCount})
                      </span>
                    ) : null}
                    {postIsNew || postHasNewComment ? <EventNewMark /> : null}
                  </span>
                  <span className="col-start-2 truncate text-[11px] text-zinc-400 sm:col-start-auto sm:text-center sm:text-xs sm:text-zinc-300">
                    {post.authorName}
                  </span>
                  <time
                    dateTime={post.createdAt}
                    className="col-start-2 flex items-center gap-1.5 text-[11px] tabular-nums text-zinc-500 sm:col-start-auto sm:block sm:text-right sm:text-xs sm:text-zinc-400"
                    title={formatPostedAt(post.createdAt)}
                  >
                    <span>{formatBoardDate(post.createdAt)}</span>
                    <span className="sm:ml-1">{formatBoardTime(post.createdAt)}</span>
                  </time>
                </button>

                {isOpen ? (
                  <div className="space-y-3 border-t border-primary/15 bg-black/20 px-3 pb-3 pt-2 sm:px-4">
                    <div className="flex justify-end gap-3">
                      {post.isMine && editingPostId !== post.id ? (
                        <button
                          type="button"
                          onClick={() => startEdit(post)}
                          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        >
                          수정
                        </button>
                      ) : null}
                      {post.adminCanDelete ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(post.id)}
                          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        >
                          삭제
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDeletePostId((current) =>
                              current === post.id ? null : post.id,
                            )
                            setDeletePassword('')
                            if (editingPostId === post.id) cancelEdit()
                          }}
                          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                          aria-expanded={deletePostId === post.id}
                        >
                          삭제
                        </button>
                      )}
                    </div>

                    {deletePostId === post.id && !post.adminCanDelete ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void handleDelete(post.id, deletePassword)
                        }}
                      >
                        <label className="sr-only" htmlFor={`event-delete-${post.id}`}>
                          삭제 비밀번호
                        </label>
                        <input
                          id={`event-delete-${post.id}`}
                          type="password"
                          value={deletePassword}
                          maxLength={4}
                          autoComplete="off"
                          onChange={(event) =>
                            setDeletePassword(event.target.value.slice(0, 4))
                          }
                          className="h-9 min-w-0 flex-1 rounded-lg border border-border/80 bg-black/40 px-3 text-base tracking-[0.3em] text-foreground outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:border-primary/70"
                          placeholder="비밀번호 4자"
                          required
                        />
                        <button
                          type="submit"
                          className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                        >
                          확인
                        </button>
                      </form>
                    ) : null}

                    {editingPostId === post.id ? (
                      <form
                        className="space-y-2"
                        onSubmit={(event) => void handleUpdate(event, post.id)}
                      >
                        <label className="sr-only" htmlFor={`event-edit-title-${post.id}`}>
                          제목 수정
                        </label>
                        <input
                          id={`event-edit-title-${post.id}`}
                          value={editTitle}
                          maxLength={80}
                          onChange={(event) => setEditTitle(event.target.value)}
                          className="h-10 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
                          placeholder="제목"
                          required
                        />
                        <label className="sr-only" htmlFor={`event-edit-body-${post.id}`}>
                          내용 수정
                        </label>
                        <textarea
                          id={`event-edit-body-${post.id}`}
                          value={editBody}
                          maxLength={2000}
                          rows={4}
                          onChange={(event) => setEditBody(event.target.value)}
                          className="w-full resize-y rounded-lg border border-border/80 bg-black/40 px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
                          placeholder="내용"
                          required
                        />
                        {canPinNotice ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`event-edit-notice-${post.id}`}
                              checked={editIsNotice}
                              onCheckedChange={(checked) =>
                                setEditIsNotice(checked === true)
                              }
                            />
                            <Label
                              htmlFor={`event-edit-notice-${post.id}`}
                              className="text-xs font-medium text-foreground"
                            >
                              공지
                            </Label>
                          </div>
                        ) : null}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={editSaving}
                            className="h-9 rounded-lg border border-border/80 px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                          >
                            취소
                          </button>
                          <button
                            type="submit"
                            disabled={editSaving}
                            className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                          >
                            {editSaving ? '저장 중…' : '저장'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                        {post.body}
                      </p>
                    )}

                    <div className="space-y-2 border-t border-primary/15 pt-2">
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        댓글 {commentCount}
                        {postHasNewComment ? <EventNewMark /> : null}
                      </p>
                      {post.comments.length > 0 ? (
                        <ul className="space-y-1.5">
                          {post.comments.map((comment) => (
                            <CommentThread
                              key={comment.id}
                              comment={comment}
                              freshIds={freshIds}
                              replyTargetId={replyTargetId}
                              drafts={commentDrafts}
                              savingId={savingCommentId}
                              onToggleReply={(commentId) =>
                                setReplyTargetId((current) =>
                                  current === commentId ? null : commentId,
                                )
                              }
                              onDraft={(key, value) =>
                                setCommentDrafts((current) => ({
                                  ...current,
                                  [key]: value,
                                }))
                              }
                              onSubmit={(event, parentId) =>
                                void handleComment(event, post.id, parentId)
                              }
                              onDelete={(commentId) =>
                                void handleDeleteComment(post.id, commentId)
                              }
                            />
                          ))}
                        </ul>
                      ) : null}
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => void handleComment(event, post.id)}
                      >
                        <label className="sr-only" htmlFor={`event-comment-${post.id}`}>
                          댓글
                        </label>
                        <input
                          id={`event-comment-${post.id}`}
                          value={commentDrafts[post.id] ?? ''}
                          maxLength={500}
                          onChange={(event) =>
                            setCommentDrafts((current) => ({
                              ...current,
                              [post.id]: event.target.value,
                            }))
                          }
                          className="h-9 min-w-0 flex-1 rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
                          placeholder="댓글"
                          required
                        />
                        <button
                          type="submit"
                          disabled={savingCommentId === post.id}
                          className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          {savingCommentId === post.id ? '등록 중…' : '등록'}
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
          </ul>
        </div>
      )}
    </div>
  )
}
