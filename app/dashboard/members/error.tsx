'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function MembersError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Members page error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <h2 className="text-lg font-semibold">회원 관리 화면을 불러오지 못했습니다</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || '일시적인 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.'}
      </p>
      <Button type="button" onClick={() => reset()}>
        다시 시도
      </Button>
    </div>
  )
}
