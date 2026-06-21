'use client'

import { useState } from 'react'
import type { MemberPickerOption } from '@/lib/actions/members'
import { MemberSearchSelect } from '@/components/members/member-search-select'
import { ParticipantGoalForm } from '@/components/settings/running-league/participant-goal-form'
import {
  EMPTY_GOAL_FORM,
  RUNNING_LEAGUE_MEMBER_LEVELS,
  type ParticipantGoalFormState,
} from '@/lib/running-league/goals'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface AddParticipantCardProps {
  members: MemberPickerOption[]
  disabledMemberIds: string[]
  pending: boolean
  onAdd: (input: {
    member_id: string
    goal_level: string
    goal_type: ParticipantGoalFormState['goal_type']
    personal_goal: string
    goal_achievement_rate: number
  }) => void
}

export function AddParticipantCard({
  members,
  disabledMemberIds,
  pending,
  onAdd,
}: AddParticipantCardProps) {
  const [memberId, setMemberId] = useState('')
  const [goalForm, setGoalForm] = useState<ParticipantGoalFormState>(EMPTY_GOAL_FORM)

  const memberOptions = members.map((member) => ({
    id: member.id,
    name: member.name,
    sport: member.sport,
    age: member.age,
    birth_date: member.birth_date,
  }))

  function submit() {
    const levelLabel = goalForm.goal_level
      ? RUNNING_LEAGUE_MEMBER_LEVELS.find((item) => item.value === goalForm.goal_level)?.label ?? ''
      : ''

    onAdd({
      member_id: memberId,
      goal_level: levelLabel,
      goal_type: goalForm.goal_type,
      personal_goal: goalForm.personal_goal,
      goal_achievement_rate: goalForm.goal_achievement_rate,
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs">성인 러닝 회원</Label>
        <MemberSearchSelect
          value={memberId}
          onValueChange={(value) => setMemberId(value)}
          members={memberOptions}
          disabledIds={disabledMemberIds}
          placeholder="이름으로 회원 검색 (members)"
        />
        <p className="text-[10px] text-muted-foreground">
          sport에 러닝·성인이 포함된 회원을 우선 표시합니다.
        </p>
      </div>

      <ParticipantGoalForm value={goalForm} onChange={setGoalForm} idPrefix="add-participant" />

      <Button type="button" size="sm" disabled={pending} onClick={submit}>
        참가 등록
      </Button>
    </div>
  )
}
