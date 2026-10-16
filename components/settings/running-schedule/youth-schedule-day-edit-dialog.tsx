'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { ChevronDown, FolderOpen, Loader2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  listMembersForTrainingScheduleStaffSignup,
  staffAddCenterRunningTrainingScheduleSignup,
  staffRemoveCenterRunningTrainingScheduleSignup,
  updateSelectedTrainingScheduleDays,
  type TrainingScheduleDayContentUpdate,
} from '@/lib/actions/center-running-training-schedule'
import {
  listCenterTrainingScheduleLocationPresets,
  type CenterTrainingScheduleLocationPreset,
} from '@/lib/actions/center-running-training-schedule-library'
import type { MemberPickerOption } from '@/lib/actions/members'
import type {
  RunningLeagueTrainingScheduleDayView,
  RunningLeagueTrainingScheduleSignup,
} from '@/lib/running-league/training-schedule'
import { TRAINING_WEEKDAY_LABELS } from '@/lib/running-league/training-schedule'
import { trainingScheduleDayId } from '@/lib/training-schedule-audience'
import { parseSingleTimeToken } from '@/lib/time-input-parse'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type DayDraft = {
  training_summary: string
  location_label: string
  naver_map_url: string
  training_time: string
  is_hidden: boolean
}

type WeekGroup = {
  key: string
  label: string
  days: RunningLeagueTrainingScheduleDayView[]
}

function daySelectionKey(day: RunningLeagueTrainingScheduleDayView): string | null {
  const date = day.schedule_date?.slice(0, 10)
  if (!date) return null
  return `${date}:${day.weekday}`
}

function isCompleteClockDraft(raw: string): boolean {
  const trimmed = raw.trim()
  return /^\d{1,2}:\d{2}$/.test(trimmed) || /^\d{4}$/.test(trimmed)
}

function normalizeScheduleClock(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return parseSingleTimeToken(trimmed)
}

function draftFromDay(day: RunningLeagueTrainingScheduleDayView): DayDraft {
  const stored = (day.training_time ?? '').slice(0, 5)
  return {
    training_summary: day.training_summary ?? '',
    location_label: day.location_label ?? '',
    naver_map_url: day.naver_map_url ?? '',
    training_time: normalizeScheduleClock(stored) || stored,
    is_hidden: day.is_hidden,
  }
}

function signupDayId(day: RunningLeagueTrainingScheduleDayView): string {
  if (day.schedule_date) {
    return trainingScheduleDayId('youth_athletics', day.weekday, day.schedule_date)
  }
  return day.id
}

