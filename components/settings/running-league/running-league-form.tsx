'use client'

import type { RunningLeagueStatus, RunningLeagueTargetGroup } from '@/lib/types'
import {
  RUNNING_LEAGUE_DEFAULT_DESCRIPTION,
  RUNNING_LEAGUE_STATUS_LABELS,
  RUNNING_LEAGUE_TARGET_GROUPS,
} from '@/lib/running-league/constants'
import { Input } from '@/components/ui/input'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type RunningLeagueFormValues = {
  title: string
  description: string
  starts_at: string
  ends_at: string
  target_group: RunningLeagueTargetGroup
  status: RunningLeagueStatus
}

export const EMPTY_RUNNING_LEAGUE_FORM: RunningLeagueFormValues = {
  title: '',
  description: RUNNING_LEAGUE_DEFAULT_DESCRIPTION,
  starts_at: '',
  ends_at: '',
  target_group: 'all',
  status: 'draft',
}

interface RunningLeagueFormProps {
  value: RunningLeagueFormValues
  onChange: (value: RunningLeagueFormValues) => void
  idPrefix?: string
}

export function RunningLeagueForm({ value, onChange, idPrefix = 'league' }: RunningLeagueFormProps) {
  function patch<K extends keyof RunningLeagueFormValues>(key: K, next: RunningLeagueFormValues[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-title`}>챌린지 이름</Label>
        <Input
          id={`${idPrefix}-title`}
          value={value.title}
          onChange={(event) => patch('title', event.target.value)}
          placeholder="2026년 7월 ONE STEP RUNNING LEAGUE"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-starts`}>시작일</Label>
        <KoreanDatePicker
          id={`${idPrefix}-starts`}
          value={value.starts_at}
          onChange={(next) => patch('starts_at', next)}
          placeholder="시작일 선택"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-ends`}>종료일</Label>
        <KoreanDatePicker
          id={`${idPrefix}-ends`}
          value={value.ends_at}
          onChange={(next) => patch('ends_at', next)}
          placeholder="종료일 선택"
        />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-description`}>설명</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          onChange={(event) => patch('description', event.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>대상</Label>
        <Select
          value={value.target_group}
          onValueChange={(next) => patch('target_group', next as RunningLeagueTargetGroup)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RUNNING_LEAGUE_TARGET_GROUPS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>상태</Label>
        <Select
          value={value.status}
          onValueChange={(next) => patch('status', next as RunningLeagueStatus)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RUNNING_LEAGUE_STATUS_LABELS) as RunningLeagueStatus[]).map((status) => (
              <SelectItem key={status} value={status}>
                {RUNNING_LEAGUE_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function leagueToFormValues(league: {
  title: string
  description: string
  starts_at: string
  ends_at: string
  target_group: RunningLeagueTargetGroup
  status: RunningLeagueStatus
}): RunningLeagueFormValues {
  return {
    title: league.title,
    description: league.description,
    starts_at: league.starts_at,
    ends_at: league.ends_at,
    target_group: league.target_group,
    status: league.status,
  }
}
