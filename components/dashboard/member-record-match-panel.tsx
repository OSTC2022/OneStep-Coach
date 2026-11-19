'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Link2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createRecordMatchEvent,
  deleteRecordMatchEvent,
  getRecordMatchBoard,
  saveRecordMatchActual,
  setRecordMatchWinners,
  submitRecordMatchEntry,
  updateRecordMatchEvent,
  type RecordMatchEvent,
} from '@/lib/actions/member-record-match'
import { EventNewMark } from '@/components/dashboard/event-new-mark'
import { useMarkPortalItemsRead } from '@/components/dashboard/portal-seen'
import { buildEventMatchShareUrl } from '@/lib/event-match-share'
import { formatTimeGap } from '@/lib/member-record-match'
import {
  MARATHON_DISTANCE_FILTERS,
  type MarathonDistanceFilter,
} from '@/lib/running-league/marathon-schedule'

type RaceOption = {
  id: string
  title: string
  eventDate: string
  location: string
  signedUp: boolean
  signedDistances: MarathonDistanceFilter[]
}

function formatRaceDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return format(date, 'M.d (EEE)', { locale: ko })
}

function PrizeFields({
  idPrefix,
  prizes,
  onChange,
  disabled = false,
}: {
  idPrefix: string
  prizes: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      {prizes.map((value, index) => (
        <div key={`${idPrefix}-${index}`} className="flex gap-2">
          <label className="sr-only" htmlFor={`${idPrefix}-prize-${index}`}>
            상품 {index + 1}
          </label>
          <input
            id={`${idPrefix}-prize-${index}`}
            value={value}
            maxLength={80}
            disabled={disabled}
            onChange={(event) => {
              const next = [...prizes]
              next[index] = event.target.value
              onChange(next)
            }}
            className="h-11 min-w-0 flex-1 rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70 disabled:opacity-60"
            placeholder={index === 0 ? '예: 프로틴 1통' : `상품 ${index + 1}`}
            required={index === 0}
          />
          {prizes.length > 1 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(prizes.filter((_, itemIndex) => itemIndex !== index))}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/80 text-muted-foreground hover:text-foreground disabled:opacity-60"
              aria-label={`상품 ${index + 1} 삭제`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        disabled={disabled || prizes.length >= 8}
        onClick={() => onChange([...prizes, ''])}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" />
        상품 추가
      </button>
    </div>
  )
}

export function MemberRecordMatchPanel({
  focusEventId = null,
  sharePath = '/dashboard/running-portal',
}: {
  focusEventId?: string | null
  sharePath?: string
} = {}) {
  const [events, setEvents] = useState<RecordMatchEvent[]>([])
  const [races, setRaces] = useState<RaceOption[]>([])
  const [mineOnly, setMineOnly] = useState(false)
  const [canCreate, setCanCreate] = useState(false)
  const [canEnter, setCanEnter] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [raceId, setRaceId] = useState('')
  const [distance, setDistance] = useState('')
  const [prizes, setPrizes] = useState<string[]>([''])
  const [note, setNote] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editDistance, setEditDistance] = useState('')
  const [editPrizes, setEditPrizes] = useState<string[]>([''])
  const [editNote, setEditNote] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(false)
  const [winnerDrafts, setWinnerDrafts] = useState<Record<string, string[]>>({})
  const [drafts, setDrafts] = useState<Record<string, { predicted: string; actual: string }>>({})
  const [actualDrafts, setActualDrafts] = useState<Record<string, string>>({})
  const focusedRef = useRef<HTMLLIElement | null>(null)

  async function reload() {
    const result = await getRecordMatchBoard()
    setEvents(result.events)
    setRaces(result.races)
    setCanCreate(result.canCreate)
    setCanEnter(result.canEnter)
    setError(result.error ?? null)
    setRaceId((current) => current || result.races[0]?.id || '')
    setDrafts((current) => {
      const next = { ...current }
      for (const event of result.events) {
        next[event.id] = {
          predicted: event.mine ? event.mine.predictedLabel : (current[event.id]?.predicted ?? ''),
          actual: event.mine?.actualLabel ?? current[event.id]?.actual ?? '',
        }
      }
      return next
    })
    setActualDrafts((current) => {
      const next = { ...current }
      for (const event of result.events) {
        for (const guess of event.guesses) {
          next[`${event.id}:${guess.memberId}`] = guess.actualLabel ?? ''
        }
      }
      return next
    })
    setWinnerDrafts((current) => {
      const next = { ...current }
      for (const event of result.events) {
        const prizes = event.prizes.length > 0 ? event.prizes : [event.prize]
        const slots = prizes.map((_, index) => {
          const winner = event.winners.find((item) => item.prizeIndex === index)
          return winner?.memberId ?? current[event.id]?.[index] ?? ''
        })
        next[event.id] = slots
      }
      return next
    })
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    if (loading || !focusEventId) return
    const frame = window.requestAnimationFrame(() => {
      focusedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusEventId, loading, events])

  async function copyEventLink(eventId: string) {
    const url = buildEventMatchShareUrl(eventId, sharePath)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('링크를 복사했습니다.')
    } catch {
      toast.error('링크를 복사하지 못했습니다.', { description: url })
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await createRecordMatchEvent({
      marathonEventId: raceId,
      distance: distanceValue || null,
      prizes,
      note,
      isPublic,
    })
    setSaving(false)
    if (result.error) {
      toast.error('이벤트를 만들지 못했습니다', { description: result.error })
      return
    }
    setPrizes([''])
    setNote('')
    setIsPublic(false)
    setDistance('')
    setComposerOpen(false)
    toast.success(
      isPublic ? '공개 이벤트를 열었습니다.' : '기록 맞추기 이벤트를 열었습니다.',
    )
    if (result.id) void copyEventLink(result.id)
    await reload()
  }

  function startEdit(item: RecordMatchEvent) {
    setEditingEventId(item.id)
    setEditDistance(item.distance ?? '')
    setEditPrizes(item.prizes.length > 0 ? item.prizes : [item.prize || ''])
    setEditNote(item.note)
    setEditIsPublic(item.isPublic)
    setComposerOpen(false)
  }

  function cancelEdit() {
    setEditingEventId(null)
    setEditDistance('')
    setEditPrizes([''])
    setEditNote('')
    setEditIsPublic(false)
  }

  async function handleUpdate(event: FormEvent, eventId: string) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await updateRecordMatchEvent({
      eventId,
      distance: editDistance || null,
      prizes: editPrizes,
      note: editNote,
      isPublic: editIsPublic,
    })
    setSaving(false)
    if (result.error) {
      toast.error('이벤트를 수정하지 못했습니다', { description: result.error })
      return
    }
    cancelEdit()
    toast.success('이벤트를 수정했습니다.')
    await reload()
  }

  async function handleEntry(eventId: string) {
    const draft = drafts[eventId]
    if (!draft || saving) return
    setSaving(true)
    const result = await submitRecordMatchEntry({
      eventId,
      predicted: draft.predicted,
    })
    setSaving(false)
    if (result.error) {
      toast.error('기록을 저장하지 못했습니다', { description: result.error })
      return
    }
    toast.success('기록을 저장했습니다.')
    await reload()
  }

  async function handleActual(eventId: string, memberId: string) {
    if (saving) return
    setSaving(true)
    const result = await saveRecordMatchActual({
      eventId,
      memberId,
      actual: actualDrafts[`${eventId}:${memberId}`] ?? '',
    })
    setSaving(false)
    if (result.error) {
      toast.error('실제 기록을 저장하지 못했습니다', { description: result.error })
      return
    }
    toast.success('실제 기록을 저장했습니다.')
    await reload()
  }

  async function handleDelete(eventId: string) {
    const result = await deleteRecordMatchEvent(eventId)
    if (result.error) {
      toast.error('이벤트를 삭제하지 못했습니다', { description: result.error })
      return
    }
    setEvents((current) => current.filter((item) => item.id !== eventId))
    if (editingEventId === eventId) cancelEdit()
    toast.success('이벤트를 삭제했습니다.')
  }

  async function handleSaveWinners(eventId: string) {
    if (saving) return
    const slots = winnerDrafts[eventId] ?? []
    const winners = slots
      .map((memberId, prizeIndex) => ({ memberId: memberId.trim(), prizeIndex }))
      .filter((item) => item.memberId)
    setSaving(true)
    const result = await setRecordMatchWinners({ eventId, winners })
    setSaving(false)
    if (result.error) {
      toast.error('당첨자를 저장하지 못했습니다', { description: result.error })
      return
    }
    toast.success(winners.length > 0 ? '당첨자를 저장했습니다.' : '당첨자를 비웠습니다.')
    await reload()
  }

  const matchIds = events.filter((item) => !item.createdByMe).map((item) => `match:${item.id}`)
  const freshMatchIds = useMarkPortalItemsRead(loading || error ? [] : matchIds)
  const visibleRaces = mineOnly ? races.filter((race) => race.signedUp) : races
  const selectedRace = visibleRaces.find((race) => race.id === raceId) ?? null
  const registeredDistances =
    mineOnly && selectedRace && selectedRace.signedDistances.length > 0
      ? selectedRace.signedDistances
      : null
  const distanceOptions = registeredDistances
    ? MARATHON_DISTANCE_FILTERS.filter((item) => registeredDistances.includes(item.id))
    : MARATHON_DISTANCE_FILTERS
  const distanceValue =
    registeredDistances && !registeredDistances.includes(distance as MarathonDistanceFilter)
      ? registeredDistances[0]
      : distance

  const memberEvents = events.filter((item) => !item.isPublic)
  const publicEvents = events.filter((item) => item.isPublic)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">회원 기록 맞추기</p>
        {canCreate ? (
          <button
            type="button"
            onClick={() => {
              setIsPublic(false)
              setComposerOpen((open) => !open)
            }}
            className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
            aria-expanded={composerOpen && !isPublic}
          >
            {composerOpen && !isPublic ? '닫기' : '회원 이벤트'}
          </button>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        원스텝 회원 전용입니다. 대회를 고르고 상품을 건 뒤, 회원이 예상 기록을 맞춥니다.
      </p>

      {composerOpen ? (
        <form onSubmit={(event) => void handleCreate(event)} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-foreground" htmlFor="record-match-race">
              대회
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-lime-100">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(event) => {
                  const next = event.target.checked
                  setMineOnly(next)
                  const nextRaces = next ? races.filter((race) => race.signedUp) : races
                  const nextRace = nextRaces.some((race) => race.id === raceId)
                    ? nextRaces.find((race) => race.id === raceId)
                    : nextRaces[0]
                  if (!nextRace || nextRace.id !== raceId) setRaceId(nextRace?.id ?? '')
                  const registered = next && nextRace && nextRace.signedDistances.length > 0
                    ? nextRace.signedDistances
                    : null
                  if (registered && !registered.includes(distance as MarathonDistanceFilter)) {
                    setDistance(registered[0])
                  }
                }}
                className="h-4 w-4 accent-primary"
              />
              내 신청만
            </label>
          </div>
          <select
            id="record-match-race"
            value={visibleRaces.some((race) => race.id === raceId) ? raceId : ''}
            onChange={(event) => {
              const nextId = event.target.value
              setRaceId(nextId)
              const nextRace = visibleRaces.find((race) => race.id === nextId)
              const registered =
                mineOnly && nextRace && nextRace.signedDistances.length > 0
                  ? nextRace.signedDistances
                  : null
              if (registered && !registered.includes(distance as MarathonDistanceFilter)) {
                setDistance(registered[0])
              }
            }}
            className="h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none focus-visible:border-primary/70"
            required
          >
            {visibleRaces.length === 0 ? (
              <option value="">{mineOnly ? '신청한 대회가 없습니다' : '불러올 대회가 없습니다'}</option>
            ) : null}
            {visibleRaces.map((race) => (
              <option key={race.id} value={race.id}>
                {formatRaceDate(race.eventDate)} {race.title}
              </option>
            ))}
          </select>
          <label className="block text-xs font-medium text-foreground" htmlFor="record-match-distance">
            종목
          </label>
          <select
            id="record-match-distance"
            value={distanceValue}
            onChange={(event) => setDistance(event.target.value)}
            className="h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none focus-visible:border-primary/70"
          >
            {registeredDistances ? null : <option value="">종목 전체</option>}
            {distanceOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">상품</p>
            <PrizeFields
              idPrefix="record-match-create"
              prizes={prizes}
              onChange={setPrizes}
              disabled={saving}
            />
          </div>
          <label className="block text-xs font-medium text-foreground" htmlFor="record-match-note">
            안내
          </label>
          <textarea
            id="record-match-note"
            value={note}
            maxLength={300}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            className="w-full resize-y rounded-lg border border-border/80 bg-black/40 px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
            placeholder="예상 기록 마감, 상품 받는 방법"
          />
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-lime-500/20 bg-lime-500/5 px-3 py-2.5">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="space-y-0.5">
              <span className="block text-xs font-semibold text-lime-100">외부 공개 (홍보용)</span>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">
                회원과 분리됩니다. 회원 앱·알림에 안 보이고, 공유 링크를 받은 외부인만 이름·비밀번호로 댓글합니다.
              </span>
            </span>
          </label>
          <button
            type="submit"
            disabled={saving || visibleRaces.length === 0}
            className="min-h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? '만드는 중…' : isPublic ? '외부 공개 이벤트 열기' : '회원 이벤트 열기'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">이벤트를 불러오는 중…</p>
      ) : error ? (
        <p className="text-sm leading-relaxed text-amber-200">{error}</p>
      ) : memberEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">열린 회원 기록 맞추기가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {memberEvents.map((item) => {
            const draft = drafts[item.id] ?? { predicted: '', actual: '' }
            const isFocused = focusEventId === item.id
            return (
              <li
                key={item.id}
                ref={isFocused ? focusedRef : undefined}
                className={
                  isFocused
                    ? 'rounded-xl border border-lime-400/50 bg-lime-500/10 px-3 py-3 ring-1 ring-lime-400/30'
                    : 'rounded-xl border border-primary/20 bg-black/30 px-3 py-3'
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span className="min-w-0 truncate">{item.raceTitle}</span>
                      {item.isPublic ? (
                        <span className="shrink-0 rounded border border-lime-400/40 bg-lime-500/10 px-1.5 py-0.5 text-[10px] font-bold text-lime-200">
                          공개
                        </span>
                      ) : null}
                      {freshMatchIds.includes(`match:${item.id}`) ? <EventNewMark /> : null}
                    </p>
                    <p className="mt-1 text-[11px] text-primary/80">
                      {formatRaceDate(item.raceDate)}
                      {item.distanceLabel ? ` · ${item.distanceLabel}` : ''}
                      {item.location ? ` · ${item.location}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyEventLink(item.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      링크
                    </button>
                    {item.canEdit ? (
                      <button
                        type="button"
                        onClick={() =>
                          editingEventId === item.id ? cancelEdit() : startEdit(item)
                        }
                        className="text-xs text-muted-foreground hover:text-foreground"
                        aria-expanded={editingEventId === item.id}
                      >
                        {editingEventId === item.id ? '닫기' : '수정'}
                      </button>
                    ) : null}
                    {item.canEdit ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
                </div>

                {editingEventId === item.id ? (
                  <form
                    className="mt-3 space-y-2 border-t border-primary/15 pt-3"
                    onSubmit={(event) => void handleUpdate(event, item.id)}
                  >
                    <label
                      className="block text-xs font-medium text-foreground"
                      htmlFor={`record-match-edit-distance-${item.id}`}
                    >
                      종목
                    </label>
                    <select
                      id={`record-match-edit-distance-${item.id}`}
                      value={editDistance}
                      onChange={(event) => setEditDistance(event.target.value)}
                      className="h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none focus-visible:border-primary/70"
                    >
                      <option value="">종목 전체</option>
                      {MARATHON_DISTANCE_FILTERS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-foreground">상품</p>
                      <PrizeFields
                        idPrefix={`record-match-edit-${item.id}`}
                        prizes={editPrizes}
                        onChange={setEditPrizes}
                        disabled={saving}
                      />
                    </div>
                    <label
                      className="block text-xs font-medium text-foreground"
                      htmlFor={`record-match-edit-note-${item.id}`}
                    >
                      안내
                    </label>
                    <textarea
                      id={`record-match-edit-note-${item.id}`}
                      value={editNote}
                      maxLength={300}
                      rows={2}
                      onChange={(event) => setEditNote(event.target.value)}
                      className="w-full resize-y rounded-lg border border-border/80 bg-black/40 px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
                      placeholder="예상 기록 마감, 상품 받는 방법"
                    />
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-lime-500/20 bg-lime-500/5 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={editIsPublic}
                        onChange={(event) => setEditIsPublic(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span className="space-y-0.5">
                        <span className="block text-xs font-semibold text-lime-100">
                          외부 공개로 전환
                        </span>
                        <span className="block text-[11px] leading-relaxed text-muted-foreground">
                          회원 목록에서 빠지고, 공유 링크 전용 홍보 이벤트가 됩니다.
                        </span>
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                        className="h-9 rounded-lg border border-border/80 px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {saving ? '저장 중…' : '저장'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="mt-2 space-y-1 text-sm text-foreground">
                      {(item.prizes.length > 0 ? item.prizes : [item.prize]).map((prize, index) => (
                        <p key={`${item.id}-prize-${index}`}>
                          {item.prizes.length > 1 ? (
                            <span className="text-muted-foreground">{index + 1}등 </span>
                          ) : (
                            <span className="text-muted-foreground">상품 </span>
                          )}
                          <span className="font-semibold text-primary">{prize}</span>
                        </p>
                      ))}
                      <p className="text-muted-foreground">참여자 {item.participantCount}명</p>
                    </div>
                    {item.note ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                        {item.note}
                      </p>
                    ) : null}
                  </>
                )}

                {canEnter ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="block text-xs text-muted-foreground">
                      예상 기록
                      <input
                        value={draft.predicted}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, predicted: event.target.value },
                          }))
                        }
                        inputMode="numeric"
                        placeholder="1:45:20"
                        className="mt-1 h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleEntry(item.id)}
                      className="min-h-11 self-end rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      저장
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">회원 계정이 연결되면 예상 기록을 낼 수 있습니다.</p>
                )}
                {item.mine?.actualLabel && !item.canWriteActual ? (
                  <p className="mt-2 text-xs text-muted-foreground">실제 기록 {item.mine.actualLabel}</p>
                ) : null}

                {item.mine?.gapSeconds != null ? (
                  <p className="mt-2 text-xs text-primary">내 차이 {formatTimeGap(item.mine.gapSeconds)}</p>
                ) : null}

                {item.winners.length > 0 ? (
                  <div className="mt-3 space-y-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                    <p className="text-[11px] font-semibold text-amber-200">당첨자</p>
                    {item.winners.map((winner) => (
                      <p key={`${item.id}-winner-${winner.prizeIndex}`} className="text-sm text-foreground">
                        <span className="text-muted-foreground">
                          {(item.prizes.length > 1 ? item.prizes : [item.prize]).length > 1
                            ? `${winner.prizeIndex + 1}등 `
                            : ''}
                        </span>
                        <span className="font-semibold text-amber-100">{winner.memberName}</span>
                        <span className="text-muted-foreground"> · {winner.prize}</span>
                      </p>
                    ))}
                  </div>
                ) : null}

                {item.ranking.length > 0 ? (
                  <ol className="mt-3 space-y-1">
                    {item.ranking.map((entry, index) => (
                      <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className={entry.isMine ? 'text-primary' : 'text-foreground'}>
                          {index + 1}. {entry.authorName}
                        </span>
                        <span className="text-muted-foreground">
                          {entry.gapSeconds == null ? '' : formatTimeGap(entry.gapSeconds)}
                          {entry.actualLabel ? ` · 실제 ${entry.actualLabel}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {item.guesses.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t border-primary/15 pt-2">
                    {item.guesses.map((guess) => {
                      const actualKey = `${item.id}:${guess.memberId}`
                      return (
                        <li key={actualKey} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {guess.name}
                            <span className="ml-2">예상 {guess.predictedLabel}</span>
                          </span>
                          {item.canWriteActual ? (
                            <span className="flex items-center gap-1.5">
                              <label className="sr-only" htmlFor={`actual-${actualKey}`}>
                                {guess.name} 실제 기록
                              </label>
                              <input
                                id={`actual-${actualKey}`}
                                value={actualDrafts[actualKey] ?? ''}
                                onChange={(event) =>
                                  setActualDrafts((current) => ({
                                    ...current,
                                    [actualKey]: event.target.value,
                                  }))
                                }
                                inputMode="numeric"
                                placeholder="실제 기록"
                                className="h-9 w-28 rounded-lg border border-border/80 bg-black/40 px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
                              />
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void handleActual(item.id, guess.memberId)}
                                className="h-9 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                              >
                                실제 기록
                              </button>
                            </span>
                          ) : guess.actualLabel ? (
                            <span>실제 {guess.actualLabel}</span>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}

                {item.canSelectWinners ? (
                  <div className="mt-3 space-y-2 border-t border-primary/15 pt-3">
                    <p className="text-xs font-semibold text-foreground">당첨자 선정</p>
                    {(item.prizes.length > 0 ? item.prizes : [item.prize]).map((prize, index) => {
                      const slots = winnerDrafts[item.id] ?? []
                      const candidates =
                        item.guesses.length > 0
                          ? item.guesses
                          : item.ranking.map((entry) => ({
                              memberId: entry.memberId,
                              name: entry.authorName,
                            }))
                      return (
                        <div key={`${item.id}-winner-slot-${index}`} className="space-y-1">
                          <label
                            className="block text-[11px] text-muted-foreground"
                            htmlFor={`winner-${item.id}-${index}`}
                          >
                            {(item.prizes.length > 1 ? item.prizes : [item.prize]).length > 1
                              ? `${index + 1}등 · ${prize}`
                              : `상품 · ${prize}`}
                          </label>
                          <select
                            id={`winner-${item.id}-${index}`}
                            value={slots[index] ?? ''}
                            disabled={saving || candidates.length === 0}
                            onChange={(event) =>
                              setWinnerDrafts((current) => {
                                const prizeCount = (
                                  item.prizes.length > 0 ? item.prizes : [item.prize]
                                ).length
                                const nextSlots = [...(current[item.id] ?? Array(prizeCount).fill(''))]
                                while (nextSlots.length < prizeCount) nextSlots.push('')
                                nextSlots[index] = event.target.value
                                return { ...current, [item.id]: nextSlots }
                              })
                            }
                            className="h-10 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-sm text-foreground outline-none focus-visible:border-primary/70 disabled:opacity-60"
                          >
                            <option value="">미선정</option>
                            {candidates.map((candidate) => (
                              <option key={candidate.memberId} value={candidate.memberId}>
                                {candidate.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                    <button
                      type="button"
                      disabled={saving || (item.guesses.length === 0 && item.ranking.length === 0)}
                      onClick={() => void handleSaveWinners(item.id)}
                      className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {saving ? '저장 중…' : '당첨자 저장'}
                    </button>
                    {item.guesses.length === 0 && item.ranking.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        참여자가 있어야 당첨자를 선정할 수 있습니다.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {canCreate ? (
        <div className="space-y-2 border-t border-lime-500/20 pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-lime-100">외부 공개 이벤트</p>
            <button
              type="button"
              onClick={() => {
                setIsPublic(true)
                setComposerOpen(true)
              }}
              className="min-h-9 rounded-lg border border-lime-500/35 bg-lime-500/10 px-3 text-xs font-semibold text-lime-100"
            >
              외부 이벤트 만들기
            </button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            외부 홍보용입니다. 회원 목록·알림과 분리되며, 링크를 받은 사람만 접속해 댓글할 수 있습니다.
          </p>
          {publicEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">열린 외부 공개 이벤트가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {publicEvents.map((item) => {
                const isFocused = focusEventId === item.id
                return (
                  <li
                    key={item.id}
                    ref={isFocused ? focusedRef : undefined}
                    className={
                      isFocused
                        ? 'rounded-xl border border-lime-400/50 bg-lime-500/10 px-3 py-3 ring-1 ring-lime-400/30'
                        : 'rounded-xl border border-lime-500/25 bg-lime-500/[0.06] px-3 py-3'
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                          <span className="min-w-0 truncate">{item.raceTitle}</span>
                          <span className="shrink-0 rounded border border-lime-400/40 bg-lime-500/10 px-1.5 py-0.5 text-[10px] font-bold text-lime-200">
                            외부
                          </span>
                        </p>
                        <p className="mt-1 text-[11px] text-primary/80">
                          {formatRaceDate(item.raceDate)}
                          {item.distanceLabel ? ` · ${item.distanceLabel}` : ''}
                          {item.location ? ` · ${item.location}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copyEventLink(item.id)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          링크
                        </button>
                        {item.canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              editingEventId === item.id ? cancelEdit() : startEdit(item)
                            }
                            className="text-xs text-muted-foreground hover:text-foreground"
                            aria-expanded={editingEventId === item.id}
                          >
                            {editingEventId === item.id ? '닫기' : '수정'}
                          </button>
                        ) : null}
                        {item.canEdit ? (
                          <button
                            type="button"
                            onClick={() => void handleDelete(item.id)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {editingEventId === item.id ? (
                      <form
                        className="mt-3 space-y-2 border-t border-primary/15 pt-3"
                        onSubmit={(event) => void handleUpdate(event, item.id)}
                      >
                        <label
                          className="block text-xs font-medium text-foreground"
                          htmlFor={`record-match-edit-distance-${item.id}`}
                        >
                          종목
                        </label>
                        <select
                          id={`record-match-edit-distance-${item.id}`}
                          value={editDistance}
                          onChange={(event) => setEditDistance(event.target.value)}
                          className="h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none focus-visible:border-primary/70"
                        >
                          <option value="">종목 전체</option>
                          {MARATHON_DISTANCE_FILTERS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-foreground">상품</p>
                          <PrizeFields
                            idPrefix={`record-match-edit-public-${item.id}`}
                            prizes={editPrizes}
                            onChange={setEditPrizes}
                            disabled={saving}
                          />
                        </div>
                        <label
                          className="block text-xs font-medium text-foreground"
                          htmlFor={`record-match-edit-note-public-${item.id}`}
                        >
                          안내
                        </label>
                        <textarea
                          id={`record-match-edit-note-public-${item.id}`}
                          value={editNote}
                          maxLength={300}
                          rows={2}
                          onChange={(event) => setEditNote(event.target.value)}
                          className="w-full resize-y rounded-lg border border-border/80 bg-black/40 px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
                          placeholder="외부 참가자 안내"
                        />
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-lime-500/20 bg-lime-500/5 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={editIsPublic}
                            onChange={(event) => setEditIsPublic(event.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-primary"
                          />
                          <span className="space-y-0.5">
                            <span className="block text-xs font-semibold text-lime-100">
                              외부 공개 유지
                            </span>
                            <span className="block text-[11px] leading-relaxed text-muted-foreground">
                              끄면 회원 이벤트로 바뀌고, 외부 링크 댓글 페이지는 닫힙니다.
                            </span>
                          </span>
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={saving}
                            className="h-9 rounded-lg border border-border/80 px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                          >
                            취소
                          </button>
                          <button
                            type="submit"
                            disabled={saving}
                            className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                          >
                            {saving ? '저장 중…' : '저장'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="mt-2 space-y-1 text-sm text-foreground">
                          {(item.prizes.length > 0 ? item.prizes : [item.prize]).map(
                            (prize, index) => (
                              <p key={`${item.id}-prize-${index}`}>
                                {item.prizes.length > 1 ? (
                                  <span className="text-muted-foreground">{index + 1}등 </span>
                                ) : (
                                  <span className="text-muted-foreground">상품 </span>
                                )}
                                <span className="font-semibold text-primary">{prize}</span>
                              </p>
                            ),
                          )}
                        </div>
                        {item.note ? (
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                            {item.note}
                          </p>
                        ) : null}
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          회원 예상 기록·랭킹과 무관합니다. 외부는 공유 링크에서만 댓글합니다.
                        </p>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