export function YouthScheduleDayEditDialog({
  open,
  onOpenChange,
  pastDays,
  currentDays,
  nextDays,
  onApplied,
  onSignupsChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pastDays: RunningLeagueTrainingScheduleDayView[]
  currentDays: RunningLeagueTrainingScheduleDayView[]
  nextDays: RunningLeagueTrainingScheduleDayView[]
  onApplied: (updates: TrainingScheduleDayContentUpdate[]) => void
  onSignupsChanged: (
    day: RunningLeagueTrainingScheduleDayView,
    signups: RunningLeagueTrainingScheduleSignup[],
  ) => void
}) {
  const [pending, startTransition] = useTransition()
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({})
  const [signupOverride, setSignupOverride] = useState<
    Record<string, RunningLeagueTrainingScheduleSignup[]>
  >({})
  const [locationPresets, setLocationPresets] = useState<CenterTrainingScheduleLocationPreset[]>(
    [],
  )

  useEffect(() => {
    if (!open) return
    setSelectedKeys([])
    setDrafts({})
    setSignupOverride({})
    let cancelled = false
    void listCenterTrainingScheduleLocationPresets('youth_athletics')
      .then((rows) => {
        if (!cancelled) setLocationPresets(rows)
      })
      .catch(() => {
        if (!cancelled) setLocationPresets([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const weeks = useMemo<WeekGroup[]>(() => {
    const groups: WeekGroup[] = [
      { key: 'past', label: '지난 주', days: pastDays },
      { key: 'current', label: '이번 주', days: currentDays },
      { key: 'next', label: '다음 주', days: nextDays },
    ]
    return groups
      .map((group) => ({
        ...group,
        days: group.days.filter((day) => daySelectionKey(day)),
      }))
      .filter((group) => group.days.length > 0)
  }, [pastDays, currentDays, nextDays])

  const dayByKey = useMemo(() => {
    const map = new Map<string, RunningLeagueTrainingScheduleDayView>()
    for (const week of weeks) {
      for (const day of week.days) {
        const key = daySelectionKey(day)
        if (key) map.set(key, day)
      }
    }
    return map
  }, [weeks])

  function toggleDay(day: RunningLeagueTrainingScheduleDayView) {
    const key = daySelectionKey(day)
    if (!key) return
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )
    setDrafts((current) => (current[key] ? current : { ...current, [key]: draftFromDay(day) }))
  }

  function updateDraft(key: string, patch: Partial<DayDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? draftFromDay(dayByKey.get(key)!)), ...patch },
    }))
  }

  function signupsFor(day: RunningLeagueTrainingScheduleDayView) {
    const key = daySelectionKey(day)
    if (key && signupOverride[key]) return signupOverride[key]
    return day.signups
  }

  function setSignups(
    day: RunningLeagueTrainingScheduleDayView,
    signups: RunningLeagueTrainingScheduleSignup[],
  ) {
    const key = daySelectionKey(day)
    if (!key) return
    setSignupOverride((current) => ({ ...current, [key]: signups }))
    onSignupsChanged(day, signups)
  }

  function save() {
    const updates: TrainingScheduleDayContentUpdate[] = []
    for (const key of selectedKeys) {
      const day = dayByKey.get(key)
      const draft = drafts[key]
      if (!day?.schedule_date || !draft) continue
      const trainingTime = normalizeScheduleClock(draft.training_time)
      if (trainingTime == null) {
        toast.error('시간은 20:00처럼 입력해주세요.')
        return
      }
      updates.push({
        schedule_date: day.schedule_date,
        weekday: day.weekday,
        training_summary: draft.training_summary,
        location_label: draft.location_label,
        naver_map_url: draft.naver_map_url,
        training_time: trainingTime || null,
        is_hidden: draft.is_hidden,
      })
    }
    if (updates.length === 0) {
      toast.error('수정할 날짜를 선택해주세요.')
      return
    }

    startTransition(async () => {
      const result = await updateSelectedTrainingScheduleDays(updates, 'youth_athletics')
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onApplied(updates)
      toast.success('선택한 날짜를 수정했습니다. 육상 포털에 반영됩니다.')
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-4 py-3 text-left">
          <DialogTitle>날짜별 스케줄 수정</DialogTitle>
          <DialogDescription>
            고른 날짜만 바꿉니다. 저장하면 육상 포털에 바로 반영되고, 참여자는 관리자·강사가
            넣거나 뺄 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {weeks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              수정할 날짜가 없습니다. 먼저 주간 스케줄에 월요일 날짜를 저장해주세요.
            </p>
          ) : (
            weeks.map((week) => (
              <div key={week.key} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{week.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {week.days.map((day) => {
                    const key = daySelectionKey(day)
                    if (!key) return null
                    const selected = selectedKeys.includes(key)
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs font-medium tabular-nums transition-colors',
                          selected
                            ? 'border-primary bg-primary/15 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {TRAINING_WEEKDAY_LABELS[day.weekday]}{' '}
                        {day.schedule_date_label ?? day.schedule_date}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {selectedKeys.map((key) => {
            const day = dayByKey.get(key)
            const draft = drafts[key]
            if (!day || !draft) return null
            return (
              <DayEditor
                key={key}
                day={day}
                draft={draft}
                signups={signupsFor(day)}
                pending={pending}
                locationPresets={locationPresets}
                onChange={(patch) => updateDraft(key, patch)}
                onSignupsChange={(signups) => setSignups(day, signups)}
              />
            )
          })}
        </div>

        <div className="shrink-0 border-t px-4 py-3">
          <Button type="button" className="w-full" disabled={pending} onClick={save}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            선택 날짜 저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DayEditor({
  day,
  draft,
  signups,
  pending,
  locationPresets,
  onChange,
  onSignupsChange,
}: {
  day: RunningLeagueTrainingScheduleDayView
  draft: DayDraft
  signups: RunningLeagueTrainingScheduleSignup[]
  pending: boolean
  locationPresets: CenterTrainingScheduleLocationPreset[]
  onChange: (patch: Partial<DayDraft>) => void
  onSignupsChange: (signups: RunningLeagueTrainingScheduleSignup[]) => void
}) {
  const [memberQuery, setMemberQuery] = useState('')
  const [members, setMembers] = useState<MemberPickerOption[] | null>(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const [memberPending, setMemberPending] = useState(false)
  const [placesOpen, setPlacesOpen] = useState(false)

  useEffect(() => {
    if (!membersOpen || members) return
    let cancelled = false
    void listMembersForTrainingScheduleStaffSignup('youth_athletics')
      .then((rows) => {
        if (!cancelled) setMembers(rows)
      })
      .catch(() => {
        if (!cancelled) toast.error('회원 목록을 불러오지 못했습니다.')
      })
    return () => {
      cancelled = true
    }
  }, [membersOpen, members])

  const savedVotable = !day.is_hidden && day.training_summary.trim().length > 0

  const filteredMembers = useMemo(() => {
    const rows = members ?? []
    const query = memberQuery.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((member) => member.name.toLowerCase().includes(query))
  }, [members, memberQuery])

  function addMember(member: MemberPickerOption) {
    if (memberPending) return
    setMemberPending(true)
    void staffAddCenterRunningTrainingScheduleSignup(signupDayId(day), member.id)
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        const already = signups.some((signup) => signup.member_id === member.id)
        const next = already ? signups : [...signups, result.signup]
        onSignupsChange(next)
        toast.success(
          result.alreadySignedUp
            ? `${member.name} 님은 이미 참여 중입니다.`
            : `${member.name} 님을 참여에 넣었습니다.`,
        )
      })
      .finally(() => setMemberPending(false))
  }

  function removeMember(signup: RunningLeagueTrainingScheduleSignup) {
    if (memberPending) return
    setMemberPending(true)
    void staffRemoveCenterRunningTrainingScheduleSignup(signupDayId(day), signup.member_id)
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        onSignupsChange(signups.filter((item) => item.member_id !== signup.member_id))
        toast.success(`${signup.member_name} 님을 참여에서 뺐습니다.`)
      })
      .finally(() => setMemberPending(false))
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">
        {TRAINING_WEEKDAY_LABELS[day.weekday]}요일{' '}
        <span className="font-normal text-muted-foreground">
          {day.schedule_date_label ?? day.schedule_date}
        </span>
      </p>
      <Textarea
        value={draft.training_summary}
        onChange={(event) => onChange({ training_summary: event.target.value })}
        placeholder="훈련 내용"
        rows={2}
        className="min-h-[60px] text-sm"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">시간</Label>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="20:00"
            value={draft.training_time}
            onChange={(event) => {
              const next = event.target.value
              if (!isCompleteClockDraft(next)) {
                onChange({ training_time: next })
                return
              }
              onChange({ training_time: normalizeScheduleClock(next) ?? next })
            }}
            onBlur={() => {
              const normalized = normalizeScheduleClock(draft.training_time)
              if (normalized != null) onChange({ training_time: normalized })
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">장소</Label>
          <Input
            value={draft.location_label}
            onChange={(event) => onChange({ location_label: event.target.value })}
            placeholder="장소"
          />
        </div>
      </div>
      <Input
        value={draft.naver_map_url}
        onChange={(event) => onChange({ naver_map_url: event.target.value })}
        placeholder="네이버 지도 URL (선택)"
      />
      <div className="space-y-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={pending || locationPresets.length === 0}
          onClick={() => setPlacesOpen((value) => !value)}
        >
          <FolderOpen className="mr-1 h-3.5 w-3.5" />
          {locationPresets.length === 0 ? '저장된 장소 없음' : '장소 불러오기'}
          {locationPresets.length > 0 ? (
            <ChevronDown className={cn('ml-1 h-3.5 w-3.5', placesOpen && 'rotate-180')} />
          ) : null}
        </Button>
        {placesOpen && locationPresets.length > 0 ? (
          <ul className="max-h-40 overflow-y-auto rounded-md border">
            {locationPresets.map((preset) => (
              <li key={preset.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-2.5 py-2 text-left hover:bg-muted"
                  onClick={() => {
                    onChange({
                      location_label: preset.location_label,
                      naver_map_url: preset.naver_map_url,
                    })
                    setPlacesOpen(false)
                    toast.success(`${preset.location_label} 장소를 불러왔습니다.`)
                  }}
                >
                  <span className="text-sm font-medium">{preset.location_label}</span>
                  {preset.naver_map_url ? (
                    <span className="max-w-full truncate text-[11px] text-muted-foreground">
                      {preset.naver_map_url}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.is_hidden}
          onChange={(event) => onChange({ is_hidden: event.target.checked })}
        />
        이 날짜 휴강
      </label>

      <div className="space-y-1.5 border-t pt-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">참여자 {signups.length}명</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={pending || memberPending || !savedVotable}
            onClick={() => setMembersOpen((value) => !value)}
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" />
            넣기
          </Button>
        </div>
        {!savedVotable ? (
          <p className="text-xs text-muted-foreground">
            훈련 내용을 저장한 뒤에 참여자를 넣을 수 있습니다. 빼기는 바로 됩니다.
          </p>
        ) : null}
        {signups.length === 0 ? (
          <p className="text-xs text-muted-foreground">참여 인원이 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {signups.map((signup) => (
              <li
                key={signup.member_id}
                className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{signup.member_name}</span>
                <button
                  type="button"
                  aria-label={`${signup.member_name} 빼기`}
                  disabled={memberPending}
                  onClick={() => removeMember(signup)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {membersOpen ? (
          <div className="space-y-1.5">
            <Input
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              placeholder="이름 검색"
            />
            <div className="max-h-36 overflow-y-auto rounded-md border">
              {members == null ? (
                <p className="py-4 text-center text-xs text-muted-foreground">불러오는 중…</p>
              ) : filteredMembers.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">회원이 없습니다.</p>
              ) : (
                <ul>
                  {filteredMembers.map((member) => {
                    const already = signups.some((signup) => signup.member_id === member.id)
                    return (
                      <li key={member.id}>
                        <button
                          type="button"
                          disabled={memberPending || already}
                          onClick={() => addMember(member)}
                          className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
                        >
                          <span className="truncate">{member.name}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {already ? '참여중' : '추가'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
