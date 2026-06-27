'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type MemberInitialSessionPackageDraft = {
  total_sessions: number | ''
  remaining_sessions: number | ''
  note: string
}

export const EMPTY_MEMBER_INITIAL_SESSION_PACKAGE: MemberInitialSessionPackageDraft =
  {
    total_sessions: '',
    remaining_sessions: '',
    note: '',
  }

export function hasMemberInitialSessionPackageDraft(
  draft: MemberInitialSessionPackageDraft,
): boolean {
  return typeof draft.total_sessions === 'number' && draft.total_sessions > 0
}

export function parseMemberInitialSessionPackageDraft(
  draft: MemberInitialSessionPackageDraft,
): { total_sessions: number; remaining_sessions: number; note?: string } | { error: string } {
  if (!hasMemberInitialSessionPackageDraft(draft)) {
    return { error: '총 회차를 입력해주세요.' }
  }

  const total_sessions = draft.total_sessions
  const remaining_sessions =
    typeof draft.remaining_sessions === 'number' && draft.remaining_sessions >= 0
      ? draft.remaining_sessions
      : total_sessions

  if (remaining_sessions > total_sessions) {
    return { error: '잔여 회차는 총 회차 이하여야 합니다.' }
  }

  return {
    total_sessions,
    remaining_sessions,
    note: draft.note.trim() || undefined,
  }
}

interface MemberInitialSessionPackageSectionProps {
  value: MemberInitialSessionPackageDraft
  onChange: (value: MemberInitialSessionPackageDraft) => void
  idPrefix?: string
}

export function MemberInitialSessionPackageSection({
  value,
  onChange,
  idPrefix = 'member-package',
}: MemberInitialSessionPackageSectionProps) {
  const [open, setOpen] = useState(false)

  function updateTotalSessions(nextTotal: number | '') {
    onChange({
      ...value,
      total_sessions: nextTotal,
      remaining_sessions:
        typeof nextTotal === 'number' &&
        (value.remaining_sessions === '' ||
          (typeof value.remaining_sessions === 'number' &&
            value.remaining_sessions > nextTotal))
          ? nextTotal
          : value.remaining_sessions,
    })
  }

  return (
    <Card className="border-border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div>
                <CardTitle className="text-lg">수업권 추가</CardTitle>
                <p className="mt-1 text-sm font-normal text-muted-foreground">
                  선택 사항 · 회원 등록과 함께 수업권을 만들 수 있습니다
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-total_sessions`}>총 회차</Label>
                <Input
                  id={`${idPrefix}-total_sessions`}
                  type="number"
                  min={1}
                  value={value.total_sessions}
                  onChange={(e) => {
                    const raw = e.target.value
                    updateTotalSessions(raw === '' ? '' : Number(raw))
                  }}
                  placeholder="예: 20"
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-remaining_sessions`}>잔여 회차</Label>
                <Input
                  id={`${idPrefix}-remaining_sessions`}
                  type="number"
                  min={0}
                  max={
                    typeof value.total_sessions === 'number'
                      ? value.total_sessions
                      : undefined
                  }
                  value={value.remaining_sessions}
                  onChange={(e) => {
                    const raw = e.target.value
                    onChange({
                      ...value,
                      remaining_sessions: raw === '' ? '' : Number(raw),
                    })
                  }}
                  placeholder={
                    typeof value.total_sessions === 'number'
                      ? `기본값 ${value.total_sessions}`
                      : '총 회차와 동일'
                  }
                  className="bg-input border-border"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-note`}>수업권 메모</Label>
              <Textarea
                id={`${idPrefix}-note`}
                value={value.note}
                onChange={(e) => onChange({ ...value, note: e.target.value })}
                placeholder="결제·기간 메모 (선택)"
                className="bg-input border-border min-h-[72px]"
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
