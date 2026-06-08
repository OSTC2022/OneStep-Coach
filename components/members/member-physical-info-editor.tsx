'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Target } from 'lucide-react'
import { toast } from 'sonner'
import { updateMemberPhysicalInfo } from '@/lib/actions/members'
import type { MemberBodyRecord } from '@/lib/actions/member-body-records'
import { calculateMemberBmi, formatBodyMetric } from '@/lib/member-utils'
import { BodyMetricInput } from '@/components/ui/body-metric-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MemberBodyAnalysisEntry } from '@/components/members/member-body-change-menu-link'

interface MemberPhysicalInfoEditorProps {
  memberId: string
  memberName?: string
  heightCm: number | null
  weightKg: number | null
  canEditInitial?: boolean
  canSaveInitial?: boolean
  bodyRecords?: MemberBodyRecord[]
  canAddRecord?: boolean
  analysisHref?: string
  onSaved?: (data: { height_cm?: number | null; weight_kg?: number | null; bmi?: number | null }) => void
}

function bmiColorClass(bmi: number | null) {
  if (bmi == null) return ''
  if (bmi < 18.5) return 'text-blue-400'
  if (bmi < 23) return 'text-green-400'
  if (bmi < 25) return 'text-yellow-400'
  return 'text-red-400'
}

export function MemberPhysicalInfoEditor({
  memberId,
  memberName,
  heightCm,
  weightKg,
  canEditInitial = false,
  canSaveInitial = false,
  bodyRecords = [],
  canAddRecord = false,
  analysisHref,
  onSaved,
}: MemberPhysicalInfoEditorProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    height_cm: formatBodyMetric(heightCm),
    weight_kg: formatBodyMetric(weightKg),
  })

  useEffect(() => {
    if (!isEditing) {
      setFormData({
        height_cm: formatBodyMetric(heightCm),
        weight_kg: formatBodyMetric(weightKg),
      })
    }
  }, [heightCm, weightKg, isEditing])

  const displayBmi = useMemo(
    () => calculateMemberBmi(heightCm, weightKg),
    [heightCm, weightKg],
  )

  const previewBmi = useMemo(() => {
    const height = formData.height_cm ? Number(formData.height_cm) : null
    const weight = formData.weight_kg ? Number(formData.weight_kg) : null
    return calculateMemberBmi(height, weight)
  }, [formData.height_cm, formData.weight_kg])

  function handleCancel() {
    setFormData({
      height_cm: formatBodyMetric(heightCm),
      weight_kg: formatBodyMetric(weightKg),
    })
    setIsEditing(false)
  }

  async function handleSave() {
    setIsSaving(true)
    const result = await updateMemberPhysicalInfo(memberId, {
      height_cm: formData.height_cm,
      weight_kg: formData.weight_kg,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('신체 정보가 저장되었습니다.')
    if (result.data) {
      onSaved?.({
        height_cm: result.data.height_cm,
        weight_kg: result.data.weight_kg,
        bmi: result.data.bmi,
      })
    }
    setIsEditing(false)
    router.refresh()
  }

  const viewContent = (
    <div className="min-w-0 space-y-3">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">키</span>
        <span>{heightCm ? `${formatBodyMetric(heightCm)}cm` : '-'}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">몸무게</span>
        <span>{weightKg ? `${formatBodyMetric(weightKg)}kg` : '-'}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">BMI</span>
        <span className={bmiColorClass(displayBmi)}>
          {displayBmi != null ? displayBmi.toFixed(1) : '-'}
        </span>
      </div>
      <MemberBodyAnalysisEntry
        memberId={memberId}
        memberName={memberName}
        heightCm={heightCm}
        weightKg={weightKg}
        bodyRecords={bodyRecords}
        canAddRecord={canAddRecord}
        analysisHref={analysisHref}
        onRecordSaved={() => router.refresh()}
      />
    </div>
  )

  const editContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={`member-height-${memberId}`} className="text-sm text-muted-foreground">
          키 (cm)
        </label>
        <BodyMetricInput
          id={`member-height-${memberId}`}
          value={formData.height_cm}
          onChange={(value) => setFormData((prev) => ({ ...prev, height_cm: value }))}
          placeholder="170"
          disabled={!canSaveInitial}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`member-weight-${memberId}`} className="text-sm text-muted-foreground">
          몸무게 (kg)
        </label>
        <BodyMetricInput
          id={`member-weight-${memberId}`}
          value={formData.weight_kg}
          onChange={(value) => setFormData((prev) => ({ ...prev, weight_kg: value }))}
          placeholder="65"
          disabled={!canSaveInitial}
        />
      </div>
      <div className="flex justify-between gap-3 text-sm">
        <span className="text-muted-foreground">BMI (미리보기)</span>
        <span className={bmiColorClass(previewBmi)}>
          {previewBmi != null ? previewBmi.toFixed(1) : '-'}
        </span>
      </div>
      {!canSaveInitial ? (
        <p className="text-xs text-muted-foreground">
          신체정보 초기 설정은 관리자만 저장할 수 있습니다.
        </p>
      ) : null}
      <div className="flex gap-2">
        {canSaveInitial ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11 flex-1"
            disabled={isSaving}
            onClick={() => void handleSave()}
          >
            <Check className="mr-1.5 h-4 w-4" />
            {isSaving ? '저장 중…' : '저장'}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={canSaveInitial ? 'min-h-11 flex-1' : 'min-h-11 w-full'}
          disabled={isSaving}
          onClick={handleCancel}
        >
          <X className="mr-1.5 h-4 w-4" />
          {canSaveInitial ? '취소' : '닫기'}
        </Button>
      </div>
    </div>
  )

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5 text-primary" />
          신체 정보
        </CardTitle>
        {canEditInitial && !isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-primary hover:text-primary"
            onClick={() => setIsEditing(true)}
            aria-label="신체 정보 수정"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="min-w-0">{isEditing ? editContent : viewContent}</CardContent>
    </Card>
  )
}
