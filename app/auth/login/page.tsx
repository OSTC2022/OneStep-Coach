'use client'

import { useActionState, useEffect, useState } from 'react'
import { signIn } from '@/lib/actions/auth'
import { signUpPublic } from '@/lib/actions/auth-registration'
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

export default function LoginPage() {
  const [tab, setTab] = useState('login')
  const [loginState, loginAction, loginPending] = useActionState(signIn, null)
  const [signUpState, signUpAction, signUpPending] = useActionState(signUpPublic, null)

  useEffect(() => {
    if (loginState?.error) {
      toast.error('로그인 실패', { description: loginState.error })
    }
  }, [loginState])

  useEffect(() => {
    if (signUpState?.error) {
      toast.error('회원가입 실패', { description: signUpState.error })
    }
    if (signUpState?.success) {
      const id = signUpState.loginIdentifier
      toast.success('가입 신청이 완료되었습니다.', {
        description: id
          ? `관리자 승인 후 로그인하세요. 로그인 ID: ${id}`
          : '관리자 승인 후 로그인할 수 있습니다.',
        duration: 10000,
      })
      setTab('login')
    }
  }, [signUpState])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
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
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">로그인</TabsTrigger>
              <TabsTrigger value="signup">회원가입</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form action={loginAction} className="space-y-4">
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
                  <Label htmlFor="password">비밀번호</Label>
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
            </TabsContent>

            <TabsContent value="signup">
              <form action={signUpAction} className="space-y-4">
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
                <div className="space-y-2">
                  <Label htmlFor="role">가입 유형</Label>
                  <select
                    id="role"
                    name="role"
                    defaultValue="member"
                    disabled={signUpPending}
                    className="flex h-9 w-full rounded-md border border-input bg-input px-3 py-1 text-sm shadow-xs"
                  >
                    <option value="member">회원</option>
                    <option value="guardian">학부모</option>
                  </select>
                </div>
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
