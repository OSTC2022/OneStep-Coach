'use client'

import { StaffSnsCard } from '@/components/instructors/staff-sns-card'
import type { CenterSettings } from '@/lib/types'

interface CenterSnsPanelProps {
  centerSettings: CenterSettings
}

export function CenterSnsPanel({ centerSettings }: CenterSnsPanelProps) {
  return <StaffSnsCard role="admin" centerSettings={centerSettings} />
}
