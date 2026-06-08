'use client'

import { useMemo, useState } from 'react'
import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import { hasNutritionData } from '@/lib/member-body-nutrition'
import { groupRecordHistoryBadges } from '@/lib/member-body-history-badges'
import { hasConditionData } from '@/lib/member-body-wellness'
import { WellnessStatusBadge } from '@/components/members/wellness-status-badge'
import { cn } from '@/lib/utils'

interface RecordHistoryBadgeListProps {
  record: MemberBodyRecord
  className?: string
}

export function RecordHistoryBadgeList({ record, className }: RecordHistoryBadgeListProps) {
  const [expanded, setExpanded] = useState(false)
  const { primary, extra } = useMemo(() => groupRecordHistoryBadges(record), [record])
  const hasWellness = hasConditionData(record)
  const hasNutrition = hasNutritionData(record)

  if (primary.length === 0 && extra.length === 0) {
    return (
      <p className={cn('mt-0.5 text-[11px] text-foreground/50', className)}>
        컨디션·회복 기록 없음
      </p>
    )
  }

  const visibleBadges = expanded ? [...primary, ...extra] : primary

  return (
    <div className={cn('mt-1 space-y-1', className)}>
      <div className="flex flex-wrap gap-1">
        {visibleBadges.map((badge, index) => (
          <WellnessStatusBadge
            key={`${badge.label}-${index}`}
            label={badge.label}
            tone={badge.tone}
          />
        ))}
      </div>
      {extra.length > 0 ? (
        <button
          type="button"
          className="text-[10px] font-medium text-primary/80 hover:text-primary"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? '간략히 보기' : `자세히 보기 (+${extra.length})`}
        </button>
      ) : null}
      {hasWellness && !hasNutrition ? (
        <p className="text-[10px] text-foreground/45">회복/영양 기록 없음</p>
      ) : null}
    </div>
  )
}
