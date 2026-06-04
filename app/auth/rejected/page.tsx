import { Ban } from 'lucide-react'
import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function RejectedApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center">
            <Ban className="w-8 h-8 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">가입이 거절되었습니다</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              관리자에 의해 접속이 제한되었습니다. 문의가 필요하면 센터
              관리자에게 연락해주세요.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">
              로그아웃
            </Button>
          </form>
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="w-full">
              로그인 화면으로
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
