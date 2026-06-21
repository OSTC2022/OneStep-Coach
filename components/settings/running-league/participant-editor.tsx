'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DailyRecoveryForm } from '@/components/running-league/daily-recovery-form'
import { ParticipantRecoveryAlertBadge } from '@/components/running-league/recovery-alerts-panel'
import { RecordMeasurementPanel } from '@/components/running-league/record-measurement-panel'
import {
  generateRunningLeagueReport,
  publishRunningLeagueReport,
  removeRunningLeagueParticipant,
  saveDailyRecovery,
  syncRunningLeagueAttendanceScore,
  updateRunningLeagueParticipant,
  upsertRunningLeagueRecord,
} from '@/lib/actions/running-league'
import { ParticipantGoalForm } from '@/components/settings/running-league/participant-goal-form'
import {
  RUNNING_LEAGUE_MEMBER_LEVELS,
  participantToGoalForm,
  type ParticipantGoalFormState,
} from '@/lib/running-league/goals'
import { computeTotalScore, formatScoreDisplay, mileageScoreFromKm } from '@/lib/running-league/scoring'
import { analyzeRecordChange, findRecordTime } from '@/lib/running-league/records'
import { dailyRecoveryToFormState } from '@/lib/running-league/recovery'
import type {
  RunningLeagueDailyRecovery,
  RunningLeagueDistanceEvent,
  RunningLeagueParticipant,
  RunningLeagueRecord,
  RunningLeagueReport,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface ParticipantEditorProps {
  participant: RunningLeagueParticipant
  records: RunningLeagueRecord[]
  dailyRecoveries: RunningLeagueDailyRecovery[]
  report: RunningLeagueReport | null
  onUpdated: () => void
  onRemoved: () => void
}

function inferDefaultDistance(participant: RunningLeagueParticipant): RunningLeagueDistanceEvent {
  const fromBaseline = participant.record_baseline?.match(/^(1km|3km|5km|10km)/i)?.[0]
  if (fromBaseline) return fromBaseline as RunningLeagueDistanceEvent
  return '5km'
}

function buildEditorFormState(
  participant: RunningLeagueParticipant,
  records: RunningLeagueRecord[],
) {
  const recordDistance = inferDefaultDistance(participant)
  const monthStart = findRecordTime(records, participant.id, recordDistance, 'month_start')
  const monthEnd = findRecordTime(records, participant.id, recordDistance, 'month_end')
  const recordScore =
    analyzeRecordChange(monthStart, monthEnd, recordDistance).score ?? participant.record_score

  return {
    attendance_score: participant.attendance_score,
    record_score: recordScore,
    mileage_score: participant.mileage_score,
    recovery_score: participant.recovery_score,
    mileage_km: participant.mileage_km,
    notes: participant.notes ?? '',
    coach_comment: participant.coach_comment ?? '',
    record_distance: recordDistance,
    month_start_record: monthStart,
    month_end_record: monthEnd,
  }
}

export function ParticipantEditor({
  participant,
  records,
  dailyRecoveries,
  report,
  onUpdated,
  onRemoved,
}: ParticipantEditorProps) {
  const today = new Date().toISOString().slice(0, 10)
  const participantRecoveries = useMemo(
    () => dailyRecoveries.filter((row) => row.participant_id === participant.id),
    [dailyRecoveries, participant.id],
  )
  const todayRecovery = useMemo(
    () => participantRecoveries.find((row) => row.logged_at === today) ?? null,
    [participantRecoveries, today],
  )
  const [pending, startTransition] = useTransition()
  const [goalForm, setGoalForm] = useState<ParticipantGoalFormState>(() =>
    participantToGoalForm(participant),
  )
  const [form, setForm] = useState(() => buildEditorFormState(participant, records))

  useEffect(() => {
    setGoalForm(participantToGoalForm(participant))
    setForm(buildEditorFormState(participant, records))
  }, [participant, records])

  function patchRecordFields(patch: {
    record_distance?: RunningLeagueDistanceEvent
    month_start_record?: string
    month_end_record?: string
  }) {
    setForm((prev) => {
      const next = { ...prev, ...patch }
      const analysis = analyzeRecordChange(
        next.month_start_record,
        next.month_end_record,
        next.record_distance,
      )
      return { ...next, record_score: analysis.score }
    })
  }

  function patchMileageKm(km: number) {
    const normalized = Math.max(0, Number(km) || 0)
    setForm((prev) => ({
      ...prev,
      mileage_km: normalized,
      mileage_score: mileageScoreFromKm(normalized),
    }))
  }

  const totalScore = computeTotalScore({
    attendance_score: form.attendance_score,
    goal_score: goalForm.goal_score,
    record_score: form.record_score,
    mileage_score: form.mileage_score,
    recovery_score: form.recovery_score,
  })

  function saveScores() {
    const levelLabel = goalForm.goal_level
      ? RUNNING_LEAGUE_MEMBER_LEVELS.find((item) => item.value === goalForm.goal_level)?.label ?? ''
      : ''

    startTransition(async () => {
      const result = await updateRunningLeagueParticipant(participant.id, {
        goal_level: levelLabel || null,
        goal_type: goalForm.goal_type || null,
        personal_goal: goalForm.personal_goal,
        goal_achievement_rate: goalForm.goal_achievement_rate,
        attendance_score: form.attendance_score,
        record_score: form.record_score,
        recovery_score: form.recovery_score,
        mileage_km: form.mileage_km,
        notes: form.notes,
        coach_comment: form.coach_comment,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`저장됨 · 총점 ${result.totalScore}점`)
      onUpdated()
    })
  }

  function syncAttendance() {
    startTransition(async () => {
      const result = await syncRunningLeagueAttendanceScore(participant.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setForm((prev) => ({ ...prev, attendance_score: result.score }))
      toast.success(`출석 점수 ${result.score}점 반영`)
      onUpdated()
    })
  }

  function saveRecords() {
    startTransition(async () => {
      const tasks: Promise<{ ok: boolean; error?: string }>[] = []

      if (form.month_start_record.trim()) {
        tasks.push(
          upsertRunningLeagueRecord({
            participant_id: participant.id,
            league_id: participant.league_id,
            member_id: participant.member_id,
            distance_event: form.record_distance,
            record_phase: 'month_start',
            time_text: form.month_start_record,
          }),
        )
      }
      if (form.month_end_record.trim()) {
        tasks.push(
          upsertRunningLeagueRecord({
            participant_id: participant.id,
            league_id: participant.league_id,
            member_id: participant.member_id,
            distance_event: form.record_distance,
            record_phase: 'month_end',
            time_text: form.month_end_record,
          }),
        )
      }

      if (tasks.length === 0) {
        toast.error('월초 또는 월말 기록을 입력해주세요.')
        return
      }

      const results = await Promise.all(tasks)
      const failed = results.find((row) => !row.ok)
      if (failed && 'error' in failed) {
        toast.error(failed.error)
        return
      }

      await updateRunningLeagueParticipant(participant.id, {
        coach_comment: form.coach_comment,
      })

      const refreshedScore = analyzeRecordChange(
        form.month_start_record,
        form.month_end_record,
        form.record_distance,
      ).score
      setForm((prev) => ({ ...prev, record_score: refreshedScore }))

      toast.success('기록을 저장했습니다.')
      onUpdated()
    })
  }

  function saveMileage() {
    const km = Math.max(0, Number(form.mileage_km) || 0)
    const score = mileageScoreFromKm(km)
    setForm((prev) => ({ ...prev, mileage_km: km, mileage_score: score }))
    startTransition(async () => {
      const result = await updateRunningLeagueParticipant(participant.id, {
        mileage_km: km,
        mileage_score: score,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`마일리지 ${km}km · ${score}점 반영 (80km 상한)`)
      onUpdated()
    })
  }

  function saveDailyRecoveryForParticipant(form: Parameters<typeof saveDailyRecovery>[0]['form']) {
    return saveDailyRecovery({
      participant_id: participant.id,
      league_id: participant.league_id,
      member_id: participant.member_id,
      form,
    }).then((result) => {
      if (result.ok) {
        setForm((prev) => ({ ...prev, recovery_score: result.recoveryScore }))
        onUpdated()
      }
      return result
    })
  }

  function createReport() {
    startTransition(async () => {
      const result = await generateRunningLeagueReport(participant.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('회원 리포트를 생성했습니다.')
      onUpdated()
    })
  }

  function publishReport() {
    if (!report) return
    startTransition(async () => {
      const result = await publishRunningLeagueReport(report.id, !report.is_published)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(report.is_published ? '리포트 공개를 취소했습니다.' : '리포트를 회원에게 공개했습니다.')
      onUpdated()
    })
  }

  function remove() {
    if (!window.confirm(`${participant.member?.name ?? '회원'} 참가를 취소할까요?`)) return
    startTransition(async () => {
      const result = await removeRunningLeagueParticipant(participant.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('참가자를 삭제했습니다.')
      onRemoved()
    })
  }

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="space-y-2 border-b border-border/60 bg-muted/10 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{participant.member?.name ?? '회원'}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              총점 <span className="font-semibold text-primary">{formatScoreDisplay(totalScore)}</span>점
            </p>
            <div className="mt-2">
              <ParticipantRecoveryAlertBadge
                participant={participant}
                dailyRecoveries={dailyRecoveries}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-destructive"
            onClick={remove}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          {[
            ['출석', form.attendance_score],
            ['목표', goalForm.goal_score],
            ['기록', form.record_score],
            ['마일리지', form.mileage_score],
            ['회복', form.recovery_score],
          ].map(([label, score]) => (
            <div key={String(label)} className="rounded-md border bg-background px-2 py-1.5">
              <p className="text-muted-foreground">{label}</p>
              <p className="font-semibold">{score}</p>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-4 sm:p-6">
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">개인 목표</h4>
          <ParticipantGoalForm
            value={goalForm}
            onChange={setGoalForm}
            idPrefix={`participant-${participant.id}`}
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">출석 점수</h4>
            <Button type="button" size="sm" variant="outline" onClick={syncAttendance} disabled={pending}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              lessons 자동 계산
            </Button>
          </div>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.attendance_score}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, attendance_score: Number(event.target.value) }))
            }
          />
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">기록 측정</h4>
          <RecordMeasurementPanel
            distance={form.record_distance}
            monthStart={form.month_start_record}
            monthEnd={form.month_end_record}
            coachMemo={form.coach_comment}
            recordScore={form.record_score}
            pending={pending}
            onDistanceChange={(value) =>
              patchRecordFields({
                record_distance: value,
                month_start_record: findRecordTime(records, participant.id, value, 'month_start'),
                month_end_record: findRecordTime(records, participant.id, value, 'month_end'),
              })
            }
            onMonthStartChange={(value) => patchRecordFields({ month_start_record: value })}
            onMonthEndChange={(value) => patchRecordFields({ month_end_record: value })}
            onCoachMemoChange={(value) => setForm((prev) => ({ ...prev, coach_comment: value }))}
            onRecordScoreChange={(value) => setForm((prev) => ({ ...prev, record_score: value }))}
            onSave={saveRecords}
          />
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">러닝 마일리지</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">누적 거리 (km)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                className="h-9"
                value={form.mileage_km}
                onChange={(event) => patchMileageKm(Number(event.target.value))}
              />
              <p className="text-[10px] text-muted-foreground">80km 이상 만점(100점)</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">마일리지 점수</Label>
              <Input
                type="number"
                min={0}
                max={100}
                className="h-9"
                value={form.mileage_score}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, mileage_score: Number(event.target.value) }))
                }
              />
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={saveMileage} disabled={pending}>
            마일리지 반영
          </Button>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">회복관리 체크</h4>
          <DailyRecoveryForm
            key={todayRecovery?.id ?? `recovery-${today}`}
            initialForm={dailyRecoveryToFormState(todayRecovery)}
            history={participantRecoveries}
            recoveryScore={form.recovery_score}
            onSave={saveDailyRecoveryForParticipant}
            showOvertrainingGuide={false}
          />
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">코치 코멘트 · 리포트</h4>
          <div className="space-y-1">
            <Label className="text-xs">회원 노출 코멘트</Label>
            <Textarea
              value={form.coach_comment}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, coach_comment: event.target.value }))
              }
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">관리자 메모</Label>
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={2}
            />
          </div>
          {report ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="font-medium">생성된 리포트</p>
              <p className="mt-1 text-muted-foreground">{report.summary}</p>
              <p className="mt-2 text-xs">
                상태: {report.is_published ? '회원 공개' : '비공개'}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={saveScores} disabled={pending}>
              {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              전체 저장
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={createReport} disabled={pending}>
              리포트 생성
            </Button>
            {report ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={publishReport}
                disabled={pending}
              >
                {report.is_published ? '공개 취소' : '회원에게 공개'}
              </Button>
            ) : null}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
