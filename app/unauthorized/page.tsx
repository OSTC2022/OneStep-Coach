import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">접근 권한이 없습니다</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        이 페이지는 현재 계정 권한으로 이용할 수 없습니다. 관리자에게 권한을
        요청하거나 마이페이지로 이동해주세요.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard/my">마이페이지</Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard">대시보드</Link>
        </Button>
      </div>
    </div>
  )
}
