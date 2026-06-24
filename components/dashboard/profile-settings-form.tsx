'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/dashboard/user-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { updateMyProfile } from '@/lib/actions/profile-settings'
import {
  PROFILE_AVATAR_ACCEPT,
  removeProfileAvatar,
  uploadProfileAvatar,
} from '@/lib/profile-avatar-upload'
import { getRoleLabel } from '@/lib/roles'
import type { MemberGender } from '@/lib/running-league/ranking-gender'
import { MemberGenderField } from '@/components/members/member-gender-field'
import type { User } from '@/lib/types'

interface ProfileSettingsFormProps {
  user: User
  idPrefix?: string
  onCancel?: () => void
  onSaved?: () => void
  memberGender?: MemberGender | null
  showMemberGender?: boolean
}

function settingsFromUser(user: User, memberGender: MemberGender | null | undefined) {
  return {
    fullName: user.full_name ?? '',
    phone: user.phone ?? '',
    kakaoId: user.kakao_id ?? '',
    instagramId: user.instagram_id ?? '',
    avatarUrl: user.avatar_url ?? null,
    gender: memberGender ?? null,
  }
}

export function ProfileSettingsForm({
  user,
  idPrefix = 'profile',
  onCancel,
  onSaved,
  memberGender = null,
  showMemberGender = false,
}: ProfileSettingsFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [fullName, setFullName] = useState(() => settingsFromUser(user, memberGender).fullName)
  const [phone, setPhone] = useState(() => settingsFromUser(user, memberGender).phone)
  const [kakaoId, setKakaoId] = useState(() => settingsFromUser(user, memberGender).kakaoId)
  const [instagramId, setInstagramId] = useState(() => settingsFromUser(user, memberGender).instagramId)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => settingsFromUser(user, memberGender).avatarUrl)
  const [gender, setGender] = useState<MemberGender | null>(() => settingsFromUser(user, memberGender).gender)

  useEffect(() => {
    const next = settingsFromUser(user, memberGender)
    setFullName(next.fullName)
    setPhone(next.phone)
    setKakaoId(next.kakaoId)
    setInstagramId(next.instagramId)
    setAvatarUrl(next.avatarUrl)
    setGender(next.gender)
  }, [user, memberGender])

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsUploading(true)
    const result = await uploadProfileAvatar(user.id, file)
    setIsUploading(false)

    if (result.error || !result.url) {
      toast.error('프로필 사진 업로드 실패', {
        description: result.error ?? '다시 시도해주세요.',
      })
      return
    }

    setAvatarUrl(result.url)
    toast.success('프로필 사진이 선택되었습니다. 저장을 눌러 적용해주세요.')
  }

  async function handleRemoveAvatar() {
    setIsUploading(true)
    const result = await removeProfileAvatar(user.id)
    setIsUploading(false)

    if (result.error) {
      toast.error('프로필 사진 삭제 실패', { description: result.error })
      return
    }

    setAvatarUrl(null)
    toast.success('프로필 사진이 제거되었습니다. 저장을 눌러 적용해주세요.')
  }

  function handleSave() {
    if (showMemberGender && !gender) {
      toast.error('성별을 선택해주세요.')
      return
    }

    startTransition(async () => {
      const result = await updateMyProfile({
        full_name: fullName,
        avatar_url: avatarUrl,
        phone,
        kakao_id: kakaoId,
        instagram_id: instagramId,
        ...(showMemberGender ? { gender } : {}),
      })
      if (result.error) {
        toast.error('프로필 저장 실패', { description: result.error })
        return
      }
      toast.success('프로필이 저장되었습니다.')
      onSaved?.()
    })
  }

  const avatarUser = {
    full_name: fullName,
    email: user.email,
    avatar_url: avatarUrl,
  }

  const disabled = isUploading || isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <UserAvatar user={avatarUser} className="h-24 w-24" />
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={PROFILE_AVATAR_ACCEPT}
            className="hidden"
            onChange={(event) => void handleAvatarChange(event)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              사진 변경
            </Button>
            {avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={disabled}
                onClick={() => void handleRemoveAvatar()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                사진 제거
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            JPG·PNG·WEBP, 최대 2MB (512px로 자동 조정)
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-full-name`}>이름</Label>
          <Input
            id={`${idPrefix}-full-name`}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="표시 이름"
            maxLength={40}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-phone`}>연락처</Label>
          <PhoneInput
            id={`${idPrefix}-phone`}
            value={phone}
            onChange={setPhone}
            placeholder="010-0000-0000"
          />
        </div>

        {showMemberGender ? (
          <div className="space-y-1.5 sm:col-span-2">
            <MemberGenderField
              value={gender}
              onChange={setGender}
              required
              disabled={disabled}
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-kakao`}>카카오톡 아이디</Label>
          <Input
            id={`${idPrefix}-kakao`}
            value={kakaoId}
            onChange={(e) => setKakaoId(e.target.value)}
            placeholder="카카오톡 검색 아이디"
            maxLength={80}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-instagram`}>인스타그램 아이디</Label>
          <Input
            id={`${idPrefix}-instagram`}
            value={instagramId}
            onChange={(e) => setInstagramId(e.target.value)}
            placeholder="@username"
            maxLength={80}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-email`}>이메일</Label>
          <Input
            id={`${idPrefix}-email`}
            value={user.email ?? ''}
            readOnly
            disabled
            className="bg-muted/40"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-role`}>권한</Label>
          <Input
            id={`${idPrefix}-role`}
            value={getRoleLabel(user.role)}
            readOnly
            disabled
            className="bg-muted/40"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            취소
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={handleSave}
          disabled={disabled || !fullName.trim() || (showMemberGender && !gender)}
          className="sm:min-w-[120px]"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              저장 중…
            </>
          ) : (
            '저장'
          )}
        </Button>
      </div>
    </div>
  )
}
