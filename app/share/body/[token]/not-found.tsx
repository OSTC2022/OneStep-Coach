import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function SharedBodyNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold">리포트를 찾을 수 없습니다</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        링크가 만료되었거나 잘못되었을 수 있습니다. 회원·코치에게 새 링크를 요청해주세요.
      </p>
      <Button asChild variant="outline">
        <Link href="/auth/login">로그인</Link>
      </Button>
    </div>
  )
}
