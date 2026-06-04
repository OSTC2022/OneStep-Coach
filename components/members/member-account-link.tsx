'use client'

import { useState, useTransition } from 'react'
import { Copy, Loader2 } from 'lucide-react'
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
  const [manualLink, setManualLink] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleInvite() {
    startTransition(async () => {
      const result = await inviteMemberLogin(memberId, email, memberName)
      if (result.error) {
        if (result.manualLink) {
          setManualLink(result.manualLink)
        }
        toast.error('초대 실패', { description: result.error })
        return
      }

      if (result.manualLink) {
        setManualLink(result.manualLink)
        toast.warning('링크를 직접 전달해주세요', {
          description: result.message,
          duration: 12000,
        })
        return
      }

      setManualLink(null)
      toast.success(result.message ?? '초대 메일을 보냈습니다.')
    })
  }

  async function copyManualLink() {
    if (!manualLink) return
    try {
      await navigator.clipboard.writeText(manualLink)
      toast.success('링크를 복사했습니다.')
    } catch {
      toast.error('복사에 실패했습니다. 링크를 직접 선택해 복사해주세요.')
    }
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
          회원 또는 보호자 이메일로 초대 메일을 보냅니다. 이미 등록된 이메일이어도
          버튼을 다시 누르면 비밀번호 설정 링크를 재발송합니다. Supabase SMTP 미설정 시
          아래에 링크가 표시되면 카톡·문자로 직접 보내주세요.
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
              required
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !email.trim()}
            onClick={handleInvite}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                발송 중…
              </>
            ) : (
              '초대 메일 보내기'
            )}
          </Button>
        </div>

        {manualLink ? (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              비밀번호 설정 링크 (직접 전달)
            </p>
            <p className="text-xs text-muted-foreground">
              자동 메일이 나가지 않았습니다. 링크를 복사해 회원에게 보내주세요.
            </p>
            <Input readOnly value={manualLink} className="text-xs font-mono" />
            <Button type="button" size="sm" variant="secondary" onClick={() => void copyManualLink()}>
              <Copy className="mr-2 h-4 w-4" />
              링크 복사
            </Button>
          </div>
        ) : null}

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
