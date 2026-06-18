import { Clock } from 'lucide-react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <Card className="w-full max-w-md relative z-10 border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <BrandPulseAppIcon className="mx-auto h-16 w-16 translate-y-2" />
          <div>
            <CardTitle className="text-2xl font-bold">승인 대기 중</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              가입 신청이 접수되었습니다. 관리자가 승인하면 로그인하여 이용할 수
              있습니다.
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
