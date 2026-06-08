'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Activity, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import { MemberBodyRecordDialog } from '@/components/members/member-body-record-dialog'
import { formatBodyMetric } from '@/lib/member-utils'

interface MemberBodyAnalysisEntryProps {
  memberId: string
  memberName?: string
  heightCm?: number | null
  weightKg?: number | null
  bodyRecords?: MemberBodyRecord[]
  canAddRecord?: boolean
  analysisHref?: string
  onRecordSaved?: () => void
}

export function MemberBodyAnalysisEntry({
  memberId,
  memberName,
  heightCm,
  weightKg,
  bodyRecords = [],
  canAddRecord = false,
  analysisHref,
  onRecordSaved,
}: MemberBodyAnalysisEntryProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const latestRecord = bodyRecords.at(-1)
  const latestWeight = latestRecord?.weight_kg ?? null
  const defaultHeightCm = latestRecord?.height_cm ?? heightCm ?? null
  const defaultWeightKg = latestWeight ?? weightKg ?? null
  const bodyHref = analysisHref ?? `/dashboard/members/${memberId}/body`

  const linkClassName =
    'inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 px-3 text-sm'

  return (
    <>
      <div className="min-w-0 space-y-3 border-t border-border pt-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">컨디션 &amp; 신체 변화</p>
          <p className="text-xs text-muted-foreground">
            {latestWeight != null
              ? `최근 체중 ${formatBodyMetric(latestWeight)}kg · 컨디션·회복 함께 기록`
              : '체중·컨디션 기록 없음'}
          </p>
          {(heightCm == null && weightKg == null) || latestWeight == null ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              키와 몸무게를 입력하면 변화 그래프를 확인할 수 있습니다.
            </p>
          ) : bodyRecords.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              기록을 추가하면 키/몸무게/BMI 변화를 그래프로 확인할 수 있습니다.
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {canAddRecord ? (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 w-full min-w-0 border-border bg-secondary/40 px-3 hover:bg-secondary/70"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4 shrink-0" />
              기록 추가
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-auto min-h-11 w-full min-w-0 bg-primary px-3 text-primary-foreground hover:bg-primary/90"
            asChild
          >
            <Link href={bodyHref} className={linkClassName}>
              <Activity className="h-4 w-4 shrink-0" />
              분석 보기
            </Link>
          </Button>
        </div>
      </div>

      <MemberBodyRecordDialog
        memberId={memberId}
        memberName={memberName}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        baselineHeightCm={defaultHeightCm}
        defaultWeightKg={defaultWeightKg}
        analysisHref={bodyHref}
        onSaved={onRecordSaved}
      />
    </>
  )
}
