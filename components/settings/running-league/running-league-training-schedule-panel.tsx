'use client'

import { useEffect, useState, useTransition } from 'react'
import { Eye, EyeOff, Loader2, MapPin, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  getRunningLeagueTrainingScheduleForAdmin,
  saveRunningLeagueTrainingSchedule,
} from '@/lib/actions/running-league-training-schedule'
import {
  TRAINING_WEEKDAY_LABELS,
  createEmptyTrainingScheduleDays,
  type RunningLeagueTrainingScheduleDayInput,
} from '@/lib/running-league/training-schedule'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export function RunningLeagueTrainingSchedulePanel({ leagueId }: { leagueId: string }) {
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [tableReady, setTableReady] = useState(true)
  const [days, setDays] = useState<RunningLeagueTrainingScheduleDayInput[]>(
    createEmptyTrainingScheduleDays(),
  )

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      const result = await getRunningLeagueTrainingScheduleForAdmin(leagueId)
      if (cancelled) return
      setTableReady(result.tableReady)
      setDays(result.days)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [leagueId])

  function updateDay(
    weekday: number,
    patch: Partial<RunningLeagueTrainingScheduleDayInput>,
  ) {
    setDays((current) =>
      current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)),
    )
  }

  function save() {
    startTransition(async () => {
      const result = await saveRunningLeagueTrainingSchedule(leagueId, days)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('주간 훈련 스케줄을 저장했습니다.')
    })
  }

  if (loading) {
    return (
      <Card id="training-schedule" className="scroll-mt-20">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          스케줄 불러오는 중…
        </CardContent>
      </Card>
    )
  }

  if (!tableReady) {
    return (
      <Card id="training-schedule" className="scroll-mt-20 border-dashed">
        <CardContent className="py-6 text-sm text-muted-foreground">
          훈련 스케줄 테이블이 없습니다.{' '}
          <code className="text-xs">add-running-league-training-schedule.sql</code>을 실행해주세요.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card id="training-schedule" className="scroll-mt-20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">주간 훈련 스케줄</CardTitle>
        <p className="text-sm text-muted-foreground">
          회원 포털 상단에 요일별 훈련 내용이 표시됩니다. 눈 아이콘으로 휴강·미운영 요일을 숨길 수
          있습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {days.map((day) => (
          <div
            key={day.weekday}
            className={cn(
              'rounded-xl border p-3 transition-opacity',
              day.is_hidden && 'border-dashed opacity-60',
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{TRAINING_WEEKDAY_LABELS[day.weekday]}요일</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => updateDay(day.weekday, { is_hidden: !day.is_hidden })}
                aria-label={day.is_hidden ? '요일 표시' : '요일 숨김'}
                title={day.is_hidden ? '회원에게 표시' : '회원에게 숨김'}
              >
                {day.is_hidden ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <Textarea
                value={day.training_summary}
                onChange={(event) =>
                  updateDay(day.weekday, { training_summary: event.target.value })
                }
                placeholder="간략한 훈련 내용 (예: 5km 인터벌 + 스트레칭)"
                rows={2}
                className="min-h-[60px] resize-y text-sm"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={day.location_label}
                    onChange={(event) =>
                      updateDay(day.weekday, { location_label: event.target.value })
                    }
                    placeholder="장소 (예: 한강 잠실)"
                    className="pl-9 text-sm"
                  />
                </div>
                <Input
                  value={day.naver_map_url}
                  onChange={(event) =>
                    updateDay(day.weekday, { naver_map_url: event.target.value })
                  }
                  placeholder="네이버 지도 URL (선택)"
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        ))}

        <Button type="button" onClick={save} disabled={pending} className="min-h-10">
          {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          스케줄 저장
        </Button>
      </CardContent>
    </Card>
  )
}
