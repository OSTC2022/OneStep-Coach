'use client'

import { useMemo, useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { createAccountByAdmin } from '@/lib/actions/auth-registration'
import type {
  InstructorRoleRow,
  SettingsAssignableRole,
} from '@/lib/settings-accounts-types'
import {
  adultProgramFromRoleSelect,
  type AdultMemberProgram,
} from '@/lib/adult-member-programs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type RoleSelectValue =
  | SettingsAssignableRole
  | 'adult_member_athletics'
  | 'adult_member_general'

const ROLE_SELECT_OPTIONS: { value: RoleSelectValue; label: string }[] = [
  { value: 'member', label: '회원' },
  { value: 'adult_member_athletics', label: '성인회원(육상)' },
  { value: 'adult_member_general', label: '성인회원(일반)' },
  { value: 'guardian', label: '학부모' },
  { value: 'admin', label: '관리자' },
  { value: 'instructor', label: '강사' },
]

function parseRoleSelect(value: RoleSelectValue): {
  role: SettingsAssignableRole
  adultProgram: AdultMemberProgram | null
} {
  const adultProgram = adultProgramFromRoleSelect(value)
  if (adultProgram) {
    return { role: 'adult_member', adultProgram }
  }
  return { role: value as SettingsAssignableRole, adultProgram: null }
}

interface AdminCreateAccountPanelProps {
  instructors: InstructorRoleRow[]
  onAccountCreated?: () => void | Promise<void>
}

export function AdminCreateAccountPanel({
  instructors,
  onAccountCreated,
}: AdminCreateAccountPanelProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [roleSelect, setRoleSelect] = useState<RoleSelectValue>('member')
  const [instructorId, setInstructorId] = useState('')
  const [saving, setSaving] = useState(false)

  const { role, adultProgram } = parseRoleSelect(roleSelect)

  const unlinkedInstructors = useMemo(
    () => instructors.filter((i) => i.is_active && !i.hasCoachAccess),
    [instructors],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (role === 'instructor' && !instructorId) {
      toast.error('강사 프로필을 선택해주세요.')
      return
    }

    const emailTrimmed = email.trim()
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      toast.error('올바른 이메일을 입력해주세요.')
      return
    }

    if (!password || password.length < 8) {
      toast.error('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (password !== passwordConfirm) {
      toast.error('비밀번호가 일치하지 않습니다.')
      return
    }

    setSaving(true)
    const result = await createAccountByAdmin({
      fullName,
      email: emailTrimmed,
      password,
      passwordConfirm,
      role,
      instructorId: role === 'instructor' ? instructorId : null,
      adultProgram,
    })
    setSaving(false)

    if (result.error) {
      toast.error('계정 생성 실패', { description: result.error })
      return
    }

    toast.success(
      result.recovered ? '미완료 계정을 복구했습니다.' : '계정이 생성되었습니다.',
      {
        description: result.loginEmail
          ? `로그인 ID: ${result.loginEmail} · 가입 승인 탭에서 승인해주세요.`
          : '가입 승인 탭에서 승인해주세요.',
        duration: 12000,
      },
    )

    setFullName('')
    setEmail('')
    setPassword('')
    setPasswordConfirm('')
    setRoleSelect('member')
    setInstructorId('')
    await onAccountCreated?.()
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          계정 직접 만들기
        </CardTitle>
        <CardDescription>
          만든 계정은 <strong>승인 대기</strong> 상태입니다.{' '}
          <strong>가입 승인</strong> 탭에서 승인해야 로그인할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="create-full-name" className="text-sm font-medium">
              이름 <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="홍길동"
              required
              minLength={2}
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-email" className="text-sm font-medium">
              이메일 <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
              autoComplete="email"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-password" className="text-sm font-medium">
              비밀번호 <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-password-confirm" className="text-sm font-medium">
              비밀번호 확인 <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="8자 이상"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">권한</label>
            <Select
              value={roleSelect}
              onValueChange={(v) => {
                const next = v as RoleSelectValue
                setRoleSelect(next)
                if (parseRoleSelect(next).role !== 'instructor') {
                  setInstructorId('')
                }
              }}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_SELECT_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {adultProgram === 'general' ? (
              <p className="text-[11px] text-muted-foreground">
                성인회원(일반): 승인 후 체중 관리 포털을 사용합니다.
              </p>
            ) : adultProgram === 'athletics' ? (
              <p className="text-[11px] text-muted-foreground">
                성인회원(육상): 승인 후 러닝·육상 포털을 사용합니다.
              </p>
            ) : null}
          </div>

          {role === 'instructor' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">연결할 강사</label>
              <Select value={instructorId} onValueChange={setInstructorId} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder="강사 선택" />
                </SelectTrigger>
                <SelectContent>
                  {unlinkedInstructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                생성 중…
              </>
            ) : (
              '계정 생성'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
