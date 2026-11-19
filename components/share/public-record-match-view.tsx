'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { setRecordMatchWinners } from '@/lib/actions/member-record-match'
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
  const [winnerDrafts, setWinnerDrafts] = useState<string[][]>(() =>
    initialEvent.prizes.map((_, index) => {
      const names = initialEvent.winners
        .filter((winner) => winner.prizeIndex === index)
        .map((winner) => winner.name)
      return names.length > 0 ? names : ['']
    }),
  )

  const candidateNames = useMemo(() => {
    const names = new Set(event.comments.map((comment) => comment.authorName.trim()).filter(Boolean))
    for (const winner of event.winners) names.add(winner.name)
    return [...names].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [event.comments, event.winners])

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

  async function handleSaveWinners() {
    if (saving) return
    const winners = winnerDrafts.flatMap((names, prizeIndex) =>
      (names ?? [])
        .map((name) => name.trim())
        .filter(Boolean)
        .map((guestName) => ({ guestName, prizeIndex })),
    )
    setSaving(true)
    const result = await setRecordMatchWinners({ eventId: event.id, winners })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    const nextWinners = winners.map((winner) => ({
      name: winner.guestName,
      prizeIndex: winner.prizeIndex,
      prize: event.prizes[winner.prizeIndex] ?? event.prizes[0] ?? '',
    }))
    setEvent((current) => ({ ...current, winners: nextWinners }))
    toast.success(winners.length > 0 ? '당첨자를 저장했습니다.' : '당첨자를 비웠습니다.')
  }

  return (
    <main className="min-h-dvh bg-[#070d18] text-white">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col items-center text-center">
          <BrandPulseAppIcon glow className="h-14 w-14" />
          <p className="mt-3 text-2xl font-black tracking-tight">원스텝</p>
          <p className="mt-1 text-xs text-white/55">원스텝 외부 공개 이벤트</p>
        </header>

        <section className="rounded-2xl border border-lime-500/20 bg-black/35 p-4">
          <h1 className="text-2xl font-black leading-snug tracking-tight text-white sm:text-[1.75rem]">
            {event.title}
          </h1>
          <p className="mt-2 text-sm font-medium text-lime-200/90">{event.raceTitle}</p>
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

        {event.winners.length > 0 ? (
          <section className="rounded-2xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent px-4 py-4 shadow-[0_0_24px_rgba(251,191,36,0.12)]">
            <p className="text-center text-xs font-bold tracking-[0.2em] text-amber-200">
              WINNER
            </p>
            <p className="mt-1 text-center text-lg font-black text-amber-100">당첨자</p>
            <ul className="mt-3 space-y-2">
              {event.winners.map((winner) => (
                <li
                  key={`${winner.prizeIndex}-${winner.name}`}
                  className="rounded-xl border border-amber-300/30 bg-black/30 px-3 py-2.5 text-center"
                >
                  <p className="text-[11px] font-semibold text-amber-200/80">
                    {event.prizes.length > 1 ? `${winner.prizeIndex + 1}등` : '상품'} ·{' '}
                    {winner.prize}
                  </p>
                  <p className="mt-0.5 text-xl font-black tracking-tight text-white">
                    {winner.name}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {event.canSelectWinners ? (
          <section className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-100">당첨자 선정 (관리자)</p>
            <p className="text-[11px] text-white/50">
              댓글을 남긴 사람 중에서 같은 등수에 여러 명을 추가할 수 있습니다.
            </p>
            {event.prizes.map((prize, index) => {
              const picks = winnerDrafts[index] ?? ['']
              return (
                <div key={`admin-prize-${index}`} className="space-y-1.5">
                  <p className="text-[11px] text-amber-100/80">
                    {event.prizes.length > 1 ? `${index + 1}등 · ${prize}` : `상품 · ${prize}`}
                  </p>
                  {picks.map((name, pickIndex) => (
                    <div key={`pick-${index}-${pickIndex}`} className="flex items-center gap-1.5">
                      <select
                        value={name}
                        disabled={saving || candidateNames.length === 0}
                        onChange={(change) =>
                          setWinnerDrafts((current) => {
                            const next = current.map((row) => [...row])
                            while (next.length < event.prizes.length) next.push([''])
                            const row = [...(next[index] ?? [''])]
                            row[pickIndex] = change.target.value
                            next[index] = row
                            return next
                          })
                        }
                        className="h-10 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white outline-none focus-visible:border-amber-300/60 disabled:opacity-60"
                      >
                        <option value="">미선정</option>
                        {candidateNames.map((candidate) => (
                          <option key={candidate} value={candidate}>
                            {candidate}
                          </option>
                        ))}
                      </select>
                      {picks.length > 1 ? (
                        <button
                          type="button"
                          disabled={saving}
                          aria-label="당첨자 제거"
                          onClick={() =>
                            setWinnerDrafts((current) => {
                              const next = current.map((row) => [...row])
                              const row = [...(next[index] ?? [''])]
                              row.splice(pickIndex, 1)
                              next[index] = row.length > 0 ? row : ['']
                              return next
                            })
                          }
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/50 hover:text-white disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={saving || candidateNames.length === 0}
                    onClick={() =>
                      setWinnerDrafts((current) => {
                        const next = current.map((row) => [...row])
                        while (next.length < event.prizes.length) next.push([''])
                        next[index] = [...(next[index] ?? ['']), '']
                        return next
                      })
                    }
                    className="inline-flex min-h-8 items-center gap-1 text-[11px] font-semibold text-amber-200 hover:text-amber-100 disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    인원 추가
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              disabled={saving || candidateNames.length === 0}
              onClick={() => void handleSaveWinners()}
              className="min-h-10 w-full rounded-lg bg-amber-400 text-sm font-bold text-[#070d18] disabled:opacity-60"
            >
              {saving ? '저장 중…' : '당첨자 저장'}
            </button>
            {candidateNames.length === 0 ? (
              <p className="text-[11px] text-white/45">댓글이 있어야 당첨자를 선정할 수 있습니다.</p>
            ) : null}
          </section>
        ) : null}

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
                      onChange={(change) =>
                        setDeletePasswordById((current) => ({
                          ...current,
                          [comment.id]: change.target.value,
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

        <form
          onSubmit={(formEvent) => void handleSubmit(formEvent)}
          className="space-y-2 rounded-2xl border border-lime-500/20 bg-black/35 p-4"
        >
          <p className="text-sm font-semibold text-white">댓글 쓰기</p>
          <p className="text-[11px] leading-relaxed text-white/45">
            회원 로그인 없이 이름·비밀번호(4자)로 댓글할 수 있습니다. 링크를 받은 분만 이 화면에
            들어올 수 있습니다.
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
                onChange={(change) => setAuthorName(change.target.value)}
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
                onChange={(change) => setPassword(change.target.value)}
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
            onChange={(change) => setBody(change.target.value)}
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
