'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MemberMileageLogCard } from '@/components/dashboard/member-mileage-log-card'
import type { RunningLeagueMileageLog, RunningLeagueParticipant } from '@/lib/types'

export type MemberMileageLogDialogProps = {
  participant: RunningLeagueParticipant | null
  mileageLogs: RunningLeagueMileageLog[]
  tableReady: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  startWithScreenshot?: boolean
  portalRecordReady?: boolean
  readOnly?: boolean
  onSaved?: () => void
}

export function MemberMileageLogDialog({
  participant,
  mileageLogs,
  tableReady,
  open,
  onOpenChange,
  startWithScreenshot = false,
  portalRecordReady = false,
  readOnly = false,
  onSaved,
}: MemberMileageLogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-md"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>러닝 기록 입력</DialogTitle>
        </DialogHeader>
        <MemberMileageLogCard
          participant={participant}
          mileageLogs={mileageLogs}
          tableReady={tableReady}
          variant="form-only"
          active={open}
          onClose={() => onOpenChange(false)}
          startWithScreenshot={startWithScreenshot}
          portalRecordReady={portalRecordReady}
          readOnly={readOnly}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  )
}
