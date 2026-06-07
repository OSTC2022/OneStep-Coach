'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function LessonStatusError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Lesson status page error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <h2 className="text-lg font-semibold">수업현황을 불러오지 못했습니다</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message?.includes('fetch')
          ? '서버 연결이 끊겼거나 페이지가 갱신 중입니다. 잠시 후 다시 시도해주세요.'
          : error.message || '일시적인 오류가 발생했습니다.'}
      </p>
      <Button type="button" onClick={() => reset()}>
        다시 시도
      </Button>
    </div>
  )
}
