'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { requestPasswordReset, signIn } from '@/lib/actions/auth'
import { BirthDateInput } from '@/components/members/birth-date-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Loader2, Dumbbell } from 'lucide-react'
import { PhoneInput } from '@/components/ui/phone-input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { InstallAppButton } from '@/components/pwa/install-app-button'
import { ShareWebsiteButton } from '@/components/pwa/share-website-button'
import type { PublicSignUpMemberType } from '@/lib/actions/auth-registration'

type SignUpResult = {
  error?: string
  success?: boolean
  loginIdentifier?: string
}

export default function LoginPage() {
  const [tab, setTab] = useState('login')
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [signUpBirthDate, setSignUpBirthDate] = useState('')
  const [signUpMemberType, setSignUpMemberType] =
    useState<PublicSignUpMemberType>('student')
  const [signUpPhone, setSignUpPhone] = useState('')
  const [signUpParentPhone, setSignUpParentPhone] = useState('')
  const [loginState, setLoginState] = useState<{ error?: string } | null>(null)
  const [loginPending, setLoginPending] = useState(false)
  const [signUpPending, setSignUpPending] = useState(false)
  const [resetState, setResetState] = useState<{
    error?: string
    success?: boolean
    message?: string
  } | null>(null)
  const [resetPending, setResetPending] = useState(false)

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loginPending) return
    setLoginPending(true)
    setLoginState(null)
    try {
      const formData = new FormData(event.currentTarget)
      const result = await signIn(null, formData)
      if (result?.error) {
        setLoginState(result)
      }
    } catch {
      setLoginState({ error: '로그인 처리 중 오류가 발생했습니다.' })
    } finally {
      setLoginPending(false)
    }
  }

  async function handleSignUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (signUpPending) return
    setSignUpPending(true)
    try {
      const formData = new FormData(event.currentTarget)
      formData.set('phone', signUpPhone)
      formData.set('parent_phone', signUpParentPhone)
      formData.set('member_type', signUpMemberType)
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      })

      let result: SignUpResult | null = null
      try {
        result = (await response.json()) as SignUpResult
      } catch {
        result = null
      }

      if (!response.ok || !result) {
        toast.error('회원가입 실패', {
          description:
            result?.error ?? '요청에 실패했습니다. 잠시 후 다시 시도해주세요.',
        })
        return
      }

      if (result.error) {
        toast.error('회원가입 실패', { description: result.error })
        return
      }

      if (result.success) {
        toast.success('가입 신청이 완료되었습니다.', {
          description: result.loginIdentifier
            ? `관리자 승인 후 로그인하세요. 로그인 ID: ${result.loginIdentifier}`
            : '관리자 승인 후 로그인할 수 있습니다.',
          duration: 10000,
        })
        setTab('login')
        setSignUpBirthDate('')
        setSignUpPhone('')
        setSignUpParentPhone('')
        setSignUpMemberType('student')
        event.currentTarget.reset()
      }
    } catch {
      toast.error('회원가입 실패', {
        description: '네트워크 오류가 발생했습니다. Wi-Fi 연결을 확인해주세요.',
      })
    } finally {
      setSignUpPending(false)
    }
  }

  async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (resetPending) return
    setResetPending(true)
    setResetState(null)
    try {
      const formData = new FormData(event.currentTarget)
      const result = await requestPasswordReset(null, formData)
      setResetState(result)
    } catch {
      setResetState({ error: '요청 처리 중 오류가 발생했습니다.' })
    } finally {
      setResetPending(false)
    }
  }

  useEffect(() => {
    if (loginState?.error) {
      toast.error('로그인 실패', { description: loginState.error })
    }
  }, [loginState])

  useEffect(() => {
    if (resetState?.error) {
      toast.error('비밀번호 찾기 실패', { description: resetState.error })
    }
    if (resetState?.success) {
      toast.success('재설정 메일 발송', {
        description: resetState.message,
        duration: 10000,
      })
      setShowForgotPassword(false)
    }
  }, [resetState])

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <ShareWebsiteButton />
        <InstallAppButton />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Dumbbell className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">OneStep Coach</CardTitle>
            <CardDescription className="text-muted-foreground">
              스포츠 트레이닝 센터 관리 시스템
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value)
              setShowForgotPassword(false)
              if (value !== 'signup') {
                setSignUpBirthDate('')
                setSignUpPhone('')
                setSignUpParentPhone('')
                setSignUpMemberType('student')
              }
            }}
            className="w-full"
          >
            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="login">로그인</TabsTrigger>
              <TabsTrigger value="signup">회원가입</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              {showForgotPassword ? (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    가입 시 등록한 이메일 또는 로그인 ID를 입력하면 비밀번호 재설정
                    링크를 보내드립니다.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">이메일 또는 로그인 ID</Label>
                    <Input
                      id="reset-email"
                      name="email"
                      type="text"
                      placeholder="example@email.com"
                      required
                      disabled={resetPending}
                      className="bg-input border-border"
                      autoComplete="username"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    variant="secondary"
                    disabled={resetPending}
                  >
                    {resetPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        발송 중...
                      </>
                    ) : (
                      '재설정 링크 보내기'
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    로그인으로 돌아가기
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">이메일 또는 로그인 ID</Label>
                    <Input
                      id="email"
                      name="email"
                      type="text"
                      placeholder="admin@example.com"
                      required
                      disabled={loginPending}
                      className="bg-input border-border"
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="password">비밀번호</Label>
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
                      >
                        비밀번호를 잊으셨나요?
                      </button>
                    </div>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      required
                      disabled={loginPending}
                      className="bg-input border-border"
                      autoComplete="current-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={loginPending}
                  >
                    {loginPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        로그인 중...
                      </>
                    ) : (
                      '로그인'
                    )}
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUpSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">이름</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    placeholder="홍길동"
                    required
                    minLength={2}
                    disabled={signUpPending}
                    className="bg-input border-border"
                  />
                </div>
                <BirthDateInput
                  id="signup-birth_date"
                  value={signUpBirthDate}
                  onChange={setSignUpBirthDate}
                />
                <input type="hidden" name="birth_date" value={signUpBirthDate} />
                <input type="hidden" name="member_type" value={signUpMemberType} />
                <div className="space-y-2">
                  <Label>회원 유형</Label>
                  <RadioGroup
                    value={signUpMemberType}
                    onValueChange={(value) =>
                      setSignUpMemberType(value as PublicSignUpMemberType)
                    }
                    className="grid grid-cols-2 gap-2"
                    disabled={signUpPending}
                  >
                    <label
                      htmlFor="signup-type-student"
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                    >
                      <RadioGroupItem value="student" id="signup-type-student" />
                      학생
                    </label>
                    <label
                      htmlFor="signup-type-adult"
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                    >
                      <RadioGroupItem value="adult" id="signup-type-adult" />
                      성인
                    </label>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-phone">
                    개인 연락처 <span className="text-destructive">*</span>
                  </Label>
                  <PhoneInput
                    id="signup-phone"
                    value={signUpPhone}
                    onChange={setSignUpPhone}
                    placeholder="010-1234-5678"
                    required
                    disabled={signUpPending}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-parent-phone">
                    보호자 연락처{' '}
                    {signUpMemberType === 'student' ? (
                      <span className="text-destructive">*</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">(선택)</span>
                    )}
                  </Label>
                  <PhoneInput
                    id="signup-parent-phone"
                    value={signUpParentPhone}
                    onChange={setSignUpParentPhone}
                    placeholder="010-9876-5432"
                    required={signUpMemberType === 'student'}
                    disabled={signUpPending}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">
                    이메일 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    placeholder="example@email.com"
                    required
                    disabled={signUpPending}
                    className="bg-input border-border"
                    autoComplete="email"
                  />
                </div>
                <input type="hidden" name="role" value="member" />
                <div className="space-y-2">
                  <Label htmlFor="signup-password">
                    비밀번호 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    placeholder="8자 이상"
                    required
                    minLength={8}
                    disabled={signUpPending}
                    className="bg-input border-border"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password_confirm">
                    비밀번호 확인 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="password_confirm"
                    name="password_confirm"
                    type="password"
                    placeholder="8자 이상"
                    required
                    minLength={8}
                    disabled={signUpPending}
                    className="bg-input border-border"
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  가입 후 관리자 승인이 있어야 로그인할 수 있습니다.
                </p>
                <Button
                  type="submit"
                  className="w-full"
                  variant="secondary"
                  disabled={signUpPending}
                >
                  {signUpPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      가입 신청 중...
                    </>
                  ) : (
                    '가입 신청'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
