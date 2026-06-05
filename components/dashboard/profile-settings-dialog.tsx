'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { updateMyProfile } from '@/lib/actions/profile-settings'
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
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setFullName(user.full_name ?? '')
    }
  }, [open, user.full_name])

  function handleSave() {
    startTransition(async () => {
      const result = await updateMyProfile({ full_name: fullName })
      if (result.error) {
        toast.error('프로필 저장 실패', { description: result.error })
        return
      }
      toast.success('프로필이 저장되었습니다.')
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>프로필 설정</DialogTitle>
          <DialogDescription>
            표시 이름을 수정합니다. 로그인 이메일은 변경할 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-full-name">이름</Label>
            <Input
              id="profile-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="표시 이름"
              maxLength={40}
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
          <Button type="button" onClick={handleSave} disabled={isPending || !fullName.trim()}>
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
