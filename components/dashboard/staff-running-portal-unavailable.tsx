import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function StaffRunningPortalUnavailable() {
  return (
    <div className="mx-auto w-full max-w-lg pt-8">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Trophy className="h-6 w-6" />
          </div>
          <CardTitle>내 러닝 포털</CardTitle>
          <CardDescription>
            러닝 포털을 사용하려면 회원 프로필이 계정에 연결되어 있어야 합니다.
            관리자에게 회원 연결을 요청해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/dashboard">대시보드로</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
