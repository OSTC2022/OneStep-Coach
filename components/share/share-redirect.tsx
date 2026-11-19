'use client'

import { useEffect } from 'react'

/** 크롤러는 JS를 실행하지 않아 OG HTML을 읽고, 실사용자는 목적지로 이동 */
export function ShareRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href)
  }, [href])

  return (
    <p className="relative mt-8 text-xs text-white/45">
      <a href={href} className="underline decoration-white/30 underline-offset-2">
        계속하기
      </a>
    </p>
  )
}
