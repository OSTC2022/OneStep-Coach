'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, User } from 'lucide-react'
import { toast } from 'sonner'
import { updateMemberBasicInfo } from '@/lib/actions/members'
import { stashMemberDetailPatch, toNullableTrimmed } from '@/lib/member-detail-sync'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BirthDateInput } from '@/components/members/birth-date-input'
import {
  formatBirthDateDisplay,
  formatMemberAge,
  suggestAgeFromBirthDate,
} from '@/lib/member-utils'

interface MemberBasicInfoEditorProps {
  memberId: string
  birthDate: string | null
  age: number | null
  grade: string | null
  school: string | null
  canEdit: boolean
  compact?: boolean
  onSaved?: (data: {
    birth_date?: string | null
    age?: number | null
    grade?: string | null
    school?: string | null
  }) => void
}

function displayValue(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '-'
}

export function MemberBasicInfoEditor({
  memberId,
  birthDate,
  age,
  grade,
  school,
  canEdit,
  compact = false,
  onSaved,
}: MemberBasicInfoEditorProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    birth_date: birthDate?.split('T')[0] || '',
    age: age ?? undefined,
    grade: grade || '',
    school: school || '',
  })

  useEffect(() => {
    if (!isEditing) {
      setFormData({
        birth_date: birthDate?.split('T')[0] || '',
        age: age ?? undefined,
        grade: grade || '',
        school: school || '',
      })
    }
  }, [birthDate, age, grade, school, isEditing])

  function handleCancel() {
    setFormData({
      birth_date: birthDate?.split('T')[0] || '',
      age: age ?? undefined,
      grade: grade || '',
      school: school || '',
    })
    setIsEditing(false)
  }

  async function handleSave() {
    setIsSaving(true)
    const result = await updateMemberBasicInfo(memberId, {
      birth_date: formData.birth_date || undefined,
      age: formData.age,
      grade: formData.grade,
      school: formData.school,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    if (result.warning) {
      toast.warning('일부 항목만 저장됨', { description: result.warning })
    } else {
      toast.success('기본 정보가 저장되었습니다.')
    }

    const patch = {
      birth_date: toNullableTrimmed(formData.birth_date),
      age: formData.age ?? null,
      grade: toNullableTrimmed(formData.grade),
      school: toNullableTrimmed(formData.school),
    }
    onSaved?.(patch)
    stashMemberDetailPatch(memberId, patch)
    setIsEditing(false)
    router.refresh()
  }

  const viewContent = (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="text-muted-foreground">생년월일</p>
        <p className="tabular-nums">{formatBirthDateDisplay(birthDate)}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">나이</p>
        <p className="tabular-nums">{formatMemberAge({ age, birth_date: birthDate })}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">학년 / 포지션</p>
        <p className="break-keep leading-snug">{displayValue(grade)}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-muted-foreground">학교 / 소속팀</p>
        <p className="break-keep leading-snug">{displayValue(school)}</p>
      </div>
    </div>
  )

  const editContent = (
    <div className="space-y-4">
      <BirthDateInput
        value={formData.birth_date}
        onChange={(birth_date) =>
          setFormData((prev) => ({
            ...prev,
            birth_date,
            age: suggestAgeFromBirthDate(birth_date) ?? prev.age,
          }))
        }
      />
      <div className="space-y-2">
        <label htmlFor={`member-age-${memberId}`} className="text-sm text-muted-foreground">
          나이
        </label>
        <Input
          id={`member-age-${memberId}`}
          type="number"
          min={0}
          max={120}
          value={formData.age ?? ''}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              age: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
          placeholder="생년월일 입력 시 자동 계산"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">학년 / 포지션</label>
        <Input
          value={formData.grade}
          onChange={(e) => setFormData((prev) => ({ ...prev, grade: e.target.value }))}
          placeholder="예: 중3 / 공격수"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">학교 / 소속팀</label>
        <Input
          value={formData.school}
          onChange={(e) => setFormData((prev) => ({ ...prev, school: e.target.value }))}
          placeholder="예: OO고 / OO클럽"
        />
      </div>
      <div className="flex gap-2">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 flex-1"
          disabled={isSaving}
          onClick={handleCancel}
        >
          <X className="mr-1.5 h-4 w-4" />
          취소
        </Button>
      </div>
    </div>
  )

  return (
    <Card>
      <CardHeader
        className={
          compact
            ? 'flex flex-row items-center justify-between space-y-0 pb-2'
            : 'flex flex-row items-center justify-between space-y-0'
        }
      >
        <CardTitle
          className={
            compact
              ? 'flex items-center gap-2 text-base'
              : 'flex items-center gap-2 text-lg'
          }
        >
          <User className={compact ? 'h-4 w-4 text-primary' : 'h-5 w-5 text-primary'} />
          기본 정보
        </CardTitle>
        {canEdit && !isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-primary hover:text-primary"
            onClick={() => setIsEditing(true)}
            aria-label="기본 정보 수정"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>{isEditing ? editContent : viewContent}</CardContent>
    </Card>
  )
}
