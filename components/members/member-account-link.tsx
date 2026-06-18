'use client'

import { useEffect, useState, useTransition } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  inviteMemberLogin,
  linkExistingAuthUserToMember,
  type MemberAccountEmailInfo,
} from '@/lib/actions/member-account'

interface MemberAccountLinkProps {
  memberId: string
  memberName: string
  linkedAuthUserId?: string | null
  registeredEmail?: string | null
  emailSource?: MemberAccountEmailInfo['source']
}

export function MemberAccountLink({
  memberId,
  memberName,
  linkedAuthUserId,
  registeredEmail = null,
  emailSource = null,
}: MemberAccountLinkProps) {
  const hasRegisteredEmail = Boolean(registeredEmail?.trim())
  const [useCustomEmail, setUseCustomEmail] = useState(!hasRegisteredEmail)
  const [email, setEmail] = useState(registeredEmail?.trim() ?? '')
  const [authUserId, setAuthUserId] = useState(linkedAuthUserId ?? '')
  const [manualLink, setManualLink] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const next = registeredEmail?.trim() ?? ''
    if (next) {
      setEmail(next)
      setUseCustomEmail(false)
    } else {
      setEmail('')
      setUseCustomEmail(true)
    }
  }, [registeredEmail])

  useEffect(() => {
    setAuthUserId(linkedAuthUserId ?? '')
  }, [linkedAuthUserId])

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

  const inviteEmail = useCustomEmail ? email.trim() : (registeredEmail?.trim() || email.trim())

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">회원 로그인 활성화</CardTitle>
        <CardDescription>
          회원 또는 보호자 이메일로 계정을 연결합니다. 가입 시 자동 생성된
          중복 회원 프로필은 연결 시 센터 등록 회원으로 통합됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkedAuthUserId ? (
          <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            회원 로그인 활성화됨
            <p className="mt-1 text-xs text-emerald-200/80">
              계정 ID: <code>{linkedAuthUserId}</code>
            </p>
          </div>
        ) : null}

        <div className="space-y-2 rounded-md border border-border p-3">
          {hasRegisteredEmail && !useCustomEmail ? (
            <div className="space-y-2">
              <Label>가입 이메일</Label>
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
                <p className="text-sm font-semibold text-foreground">{registeredEmail}</p>
                {emailSource === 'auth' ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Supabase에 등록된 계정 이메일입니다.
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    초대한 이메일입니다. 가입 완료 전입니다.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs text-muted-foreground"
                onClick={() => {
                  setUseCustomEmail(true)
                  setEmail('')
                }}
              >
                다른 이메일로 초대
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="member-account-email">회원 또는 보호자 이메일</Label>
              {hasRegisteredEmail ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mb-1 h-auto px-0 text-xs text-muted-foreground"
                  onClick={() => {
                    setUseCustomEmail(false)
                    setEmail(registeredEmail?.trim() ?? '')
                  }}
                >
                  가입 이메일 사용 ({registeredEmail})
                </Button>
              ) : null}
              <Input
                id="member-account-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@example.com"
                required
              />
            </div>
          )}

          <Button
            type="button"
            size="sm"
            disabled={isPending || !inviteEmail}
            onClick={handleInvite}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                발송 중…
              </>
            ) : (
              linkedAuthUserId ? '비밀번호 설정 링크 재발송' : '회원 로그인 활성화 (초대 메일)'
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
