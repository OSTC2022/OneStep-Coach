'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { addMemberBodyRecord } from '@/lib/actions/member-body-records'
import { describeBodyRecordMigrationHint } from '@/lib/member-body-record-messages'
import { formatBodyMetric } from '@/lib/member-utils'
import {
  MemberBodyRecordFields,
  bodyRecordFormToNutritionInput,
  bodyRecordFormToWellnessInput,
  createEmptyBodyRecordFormValues,
  validateBasicBodyRecord,
  type MemberBodyRecordFormValues,
} from '@/components/members/member-body-record-fields'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MemberBodyRecordDialogProps {
  memberId: string
  memberName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  baselineHeightCm?: number | null
  defaultWeightKg?: number | null
  defaultDate?: string
  proteinSettings?: {
    protein_goal_multiplier: number
    protein_goal_mode: string
  }
  onSaved?: () => void
  analysisHref?: string
}

export function MemberBodyRecordDialog({
  memberId,
  memberName,
  open,
  onOpenChange,
  baselineHeightCm,
  defaultWeightKg,
  defaultDate,
  proteinSettings,
  onSaved,
  analysisHref,
}: MemberBodyRecordDialogProps) {
  const bodyHref = analysisHref ?? `/dashboard/members/${memberId}/body`
  const router = useRouter()
  const [formValues, setFormValues] = useState<MemberBodyRecordFormValues>(
    createEmptyBodyRecordFormValues(),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setFormValues(
      createEmptyBodyRecordFormValues({
        date: defaultDate ?? format(new Date(), 'yyyy-MM-dd'),
        height: formatBodyMetric(baselineHeightCm),
        weight: formatBodyMetric(defaultWeightKg),
      }),
    )
  }, [open, defaultDate, defaultWeightKg, baselineHeightCm])

  async function handleSave() {
    const validationError = validateBasicBodyRecord(formValues)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    const weightKg = Number(formValues.weight)
    const result = await addMemberBodyRecord(memberId, weightKg, {
      recordedAt: formValues.date,
      heightCm: Number(formValues.height),
      wellness: bodyRecordFormToWellnessInput(formValues),
      nutrition: bodyRecordFormToNutritionInput(formValues, {
        weightKg,
        proteinSettings,
      }),
      proteinSettings,
    })
    setSaving(false)

    if (result.error) {
      toast.error('기록 저장 실패', {
        description: result.migrationHint
          ? `${result.error} · ${result.migrationHint}`
          : result.error,
      })
      return
    }

    const migrationNotice = describeBodyRecordMigrationHint(result.migrationHint)
    if (migrationNotice) {
      toast.warning(migrationNotice.title, { description: migrationNotice.description })
    }

    toast.success('신체 기록이 저장되었습니다.', {
      description: (
        <Link href={bodyHref} className="underline hover:text-foreground">
          분석 보기에서 확인하기
        </Link>
      ),
    })

    onSaved?.()
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>신체 기록 추가</DialogTitle>
          <DialogDescription>
            {memberName ? `${memberName} · ` : ''}
            키·몸무게만 입력해도 저장됩니다. 추가 항목은 선택입니다.
          </DialogDescription>
        </DialogHeader>

        <MemberBodyRecordFields
          idPrefix="body-dialog"
          values={formValues}
          onChange={setFormValues}
          proteinSettings={proteinSettings}
          disabled={saving}
          onEnterSubmit={() => void handleSave()}
        />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                저장 중
              </>
            ) : (
              '저장'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
