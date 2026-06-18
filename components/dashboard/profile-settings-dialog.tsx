'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/dashboard/user-avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import {
  getMyProfileSettings,
  updateMyProfile,
  type MyProfileSettings,
} from '@/lib/actions/profile-settings'
import {
  PROFILE_AVATAR_ACCEPT,
  removeProfileAvatar,
  uploadProfileAvatar,
} from '@/lib/profile-avatar-upload'
import { getRoleLabel } from '@/lib/roles'
import type { User } from '@/lib/types'

interface ProfileSettingsDialogProps {
  user: User
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileSettingsDialog({
  user,
  open,
  onOpenChange,
}: ProfileSettingsDialogProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [phone, setPhone] = useState('')
  const [kakaoId, setKakaoId] = useState('')
  const [instagramId, setInstagramId] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url ?? null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)

    void getMyProfileSettings()
      .then((settings: MyProfileSettings | null) => {
        if (cancelled || !settings) return
        setFullName(settings.full_name)
        setPhone(settings.phone)
        setKakaoId(settings.kakao_id)
        setInstagramId(settings.instagram_id)
        setAvatarUrl(settings.avatar_url)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, user.id])

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
    startTransition(async () => {
      const result = await updateMyProfile({
        full_name: fullName,
        avatar_url: avatarUrl,
        phone,
        kakao_id: kakaoId,
        instagram_id: instagramId,
      })
      if (result.error) {
        toast.error('프로필 저장 실패', { description: result.error })
        return
      }
      toast.success('프로필이 저장되었습니다.')
      onOpenChange(false)
      router.refresh()
    })
  }

  const avatarUser = {
    full_name: fullName,
    email: user.email,
    avatar_url: avatarUrl,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>프로필 설정</DialogTitle>
          <DialogDescription>
            프로필 사진, 이름, 연락처, SNS 아이디를 수정합니다. 로그인 이메일은
            변경할 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-4">
            <UserAvatar user={avatarUser} className="h-20 w-20" />
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={PROFILE_AVATAR_ACCEPT}
                className="hidden"
                onChange={(event) => void handleAvatarChange(event)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || isUploading || isPending}
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
                  disabled={loading || isUploading || isPending}
                  onClick={() => void handleRemoveAvatar()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  사진 제거
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground">
                JPG·PNG·WEBP, 최대 2MB (512px로 자동 조정)
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-full-name">이름</Label>
            <Input
              id="profile-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="표시 이름"
              maxLength={40}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">연락처</Label>
            <PhoneInput
              id="profile-phone"
              value={phone}
              onChange={setPhone}
              placeholder="010-0000-0000"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-kakao">카카오톡 아이디</Label>
            <Input
              id="profile-kakao"
              value={kakaoId}
              onChange={(e) => setKakaoId(e.target.value)}
              placeholder="카카오톡 검색 아이디"
              maxLength={80}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-instagram">인스타그램 아이디</Label>
            <Input
              id="profile-instagram"
              value={instagramId}
              onChange={(e) => setInstagramId(e.target.value)}
              placeholder="@username"
              maxLength={80}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-email">이메일</Label>
            <Input
              id="profile-email"
              value={user.email ?? ''}
              readOnly
              disabled
              className="bg-muted/40"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-role">권한</Label>
            <Input
              id="profile-role"
              value={getRoleLabel(user.role)}
              readOnly
              disabled
              className="bg-muted/40"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || isUploading || loading || !fullName.trim()}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
