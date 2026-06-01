'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  inviteMemberLogin,
  linkExistingAuthUserToMember,
} from '@/lib/actions/member-account'

interface MemberAccountLinkProps {
  memberId: string
  memberName: string
  linkedAuthUserId?: string | null
}

export function MemberAccountLink({
  memberId,
  memberName,
  linkedAuthUserId,
}: MemberAccountLinkProps) {
  const [email, setEmail] = useState('')
  const [authUserId, setAuthUserId] = useState(linkedAuthUserId ?? '')
  const [isPending, startTransition] = useTransition()

  function handleInvite() {
    startTransition(async () => {
      const result = await inviteMemberLogin(memberId, email, memberName)
      if (result.error) {
        toast.error('초대 실패', { description: result.error })
        return
      }
      toast.success(result.message ?? '초대 메일을 보냈습니다.')
    })
  }

  function handleLinkExisting() {
    startTransition(async () => {
      const result = await linkExistingAuthUserToMember(memberId, authUserId.trim())
      if (result.error) {
        toast.error('연결 실패', { description: result.error })
        return
      }
      toast.success('기존 계정과 연결되었습니다.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">회원 로그인 초대</CardTitle>
        <CardDescription>
          회원 또는 보호자 이메일로 초대 메일을 보냅니다. 회원은 메일을 열고 직접
          비밀번호를 설정한 뒤 남은 횟수와 수업 기록을 확인할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkedAuthUserId ? (
          <p className="text-sm text-muted-foreground">
            연결된 계정 ID: <code className="text-xs">{linkedAuthUserId}</code>
          </p>
        ) : null}

        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor="member-account-email">회원 또는 보호자 이메일</Label>
            <Input
              id="member-account-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !email.trim()}
            onClick={handleInvite}
          >
            초대 메일 보내기
          </Button>
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">기존 auth.users ID 연결</p>
          <p className="text-xs text-muted-foreground">
            이미 가입된 이메일이면 위 초대 대신 여기서 UUID로 연결할 수 있습니다.
          </p>
          <div className="space-y-1">
            <Label htmlFor="member-auth-user-id">auth user UUID</Label>
            <Input
              id="member-auth-user-id"
              value={authUserId}
              onChange={(e) => setAuthUserId(e.target.value)}
              placeholder="Supabase Authentication > Users 의 UUID"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || !authUserId.trim()}
            onClick={handleLinkExisting}
          >
            기존 계정 연결
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
