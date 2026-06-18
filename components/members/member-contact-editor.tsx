'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { updateMemberContactInfo } from '@/lib/actions/members'
import type { VisibleSnsAccount } from '@/lib/sns-account'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { formatKoreanPhoneInput } from '@/lib/phone-format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SnsIdLink } from '@/components/members/sns-id-link'
import { SnsIconLinks } from '@/components/members/sns-icon-links'

export type { VisibleSnsAccount }

interface MemberContactEditorProps {
  memberId: string
  phone: string | null
  parentPhone: string | null
  kakaoId: string | null
  instagramId: string | null
  canEdit: boolean
  instructorName?: string
  instructorAccount?: VisibleSnsAccount | null
  centerAccount?: VisibleSnsAccount | null
  compact?: boolean
  onSaved?: (data: {
    phone?: string | null
    parent_phone?: string | null
    kakao_id?: string | null
    instagram_id?: string | null
  }) => void
}

function displayValue(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '-'
}

function VisibleAccountSection({
  account,
  roleLabel,
}: {
  account: VisibleSnsAccount
  roleLabel: string
}) {
  const showNameOnRight = roleLabel === '담당 강사' || account.name.trim() !== roleLabel.trim()

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">{roleLabel}</span>
        {showNameOnRight ? (
          <span className="text-right font-medium">{account.name}</span>
        ) : null}
      </div>
      <div className="flex justify-start">
        <SnsIconLinks
          kakaoId={account.kakaoId}
          instagramId={account.instagramId}
          blogUrl={account.blogUrl}
          size="sm"
        />
      </div>
    </div>
  )
}

export function MemberContactEditor({
  memberId,
  phone,
  parentPhone,
  kakaoId,
  instagramId,
  canEdit,
  instructorName,
  instructorAccount,
  centerAccount,
  compact = false,
  onSaved,
}: MemberContactEditorProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    phone: phone ? formatKoreanPhoneInput(phone) : '',
    parent_phone: parentPhone ? formatKoreanPhoneInput(parentPhone) : '',
    kakao_id: kakaoId || '',
    instagram_id: instagramId || '',
  })

  useEffect(() => {
    if (!isEditing) {
      setFormData({
        phone: phone ? formatKoreanPhoneInput(phone) : '',
        parent_phone: parentPhone ? formatKoreanPhoneInput(parentPhone) : '',
        kakao_id: kakaoId || '',
        instagram_id: instagramId || '',
      })
    }
  }, [phone, parentPhone, kakaoId, instagramId, isEditing])

  function handleCancel() {
    setFormData({
      phone: phone ? formatKoreanPhoneInput(phone) : '',
      parent_phone: parentPhone ? formatKoreanPhoneInput(parentPhone) : '',
      kakao_id: kakaoId || '',
      instagram_id: instagramId || '',
    })
    setIsEditing(false)
  }

  async function handleSave() {
    setIsSaving(true)
    const result = await updateMemberContactInfo(memberId, {
      phone: formData.phone,
      parent_phone: formData.parent_phone,
      kakao_id: formData.kakao_id,
      instagram_id: formData.instagram_id,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    if (result.warning) {
      toast.warning('일부 항목만 저장됨', { description: result.warning })
    } else {
      toast.success('연락처가 저장되었습니다.')
    }
    if (result.data) {
      onSaved?.(result.data)
    }
    setIsEditing(false)
    router.refresh()
  }

  const instructorSection =
    instructorAccount != null ? (
      <VisibleAccountSection account={instructorAccount} roleLabel="담당 강사" />
    ) : instructorName != null ? (
      <div className="flex justify-between gap-3 border-t border-border pt-3">
        <span className="text-muted-foreground shrink-0">담당 강사</span>
        <span className="text-right font-medium">{instructorName}</span>
      </div>
    ) : null

  const viewContent = (
    <div className="space-y-3">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">본인 연락처</span>
        <span className="text-right">{displayValue(phone)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">보호자</span>
        <span className="text-right">{displayValue(parentPhone)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">카카오톡</span>
        <SnsIdLink value={kakaoId} type="kakao" />
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground shrink-0">인스타그램</span>
        <SnsIdLink value={instagramId} type="instagram" />
      </div>
      {instructorSection}
      {centerAccount ? <VisibleAccountSection account={centerAccount} roleLabel="센터" /> : null}
    </div>
  )

  const editContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={`member-phone-${memberId}`} className="text-sm text-muted-foreground">
          본인 연락처
        </label>
        <PhoneInput
          id={`member-phone-${memberId}`}
          value={formData.phone}
          onChange={(phone) => setFormData((prev) => ({ ...prev, phone }))}
          placeholder="010-1234-5678"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`member-parent-phone-${memberId}`} className="text-sm text-muted-foreground">
          보호자
        </label>
        <PhoneInput
          id={`member-parent-phone-${memberId}`}
          value={formData.parent_phone}
          onChange={(parent_phone) =>
            setFormData((prev) => ({ ...prev, parent_phone }))
          }
          placeholder="010-9876-5432"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`member-kakao-${memberId}`} className="text-sm text-muted-foreground">
          카카오톡
        </label>
        <Input
          id={`member-kakao-${memberId}`}
          value={formData.kakao_id}
          onChange={(e) => setFormData((prev) => ({ ...prev, kakao_id: e.target.value }))}
          placeholder="카카오톡 개인 ID"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`member-instagram-${memberId}`} className="text-sm text-muted-foreground">
          인스타그램
        </label>
        <Input
          id={`member-instagram-${memberId}`}
          value={formData.instagram_id}
          onChange={(e) => setFormData((prev) => ({ ...prev, instagram_id: e.target.value }))}
          placeholder="@아이디"
        />
      </div>
      {instructorSection}
      {centerAccount ? <VisibleAccountSection account={centerAccount} roleLabel="센터" /> : null}
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
          <Phone className={compact ? 'h-4 w-4 text-primary' : 'h-5 w-5 text-primary'} />
          연락처
        </CardTitle>
        {canEdit && !isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-primary hover:text-primary"
            onClick={() => setIsEditing(true)}
            aria-label="연락처 수정"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>{isEditing ? editContent : viewContent}</CardContent>
    </Card>
  )
}
