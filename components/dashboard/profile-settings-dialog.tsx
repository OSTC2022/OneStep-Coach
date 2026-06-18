'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProfileSettingsForm } from '@/components/dashboard/profile-settings-form'
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

        {open ? (
          <ProfileSettingsForm
            user={user}
            idPrefix="profile-dialog"
            onCancel={() => onOpenChange(false)}
            onSaved={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
