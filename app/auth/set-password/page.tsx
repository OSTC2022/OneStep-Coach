'use client'

import { useActionState, useEffect } from 'react'
import { setPasswordAfterInvite } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'

export default function SetPasswordPage() {
  const [state, formAction, isPending] = useActionState(setPasswordAfterInvite, null)

  useEffect(() => {
    if (state?.error) {
      toast.error('비밀번호 설정 실패', { description: state.error })
    }
  }, [state])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center">
          <BrandPulseAppIcon className="mx-auto h-20 w-20 translate-y-2" />
          <div>
            <CardTitle className="text-2xl font-bold">비밀번호 설정</CardTitle>
            <CardDescription className="text-muted-foreground">
              앱 로그인에 사용할 비밀번호를 입력해주세요.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">
                새 비밀번호 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="8자 이상"
                minLength={8}
                required
                disabled={isPending}
                className="bg-input border-border"
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
                minLength={8}
                required
                disabled={isPending}
                className="bg-input border-border"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                '비밀번호 설정하고 시작하기'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
