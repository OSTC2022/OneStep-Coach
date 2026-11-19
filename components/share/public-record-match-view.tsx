'use client'

import { useState, type FormEvent } from 'react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import {
  addPublicRecordMatchComment,
  deletePublicRecordMatchComment,
  type PublicRecordMatchEvent,
} from '@/lib/actions/member-record-match-public'
import { toast } from 'sonner'

function formatDate(value: string) {
  if (!value) return ''
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${y}.${m}.${d}`
}

export function PublicRecordMatchView({
  initialEvent,
}: {
  initialEvent: PublicRecordMatchEvent
}) {
  const [event, setEvent] = useState(initialEvent)
  const [authorName, setAuthorName] = useState('')
  const [password, setPassword] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletePasswordById, setDeletePasswordById] = useState<Record<string, string>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await addPublicRecordMatchComment({
      eventId: event.id,
      authorName,
      password,
      body,
    })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setBody('')
    toast.success('댓글을 등록했습니다.')
    if (result.comment) {
      setEvent((current) => ({
        ...current,
        comments: [...current.comments, result.comment!],
      }))
    }
  }

  async function handleDelete(commentId: string) {
    if (deletingId) return
    setDeletingId(commentId)
    const result = await deletePublicRecordMatchComment({
      eventId: event.id,
      commentId,
      password: deletePasswordById[commentId] ?? '',
    })
    setDeletingId(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setEvent((current) => ({
      ...current,
      comments: current.comments.filter((comment) => comment.id !== commentId),
    }))
    toast.success('댓글을 삭제했습니다.')
  }

  return (
    <main className="min-h-dvh bg-[#070d18] text-white">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col items-center text-center">
          <BrandPulseAppIcon glow className="h-14 w-14" />
          <p className="mt-3 text-2xl font-black tracking-tight">원스텝</p>
          <p className="mt-1 text-xs text-white/55">링크 공유 공개 이벤트</p>
        </header>

        <section className="rounded-2xl border border-lime-500/20 bg-black/35 p-4">
          <p className="text-lg font-bold text-lime-100">{event.raceTitle}</p>
          <p className="mt-1 text-sm text-white/70">
            {[formatDate(event.raceDate), event.distanceLabel, event.location]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="mt-3 space-y-1 text-sm">
            {event.prizes.map((prize, index) => (
              <p key={`${prize}-${index}`}>
                <span className="text-white/50">
                  {event.prizes.length > 1 ? `${index + 1}등 ` : '상품 '}
                </span>
                <span className="font-semibold text-[#aaff00]">{prize}</span>
              </p>
            ))}
          </div>
          {event.note ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/65">
              {event.note}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <p className="text-sm font-semibold text-white">댓글 {event.comments.length}</p>
          {event.comments.length === 0 ? (
            <p className="text-sm text-white/45">아직 댓글이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {event.comments.map((comment) => (
                <li
                  key={comment.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-lime-100">{comment.authorName}</p>
                    <time className="shrink-0 text-[11px] text-white/40">
                      {comment.createdAt
                        ? new Date(comment.createdAt).toLocaleString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/80">
                    {comment.body}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="password"
                      inputMode="text"
                      maxLength={4}
                      value={deletePasswordById[comment.id] ?? ''}
                      onChange={(event) =>
                        setDeletePasswordById((current) => ({
                          ...current,
                          [comment.id]: event.target.value,
                        }))
                      }
                      placeholder="비번 4자"
                      className="h-8 w-24 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white outline-none placeholder:text-white/35 focus-visible:border-lime-400/60"
                      aria-label="삭제용 비밀번호"
                    />
                    <button
                      type="button"
                      disabled={deletingId === comment.id}
                      onClick={() => void handleDelete(comment.id)}
                      className="text-xs text-white/45 hover:text-white disabled:opacity-50"
                    >
                      {deletingId === comment.id ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2 rounded-2xl border border-lime-500/20 bg-black/35 p-4">
          <p className="text-sm font-semibold text-white">댓글 쓰기</p>
          <p className="text-[11px] leading-relaxed text-white/45">
            이름과 비밀번호(4자)만 있으면 됩니다. 링크를 받은 사람만 이 화면에 들어올 수 있습니다.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="sr-only" htmlFor="public-event-name">
                이름
              </label>
              <input
                id="public-event-name"
                value={authorName}
                maxLength={40}
                onChange={(event) => setAuthorName(event.target.value)}
                placeholder="이름"
                required
                className="h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-white/35 focus-visible:border-lime-400/60"
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="public-event-password">
                비밀번호
              </label>
              <input
                id="public-event-password"
                type="password"
                inputMode="text"
                value={password}
                maxLength={4}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비번 4자"
                required
                className="h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-white/35 focus-visible:border-lime-400/60"
              />
            </div>
          </div>
          <label className="sr-only" htmlFor="public-event-body">
            댓글
          </label>
          <textarea
            id="public-event-body"
            value={body}
            maxLength={500}
            rows={3}
            onChange={(event) => setBody(event.target.value)}
            placeholder="댓글을 입력하세요"
            required
            className="w-full resize-y rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus-visible:border-lime-400/60"
          />
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 w-full rounded-lg bg-[#aaff00] text-sm font-bold text-[#070d18] disabled:opacity-60"
          >
            {saving ? '등록 중…' : '댓글 등록'}
          </button>
        </form>
      </div>
    </main>
  )
}
