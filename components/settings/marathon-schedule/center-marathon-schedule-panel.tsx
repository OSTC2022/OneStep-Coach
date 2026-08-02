'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteMarathonEvent,
  getCenterMarathonScheduleForAdmin,
  saveMarathonEvent,
  type CenterMarathonScheduleBundle,
} from '@/lib/actions/center-marathon-schedule'
import {
  createEmptyMarathonEventInput,
  formatMarathonMonthLabel,
  listNearbyMarathonMonthKeys,
  MARATHON_SCHEDULE_ALL_KEY,
  type MarathonEventInput,
} from '@/lib/running-league/marathon-schedule'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function eventToInput(event: CenterMarathonScheduleBundle['events'][number]): MarathonEventInput {
  return {
    id: event.id,
    title: event.title,
    event_date: event.event_date,
    location_label: event.location_label,
    registration_url: event.registration_url ?? '',
    notes: event.notes,
    is_hidden: event.is_hidden,
  }
}

export function CenterMarathonSchedulePanel() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [monthKey, setMonthKey] = useState(MARATHON_SCHEDULE_ALL_KEY)
  const [bundle, setBundle] = useState<CenterMarathonScheduleBundle | null>(null)
  const [draft, setDraft] = useState<MarathonEventInput>(() => createEmptyMarathonEventInput())
  const [loading, setLoading] = useState(true)

  const monthOptions = useMemo(
    () => [MARATHON_SCHEDULE_ALL_KEY, ...listNearbyMarathonMonthKeys()],
    [],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getCenterMarathonScheduleForAdmin(monthKey).then((result) => {
      if (cancelled) return
      setBundle(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [monthKey])

  function resetDraft(dateHint?: string) {
    const fallbackDate =
      monthKey !== MARATHON_SCHEDULE_ALL_KEY && /^\d{4}-\d{2}$/.test(monthKey)
        ? `${monthKey}-01`
        : undefined
    setDraft(createEmptyMarathonEventInput(dateHint ?? fallbackDate))
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveMarathonEvent(draft)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(draft.id ? '대회를 수정했습니다.' : '대회를 추가했습니다.')
      const refreshed = await getCenterMarathonScheduleForAdmin(monthKey)
      setBundle(refreshed)
      resetDraft()
      router.refresh()
    })
  }

  function handleDelete(eventId: string) {
    if (!window.confirm('이 대회 일정을 삭제할까요? 참가 명단도 함께 삭제됩니다.')) return
    startTransition(async () => {
      const result = await deleteMarathonEvent(eventId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('삭제했습니다.')
      if (draft.id === eventId) resetDraft()
      const refreshed = await getCenterMarathonScheduleForAdmin(monthKey)
      setBundle(refreshed)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>마라톤 일정</CardTitle>
              <CardDescription>
                대회명·날짜·참가신청 홈페이지를 등록하면 내 러닝 포털에 표시됩니다.
              </CardDescription>
            </div>
            <Select value={monthKey} onValueChange={setMonthKey} disabled={pending || loading}>
              <SelectTrigger className="w-[10rem]">
                <SelectValue placeholder="월 선택" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {formatMarathonMonthLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!bundle?.tableReady ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              DB 마이그레이션이 필요합니다. supabase/add-center-marathon-schedule.sql 을
              실행해주세요.
            </p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중…
            </div>
          ) : (bundle?.events.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {monthKey === MARATHON_SCHEDULE_ALL_KEY
                ? '등록된 대회가 없습니다.'
                : '이 달에 등록된 대회가 없습니다.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {bundle?.events.map((event) => (
                <li
                  key={event.id}
                  className={cn(
                    'flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-2.5',
                    event.is_hidden && 'opacity-60',
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      {event.title}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {event.weekday_label} {event.event_date_label} · {event.day_label}
                        {event.is_hidden ? ' · 숨김' : ''}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.location_label || '장소 미입력'}
                      {event.registration_url ? ` · ${event.registration_url}` : ''}
                      {` · ${event.signup_count}명 참여`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setDraft(eventToInput(event))}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => handleDelete(event.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{draft.id ? '대회 수정' : '대회 추가'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marathon-title">대회명</Label>
              <Input
                id="marathon-title"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="예: 서울국제마라톤"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>대회 날짜</Label>
              <KoreanDatePicker
                value={draft.event_date}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    event_date: value || current.event_date,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marathon-location">장소</Label>
              <Input
                id="marathon-location"
                value={draft.location_label}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, location_label: event.target.value }))
                }
                placeholder="예: 잠실종합운동장"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marathon-url">참가신청 홈페이지</Label>
              <Input
                id="marathon-url"
                value={draft.registration_url}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, registration_url: event.target.value }))
                }
                placeholder="https://..."
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marathon-notes">메모 (종목·비고)</Label>
              <Textarea
                id="marathon-notes"
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                rows={2}
                placeholder="예: 풀/하프/10km"
                disabled={pending}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                setDraft((current) => ({ ...current, is_hidden: !current.is_hidden }))
              }
            >
              {draft.is_hidden ? (
                <>
                  <EyeOff className="mr-1 h-3.5 w-3.5" />
                  숨김
                </>
              ) : (
                <>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  공개
                </>
              )}
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
              {pending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : draft.id ? (
                <Save className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              {draft.id ? '수정 저장' : '추가'}
            </Button>
            {draft.id ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => resetDraft()}
              >
                새 대회 작성
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
