'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  createRecordMatchEvent,
  deleteRecordMatchEvent,
  getRecordMatchBoard,
  saveRecordMatchActual,
  submitRecordMatchEntry,
  type RecordMatchEvent,
} from '@/lib/actions/member-record-match'
import { EventNewMark } from '@/components/dashboard/event-new-mark'
import { useMarkPortalItemsRead } from '@/components/dashboard/portal-seen'
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

export function MemberRecordMatchPanel() {
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
  const [prize, setPrize] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { predicted: string; actual: string }>>({})
  const [actualDrafts, setActualDrafts] = useState<Record<string, string>>({})

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
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await createRecordMatchEvent({
      marathonEventId: raceId,
      distance: distanceValue || null,
      prize,
      note,
    })
    setSaving(false)
    if (result.error) {
      toast.error('이벤트를 만들지 못했습니다', { description: result.error })
      return
    }
    setPrize('')
    setNote('')
    setDistance('')
    setComposerOpen(false)
    toast.success('기록 맞추기 이벤트를 열었습니다.')
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
    toast.success('이벤트를 삭제했습니다.')
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

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">내 기록 맞추기</p>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setComposerOpen((open) => !open)}
            className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
            aria-expanded={composerOpen}
          >
            {composerOpen ? '닫기' : '대회 불러오기'}
          </button>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        대회 일정의 대회를 고르고 상품을 건 뒤, 회원은 예상 기록을 내고 실제 기록과 가장 가까운 사람이 상품을 받습니다.
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
          <label className="block text-xs font-medium text-foreground" htmlFor="record-match-prize">
            상품
          </label>
          <input
            id="record-match-prize"
            value={prize}
            maxLength={80}
            onChange={(event) => setPrize(event.target.value)}
            className="h-11 w-full rounded-lg border border-border/80 bg-black/40 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/70"
            placeholder="예: 프로틴 1통"
            required
          />
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
          <button
            type="submit"
            disabled={saving || visibleRaces.length === 0}
            className="min-h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? '만드는 중…' : '이벤트 열기'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">이벤트를 불러오는 중…</p>
      ) : error ? (
        <p className="text-sm leading-relaxed text-amber-200">{error}</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">열린 기록 맞추기가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((item) => {
            const draft = drafts[item.id] ?? { predicted: '', actual: '' }
            return (
              <li key={item.id} className="rounded-xl border border-primary/20 bg-black/30 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span className="min-w-0 truncate">{item.raceTitle}</span>
                      {freshMatchIds.includes(`match:${item.id}`) ? <EventNewMark /> : null}
                    </p>
                    <p className="mt-1 text-[11px] text-primary/80">
                      {formatRaceDate(item.raceDate)}
                      {item.distanceLabel ? ` · ${item.distanceLabel}` : ''}
                      {item.location ? ` · ${item.location}` : ''}
                    </p>
                  </div>
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-foreground">
                  상품 <span className="font-semibold text-primary">{item.prize}</span>
                  <span className="mx-1 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">참여자 {item.participantCount}명</span>
                </p>
                {item.note ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                    {item.note}
                  </p>
                ) : null}

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
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
