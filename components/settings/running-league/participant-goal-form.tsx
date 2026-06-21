'use client'

import {
  RUNNING_LEAGUE_GOAL_TYPES,
  RUNNING_LEAGUE_MEMBER_LEVELS,
  applyAchievementRate,
  defaultGoalForType,
  goalScorePreview,
  memberLevelLabel,
  suggestionsForLevel,
  type ParticipantGoalFormState,
} from '@/lib/running-league/goals'
import type { RunningLeagueGoalType, RunningLeagueMemberLevel } from '@/lib/types'
import { GOAL_ACHIEVEMENT_SCORES } from '@/lib/running-league-content'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface ParticipantGoalFormProps {
  value: ParticipantGoalFormState
  onChange: (value: ParticipantGoalFormState) => void
  idPrefix?: string
  compact?: boolean
}

export function ParticipantGoalForm({
  value,
  onChange,
  idPrefix = 'goal',
  compact = false,
}: ParticipantGoalFormProps) {
  const suggestions = suggestionsForLevel(value.goal_level)

  function patch(partial: Partial<ParticipantGoalFormState>) {
    onChange({ ...value, ...partial })
  }

  function selectLevel(level: RunningLeagueMemberLevel | '') {
    const nextSuggestions = suggestionsForLevel(level)
    onChange({
      ...value,
      goal_level: level,
      personal_goal: nextSuggestions[0] ?? value.personal_goal,
    })
  }

  function selectType(type: RunningLeagueGoalType | '') {
    onChange({
      ...value,
      goal_type: type,
      personal_goal: type ? defaultGoalForType(type) : value.personal_goal,
    })
  }

  function selectAchievementRate(rate: number) {
    onChange(applyAchievementRate(value, rate))
  }

  return (
    <div className={cn('space-y-3', compact ? '' : 'rounded-lg border bg-muted/10 p-3')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">회원 레벨</Label>
          <Select
            value={value.goal_level || 'none'}
            onValueChange={(next) => selectLevel(next === 'none' ? '' : (next as RunningLeagueMemberLevel))}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="레벨 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선택 안 함</SelectItem>
              {RUNNING_LEAGUE_MEMBER_LEVELS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">목표 유형</Label>
          <Select
            value={value.goal_type || 'none'}
            onValueChange={(next) => selectType(next === 'none' ? '' : (next as RunningLeagueGoalType))}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="유형 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선택 안 함</SelectItem>
              {RUNNING_LEAGUE_GOAL_TYPES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {value.goal_level ? (
        <div className="space-y-1">
          <Label className="text-xs">{memberLevelLabel(value.goal_level)} 추천 목표</Label>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => patch({ personal_goal: suggestion })}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  value.personal_goal === suggestion
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-personal-goal`} className="text-xs">
          개인 목표 (회원별 맞춤)
        </Label>
        <Input
          id={`${idPrefix}-personal-goal`}
          className="h-9"
          value={value.personal_goal}
          onChange={(event) => patch({ personal_goal: event.target.value })}
          placeholder="예: 5km 30분 완주, 월 40km 달성"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-achievement`} className="text-xs">
            목표 달성률 (%)
          </Label>
          <Input
            id={`${idPrefix}-achievement`}
            type="number"
            min={0}
            max={100}
            className="h-9"
            value={value.goal_achievement_rate}
            onChange={(event) => selectAchievementRate(Number(event.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">목표 달성 점수 (자동)</Label>
          <Input className="h-9" value={goalScorePreview(value.goal_achievement_rate)} readOnly />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
        {GOAL_ACHIEVEMENT_SCORES.map((item) => (
          <span key={item.rate} className="rounded bg-muted px-2 py-0.5">
            {item.rate} → {item.points}
          </span>
        ))}
        <span className="rounded bg-muted px-2 py-0.5">40% 미만 → 20점 또는 0점</span>
      </div>
    </div>
  )
}
